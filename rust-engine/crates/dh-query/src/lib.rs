//! Query engine interfaces for graph-backed code intelligence.

use dh_types::{SymbolId, SymbolKind};

pub struct FindSymbolQuery {
    pub name: String,
    pub kinds: Option<Vec<SymbolKind>>,
    pub file_hint: Option<String>,
    pub namespace_hint: Option<String>,
    pub include_external: bool,
    pub limit: usize,
}

pub struct GotoDefinitionQuery {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub prefer_runtime_symbol: bool,
}

pub struct FindReferencesQuery {
    pub symbol_id: SymbolId,
    pub include_type_only: bool,
    pub include_tests: bool,
    pub limit: usize,
}

pub struct FindDependentsQuery;
pub struct FindDependenciesQuery;
pub struct CallHierarchyQuery;
pub struct TraceFlowQuery;
pub struct ImpactAnalysisQuery;

pub struct SymbolMatch;
pub struct DefinitionResult;
pub struct ReferenceResult;
pub struct DependencyTraversalResult;
pub struct CallHierarchyResult;
pub struct TraceFlowResult;
pub struct ImpactAnalysisResult;

pub trait QueryEngine {
    fn find_symbol(&self, query: FindSymbolQuery) -> anyhow::Result<Vec<SymbolMatch>>;
    fn goto_definition(&self, query: GotoDefinitionQuery) -> anyhow::Result<Option<DefinitionResult>>;
    fn find_references(&self, query: FindReferencesQuery) -> anyhow::Result<Vec<ReferenceResult>>;
    fn find_dependents(&self, query: FindDependentsQuery) -> anyhow::Result<DependencyTraversalResult>;
    fn find_dependencies(&self, query: FindDependenciesQuery) -> anyhow::Result<DependencyTraversalResult>;
    fn call_hierarchy(&self, query: CallHierarchyQuery) -> anyhow::Result<CallHierarchyResult>;
    fn trace_flow(&self, query: TraceFlowQuery) -> anyhow::Result<TraceFlowResult>;
    fn impact_analysis(&self, query: ImpactAnalysisQuery) -> anyhow::Result<ImpactAnalysisResult>;
}
