//! Indexer crate for workspace scanning and incremental indexing orchestration.

pub mod dirty;
pub mod embedding;
pub mod hasher;
pub mod linker;
pub mod parity;
pub mod scanner;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use dh_graph::HydratedGraphProjection;
use dh_parser::{
    default_language_registry, extract_file_facts, pool::ParserPool, registry::LanguageRegistry,
    ExtractionContext,
};
use dh_storage::{
    ChunkRepository, Database, FileRepository, GraphEdgeRepository, IndexStateRepository,
    SymbolRepository, VectorIndexRepository,
};
use dh_types::{
    EdgeKind, EdgeResolution, File, FileCandidate, FileId, FreshnessReason, FreshnessState,
    IndexRunStatus, IndexState, NodeId, ParseStatus, WorkspaceId,
};
use indicatif::{ProgressBar, ProgressStyle};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tracing::{info, warn};
use uuid::Uuid;

use crate::linker::{LinkFileInput, LinkFileOutput, LinkReport, LinkWorkspaceSnapshot};

use crate::dirty::{
    confirmed_delta, is_resolution_scope_path, ConfirmedDelta, DirtyPlannerInput,
    InvalidationLevel, PlannedFile,
};
use crate::hasher::FileKey;

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
    pub refreshed_current_files: u64,
    pub retained_current_files: u64,
    pub degraded_partial_files: u64,
    pub not_current_files: u64,
    pub deleted_paths: u64,
    pub workspace_root_count: u64,
    pub package_root_count: u64,
    pub symbols_extracted: u64,
    pub imports_extracted: u64,
    pub call_sites_extracted: u64,
    pub references_extracted: u64,
    pub linked_imports: u64,
    pub linked_cross_root_imports: u64,
    pub linked_calls: u64,
    pub linked_cross_root_calls: u64,
    pub linked_references: u64,
    pub unresolved_imports: u64,
    pub unresolved_cross_root_imports: u64,
    pub unresolved_calls: u64,
    pub unresolved_references: u64,
    pub graph_hydration_ms: u128,
    pub link_ms: u128,
}

pub trait IndexerApi {
    fn index_workspace(&self, req: IndexWorkspaceRequest) -> anyhow::Result<IndexReport>;
    fn index_paths(&self, req: IndexPathsRequest) -> anyhow::Result<IndexReport>;
    fn invalidate_paths(
        &self,
        workspace_id: WorkspaceId,
        paths: Vec<PathBuf>,
    ) -> anyhow::Result<()>;
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
        planned: &PlannedFile,
        content_hash: &str,
        existing_file: Option<&File>,
        run_id: &str,
        registry: &LanguageRegistry,
        parser_pool: &mut ParserPool,
        link_snapshot: Option<&LinkWorkspaceSnapshot>,
        workspace_root: &Path,
        root_paths: &HashMap<i64, PathBuf>,
        workspace_roots: &[PathBuf],
        package_roots: &[PathBuf],
    ) -> Result<ProcessOutcome> {
        let candidate = &planned.candidate;
        let now = now_unix_ms();
        let run_id_marker = run_id_to_i64(run_id);
        let file_id = existing_file.map(|file| file.id).unwrap_or_else(|| {
            stable_id_i64(&format!(
                "file|{}|{}|{}",
                candidate.workspace_id, candidate.root_id, candidate.rel_path
            ))
        });

        let mut warnings = Vec::new();
        let mut stats = ExtractedFileStats::default();

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
                    freshness_state: FreshnessState::NotCurrent,
                    freshness_reason: Some(FreshnessReason::FatalReadFailure),
                    last_freshness_run_id: Some(run_id_marker.to_string()),
                };

                write_file_atomically(
                    db,
                    &failed_file,
                    &[],
                    &[],
                    &[],
                    &[],
                    &[],
                    &[],
                    LinkReport::default(),
                    existing_file.is_some(),
                    false,
                )?;
                return Ok(ProcessOutcome {
                    warnings,
                    persisted_file: failed_file,
                    delta: ConfirmedDelta::default(),
                    stats,
                    link_report: LinkReport::default(),
                });
            }
        };

        let ctx = ExtractionContext {
            workspace_id: candidate.workspace_id,
            root_id: candidate.root_id,
            package_id: candidate.package_id,
            file_id,
            rel_path: &candidate.rel_path,
            source: &source,
            abs_path: Some(candidate.abs_path.clone()),
            workspace_root: Some(workspace_root.to_path_buf()),
            workspace_roots: workspace_roots.to_vec(),
            package_roots: package_roots.to_vec(),
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
                    freshness_state: FreshnessState::NotCurrent,
                    freshness_reason: Some(FreshnessReason::FatalParseFailure),
                    last_freshness_run_id: Some(run_id_marker.to_string()),
                };

                write_file_atomically(
                    db,
                    &failed_file,
                    &[],
                    &[],
                    &[],
                    &[],
                    &[],
                    &[],
                    LinkReport::default(),
                    existing_file.is_some(),
                    false,
                )?;
                return Ok(ProcessOutcome {
                    warnings,
                    persisted_file: failed_file,
                    delta: ConfirmedDelta::default(),
                    stats,
                    link_report: LinkReport::default(),
                });
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

        stats.symbols_extracted = symbols.len() as u64;
        stats.imports_extracted = imports.len() as u64;
        stats.call_sites_extracted = call_edges.len() as u64;
        stats.references_extracted = references.len() as u64;

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
            freshness_state: if has_errors {
                FreshnessState::DegradedPartial
            } else {
                FreshnessState::RefreshedCurrent
            },
            freshness_reason: None,
            last_freshness_run_id: Some(run_id_marker.to_string()),
        };

        let delta = confirmed_delta(existing_file, &file);
        let mut file = file;
        file.freshness_reason = Some(if has_errors {
            FreshnessReason::RecoverableParseIssues
        } else if is_resolution_scope_path(&candidate.rel_path) {
            FreshnessReason::ResolutionScopeChanged
        } else if delta.public_api_changed {
            FreshnessReason::PublicApiChanged
        } else if delta.structure_changed {
            FreshnessReason::StructureChanged
        } else {
            match planned.level {
                InvalidationLevel::Dependent => FreshnessReason::DependentInvalidated,
                _ => FreshnessReason::ContentChanged,
            }
        });

        let can_reuse_existing_edges = should_reuse_existing_edges(existing_file, &file, delta);
        let link_output = if can_reuse_existing_edges {
            LinkFileOutput {
                edges: db.find_edges_by_file(file_id)?,
                report: LinkReport::default(),
            }
        } else if let Some(link_snapshot) = link_snapshot {
            link_snapshot.link_file(LinkFileInput {
                file: &file,
                imports: &imports,
                call_edges: &call_edges,
                references: &references,
            })
        } else {
            let workspace_files = db.list_files_by_workspace(candidate.workspace_id)?;
            let workspace_symbols = db.find_symbols_by_workspace(candidate.workspace_id)?;
            linker::link_file_facts(
                &ctx.workspace_root
                    .clone()
                    .unwrap_or_else(|| PathBuf::from(".")),
                root_paths,
                &workspace_files,
                &workspace_symbols,
                LinkFileInput {
                    file: &file,
                    imports: &imports,
                    call_edges: &call_edges,
                    references: &references,
                },
            )
        };
        let mut graph_edges = link_output.edges;
        let preserve_existing_edges = false;
        if preserve_existing_edges {
            preserve_existing_file_edges(&db, file.id, &mut graph_edges)?;
        }

        write_file_atomically(
            db,
            &file,
            &symbols,
            &imports,
            &call_edges,
            &references,
            &chunks,
            &graph_edges,
            link_output.report,
            existing_file.is_some(),
            false,
        )?;

        if has_errors {
            warnings.push(format!(
                "parsed with recoverable errors: {}",
                candidate.rel_path
            ));
        }

        Ok(ProcessOutcome {
            warnings,
            persisted_file: file,
            delta,
            stats,
            link_report: link_output.report,
        })
    }

    fn apply_confirmed_invalidation_expansion(
        &self,
        db: &Database,
        workspace_id: WorkspaceId,
        run_id: &str,
        scanned_candidates: &[FileCandidate],
        existing_files: &[File],
        changed_files_by_path: &HashMap<FileKey, File>,
        delta_by_path: &HashMap<FileKey, ConfirmedDelta>,
        deleted_rel_paths: &HashSet<FileKey>,
        forced_dependent_roots: &HashSet<FileKey>,
        initial_indexed_rel_paths: &HashSet<FileKey>,
        refresh_queue: &mut VecDeque<PlannedFile>,
        queued_rel_paths: &mut HashSet<FileKey>,
        counters: &mut FreshnessCounters,
        warnings: &mut Vec<String>,
    ) -> Result<()> {
        if changed_files_by_path.is_empty()
            && deleted_rel_paths.is_empty()
            && forced_dependent_roots.is_empty()
        {
            return Ok(());
        }

        let scanned_by_path = scanned_candidates
            .iter()
            .map(|candidate| (file_key_for_candidate(candidate), candidate))
            .collect::<HashMap<_, _>>();

        let existing_by_path = existing_files
            .iter()
            .map(|file| (file_key_for_file(file), file))
            .collect::<HashMap<_, _>>();

        let mut public_api_roots = HashSet::new();
        let mut structural_roots = HashSet::new();
        let mut resolution_scope_roots = HashSet::new();

        for (file_key, delta) in delta_by_path {
            if delta.public_api_changed {
                public_api_roots.insert(file_key.clone());
            }
            if delta.structure_changed {
                structural_roots.insert(file_key.clone());
            }
            if is_resolution_scope_path(&file_key.rel_path) {
                resolution_scope_roots.insert(file_key.clone());
            }
        }

        for file_key in changed_files_by_path.keys() {
            if is_resolution_scope_path(&file_key.rel_path) {
                resolution_scope_roots.insert(file_key.clone());
            }
        }

        if !resolution_scope_roots.is_empty() {
            apply_resolution_scope_invalidation(
                db,
                workspace_id,
                run_id,
                &scanned_by_path,
                &existing_by_path,
                &resolution_scope_roots,
                initial_indexed_rel_paths,
                refresh_queue,
                queued_rel_paths,
                counters,
                warnings,
            )?;
        }

        if !public_api_roots.is_empty()
            || !deleted_rel_paths.is_empty()
            || !forced_dependent_roots.is_empty()
        {
            apply_dependent_invalidation(
                db,
                workspace_id,
                run_id,
                &scanned_by_path,
                &existing_by_path,
                &public_api_roots,
                deleted_rel_paths,
                forced_dependent_roots,
                initial_indexed_rel_paths,
                refresh_queue,
                queued_rel_paths,
                counters,
                warnings,
            )?;
        }

        if !structural_roots.is_empty() {
            apply_structural_invalidation(
                db,
                workspace_id,
                run_id,
                &scanned_by_path,
                &existing_by_path,
                &structural_roots,
                initial_indexed_rel_paths,
                refresh_queue,
                queued_rel_paths,
                counters,
                warnings,
            )?;
        }

        Ok(())
    }

    /// Embed all chunks that have not yet been embedded for the given workspace.
    ///
    /// Loads chunks from the DB, calls the embedding client in batches, and upserts vectors.
    /// Returns the number of chunks successfully embedded.
    pub fn embed_chunks_batch(
        &self,
        workspace_id: WorkspaceId,
        client: &dyn crate::embedding::EmbeddingClient,
    ) -> Result<u64> {
        use dh_storage::{ChunkRepository, EmbeddingRepository};

        if !client.is_real() {
            tracing::debug!("Skipping embed_chunks_batch — stub client active");
            return Ok(0);
        }

        let db = self.open_db()?;
        let chunks = db.find_chunks_by_workspace(workspace_id)?;
        if chunks.is_empty() {
            return Ok(0);
        }

        let model = client.config().model.clone();
        let dim = client.config().dimensions;

        // Only embed chunks without a current stored vector for this model.
        let existing_vectors: std::collections::HashSet<_> = db
            .load_embeddings_for_model(&model)?
            .into_iter()
            .filter(|record| record.dimensions == dim)
            .map(|record| (record.chunk_id, record.content_hash))
            .collect();

        let pending: Vec<_> = chunks
            .iter()
            .filter(|chunk| !existing_vectors.contains(&(chunk.id, chunk.content_hash.clone())))
            .collect();

        if pending.is_empty() {
            tracing::info!(
                workspace_id,
                model = %model,
                "All chunks already embedded — nothing to do"
            );
            return Ok(0);
        }

        tracing::info!(
            workspace_id,
            model = %model,
            pending = pending.len(),
            "Embedding pending chunks"
        );

        let texts: Vec<String> = pending.iter().map(|c| c.content.clone()).collect();
        let vectors = client.embed_batch(&texts)?;

        let mut embedded = 0_u64;
        for (chunk, vector) in pending.into_iter().zip(vectors) {
            db.upsert_embedding(chunk.id, &model, dim, &chunk.content_hash, &vector)?;
            embedded += 1;
        }

        tracing::info!(
            workspace_id,
            embedded,
            model = %model,
            "Embedding batch complete"
        );
        Ok(embedded)
    }
}

#[derive(Debug, Clone)]
struct ProcessOutcome {
    warnings: Vec<String>,
    persisted_file: File,
    delta: ConfirmedDelta,
    stats: ExtractedFileStats,
    link_report: LinkReport,
}

#[derive(Debug, Default, Clone, Copy)]
struct ExtractedFileStats {
    symbols_extracted: u64,
    imports_extracted: u64,
    call_sites_extracted: u64,
    references_extracted: u64,
}

impl ExtractedFileStats {
    fn accumulate(&mut self, other: Self) {
        self.symbols_extracted = self
            .symbols_extracted
            .saturating_add(other.symbols_extracted);
        self.imports_extracted = self
            .imports_extracted
            .saturating_add(other.imports_extracted);
        self.call_sites_extracted = self
            .call_sites_extracted
            .saturating_add(other.call_sites_extracted);
        self.references_extracted = self
            .references_extracted
            .saturating_add(other.references_extracted);
    }
}

impl IndexerApi for Indexer {
    fn index_workspace(&self, req: IndexWorkspaceRequest) -> Result<IndexReport> {
        let start = Instant::now();
        let started_at_unix_ms = now_unix_ms();

        if req.roots.is_empty() {
            return Err(anyhow!("index_workspace requires at least one root"));
        }

        let workspace_roots = req
            .roots
            .iter()
            .map(|root| {
                root.canonicalize()
                    .with_context(|| format!("canonicalize workspace root: {}", root.display()))
            })
            .collect::<Result<Vec<_>>>()?;
        let workspace_root = workspace_roots
            .first()
            .cloned()
            .expect("non-empty roots checked before canonicalization");
        let package_roots = workspace_roots.clone();
        let extraction_package_roots = if workspace_roots.len() == 1 {
            Vec::new()
        } else {
            package_roots.clone()
        };

        let db = self.open_db()?;
        let workspace_id = 1_i64;
        let root_assignments = assign_workspace_root_ids(&db, workspace_id, &workspace_roots)?;
        let root_paths = root_assignments
            .iter()
            .map(|(root_id, root)| (*root_id, root.clone()))
            .collect::<HashMap<_, _>>();
        for (root_id, root) in &root_assignments {
            ensure_workspace_and_root(&db, workspace_id, *root_id, root)?;
        }

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
            let mut candidates = Vec::new();
            for (root_id, root) in &root_assignments {
                let scan_config = scanner::ScanConfig {
                    workspace_id,
                    root_id: *root_id,
                    package_id: None,
                };
                candidates.append(&mut scanner::scan_workspace(root, &scan_config)?);
            }
            if let Some(max_files) = req.max_files {
                candidates.truncate(max_files);
            }
            let existing_files = db.list_files_by_workspace(workspace_id)?;

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
                hashes_by_file_key: content_hashes_by_file_key,
                hash_failures,
                hash_failures_by_file_key,
                mut warnings,
            } = hasher::hash_incremental_candidates(
                &candidates,
                &existing_files,
                req.force_full,
                None,
                None,
            );

            let dirty_set = if content_hashes.is_empty() && !req.force_full {
                build_metadata_only_dirty_set(&candidates, &existing_files)
            } else {
                dirty::build_dirty_set(DirtyPlannerInput {
                    scanned: &candidates,
                    content_hashes: &content_hashes,
                    content_hashes_by_file_key: &content_hashes_by_file_key,
                    existing_files: &existing_files,
                    force_full: req.force_full,
                    expand_dependents: false,
                    touched_paths: None,
                    touched_file_keys: None,
                })
            };
            let hash_failed_candidates = candidates
                .iter()
                .filter(|candidate| {
                    hash_failure_message(
                        &file_key_for_candidate(candidate),
                        &candidate.rel_path,
                        &hash_failures_by_file_key,
                        &hash_failures,
                    )
                    .is_some()
                })
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
            let existing_by_key = existing_files
                .iter()
                .map(|file| (file_key_for_file(file), file))
                .collect::<HashMap<_, _>>();
            let link_snapshot = if dirty_set.to_index.len() > 1 || req.force_full {
                Some(LinkWorkspaceSnapshot::new(
                    &workspace_root,
                    &root_paths,
                    existing_files.clone(),
                    db.find_symbols_by_workspace(workspace_id)?,
                ))
            } else {
                None
            };

            let mut counters = FreshnessCounters::default();
            let mut fact_stats = ExtractedFileStats::default();
            let mut link_report = LinkReport::default();
            let mut reindexed_files = 0_u64;
            let mut indexed_rel_paths = HashSet::new();
            let mut changed_files_by_path = HashMap::new();
            let mut confirmed_delta_by_path = HashMap::new();
            let mut contract_changed_files_by_path = HashMap::new();
            let mut fatal_invalidation_roots = HashSet::new();
            let mut invalidation_refresh_queue = VecDeque::new();
            let mut queued_rel_paths = HashSet::new();

            let pb = ProgressBar::new(dirty_set.to_index.len() as u64);
            pb.set_style(
                ProgressStyle::default_bar()
                    .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) Parsing")
                    .unwrap()
                    .progress_chars("#>-"),
            );

            for planned in &dirty_set.to_index {
                let content_hash = content_hash_for_planned_file(
                    &planned.candidate,
                    &content_hashes,
                    &content_hashes_by_file_key,
                    &existing_by_key,
                );

                let existing = existing_by_key
                    .get(&file_key_for_candidate(&planned.candidate))
                    .copied();
                let mut outcome = self.process_and_write_file(
                    &db,
                    planned,
                    content_hash,
                    existing,
                    &run_id,
                    &registry,
                    &mut parser_pool,
                    link_snapshot.as_ref(),
                    &workspace_root,
                    &root_paths,
                    &workspace_roots,
                    &extraction_package_roots,
                )?;
                warnings.append(&mut outcome.warnings);
                fact_stats.accumulate(outcome.stats);
                link_report.accumulate(outcome.link_report);
                counters.register(outcome.persisted_file.freshness_state);
                if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                    fatal_invalidation_roots.insert(file_key_for_candidate(&planned.candidate));
                }
                if outcome.delta.public_api_changed || outcome.delta.structure_changed {
                    contract_changed_files_by_path.insert(
                        file_key_for_candidate(&planned.candidate),
                        outcome.persisted_file.clone(),
                    );
                }
                changed_files_by_path.insert(
                    file_key_for_candidate(&planned.candidate),
                    outcome.persisted_file,
                );
                confirmed_delta_by_path
                    .insert(file_key_for_candidate(&planned.candidate), outcome.delta);
                indexed_rel_paths.insert(file_key_for_candidate(&planned.candidate));
                reindexed_files += 1;
                pb.inc(1);
            }
            pb.finish_and_clear();

            let initial_indexed_rel_paths = indexed_rel_paths.clone();

            for candidate in hash_failed_candidates {
                let candidate_key = file_key_for_candidate(candidate);
                if indexed_rel_paths.contains(&candidate_key) {
                    continue;
                }
                let Some(existing) = existing_by_key.get(&candidate_key).copied() else {
                    continue;
                };

                let parse_error = hash_failure_message(
                    &candidate_key,
                    &candidate.rel_path,
                    &hash_failures_by_file_key,
                    &hash_failures,
                )
                .cloned()
                .unwrap_or_else(|| {
                    format!(
                        "failed to read file for hashing: {}",
                        candidate.abs_path.display()
                    )
                });

                warnings.push(format!(
                    "marking file as failed after hash read error: {}",
                    candidate.rel_path
                ));

                mark_hash_read_failure(&db, existing, candidate, parse_error, &run_id)?;
                counters.register(FreshnessState::NotCurrent);
                fatal_invalidation_roots.insert(candidate_key.clone());
                indexed_rel_paths.insert(candidate_key);
                reindexed_files += 1;
            }

            let deleted_rel_paths = dirty_set
                .to_delete
                .iter()
                .filter_map(|file_id| {
                    existing_files
                        .iter()
                        .find(|file| file.id == *file_id)
                        .map(file_key_for_file)
                })
                .collect::<HashSet<_>>();

            self.apply_confirmed_invalidation_expansion(
                &db,
                workspace_id,
                &run_id,
                &candidates,
                &existing_files,
                &changed_files_by_path,
                &confirmed_delta_by_path,
                &deleted_rel_paths,
                &fatal_invalidation_roots,
                &initial_indexed_rel_paths,
                &mut invalidation_refresh_queue,
                &mut queued_rel_paths,
                &mut counters,
                &mut warnings,
            )?;

            while let Some(planned) = invalidation_refresh_queue.pop_front() {
                let planned_key = file_key_for_candidate(&planned.candidate);
                if indexed_rel_paths.contains(&planned_key) {
                    continue;
                }

                let content_hash = if let Some(content_hash) = content_hash_message(
                    &planned_key,
                    &planned.candidate.rel_path,
                    &content_hashes_by_file_key,
                    &content_hashes,
                ) {
                    content_hash.as_str()
                } else if hash_failure_message(
                    &planned_key,
                    &planned.candidate.rel_path,
                    &hash_failures_by_file_key,
                    &hash_failures,
                )
                .is_some()
                {
                    if let Some(existing) = existing_by_key.get(&planned_key).copied() {
                        let parse_error = hash_failure_message(
                            &planned_key,
                            &planned.candidate.rel_path,
                            &hash_failures_by_file_key,
                            &hash_failures,
                        )
                        .cloned()
                        .unwrap_or_else(|| {
                            format!(
                                "failed to read file for hashing: {}",
                                planned.candidate.abs_path.display()
                            )
                        });
                        warnings.push(format!(
                            "marking file as failed after hash read error during invalidation: {}",
                            planned.candidate.rel_path
                        ));
                        mark_hash_read_failure(
                            &db,
                            existing,
                            &planned.candidate,
                            parse_error,
                            &run_id,
                        )?;
                        counters.register(FreshnessState::NotCurrent);
                        fatal_invalidation_roots.insert(planned_key.clone());
                        indexed_rel_paths.insert(planned_key);
                        reindexed_files += 1;
                    }
                    continue;
                } else {
                    content_hash_for_planned_file(
                        &planned.candidate,
                        &content_hashes,
                        &content_hashes_by_file_key,
                        &existing_by_key,
                    )
                };

                let existing = existing_by_key.get(&planned_key).copied();
                let mut outcome = self.process_and_write_file(
                    &db,
                    &planned,
                    content_hash,
                    existing,
                    &run_id,
                    &registry,
                    &mut parser_pool,
                    link_snapshot.as_ref(),
                    &workspace_root,
                    &root_paths,
                    &workspace_roots,
                    &extraction_package_roots,
                )?;
                warnings.append(&mut outcome.warnings);
                fact_stats.accumulate(outcome.stats);
                link_report.accumulate(outcome.link_report);
                counters.register(outcome.persisted_file.freshness_state);
                if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                    fatal_invalidation_roots.insert(planned_key.clone());
                }
                if outcome.delta.public_api_changed || outcome.delta.structure_changed {
                    contract_changed_files_by_path
                        .insert(planned_key.clone(), outcome.persisted_file.clone());
                }
                changed_files_by_path.insert(planned_key.clone(), outcome.persisted_file);
                confirmed_delta_by_path.insert(planned_key.clone(), outcome.delta);
                indexed_rel_paths.insert(planned_key);
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
                    mark_deleted_file(&db, existing, deleted_at, &run_id)?;
                    counters.register(FreshnessState::Deleted);
                }
            }

            refresh_unchanged_files(
                &db,
                workspace_id,
                &indexed_rel_paths,
                &run_id,
                &mut counters,
            )?;

            let content_only_incremental = !req.force_full
                && dirty_set.to_delete.is_empty()
                && changed_files_by_path.len() == indexed_rel_paths.len()
                && changed_files_by_path
                    .keys()
                    .all(|file_key| existing_by_key.contains_key(file_key))
                && confirmed_delta_by_path
                    .values()
                    .all(|delta| !delta.public_api_changed && !delta.structure_changed)
                && fatal_invalidation_roots.is_empty();
            link_report = if indexed_rel_paths.is_empty() && dirty_set.to_delete.is_empty() {
                LinkReport::default()
            } else if content_only_incremental {
                link_report
            } else if dirty_set.to_delete.is_empty() && !contract_changed_files_by_path.is_empty() {
                relink_contract_changed_files(
                    &db,
                    workspace_id,
                    &workspace_root,
                    &root_paths,
                    &changed_files_by_path,
                    &contract_changed_files_by_path,
                )?
            } else {
                linker::link_workspace(&db, workspace_id, &workspace_root, &root_paths)?
            };
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

            let graph_hydration_ms = if indexed_rel_paths.is_empty()
                || (content_only_incremental && dirty_set.to_delete.is_empty())
            {
                0
            } else {
                hydrate_current_graph_projection(&db, workspace_id, &mut warnings)?
            };

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
                refreshed_current_files: counters.refreshed_current_files,
                retained_current_files: counters.retained_current_files,
                degraded_partial_files: counters.degraded_partial_files,
                not_current_files: counters.not_current_files,
                deleted_paths: counters.deleted_paths,
                workspace_root_count: workspace_roots.len() as u64,
                package_root_count: package_roots.len() as u64,
                symbols_extracted: fact_stats.symbols_extracted,
                imports_extracted: fact_stats.imports_extracted,
                call_sites_extracted: fact_stats.call_sites_extracted,
                references_extracted: fact_stats.references_extracted,
                linked_imports: link_report.linked_imports,
                linked_cross_root_imports: link_report.linked_cross_root_imports,
                linked_calls: link_report.linked_calls,
                linked_cross_root_calls: link_report.linked_cross_root_calls,
                linked_references: link_report.linked_references,
                unresolved_imports: link_report.unresolved_imports,
                unresolved_cross_root_imports: link_report.unresolved_cross_root_imports,
                unresolved_calls: link_report.unresolved_calls,
                unresolved_references: link_report.unresolved_references,
                graph_hydration_ms,
                link_ms: link_report.link_ms,
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

    fn index_paths(&self, req: IndexPathsRequest) -> Result<IndexReport> {
        let start = Instant::now();
        let started_at_unix_ms = now_unix_ms();
        let run_id = Uuid::new_v4().to_string();

        let db = self.open_db()?;
        let workspace_id = req.workspace_id;
        let workspace_root = workspace_root_for(&db, workspace_id)?;
        let root_paths = root_paths_by_id(&db, workspace_id)?;
        let workspace_roots = workspace_roots_from_root_paths(&root_paths, &workspace_root);
        let package_roots = if workspace_roots.len() == 1 {
            Vec::new()
        } else {
            workspace_roots.clone()
        };

        let mut candidates = Vec::new();
        for (root_id, root) in sorted_root_paths(&root_paths) {
            let scan_config = scanner::ScanConfig {
                workspace_id,
                root_id,
                package_id: None,
            };
            candidates.append(&mut scanner::scan_workspace(&root, &scan_config)?);
        }
        let existing_files = db.list_files_by_workspace(workspace_id)?;

        let touched_file_keys = resolve_touched_file_keys(&req.paths, &root_paths);
        let touched_paths = touched_file_keys
            .iter()
            .map(|file_key| file_key.rel_path.clone())
            .collect::<Vec<_>>();
        let touched_path_set = touched_file_keys.iter().cloned().collect::<HashSet<_>>();
        let hasher::HashCandidatesResult {
            hashes: content_hashes,
            hashes_by_file_key: content_hashes_by_file_key,
            hash_failures,
            hash_failures_by_file_key,
            mut warnings,
        } = hasher::hash_incremental_candidates(
            &candidates,
            &existing_files,
            false,
            Some(&touched_paths),
            Some(&touched_file_keys),
        );

        let dirty_set = dirty::build_dirty_set(DirtyPlannerInput {
            scanned: &candidates,
            content_hashes: &content_hashes,
            content_hashes_by_file_key: &content_hashes_by_file_key,
            existing_files: &existing_files,
            force_full: false,
            expand_dependents: req.expand_dependents,
            touched_paths: Some(&touched_paths),
            touched_file_keys: Some(&touched_file_keys),
        });

        let forced_dependent_roots = if req.expand_dependents {
            touched_path_set.clone()
        } else {
            HashSet::new()
        };

        db.upsert_run(
            &run_id,
            workspace_id,
            IndexRunStatus::Parsing,
            "parse",
            started_at_unix_ms,
            now_unix_ms(),
            None,
            Some("path-scoped parsing"),
        )?;

        let registry = default_language_registry();
        let mut parser_pool = ParserPool::new();
        let existing_by_key = existing_files
            .iter()
            .map(|file| (file_key_for_file(file), file))
            .collect::<HashMap<_, _>>();
        let link_snapshot = if dirty_set.to_index.len() > 1 {
            Some(LinkWorkspaceSnapshot::new(
                &workspace_root,
                &root_paths,
                existing_files.clone(),
                db.find_symbols_by_workspace(workspace_id)?,
            ))
        } else {
            None
        };
        let existing_by_id = existing_files
            .iter()
            .map(|file| (file.id, file))
            .collect::<HashMap<_, _>>();

        let mut counters = FreshnessCounters::default();
        let mut fact_stats = ExtractedFileStats::default();
        let mut link_report = LinkReport::default();
        let mut reindexed_files = 0_u64;
        let mut indexed_rel_paths = HashSet::new();
        let mut changed_files_by_path = HashMap::new();
        let mut confirmed_delta_by_path = HashMap::new();
        let mut contract_changed_files_by_path = HashMap::new();
        let mut fatal_invalidation_roots = HashSet::new();
        let mut invalidation_refresh_queue = VecDeque::new();
        let mut queued_rel_paths = HashSet::new();

        for touched_file_key in &touched_path_set {
            if hash_failure_message(
                touched_file_key,
                &touched_file_key.rel_path,
                &hash_failures_by_file_key,
                &hash_failures,
            )
            .is_none()
                || indexed_rel_paths.contains(touched_file_key)
            {
                continue;
            }

            let Some(existing) = existing_by_key.get(touched_file_key).copied() else {
                continue;
            };

            let parse_error = hash_failure_message(
                touched_file_key,
                &touched_file_key.rel_path,
                &hash_failures_by_file_key,
                &hash_failures,
            )
            .cloned()
            .unwrap_or_else(|| {
                format!(
                    "failed to read file for hashing: {}",
                    touched_file_key.rel_path
                )
            });

            if let Some(candidate) = candidates
                .iter()
                .find(|candidate| file_key_for_candidate(candidate) == *touched_file_key)
            {
                warnings.push(format!(
                    "marking file as failed after hash read error: {}",
                    touched_file_key.rel_path
                ));
                mark_hash_read_failure(&db, existing, candidate, parse_error, &run_id)?;
                counters.register(FreshnessState::NotCurrent);
                fatal_invalidation_roots.insert(touched_file_key.clone());
            } else {
                mark_not_current_without_refresh(
                    &db,
                    existing,
                    &run_id,
                    "path-scoped hash read failed and path is not currently scannable",
                    FreshnessReason::FatalReadFailure,
                    &mut counters,
                    &mut warnings,
                )?;
                fatal_invalidation_roots.insert(touched_file_key.clone());
            }

            indexed_rel_paths.insert(touched_file_key.clone());
            reindexed_files = reindexed_files.saturating_add(1);
        }

        for planned in &dirty_set.to_index {
            let planned_key = file_key_for_candidate(&planned.candidate);
            let content_hash = content_hash_for_planned_file(
                &planned.candidate,
                &content_hashes,
                &content_hashes_by_file_key,
                &existing_by_key,
            );

            let existing = existing_by_key.get(&planned_key).copied();
            let mut outcome = self.process_and_write_file(
                &db,
                planned,
                content_hash,
                existing,
                &run_id,
                &registry,
                &mut parser_pool,
                link_snapshot.as_ref(),
                &workspace_root,
                &root_paths,
                &workspace_roots,
                &package_roots,
            )?;
            warnings.append(&mut outcome.warnings);
            fact_stats.accumulate(outcome.stats);
            link_report.accumulate(outcome.link_report);
            counters.register(outcome.persisted_file.freshness_state);
            if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                fatal_invalidation_roots.insert(planned_key.clone());
            }
            if outcome.delta.public_api_changed || outcome.delta.structure_changed {
                contract_changed_files_by_path
                    .insert(planned_key.clone(), outcome.persisted_file.clone());
            }
            changed_files_by_path.insert(planned_key.clone(), outcome.persisted_file);
            confirmed_delta_by_path.insert(planned_key.clone(), outcome.delta);
            indexed_rel_paths.insert(planned_key);
            reindexed_files = reindexed_files.saturating_add(1);
        }

        let initial_indexed_rel_paths = indexed_rel_paths.clone();

        for planned in &dirty_set.to_index {
            let planned_key = file_key_for_candidate(&planned.candidate);
            if indexed_rel_paths.contains(&planned_key)
                || hash_failure_message(
                    &planned_key,
                    &planned.candidate.rel_path,
                    &hash_failures_by_file_key,
                    &hash_failures,
                )
                .is_none()
            {
                continue;
            }
            let Some(existing) = existing_by_key.get(&planned_key).copied() else {
                continue;
            };

            let parse_error = hash_failure_message(
                &planned_key,
                &planned.candidate.rel_path,
                &hash_failures_by_file_key,
                &hash_failures,
            )
            .cloned()
            .unwrap_or_else(|| {
                format!(
                    "failed to read file for hashing: {}",
                    planned.candidate.abs_path.display()
                )
            });

            warnings.push(format!(
                "marking file as failed after hash read error: {}",
                planned.candidate.rel_path
            ));
            mark_hash_read_failure(&db, existing, &planned.candidate, parse_error, &run_id)?;
            counters.register(FreshnessState::NotCurrent);
            fatal_invalidation_roots.insert(planned_key.clone());
            indexed_rel_paths.insert(planned_key);
            reindexed_files = reindexed_files.saturating_add(1);
        }

        let deleted_rel_paths = dirty_set
            .to_delete
            .iter()
            .filter_map(|file_id| {
                existing_files
                    .iter()
                    .find(|file| file.id == *file_id)
                    .map(file_key_for_file)
            })
            .collect::<HashSet<_>>();

        let mut dependent_invalidation_roots = forced_dependent_roots.clone();
        dependent_invalidation_roots.extend(fatal_invalidation_roots.iter().cloned());

        self.apply_confirmed_invalidation_expansion(
            &db,
            workspace_id,
            &run_id,
            &candidates,
            &existing_files,
            &changed_files_by_path,
            &confirmed_delta_by_path,
            &deleted_rel_paths,
            &dependent_invalidation_roots,
            &initial_indexed_rel_paths,
            &mut invalidation_refresh_queue,
            &mut queued_rel_paths,
            &mut counters,
            &mut warnings,
        )?;

        while let Some(planned) = invalidation_refresh_queue.pop_front() {
            let planned_key = file_key_for_candidate(&planned.candidate);
            if indexed_rel_paths.contains(&planned_key) {
                continue;
            }

            let content_hash = if let Some(content_hash) = content_hash_message(
                &planned_key,
                &planned.candidate.rel_path,
                &content_hashes_by_file_key,
                &content_hashes,
            ) {
                content_hash.as_str()
            } else if hash_failure_message(
                &planned_key,
                &planned.candidate.rel_path,
                &hash_failures_by_file_key,
                &hash_failures,
            )
            .is_some()
            {
                if let Some(existing) = existing_by_key.get(&planned_key).copied() {
                    let parse_error = hash_failure_message(
                        &planned_key,
                        &planned.candidate.rel_path,
                        &hash_failures_by_file_key,
                        &hash_failures,
                    )
                    .cloned()
                    .unwrap_or_else(|| {
                        format!(
                            "failed to read file for hashing: {}",
                            planned.candidate.abs_path.display()
                        )
                    });
                    warnings.push(format!(
                        "marking file as failed after hash read error during invalidation: {}",
                        planned.candidate.rel_path
                    ));
                    mark_hash_read_failure(
                        &db,
                        existing,
                        &planned.candidate,
                        parse_error,
                        &run_id,
                    )?;
                    counters.register(FreshnessState::NotCurrent);
                    fatal_invalidation_roots.insert(planned_key.clone());
                    indexed_rel_paths.insert(planned_key);
                    reindexed_files = reindexed_files.saturating_add(1);
                }
                continue;
            } else {
                content_hash_for_planned_file(
                    &planned.candidate,
                    &content_hashes,
                    &content_hashes_by_file_key,
                    &existing_by_key,
                )
            };

            let existing = existing_by_key.get(&planned_key).copied();
            let mut outcome = self.process_and_write_file(
                &db,
                &planned,
                content_hash,
                existing,
                &run_id,
                &registry,
                &mut parser_pool,
                link_snapshot.as_ref(),
                &workspace_root,
                &root_paths,
                &workspace_roots,
                &package_roots,
            )?;
            warnings.append(&mut outcome.warnings);
            fact_stats.accumulate(outcome.stats);
            link_report.accumulate(outcome.link_report);
            counters.register(outcome.persisted_file.freshness_state);
            if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                fatal_invalidation_roots.insert(planned_key.clone());
            }
            if outcome.delta.public_api_changed || outcome.delta.structure_changed {
                contract_changed_files_by_path
                    .insert(planned_key.clone(), outcome.persisted_file.clone());
            }
            changed_files_by_path.insert(planned_key.clone(), outcome.persisted_file);
            confirmed_delta_by_path.insert(planned_key.clone(), outcome.delta);
            indexed_rel_paths.insert(planned_key);
            reindexed_files = reindexed_files.saturating_add(1);
        }

        let deleted_at = now_unix_ms();
        for file_id in &dirty_set.to_delete {
            if let Some(existing) = existing_by_id.get(file_id).copied() {
                mark_deleted_file(&db, existing, deleted_at, &run_id)?;
                counters.register(FreshnessState::Deleted);
            }
        }

        refresh_unchanged_files(
            &db,
            workspace_id,
            &indexed_rel_paths,
            &run_id,
            &mut counters,
        )?;

        let content_only_incremental = dirty_set.to_delete.is_empty()
            && changed_files_by_path.len() == indexed_rel_paths.len()
            && changed_files_by_path
                .keys()
                .all(|file_key| existing_by_key.contains_key(file_key))
            && confirmed_delta_by_path
                .values()
                .all(|delta| !delta.public_api_changed && !delta.structure_changed)
            && fatal_invalidation_roots.is_empty();
        link_report = if indexed_rel_paths.is_empty() && dirty_set.to_delete.is_empty() {
            LinkReport::default()
        } else if content_only_incremental {
            link_report
        } else if dirty_set.to_delete.is_empty() && !contract_changed_files_by_path.is_empty() {
            relink_contract_changed_files(
                &db,
                workspace_id,
                &workspace_root,
                &root_paths,
                &changed_files_by_path,
                &contract_changed_files_by_path,
            )?
        } else {
            linker::link_workspace(&db, workspace_id, &workspace_root, &root_paths)?
        };
        let finished_at_unix_ms = now_unix_ms();

        let mut state = db
            .get_state(workspace_id)?
            .unwrap_or_else(|| default_state_for(workspace_id));
        state.status = IndexRunStatus::Completed;
        state.index_version = state.index_version.saturating_add(1);
        state.active_run_id = None;
        state.total_files = candidates.len() as u64;
        state.indexed_files = reindexed_files;
        state.dirty_files = dirty_set.to_index.len() as u64;
        state.deleted_files = dirty_set.to_delete.len() as u64;
        state.last_scan_started_at_unix_ms = Some(started_at_unix_ms);
        state.last_scan_finished_at_unix_ms = Some(finished_at_unix_ms);
        state.last_successful_index_at_unix_ms = Some(finished_at_unix_ms);
        state.last_error = None;
        db.update_state(&state)?;

        let graph_hydration_ms = if indexed_rel_paths.is_empty()
            || (content_only_incremental && dirty_set.to_delete.is_empty())
        {
            0
        } else {
            hydrate_current_graph_projection(&db, workspace_id, &mut warnings)?
        };

        db.upsert_run(
            &run_id,
            workspace_id,
            IndexRunStatus::Completed,
            "complete",
            started_at_unix_ms,
            finished_at_unix_ms,
            Some(finished_at_unix_ms),
            Some("path-scoped index complete"),
        )?;

        Ok(IndexReport {
            workspace_id,
            run_id,
            scanned_files: candidates.len() as u64,
            changed_files: dirty_set.to_index.len() as u64,
            reindexed_files,
            deleted_files: dirty_set.to_delete.len() as u64,
            queued_embeddings: 0,
            warnings,
            duration_ms: start.elapsed().as_millis(),
            refreshed_current_files: counters.refreshed_current_files,
            retained_current_files: counters.retained_current_files,
            degraded_partial_files: counters.degraded_partial_files,
            not_current_files: counters.not_current_files,
            deleted_paths: counters.deleted_paths,
            workspace_root_count: workspace_roots.len() as u64,
            package_root_count: package_roots.len() as u64,
            symbols_extracted: fact_stats.symbols_extracted,
            imports_extracted: fact_stats.imports_extracted,
            call_sites_extracted: fact_stats.call_sites_extracted,
            references_extracted: fact_stats.references_extracted,
            linked_imports: link_report.linked_imports,
            linked_cross_root_imports: link_report.linked_cross_root_imports,
            linked_calls: link_report.linked_calls,
            linked_cross_root_calls: link_report.linked_cross_root_calls,
            linked_references: link_report.linked_references,
            unresolved_imports: link_report.unresolved_imports,
            unresolved_cross_root_imports: link_report.unresolved_cross_root_imports,
            unresolved_calls: link_report.unresolved_calls,
            unresolved_references: link_report.unresolved_references,
            graph_hydration_ms,
            link_ms: link_report.link_ms,
        })
    }

    fn invalidate_paths(&self, workspace_id: WorkspaceId, paths: Vec<PathBuf>) -> Result<()> {
        let db = self.open_db()?;
        let workspace_root = workspace_root_for(&db, workspace_id)?;
        let root_paths = root_paths_by_id(&db, workspace_id)?;

        for path in paths {
            let Some(file_key) = resolve_touched_file_key(&path, &root_paths).or_else(|| {
                if path.is_absolute() {
                    let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
                    path.strip_prefix(&workspace_root)
                        .map(normalize_path)
                        .or_else(|_| {
                            canonical_path
                                .strip_prefix(&workspace_root)
                                .map(normalize_path)
                        })
                        .ok()
                        .map(|rel_path| FileKey::new(1, rel_path))
                } else {
                    Some(FileKey::new(1, normalize_path(&path)))
                }
            }) else {
                continue;
            };

            let Some(mut file) =
                db.get_file_by_root_path(workspace_id, file_key.root_id, &file_key.rel_path)?
            else {
                continue;
            };

            file.content_hash = String::new();
            file.structure_hash = None;
            file.public_api_hash = None;
            file.mtime_unix_ms = 0;
            file.parse_status = ParseStatus::Pending;
            file.parse_error = None;
            file.symbol_count = 0;
            file.chunk_count = 0;
            file.last_indexed_at_unix_ms = Some(now_unix_ms());
            file.freshness_state = FreshnessState::NotCurrent;
            file.freshness_reason = Some(FreshnessReason::PathInvalidated);
            file.last_freshness_run_id = None;
            write_file_atomically(
                &db,
                &file,
                &[],
                &[],
                &[],
                &[],
                &[],
                &[],
                LinkReport::default(),
                true,
                false,
            )?;
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

fn queue_candidate_for_refresh(
    scanned_by_path: &HashMap<FileKey, &FileCandidate>,
    file_key: &FileKey,
    level: InvalidationLevel,
    reason: &str,
    triggered_by: &str,
    initial_indexed_rel_paths: &HashSet<FileKey>,
    queued_rel_paths: &mut HashSet<FileKey>,
    refresh_queue: &mut VecDeque<PlannedFile>,
) -> bool {
    if initial_indexed_rel_paths.contains(file_key) || queued_rel_paths.contains(file_key) {
        return false;
    }

    let Some(candidate) = scanned_by_path.get(file_key) else {
        return false;
    };

    queued_rel_paths.insert(file_key.clone());
    refresh_queue.push_back(PlannedFile {
        candidate: (*candidate).clone(),
        level,
        reason: reason.to_string(),
        triggered_by: triggered_by.to_string(),
    });
    true
}

fn build_metadata_only_dirty_set(
    candidates: &[FileCandidate],
    existing_files: &[File],
) -> dirty::DirtySet {
    let existing_by_key = existing_files
        .iter()
        .map(|file| (file_key_for_file(file), file))
        .collect::<HashMap<_, _>>();
    let scanned_keys = candidates
        .iter()
        .map(file_key_for_candidate)
        .collect::<HashSet<_>>();

    let to_index = candidates
        .iter()
        .filter_map(|candidate| {
            let existing = existing_by_key
                .get(&file_key_for_candidate(candidate))
                .copied()?;
            let metadata_changed = existing.deleted_at_unix_ms.is_some()
                || existing.content_hash.is_empty()
                || existing.size_bytes != candidate.size_bytes
                || existing.mtime_unix_ms != candidate.mtime_unix_ms;
            metadata_changed.then(|| PlannedFile {
                candidate: candidate.clone(),
                level: InvalidationLevel::ContentOnly,
                reason: "metadata change detected; content hash required".to_string(),
                triggered_by: candidate.rel_path.clone(),
            })
        })
        .collect::<Vec<_>>();

    let mut to_delete = existing_files
        .iter()
        .filter(|file| file.deleted_at_unix_ms.is_none())
        .filter(|file| !scanned_keys.contains(&file_key_for_file(file)))
        .map(|file| file.id)
        .collect::<Vec<_>>();
    to_delete.sort_unstable();
    to_delete.dedup();

    dirty::DirtySet {
        to_index,
        to_delete,
    }
}

fn content_hash_message<'a>(
    file_key: &FileKey,
    rel_path: &str,
    content_hashes_by_file_key: &'a HashMap<FileKey, String>,
    content_hashes: &'a HashMap<String, String>,
) -> Option<&'a String> {
    content_hashes_by_file_key.get(file_key).or_else(|| {
        content_hashes
            .get(rel_path)
            .filter(|_| content_hashes_by_file_key.is_empty())
    })
}

fn hash_failure_message<'a>(
    file_key: &FileKey,
    rel_path: &str,
    hash_failures_by_file_key: &'a HashMap<FileKey, String>,
    hash_failures: &'a HashMap<String, String>,
) -> Option<&'a String> {
    hash_failures_by_file_key.get(file_key).or_else(|| {
        hash_failures
            .get(rel_path)
            .filter(|_| hash_failures_by_file_key.is_empty())
    })
}

fn content_hash_for_planned_file<'a>(
    candidate: &FileCandidate,
    content_hashes: &'a HashMap<String, String>,
    content_hashes_by_file_key: &'a HashMap<FileKey, String>,
    existing_by_key: &'a HashMap<FileKey, &File>,
) -> &'a str {
    let file_key = file_key_for_candidate(candidate);
    content_hash_message(
        &file_key,
        &candidate.rel_path,
        content_hashes_by_file_key,
        content_hashes,
    )
    .map(String::as_str)
    .or_else(|| {
        existing_by_key
            .get(&file_key)
            .map(|file| file.content_hash.as_str())
    })
    .unwrap_or("")
}

fn file_key_for_candidate(candidate: &FileCandidate) -> FileKey {
    FileKey::new(candidate.root_id, candidate.rel_path.clone())
}

fn file_key_for_file(file: &File) -> FileKey {
    FileKey::new(file.root_id, file.rel_path.clone())
}

fn mark_hash_read_failure(
    db: &Database,
    existing: &File,
    candidate: &FileCandidate,
    parse_error: String,
    run_id: &str,
) -> Result<()> {
    let run_id_marker = run_id_to_i64(run_id);
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
        freshness_state: FreshnessState::NotCurrent,
        freshness_reason: Some(FreshnessReason::FatalReadFailure),
        last_freshness_run_id: Some(run_id_marker.to_string()),
    };

    write_file_atomically(
        db,
        &failed_file,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        LinkReport::default(),
        true,
        false,
    )
}

fn mark_not_current_without_refresh(
    db: &Database,
    file: &File,
    run_id: &str,
    reason_message: &str,
    reason: FreshnessReason,
    counters: &mut FreshnessCounters,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let run_id_marker = run_id_to_i64(run_id);
    let mut invalidated = file.clone();
    invalidated.parse_status = ParseStatus::Failed;
    invalidated.parse_error = Some(format!("invalidated without refresh: {reason_message}"));
    invalidated.structure_hash = None;
    invalidated.public_api_hash = None;
    invalidated.symbol_count = 0;
    invalidated.chunk_count = 0;
    invalidated.last_indexed_at_unix_ms = Some(now_unix_ms());
    invalidated.freshness_state = FreshnessState::NotCurrent;
    invalidated.freshness_reason = Some(reason);
    invalidated.last_freshness_run_id = Some(run_id_marker.to_string());

    write_file_atomically(
        db,
        &invalidated,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        LinkReport::default(),
        true,
        false,
    )?;
    counters.register(FreshnessState::NotCurrent);
    warnings.push(format!(
        "marked file as not current without refresh: {} ({reason_message})",
        invalidated.rel_path
    ));

    Ok(())
}

fn is_fatal_failure_invalidation_root(file: &File) -> bool {
    file.freshness_state == FreshnessState::NotCurrent
        && matches!(
            file.freshness_reason,
            Some(
                FreshnessReason::FatalReadFailure
                    | FreshnessReason::FatalParseFailure
                    | FreshnessReason::FatalPersistFailure
            )
        )
}

#[allow(clippy::too_many_arguments)]
fn apply_resolution_scope_invalidation(
    db: &Database,
    workspace_id: WorkspaceId,
    run_id: &str,
    scanned_by_path: &HashMap<FileKey, &FileCandidate>,
    existing_by_path: &HashMap<FileKey, &File>,
    resolution_scope_roots: &HashSet<FileKey>,
    initial_indexed_rel_paths: &HashSet<FileKey>,
    refresh_queue: &mut VecDeque<PlannedFile>,
    queued_rel_paths: &mut HashSet<FileKey>,
    counters: &mut FreshnessCounters,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if resolution_scope_roots.is_empty() {
        return Ok(());
    }

    warnings.push(format!(
        "resolution-basis change detected; widening invalidation for workspace {workspace_id}"
    ));

    for (file_key, existing) in existing_by_path {
        if existing.deleted_at_unix_ms.is_some() || initial_indexed_rel_paths.contains(file_key) {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            file_key,
            InvalidationLevel::ResolutionScope,
            "resolution basis changed",
            "resolution_scope",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if !scanned_by_path.contains_key(file_key) {
                mark_not_current_without_refresh(
                    db,
                    existing,
                    run_id,
                    "resolution basis changed while path is not currently scannable",
                    FreshnessReason::ResolutionScopeChanged,
                    counters,
                    warnings,
                )?;
            }
        }

        warnings.push(format!(
            "resolution-scope invalidation roots: {}",
            resolution_scope_roots.len()
        ));
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn apply_dependent_invalidation(
    db: &Database,
    workspace_id: WorkspaceId,
    run_id: &str,
    scanned_by_path: &HashMap<FileKey, &FileCandidate>,
    existing_by_path: &HashMap<FileKey, &File>,
    public_api_roots: &HashSet<FileKey>,
    deleted_rel_paths: &HashSet<FileKey>,
    forced_dependent_roots: &HashSet<FileKey>,
    initial_indexed_rel_paths: &HashSet<FileKey>,
    refresh_queue: &mut VecDeque<PlannedFile>,
    queued_rel_paths: &mut HashSet<FileKey>,
    counters: &mut FreshnessCounters,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let mut root_rel_paths = HashSet::new();
    root_rel_paths.extend(public_api_roots.iter().cloned());
    root_rel_paths.extend(deleted_rel_paths.iter().cloned());
    root_rel_paths.extend(forced_dependent_roots.iter().cloned());

    if root_rel_paths.is_empty() {
        return Ok(());
    }

    warnings.push(format!(
        "dependent invalidation roots: {}",
        root_rel_paths.len()
    ));

    let existing_by_id = existing_by_path
        .values()
        .map(|file| (file.id, *file))
        .collect::<HashMap<_, _>>();

    let mut queue = VecDeque::new();
    let mut visited_file_ids = HashSet::new();
    for file_key in &root_rel_paths {
        if let Some(file) = existing_by_path.get(file_key) {
            if visited_file_ids.insert(file.id) {
                queue.push_back(file.id);
            }
        }
    }

    for file_key in &root_rel_paths {
        if initial_indexed_rel_paths.contains(file_key) {
            continue;
        }
        if !queue_candidate_for_refresh(
            scanned_by_path,
            file_key,
            InvalidationLevel::Dependent,
            "dependent expansion requested from path-scoped run",
            "dependent_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(file_key) {
                if !scanned_by_path.contains_key(file_key) {
                    mark_not_current_without_refresh(
                        db,
                        existing,
                        run_id,
                        "dependent expansion requested but path is not currently scannable",
                        FreshnessReason::DependentInvalidated,
                        counters,
                        warnings,
                    )?;
                }
            }
        }
    }

    let mut dependent_rel_paths = HashSet::new();
    while let Some(current_file_id) = queue.pop_front() {
        for reverse in
            db.find_incoming_edges(workspace_id, "file", current_file_id as i64, 200_000)?
        {
            if reverse.kind != dh_types::EdgeKind::Imports {
                continue;
            }
            let source_file_id = match reverse.from {
                dh_types::NodeId::File(id) => id,
                _ => continue,
            };
            if let Some(importer) = existing_by_id.get(&source_file_id) {
                if importer.deleted_at_unix_ms.is_some() {
                    continue;
                }

                if dependent_rel_paths.insert(file_key_for_file(importer))
                    && visited_file_ids.insert(importer.id)
                {
                    queue.push_back(importer.id);
                }
            }
        }
    }

    warnings.push(format!(
        "dependent invalidation discovered {} downstream files",
        dependent_rel_paths.len()
    ));

    // Fallback matching for unresolved imports: keep invalidation conservative and inspectable.
    // This prevents stale downstream facts when reverse-import linkage could not be persisted.
    for importer in existing_by_path.values() {
        if importer.deleted_at_unix_ms.is_some() {
            continue;
        }
        let importer_key = file_key_for_file(importer);
        if root_rel_paths.contains(&importer_key) {
            continue;
        }

        let imports = db.find_edges_by_file(importer.id)?;
        if imports
            .iter()
            .filter(|e| e.kind == dh_types::EdgeKind::Imports)
            .any(|import| {
                root_rel_paths.iter().any(|root_file_key| {
                    import_specifier_matches_rel_path(&import.reason, &root_file_key.rel_path)
                })
            })
        {
            dependent_rel_paths.insert(importer_key);
        }
    }

    for dependent_file_key in dependent_rel_paths {
        if root_rel_paths.contains(&dependent_file_key)
            || initial_indexed_rel_paths.contains(&dependent_file_key)
        {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            &dependent_file_key,
            InvalidationLevel::Dependent,
            "dependent invalidated by upstream outward contract change",
            "dependent_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(&dependent_file_key) {
                mark_not_current_without_refresh(
                    db,
                    existing,
                    run_id,
                    "dependent invalidated but path is not currently scannable",
                    FreshnessReason::DependentInvalidated,
                    counters,
                    warnings,
                )?;
            }
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn apply_structural_invalidation(
    db: &Database,
    workspace_id: WorkspaceId,
    run_id: &str,
    scanned_by_path: &HashMap<FileKey, &FileCandidate>,
    existing_by_path: &HashMap<FileKey, &File>,
    structural_roots: &HashSet<FileKey>,
    initial_indexed_rel_paths: &HashSet<FileKey>,
    refresh_queue: &mut VecDeque<PlannedFile>,
    queued_rel_paths: &mut HashSet<FileKey>,
    counters: &mut FreshnessCounters,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if structural_roots.is_empty() {
        return Ok(());
    }

    warnings.push(format!(
        "structural invalidation roots: {}",
        structural_roots.len()
    ));

    let existing_by_id = existing_by_path
        .values()
        .map(|file| (file.id, *file))
        .collect::<HashMap<_, _>>();

    let mut direct_structural_rel_paths = HashSet::new();

    for file_key in structural_roots {
        if initial_indexed_rel_paths.contains(file_key) {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            file_key,
            InvalidationLevel::StructuralLocal,
            "structural-local invalidation due to confirmed structure hash change",
            "structural_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(file_key) {
                if !scanned_by_path.contains_key(file_key) {
                    mark_not_current_without_refresh(
                        db,
                        existing,
                        run_id,
                        "structural-local invalidation but path is not currently scannable",
                        FreshnessReason::StructureChanged,
                        counters,
                        warnings,
                    )?;
                }
            }
        }
    }

    for root_file_key in structural_roots {
        let Some(root_file) = existing_by_path.get(root_file_key) else {
            continue;
        };

        for reverse in db.find_incoming_edges(workspace_id, "file", root_file.id as i64, 200_000)? {
            if reverse.kind != dh_types::EdgeKind::Imports {
                continue;
            }
            let source_file_id = match reverse.from {
                dh_types::NodeId::File(id) => id,
                _ => continue,
            };
            if let Some(importer) = existing_by_id.get(&source_file_id) {
                if importer.deleted_at_unix_ms.is_none() {
                    direct_structural_rel_paths.insert(file_key_for_file(importer));
                }
            }
        }
    }

    warnings.push(format!(
        "structural invalidation discovered {} directly impacted files",
        direct_structural_rel_paths.len()
    ));

    for file_key in direct_structural_rel_paths {
        if structural_roots.contains(&file_key) || initial_indexed_rel_paths.contains(&file_key) {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            &file_key,
            InvalidationLevel::StructuralLocal,
            "structural-local invalidation due to confirmed structure hash change",
            "structural_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(&file_key) {
                if !scanned_by_path.contains_key(&file_key) {
                    mark_not_current_without_refresh(
                        db,
                        existing,
                        run_id,
                        "structural-local invalidation but path is not currently scannable",
                        FreshnessReason::StructureChanged,
                        counters,
                        warnings,
                    )?;
                }
            }
        }
    }

    Ok(())
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

fn ensure_workspace_and_root(
    db: &Database,
    workspace_id: WorkspaceId,
    root_id: i64,
    root: &Path,
) -> Result<()> {
    let root_path = root.to_string_lossy().to_string();
    let now = now_unix_ms();

    db.connection().execute(
        "INSERT INTO workspaces(id, root_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
        rusqlite::params![workspace_id, root_path, now, now],
    )?;

    db.connection().execute(
        "INSERT INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES (?1, ?2, ?3, 'workspace_root', NULL)
         ON CONFLICT(id) DO UPDATE SET abs_path = excluded.abs_path, root_kind = excluded.root_kind, marker_path = excluded.marker_path",
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

fn root_paths_by_id(db: &Database, workspace_id: WorkspaceId) -> Result<HashMap<i64, PathBuf>> {
    let mut stmt = db
        .connection()
        .prepare("SELECT id, abs_path FROM roots WHERE workspace_id = ?1 ORDER BY id ASC")?;
    let rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            PathBuf::from(row.get::<_, String>(1)?),
        ))
    })?;

    let mut roots = HashMap::new();
    for row in rows {
        let (root_id, abs_path) = row?;
        roots.insert(root_id, abs_path);
    }

    Ok(roots)
}

fn sorted_root_paths(root_paths: &HashMap<i64, PathBuf>) -> Vec<(i64, PathBuf)> {
    let mut entries = root_paths
        .iter()
        .map(|(root_id, root)| (*root_id, root.clone()))
        .collect::<Vec<_>>();
    entries.sort_by_key(|(root_id, _)| *root_id);
    entries
}

fn workspace_roots_from_root_paths(
    root_paths: &HashMap<i64, PathBuf>,
    fallback_root: &Path,
) -> Vec<PathBuf> {
    let roots = sorted_root_paths(root_paths)
        .into_iter()
        .map(|(_, root)| root)
        .collect::<Vec<_>>();
    if roots.is_empty() {
        vec![fallback_root.to_path_buf()]
    } else {
        roots
    }
}

fn assign_workspace_root_ids(
    db: &Database,
    workspace_id: WorkspaceId,
    workspace_roots: &[PathBuf],
) -> Result<Vec<(i64, PathBuf)>> {
    let existing_root_paths = root_paths_by_id(db, workspace_id)?;
    let mut existing_by_path = existing_root_paths
        .iter()
        .map(|(root_id, root)| (normalize_path(root), *root_id))
        .collect::<HashMap<_, _>>();
    let mut next_root_id = existing_root_paths
        .keys()
        .copied()
        .max()
        .unwrap_or(0)
        .saturating_add(1);

    let mut assignments = Vec::new();
    for root in workspace_roots {
        let normalized = normalize_path(root);
        let root_id = if let Some(root_id) = existing_by_path.get(&normalized).copied() {
            root_id
        } else {
            let root_id = next_root_id;
            next_root_id = next_root_id.saturating_add(1);
            existing_by_path.insert(normalized, root_id);
            root_id
        };
        assignments.push((root_id, root.clone()));
    }
    Ok(assignments)
}

fn resolve_touched_file_keys(
    paths: &[PathBuf],
    root_paths: &HashMap<i64, PathBuf>,
) -> Vec<FileKey> {
    let mut keys = paths
        .iter()
        .filter_map(|path| resolve_touched_file_key(path, root_paths))
        .collect::<Vec<_>>();
    keys.sort_by(|left, right| {
        (left.root_id, left.rel_path.as_str()).cmp(&(right.root_id, right.rel_path.as_str()))
    });
    keys.dedup();
    keys
}

fn resolve_touched_file_key(path: &Path, root_paths: &HashMap<i64, PathBuf>) -> Option<FileKey> {
    if path.is_absolute() {
        let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let candidates = [canonical_path.as_path(), path];
        return sorted_root_paths(root_paths)
            .into_iter()
            .filter_map(|(root_id, root)| {
                candidates.iter().find_map(|candidate| {
                    candidate.strip_prefix(&root).ok().map(|rel_path| {
                        FileKey::new(root_id, normalize_workspace_rel_path(rel_path))
                    })
                })
            })
            .max_by_key(|file_key| {
                root_paths
                    .get(&file_key.root_id)
                    .map(|root| normalize_path(root).len())
                    .unwrap_or(0)
            });
    }

    if root_paths.len() == 1 {
        let root_id = root_paths.keys().copied().next().unwrap_or(1);
        return Some(FileKey::new(root_id, normalize_workspace_rel_path(path)));
    }

    None
}

fn should_reuse_existing_edges(
    existing_file: Option<&File>,
    file: &File,
    delta: ConfirmedDelta,
) -> bool {
    existing_file.is_some()
        && file.deleted_at_unix_ms.is_none()
        && matches!(file.freshness_state, FreshnessState::RefreshedCurrent)
        && !delta.public_api_changed
        && !delta.structure_changed
        && !is_resolution_scope_path(&file.rel_path)
}

fn relink_contract_changed_files(
    db: &Database,
    workspace_id: WorkspaceId,
    workspace_root: &Path,
    root_paths: &HashMap<i64, PathBuf>,
    changed_files_by_path: &HashMap<FileKey, File>,
    contract_changed_files_by_path: &HashMap<FileKey, File>,
) -> Result<LinkReport> {
    if contract_changed_files_by_path.is_empty() {
        return Ok(LinkReport::default());
    }

    let started = Instant::now();
    let mut import_edges = Vec::new();
    for file in changed_files_by_path.values() {
        import_edges.extend(preserved_file_import_edges(db, file.id)?);
    }
    for file in contract_changed_files_by_path.values() {
        import_edges.extend(preserved_incoming_import_edges(db, workspace_id, file.id)?);
    }

    db.connection()
        .execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
    let write_result = (|| -> Result<()> {
        for file in contract_changed_files_by_path.values() {
            delete_graph_edges_for_source_file(db, file.id)?;
        }
        for edge in &import_edges {
            let source_file_id = match edge.from {
                NodeId::File(id) => id,
                _ => continue,
            };
            db.insert_edges(std::slice::from_ref(edge), source_file_id)?;
        }
        Ok(())
    })();

    match write_result {
        Ok(()) => db.connection().execute_batch("COMMIT")?,
        Err(err) => {
            let _ = db.connection().execute_batch("ROLLBACK");
            return Err(err);
        }
    }

    let mut report =
        linker::summarize_workspace_edges(db, workspace_id, workspace_root, root_paths)?;
    report.link_ms = started.elapsed().as_millis();
    Ok(report)
}

fn preserved_file_import_edges(db: &Database, file_id: FileId) -> Result<Vec<dh_types::GraphEdge>> {
    let mut edges = Vec::new();
    preserve_existing_file_edges(db, file_id, &mut edges)?;
    Ok(edges)
}

fn preserved_incoming_import_edges(
    db: &Database,
    workspace_id: WorkspaceId,
    file_id: FileId,
) -> Result<Vec<dh_types::GraphEdge>> {
    Ok(db
        .find_incoming_edges(workspace_id, "file", file_id, 200_000)?
        .into_iter()
        .filter(|edge| matches!(edge.kind, EdgeKind::Imports | EdgeKind::ReExports))
        .filter(|edge| edge.resolution == EdgeResolution::Resolved)
        .collect())
}

fn preserve_existing_file_edges(
    db: &Database,
    file_id: FileId,
    graph_edges: &mut Vec<dh_types::GraphEdge>,
) -> Result<()> {
    let mut stmt = db.connection().prepare(
        "
        SELECT id, workspace_id, source_file_id, kind, from_node_kind, from_node_id,
               to_node_kind, to_node_id, resolution, confidence, start_line, start_column,
               end_line, end_column, reason, payload_json
          FROM graph_edges
         WHERE source_file_id = ?1
           AND from_node_kind = 'file'
           AND from_node_id = ?1
           AND kind IN ('imports', 're_exports')
           AND resolution = 'resolved'
         ORDER BY id ASC
        ",
    )?;
    let rows = stmt.query_map(rusqlite::params![file_id], map_preserved_file_edge)?;
    for row in rows {
        graph_edges.push(row?);
    }
    Ok(())
}

fn map_preserved_file_edge(row: &rusqlite::Row<'_>) -> rusqlite::Result<dh_types::GraphEdge> {
    let kind = match row.get::<_, String>(3)?.as_str() {
        "imports" => EdgeKind::Imports,
        "re_exports" => EdgeKind::ReExports,
        _ => EdgeKind::Imports,
    };
    let from = match row.get::<_, String>(4)?.as_str() {
        "file" => NodeId::File(row.get(5)?),
        "symbol" => NodeId::Symbol(row.get(5)?),
        "chunk" => NodeId::Chunk(row.get(5)?),
        _ => NodeId::File(row.get(5)?),
    };
    let to = match row.get::<_, String>(6)?.as_str() {
        "file" => NodeId::File(row.get(7)?),
        "symbol" => NodeId::Symbol(row.get(7)?),
        "chunk" => NodeId::Chunk(row.get(7)?),
        _ => NodeId::File(row.get(7)?),
    };
    let resolution = match row.get::<_, String>(8)?.as_str() {
        "resolved" => EdgeResolution::Resolved,
        _ => EdgeResolution::Unresolved,
    };
    let confidence = match row.get::<_, String>(9)?.as_str() {
        "direct" => dh_types::EdgeConfidence::Direct,
        _ => dh_types::EdgeConfidence::BestEffort,
    };
    let start_line = row.get::<_, Option<i64>>(10)?;
    let start_column = row.get::<_, Option<i64>>(11)?;
    let end_line = row.get::<_, Option<i64>>(12)?;
    let end_column = row.get::<_, Option<i64>>(13)?;
    let span = match (start_line, start_column, end_line, end_column) {
        (Some(start_line), Some(start_column), Some(end_line), Some(end_column)) => {
            Some(dh_types::Span {
                start_byte: 0,
                end_byte: 0,
                start_line: start_line as u32,
                start_column: start_column as u32,
                end_line: end_line as u32,
                end_column: end_column as u32,
            })
        }
        _ => None,
    };

    Ok(dh_types::GraphEdge {
        kind,
        from,
        to,
        resolution,
        confidence,
        span,
        reason: row.get(14)?,
        payload_json: row.get(15)?,
    })
}

fn delete_graph_edges_for_source_file(db: &Database, file_id: FileId) -> Result<()> {
    db.connection().execute(
        "
        DELETE FROM graph_edges
         WHERE (from_node_kind = 'file' AND from_node_id = ?1)
            OR (source_file_id = ?1 AND from_node_kind <> 'file')
        ",
        rusqlite::params![file_id],
    )?;
    Ok(())
}

fn delete_graph_edges_for_deleted_file(
    db: &Database,
    file_id: FileId,
    symbol_ids: &[dh_types::SymbolId],
) -> Result<()> {
    delete_graph_edges_for_source_file(db, file_id)?;
    db.connection().execute(
        "DELETE FROM graph_edges WHERE to_node_kind = 'file' AND to_node_id = ?1",
        rusqlite::params![file_id],
    )?;
    db.delete_edges_for_symbol_endpoints(symbol_ids)?;
    Ok(())
}

fn write_file_atomically(
    db: &Database,
    file: &File,
    symbols: &[dh_types::Symbol],
    _imports: &[dh_types::Import],
    _call_edges: &[dh_types::CallEdge],
    _references: &[dh_types::Reference],
    chunks: &[dh_types::Chunk],
    graph_edges: &[dh_types::GraphEdge],
    link_report: LinkReport,
    has_existing: bool,
    preserve_existing_edges: bool,
) -> Result<()> {
    db.connection()
        .execute_batch("BEGIN IMMEDIATE TRANSACTION")?;

    let write_result = (|| -> Result<()> {
        if has_existing {
            let old_symbol_ids = db
                .find_symbols_by_file(file.id)?
                .into_iter()
                .map(|symbol| symbol.id)
                .collect::<Vec<_>>();
            db.delete_edges_for_symbol_endpoints(&old_symbol_ids)?;
            db.delete_file_facts(file.id)?;
        }

        if !preserve_existing_edges {
            delete_graph_edges_for_source_file(db, file.id)?;
        }

        db.upsert_file(file)
            .with_context(|| format!("upsert file {}", file.rel_path))?;

        db.prune_stale_vector_records()
            .with_context(|| format!("prune stale vector records for {}", file.rel_path))?;

        if !symbols.is_empty() {
            db.insert_symbols(symbols)
                .with_context(|| format!("insert symbols for {}", file.rel_path))?;
        }

        if !graph_edges.is_empty() {
            db.insert_edges(graph_edges, file.id)
                .with_context(|| format!("insert graph edges for {}", file.rel_path))?;
        }
        tracing::debug!(
            file = %file.rel_path,
            linked_imports = link_report.linked_imports,
            unresolved_imports = link_report.unresolved_imports,
            linked_calls = link_report.linked_calls,
            unresolved_calls = link_report.unresolved_calls,
            linked_references = link_report.linked_references,
            unresolved_references = link_report.unresolved_references,
            "linked graph facts"
        );
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

fn mark_deleted_file(
    db: &Database,
    file: &File,
    deleted_at_unix_ms: i64,
    run_id: &str,
) -> Result<()> {
    let run_id_marker = run_id_to_i64(run_id);
    db.connection()
        .execute_batch("BEGIN IMMEDIATE TRANSACTION")?;

    let delete_result = (|| -> Result<()> {
        let symbol_ids = db
            .find_symbols_by_file(file.id)?
            .into_iter()
            .map(|symbol| symbol.id)
            .collect::<Vec<_>>();
        db.delete_file_facts(file.id)?;
        delete_graph_edges_for_deleted_file(db, file.id, &symbol_ids)?;

        let mut deleted = file.clone();
        deleted.deleted_at_unix_ms = Some(deleted_at_unix_ms);
        deleted.last_indexed_at_unix_ms = Some(deleted_at_unix_ms);
        deleted.symbol_count = 0;
        deleted.chunk_count = 0;
        deleted.parse_status = ParseStatus::Skipped;
        deleted.parse_error = None;
        deleted.freshness_state = FreshnessState::Deleted;
        deleted.freshness_reason = Some(FreshnessReason::DeletedPath);
        deleted.last_freshness_run_id = Some(run_id_marker.to_string());
        db.upsert_file(&deleted)?;
        db.prune_stale_vector_records().with_context(|| {
            format!(
                "prune stale vector records for deleted file {}",
                deleted.rel_path
            )
        })?;

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

fn import_specifier_matches_rel_path(raw_specifier: &str, rel_path: &str) -> bool {
    let specifier = normalize_module_specifier(raw_specifier);
    if specifier.is_empty() {
        return false;
    }

    module_path_variants(rel_path)
        .iter()
        .any(|candidate| specifier == *candidate || specifier.ends_with(&format!("/{candidate}")))
}

fn normalize_module_specifier(raw_specifier: &str) -> String {
    let mut specifier = raw_specifier.trim().replace('\\', "/");
    while specifier.starts_with("./") {
        specifier = specifier.trim_start_matches("./").to_string();
    }
    while specifier.starts_with("../") {
        specifier = specifier.trim_start_matches("../").to_string();
    }
    specifier
        .trim_end_matches(".ts")
        .trim_end_matches(".tsx")
        .trim_end_matches(".js")
        .trim_end_matches(".jsx")
        .trim_end_matches(".py")
        .trim_end_matches(".go")
        .trim_end_matches(".rs")
        .trim_end_matches(".d.ts")
        .to_string()
}

fn module_path_variants(rel_path: &str) -> HashSet<String> {
    let normalized = rel_path.replace('\\', "/");
    let without_ext = normalized
        .trim_end_matches(".ts")
        .trim_end_matches(".tsx")
        .trim_end_matches(".js")
        .trim_end_matches(".jsx")
        .trim_end_matches(".py")
        .trim_end_matches(".go")
        .trim_end_matches(".rs")
        .trim_end_matches(".d.ts")
        .to_string();

    let mut variants = HashSet::new();
    variants.insert(without_ext.clone());

    if let Some(file_name) = without_ext.rsplit('/').next() {
        variants.insert(file_name.to_string());
    }

    if let Some(parent) = without_ext.strip_suffix("/index") {
        variants.insert(parent.to_string());
        if let Some(file_name) = parent.rsplit('/').next() {
            variants.insert(file_name.to_string());
        }
    }

    variants
}

fn normalize_workspace_rel_path(path: &Path) -> String {
    let normalized = normalize_path(path);
    if let Some(trimmed) = normalized.strip_prefix("./") {
        return trimmed.to_string();
    }
    normalized
}

fn stable_id_i64(material: &str) -> i64 {
    let hash = blake3::hash(material.as_bytes());
    let mut bytes = [0_u8; 8];
    bytes.copy_from_slice(&hash.as_bytes()[..8]);
    let id = (u64::from_le_bytes(bytes) & 0x7FFF_FFFF_FFFF_FFFF) as i64;
    if id == 0 {
        1
    } else {
        id
    }
}

fn now_unix_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn run_id_to_i64(run_id: &str) -> i64 {
    stable_id_i64(&format!("run|{run_id}"))
}

fn refresh_unchanged_files(
    db: &Database,
    workspace_id: WorkspaceId,
    indexed_rel_paths: &std::collections::HashSet<FileKey>,
    run_id: &str,
    counters: &mut FreshnessCounters,
) -> Result<()> {
    let run_id_marker = run_id_to_i64(run_id);
    let files = db.list_files_by_workspace(workspace_id)?;
    for mut file in files {
        if file.deleted_at_unix_ms.is_some() {
            continue;
        }
        if indexed_rel_paths.contains(&file_key_for_file(&file)) {
            continue;
        }
        if matches!(
            file.freshness_state,
            FreshnessState::DegradedPartial | FreshnessState::NotCurrent | FreshnessState::Deleted
        ) {
            continue;
        }

        file.freshness_state = FreshnessState::RetainedCurrent;
        file.freshness_reason = Some(FreshnessReason::UnchangedUnaffected);
        file.last_freshness_run_id = Some(run_id_marker.to_string());
        db.upsert_file(&file)?;
        counters.register(FreshnessState::RetainedCurrent);
    }

    Ok(())
}

fn hydrate_current_graph_projection(
    db: &Database,
    workspace_id: WorkspaceId,
    warnings: &mut Vec<String>,
) -> Result<u128> {
    let projection = HydratedGraphProjection::hydrate(db, workspace_id)?;
    let stats = projection.stats();
    if !stats.freshness.is_current() {
        warnings.push(format!(
            "graph projection hydrated as {}: {}",
            stats.freshness.as_str(),
            stats.freshness_reason
        ));
    }
    Ok(stats.duration_ms)
}

#[derive(Debug, Default, Clone)]
struct FreshnessCounters {
    refreshed_current_files: u64,
    retained_current_files: u64,
    degraded_partial_files: u64,
    not_current_files: u64,
    deleted_paths: u64,
}

impl FreshnessCounters {
    fn register(&mut self, state: FreshnessState) {
        match state {
            FreshnessState::RetainedCurrent => {
                self.retained_current_files = self.retained_current_files.saturating_add(1)
            }
            FreshnessState::RefreshedCurrent => {
                self.refreshed_current_files = self.refreshed_current_files.saturating_add(1)
            }
            FreshnessState::DegradedPartial => {
                self.degraded_partial_files = self.degraded_partial_files.saturating_add(1)
            }
            FreshnessState::NotCurrent => {
                self.not_current_files = self.not_current_files.saturating_add(1)
            }
            FreshnessState::Deleted => self.deleted_paths = self.deleted_paths.saturating_add(1),
        }
    }
}
