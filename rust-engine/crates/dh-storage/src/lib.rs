//! SQLite storage layer for DH index facts.

use anyhow::{Context, Result};
use dh_types::{
    CallEdge, CallKind, Chunk, EmbeddingStatus, File, FileId, Import, ImportKind, IndexRunStatus,
    IndexState, LanguageId, ParseStatus, Reference, ReferenceKind, Span, Symbol, SymbolId, SymbolKind,
    Visibility, WorkspaceId,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use thiserror::Error;
use tracing::info;

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

impl Database {
    pub fn new(path: impl AsRef<std::path::Path>) -> Result<Self> {
        let conn = Connection::open(path).context("open sqlite database")?;
        Ok(Self { conn })
    }

    pub fn initialize(&self) -> Result<()> {
        self.apply_pragmas()?;
        self.create_schema()?;
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

            CREATE TABLE IF NOT EXISTS imports (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
              source_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              raw_specifier TEXT NOT NULL,
              imported_name TEXT,
              local_name TEXT,
              alias TEXT,
              kind TEXT NOT NULL,
              is_type_only INTEGER NOT NULL DEFAULT 0,
              is_reexport INTEGER NOT NULL DEFAULT 0,
              resolved_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
              resolved_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              start_line INTEGER NOT NULL,
              start_column INTEGER NOT NULL,
              end_line INTEGER NOT NULL,
              end_column INTEGER NOT NULL,
              resolution_error TEXT
            );

            CREATE TABLE IF NOT EXISTS call_edges (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
              caller_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              callee_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              callee_qualified_name TEXT,
              callee_display_name TEXT NOT NULL,
              kind TEXT NOT NULL,
              resolved INTEGER NOT NULL DEFAULT 0,
              start_line INTEGER NOT NULL,
              start_column INTEGER NOT NULL,
              end_line INTEGER NOT NULL,
              end_column INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS [references] (
              id INTEGER PRIMARY KEY,
              workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
              source_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              target_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
              target_name TEXT NOT NULL,
              kind TEXT NOT NULL,
              resolved INTEGER NOT NULL DEFAULT 0,
              resolution_confidence REAL NOT NULL DEFAULT 0.0,
              start_line INTEGER NOT NULL,
              start_column INTEGER NOT NULL,
              end_line INTEGER NOT NULL,
              end_column INTEGER NOT NULL
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

            CREATE INDEX IF NOT EXISTS idx_imports_source_file ON imports(source_file_id);
            CREATE INDEX IF NOT EXISTS idx_imports_resolved_file ON imports(resolved_file_id);
            CREATE INDEX IF NOT EXISTS idx_imports_specifier ON imports(workspace_id, raw_specifier);

            CREATE INDEX IF NOT EXISTS idx_calls_caller ON call_edges(caller_symbol_id);
            CREATE INDEX IF NOT EXISTS idx_calls_callee ON call_edges(callee_symbol_id);
            CREATE INDEX IF NOT EXISTS idx_calls_source_file ON call_edges(source_file_id);

            CREATE INDEX IF NOT EXISTS idx_refs_target ON [references](target_symbol_id);
            CREATE INDEX IF NOT EXISTS idx_refs_source_symbol ON [references](source_symbol_id);
            CREATE INDEX IF NOT EXISTS idx_refs_target_name ON [references](workspace_id, target_name);

            CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_symbol ON chunks(symbol_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks(content_hash);
            CREATE INDEX IF NOT EXISTS idx_chunks_workspace_kind ON chunks(workspace_id, kind);

            CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON embedding_jobs(status, updated_at_unix_ms);
            CREATE INDEX IF NOT EXISTS idx_index_runs_workspace_status ON index_runs(workspace_id, status);
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
}

pub trait ImportRepository {
    fn insert_imports(&self, imports: &[Import]) -> Result<()>;
    fn find_imports_by_file(&self, file_id: FileId) -> Result<Vec<Import>>;
}

pub trait CallEdgeRepository {
    fn insert_call_edges(&self, edges: &[CallEdge]) -> Result<()>;
    fn find_call_edges_by_file(&self, file_id: FileId) -> Result<Vec<CallEdge>>;
}

pub trait ReferenceRepository {
    fn insert_references(&self, references: &[Reference]) -> Result<()>;
    fn find_references_by_file(&self, file_id: FileId) -> Result<Vec<Reference>>;
}

pub trait ChunkRepository {
    fn insert_chunks(&self, chunks: &[Chunk]) -> Result<()>;
    fn find_chunks_by_file(&self, file_id: FileId) -> Result<Vec<Chunk>>;
}

pub trait IndexStateRepository {
    fn get_state(&self, workspace_id: WorkspaceId) -> Result<Option<IndexState>>;
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

impl FileRepository for Database {
    fn upsert_file(&self, file: &File) -> Result<FileId> {
        self.conn.execute(
            "
            INSERT INTO files (
              id, workspace_id, root_id, package_id, rel_path, language, size_bytes, mtime_unix_ms,
              content_hash, structure_hash, public_api_hash, parse_status, parse_error,
              symbol_count, chunk_count, is_barrel, last_indexed_at_unix_ms, deleted_at_unix_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
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
              deleted_at_unix_ms=excluded.deleted_at_unix_ms
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
            ],
        )?;
        Ok(file.id)
    }

    fn delete_file_facts(&self, file_id: FileId) -> Result<()> {
        self.conn.execute("DELETE FROM symbols WHERE file_id = ?1", params![file_id])?;
        self.conn
            .execute("DELETE FROM imports WHERE source_file_id = ?1", params![file_id])?;
        self.conn
            .execute("DELETE FROM call_edges WHERE source_file_id = ?1", params![file_id])?;
        self.conn.execute(
            "DELETE FROM [references] WHERE source_file_id = ?1",
            params![file_id],
        )?;

        let rel_path: Option<String> = self
            .conn
            .query_row("SELECT rel_path FROM files WHERE id = ?1", params![file_id], |row| row.get(0))
            .optional()?;

        if let Some(path) = rel_path {
            self.conn
                .execute("DELETE FROM chunk_fts WHERE rel_path = ?1", params![path])?;
        }

        self.conn.execute("DELETE FROM chunks WHERE file_id = ?1", params![file_id])?;
        Ok(())
    }

    fn get_file_by_path(&self, workspace_id: WorkspaceId, rel_path: &str) -> Result<Option<File>> {
        self.conn
            .query_row(
                "
                SELECT id, workspace_id, root_id, package_id, rel_path, language, size_bytes,
                       mtime_unix_ms, content_hash, structure_hash, public_api_hash, parse_status,
                       parse_error, symbol_count, chunk_count, is_barrel,
                       last_indexed_at_unix_ms, deleted_at_unix_ms
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
                   last_indexed_at_unix_ms, deleted_at_unix_ms
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
}

impl ImportRepository for Database {
    fn insert_imports(&self, imports: &[Import]) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "
            INSERT INTO imports (
              id, workspace_id, source_file_id, source_symbol_id, raw_specifier,
              imported_name, local_name, alias, kind, is_type_only, is_reexport,
              resolved_file_id, resolved_symbol_id, start_line, start_column,
              end_line, end_column, resolution_error
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
            ",
        )?;

        for import in imports {
            stmt.execute(params![
                import.id,
                import.workspace_id,
                import.source_file_id,
                import.source_symbol_id,
                import.raw_specifier,
                import.imported_name,
                import.local_name,
                import.alias,
                import_kind_to_str(import.kind),
                bool_to_int(import.is_type_only),
                bool_to_int(import.is_reexport),
                import.resolved_file_id,
                import.resolved_symbol_id,
                import.span.start_line as i64,
                import.span.start_column as i64,
                import.span.end_line as i64,
                import.span.end_column as i64,
                import.resolution_error,
            ])?;
        }
        Ok(())
    }

    fn find_imports_by_file(&self, file_id: FileId) -> Result<Vec<Import>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, source_file_id, source_symbol_id, raw_specifier,
                   imported_name, local_name, alias, kind, is_type_only, is_reexport,
                   resolved_file_id, resolved_symbol_id, start_line, start_column,
                   end_line, end_column, resolution_error
              FROM imports
             WHERE source_file_id = ?1
             ORDER BY id ASC
            ",
        )?;

        let rows = stmt.query_map(params![file_id], map_import)?;
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

        let mut fts_stmt = self
            .conn
            .prepare("INSERT INTO chunk_fts(title, content, rel_path, language) VALUES (?1, ?2, ?3, ?4)")?;

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
                .query_row("SELECT rel_path FROM files WHERE id = ?1", params![chunk.file_id], |row| row.get(0))
                .optional()?;

            fts_stmt.execute(params![
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
}

impl CallEdgeRepository for Database {
    fn insert_call_edges(&self, edges: &[CallEdge]) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "
            INSERT INTO call_edges (
              id, workspace_id, source_file_id, caller_symbol_id, callee_symbol_id,
              callee_qualified_name, callee_display_name, kind, resolved,
              start_line, start_column, end_line, end_column
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ",
        )?;

        for edge in edges {
            stmt.execute(params![
                edge.id,
                edge.workspace_id,
                edge.source_file_id,
                edge.caller_symbol_id,
                edge.callee_symbol_id,
                edge.callee_qualified_name,
                edge.callee_display_name,
                call_kind_to_str(edge.kind),
                bool_to_int(edge.resolved),
                edge.span.start_line as i64,
                edge.span.start_column as i64,
                edge.span.end_line as i64,
                edge.span.end_column as i64,
            ])?;
        }
        Ok(())
    }

    fn find_call_edges_by_file(&self, file_id: FileId) -> Result<Vec<CallEdge>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, source_file_id, caller_symbol_id, callee_symbol_id,
                   callee_qualified_name, callee_display_name, kind, resolved,
                   start_line, start_column, end_line, end_column
              FROM call_edges
             WHERE source_file_id = ?1
             ORDER BY id ASC
            ",
        )?;
        let rows = stmt.query_map(params![file_id], map_call_edge)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

impl ReferenceRepository for Database {
    fn insert_references(&self, references: &[Reference]) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "
            INSERT INTO [references] (
              id, workspace_id, source_file_id, source_symbol_id, target_symbol_id,
              target_name, kind, resolved, resolution_confidence,
              start_line, start_column, end_line, end_column
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ",
        )?;
        for reference in references {
            stmt.execute(params![
                reference.id,
                reference.workspace_id,
                reference.source_file_id,
                reference.source_symbol_id,
                reference.target_symbol_id,
                reference.target_name,
                reference_kind_to_str(reference.kind),
                bool_to_int(reference.resolved),
                reference.resolution_confidence,
                reference.span.start_line as i64,
                reference.span.start_column as i64,
                reference.span.end_line as i64,
                reference.span.end_column as i64,
            ])?;
        }
        Ok(())
    }

    fn find_references_by_file(&self, file_id: FileId) -> Result<Vec<Reference>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, workspace_id, source_file_id, source_symbol_id, target_symbol_id,
                   target_name, kind, resolved, resolution_confidence,
                   start_line, start_column, end_line, end_column
              FROM [references]
             WHERE source_file_id = ?1
             ORDER BY id ASC
            ",
        )?;
        let rows = stmt.query_map(params![file_id], map_reference)?;
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

fn map_import(row: &rusqlite::Row<'_>) -> rusqlite::Result<Import> {
    Ok(Import {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        source_file_id: row.get(2)?,
        source_symbol_id: row.get(3)?,
        raw_specifier: row.get(4)?,
        imported_name: row.get(5)?,
        local_name: row.get(6)?,
        alias: row.get(7)?,
        kind: import_kind_from_str(&row.get::<_, String>(8)?).map_err(to_sqlite_err)?,
        is_type_only: int_to_bool(row.get(9)?),
        is_reexport: int_to_bool(row.get(10)?),
        resolved_file_id: row.get(11)?,
        resolved_symbol_id: row.get(12)?,
        span: Span {
            start_byte: 0,
            end_byte: 0,
            start_line: row.get::<_, i64>(13)? as u32,
            start_column: row.get::<_, i64>(14)? as u32,
            end_line: row.get::<_, i64>(15)? as u32,
            end_column: row.get::<_, i64>(16)? as u32,
        },
        resolution_error: row.get(17)?,
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
        embedding_status: embedding_status_from_str(&row.get::<_, String>(17)?).map_err(to_sqlite_err)?,
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

fn map_call_edge(row: &rusqlite::Row<'_>) -> rusqlite::Result<CallEdge> {
    Ok(CallEdge {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        source_file_id: row.get(2)?,
        caller_symbol_id: row.get(3)?,
        callee_symbol_id: row.get(4)?,
        callee_qualified_name: row.get(5)?,
        callee_display_name: row.get(6)?,
        kind: call_kind_from_str(&row.get::<_, String>(7)?).map_err(to_sqlite_err)?,
        resolved: int_to_bool(row.get(8)?),
        span: Span {
            start_byte: 0,
            end_byte: 0,
            start_line: row.get::<_, i64>(9)? as u32,
            start_column: row.get::<_, i64>(10)? as u32,
            end_line: row.get::<_, i64>(11)? as u32,
            end_column: row.get::<_, i64>(12)? as u32,
        },
    })
}

fn map_reference(row: &rusqlite::Row<'_>) -> rusqlite::Result<Reference> {
    Ok(Reference {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        source_file_id: row.get(2)?,
        source_symbol_id: row.get(3)?,
        target_symbol_id: row.get(4)?,
        target_name: row.get(5)?,
        kind: reference_kind_from_str(&row.get::<_, String>(6)?).map_err(to_sqlite_err)?,
        resolved: int_to_bool(row.get(7)?),
        resolution_confidence: row.get(8)?,
        span: Span {
            start_byte: 0,
            end_byte: 0,
            start_line: row.get::<_, i64>(9)? as u32,
            start_column: row.get::<_, i64>(10)? as u32,
            end_line: row.get::<_, i64>(11)? as u32,
            end_column: row.get::<_, i64>(12)? as u32,
        },
    })
}

fn to_sqlite_err(err: StorageError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
}

fn bool_to_int(value: bool) -> i64 {
    if value { 1 } else { 0 }
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

fn import_kind_to_str(value: ImportKind) -> &'static str {
    match value {
        ImportKind::EsmDefault => "EsmDefault",
        ImportKind::EsmNamed => "EsmNamed",
        ImportKind::EsmNamespace => "EsmNamespace",
        ImportKind::EsmSideEffect => "EsmSideEffect",
        ImportKind::CommonJsRequire => "CommonJsRequire",
        ImportKind::Dynamic => "Dynamic",
        ImportKind::ConditionalRequire => "ConditionalRequire",
        ImportKind::ReExport => "ReExport",
    }
}

fn import_kind_from_str(value: &str) -> std::result::Result<ImportKind, StorageError> {
    match value {
        "EsmDefault" => Ok(ImportKind::EsmDefault),
        "EsmNamed" => Ok(ImportKind::EsmNamed),
        "EsmNamespace" => Ok(ImportKind::EsmNamespace),
        "EsmSideEffect" => Ok(ImportKind::EsmSideEffect),
        "CommonJsRequire" => Ok(ImportKind::CommonJsRequire),
        "Dynamic" => Ok(ImportKind::Dynamic),
        "ConditionalRequire" => Ok(ImportKind::ConditionalRequire),
        "ReExport" => Ok(ImportKind::ReExport),
        _ => Err(StorageError::InvalidEnumValue {
            field: "import_kind",
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

fn reference_kind_to_str(value: ReferenceKind) -> &'static str {
    match value {
        ReferenceKind::Read => "Read",
        ReferenceKind::Write => "Write",
        ReferenceKind::Call => "Call",
        ReferenceKind::Type => "Type",
        ReferenceKind::Import => "Import",
        ReferenceKind::Export => "Export",
        ReferenceKind::Inherit => "Inherit",
        ReferenceKind::Implement => "Implement",
    }
}

fn reference_kind_from_str(value: &str) -> std::result::Result<ReferenceKind, StorageError> {
    match value {
        "Read" => Ok(ReferenceKind::Read),
        "Write" => Ok(ReferenceKind::Write),
        "Call" => Ok(ReferenceKind::Call),
        "Type" => Ok(ReferenceKind::Type),
        "Import" => Ok(ReferenceKind::Import),
        "Export" => Ok(ReferenceKind::Export),
        "Inherit" => Ok(ReferenceKind::Inherit),
        "Implement" => Ok(ReferenceKind::Implement),
        _ => Err(StorageError::InvalidEnumValue {
            field: "reference_kind",
            value: value.to_string(),
        }),
    }
}

fn call_kind_to_str(value: CallKind) -> &'static str {
    match value {
        CallKind::Direct => "Direct",
        CallKind::Method => "Method",
        CallKind::Constructor => "Constructor",
        CallKind::MacroLike => "MacroLike",
        CallKind::Dynamic => "Dynamic",
    }
}

fn call_kind_from_str(value: &str) -> std::result::Result<CallKind, StorageError> {
    match value {
        "Direct" => Ok(CallKind::Direct),
        "Method" => Ok(CallKind::Method),
        "Constructor" => Ok(CallKind::Constructor),
        "MacroLike" => Ok(CallKind::MacroLike),
        "Dynamic" => Ok(CallKind::Dynamic),
        _ => Err(StorageError::InvalidEnumValue {
            field: "call_kind",
            value: value.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dh_types::{ChunkKind, ParseStatus};
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
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('files','symbols','imports','call_edges','references','chunks','index_state','index_runs')",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(count, 8);
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
        assert_eq!(fetched.expect("state exists").schema_version, SCHEMA_VERSION);
        Ok(())
    }
}
