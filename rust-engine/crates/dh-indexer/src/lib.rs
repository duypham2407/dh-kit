//! Indexer crate for workspace scanning and incremental indexing orchestration.

use dh_types::{IndexState, WorkspaceId};
use std::path::PathBuf;

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
