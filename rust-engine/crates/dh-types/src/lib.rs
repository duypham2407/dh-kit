//! Core domain types for the DH Rust engine.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub type WorkspaceId = i64;
pub type RootId = i64;
pub type PackageId = i64;
pub type FileId = i64;
pub type SymbolId = i64;
pub type ChunkId = i64;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum LanguageId {
    TypeScript,
    Tsx,
    JavaScript,
    Jsx,
    Python,
    Go,
    Rust,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ParseStatus {
    Pending,
    Parsed,
    ParsedWithErrors,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Span {
    pub start_byte: u32,
    pub end_byte: u32,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct File {
    pub id: FileId,
    pub workspace_id: WorkspaceId,
    pub root_id: RootId,
    pub package_id: Option<PackageId>,
    pub rel_path: String,
    pub language: LanguageId,
    pub size_bytes: u64,
    pub mtime_unix_ms: i64,
    pub content_hash: String,
    pub structure_hash: Option<String>,
    pub public_api_hash: Option<String>,
    pub parse_status: ParseStatus,
    pub parse_error: Option<String>,
    pub symbol_count: u32,
    pub chunk_count: u32,
    pub is_barrel: bool,
    pub last_indexed_at_unix_ms: Option<i64>,
    pub deleted_at_unix_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SymbolKind {
    Module,
    Namespace,
    Function,
    Method,
    Class,
    Struct,
    Interface,
    Trait,
    TypeAlias,
    Enum,
    EnumMember,
    Variable,
    Constant,
    Field,
    Property,
    Parameter,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Visibility {
    Public,
    Protected,
    Private,
    Internal,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub id: SymbolId,
    pub workspace_id: WorkspaceId,
    pub file_id: FileId,
    pub parent_symbol_id: Option<SymbolId>,
    pub kind: SymbolKind,
    pub name: String,
    pub qualified_name: String,
    pub signature: Option<String>,
    pub detail: Option<String>,
    pub visibility: Visibility,
    pub exported: bool,
    pub async_flag: bool,
    pub static_flag: bool,
    pub span: Span,
    pub symbol_hash: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ImportKind {
    EsmDefault,
    EsmNamed,
    EsmNamespace,
    EsmSideEffect,
    CommonJsRequire,
    Dynamic,
    ConditionalRequire,
    ReExport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Import {
    pub id: i64,
    pub workspace_id: WorkspaceId,
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub raw_specifier: String,
    pub imported_name: Option<String>,
    pub local_name: Option<String>,
    pub alias: Option<String>,
    pub kind: ImportKind,
    pub is_type_only: bool,
    pub is_reexport: bool,
    pub resolved_file_id: Option<FileId>,
    pub resolved_symbol_id: Option<SymbolId>,
    pub span: Span,
    pub resolution_error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CallKind {
    Direct,
    Method,
    Constructor,
    MacroLike,
    Dynamic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallEdge {
    pub id: i64,
    pub workspace_id: WorkspaceId,
    pub source_file_id: FileId,
    pub caller_symbol_id: Option<SymbolId>,
    pub callee_symbol_id: Option<SymbolId>,
    pub callee_qualified_name: Option<String>,
    pub callee_display_name: String,
    pub kind: CallKind,
    pub resolved: bool,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReferenceKind {
    Read,
    Write,
    Call,
    Type,
    Import,
    Export,
    Inherit,
    Implement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    pub id: i64,
    pub workspace_id: WorkspaceId,
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub target_symbol_id: Option<SymbolId>,
    pub target_name: String,
    pub kind: ReferenceKind,
    pub resolved: bool,
    pub resolution_confidence: f32,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChunkKind {
    FileHeader,
    Module,
    Symbol,
    Method,
    ClassSummary,
    TestBlock,
    Doc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum EmbeddingStatus {
    NotQueued,
    Queued,
    Indexed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: ChunkId,
    pub workspace_id: WorkspaceId,
    pub file_id: FileId,
    pub symbol_id: Option<SymbolId>,
    pub parent_symbol_id: Option<SymbolId>,
    pub kind: ChunkKind,
    pub language: LanguageId,
    pub title: String,
    pub content: String,
    pub content_hash: String,
    pub token_estimate: u32,
    pub span: Span,
    pub prev_chunk_id: Option<ChunkId>,
    pub next_chunk_id: Option<ChunkId>,
    pub embedding_status: EmbeddingStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IndexRunStatus {
    Idle,
    Scanning,
    Hashing,
    Parsing,
    Writing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexState {
    pub workspace_id: WorkspaceId,
    pub schema_version: u32,
    pub index_version: u64,
    pub status: IndexRunStatus,
    pub active_run_id: Option<String>,
    pub total_files: u64,
    pub indexed_files: u64,
    pub dirty_files: u64,
    pub deleted_files: u64,
    pub last_scan_started_at_unix_ms: Option<i64>,
    pub last_scan_finished_at_unix_ms: Option<i64>,
    pub last_successful_index_at_unix_ms: Option<i64>,
    pub queued_embeddings: u64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileFacts {
    pub file: File,
    pub symbols: Vec<Symbol>,
    pub imports: Vec<Import>,
    pub call_edges: Vec<CallEdge>,
    pub references: Vec<Reference>,
    pub chunks: Vec<Chunk>,
    pub diagnostics: Vec<ParseDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCandidate {
    pub abs_path: PathBuf,
    pub rel_path: String,
    pub workspace_id: WorkspaceId,
    pub root_id: RootId,
    pub package_id: Option<PackageId>,
    pub language: LanguageId,
    pub size_bytes: u64,
    pub mtime_unix_ms: i64,
    pub executable: bool,
    pub shebang: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseDiagnostic {
    pub level: String,
    pub message: String,
    pub span: Option<Span>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportFact {
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub exported_name: String,
    pub local_name: Option<String>,
    pub raw_specifier: Option<String>,
    pub is_default: bool,
    pub is_star: bool,
    pub is_type_only: bool,
    pub span: Span,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IndexProgressEvent {
    ScanStarted { roots: usize },
    ScanCompleted { files_seen: u64, files_selected: u64 },
    HashingProgress { done: u64, total: u64 },
    ParsingProgress { done: u64, total: u64 },
    WritingProgress { done: u64, total: u64 },
    EmbeddingQueued { chunks: u64 },
    Completed { changed_files: u64, duration_ms: u128 },
    Failed { stage: String, message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileChangeEvent {
    Created { path: PathBuf },
    Modified { path: PathBuf },
    Deleted { path: PathBuf },
    Renamed { from: PathBuf, to: PathBuf },
}
