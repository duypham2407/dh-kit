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
#[serde(rename_all = "snake_case")]
pub enum FreshnessState {
    RetainedCurrent,
    RefreshedCurrent,
    DegradedPartial,
    NotCurrent,
    Deleted,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessReason {
    UnchangedUnaffected,
    ContentChanged,
    StructureChanged,
    PublicApiChanged,
    DependentInvalidated,
    ResolutionScopeChanged,
    DeletedPath,
    PathInvalidated,
    RecoverableParseIssues,
    FatalReadFailure,
    FatalParseFailure,
    FatalPersistFailure,
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
    pub freshness_state: FreshnessState,
    pub freshness_reason: Option<FreshnessReason>,
    pub last_freshness_run_id: Option<String>,
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
    ScanStarted {
        roots: usize,
    },
    ScanCompleted {
        files_seen: u64,
        files_selected: u64,
    },
    HashingProgress {
        done: u64,
        total: u64,
    },
    ParsingProgress {
        done: u64,
        total: u64,
    },
    WritingProgress {
        done: u64,
        total: u64,
    },
    EmbeddingQueued {
        chunks: u64,
    },
    Completed {
        changed_files: u64,
        duration_ms: u128,
    },
    Failed {
        stage: String,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileChangeEvent {
    Created { path: PathBuf },
    Modified { path: PathBuf },
    Deleted { path: PathBuf },
    Renamed { from: PathBuf, to: PathBuf },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnswerState {
    Grounded,
    Partial,
    Insufficient,
    Unsupported,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QuestionClass {
    FindSymbol,
    BuildEvidence,
    Definition,
    References,
    Dependencies,
    Dependents,
    CallHierarchy,
    TraceFlow,
    Impact,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum LanguageCapabilityState {
    Supported,
    Partial,
    BestEffort,
    Unsupported,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum LanguageCapability {
    ParseDiagnostics,
    StructuralIndexing,
    SymbolSearch,
    DefinitionLookup,
    Dependencies,
    Dependents,
    References,
    CallHierarchy,
    TraceFlow,
    Impact,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LanguageCapabilityEntry {
    pub language: LanguageId,
    pub capability: LanguageCapability,
    pub state: LanguageCapabilityState,
    pub reason: String,
    pub parser_backed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LanguageCapabilityLanguageSummary {
    pub language: LanguageId,
    pub state: LanguageCapabilityState,
    pub reason: String,
    pub parser_backed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LanguageCapabilitySummary {
    pub capability: LanguageCapability,
    pub weakest_state: LanguageCapabilityState,
    pub languages: Vec<LanguageCapabilityLanguageSummary>,
    pub retrieval_only: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    Definition,
    Reference,
    Dependency,
    Dependent,
    Call,
    TraceStep,
    ImpactEdge,
    Chunk,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceSource {
    Graph,
    Query,
    Storage,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceConfidence {
    Grounded,
    Partial,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EvidenceEntry {
    pub kind: EvidenceKind,
    pub file_path: String,
    pub symbol: Option<String>,
    pub line_start: Option<u32>,
    pub line_end: Option<u32>,
    pub snippet: Option<String>,
    pub reason: String,
    pub source: EvidenceSource,
    pub confidence: EvidenceConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct EvidenceBounds {
    pub hop_count: Option<u32>,
    pub node_limit: Option<usize>,
    pub traversal_scope: Option<String>,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EvidencePacket {
    pub answer_state: AnswerState,
    pub question_class: QuestionClass,
    pub subject: String,
    pub summary: String,
    pub conclusion: String,
    pub evidence: Vec<EvidenceEntry>,
    pub gaps: Vec<String>,
    pub bounds: EvidenceBounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkClass {
    ColdFullIndex,
    WarmNoChangeIndex,
    IncrementalReindex,
    ColdQuery,
    WarmQuery,
    ParityBenchmark,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkCorpusKind {
    CuratedFixture,
    DhRepo,
    ExternalRealRepo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BenchmarkCorpusRef {
    pub kind: BenchmarkCorpusKind,
    pub label: String,
    pub revision_or_snapshot: String,
    pub root_path: String,
    pub query_set_label: Option<String>,
    pub mutation_set_label: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct BenchmarkPreparationState {
    pub state_label: String,
    pub cleared_reusable_state: Option<bool>,
    pub preserved_reusable_state: Option<bool>,
    pub baseline_run_ref: Option<String>,
    pub mutation_set_label: Option<String>,
    pub mutation_paths: Vec<String>,
    pub query_set_label: Option<String>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BenchmarkRunMetadata {
    pub run_id: String,
    pub benchmark_class: BenchmarkClass,
    pub suite_id: String,
    pub started_at_unix_ms: i64,
    pub finished_at_unix_ms: i64,
    pub engine_version: String,
    pub build_profile: String,
    pub host_os: String,
    pub host_arch: String,
    pub cpu_count: usize,
    pub corpus: BenchmarkCorpusRef,
    pub preparation: BenchmarkPreparationState,
    pub baseline_run_ref: Option<String>,
    pub comparison_key: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BenchmarkResultStatus {
    Complete,
    Degraded,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryMeasurementStatus {
    Measured,
    NotMeasured,
    MeasurementFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemoryMeasurement {
    pub status: MemoryMeasurementStatus,
    pub peak_rss_bytes: Option<u64>,
    pub method: Option<String>,
    pub scope: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IndexBenchmarkMetrics {
    pub elapsed_ms: f64,
    pub scanned_files: u64,
    pub changed_files: u64,
    pub reindexed_files: u64,
    pub deleted_files: u64,
    pub refreshed_current_files: u64,
    pub retained_current_files: u64,
    pub degraded_partial_files: u64,
    pub not_current_files: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QueryLatencyMetrics {
    pub sample_count_requested: u32,
    pub sample_count_completed: u32,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub query_set_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParityBenchmarkMetrics {
    pub total_cases: u32,
    pub passed_cases: u32,
    pub failed_cases: u32,
    pub symbol_parity_pct: f32,
    pub import_parity_pct: f32,
    pub call_edge_parity_pct: f32,
    pub reference_parity_pct: f32,
    pub chunk_parity_pct: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BenchmarkComparison {
    pub eligible: bool,
    pub baseline_run_ref: Option<String>,
    pub comparison_key: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BenchmarkResult {
    pub metadata: BenchmarkRunMetadata,
    pub status: BenchmarkResultStatus,
    pub memory: MemoryMeasurement,
    pub comparison: BenchmarkComparison,
    pub correctness: Option<ParityBenchmarkMetrics>,
    pub index_timing: Option<IndexBenchmarkMetrics>,
    pub query_latency: Option<QueryLatencyMetrics>,
    pub degradation_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BenchmarkSummary {
    pub local_evidence_statement: String,
    pub corpus_summary: String,
    pub environment_summary: String,
    pub degraded: bool,
    pub result_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BenchmarkSuiteArtifact {
    pub schema_version: u32,
    pub suite_id: String,
    pub generated_at_unix_ms: i64,
    pub summary: BenchmarkSummary,
    pub results: Vec<BenchmarkResult>,
}
