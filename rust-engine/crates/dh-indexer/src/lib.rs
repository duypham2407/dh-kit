//! Indexer crate for workspace scanning and incremental indexing orchestration.

pub mod dirty;
pub mod hasher;
pub mod parity;
pub mod scanner;

use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use dh_parser::{default_language_registry, extract_file_facts, pool::ParserPool, registry::LanguageRegistry, ExtractionContext};
use dh_storage::{
    CallEdgeRepository, ChunkRepository, Database, FileRepository, ImportRepository, IndexStateRepository,
    ReferenceRepository, SymbolRepository,
};
use dh_types::{File, FileCandidate, IndexRunStatus, IndexState, ParseStatus, WorkspaceId};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tracing::{info, warn};
use uuid::Uuid;

pub struct IndexWorkspaceRequest {
    pub roots: Vec<PathBuf>,
    pub force_full: bool,
    pub max_files: Option<usize>,
    pub include_embeddings: bool,
}

pub struct IndexPathsRequest {
    pub workspace_id: WorkspaceId,
    pub paths: Vec<PathBuf>,
    pub expand_dependents: bool,
}

pub struct IndexReport {
    pub workspace_id: WorkspaceId,
    pub run_id: String,
    pub scanned_files: u64,
    pub changed_files: u64,
    pub reindexed_files: u64,
    pub deleted_files: u64,
    pub queued_embeddings: u64,
    pub warnings: Vec<String>,
    pub duration_ms: u128,
}

pub trait IndexerApi {
    fn index_workspace(&self, req: IndexWorkspaceRequest) -> anyhow::Result<IndexReport>;
    fn index_paths(&self, req: IndexPathsRequest) -> anyhow::Result<IndexReport>;
    fn invalidate_paths(&self, workspace_id: WorkspaceId, paths: Vec<PathBuf>) -> anyhow::Result<()>;
    fn status(&self, workspace_id: WorkspaceId) -> anyhow::Result<IndexState>;
}

#[derive(Debug, Clone)]
pub struct Indexer {
    db_path: PathBuf,
}

impl Indexer {
    #[must_use]
    pub fn new(db_path: PathBuf) -> Self {
        Self { db_path }
    }

    fn open_db(&self) -> Result<Database> {
        let db = Database::new(&self.db_path)?;
        db.initialize()?;
        Ok(db)
    }

    fn process_and_write_file(
        &self,
        db: &Database,
        candidate: &FileCandidate,
        content_hash: &str,
        existing_file: Option<&File>,
        registry: &LanguageRegistry,
        parser_pool: &mut ParserPool,
    ) -> Result<Vec<String>> {
        let now = now_unix_ms();
        let file_id = existing_file
            .map(|file| file.id)
            .unwrap_or_else(|| stable_id_i64(&format!("file|{}|{}", candidate.workspace_id, candidate.rel_path)));

        let mut warnings = Vec::new();

        let source = match fs::read(&candidate.abs_path) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(err) => {
                let parse_error = format!(
                    "failed to read source file {}: {err}",
                    candidate.abs_path.display()
                );
                warn!("{parse_error}");
                warnings.push(parse_error.clone());

                let failed_file = File {
                    id: file_id,
                    workspace_id: candidate.workspace_id,
                    root_id: candidate.root_id,
                    package_id: candidate.package_id,
                    rel_path: candidate.rel_path.clone(),
                    language: candidate.language,
                    size_bytes: candidate.size_bytes,
                    mtime_unix_ms: candidate.mtime_unix_ms,
                    content_hash: content_hash.to_string(),
                    structure_hash: None,
                    public_api_hash: None,
                    parse_status: ParseStatus::Failed,
                    parse_error: Some(parse_error),
                    symbol_count: 0,
                    chunk_count: 0,
                    is_barrel: false,
                    last_indexed_at_unix_ms: Some(now),
                    deleted_at_unix_ms: None,
                };

                write_file_atomically(db, &failed_file, &[], &[], &[], &[], &[], existing_file.is_some())?;
                return Ok(warnings);
            }
        };

        let ctx = ExtractionContext {
            workspace_id: candidate.workspace_id,
            root_id: candidate.root_id,
            package_id: candidate.package_id,
            file_id,
            rel_path: &candidate.rel_path,
            source: &source,
        };

        let extracted = match extract_file_facts(registry, parser_pool, candidate.language, &ctx) {
            Ok(facts) => facts,
            Err(err) => {
                let parse_error = format!("parse failed for {}: {err}", candidate.rel_path);
                warn!("{parse_error}");
                warnings.push(parse_error.clone());

                let failed_file = File {
                    id: file_id,
                    workspace_id: candidate.workspace_id,
                    root_id: candidate.root_id,
                    package_id: candidate.package_id,
                    rel_path: candidate.rel_path.clone(),
                    language: candidate.language,
                    size_bytes: candidate.size_bytes,
                    mtime_unix_ms: candidate.mtime_unix_ms,
                    content_hash: content_hash.to_string(),
                    structure_hash: None,
                    public_api_hash: None,
                    parse_status: ParseStatus::Failed,
                    parse_error: Some(parse_error),
                    symbol_count: 0,
                    chunk_count: 0,
                    is_barrel: false,
                    last_indexed_at_unix_ms: Some(now),
                    deleted_at_unix_ms: None,
                };

                write_file_atomically(db, &failed_file, &[], &[], &[], &[], &[], existing_file.is_some())?;
                return Ok(warnings);
            }
        };

        let has_errors = extracted.has_errors;
        let parse_status = extracted.parse_status;
        let parse_error = extracted.parse_error;
        let structure_fingerprint = extracted.structure_fingerprint;
        let public_api_fingerprint = extracted.public_api_fingerprint;

        let mut symbols = extracted.symbols;
        let mut imports = extracted.imports;
        let mut call_edges = extracted.call_edges;
        let mut references = extracted.references;
        let mut chunks = extracted.chunks;

        // Keep IDs stable and ensure file_id fields are always the current row id.
        for symbol in &mut symbols {
            symbol.file_id = file_id;
        }
        for import in &mut imports {
            import.source_file_id = file_id;
        }
        for edge in &mut call_edges {
            edge.source_file_id = file_id;
        }
        for reference in &mut references {
            reference.source_file_id = file_id;
        }
        // SQLite enforces self-referential FKs immediately by default. `chunks.next_chunk_id`
        // may point to rows inserted later in the same batch, so we keep forward links null.
        // Back-links (`prev_chunk_id`) are still valid because insertion order is stable.
        for chunk in &mut chunks {
            chunk.file_id = file_id;
            chunk.next_chunk_id = None;
        }

        let file = File {
            id: file_id,
            workspace_id: candidate.workspace_id,
            root_id: candidate.root_id,
            package_id: candidate.package_id,
            rel_path: candidate.rel_path.clone(),
            language: candidate.language,
            size_bytes: candidate.size_bytes,
            mtime_unix_ms: candidate.mtime_unix_ms,
            content_hash: content_hash.to_string(),
            structure_hash: Some(structure_fingerprint),
            public_api_hash: Some(public_api_fingerprint),
            parse_status,
            parse_error,
            symbol_count: symbols.len() as u32,
            chunk_count: chunks.len() as u32,
            is_barrel: false,
            last_indexed_at_unix_ms: Some(now),
            deleted_at_unix_ms: None,
        };

        write_file_atomically(
            db,
            &file,
            &symbols,
            &imports,
            &call_edges,
            &references,
            &chunks,
            existing_file.is_some(),
        )?;

        if has_errors {
            warnings.push(format!(
                "parsed with recoverable errors: {}",
                candidate.rel_path
            ));
        }

        Ok(warnings)
    }
}

impl IndexerApi for Indexer {
    fn index_workspace(&self, req: IndexWorkspaceRequest) -> Result<IndexReport> {
        let start = Instant::now();
        let started_at_unix_ms = now_unix_ms();

        let workspace_root = req
            .roots
            .first()
            .cloned()
            .ok_or_else(|| anyhow!("index_workspace requires at least one root"))?;

        let workspace_root = workspace_root
            .canonicalize()
            .with_context(|| format!("canonicalize workspace root: {}", workspace_root.display()))?;

        let db = self.open_db()?;
        let workspace_id = 1_i64;
        let root_id = 1_i64;
        ensure_workspace_and_root(&db, workspace_id, root_id, &workspace_root)?;

        let run_id = Uuid::new_v4().to_string();
        db.upsert_run(
            &run_id,
            workspace_id,
            IndexRunStatus::Scanning,
            "scan",
            started_at_unix_ms,
            started_at_unix_ms,
            None,
            Some("scan started"),
        )?;

        let mut state = db
            .get_state(workspace_id)?
            .unwrap_or_else(|| default_state_for(workspace_id));
        state.status = IndexRunStatus::Scanning;
        state.active_run_id = Some(run_id.clone());
        state.last_scan_started_at_unix_ms = Some(started_at_unix_ms);
        state.last_error = None;
        db.update_state(&state)?;

        let index_result = (|| -> Result<IndexReport> {
            let scan_config = scanner::ScanConfig {
                workspace_id,
                root_id,
                package_id: None,
            };

            let mut candidates = scanner::scan_workspace(&workspace_root, &scan_config)?;
            if let Some(max_files) = req.max_files {
                candidates.truncate(max_files);
            }

            info!(
                workspace = %workspace_root.display(),
                scanned = candidates.len(),
                "scan completed"
            );

            db.upsert_run(
                &run_id,
                workspace_id,
                IndexRunStatus::Hashing,
                "hash",
                started_at_unix_ms,
                now_unix_ms(),
                None,
                Some("hashing candidates"),
            )?;

            state.status = IndexRunStatus::Hashing;
            state.total_files = candidates.len() as u64;
            db.update_state(&state)?;

            let hasher::HashCandidatesResult {
                hashes: content_hashes,
                hash_failures,
                mut warnings,
            } = hasher::hash_candidates(&candidates);
            let existing_files = db.list_files_by_workspace(workspace_id)?;

            let dirty_set = dirty::build_dirty_set(&candidates, &content_hashes, &existing_files, req.force_full);
            let hash_failed_candidates = candidates
                .iter()
                .filter(|candidate| hash_failures.contains_key(&candidate.rel_path))
                .collect::<Vec<_>>();

            db.upsert_run(
                &run_id,
                workspace_id,
                IndexRunStatus::Parsing,
                "parse",
                started_at_unix_ms,
                now_unix_ms(),
                None,
                Some("parsing dirty files"),
            )?;

            state.status = IndexRunStatus::Parsing;
            state.dirty_files = dirty_set.to_index.len() as u64;
            state.deleted_files = dirty_set.to_delete.len() as u64;
            db.update_state(&state)?;

            let registry = default_language_registry();
            let mut parser_pool = ParserPool::new();
            let existing_by_path = existing_files
                .iter()
                .map(|file| (file.rel_path.clone(), file))
                .collect::<HashMap<_, _>>();

            let mut reindexed_files = 0_u64;
            for candidate in &dirty_set.to_index {
                let Some(content_hash) = content_hashes.get(&candidate.rel_path) else {
                    continue;
                };

                let existing = existing_by_path.get(candidate.rel_path.as_str()).copied();
                let mut file_warnings = self.process_and_write_file(
                    &db,
                    candidate,
                    content_hash,
                    existing,
                    &registry,
                    &mut parser_pool,
                )?;
                warnings.append(&mut file_warnings);
                reindexed_files += 1;
            }

            for candidate in hash_failed_candidates {
                let Some(existing) = existing_by_path.get(candidate.rel_path.as_str()).copied() else {
                    continue;
                };

                let parse_error = hash_failures
                    .get(&candidate.rel_path)
                    .cloned()
                    .unwrap_or_else(|| {
                        format!("failed to read file for hashing: {}", candidate.abs_path.display())
                    });

                warnings.push(format!(
                    "marking file as failed after hash read error: {}",
                    candidate.rel_path
                ));

                let failed_file = File {
                    id: existing.id,
                    workspace_id: existing.workspace_id,
                    root_id: existing.root_id,
                    package_id: existing.package_id,
                    rel_path: existing.rel_path.clone(),
                    language: existing.language,
                    size_bytes: candidate.size_bytes,
                    mtime_unix_ms: candidate.mtime_unix_ms,
                    content_hash: existing.content_hash.clone(),
                    structure_hash: None,
                    public_api_hash: None,
                    parse_status: ParseStatus::Failed,
                    parse_error: Some(parse_error),
                    symbol_count: 0,
                    chunk_count: 0,
                    is_barrel: existing.is_barrel,
                    last_indexed_at_unix_ms: Some(now_unix_ms()),
                    deleted_at_unix_ms: None,
                };

                write_file_atomically(&db, &failed_file, &[], &[], &[], &[], &[], true)?;
                reindexed_files += 1;
            }

            db.upsert_run(
                &run_id,
                workspace_id,
                IndexRunStatus::Writing,
                "write",
                started_at_unix_ms,
                now_unix_ms(),
                None,
                Some("writing deletions"),
            )?;

            let existing_by_id = existing_files
                .iter()
                .map(|file| (file.id, file))
                .collect::<HashMap<_, _>>();
            let deleted_at = now_unix_ms();
            for file_id in &dirty_set.to_delete {
                if let Some(existing) = existing_by_id.get(file_id).copied() {
                    mark_deleted_file(&db, existing, deleted_at)?;
                }
            }

            let finished_at_unix_ms = now_unix_ms();
            state.status = IndexRunStatus::Completed;
            state.index_version = state.index_version.saturating_add(1);
            state.active_run_id = None;
            state.total_files = candidates.len() as u64;
            state.indexed_files = reindexed_files;
            state.dirty_files = dirty_set.to_index.len() as u64;
            state.deleted_files = dirty_set.to_delete.len() as u64;
            state.last_scan_finished_at_unix_ms = Some(finished_at_unix_ms);
            state.last_successful_index_at_unix_ms = Some(finished_at_unix_ms);
            state.last_error = None;
            db.update_state(&state)?;

            db.upsert_run(
                &run_id,
                workspace_id,
                IndexRunStatus::Completed,
                "complete",
                started_at_unix_ms,
                finished_at_unix_ms,
                Some(finished_at_unix_ms),
                Some("index complete"),
            )?;

            Ok(IndexReport {
                workspace_id,
                run_id: run_id.clone(),
                scanned_files: candidates.len() as u64,
                changed_files: dirty_set.to_index.len() as u64,
                reindexed_files,
                deleted_files: dirty_set.to_delete.len() as u64,
                queued_embeddings: if req.include_embeddings { 0 } else { 0 },
                warnings,
                duration_ms: start.elapsed().as_millis(),
            })
        })();

        if let Err(err) = &index_result {
            let failed_at = now_unix_ms();
            let message = err.to_string();

            let mut failed_state = db
                .get_state(workspace_id)?
                .unwrap_or_else(|| default_state_for(workspace_id));
            failed_state.status = IndexRunStatus::Failed;
            failed_state.active_run_id = None;
            failed_state.last_scan_finished_at_unix_ms = Some(failed_at);
            failed_state.last_error = Some(message.clone());
            db.update_state(&failed_state)?;

            db.upsert_run(
                &run_id,
                workspace_id,
                IndexRunStatus::Failed,
                "failed",
                started_at_unix_ms,
                failed_at,
                Some(failed_at),
                Some(&message),
            )?;
        }

        index_result
    }

    fn index_paths(&self, _req: IndexPathsRequest) -> Result<IndexReport> {
        bail!("index_paths is not yet implemented — use index_workspace instead")
    }

    fn invalidate_paths(&self, workspace_id: WorkspaceId, paths: Vec<PathBuf>) -> Result<()> {
        let db = self.open_db()?;
        let root = workspace_root_for(&db, workspace_id)?;

        for path in paths {
            let rel_path = if path.is_absolute() {
                match path.strip_prefix(&root) {
                    Ok(rel) => normalize_path(rel),
                    Err(_) => normalize_path(&path),
                }
            } else {
                normalize_path(&path)
            };

            let Some(mut file) = db.get_file_by_path(workspace_id, &rel_path)? else {
                continue;
            };

            file.content_hash = String::new();
            file.mtime_unix_ms = 0;
            file.parse_status = ParseStatus::Pending;
            file.parse_error = None;
            file.last_indexed_at_unix_ms = Some(now_unix_ms());
            db.upsert_file(&file)?;
        }

        Ok(())
    }

    fn status(&self, workspace_id: WorkspaceId) -> Result<IndexState> {
        let db = self.open_db()?;
        Ok(db
            .get_state(workspace_id)?
            .unwrap_or_else(|| default_state_for(workspace_id)))
    }
}

fn default_state_for(workspace_id: WorkspaceId) -> IndexState {
    IndexState {
        workspace_id,
        schema_version: 1,
        index_version: 0,
        status: IndexRunStatus::Idle,
        active_run_id: None,
        total_files: 0,
        indexed_files: 0,
        dirty_files: 0,
        deleted_files: 0,
        last_scan_started_at_unix_ms: None,
        last_scan_finished_at_unix_ms: None,
        last_successful_index_at_unix_ms: None,
        queued_embeddings: 0,
        last_error: None,
    }
}

fn ensure_workspace_and_root(db: &Database, workspace_id: WorkspaceId, root_id: i64, root: &Path) -> Result<()> {
    let root_path = root.to_string_lossy().to_string();
    let now = now_unix_ms();

    db.connection().execute(
        "INSERT OR IGNORE INTO workspaces(id, root_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![workspace_id, root_path, now, now],
    )?;

    db.connection().execute(
        "INSERT OR IGNORE INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES (?1, ?2, ?3, 'workspace_root', NULL)",
        rusqlite::params![root_id, workspace_id, root.to_string_lossy().to_string()],
    )?;

    Ok(())
}

fn workspace_root_for(db: &Database, workspace_id: WorkspaceId) -> Result<PathBuf> {
    let root_path: String = db.connection().query_row(
        "SELECT root_path FROM workspaces WHERE id = ?1",
        rusqlite::params![workspace_id],
        |row| row.get(0),
    )?;
    Ok(PathBuf::from(root_path))
}

fn write_file_atomically(
    db: &Database,
    file: &File,
    symbols: &[dh_types::Symbol],
    imports: &[dh_types::Import],
    call_edges: &[dh_types::CallEdge],
    references: &[dh_types::Reference],
    chunks: &[dh_types::Chunk],
    has_existing: bool,
) -> Result<()> {
    db.connection().execute_batch("BEGIN IMMEDIATE TRANSACTION")?;

    let write_result = (|| -> Result<()> {
        if has_existing {
            db.delete_file_facts(file.id)?;
        }

        db.upsert_file(file)
            .with_context(|| format!("upsert file {}", file.rel_path))?;

        if !symbols.is_empty() {
            db.insert_symbols(symbols)
                .with_context(|| format!("insert symbols for {}", file.rel_path))?;
        }
        if !imports.is_empty() {
            db.insert_imports(imports)
                .with_context(|| format!("insert imports for {}", file.rel_path))?;
        }
        if !call_edges.is_empty() {
            db.insert_call_edges(call_edges)
                .with_context(|| format!("insert call edges for {}", file.rel_path))?;
        }
        if !references.is_empty() {
            db.insert_references(references)
                .with_context(|| format!("insert references for {}", file.rel_path))?;
        }
        if !chunks.is_empty() {
            db.insert_chunks(chunks)
                .with_context(|| format!("insert chunks for {}", file.rel_path))?;
        }

        Ok(())
    })();

    match write_result {
        Ok(()) => {
            db.connection().execute_batch("COMMIT")?;
            Ok(())
        }
        Err(err) => {
            let _ = db.connection().execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

fn mark_deleted_file(db: &Database, file: &File, deleted_at_unix_ms: i64) -> Result<()> {
    db.connection().execute_batch("BEGIN IMMEDIATE TRANSACTION")?;

    let delete_result = (|| -> Result<()> {
        db.delete_file_facts(file.id)?;

        let mut deleted = file.clone();
        deleted.deleted_at_unix_ms = Some(deleted_at_unix_ms);
        deleted.last_indexed_at_unix_ms = Some(deleted_at_unix_ms);
        deleted.symbol_count = 0;
        deleted.chunk_count = 0;
        deleted.parse_status = ParseStatus::Skipped;
        deleted.parse_error = None;
        db.upsert_file(&deleted)?;

        Ok(())
    })();

    match delete_result {
        Ok(()) => {
            db.connection().execute_batch("COMMIT")?;
            Ok(())
        }
        Err(err) => {
            let _ = db.connection().execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn stable_id_i64(material: &str) -> i64 {
    let hash = blake3::hash(material.as_bytes());
    let mut bytes = [0_u8; 8];
    bytes.copy_from_slice(&hash.as_bytes()[..8]);
    let id = (u64::from_le_bytes(bytes) & 0x7FFF_FFFF_FFFF_FFFF) as i64;
    if id == 0 { 1 } else { id }
}

fn now_unix_ms() -> i64 {
    Utc::now().timestamp_millis()
}
