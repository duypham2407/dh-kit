//! Indexer crate for workspace scanning and incremental indexing orchestration.

pub mod dirty;
pub mod embedding;
pub mod hasher;
pub mod parity;
pub mod scanner;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use dh_parser::{
    default_language_registry, extract_file_facts, pool::ParserPool, registry::LanguageRegistry,
    ExtractionContext,
};
use dh_storage::{
    GraphEdgeRepository, ChunkRepository, Database, FileRepository,
    IndexStateRepository, SymbolRepository,
};
use dh_types::{
    File, FileCandidate, FreshnessReason, FreshnessState, IndexRunStatus, IndexState, ParseStatus,
    WorkspaceId,
};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tracing::{info, warn};
use uuid::Uuid;
use indicatif::{ProgressBar, ProgressStyle};

use crate::dirty::{
    confirmed_delta, is_resolution_scope_path, ConfirmedDelta, DirtyPlannerInput,
    InvalidationLevel, PlannedFile,
};

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
    ) -> Result<ProcessOutcome> {
        let candidate = &planned.candidate;
        let now = now_unix_ms();
        let run_id_marker = run_id_to_i64(run_id);
        let file_id = existing_file.map(|file| file.id).unwrap_or_else(|| {
            stable_id_i64(&format!(
                "file|{}|{}",
                candidate.workspace_id, candidate.rel_path
            ))
        });

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
                    existing_file.is_some(),
                )?;
                return Ok(ProcessOutcome {
                    warnings,
                    persisted_file: failed_file,
                    delta: ConfirmedDelta::default(),
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
                    existing_file.is_some(),
                )?;
                return Ok(ProcessOutcome {
                    warnings,
                    persisted_file: failed_file,
                    delta: ConfirmedDelta::default(),
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

        Ok(ProcessOutcome {
            warnings,
            persisted_file: file,
            delta,
        })
    }

    fn apply_confirmed_invalidation_expansion(
        &self,
        db: &Database,
        workspace_id: WorkspaceId,
        run_id: &str,
        scanned_candidates: &[FileCandidate],
        existing_files: &[File],
        changed_files_by_path: &HashMap<String, File>,
        delta_by_path: &HashMap<String, ConfirmedDelta>,
        deleted_rel_paths: &HashSet<String>,
        forced_dependent_roots: &HashSet<String>,
        initial_indexed_rel_paths: &HashSet<String>,
        refresh_queue: &mut VecDeque<PlannedFile>,
        queued_rel_paths: &mut HashSet<String>,
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
            .map(|candidate| (candidate.rel_path.clone(), candidate))
            .collect::<HashMap<_, _>>();

        let existing_by_path = existing_files
            .iter()
            .map(|file| (file.rel_path.clone(), file))
            .collect::<HashMap<_, _>>();

        let mut public_api_roots = HashSet::new();
        let mut structural_roots = HashSet::new();
        let mut resolution_scope_roots = HashSet::new();

        for (rel_path, delta) in delta_by_path {
            if delta.public_api_changed {
                public_api_roots.insert(rel_path.clone());
            }
            if delta.structure_changed {
                structural_roots.insert(rel_path.clone());
            }
            if is_resolution_scope_path(rel_path) {
                resolution_scope_roots.insert(rel_path.clone());
            }
        }

        for rel_path in changed_files_by_path.keys() {
            if is_resolution_scope_path(rel_path) {
                resolution_scope_roots.insert(rel_path.clone());
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

        // Only embed chunks without a stored vector for this model.
        let existing_vectors: std::collections::HashSet<_> = db
            .load_embeddings_for_model(&model)?
            .into_iter()
            .map(|r| r.chunk_id)
            .collect();

        let pending: Vec<_> = chunks
            .iter()
            .filter(|c| !existing_vectors.contains(&c.id))
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

        let workspace_root = workspace_root.canonicalize().with_context(|| {
            format!("canonicalize workspace root: {}", workspace_root.display())
        })?;

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

            let dirty_set = dirty::build_dirty_set(DirtyPlannerInput {
                scanned: &candidates,
                content_hashes: &content_hashes,
                existing_files: &existing_files,
                force_full: req.force_full,
                expand_dependents: false,
                touched_paths: None,
            });
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

            let mut counters = FreshnessCounters::default();
            let mut reindexed_files = 0_u64;
            let mut indexed_rel_paths = HashSet::new();
            let mut changed_files_by_path = HashMap::new();
            let mut confirmed_delta_by_path = HashMap::new();
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
                let Some(content_hash) = content_hashes.get(&planned.candidate.rel_path) else {
                    continue;
                };

                let existing = existing_by_path
                    .get(planned.candidate.rel_path.as_str())
                    .copied();
                let mut outcome = self.process_and_write_file(
                    &db,
                    planned,
                    content_hash,
                    existing,
                    &run_id,
                    &registry,
                    &mut parser_pool,
                )?;
                warnings.append(&mut outcome.warnings);
                counters.register(outcome.persisted_file.freshness_state);
                if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                    fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
                }
                changed_files_by_path
                    .insert(planned.candidate.rel_path.clone(), outcome.persisted_file);
                confirmed_delta_by_path.insert(planned.candidate.rel_path.clone(), outcome.delta);
                indexed_rel_paths.insert(planned.candidate.rel_path.clone());
                reindexed_files += 1;
                pb.inc(1);
            }
            pb.finish_and_clear();


            let initial_indexed_rel_paths = indexed_rel_paths.clone();

            for candidate in hash_failed_candidates {
                if indexed_rel_paths.contains(&candidate.rel_path) {
                    continue;
                }
                let Some(existing) = existing_by_path.get(candidate.rel_path.as_str()).copied()
                else {
                    continue;
                };

                let parse_error = hash_failures
                    .get(&candidate.rel_path)
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
                fatal_invalidation_roots.insert(candidate.rel_path.clone());
                indexed_rel_paths.insert(candidate.rel_path.clone());
                reindexed_files += 1;
            }

            let deleted_rel_paths = dirty_set
                .to_delete
                .iter()
                .filter_map(|file_id| {
                    existing_files
                        .iter()
                        .find(|file| file.id == *file_id)
                        .map(|file| file.rel_path.clone())
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
                if indexed_rel_paths.contains(&planned.candidate.rel_path) {
                    continue;
                }

                let Some(content_hash) = content_hashes.get(&planned.candidate.rel_path) else {
                    if let Some(existing) = existing_by_path
                        .get(planned.candidate.rel_path.as_str())
                        .copied()
                    {
                        let parse_error = hash_failures
                            .get(&planned.candidate.rel_path)
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
                        fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
                        indexed_rel_paths.insert(planned.candidate.rel_path.clone());
                        reindexed_files += 1;
                    }
                    continue;
                };

                let existing = existing_by_path
                    .get(planned.candidate.rel_path.as_str())
                    .copied();
                let mut outcome = self.process_and_write_file(
                    &db,
                    &planned,
                    content_hash,
                    existing,
                    &run_id,
                    &registry,
                    &mut parser_pool,
                )?;
                warnings.append(&mut outcome.warnings);
                counters.register(outcome.persisted_file.freshness_state);
                if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                    fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
                }
                changed_files_by_path
                    .insert(planned.candidate.rel_path.clone(), outcome.persisted_file);
                confirmed_delta_by_path.insert(planned.candidate.rel_path.clone(), outcome.delta);
                indexed_rel_paths.insert(planned.candidate.rel_path.clone());
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
                refreshed_current_files: counters.refreshed_current_files,
                retained_current_files: counters.retained_current_files,
                degraded_partial_files: counters.degraded_partial_files,
                not_current_files: counters.not_current_files,
                deleted_paths: counters.deleted_paths,
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

        let scan_config = scanner::ScanConfig {
            workspace_id,
            root_id: 1,
            package_id: None,
        };

        let candidates = scanner::scan_workspace(&workspace_root, &scan_config)?;
        let hasher::HashCandidatesResult {
            hashes: content_hashes,
            hash_failures,
            mut warnings,
        } = hasher::hash_candidates(&candidates);
        let existing_files = db.list_files_by_workspace(workspace_id)?;

        let touched_paths = req
            .paths
            .iter()
            .map(|path| {
                if path.is_absolute() {
                    let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
                    canonical_path
                        .strip_prefix(&workspace_root)
                        .map(normalize_workspace_rel_path)
                        .or_else(|_| {
                            path.strip_prefix(&workspace_root)
                                .map(normalize_workspace_rel_path)
                        })
                        .unwrap_or_else(|_| normalize_workspace_rel_path(&canonical_path))
                } else {
                    normalize_workspace_rel_path(path)
                }
            })
            .collect::<Vec<_>>();
        let touched_path_set = touched_paths.iter().cloned().collect::<HashSet<_>>();

        let dirty_set = dirty::build_dirty_set(DirtyPlannerInput {
            scanned: &candidates,
            content_hashes: &content_hashes,
            existing_files: &existing_files,
            force_full: false,
            expand_dependents: req.expand_dependents,
            touched_paths: Some(&touched_paths),
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
        let existing_by_path = existing_files
            .iter()
            .map(|file| (file.rel_path.clone(), file))
            .collect::<HashMap<_, _>>();
        let existing_by_id = existing_files
            .iter()
            .map(|file| (file.id, file))
            .collect::<HashMap<_, _>>();

        let mut counters = FreshnessCounters::default();
        let mut reindexed_files = 0_u64;
        let mut indexed_rel_paths = HashSet::new();
        let mut changed_files_by_path = HashMap::new();
        let mut confirmed_delta_by_path = HashMap::new();
        let mut fatal_invalidation_roots = HashSet::new();
        let mut invalidation_refresh_queue = VecDeque::new();
        let mut queued_rel_paths = HashSet::new();

        for touched_rel_path in &touched_path_set {
            if !hash_failures.contains_key(touched_rel_path)
                || indexed_rel_paths.contains(touched_rel_path)
            {
                continue;
            }

            let Some(existing) = existing_by_path.get(touched_rel_path).copied() else {
                continue;
            };

            let parse_error = hash_failures
                .get(touched_rel_path)
                .cloned()
                .unwrap_or_else(|| format!("failed to read file for hashing: {touched_rel_path}"));

            if let Some(candidate) = candidates
                .iter()
                .find(|candidate| candidate.rel_path == *touched_rel_path)
            {
                warnings.push(format!(
                    "marking file as failed after hash read error: {}",
                    touched_rel_path
                ));
                mark_hash_read_failure(&db, existing, candidate, parse_error, &run_id)?;
                counters.register(FreshnessState::NotCurrent);
                fatal_invalidation_roots.insert(touched_rel_path.clone());
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
                fatal_invalidation_roots.insert(touched_rel_path.clone());
            }

            indexed_rel_paths.insert(touched_rel_path.clone());
            reindexed_files = reindexed_files.saturating_add(1);
        }

        for planned in &dirty_set.to_index {
            let Some(content_hash) = content_hashes.get(&planned.candidate.rel_path) else {
                continue;
            };

            let existing = existing_by_path
                .get(planned.candidate.rel_path.as_str())
                .copied();
            let mut outcome = self.process_and_write_file(
                &db,
                planned,
                content_hash,
                existing,
                &run_id,
                &registry,
                &mut parser_pool,
            )?;
            warnings.append(&mut outcome.warnings);
            counters.register(outcome.persisted_file.freshness_state);
            if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
            }
            changed_files_by_path
                .insert(planned.candidate.rel_path.clone(), outcome.persisted_file);
            confirmed_delta_by_path.insert(planned.candidate.rel_path.clone(), outcome.delta);
            indexed_rel_paths.insert(planned.candidate.rel_path.clone());
            reindexed_files = reindexed_files.saturating_add(1);
        }

        let initial_indexed_rel_paths = indexed_rel_paths.clone();

        for planned in &dirty_set.to_index {
            if indexed_rel_paths.contains(&planned.candidate.rel_path)
                || !hash_failures.contains_key(&planned.candidate.rel_path)
            {
                continue;
            }
            let Some(existing) = existing_by_path
                .get(planned.candidate.rel_path.as_str())
                .copied()
            else {
                continue;
            };

            let parse_error = hash_failures
                .get(&planned.candidate.rel_path)
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
            fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
            indexed_rel_paths.insert(planned.candidate.rel_path.clone());
            reindexed_files = reindexed_files.saturating_add(1);
        }

        let deleted_rel_paths = dirty_set
            .to_delete
            .iter()
            .filter_map(|file_id| {
                existing_files
                    .iter()
                    .find(|file| file.id == *file_id)
                    .map(|file| file.rel_path.clone())
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
            if indexed_rel_paths.contains(&planned.candidate.rel_path) {
                continue;
            }

            let Some(content_hash) = content_hashes.get(&planned.candidate.rel_path) else {
                if let Some(existing) = existing_by_path
                    .get(planned.candidate.rel_path.as_str())
                    .copied()
                {
                    let parse_error = hash_failures
                        .get(&planned.candidate.rel_path)
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
                    fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
                    indexed_rel_paths.insert(planned.candidate.rel_path.clone());
                    reindexed_files = reindexed_files.saturating_add(1);
                }
                continue;
            };

            let existing = existing_by_path
                .get(planned.candidate.rel_path.as_str())
                .copied();
            let mut outcome = self.process_and_write_file(
                &db,
                &planned,
                content_hash,
                existing,
                &run_id,
                &registry,
                &mut parser_pool,
            )?;
            warnings.append(&mut outcome.warnings);
            counters.register(outcome.persisted_file.freshness_state);
            if is_fatal_failure_invalidation_root(&outcome.persisted_file) {
                fatal_invalidation_roots.insert(planned.candidate.rel_path.clone());
            }
            changed_files_by_path
                .insert(planned.candidate.rel_path.clone(), outcome.persisted_file);
            confirmed_delta_by_path.insert(planned.candidate.rel_path.clone(), outcome.delta);
            indexed_rel_paths.insert(planned.candidate.rel_path.clone());
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
        })
    }

    fn invalidate_paths(&self, workspace_id: WorkspaceId, paths: Vec<PathBuf>) -> Result<()> {
        let db = self.open_db()?;
        let root = workspace_root_for(&db, workspace_id)?;

        for path in paths {
            let rel_path = if path.is_absolute() {
                let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
                canonical_path
                    .strip_prefix(&root)
                    .map(normalize_path)
                    .or_else(|_| path.strip_prefix(&root).map(normalize_path))
                    .unwrap_or_else(|_| normalize_path(&canonical_path))
            } else {
                normalize_path(&path)
            };

            let Some(mut file) = db.get_file_by_path(workspace_id, &rel_path)? else {
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
            write_file_atomically(&db, &file, &[], &[], &[], &[], &[], true)?;
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
    scanned_by_path: &HashMap<String, &FileCandidate>,
    rel_path: &str,
    level: InvalidationLevel,
    reason: &str,
    triggered_by: &str,
    initial_indexed_rel_paths: &HashSet<String>,
    queued_rel_paths: &mut HashSet<String>,
    refresh_queue: &mut VecDeque<PlannedFile>,
) -> bool {
    if initial_indexed_rel_paths.contains(rel_path) || queued_rel_paths.contains(rel_path) {
        return false;
    }

    let Some(candidate) = scanned_by_path.get(rel_path) else {
        return false;
    };

    queued_rel_paths.insert(rel_path.to_string());
    refresh_queue.push_back(PlannedFile {
        candidate: (*candidate).clone(),
        level,
        reason: reason.to_string(),
        triggered_by: triggered_by.to_string(),
    });
    true
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

    write_file_atomically(db, &failed_file, &[], &[], &[], &[], &[], true)
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

    write_file_atomically(db, &invalidated, &[], &[], &[], &[], &[], true)?;
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
    scanned_by_path: &HashMap<String, &FileCandidate>,
    existing_by_path: &HashMap<String, &File>,
    resolution_scope_roots: &HashSet<String>,
    initial_indexed_rel_paths: &HashSet<String>,
    refresh_queue: &mut VecDeque<PlannedFile>,
    queued_rel_paths: &mut HashSet<String>,
    counters: &mut FreshnessCounters,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if resolution_scope_roots.is_empty() {
        return Ok(());
    }

    warnings.push(format!(
        "resolution-basis change detected; widening invalidation for workspace {workspace_id}"
    ));

    for (rel_path, existing) in existing_by_path {
        if existing.deleted_at_unix_ms.is_some() || initial_indexed_rel_paths.contains(rel_path) {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            rel_path,
            InvalidationLevel::ResolutionScope,
            "resolution basis changed",
            "resolution_scope",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if !scanned_by_path.contains_key(rel_path) {
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
    scanned_by_path: &HashMap<String, &FileCandidate>,
    existing_by_path: &HashMap<String, &File>,
    public_api_roots: &HashSet<String>,
    deleted_rel_paths: &HashSet<String>,
    forced_dependent_roots: &HashSet<String>,
    initial_indexed_rel_paths: &HashSet<String>,
    refresh_queue: &mut VecDeque<PlannedFile>,
    queued_rel_paths: &mut HashSet<String>,
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
    for rel_path in &root_rel_paths {
        if let Some(file) = existing_by_path.get(rel_path) {
            if visited_file_ids.insert(file.id) {
                queue.push_back(file.id);
            }
        }
    }

    for rel_path in &root_rel_paths {
        if initial_indexed_rel_paths.contains(rel_path) {
            continue;
        }
        if !queue_candidate_for_refresh(
            scanned_by_path,
            rel_path,
            InvalidationLevel::Dependent,
            "dependent expansion requested from path-scoped run",
            "dependent_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(rel_path) {
                if !scanned_by_path.contains_key(rel_path) {
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
        for reverse in db.find_incoming_edges(workspace_id, "file", current_file_id as i64, 200_000)? {
            if reverse.kind != dh_types::EdgeKind::Imports { continue; }
            let source_file_id = match reverse.from {
                dh_types::NodeId::File(id) => id,
                _ => continue,
            };
            if let Some(importer) = existing_by_id.get(&source_file_id) {
                if importer.deleted_at_unix_ms.is_some() {
                    continue;
                }

                if dependent_rel_paths.insert(importer.rel_path.clone())
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
        if root_rel_paths.contains(&importer.rel_path) {
            continue;
        }

        let imports = db.find_edges_by_file(importer.id)?;
        if imports.iter().filter(|e| e.kind == dh_types::EdgeKind::Imports).any(|import| {
            root_rel_paths.iter().any(|root_rel_path| {
                import_specifier_matches_rel_path(&import.reason, root_rel_path)
            })
        }) {
            dependent_rel_paths.insert(importer.rel_path.clone());
        }
    }

    for dependent_rel_path in dependent_rel_paths {
        if root_rel_paths.contains(&dependent_rel_path)
            || initial_indexed_rel_paths.contains(&dependent_rel_path)
        {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            &dependent_rel_path,
            InvalidationLevel::Dependent,
            "dependent invalidated by upstream outward contract change",
            "dependent_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(&dependent_rel_path) {
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
    scanned_by_path: &HashMap<String, &FileCandidate>,
    existing_by_path: &HashMap<String, &File>,
    structural_roots: &HashSet<String>,
    initial_indexed_rel_paths: &HashSet<String>,
    refresh_queue: &mut VecDeque<PlannedFile>,
    queued_rel_paths: &mut HashSet<String>,
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

    for rel_path in structural_roots {
        if initial_indexed_rel_paths.contains(rel_path) {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            rel_path,
            InvalidationLevel::StructuralLocal,
            "structural-local invalidation due to confirmed structure hash change",
            "structural_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(rel_path) {
                if !scanned_by_path.contains_key(rel_path) {
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

    for root_rel_path in structural_roots {
        let Some(root_file) = existing_by_path.get(root_rel_path) else {
            continue;
        };

        for reverse in db.find_incoming_edges(workspace_id, "file", root_file.id as i64, 200_000)? {
            if reverse.kind != dh_types::EdgeKind::Imports { continue; }
            let source_file_id = match reverse.from {
                dh_types::NodeId::File(id) => id,
                _ => continue,
            };
            if let Some(importer) = existing_by_id.get(&source_file_id) {
                if importer.deleted_at_unix_ms.is_none() {
                    direct_structural_rel_paths.insert(importer.rel_path.clone());
                }
            }
        }
    }

    warnings.push(format!(
        "structural invalidation discovered {} directly impacted files",
        direct_structural_rel_paths.len()
    ));

    for rel_path in direct_structural_rel_paths {
        if structural_roots.contains(&rel_path) || initial_indexed_rel_paths.contains(&rel_path) {
            continue;
        }

        if !queue_candidate_for_refresh(
            scanned_by_path,
            &rel_path,
            InvalidationLevel::StructuralLocal,
            "structural-local invalidation due to confirmed structure hash change",
            "structural_invalidation",
            initial_indexed_rel_paths,
            queued_rel_paths,
            refresh_queue,
        ) {
            if let Some(existing) = existing_by_path.get(&rel_path) {
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
    db.connection()
        .execute_batch("BEGIN IMMEDIATE TRANSACTION")?;

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

        let mut graph_edges = Vec::new();
        
        for import in imports {
            graph_edges.push(dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Imports,
                from: dh_types::NodeId::File(import.source_file_id),
                to: if let Some(sym) = import.resolved_symbol_id {
                    dh_types::NodeId::Symbol(sym)
                } else if let Some(file_id) = import.resolved_file_id {
                    dh_types::NodeId::File(file_id)
                } else {
                    dh_types::NodeId::Symbol(0)
                },
                resolution: if import.resolved_file_id.is_some() || import.resolved_symbol_id.is_some() {
                    dh_types::EdgeResolution::Resolved
                } else {
                    dh_types::EdgeResolution::Unresolved
                },
                confidence: dh_types::EdgeConfidence::BestEffort,
                span: Some(import.span.clone()),
                reason: import.raw_specifier.clone(),
            });
        }
        
        for edge in call_edges {
            graph_edges.push(dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Calls,
                from: edge.caller_symbol_id.map(dh_types::NodeId::Symbol).unwrap_or(dh_types::NodeId::File(edge.source_file_id)),
                to: if let Some(callee) = edge.callee_symbol_id {
                    dh_types::NodeId::Symbol(callee)
                } else {
                    dh_types::NodeId::Symbol(0)
                },
                resolution: if edge.resolved {
                    dh_types::EdgeResolution::Resolved
                } else {
                    dh_types::EdgeResolution::Unresolved
                },
                confidence: dh_types::EdgeConfidence::BestEffort,
                span: Some(edge.span.clone()),
                reason: edge.callee_qualified_name.clone().unwrap_or_default(),
            });
        }
        
        for ref_edge in references {
            graph_edges.push(dh_types::GraphEdge {
                kind: dh_types::EdgeKind::References,
                from: ref_edge.source_symbol_id.map(dh_types::NodeId::Symbol).unwrap_or(dh_types::NodeId::File(ref_edge.source_file_id)),
                to: if let Some(target) = ref_edge.target_symbol_id {
                    dh_types::NodeId::Symbol(target)
                } else {
                    dh_types::NodeId::Symbol(0)
                },
                resolution: if ref_edge.resolved {
                    dh_types::EdgeResolution::Resolved
                } else {
                    dh_types::EdgeResolution::Unresolved
                },
                confidence: dh_types::EdgeConfidence::BestEffort,
                span: Some(ref_edge.span.clone()),
                reason: ref_edge.target_name.clone(),
            });
        }
        
        if !graph_edges.is_empty() {
            db.insert_edges(&graph_edges, file.id)
                .with_context(|| format!("insert graph edges for {}", file.rel_path))?;
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
        db.delete_file_facts(file.id)?;

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
    indexed_rel_paths: &std::collections::HashSet<String>,
    run_id: &str,
    counters: &mut FreshnessCounters,
) -> Result<()> {
    let run_id_marker = run_id_to_i64(run_id);
    let files = db.list_files_by_workspace(workspace_id)?;
    for mut file in files {
        if file.deleted_at_unix_ms.is_some() {
            continue;
        }
        if indexed_rel_paths.contains(&file.rel_path) {
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
