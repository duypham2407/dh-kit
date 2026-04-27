//! SQLite storage layer for DH index facts and runtime state.

use anyhow::{Context, Result};
use dh_types::{
    AgentRole, Chunk, ChunkId, EmbeddingRecord, EmbeddingStatus, ExecutionEnvelope, File, FileId,
    FreshnessReason, FreshnessState, GateStatus, HookDecision, HookInvocationLog, HookName,
    IndexRunStatus, IndexState, LanguageId, ParseStatus, SemanticMode, SessionState,
    SessionStatus, Span, StageStatus, Symbol, SymbolId, SymbolKind, ToolEnforcementLevel,
    Visibility, WorkflowLane, WorkflowStageState, WorkspaceId,
};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use thiserror::Error;
use tracing::info;

#[allow(dead_code)]
const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("entity not found: {0}")]
    NotFound(String),
    #[error("invalid enum value for {field}: {value}")]
    InvalidEnumValue { field: &'static str, value: String },
}

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct FreshnessStateCounts {
    pub refreshed_current: u64,
    pub retained_current: u64,
    pub degraded_partial: u64,
    pub not_current: u64,
}

impl Database {
    pub fn new(path: impl AsRef<std::path::Path>) -> Result<Self> {
        let conn = Connection::open(path).context("open sqlite database")?;
        Ok(Self { conn })
    }

    pub fn initialize(&self) -> Result<()> {
        self.apply_pragmas()?;
        self.create_schema()?;
        self.ensure_files_freshness_columns()?;
        self.create_indexes()?;
        self.create_fts()?;
        Ok(())
    }

    pub fn begin_transaction(&mut self) -> Result<Transaction<'_>> {
        self.conn.transaction().context("begin sqlite transaction")
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    fn apply_pragmas(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA temp_store = MEMORY;
            PRAGMA mmap_size = 268435456;
            PRAGMA busy_timeout = 5000;
            ",
        )?;
        Ok(())
    }

    fn create_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS workspaces (
              id INTEGER PRIMARY KEY,
              root_path TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS roots (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              abs_path TEXT NOT NULL,
              root_kind TEXT NOT NULL,
              marker_path TEXT,
              UNIQUE(workspace_id, abs_path)
            );

            CREATE TABLE IF NOT EXISTS packages (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
              rel_path TEXT NOT NULL,
              package_name TEXT,
              ecosystem TEXT,
              resolution_context_json TEXT,
              UNIQUE(workspace_id, root_id, rel_path)
            );

            CREATE TABLE IF NOT EXISTS files (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
              package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
              rel_path TEXT NOT NULL,
              language TEXT NOT NULL,
              size_bytes INTEGER NOT NULL,
              mtime_unix_ms INTEGER NOT NULL,
              content_hash TEXT NOT NULL,
              structure_hash TEXT,
              public_api_hash TEXT,
              parse_status TEXT NOT NULL,
              parse_error TEXT,
              symbol_count INTEGER NOT NULL DEFAULT 0,
              chunk_count INTEGER NOT NULL DEFAULT 0,
              is_barrel INTEGER NOT NULL DEFAULT 0,
              last_indexed_at_unix_ms INTEGER,
              deleted_at_unix_ms INTEGER,
              freshness_state TEXT NOT NULL DEFAULT 'not_current',
              freshness_reason TEXT,
              last_freshness_run_id TEXT,
              UNIQUE(workspace_id, rel_path)
            );

            CREATE TABLE IF NOT EXISTS symbols (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
              parent_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
              kind TEXT NOT NULL,
              name TEXT NOT NULL,
              qualified_name TEXT NOT NULL,
              signature TEXT,
              detail TEXT,
              visibility TEXT NOT NULL,
              exported INTEGER NOT NULL DEFAULT 0,
              async_flag INTEGER NOT NULL DEFAULT 0,
              static_flag INTEGER NOT NULL DEFAULT 0,
              start_byte INTEGER NOT NULL,
              end_byte INTEGER NOT NULL,
              start_line INTEGER NOT NULL,
              start_column INTEGER NOT NULL,
              end_line INTEGER NOT NULL,
              end_column INTEGER NOT NULL,
              symbol_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS graph_edges (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
              kind TEXT NOT NULL,
              from_node_kind TEXT NOT NULL,
              from_node_id INTEGER NOT NULL,
              to_node_kind TEXT NOT NULL,
              to_node_id INTEGER,
              resolution TEXT NOT NULL,
              confidence TEXT NOT NULL,
              start_line INTEGER,
              start_column INTEGER,
              end_line INTEGER,
              end_column INTEGER,
              reason TEXT NOT NULL,
              payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS chunks (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
              symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              parent_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              kind TEXT NOT NULL,
              language TEXT NOT NULL,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              token_estimate INTEGER NOT NULL,
              start_line INTEGER NOT NULL,
              start_column INTEGER NOT NULL,
              end_line INTEGER NOT NULL,
              end_column INTEGER NOT NULL,
              prev_chunk_id INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
              next_chunk_id INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
              embedding_status TEXT NOT NULL DEFAULT 'NotQueued'
            );

            CREATE TABLE IF NOT EXISTS embeddings (
              chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
              model TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              content_hash TEXT NOT NULL,
              vector BLOB NOT NULL,
              created_at_unix_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS embedding_jobs (
              id INTEGER PRIMARY KEY,
              chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
              model TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              status TEXT NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              created_at_unix_ms INTEGER NOT NULL,
              updated_at_unix_ms INTEGER NOT NULL,
              UNIQUE(chunk_id, model, content_hash)
            );

            CREATE TABLE IF NOT EXISTS index_state (
              workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
              schema_version INTEGER NOT NULL,
              index_version INTEGER NOT NULL,
              status TEXT NOT NULL,
              active_run_id TEXT,
              total_files INTEGER NOT NULL DEFAULT 0,
              indexed_files INTEGER NOT NULL DEFAULT 0,
              dirty_files INTEGER NOT NULL DEFAULT 0,
              deleted_files INTEGER NOT NULL DEFAULT 0,
              last_scan_started_at_unix_ms INTEGER,
              last_scan_finished_at_unix_ms INTEGER,
              last_successful_index_at_unix_ms INTEGER,
              queued_embeddings INTEGER NOT NULL DEFAULT 0,
              last_error TEXT
            );

            CREATE TABLE IF NOT EXISTS index_runs (
              run_id TEXT PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              status TEXT NOT NULL,
              stage TEXT NOT NULL,
              started_at_unix_ms INTEGER NOT NULL,
              heartbeat_at_unix_ms INTEGER NOT NULL,
              finished_at_unix_ms INTEGER,
              message TEXT
            );

            -- Runtime State: Sessions
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              repo_root TEXT NOT NULL,
              lane TEXT NOT NULL CHECK(lane IN ('quick','delivery','migration')),
              lane_locked INTEGER NOT NULL DEFAULT 1,
              current_stage TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              semantic_mode TEXT NOT NULL DEFAULT 'always',
              tool_enforcement_level TEXT NOT NULL DEFAULT 'very_hard',
              created_at_unix_ms INTEGER NOT NULL,
              updated_at_unix_ms INTEGER NOT NULL
            );

            -- Runtime State: Workflow Stage Transitions
            CREATE TABLE IF NOT EXISTS workflow_stages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
              lane TEXT NOT NULL,
              stage TEXT NOT NULL,
              stage_status TEXT NOT NULL DEFAULT 'pending',
              previous_stage TEXT,
              gate_status TEXT NOT NULL DEFAULT 'pending',
              updated_at_unix_ms INTEGER NOT NULL
            );

            -- Runtime State: Hook Invocation Audit Logs
            CREATE TABLE IF NOT EXISTS hook_invocation_logs (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              envelope_id TEXT,
              hook_name TEXT NOT NULL,
              input_json TEXT NOT NULL,
              output_json TEXT NOT NULL,
              decision TEXT NOT NULL CHECK(decision IN ('allow','block','modify','passthrough')),
              reason TEXT NOT NULL,
              duration_ms INTEGER NOT NULL,
              created_at_unix_ms INTEGER NOT NULL
            );

            -- Runtime State: Execution Envelopes
            CREATE TABLE IF NOT EXISTS execution_envelopes (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
              lane TEXT NOT NULL,
              role TEXT NOT NULL,
              agent_id TEXT NOT NULL,
              stage TEXT NOT NULL,
              work_item_id TEXT,
              resolved_model_json TEXT,
              active_skills_json TEXT NOT NULL DEFAULT '[]',
              active_mcps_json TEXT NOT NULL DEFAULT '[]',
              created_at_unix_ms INTEGER NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    fn create_indexes(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_files_workspace_language ON files(workspace_id, language);
            CREATE INDEX IF NOT EXISTS idx_files_workspace_parse_status ON files(workspace_id, parse_status);
            CREATE INDEX IF NOT EXISTS idx_files_workspace_public_api_hash ON files(workspace_id, public_api_hash);

            CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
            CREATE INDEX IF NOT EXISTS idx_symbols_workspace_name ON symbols(workspace_id, name);
            CREATE INDEX IF NOT EXISTS idx_symbols_workspace_qname ON symbols(workspace_id, qualified_name);
            CREATE INDEX IF NOT EXISTS idx_symbols_parent ON symbols(parent_symbol_id);
            CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(workspace_id, exported, kind);

            CREATE INDEX IF NOT EXISTS idx_graph_edges_source_file ON graph_edges(source_file_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_from_node ON graph_edges(from_node_kind, from_node_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_to_node ON graph_edges(to_node_kind, to_node_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_kind ON graph_edges(kind);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_workspace_from ON graph_edges(workspace_id, from_node_kind, from_node_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_workspace_to ON graph_edges(workspace_id, to_node_kind, to_node_id);

            CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_symbol ON chunks(symbol_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks(content_hash);
            CREATE INDEX IF NOT EXISTS idx_chunks_workspace_kind ON chunks(workspace_id, kind);

            CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON embedding_jobs(status, updated_at_unix_ms);
            CREATE INDEX IF NOT EXISTS idx_index_runs_workspace_status ON index_runs(workspace_id, status);

            CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_root);
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
            CREATE INDEX IF NOT EXISTS idx_workflow_stages_session ON workflow_stages(session_id);
            CREATE INDEX IF NOT EXISTS idx_hook_logs_session ON hook_invocation_logs(session_id);
            CREATE INDEX IF NOT EXISTS idx_hook_logs_hook ON hook_invocation_logs(hook_name);
            CREATE INDEX IF NOT EXISTS idx_envelopes_session ON execution_envelopes(session_id);
            ",
        )?;
        Ok(())
    }

    fn create_fts(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
              title,
              content,
              rel_path UNINDEXED,
              language UNINDEXED,
              content=''
            );
            ",
        )?;
        Ok(())
    }

    fn ensure_files_freshness_columns(&self) -> Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(files)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let mut columns = std::collections::HashSet::new();
        for row in rows {
            columns.insert(row?);
        }

        if !columns.contains("freshness_state") {
            self.conn.execute(
                "ALTER TABLE files ADD COLUMN freshness_state TEXT NOT NULL DEFAULT 'not_current'",
                [],
            )?;
        }
        if !columns.contains("freshness_reason") {
            self.conn
                .execute("ALTER TABLE files ADD COLUMN freshness_reason TEXT", [])?;
        }
        if !columns.contains("last_freshness_run_id") {
            self.conn.execute(
                "ALTER TABLE files ADD COLUMN last_freshness_run_id TEXT",
                [],
            )?;
        }

        Ok(())
    }
}

pub trait FileRepository {
    fn upsert_file(&self, file: &File) -> Result<FileId>;
    fn delete_file_facts(&self, file_id: FileId) -> Result<()>;
    fn get_file_by_path(&self, workspace_id: WorkspaceId, rel_path: &str) -> Result<Option<File>>;
    fn list_files_by_workspace(&self, workspace_id: WorkspaceId) -> Result<Vec<File>>;
}

pub trait SymbolRepository {
    fn insert_symbols(&self, symbols: &[Symbol]) -> Result<()>;
    fn find_symbol_by_name(&self, workspace_id: WorkspaceId, name: &str) -> Result<Vec<Symbol>>;
    fn find_symbols_by_file(&self, file_id: FileId) -> Result<Vec<Symbol>>;
    fn find_symbols_by_workspace(&self, workspace_id: WorkspaceId) -> Result<Vec<Symbol>>;
}

pub trait GraphEdgeRepository {
    fn insert_edges(&self, edges: &[dh_types::GraphEdge], source_file_id: FileId) -> Result<()>;
    fn find_edges_by_file(&self, file_id: FileId) -> Result<Vec<dh_types::GraphEdge>>;
    fn find_outgoing_edges(&self, workspace_id: WorkspaceId, from_kind: &str, from_id: i64, node_limit: usize) -> Result<Vec<dh_types::GraphEdge>>;
    fn find_incoming_edges(&self, workspace_id: WorkspaceId, to_kind: &str, to_id: i64, node_limit: usize) -> Result<Vec<dh_types::GraphEdge>>;
}


pub trait ChunkRepository {
    fn insert_chunks(&self, chunks: &[Chunk]) -> Result<()>;
    fn find_chunks_by_file(&self, file_id: FileId) -> Result<Vec<Chunk>>;
    fn find_chunks_by_workspace(&self, workspace_id: WorkspaceId) -> Result<Vec<Chunk>>;
    fn search_chunks_fts(&self, workspace_id: WorkspaceId, query: &str, limit: usize) -> Result<Vec<(Chunk, f32)>>;
}

pub trait GraphRepository {
    fn find_symbol_definitions(
        &self,
        workspace_id: WorkspaceId,
        symbol_name: &str,
        limit: usize,
    ) -> Result<Vec<Symbol>>;
    fn find_symbol_by_id(
        &self,
        workspace_id: WorkspaceId,
        symbol_id: SymbolId,
    ) -> Result<Option<Symbol>>;
    fn find_file_by_id(&self, workspace_id: WorkspaceId, file_id: FileId) -> Result<Option<File>>;
    fn find_chunk_by_id(
        &self,
        workspace_id: WorkspaceId,
        chunk_id: ChunkId,
    ) -> Result<Option<Chunk>>;
    fn bounded_file_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        file_id: FileId,
        hop_limit: u32,
        node_limit: usize,
    ) -> Result<Vec<FileId>>;
    fn bounded_symbol_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        symbol_id: SymbolId,
        hop_limit: u32,
        node_limit: usize,
    ) -> Result<Vec<SymbolId>>;
    fn cte_shortest_path(
        &self,
        workspace_id: WorkspaceId,
        from_kind: &str,
        from_id: i64,
        to_kind: &str,
        to_id: i64,
        max_hops: u32,
    ) -> Result<Option<Vec<dh_types::GraphEdge>>>;
    fn weighted_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed_kind: &str,
        seed_id: i64,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> Result<Vec<(dh_types::NodeId, u32)>>;
    fn directional_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed_kind: &str,
        seed_id: i64,
        direction: &str,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> Result<Vec<(dh_types::NodeId, u32)>>;
}

pub trait IndexStateRepository {
    fn get_state(&self, workspace_id: WorkspaceId) -> Result<Option<IndexState>>;
    fn freshness_state_counts(&self, workspace_id: WorkspaceId) -> Result<FreshnessStateCounts>;
    fn update_state(&self, state: &IndexState) -> Result<()>;
    fn upsert_run(
        &self,
        run_id: &str,
        workspace_id: WorkspaceId,
        status: IndexRunStatus,
        stage: &str,
        started_at_unix_ms: i64,
        heartbeat_at_unix_ms: i64,
        finished_at_unix_ms: Option<i64>,
        message: Option<&str>,
    ) -> Result<()>;
}

/// Trait for storing and retrieving embedding vectors.
pub trait EmbeddingRepository {
    /// Upsert a vector for a chunk. If a record already exists for the same
    /// (chunk_id, model, content_hash) triple the call is a no-op.
    fn upsert_embedding(
        &self,
        chunk_id: ChunkId,
        model: &str,
        dimensions: usize,
        content_hash: &str,
        vector: &[f32],
    ) -> Result<()>;

    /// Load all stored embeddings for a specific model. Used for in-process
    /// cosine similarity search in the query layer.
    fn load_embeddings_for_model(
        &self,
        model: &str,
    ) -> Result<Vec<EmbeddingRecord>>;

    /// Delete the embedding for a chunk (e.g. when the chunk is re-indexed).
    fn delete_embedding(&self, chunk_id: ChunkId) -> Result<()>;
}

impl EmbeddingRepository for Database {
    fn upsert_embedding(
        &self,
        chunk_id: ChunkId,
        model: &str,
        dimensions: usize,
        content_hash: &str,
        vector: &[f32],
    ) -> Result<()> {
        let blob: Vec<u8> = vector
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        self.conn.execute(
            "INSERT INTO embeddings (chunk_id, model, dimensions, content_hash, vector, created_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(chunk_id) DO UPDATE SET
               model = excluded.model,
               dimensions = excluded.dimensions,
               content_hash = excluded.content_hash,
               vector = excluded.vector,
               created_at_unix_ms = excluded.created_at_unix_ms",
            params![chunk_id, model, dimensions as i64, content_hash, blob, now],
        )?;
        Ok(())
    }

    fn load_embeddings_for_model(&self, model: &str) -> Result<Vec<EmbeddingRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT chunk_id, model, dimensions, content_hash, vector, created_at_unix_ms
             FROM embeddings WHERE model = ?1",
        )?;
        let records = stmt.query_map(params![model], |row| {
            let blob: Vec<u8> = row.get(4)?;
            Ok((row.get::<_, ChunkId>(0)?, row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?, row.get::<_, String>(3)?,
                blob, row.get::<_, i64>(5)?))
        })?
        .filter_map(|r| r.ok())
        .map(|(chunk_id, model, dimensions, content_hash, blob, created_at_unix_ms)| {
            let vector: Vec<f32> = blob
                .chunks_exact(4)
                .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
                .collect();
            EmbeddingRecord {
                chunk_id,
                model,
                dimensions: dimensions as usize,
                content_hash,
                vector,
                created_at_unix_ms,
            }
        })
        .collect();
        Ok(records)
    }

    fn delete_embedding(&self, chunk_id: ChunkId) -> Result<()> {
        self.conn.execute(
            "DELETE FROM embeddings WHERE chunk_id = ?1",
            params![chunk_id],
        )?;
        Ok(())
    }
}


impl FileRepository for Database {
    fn upsert_file(&self, file: &File) -> Result<FileId> {
        self.conn.execute(
            "
            INSERT INTO files (
              id, workspace_id, root_id, package_id, rel_path, language, size_bytes, mtime_unix_ms,
              content_hash, structure_hash, public_api_hash, parse_status, parse_error,
              symbol_count, chunk_count, is_barrel, last_indexed_at_unix_ms, deleted_at_unix_ms,
              freshness_state, freshness_reason, last_freshness_run_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
            ON CONFLICT(id) DO UPDATE SET
              workspace_id=excluded.workspace_id,
              root_id=excluded.root_id,
              package_id=excluded.package_id,
              rel_path=excluded.rel_path,
              language=excluded.language,
              size_bytes=excluded.size_bytes,
              mtime_unix_ms=excluded.mtime_unix_ms,
              content_hash=excluded.content_hash,
              structure_hash=excluded.structure_hash,
              public_api_hash=excluded.public_api_hash,
              parse_status=excluded.parse_status,
              parse_error=excluded.parse_error,
              symbol_count=excluded.symbol_count,
              chunk_count=excluded.chunk_count,
              is_barrel=excluded.is_barrel,
              last_indexed_at_unix_ms=excluded.last_indexed_at_unix_ms,
              deleted_at_unix_ms=excluded.deleted_at_unix_ms,
              freshness_state=excluded.freshness_state,
              freshness_reason=excluded.freshness_reason,
              last_freshness_run_id=excluded.last_freshness_run_id
            ",
            params![
                file.id,
                file.workspace_id,
                file.root_id,
                file.package_id,
                file.rel_path,
                language_to_str(file.language),
                file.size_bytes as i64,
                file.mtime_unix_ms,
                file.content_hash,
                file.structure_hash,
                file.public_api_hash,
                parse_status_to_str(file.parse_status),
                file.parse_error,
                file.symbol_count as i64,
                file.chunk_count as i64,
                bool_to_int(file.is_barrel),
                file.last_indexed_at_unix_ms,
                file.deleted_at_unix_ms,
                freshness_state_to_str(file.freshness_state),
                file.freshness_reason.map(freshness_reason_to_str),
                file.last_freshness_run_id,
            ],
        )?;
        Ok(file.id)
    }

    fn delete_file_facts(&self, file_id: FileId) -> Result<()> {
        self.conn
            .execute("DELETE FROM symbols WHERE file_id = ?1", params![file_id])?;
        self.conn.execute(
            "DELETE FROM graph_edges WHERE source_file_id = ?1",
            params![file_id],
        )?;

        let rel_path: Option<String> = self
            .conn
            .query_row(
                "SELECT rel_path FROM files WHERE id = ?1",
                params![file_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(path) = rel_path {
            self.conn
                .execute("DELETE FROM chunk_fts WHERE rel_path = ?1", params![path])?;
        }

        self.conn
            .execute("DELETE FROM chunks WHERE file_id = ?1", params![file_id])?;
        Ok(())
    }

    fn get_file_by_path(&self, workspace_id: WorkspaceId, rel_path: &str) -> Result<Option<File>> {
        self.conn
            .query_row(
                "
                SELECT id, workspace_id, root_id, package_id, rel_path, language, size_bytes,
                       mtime_unix_ms, content_hash, structure_hash, public_api_hash, parse_status,
                       parse_error, symbol_count, chunk_count, is_barrel,
                       last_indexed_at_unix_ms, deleted_at_unix_ms,
                       freshness_state, freshness_reason, last_freshness_run_id
                  FROM files
                 WHERE workspace_id = ?1 AND rel_path = ?2
                ",
                params![workspace_id, rel_path],
                map_file,
            )
            .optional()
            .map_err(Into::into)
    }

    fn list_files_by_workspace(&self, workspace_id: WorkspaceId) -> Result<Vec<File>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, root_id, package_id, rel_path, language, size_bytes,
                   mtime_unix_ms, content_hash, structure_hash, public_api_hash, parse_status,
                   parse_error, symbol_count, chunk_count, is_barrel,
                   last_indexed_at_unix_ms, deleted_at_unix_ms,
                   freshness_state, freshness_reason, last_freshness_run_id
              FROM files
             WHERE workspace_id = ?1
             ORDER BY rel_path ASC
            ",
        )?;
        let rows = stmt.query_map(params![workspace_id], map_file)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

impl SymbolRepository for Database {
    fn insert_symbols(&self, symbols: &[Symbol]) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "
            INSERT INTO symbols (
              id, workspace_id, file_id, parent_symbol_id, kind, name, qualified_name,
              signature, detail, visibility, exported, async_flag, static_flag,
              start_byte, end_byte, start_line, start_column, end_line, end_column, symbol_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
            ",
        )?;

        for symbol in symbols {
            stmt.execute(params![
                symbol.id,
                symbol.workspace_id,
                symbol.file_id,
                symbol.parent_symbol_id,
                symbol_kind_to_str(symbol.kind),
                symbol.name,
                symbol.qualified_name,
                symbol.signature,
                symbol.detail,
                visibility_to_str(symbol.visibility),
                bool_to_int(symbol.exported),
                bool_to_int(symbol.async_flag),
                bool_to_int(symbol.static_flag),
                symbol.span.start_byte as i64,
                symbol.span.end_byte as i64,
                symbol.span.start_line as i64,
                symbol.span.start_column as i64,
                symbol.span.end_line as i64,
                symbol.span.end_column as i64,
                symbol.symbol_hash,
            ])?;
        }

        Ok(())
    }

    fn find_symbol_by_name(&self, workspace_id: WorkspaceId, name: &str) -> Result<Vec<Symbol>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, file_id, parent_symbol_id, kind, name, qualified_name,
                   signature, detail, visibility, exported, async_flag, static_flag,
                   start_byte, end_byte, start_line, start_column, end_line, end_column, symbol_hash
              FROM symbols
             WHERE workspace_id = ?1 AND name = ?2
             ORDER BY id ASC
            ",
        )?;

        let rows = stmt.query_map(params![workspace_id, name], map_symbol)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn find_symbols_by_file(&self, file_id: FileId) -> Result<Vec<Symbol>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, file_id, parent_symbol_id, kind, name, qualified_name,
                   signature, detail, visibility, exported, async_flag, static_flag,
                   start_byte, end_byte, start_line, start_column, end_line, end_column, symbol_hash
              FROM symbols
             WHERE file_id = ?1
             ORDER BY start_byte ASC
            ",
        )?;

        let rows = stmt.query_map(params![file_id], map_symbol)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn find_symbols_by_workspace(&self, workspace_id: WorkspaceId) -> Result<Vec<Symbol>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, file_id, parent_symbol_id, kind, name, qualified_name,
                   signature, detail, visibility, exported, async_flag, static_flag,
                   start_byte, end_byte, start_line, start_column, end_line, end_column, symbol_hash
              FROM symbols
             WHERE workspace_id = ?1
             ORDER BY id ASC
            ",
        )?;

        let rows = stmt.query_map(params![workspace_id], map_symbol)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}


impl ChunkRepository for Database {
    fn insert_chunks(&self, chunks: &[Chunk]) -> Result<()> {
        let mut chunk_stmt = self.conn.prepare(
            "
            INSERT INTO chunks (
              id, workspace_id, file_id, symbol_id, parent_symbol_id, kind, language,
              title, content, content_hash, token_estimate, start_line, start_column,
              end_line, end_column, prev_chunk_id, next_chunk_id, embedding_status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
            ",
        )?;

        let mut fts_stmt = self.conn.prepare(
            "INSERT INTO chunk_fts(rowid, title, content, rel_path, language) VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;

        for chunk in chunks {
            chunk_stmt.execute(params![
                chunk.id,
                chunk.workspace_id,
                chunk.file_id,
                chunk.symbol_id,
                chunk.parent_symbol_id,
                chunk_kind_to_str(chunk.kind),
                language_to_str(chunk.language),
                chunk.title,
                chunk.content,
                chunk.content_hash,
                chunk.token_estimate as i64,
                chunk.span.start_line as i64,
                chunk.span.start_column as i64,
                chunk.span.end_line as i64,
                chunk.span.end_column as i64,
                chunk.prev_chunk_id,
                chunk.next_chunk_id,
                embedding_status_to_str(chunk.embedding_status),
            ])?;

            let rel_path: Option<String> = self
                .conn
                .query_row(
                    "SELECT rel_path FROM files WHERE id = ?1",
                    params![chunk.file_id],
                    |row| row.get(0),
                )
                .optional()?;

            fts_stmt.execute(params![
                chunk.id,
                chunk.title,
                chunk.content,
                rel_path.unwrap_or_default(),
                language_to_str(chunk.language),
            ])?;
        }

        Ok(())
    }

    fn find_chunks_by_file(&self, file_id: FileId) -> Result<Vec<Chunk>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, file_id, symbol_id, parent_symbol_id, kind, language,
                   title, content, content_hash, token_estimate, start_line, start_column,
                   end_line, end_column, prev_chunk_id, next_chunk_id, embedding_status
              FROM chunks
             WHERE file_id = ?1
             ORDER BY id ASC
            ",
        )?;

        let rows = stmt.query_map(params![file_id], map_chunk)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn find_chunks_by_workspace(&self, workspace_id: WorkspaceId) -> Result<Vec<Chunk>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, file_id, symbol_id, parent_symbol_id, kind, language,
                   title, content, content_hash, token_estimate, start_line, start_column,
                   end_line, end_column, prev_chunk_id, next_chunk_id, embedding_status
              FROM chunks
             WHERE workspace_id = ?1
             ORDER BY id ASC
            ",
        )?;

        let rows = stmt.query_map(params![workspace_id], map_chunk)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn search_chunks_fts(&self, workspace_id: WorkspaceId, query: &str, limit: usize) -> Result<Vec<(Chunk, f32)>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT c.id, c.workspace_id, c.file_id, c.symbol_id, c.parent_symbol_id, c.kind, c.language,
                   c.title, c.content, c.content_hash, c.token_estimate, c.start_line, c.start_column,
                   c.end_line, c.end_column, c.prev_chunk_id, c.next_chunk_id, c.embedding_status,
                   bm25(chunk_fts) as score
              FROM chunk_fts f
              JOIN chunks c ON c.id = f.rowid
             WHERE chunk_fts MATCH ?1 AND c.workspace_id = ?2
             ORDER BY score ASC
             LIMIT ?3
            ",
        )?;

        let rows = stmt.query_map(params![query, workspace_id, limit], |row| {
            let chunk = map_chunk(row)?;
            let score: f64 = row.get(18)?; 
            // bm25 is more negative for better matches, we'll return its absolute value so higher is better
            Ok((chunk, score.abs() as f32))
        })?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}


impl IndexStateRepository for Database {
    fn get_state(&self, workspace_id: WorkspaceId) -> Result<Option<IndexState>> {
        self.conn
            .query_row(
                "
                SELECT workspace_id, schema_version, index_version, status, active_run_id,
                       total_files, indexed_files, dirty_files, deleted_files,
                       last_scan_started_at_unix_ms, last_scan_finished_at_unix_ms,
                       last_successful_index_at_unix_ms, queued_embeddings, last_error
                  FROM index_state
                 WHERE workspace_id = ?1
                ",
                params![workspace_id],
                map_index_state,
            )
            .optional()
            .map_err(Into::into)
    }

    fn freshness_state_counts(&self, workspace_id: WorkspaceId) -> Result<FreshnessStateCounts> {
        let mut stmt = self.conn.prepare(
            "
            SELECT freshness_state, COUNT(*)
              FROM files
             WHERE workspace_id = ?1
             GROUP BY freshness_state
            ",
        )?;

        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;

        let mut counts = FreshnessStateCounts::default();
        for row in rows {
            let (state_raw, count) = row?;
            if count > 0 {
                let state = freshness_state_from_str(&state_raw)?;
                let count_u64 = count as u64;
                match state {
                    FreshnessState::RefreshedCurrent => {
                        counts.refreshed_current = count_u64;
                    }
                    FreshnessState::RetainedCurrent => {
                        counts.retained_current = count_u64;
                    }
                    FreshnessState::DegradedPartial => {
                        counts.degraded_partial = count_u64;
                    }
                    FreshnessState::NotCurrent => {
                        counts.not_current = count_u64;
                    }
                    FreshnessState::Deleted => {}
                }
            }
        }

        Ok(counts)
    }

    fn update_state(&self, state: &IndexState) -> Result<()> {
        self.conn.execute(
            "
            INSERT INTO index_state (
              workspace_id, schema_version, index_version, status, active_run_id,
              total_files, indexed_files, dirty_files, deleted_files,
              last_scan_started_at_unix_ms, last_scan_finished_at_unix_ms,
              last_successful_index_at_unix_ms, queued_embeddings, last_error
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(workspace_id) DO UPDATE SET
              schema_version=excluded.schema_version,
              index_version=excluded.index_version,
              status=excluded.status,
              active_run_id=excluded.active_run_id,
              total_files=excluded.total_files,
              indexed_files=excluded.indexed_files,
              dirty_files=excluded.dirty_files,
              deleted_files=excluded.deleted_files,
              last_scan_started_at_unix_ms=excluded.last_scan_started_at_unix_ms,
              last_scan_finished_at_unix_ms=excluded.last_scan_finished_at_unix_ms,
              last_successful_index_at_unix_ms=excluded.last_successful_index_at_unix_ms,
              queued_embeddings=excluded.queued_embeddings,
              last_error=excluded.last_error
            ",
            params![
                state.workspace_id,
                state.schema_version,
                state.index_version as i64,
                index_run_status_to_str(state.status),
                state.active_run_id,
                state.total_files as i64,
                state.indexed_files as i64,
                state.dirty_files as i64,
                state.deleted_files as i64,
                state.last_scan_started_at_unix_ms,
                state.last_scan_finished_at_unix_ms,
                state.last_successful_index_at_unix_ms,
                state.queued_embeddings as i64,
                state.last_error,
            ],
        )?;

        info!(workspace_id = state.workspace_id, "updated index state");
        Ok(())
    }

    fn upsert_run(
        &self,
        run_id: &str,
        workspace_id: WorkspaceId,
        status: IndexRunStatus,
        stage: &str,
        started_at_unix_ms: i64,
        heartbeat_at_unix_ms: i64,
        finished_at_unix_ms: Option<i64>,
        message: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "
            INSERT INTO index_runs (
              run_id, workspace_id, status, stage, started_at_unix_ms,
              heartbeat_at_unix_ms, finished_at_unix_ms, message
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(run_id) DO UPDATE SET
              workspace_id=excluded.workspace_id,
              status=excluded.status,
              stage=excluded.stage,
              started_at_unix_ms=excluded.started_at_unix_ms,
              heartbeat_at_unix_ms=excluded.heartbeat_at_unix_ms,
              finished_at_unix_ms=excluded.finished_at_unix_ms,
              message=excluded.message
            ",
            params![
                run_id,
                workspace_id,
                index_run_status_to_str(status),
                stage,
                started_at_unix_ms,
                heartbeat_at_unix_ms,
                finished_at_unix_ms,
                message,
            ],
        )?;
        Ok(())
    }
}

impl GraphRepository for Database {
    fn find_symbol_definitions(
        &self,
        workspace_id: WorkspaceId,
        symbol_name: &str,
        limit: usize,
    ) -> Result<Vec<Symbol>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, file_id, parent_symbol_id, kind, name, qualified_name,
                   signature, detail, visibility, exported, async_flag, static_flag,
                   start_byte, end_byte, start_line, start_column, end_line, end_column, symbol_hash
              FROM symbols
             WHERE workspace_id = ?1 AND (name = ?2 OR qualified_name = ?2)
             ORDER BY exported DESC, id ASC
             LIMIT ?3
            ",
        )?;
        let rows = stmt.query_map(params![workspace_id, symbol_name, limit as i64], map_symbol)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn find_symbol_by_id(
        &self,
        workspace_id: WorkspaceId,
        symbol_id: SymbolId,
    ) -> Result<Option<Symbol>> {
        self.conn
            .query_row(
                "
                SELECT id, workspace_id, file_id, parent_symbol_id, kind, name, qualified_name,
                       signature, detail, visibility, exported, async_flag, static_flag,
                       start_byte, end_byte, start_line, start_column, end_line, end_column, symbol_hash
                  FROM symbols
                 WHERE workspace_id = ?1 AND id = ?2
                ",
                params![workspace_id, symbol_id],
                map_symbol,
            )
            .optional()
            .map_err(Into::into)
    }

    fn find_file_by_id(&self, workspace_id: WorkspaceId, file_id: FileId) -> Result<Option<File>> {
        self.conn
            .query_row(
                "
                SELECT id, workspace_id, root_id, package_id, rel_path, language, size_bytes,
                       mtime_unix_ms, content_hash, structure_hash, public_api_hash, parse_status,
                       parse_error, symbol_count, chunk_count, is_barrel,
                       last_indexed_at_unix_ms, deleted_at_unix_ms,
                       freshness_state, freshness_reason, last_freshness_run_id
                  FROM files
                 WHERE workspace_id = ?1 AND id = ?2
                ",
                params![workspace_id, file_id],
                map_file,
            )
            .optional()
            .map_err(Into::into)
    }

    fn find_chunk_by_id(
        &self,
        workspace_id: WorkspaceId,
        chunk_id: ChunkId,
    ) -> Result<Option<Chunk>> {
        self.conn
            .query_row(
                "
                SELECT id, workspace_id, file_id, symbol_id, parent_symbol_id, kind, language,
                       title, content, content_hash, token_estimate, start_line, start_column,
                       end_line, end_column, prev_chunk_id, next_chunk_id, embedding_status
                  FROM chunks
                 WHERE workspace_id = ?1 AND id = ?2
                ",
                params![workspace_id, chunk_id],
                map_chunk,
            )
            .optional()
            .map_err(Into::into)
    }

    fn bounded_file_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        file_id: FileId,
        hop_limit: u32,
        node_limit: usize,
    ) -> Result<Vec<FileId>> {
        let mut stmt = self.conn.prepare_cached(
            r#"
            WITH RECURSIVE reachable(node_kind, node_id, depth) AS (
                SELECT 'file', ?1, 0
                UNION ALL
                SELECT e.to_node_kind, e.to_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.from_node_kind = r.node_kind AND e.from_node_id = r.node_id
                WHERE r.depth < ?2 AND e.workspace_id = ?3
                UNION ALL
                SELECT e.from_node_kind, e.from_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.to_node_kind = r.node_kind AND e.to_node_id = r.node_id
                WHERE r.depth < ?2 AND e.workspace_id = ?3
            )
            SELECT DISTINCT node_id FROM reachable
            WHERE node_kind = 'file'
            LIMIT ?4
            "#,
        )?;

        let mut rows = stmt.query(params![file_id as i64, hop_limit, workspace_id as i64, node_limit as i64])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            result.push(id as FileId);
        }
        Ok(result)
    }

    fn bounded_symbol_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        symbol_id: SymbolId,
        hop_limit: u32,
        node_limit: usize,
    ) -> Result<Vec<SymbolId>> {
        let mut stmt = self.conn.prepare_cached(
            r#"
            WITH RECURSIVE reachable(node_kind, node_id, depth) AS (
                SELECT 'symbol', ?1, 0
                UNION ALL
                SELECT e.to_node_kind, e.to_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.from_node_kind = r.node_kind AND e.from_node_id = r.node_id
                WHERE r.depth < ?2 AND e.workspace_id = ?3
                UNION ALL
                SELECT e.from_node_kind, e.from_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.to_node_kind = r.node_kind AND e.to_node_id = r.node_id
                WHERE r.depth < ?2 AND e.workspace_id = ?3
            )
            SELECT DISTINCT node_id FROM reachable
            WHERE node_kind = 'symbol'
            LIMIT ?4
            "#,
        )?;

        let mut rows = stmt.query(params![symbol_id as i64, hop_limit, workspace_id as i64, node_limit as i64])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            result.push(id as SymbolId);
        }
        Ok(result)
    }

    fn cte_shortest_path(
        &self,
        workspace_id: WorkspaceId,
        from_kind: &str,
        from_id: i64,
        to_kind: &str,
        to_id: i64,
        max_hops: u32,
    ) -> Result<Option<Vec<dh_types::GraphEdge>>> {
        let mut stmt = self.conn.prepare_cached(
            r#"
            WITH RECURSIVE path_search(node_kind, node_id, depth, node_path, edge_path) AS (
                SELECT ?1, ?2, 0, ',' || CAST(?2 AS TEXT) || ',', CAST('' AS TEXT)
                UNION ALL
                SELECT e.to_node_kind, e.to_node_id, ps.depth + 1,
                       ps.node_path || CAST(e.to_node_id AS TEXT) || ',',
                       ps.edge_path || CAST(e.id AS TEXT) || ','
                FROM graph_edges e
                JOIN path_search ps ON e.from_node_kind = ps.node_kind AND e.from_node_id = ps.node_id
                WHERE e.workspace_id = ?5 AND ps.depth < ?6
                  AND instr(ps.node_path, ',' || CAST(e.to_node_id AS TEXT) || ',') = 0
            )
            SELECT edge_path FROM path_search
            WHERE node_kind = ?3 AND node_id = ?4
            ORDER BY depth ASC LIMIT 1
            "#,
        )?;

        let edge_path_str: Option<String> = stmt.query_row(
            params![from_kind, from_id, to_kind, to_id, workspace_id as i64, max_hops],
            |row| row.get(0),
        ).optional()?;

        let edge_path_str = match edge_path_str {
            Some(s) => s,
            None => return Ok(None),
        };

        let edge_ids: Vec<i64> = edge_path_str
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<i64>().unwrap())
            .collect();

        if edge_ids.is_empty() {
            return Ok(Some(Vec::new()));
        }

        let placeholders = edge_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT id, workspace_id, source_file_id, kind, from_node_kind, from_node_id, to_node_kind, to_node_id, resolution, confidence, start_line, start_column, end_line, end_column, reason, payload_json FROM graph_edges WHERE id IN ({})",
            placeholders
        );

        let mut edge_stmt = self.conn.prepare(&query)?;
        let rows = edge_stmt.query_map(rusqlite::params_from_iter(edge_ids.iter()), |row| {
            let id: i64 = row.get(0)?;
            let edge = map_graph_edge(row)?;
            Ok((id, edge))
        })?;
        let mut edges_with_id = Vec::new();
        for row in rows {
            edges_with_id.push(row?);
        }

        edges_with_id.sort_by_key(|(id, _)| edge_ids.iter().position(|eid| eid == id).unwrap_or(usize::MAX));

        Ok(Some(edges_with_id.into_iter().map(|(_, e)| e).collect()))
    }

    fn weighted_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed_kind: &str,
        seed_id: i64,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> Result<Vec<(dh_types::NodeId, u32)>> {
        let filter_clause = if let Some(kinds) = edge_kind_filter {
            if kinds.is_empty() {
                "AND 1=0".to_string()
            } else {
                let quoted = kinds.iter().map(|k| format!("'{}'", k)).collect::<Vec<_>>().join(",");
                format!("AND e.kind IN ({})", quoted)
            }
        } else {
            "".to_string()
        };

        let query = format!(
            r#"
            WITH RECURSIVE reachable(node_kind, node_id, depth) AS (
                SELECT ?1, ?2, 0
                UNION ALL
                SELECT e.to_node_kind, e.to_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.from_node_kind = r.node_kind AND e.from_node_id = r.node_id
                WHERE r.depth < ?3 AND e.workspace_id = ?4 {0}
                UNION ALL
                SELECT e.from_node_kind, e.from_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.to_node_kind = r.node_kind AND e.to_node_id = r.node_id
                WHERE r.depth < ?3 AND e.workspace_id = ?4 {0}
            )
            SELECT node_kind, node_id, MIN(depth) as min_depth
            FROM reachable
            GROUP BY node_kind, node_id
            ORDER BY min_depth ASC
            LIMIT ?5
            "#,
            filter_clause
        );

        let mut stmt = self.conn.prepare_cached(&query)?;
        let mut rows = stmt.query(params![seed_kind, seed_id, max_hops, workspace_id as i64, node_limit as i64])?;
        
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let kind: String = row.get(0)?;
            let id: i64 = row.get(1)?;
            let depth: u32 = row.get(2)?;
            
            let node_id = match kind.as_str() {
                "file" => dh_types::NodeId::File(id as _),
                "symbol" => dh_types::NodeId::Symbol(id as _),
                "chunk" => dh_types::NodeId::Chunk(id as _),
                _ => continue,
            };
            result.push((node_id, depth));
        }
        
        Ok(result)
    }

    fn directional_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed_kind: &str,
        seed_id: i64,
        direction: &str,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> Result<Vec<(dh_types::NodeId, u32)>> {
        let filter_clause = if let Some(kinds) = edge_kind_filter {
            if kinds.is_empty() {
                "AND 1=0".to_string()
            } else {
                let quoted = kinds.iter().map(|k| format!("'{}'", k)).collect::<Vec<_>>().join(",");
                format!("AND e.kind IN ({})", quoted)
            }
        } else {
            "".to_string()
        };

        let recursive_step = if direction == "outgoing" {
            format!(r#"
                SELECT e.to_node_kind, e.to_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.from_node_kind = r.node_kind AND e.from_node_id = r.node_id
                WHERE r.depth < ?3 AND e.workspace_id = ?4 {}
            "#, filter_clause)
        } else if direction == "incoming" {
            format!(r#"
                SELECT e.from_node_kind, e.from_node_id, r.depth + 1
                FROM graph_edges e
                JOIN reachable r ON e.to_node_kind = r.node_kind AND e.to_node_id = r.node_id
                WHERE r.depth < ?3 AND e.workspace_id = ?4 {}
            "#, filter_clause)
        } else {
            // Fallback just in case, though it shouldn't happen.
            return Ok(Vec::new());
        };

        let query = format!(
            r#"
            WITH RECURSIVE reachable(node_kind, node_id, depth) AS (
                SELECT ?1, ?2, 0
                UNION ALL
                {}
            )
            SELECT node_kind, node_id, MIN(depth) as min_depth
            FROM reachable
            GROUP BY node_kind, node_id
            ORDER BY min_depth ASC
            LIMIT ?5
            "#,
            recursive_step
        );

        let mut stmt = self.conn.prepare_cached(&query)?;
        let mut rows = stmt.query(params![seed_kind, seed_id, max_hops, workspace_id as i64, node_limit as i64])?;
        
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            let kind: String = row.get(0)?;
            let id: i64 = row.get(1)?;
            let depth: u32 = row.get(2)?;
            
            let node_id = match kind.as_str() {
                "file" => dh_types::NodeId::File(id as _),
                "symbol" => dh_types::NodeId::Symbol(id as _),
                "chunk" => dh_types::NodeId::Chunk(id as _),
                _ => continue,
            };
            result.push((node_id, depth));
        }
        
        Ok(result)
    }
}

impl GraphEdgeRepository for Database {
    fn insert_edges(&self, edges: &[dh_types::GraphEdge], source_file_id: FileId) -> Result<()> {
        if edges.is_empty() {
            return Ok(());
        }

        let workspace_id = self.conn.query_row(
            "SELECT workspace_id FROM files WHERE id = ?1",
            params![source_file_id],
            |row| row.get::<_, u32>(0),
        )?;

        let mut stmt = self.conn.prepare(
            "
            INSERT INTO graph_edges (
              workspace_id, source_file_id, kind, from_node_kind, from_node_id,
              to_node_kind, to_node_id, resolution, confidence, start_line, start_column,
              end_line, end_column, reason, payload_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ",
        )?;

        for edge in edges {
            let (from_k, from_i) = node_id_to_db(&edge.from);
            let (to_k, to_i) = node_id_to_db(&edge.to);
            let to_i_opt = Some(to_i);

            let (sl, sc, el, ec) = if let Some(span) = &edge.span {
                (Some(span.start_line as i64), Some(span.start_column as i64), Some(span.end_line as i64), Some(span.end_column as i64))
            } else {
                (None, None, None, None)
            };

            stmt.execute(params![
                workspace_id,
                source_file_id,
                edge_kind_to_str(edge.kind),
                from_k,
                from_i,
                to_k,
                to_i_opt,
                resolution_to_str(edge.resolution),
                confidence_to_str(edge.confidence),
                sl,
                sc,
                el,
                ec,
                edge.reason,
                rusqlite::types::Null
            ])?;
        }

        Ok(())
    }

    fn find_edges_by_file(&self, file_id: FileId) -> Result<Vec<dh_types::GraphEdge>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, source_file_id, kind, from_node_kind, from_node_id, to_node_kind, to_node_id,
                   resolution, confidence, start_line, start_column, end_line, end_column, reason, payload_json
              FROM graph_edges
             WHERE source_file_id = ?1
             ORDER BY id ASC
            ",
        )?;
        let rows = stmt.query_map(params![file_id], map_graph_edge)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn find_outgoing_edges(&self, workspace_id: WorkspaceId, from_kind: &str, from_id: i64, node_limit: usize) -> Result<Vec<dh_types::GraphEdge>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, source_file_id, kind, from_node_kind, from_node_id, to_node_kind, to_node_id,
                   resolution, confidence, start_line, start_column, end_line, end_column, reason, payload_json
              FROM graph_edges
             WHERE workspace_id = ?1 AND from_node_kind = ?2 AND from_node_id = ?3
             ORDER BY id ASC
             LIMIT ?4
            ",
        )?;
        let rows = stmt.query_map(params![workspace_id, from_kind, from_id, node_limit as i64], map_graph_edge)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn find_incoming_edges(&self, workspace_id: WorkspaceId, to_kind: &str, to_id: i64, node_limit: usize) -> Result<Vec<dh_types::GraphEdge>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, source_file_id, kind, from_node_kind, from_node_id, to_node_kind, to_node_id,
                   resolution, confidence, start_line, start_column, end_line, end_column, reason, payload_json
              FROM graph_edges
             WHERE workspace_id = ?1 AND to_node_kind = ?2 AND to_node_id = ?3
             ORDER BY id ASC
             LIMIT ?4
            ",
        )?;
        let rows = stmt.query_map(params![workspace_id, to_kind, to_id, node_limit as i64], map_graph_edge)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

fn map_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<File> {
    Ok(File {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        root_id: row.get(2)?,
        package_id: row.get(3)?,
        rel_path: row.get(4)?,
        language: language_from_str(&row.get::<_, String>(5)?).map_err(to_sqlite_err)?,
        size_bytes: row.get::<_, i64>(6)? as u64,
        mtime_unix_ms: row.get(7)?,
        content_hash: row.get(8)?,
        structure_hash: row.get(9)?,
        public_api_hash: row.get(10)?,
        parse_status: parse_status_from_str(&row.get::<_, String>(11)?).map_err(to_sqlite_err)?,
        parse_error: row.get(12)?,
        symbol_count: row.get::<_, i64>(13)? as u32,
        chunk_count: row.get::<_, i64>(14)? as u32,
        is_barrel: int_to_bool(row.get(15)?),
        last_indexed_at_unix_ms: row.get(16)?,
        deleted_at_unix_ms: row.get(17)?,
        freshness_state: freshness_state_from_str(&row.get::<_, String>(18)?)
            .map_err(to_sqlite_err)?,
        freshness_reason: row
            .get::<_, Option<String>>(19)?
            .map(|value| freshness_reason_from_str(&value))
            .transpose()
            .map_err(to_sqlite_err)?,
        last_freshness_run_id: row.get(20)?,
    })
}

fn map_symbol(row: &rusqlite::Row<'_>) -> rusqlite::Result<Symbol> {
    Ok(Symbol {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        file_id: row.get(2)?,
        parent_symbol_id: row.get(3)?,
        kind: symbol_kind_from_str(&row.get::<_, String>(4)?).map_err(to_sqlite_err)?,
        name: row.get(5)?,
        qualified_name: row.get(6)?,
        signature: row.get(7)?,
        detail: row.get(8)?,
        visibility: visibility_from_str(&row.get::<_, String>(9)?).map_err(to_sqlite_err)?,
        exported: int_to_bool(row.get(10)?),
        async_flag: int_to_bool(row.get(11)?),
        static_flag: int_to_bool(row.get(12)?),
        span: Span {
            start_byte: row.get::<_, i64>(13)? as u32,
            end_byte: row.get::<_, i64>(14)? as u32,
            start_line: row.get::<_, i64>(15)? as u32,
            start_column: row.get::<_, i64>(16)? as u32,
            end_line: row.get::<_, i64>(17)? as u32,
            end_column: row.get::<_, i64>(18)? as u32,
        },
        symbol_hash: row.get(19)?,
    })
}

fn map_chunk(row: &rusqlite::Row<'_>) -> rusqlite::Result<Chunk> {
    Ok(Chunk {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        file_id: row.get(2)?,
        symbol_id: row.get(3)?,
        parent_symbol_id: row.get(4)?,
        kind: chunk_kind_from_str(&row.get::<_, String>(5)?).map_err(to_sqlite_err)?,
        language: language_from_str(&row.get::<_, String>(6)?).map_err(to_sqlite_err)?,
        title: row.get(7)?,
        content: row.get(8)?,
        content_hash: row.get(9)?,
        token_estimate: row.get::<_, i64>(10)? as u32,
        span: Span {
            start_byte: 0,
            end_byte: 0,
            start_line: row.get::<_, i64>(11)? as u32,
            start_column: row.get::<_, i64>(12)? as u32,
            end_line: row.get::<_, i64>(13)? as u32,
            end_column: row.get::<_, i64>(14)? as u32,
        },
        prev_chunk_id: row.get(15)?,
        next_chunk_id: row.get(16)?,
        embedding_status: embedding_status_from_str(&row.get::<_, String>(17)?)
            .map_err(to_sqlite_err)?,
    })
}

fn map_index_state(row: &rusqlite::Row<'_>) -> rusqlite::Result<IndexState> {
    Ok(IndexState {
        workspace_id: row.get(0)?,
        schema_version: row.get::<_, i64>(1)? as u32,
        index_version: row.get::<_, i64>(2)? as u64,
        status: index_run_status_from_str(&row.get::<_, String>(3)?).map_err(to_sqlite_err)?,
        active_run_id: row.get(4)?,
        total_files: row.get::<_, i64>(5)? as u64,
        indexed_files: row.get::<_, i64>(6)? as u64,
        dirty_files: row.get::<_, i64>(7)? as u64,
        deleted_files: row.get::<_, i64>(8)? as u64,
        last_scan_started_at_unix_ms: row.get(9)?,
        last_scan_finished_at_unix_ms: row.get(10)?,
        last_successful_index_at_unix_ms: row.get(11)?,
        queued_embeddings: row.get::<_, i64>(12)? as u64,
        last_error: row.get(13)?,
    })
}

fn map_graph_edge(row: &rusqlite::Row<'_>) -> rusqlite::Result<dh_types::GraphEdge> {
    Ok(dh_types::GraphEdge {
        kind: edge_kind_from_str(&row.get::<_, String>(3)?).map_err(to_sqlite_err)?,
        from: node_id_from_db(&row.get::<_, String>(4)?, row.get::<_, i64>(5)?).map_err(to_sqlite_err)?,
        to: node_id_from_db_opt(&row.get::<_, String>(6)?, row.get::<_, Option<i64>>(7)?).map_err(to_sqlite_err)?.unwrap_or(dh_types::NodeId::Symbol(0)),
        resolution: resolution_from_str(&row.get::<_, String>(8)?).map_err(to_sqlite_err)?,
        confidence: confidence_from_str(&row.get::<_, String>(9)?).map_err(to_sqlite_err)?,
        span: if let Ok(start_line) = row.get::<_, i64>(10) {
            Some(Span {
                start_byte: 0,
                end_byte: 0,
                start_line: start_line as u32,
                start_column: row.get::<_, i64>(11)? as u32,
                end_line: row.get::<_, i64>(12)? as u32,
                end_column: row.get::<_, i64>(13)? as u32,
            })
        } else {
            None
        },
        reason: row.get(14)?,
    })
}

fn node_id_to_db(node: &dh_types::NodeId) -> (&'static str, i64) {
    match node {
        dh_types::NodeId::File(id) => ("file", *id),
        dh_types::NodeId::Symbol(id) => ("symbol", *id),
        dh_types::NodeId::Chunk(id) => ("chunk", *id),
    }
}

fn node_id_from_db(kind: &str, id: i64) -> std::result::Result<dh_types::NodeId, StorageError> {
    match kind {
        "file" => Ok(dh_types::NodeId::File(id)),
        "symbol" => Ok(dh_types::NodeId::Symbol(id)),
        "chunk" => Ok(dh_types::NodeId::Chunk(id)),
        _ => Err(StorageError::InvalidEnumValue { field: "node_kind", value: kind.to_string() }),
    }
}

fn node_id_from_db_opt(kind: &str, id: Option<i64>) -> std::result::Result<Option<dh_types::NodeId>, StorageError> {
    if let Some(id) = id {
        node_id_from_db(kind, id).map(Some)
    } else {
        Ok(None)
    }
}

fn edge_kind_to_str(kind: dh_types::EdgeKind) -> &'static str {
    match kind {
        dh_types::EdgeKind::Imports => "imports",
        dh_types::EdgeKind::ReExports => "re_exports",
        dh_types::EdgeKind::Calls => "calls",
        dh_types::EdgeKind::References => "references",
        dh_types::EdgeKind::Contains => "contains",
        dh_types::EdgeKind::Definition => "definition",
        dh_types::EdgeKind::DefinesChunk => "defines_chunk",
        dh_types::EdgeKind::Extends => "extends",
        dh_types::EdgeKind::Implements => "implements",
        dh_types::EdgeKind::TypeReferences => "type_references",
        dh_types::EdgeKind::Exports => "exports",
    }
}

fn edge_kind_from_str(value: &str) -> std::result::Result<dh_types::EdgeKind, StorageError> {
    match value {
        "imports" => Ok(dh_types::EdgeKind::Imports),
        "re_exports" => Ok(dh_types::EdgeKind::ReExports),
        "calls" => Ok(dh_types::EdgeKind::Calls),
        "references" => Ok(dh_types::EdgeKind::References),
        "contains" => Ok(dh_types::EdgeKind::Contains),
        "definition" => Ok(dh_types::EdgeKind::Definition),
        "defines_chunk" => Ok(dh_types::EdgeKind::DefinesChunk),
        "extends" => Ok(dh_types::EdgeKind::Extends),
        "implements" => Ok(dh_types::EdgeKind::Implements),
        "type_references" => Ok(dh_types::EdgeKind::TypeReferences),
        "exports" => Ok(dh_types::EdgeKind::Exports),
        _ => Err(StorageError::InvalidEnumValue { field: "edge_kind", value: value.to_string() }),
    }
}

fn resolution_to_str(res: dh_types::EdgeResolution) -> &'static str {
    match res {
        dh_types::EdgeResolution::Resolved => "resolved",
        dh_types::EdgeResolution::Unresolved => "unresolved",
    }
}

fn resolution_from_str(value: &str) -> std::result::Result<dh_types::EdgeResolution, StorageError> {
    match value {
        "resolved" => Ok(dh_types::EdgeResolution::Resolved),
        "unresolved" => Ok(dh_types::EdgeResolution::Unresolved),
        _ => Err(StorageError::InvalidEnumValue { field: "resolution", value: value.to_string() }),
    }
}

fn confidence_to_str(conf: dh_types::EdgeConfidence) -> &'static str {
    match conf {
        dh_types::EdgeConfidence::Direct => "direct",
        dh_types::EdgeConfidence::BestEffort => "best_effort",
    }
}

fn confidence_from_str(value: &str) -> std::result::Result<dh_types::EdgeConfidence, StorageError> {
    match value {
        "direct" => Ok(dh_types::EdgeConfidence::Direct),
        "best_effort" => Ok(dh_types::EdgeConfidence::BestEffort),
        _ => Err(StorageError::InvalidEnumValue { field: "confidence", value: value.to_string() }),
    }
}

fn to_sqlite_err(err: StorageError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn int_to_bool(value: i64) -> bool {
    value != 0
}

fn language_to_str(language: LanguageId) -> &'static str {
    match language {
        LanguageId::TypeScript => "TypeScript",
        LanguageId::Tsx => "Tsx",
        LanguageId::JavaScript => "JavaScript",
        LanguageId::Jsx => "Jsx",
        LanguageId::Python => "Python",
        LanguageId::Go => "Go",
        LanguageId::Rust => "Rust",
        LanguageId::Unknown => "Unknown",
    }
}

fn language_from_str(value: &str) -> std::result::Result<LanguageId, StorageError> {
    match value {
        "TypeScript" => Ok(LanguageId::TypeScript),
        "Tsx" => Ok(LanguageId::Tsx),
        "JavaScript" => Ok(LanguageId::JavaScript),
        "Jsx" => Ok(LanguageId::Jsx),
        "Python" => Ok(LanguageId::Python),
        "Go" => Ok(LanguageId::Go),
        "Rust" => Ok(LanguageId::Rust),
        "Unknown" => Ok(LanguageId::Unknown),
        _ => Err(StorageError::InvalidEnumValue {
            field: "language",
            value: value.to_string(),
        }),
    }
}

fn parse_status_to_str(status: ParseStatus) -> &'static str {
    match status {
        ParseStatus::Pending => "Pending",
        ParseStatus::Parsed => "Parsed",
        ParseStatus::ParsedWithErrors => "ParsedWithErrors",
        ParseStatus::Failed => "Failed",
        ParseStatus::Skipped => "Skipped",
    }
}

fn parse_status_from_str(value: &str) -> std::result::Result<ParseStatus, StorageError> {
    match value {
        "Pending" => Ok(ParseStatus::Pending),
        "Parsed" => Ok(ParseStatus::Parsed),
        "ParsedWithErrors" => Ok(ParseStatus::ParsedWithErrors),
        "Failed" => Ok(ParseStatus::Failed),
        "Skipped" => Ok(ParseStatus::Skipped),
        _ => Err(StorageError::InvalidEnumValue {
            field: "parse_status",
            value: value.to_string(),
        }),
    }
}

fn freshness_state_to_str(state: FreshnessState) -> &'static str {
    match state {
        FreshnessState::RetainedCurrent => "retained_current",
        FreshnessState::RefreshedCurrent => "refreshed_current",
        FreshnessState::DegradedPartial => "degraded_partial",
        FreshnessState::NotCurrent => "not_current",
        FreshnessState::Deleted => "deleted",
    }
}

fn freshness_state_from_str(value: &str) -> std::result::Result<FreshnessState, StorageError> {
    match value {
        "retained_current" => Ok(FreshnessState::RetainedCurrent),
        "refreshed_current" => Ok(FreshnessState::RefreshedCurrent),
        "degraded_partial" => Ok(FreshnessState::DegradedPartial),
        "not_current" => Ok(FreshnessState::NotCurrent),
        "deleted" => Ok(FreshnessState::Deleted),
        _ => Err(StorageError::InvalidEnumValue {
            field: "freshness_state",
            value: value.to_string(),
        }),
    }
}

fn freshness_reason_to_str(reason: FreshnessReason) -> &'static str {
    match reason {
        FreshnessReason::UnchangedUnaffected => "unchanged_unaffected",
        FreshnessReason::ContentChanged => "content_changed",
        FreshnessReason::StructureChanged => "structure_changed",
        FreshnessReason::PublicApiChanged => "public_api_changed",
        FreshnessReason::DependentInvalidated => "dependent_invalidated",
        FreshnessReason::ResolutionScopeChanged => "resolution_scope_changed",
        FreshnessReason::DeletedPath => "deleted_path",
        FreshnessReason::PathInvalidated => "path_invalidated",
        FreshnessReason::RecoverableParseIssues => "recoverable_parse_issues",
        FreshnessReason::FatalReadFailure => "fatal_read_failure",
        FreshnessReason::FatalParseFailure => "fatal_parse_failure",
        FreshnessReason::FatalPersistFailure => "fatal_persist_failure",
    }
}

fn freshness_reason_from_str(value: &str) -> std::result::Result<FreshnessReason, StorageError> {
    match value {
        "unchanged_unaffected" => Ok(FreshnessReason::UnchangedUnaffected),
        "content_changed" => Ok(FreshnessReason::ContentChanged),
        "structure_changed" => Ok(FreshnessReason::StructureChanged),
        "public_api_changed" => Ok(FreshnessReason::PublicApiChanged),
        "dependent_invalidated" => Ok(FreshnessReason::DependentInvalidated),
        "resolution_scope_changed" => Ok(FreshnessReason::ResolutionScopeChanged),
        "deleted_path" => Ok(FreshnessReason::DeletedPath),
        "path_invalidated" => Ok(FreshnessReason::PathInvalidated),
        "recoverable_parse_issues" => Ok(FreshnessReason::RecoverableParseIssues),
        "fatal_read_failure" => Ok(FreshnessReason::FatalReadFailure),
        "fatal_parse_failure" => Ok(FreshnessReason::FatalParseFailure),
        "fatal_persist_failure" => Ok(FreshnessReason::FatalPersistFailure),
        _ => Err(StorageError::InvalidEnumValue {
            field: "freshness_reason",
            value: value.to_string(),
        }),
    }
}

fn symbol_kind_to_str(kind: SymbolKind) -> &'static str {
    match kind {
        SymbolKind::Module => "Module",
        SymbolKind::Namespace => "Namespace",
        SymbolKind::Function => "Function",
        SymbolKind::Method => "Method",
        SymbolKind::Class => "Class",
        SymbolKind::Struct => "Struct",
        SymbolKind::Interface => "Interface",
        SymbolKind::Trait => "Trait",
        SymbolKind::TypeAlias => "TypeAlias",
        SymbolKind::Enum => "Enum",
        SymbolKind::EnumMember => "EnumMember",
        SymbolKind::Variable => "Variable",
        SymbolKind::Constant => "Constant",
        SymbolKind::Field => "Field",
        SymbolKind::Property => "Property",
        SymbolKind::Parameter => "Parameter",
    }
}

fn symbol_kind_from_str(value: &str) -> std::result::Result<SymbolKind, StorageError> {
    match value {
        "Module" => Ok(SymbolKind::Module),
        "Namespace" => Ok(SymbolKind::Namespace),
        "Function" => Ok(SymbolKind::Function),
        "Method" => Ok(SymbolKind::Method),
        "Class" => Ok(SymbolKind::Class),
        "Struct" => Ok(SymbolKind::Struct),
        "Interface" => Ok(SymbolKind::Interface),
        "Trait" => Ok(SymbolKind::Trait),
        "TypeAlias" => Ok(SymbolKind::TypeAlias),
        "Enum" => Ok(SymbolKind::Enum),
        "EnumMember" => Ok(SymbolKind::EnumMember),
        "Variable" => Ok(SymbolKind::Variable),
        "Constant" => Ok(SymbolKind::Constant),
        "Field" => Ok(SymbolKind::Field),
        "Property" => Ok(SymbolKind::Property),
        "Parameter" => Ok(SymbolKind::Parameter),
        _ => Err(StorageError::InvalidEnumValue {
            field: "symbol_kind",
            value: value.to_string(),
        }),
    }
}

fn visibility_to_str(value: Visibility) -> &'static str {
    match value {
        Visibility::Public => "Public",
        Visibility::Protected => "Protected",
        Visibility::Private => "Private",
        Visibility::Internal => "Internal",
        Visibility::Unknown => "Unknown",
    }
}

fn visibility_from_str(value: &str) -> std::result::Result<Visibility, StorageError> {
    match value {
        "Public" => Ok(Visibility::Public),
        "Protected" => Ok(Visibility::Protected),
        "Private" => Ok(Visibility::Private),
        "Internal" => Ok(Visibility::Internal),
        "Unknown" => Ok(Visibility::Unknown),
        _ => Err(StorageError::InvalidEnumValue {
            field: "visibility",
            value: value.to_string(),
        }),
    }
}

fn chunk_kind_to_str(value: dh_types::ChunkKind) -> &'static str {
    match value {
        dh_types::ChunkKind::FileHeader => "FileHeader",
        dh_types::ChunkKind::Module => "Module",
        dh_types::ChunkKind::Symbol => "Symbol",
        dh_types::ChunkKind::Method => "Method",
        dh_types::ChunkKind::ClassSummary => "ClassSummary",
        dh_types::ChunkKind::TestBlock => "TestBlock",
        dh_types::ChunkKind::Doc => "Doc",
    }
}

fn chunk_kind_from_str(value: &str) -> std::result::Result<dh_types::ChunkKind, StorageError> {
    match value {
        "FileHeader" => Ok(dh_types::ChunkKind::FileHeader),
        "Module" => Ok(dh_types::ChunkKind::Module),
        "Symbol" => Ok(dh_types::ChunkKind::Symbol),
        "Method" => Ok(dh_types::ChunkKind::Method),
        "ClassSummary" => Ok(dh_types::ChunkKind::ClassSummary),
        "TestBlock" => Ok(dh_types::ChunkKind::TestBlock),
        "Doc" => Ok(dh_types::ChunkKind::Doc),
        _ => Err(StorageError::InvalidEnumValue {
            field: "chunk_kind",
            value: value.to_string(),
        }),
    }
}

fn embedding_status_to_str(value: EmbeddingStatus) -> &'static str {
    match value {
        EmbeddingStatus::NotQueued => "NotQueued",
        EmbeddingStatus::Queued => "Queued",
        EmbeddingStatus::Indexed => "Indexed",
        EmbeddingStatus::Failed => "Failed",
    }
}

fn embedding_status_from_str(value: &str) -> std::result::Result<EmbeddingStatus, StorageError> {
    match value {
        "NotQueued" => Ok(EmbeddingStatus::NotQueued),
        "Queued" => Ok(EmbeddingStatus::Queued),
        "Indexed" => Ok(EmbeddingStatus::Indexed),
        "Failed" => Ok(EmbeddingStatus::Failed),
        _ => Err(StorageError::InvalidEnumValue {
            field: "embedding_status",
            value: value.to_string(),
        }),
    }
}

fn index_run_status_to_str(value: IndexRunStatus) -> &'static str {
    match value {
        IndexRunStatus::Idle => "Idle",
        IndexRunStatus::Scanning => "Scanning",
        IndexRunStatus::Hashing => "Hashing",
        IndexRunStatus::Parsing => "Parsing",
        IndexRunStatus::Writing => "Writing",
        IndexRunStatus::Completed => "Completed",
        IndexRunStatus::Failed => "Failed",
    }
}

fn index_run_status_from_str(value: &str) -> std::result::Result<IndexRunStatus, StorageError> {
    match value {
        "Idle" => Ok(IndexRunStatus::Idle),
        "Scanning" => Ok(IndexRunStatus::Scanning),
        "Hashing" => Ok(IndexRunStatus::Hashing),
        "Parsing" => Ok(IndexRunStatus::Parsing),
        "Writing" => Ok(IndexRunStatus::Writing),
        "Completed" => Ok(IndexRunStatus::Completed),
        "Failed" => Ok(IndexRunStatus::Failed),
        _ => Err(StorageError::InvalidEnumValue {
            field: "index_run_status",
            value: value.to_string(),
        }),
    }
}

// ─── Runtime State: Enum Helpers ──────────────────────────────────────────────

fn lane_to_str(lane: WorkflowLane) -> &'static str {
    lane.as_str()
}

fn str_to_lane(s: &str) -> std::result::Result<WorkflowLane, StorageError> {
    WorkflowLane::from_str(s).ok_or_else(|| StorageError::InvalidEnumValue {
        field: "lane",
        value: s.to_string(),
    })
}

fn session_status_to_str(s: SessionStatus) -> &'static str {
    match s {
        SessionStatus::Pending => "pending",
        SessionStatus::Active => "active",
        SessionStatus::Paused => "paused",
        SessionStatus::Completed => "completed",
        SessionStatus::Failed => "failed",
        SessionStatus::Cancelled => "cancelled",
    }
}

fn str_to_session_status(s: &str) -> std::result::Result<SessionStatus, StorageError> {
    match s {
        "pending" => Ok(SessionStatus::Pending),
        "active" => Ok(SessionStatus::Active),
        "paused" => Ok(SessionStatus::Paused),
        "completed" => Ok(SessionStatus::Completed),
        "failed" => Ok(SessionStatus::Failed),
        "cancelled" => Ok(SessionStatus::Cancelled),
        _ => Err(StorageError::InvalidEnumValue { field: "session_status", value: s.to_string() }),
    }
}

fn semantic_mode_to_str(m: SemanticMode) -> &'static str {
    match m {
        SemanticMode::Always => "always",
        SemanticMode::OnDemand => "on_demand",
        SemanticMode::Off => "off",
    }
}

fn str_to_semantic_mode(s: &str) -> std::result::Result<SemanticMode, StorageError> {
    match s {
        "always" => Ok(SemanticMode::Always),
        "on_demand" => Ok(SemanticMode::OnDemand),
        "off" => Ok(SemanticMode::Off),
        _ => Err(StorageError::InvalidEnumValue { field: "semantic_mode", value: s.to_string() }),
    }
}

fn enforcement_to_str(e: ToolEnforcementLevel) -> &'static str {
    match e {
        ToolEnforcementLevel::VeryHard => "very_hard",
        ToolEnforcementLevel::Hard => "hard",
        ToolEnforcementLevel::Soft => "soft",
        ToolEnforcementLevel::Off => "off",
    }
}

fn str_to_enforcement(s: &str) -> std::result::Result<ToolEnforcementLevel, StorageError> {
    match s {
        "very_hard" => Ok(ToolEnforcementLevel::VeryHard),
        "hard" => Ok(ToolEnforcementLevel::Hard),
        "soft" => Ok(ToolEnforcementLevel::Soft),
        "off" => Ok(ToolEnforcementLevel::Off),
        _ => Err(StorageError::InvalidEnumValue { field: "tool_enforcement_level", value: s.to_string() }),
    }
}

fn stage_status_to_str(s: StageStatus) -> &'static str {
    match s {
        StageStatus::Pending => "pending",
        StageStatus::InProgress => "in_progress",
        StageStatus::Passed => "passed",
        StageStatus::Failed => "failed",
        StageStatus::Blocked => "blocked",
        StageStatus::Skipped => "skipped",
    }
}

fn str_to_stage_status(s: &str) -> std::result::Result<StageStatus, StorageError> {
    match s {
        "pending" => Ok(StageStatus::Pending),
        "in_progress" => Ok(StageStatus::InProgress),
        "passed" => Ok(StageStatus::Passed),
        "failed" => Ok(StageStatus::Failed),
        "blocked" => Ok(StageStatus::Blocked),
        "skipped" => Ok(StageStatus::Skipped),
        _ => Err(StorageError::InvalidEnumValue { field: "stage_status", value: s.to_string() }),
    }
}

fn gate_status_to_str(g: GateStatus) -> &'static str {
    match g {
        GateStatus::Pending => "pending",
        GateStatus::Passed => "passed",
        GateStatus::Failed => "failed",
        GateStatus::Waived => "waived",
    }
}

fn str_to_gate_status(s: &str) -> std::result::Result<GateStatus, StorageError> {
    match s {
        "pending" => Ok(GateStatus::Pending),
        "passed" => Ok(GateStatus::Passed),
        "failed" => Ok(GateStatus::Failed),
        "waived" => Ok(GateStatus::Waived),
        _ => Err(StorageError::InvalidEnumValue { field: "gate_status", value: s.to_string() }),
    }
}

fn hook_name_to_str(h: HookName) -> &'static str {
    h.as_str()
}

fn str_to_hook_name(s: &str) -> std::result::Result<HookName, StorageError> {
    match s {
        "model_override" => Ok(HookName::ModelOverride),
        "pre_tool_exec" => Ok(HookName::PreToolExec),
        "pre_answer" => Ok(HookName::PreAnswer),
        "skill_activation" => Ok(HookName::SkillActivation),
        "mcp_routing" => Ok(HookName::McpRouting),
        "session_state_injection" => Ok(HookName::SessionStateInjection),
        _ => Err(StorageError::InvalidEnumValue { field: "hook_name", value: s.to_string() }),
    }
}

fn hook_decision_to_str(d: HookDecision) -> &'static str {
    match d {
        HookDecision::Allow => "allow",
        HookDecision::Block => "block",
        HookDecision::Modify => "modify",
        HookDecision::Passthrough => "passthrough",
    }
}

fn str_to_hook_decision(s: &str) -> std::result::Result<HookDecision, StorageError> {
    match s {
        "allow" => Ok(HookDecision::Allow),
        "block" => Ok(HookDecision::Block),
        "modify" => Ok(HookDecision::Modify),
        "passthrough" => Ok(HookDecision::Passthrough),
        _ => Err(StorageError::InvalidEnumValue { field: "hook_decision", value: s.to_string() }),
    }
}

fn agent_role_to_str(r: AgentRole) -> &'static str {
    r.as_str()
}

fn str_to_agent_role(s: &str) -> std::result::Result<AgentRole, StorageError> {
    match s {
        "coordinator" => Ok(AgentRole::Coordinator),
        "product_lead" => Ok(AgentRole::ProductLead),
        "solution_lead" => Ok(AgentRole::SolutionLead),
        "implementer" => Ok(AgentRole::Implementer),
        "code_reviewer" => Ok(AgentRole::CodeReviewer),
        "qa_agent" => Ok(AgentRole::QaAgent),
        "quick_agent" => Ok(AgentRole::QuickAgent),
        _ => Err(StorageError::InvalidEnumValue { field: "agent_role", value: s.to_string() }),
    }
}

// ─── Runtime State: Repository Traits ─────────────────────────────────────────

pub trait SessionRepository {
    fn create_session(&self, session: &SessionState) -> Result<()>;
    fn get_session(&self, id: &str) -> Result<Option<SessionState>>;
    fn update_session_status(&self, id: &str, status: SessionStatus, now_ms: i64) -> Result<()>;
    fn update_session_stage(&self, id: &str, stage: &str, now_ms: i64) -> Result<()>;
    fn list_sessions_by_status(&self, status: SessionStatus) -> Result<Vec<SessionState>>;
}

pub trait WorkflowStageRepository {
    fn insert_stage(&self, state: &WorkflowStageState) -> Result<()>;
    fn get_current_stage(&self, session_id: &str) -> Result<Option<WorkflowStageState>>;
    fn update_stage_status(&self, session_id: &str, stage: &str, status: StageStatus, gate: GateStatus, now_ms: i64) -> Result<()>;
    fn list_stages(&self, session_id: &str) -> Result<Vec<WorkflowStageState>>;
}

pub trait HookLogRepository {
    fn insert_hook_log(&self, log: &HookInvocationLog) -> Result<()>;
    fn list_hook_logs(&self, session_id: &str, limit: usize) -> Result<Vec<HookInvocationLog>>;
    fn list_hook_logs_by_name(&self, session_id: &str, hook: HookName, limit: usize) -> Result<Vec<HookInvocationLog>>;
}

pub trait ExecutionEnvelopeRepository {
    fn insert_envelope(&self, envelope: &ExecutionEnvelope) -> Result<()>;
    fn get_envelope(&self, id: &str) -> Result<Option<ExecutionEnvelope>>;
    fn list_envelopes(&self, session_id: &str) -> Result<Vec<ExecutionEnvelope>>;
}

// ─── Runtime State: Repository Implementations ───────────────────────────────

impl SessionRepository for Database {
    fn create_session(&self, s: &SessionState) -> Result<()> {
        self.conn.execute(
            "INSERT INTO sessions (id, repo_root, lane, lane_locked, current_stage, status, semantic_mode, tool_enforcement_level, created_at_unix_ms, updated_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                s.id,
                s.repo_root,
                lane_to_str(s.lane),
                s.lane_locked as i32,
                s.current_stage,
                session_status_to_str(s.status),
                semantic_mode_to_str(s.semantic_mode),
                enforcement_to_str(s.tool_enforcement_level),
                s.created_at_unix_ms,
                s.updated_at_unix_ms,
            ],
        )?;
        Ok(())
    }

    fn get_session(&self, id: &str) -> Result<Option<SessionState>> {
        self.conn.query_row(
            "SELECT id, repo_root, lane, lane_locked, current_stage, status, semantic_mode, tool_enforcement_level, created_at_unix_ms, updated_at_unix_ms
             FROM sessions WHERE id = ?1",
            params![id],
            |row| {
                let lane_str: String = row.get(2)?;
                let status_str: String = row.get(5)?;
                let sm_str: String = row.get(6)?;
                let te_str: String = row.get(7)?;
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, lane_str,
                    row.get::<_, i32>(3)?, row.get::<_, String>(4)?, status_str,
                    sm_str, te_str, row.get::<_, i64>(8)?, row.get::<_, i64>(9)?))
            },
        )
        .optional()?
        .map(|(id, repo_root, lane_str, locked, stage, status_str, sm_str, te_str, created, updated)| {
            Ok(SessionState {
                id,
                repo_root,
                lane: str_to_lane(&lane_str)?,
                lane_locked: locked != 0,
                current_stage: stage,
                status: str_to_session_status(&status_str)?,
                semantic_mode: str_to_semantic_mode(&sm_str)?,
                tool_enforcement_level: str_to_enforcement(&te_str)?,
                created_at_unix_ms: created,
                updated_at_unix_ms: updated,
            })
        })
        .transpose()
    }

    fn update_session_status(&self, id: &str, status: SessionStatus, now_ms: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET status = ?1, updated_at_unix_ms = ?2 WHERE id = ?3",
            params![session_status_to_str(status), now_ms, id],
        )?;
        Ok(())
    }

    fn update_session_stage(&self, id: &str, stage: &str, now_ms: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET current_stage = ?1, updated_at_unix_ms = ?2 WHERE id = ?3",
            params![stage, now_ms, id],
        )?;
        Ok(())
    }

    fn list_sessions_by_status(&self, status: SessionStatus) -> Result<Vec<SessionState>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_root, lane, lane_locked, current_stage, status, semantic_mode, tool_enforcement_level, created_at_unix_ms, updated_at_unix_ms
             FROM sessions WHERE status = ?1 ORDER BY created_at_unix_ms DESC",
        )?;
        let rows = stmt.query_map(params![session_status_to_str(status)], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?,
                row.get::<_, String>(6)?, row.get::<_, String>(7)?, row.get::<_, i64>(8)?, row.get::<_, i64>(9)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, repo_root, lane_str, locked, stage, status_str, sm_str, te_str, created, updated) = row?;
            out.push(SessionState {
                id, repo_root,
                lane: str_to_lane(&lane_str)?,
                lane_locked: locked != 0,
                current_stage: stage,
                status: str_to_session_status(&status_str)?,
                semantic_mode: str_to_semantic_mode(&sm_str)?,
                tool_enforcement_level: str_to_enforcement(&te_str)?,
                created_at_unix_ms: created,
                updated_at_unix_ms: updated,
            });
        }
        Ok(out)
    }
}

impl WorkflowStageRepository for Database {
    fn insert_stage(&self, s: &WorkflowStageState) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workflow_stages (session_id, lane, stage, stage_status, previous_stage, gate_status, updated_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                s.session_id,
                lane_to_str(s.lane),
                s.stage,
                stage_status_to_str(s.stage_status),
                s.previous_stage,
                gate_status_to_str(s.gate_status),
                s.updated_at_unix_ms,
            ],
        )?;
        Ok(())
    }

    fn get_current_stage(&self, session_id: &str) -> Result<Option<WorkflowStageState>> {
        self.conn.query_row(
            "SELECT session_id, lane, stage, stage_status, previous_stage, gate_status, updated_at_unix_ms
             FROM workflow_stages WHERE session_id = ?1 ORDER BY id DESC LIMIT 1",
            params![session_id],
            |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?, row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?, row.get::<_, i64>(6)?))
            },
        )
        .optional()?
        .map(|(sid, lane_str, stage, ss_str, prev, gs_str, updated)| {
            Ok(WorkflowStageState {
                session_id: sid,
                lane: str_to_lane(&lane_str)?,
                stage,
                stage_status: str_to_stage_status(&ss_str)?,
                previous_stage: prev,
                gate_status: str_to_gate_status(&gs_str)?,
                updated_at_unix_ms: updated,
            })
        })
        .transpose()
    }

    fn update_stage_status(&self, session_id: &str, stage: &str, status: StageStatus, gate: GateStatus, now_ms: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE workflow_stages SET stage_status = ?1, gate_status = ?2, updated_at_unix_ms = ?3
             WHERE session_id = ?4 AND stage = ?5",
            params![stage_status_to_str(status), gate_status_to_str(gate), now_ms, session_id, stage],
        )?;
        Ok(())
    }

    fn list_stages(&self, session_id: &str) -> Result<Vec<WorkflowStageState>> {
        let mut stmt = self.conn.prepare(
            "SELECT session_id, lane, stage, stage_status, previous_stage, gate_status, updated_at_unix_ms
             FROM workflow_stages WHERE session_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                row.get::<_, String>(3)?, row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?, row.get::<_, i64>(6)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (sid, lane_str, stage, ss_str, prev, gs_str, updated) = row?;
            out.push(WorkflowStageState {
                session_id: sid,
                lane: str_to_lane(&lane_str)?,
                stage,
                stage_status: str_to_stage_status(&ss_str)?,
                previous_stage: prev,
                gate_status: str_to_gate_status(&gs_str)?,
                updated_at_unix_ms: updated,
            });
        }
        Ok(out)
    }
}

impl HookLogRepository for Database {
    fn insert_hook_log(&self, log: &HookInvocationLog) -> Result<()> {
        let input = serde_json::to_string(&log.input_json)?;
        let output = serde_json::to_string(&log.output_json)?;
        self.conn.execute(
            "INSERT INTO hook_invocation_logs (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, created_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                log.id,
                log.session_id,
                log.envelope_id,
                hook_name_to_str(log.hook_name),
                input,
                output,
                hook_decision_to_str(log.decision),
                log.reason,
                log.duration_ms as i64,
                log.created_at_unix_ms,
            ],
        )?;
        Ok(())
    }

    fn list_hook_logs(&self, session_id: &str, limit: usize) -> Result<Vec<HookInvocationLog>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, created_at_unix_ms
             FROM hook_invocation_logs WHERE session_id = ?1 ORDER BY created_at_unix_ms DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![session_id, limit as i64], map_hook_log)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row??);
        }
        Ok(out)
    }

    fn list_hook_logs_by_name(&self, session_id: &str, hook: HookName, limit: usize) -> Result<Vec<HookInvocationLog>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, created_at_unix_ms
             FROM hook_invocation_logs WHERE session_id = ?1 AND hook_name = ?2 ORDER BY created_at_unix_ms DESC LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![session_id, hook_name_to_str(hook), limit as i64], map_hook_log)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row??);
        }
        Ok(out)
    }
}

fn map_hook_log(row: &rusqlite::Row<'_>) -> rusqlite::Result<Result<HookInvocationLog>> {
    let input_str: String = row.get(4)?;
    let output_str: String = row.get(5)?;
    let hook_str: String = row.get(3)?;
    let decision_str: String = row.get(6)?;
    Ok((|| {
        Ok(HookInvocationLog {
            id: row.get(0)?,
            session_id: row.get(1)?,
            envelope_id: row.get(2)?,
            hook_name: str_to_hook_name(&hook_str)?,
            input_json: serde_json::from_str(&input_str)?,
            output_json: serde_json::from_str(&output_str)?,
            decision: str_to_hook_decision(&decision_str)?,
            reason: row.get(7)?,
            duration_ms: row.get::<_, i64>(8)? as u64,
            created_at_unix_ms: row.get(9)?,
        })
    })())
}

impl ExecutionEnvelopeRepository for Database {
    fn insert_envelope(&self, e: &ExecutionEnvelope) -> Result<()> {
        let model_json = e.resolved_model.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());
        let skills_json = serde_json::to_string(&e.active_skills)?;
        let mcps_json = serde_json::to_string(&e.active_mcps)?;
        self.conn.execute(
            "INSERT INTO execution_envelopes (id, session_id, lane, role, agent_id, stage, work_item_id, resolved_model_json, active_skills_json, active_mcps_json, created_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                e.id,
                e.session_id,
                lane_to_str(e.lane),
                agent_role_to_str(e.role),
                e.agent_id,
                e.stage,
                e.work_item_id,
                model_json,
                skills_json,
                mcps_json,
                e.created_at_unix_ms,
            ],
        )?;
        Ok(())
    }

    fn get_envelope(&self, id: &str) -> Result<Option<ExecutionEnvelope>> {
        self.conn.query_row(
            "SELECT id, session_id, lane, role, agent_id, stage, work_item_id, resolved_model_json, active_skills_json, active_mcps_json, created_at_unix_ms
             FROM execution_envelopes WHERE id = ?1",
            params![id],
            map_envelope,
        )
        .optional()?
        .transpose()
    }

    fn list_envelopes(&self, session_id: &str) -> Result<Vec<ExecutionEnvelope>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, lane, role, agent_id, stage, work_item_id, resolved_model_json, active_skills_json, active_mcps_json, created_at_unix_ms
             FROM execution_envelopes WHERE session_id = ?1 ORDER BY created_at_unix_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id], map_envelope)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row??);
        }
        Ok(out)
    }
}

fn map_envelope(row: &rusqlite::Row<'_>) -> rusqlite::Result<Result<ExecutionEnvelope>> {
    let lane_str: String = row.get(2)?;
    let role_str: String = row.get(3)?;
    let model_str: Option<String> = row.get(7)?;
    let skills_str: String = row.get(8)?;
    let mcps_str: String = row.get(9)?;
    Ok((|| {
        Ok(ExecutionEnvelope {
            id: row.get(0)?,
            session_id: row.get(1)?,
            lane: str_to_lane(&lane_str)?,
            role: str_to_agent_role(&role_str)?,
            agent_id: row.get(4)?,
            stage: row.get(5)?,
            work_item_id: row.get(6)?,
            resolved_model: model_str.map(|s| serde_json::from_str(&s)).transpose()?,
            active_skills: serde_json::from_str(&skills_str)?,
            active_mcps: serde_json::from_str(&mcps_str)?,
            created_at_unix_ms: row.get(10)?,
        })
    })())
}

#[cfg(test)]
mod tests {
    use super::*;
    use dh_types::{ChunkKind, FreshnessReason, FreshnessState, ParseStatus};
    use tempfile::NamedTempFile;

    fn setup_db() -> Result<Database> {
        let temp = NamedTempFile::new()?;
        let db = Database::new(temp.path())?;
        db.initialize()?;
        db.connection().execute(
            "INSERT INTO workspaces(id, root_path, created_at, updated_at) VALUES (1, '/tmp/ws', 0, 0)",
            [],
        )?;
        db.connection().execute(
            "INSERT INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES (1, 1, '/tmp/ws', 'git_root', NULL)",
            [],
        )?;
        Ok(db)
    }

    #[test]
    fn schema_initialization_creates_core_tables() -> Result<()> {
        let db = setup_db()?;
        let count: i64 = db.connection().query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('files','symbols','graph_edges','chunks','index_state','index_runs')",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(count, 6);
        Ok(())
    }

    #[test]
    fn file_crud_round_trip() -> Result<()> {
        let db = setup_db()?;
        let file = File {
            id: 10,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/lib.rs".to_string(),
            language: LanguageId::Rust,
            size_bytes: 123,
            mtime_unix_ms: 100,
            content_hash: "abc".to_string(),
            structure_hash: Some("def".to_string()),
            public_api_hash: Some("ghi".to_string()),
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 0,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: Some(200),
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-1".to_string()),
        };
        db.upsert_file(&file)?;

        let fetched = db.get_file_by_path(1, "src/lib.rs")?;
        assert!(fetched.is_some());
        assert_eq!(fetched.expect("file exists").content_hash, "abc");

        let files = db.list_files_by_workspace(1)?;
        assert_eq!(files.len(), 1);
        Ok(())
    }

    #[test]
    fn symbol_crud_round_trip() -> Result<()> {
        let db = setup_db()?;
        db.upsert_file(&File {
            id: 10,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/lib.rs".to_string(),
            language: LanguageId::Rust,
            size_bytes: 123,
            mtime_unix_ms: 100,
            content_hash: "abc".to_string(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-2".to_string()),
        })?;

        let symbol = Symbol {
            id: 100,
            workspace_id: 1,
            file_id: 10,
            parent_symbol_id: None,
            kind: SymbolKind::Function,
            name: "hello".to_string(),
            qualified_name: "hello".to_string(),
            signature: Some("fn hello()".to_string()),
            detail: None,
            visibility: Visibility::Public,
            exported: true,
            async_flag: false,
            static_flag: false,
            span: Span {
                start_byte: 0,
                end_byte: 10,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 10,
            },
            symbol_hash: "hash".to_string(),
        };

        db.insert_symbols(&[symbol])?;
        let by_name = db.find_symbol_by_name(1, "hello")?;
        assert_eq!(by_name.len(), 1);
        let by_file = db.find_symbols_by_file(10)?;
        assert_eq!(by_file.len(), 1);
        Ok(())
    }

    #[test]
    fn chunk_round_trip_and_delete_file_facts() -> Result<()> {
        let db = setup_db()?;
        db.upsert_file(&File {
            id: 99,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/main.ts".to_string(),
            language: LanguageId::TypeScript,
            size_bytes: 10,
            mtime_unix_ms: 1,
            content_hash: "x".to_string(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 0,
            chunk_count: 1,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-3".to_string()),
        })?;

        db.insert_chunks(&[Chunk {
            id: 1,
            workspace_id: 1,
            file_id: 99,
            symbol_id: None,
            parent_symbol_id: None,
            kind: ChunkKind::FileHeader,
            language: LanguageId::TypeScript,
            title: "main".to_string(),
            content: "export const x = 1".to_string(),
            content_hash: "h1".to_string(),
            token_estimate: 5,
            span: Span {
                start_byte: 0,
                end_byte: 18,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 18,
            },
            prev_chunk_id: None,
            next_chunk_id: None,
            embedding_status: EmbeddingStatus::NotQueued,
        }])?;

        assert_eq!(db.find_chunks_by_file(99)?.len(), 1);
        db.delete_file_facts(99)?;
        assert!(db.find_chunks_by_file(99)?.is_empty());
        Ok(())
    }

    #[test]
    fn index_state_round_trip() -> Result<()> {
        let db = setup_db()?;
        let state = IndexState {
            workspace_id: 1,
            schema_version: SCHEMA_VERSION,
            index_version: 1,
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
        };

        db.update_state(&state)?;
        let fetched = db.get_state(1)?;
        assert!(fetched.is_some());
        assert_eq!(
            fetched.expect("state exists").schema_version,
            SCHEMA_VERSION
        );
        Ok(())
    }

    #[test]
    fn graph_repository_helpers_round_trip() -> Result<()> {
        let db = setup_db()?;
        db.upsert_file(&File {
            id: 10,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/a.ts".to_string(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "a".to_string(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-4".to_string()),
        })?;
        db.upsert_file(&File {
            id: 11,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/b.ts".to_string(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "b".to_string(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-5".to_string()),
        })?;

        db.insert_symbols(&[
            Symbol {
                id: 100,
                workspace_id: 1,
                file_id: 10,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "foo".to_string(),
                qualified_name: "foo".to_string(),
                signature: None,
                detail: None,
                visibility: Visibility::Public,
                exported: true,
                async_flag: false,
                static_flag: false,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                },
                symbol_hash: "foo".to_string(),
            },
            Symbol {
                id: 101,
                workspace_id: 1,
                file_id: 11,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "bar".to_string(),
                qualified_name: "bar".to_string(),
                signature: None,
                detail: None,
                visibility: Visibility::Public,
                exported: true,
                async_flag: false,
                static_flag: false,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                },
                symbol_hash: "bar".to_string(),
            },
        ])?;

        db.insert_edges(&[
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Imports,
                from: dh_types::NodeId::File(10),
                to: dh_types::NodeId::File(11),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                }),
                reason: "./b".to_string(),
            },
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::References,
                from: dh_types::NodeId::Symbol(100),
                to: dh_types::NodeId::Symbol(101),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                }),
                reason: "bar".to_string(),
            },
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Calls,
                from: dh_types::NodeId::Symbol(100),
                to: dh_types::NodeId::Symbol(101),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                }),
                reason: "bar".to_string(),
            }
        ], 10)?;

        let defs = db.find_symbol_definitions(1, "foo", 10)?;
        assert_eq!(defs.len(), 1);
        assert!(db.find_symbol_by_id(1, 100)?.is_some());
        assert!(db.find_file_by_id(1, 10)?.is_some());
        
        let file_outgoing = db.find_outgoing_edges(1, "file", 10, 10)?;
        assert_eq!(file_outgoing.len(), 1);
        
        let file_incoming = db.find_incoming_edges(1, "file", 11, 10)?;
        assert_eq!(file_incoming.len(), 1);
        
        let symbol_outgoing = db.find_outgoing_edges(1, "symbol", 100, 10)?;
        assert_eq!(symbol_outgoing.len(), 2);
        
        let symbol_incoming = db.find_incoming_edges(1, "symbol", 101, 10)?;
        assert_eq!(symbol_incoming.len(), 2);
        assert!(!db.bounded_file_neighborhood(1, 10, 2, 8)?.is_empty());
        assert!(!db.bounded_symbol_neighborhood(1, 100, 2, 8)?.is_empty());

        Ok(())
    }
}
