//! Bounded graph-backed query engine for supported question classes.

use anyhow::Result;
use dh_graph::{EdgeResolution, GraphService, NodeId};
use dh_storage::{ChunkRepository, Database, FileRepository, GraphRepository, SymbolRepository, GraphEdgeRepository};
use dh_types::{
    AnswerState, EvidenceBounds, EvidenceConfidence, EvidenceEntry, EvidenceKind, EvidencePacket,
    EvidenceSource, FreshnessState, LanguageCapability, LanguageCapabilityEntry,
    LanguageCapabilityLanguageSummary, LanguageCapabilityState, LanguageCapabilitySummary,
    LanguageId, ParseStatus, QuestionClass, SymbolId, SymbolKind, WorkspaceId,
};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct FindSymbolQuery {
    pub workspace_id: WorkspaceId,
    pub name: String,
    pub kinds: Option<Vec<SymbolKind>>,
    pub file_hint: Option<String>,
    pub namespace_hint: Option<String>,
    pub include_external: bool,
    pub limit: usize,
}

#[derive(Debug, Clone)]
pub struct GotoDefinitionQuery {
    pub workspace_id: WorkspaceId,
    pub symbol: String,
    pub file_path: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub prefer_runtime_symbol: bool,
}

#[derive(Debug, Clone)]
pub struct FindReferencesQuery {
    pub workspace_id: WorkspaceId,
    pub symbol_id: Option<SymbolId>,
    pub symbol: Option<String>,
    pub include_type_only: bool,
    pub include_tests: bool,
    pub limit: usize,
}

#[derive(Debug, Clone)]
pub struct FindDependenciesQuery {
    pub workspace_id: WorkspaceId,
    pub file_path: String,
    pub limit: usize,
}

#[derive(Debug, Clone)]
pub struct FindDependentsQuery {
    pub workspace_id: WorkspaceId,
    pub target: String,
    pub limit: usize,
}

#[derive(Debug, Clone)]
pub struct CallHierarchyQuery {
    pub workspace_id: WorkspaceId,
    pub symbol: String,
    pub limit: usize,
}

#[derive(Debug, Clone)]
pub struct TraceFlowQuery {
    pub workspace_id: WorkspaceId,
    pub from_symbol: String,
    pub to_symbol: String,
    pub max_hops: u32,
}

#[derive(Debug, Clone)]
pub struct ImpactAnalysisQuery {
    pub workspace_id: WorkspaceId,
    pub target: String,
    pub hop_limit: u32,
    pub node_limit: usize,
}

#[derive(Debug, Clone)]
pub struct BuildEvidenceQuery {
    pub workspace_id: WorkspaceId,
    pub query: String,
    pub intent: String,
    pub targets: Vec<String>,
    pub max_files: usize,
    pub max_symbols: usize,
    pub max_snippets: usize,
    pub freshness: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SymbolMatch {
    pub symbol_id: SymbolId,
    pub name: String,
    pub qualified_name: String,
    pub file_path: String,
    pub line_start: u32,
    pub line_end: u32,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct DefinitionResult {
    pub symbol_id: SymbolId,
    pub name: String,
    pub qualified_name: String,
    pub file_path: String,
    pub line_start: u32,
    pub line_end: u32,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct ReferenceResult {
    pub file_path: String,
    pub symbol_id: Option<SymbolId>,
    pub line_start: u32,
    pub line_end: u32,
    pub reason: String,
    pub resolved: bool,
}

#[derive(Debug, Clone)]
pub struct ReferencesQueryResult {
    pub answer_state: AnswerState,
    pub items: Vec<ReferenceResult>,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct DependencyTraversalResult {
    pub answer_state: AnswerState,
    pub items: Vec<String>,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct CallHierarchyResult {
    pub answer_state: AnswerState,
    pub callers: Vec<String>,
    pub callees: Vec<String>,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct TraceFlowResult {
    pub answer_state: AnswerState,
    pub path: Vec<String>,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct ImpactAnalysisResult {
    pub answer_state: AnswerState,
    pub impacted: Vec<String>,
    pub evidence: EvidencePacket,
}

#[derive(Debug, Clone)]
pub struct BuildEvidenceResult {
    pub answer_state: AnswerState,
    pub evidence: EvidencePacket,
}

const IN_SCOPE_QUERY_LANGUAGES: [LanguageId; 7] = [
    LanguageId::TypeScript,
    LanguageId::Tsx,
    LanguageId::JavaScript,
    LanguageId::Jsx,
    LanguageId::Python,
    LanguageId::Go,
    LanguageId::Rust,
];

const ALL_CAPABILITIES: [LanguageCapability; 10] = [
    LanguageCapability::ParseDiagnostics,
    LanguageCapability::StructuralIndexing,
    LanguageCapability::SymbolSearch,
    LanguageCapability::DefinitionLookup,
    LanguageCapability::Dependencies,
    LanguageCapability::Dependents,
    LanguageCapability::References,
    LanguageCapability::CallHierarchy,
    LanguageCapability::TraceFlow,
    LanguageCapability::Impact,
];

pub fn language_capability_matrix() -> Vec<LanguageCapabilityEntry> {
    let mut entries = Vec::new();
    for language in IN_SCOPE_QUERY_LANGUAGES {
        for capability in ALL_CAPABILITIES {
            entries.push(language_capability_for(language, capability));
        }
    }
    for capability in ALL_CAPABILITIES {
        entries.push(language_capability_for(LanguageId::Unknown, capability));
    }
    entries
}

pub fn language_capability_for(
    language: LanguageId,
    capability: LanguageCapability,
) -> LanguageCapabilityEntry {
    let (state, reason, parser_backed) = capability_state_for(language, capability);
    LanguageCapabilityEntry {
        language,
        capability,
        state,
        reason: reason.to_string(),
        parser_backed,
    }
}

pub fn summarize_language_capability(
    capability: LanguageCapability,
    languages: &[LanguageId],
    retrieval_only: bool,
) -> LanguageCapabilitySummary {
    let input_languages: Vec<LanguageId> = if languages.is_empty() {
        IN_SCOPE_QUERY_LANGUAGES.to_vec()
    } else {
        let mut seen = HashSet::new();
        let mut deduped = Vec::new();
        for language in languages {
            if seen.insert(*language) {
                deduped.push(*language);
            }
        }
        deduped
    };

    let mut summaries = input_languages
        .into_iter()
        .map(|language| {
            let entry = language_capability_for(language, capability);
            LanguageCapabilityLanguageSummary {
                language: entry.language,
                state: entry.state,
                reason: entry.reason,
                parser_backed: entry.parser_backed,
            }
        })
        .collect::<Vec<_>>();

    summaries.sort_by_key(|entry| language_order_rank(entry.language));

    let weakest_state = summaries
        .iter()
        .map(|entry| entry.state)
        .min_by_key(|state| capability_state_rank(*state))
        .unwrap_or(LanguageCapabilityState::Supported);

    LanguageCapabilitySummary {
        capability,
        weakest_state,
        languages: summaries,
        retrieval_only,
    }
}

pub fn classify_relationship_support(
    relation: &str,
    languages: &[LanguageId],
    retrieval_only: bool,
) -> LanguageCapabilitySummary {
    let capability = map_relation_to_capability(relation);
    summarize_language_capability(capability, languages, retrieval_only)
}

pub fn classify_search_support(
    mode: &str,
    languages: &[LanguageId],
    retrieval_only: bool,
) -> LanguageCapabilitySummary {
    let capability = match mode {
        "symbol" => LanguageCapability::SymbolSearch,
        _ => LanguageCapability::StructuralIndexing,
    };
    summarize_language_capability(capability, languages, retrieval_only)
}

pub fn infer_query_languages_from_paths(paths: &[String]) -> Vec<LanguageId> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for path in paths {
        if let Some(language) = infer_language_from_path(path) {
            if seen.insert(language) {
                out.push(language);
            }
        }
    }

    out
}

pub fn infer_language_from_path(path: &str) -> Option<LanguageId> {
    let lower = path.to_ascii_lowercase();

    if lower.ends_with(".tsx") {
        return Some(LanguageId::Tsx);
    }
    if lower.ends_with(".ts") || lower.ends_with(".mts") || lower.ends_with(".cts") {
        return Some(LanguageId::TypeScript);
    }
    if lower.ends_with(".jsx") {
        return Some(LanguageId::Jsx);
    }
    if lower.ends_with(".js") || lower.ends_with(".mjs") || lower.ends_with(".cjs") {
        return Some(LanguageId::JavaScript);
    }
    if lower.ends_with(".py") {
        return Some(LanguageId::Python);
    }
    if lower.ends_with(".go") {
        return Some(LanguageId::Go);
    }
    if lower.ends_with(".rs") {
        return Some(LanguageId::Rust);
    }

    None
}

pub fn language_id_to_wire(language: LanguageId) -> &'static str {
    match language {
        LanguageId::TypeScript => "typescript",
        LanguageId::Tsx => "tsx",
        LanguageId::JavaScript => "javascript",
        LanguageId::Jsx => "jsx",
        LanguageId::Python => "python",
        LanguageId::Go => "go",
        LanguageId::Rust => "rust",
        LanguageId::Unknown => "unknown",
    }
}

pub fn capability_state_to_wire(state: LanguageCapabilityState) -> &'static str {
    match state {
        LanguageCapabilityState::Supported => "supported",
        LanguageCapabilityState::Partial => "partial",
        LanguageCapabilityState::BestEffort => "best_effort",
        LanguageCapabilityState::Unsupported => "unsupported",
    }
}

pub fn capability_to_wire(capability: LanguageCapability) -> &'static str {
    match capability {
        LanguageCapability::ParseDiagnostics => "parse_diagnostics",
        LanguageCapability::StructuralIndexing => "structural_indexing",
        LanguageCapability::SymbolSearch => "symbol_search",
        LanguageCapability::DefinitionLookup => "definition_lookup",
        LanguageCapability::Dependencies => "dependencies",
        LanguageCapability::Dependents => "dependents",
        LanguageCapability::References => "references",
        LanguageCapability::CallHierarchy => "call_hierarchy",
        LanguageCapability::TraceFlow => "trace_flow",
        LanguageCapability::Impact => "impact",
    }
}

fn map_relation_to_capability(relation: &str) -> LanguageCapability {
    match relation {
        "usage" => LanguageCapability::References,
        "dependencies" => LanguageCapability::Dependencies,
        "dependents" => LanguageCapability::Dependents,
        "call_hierarchy" => LanguageCapability::CallHierarchy,
        "trace_flow" => LanguageCapability::TraceFlow,
        "impact" => LanguageCapability::Impact,
        _ => LanguageCapability::StructuralIndexing,
    }
}

fn capability_state_for(
    language: LanguageId,
    capability: LanguageCapability,
) -> (LanguageCapabilityState, &'static str, bool) {
    match language {
        LanguageId::TypeScript
        | LanguageId::Tsx
        | LanguageId::JavaScript
        | LanguageId::Jsx => (
            LanguageCapabilityState::Supported,
            "TS/JS baseline is the strongest bounded parser-backed path for this capability.",
            true,
        ),
        LanguageId::Python => match capability {
            LanguageCapability::ParseDiagnostics
            | LanguageCapability::StructuralIndexing
            | LanguageCapability::SymbolSearch
            | LanguageCapability::DefinitionLookup => (
                LanguageCapabilityState::Supported,
                "Python support is parser-backed for bounded structural parse/index and direct retrieval capabilities.",
                true,
            ),
            LanguageCapability::Dependencies | LanguageCapability::Dependents => (
                LanguageCapabilityState::Partial,
                "Python dependency/dependent lookup remains partial because import resolution is bounded and unresolved imports are expected.",
                true,
            ),
            LanguageCapability::References => (
                LanguageCapabilityState::Partial,
                "Python reference depth is intentionally partial in this release.",
                true,
            ),
            LanguageCapability::CallHierarchy
            | LanguageCapability::TraceFlow
            | LanguageCapability::Impact => (
                LanguageCapabilityState::Unsupported,
                "Python deep relation capabilities are intentionally unsupported in this release boundary.",
                false,
            ),
        },
        LanguageId::Go => match capability {
            LanguageCapability::ParseDiagnostics
            | LanguageCapability::StructuralIndexing
            | LanguageCapability::SymbolSearch => (
                LanguageCapabilityState::Supported,
                "Go support is parser-backed for bounded structural parse/index and direct retrieval capabilities.",
                true,
            ),
            LanguageCapability::DefinitionLookup => (
                LanguageCapabilityState::Partial,
                "Go definition lookup remains partial until same-package awareness is complete for bounded direct definition cases.",
                true,
            ),
            LanguageCapability::Dependencies | LanguageCapability::Dependents => (
                LanguageCapabilityState::Partial,
                "Go dependency/dependent lookup remains partial because import resolution is bounded and unresolved imports are expected.",
                true,
            ),
            LanguageCapability::References => (
                LanguageCapabilityState::Partial,
                "Go reference/usage depth is intentionally partial in this release.",
                true,
            ),
            LanguageCapability::CallHierarchy => (
                LanguageCapabilityState::BestEffort,
                "Go call hierarchy is best-effort and syntax-first for this release.",
                true,
            ),
            LanguageCapability::TraceFlow | LanguageCapability::Impact => (
                LanguageCapabilityState::Unsupported,
                "Go trace/impact capabilities are intentionally unsupported in this release boundary.",
                false,
            ),
        },
        LanguageId::Rust => match capability {
            LanguageCapability::ParseDiagnostics
            | LanguageCapability::StructuralIndexing
            | LanguageCapability::SymbolSearch
            | LanguageCapability::DefinitionLookup => (
                LanguageCapabilityState::Supported,
                "Rust support is parser-backed for bounded structural parse/index and direct retrieval capabilities.",
                true,
            ),
            LanguageCapability::Dependencies | LanguageCapability::Dependents => (
                LanguageCapabilityState::Partial,
                "Rust dependency/dependent lookup remains partial because use-path resolution is bounded and unresolved imports are expected.",
                true,
            ),
            LanguageCapability::References => (
                LanguageCapabilityState::Partial,
                "Rust reference/usage depth is intentionally partial in this release.",
                true,
            ),
            LanguageCapability::CallHierarchy => (
                LanguageCapabilityState::BestEffort,
                "Rust call hierarchy is best-effort when macro/trait-heavy code reduces certainty.",
                true,
            ),
            LanguageCapability::TraceFlow | LanguageCapability::Impact => (
                LanguageCapabilityState::Unsupported,
                "Rust trace/impact capabilities are intentionally unsupported in this release boundary.",
                false,
            ),
        },
        LanguageId::Unknown => (
            LanguageCapabilityState::Unsupported,
            "Unsupported language family for parser-backed code intelligence in this release.",
            false,
        ),
    }
}

fn capability_state_rank(state: LanguageCapabilityState) -> u8 {
    match state {
        LanguageCapabilityState::Supported => 3,
        LanguageCapabilityState::Partial => 2,
        LanguageCapabilityState::BestEffort => 1,
        LanguageCapabilityState::Unsupported => 0,
    }
}

fn language_order_rank(language: LanguageId) -> u8 {
    match language {
        LanguageId::TypeScript => 0,
        LanguageId::Tsx => 1,
        LanguageId::JavaScript => 2,
        LanguageId::Jsx => 3,
        LanguageId::Python => 4,
        LanguageId::Go => 5,
        LanguageId::Rust => 6,
        LanguageId::Unknown => 255,
    }
}

pub trait QueryEngine {
    fn find_symbol(&self, query: FindSymbolQuery) -> Result<Vec<SymbolMatch>>;
    fn build_evidence(&self, query: BuildEvidenceQuery) -> Result<BuildEvidenceResult>;
    fn goto_definition(&self, query: GotoDefinitionQuery) -> Result<Option<DefinitionResult>>;
    fn find_references(&self, query: FindReferencesQuery) -> Result<ReferencesQueryResult>;
    fn find_dependents(&self, query: FindDependentsQuery) -> Result<DependencyTraversalResult>;
    fn find_dependencies(&self, query: FindDependenciesQuery) -> Result<DependencyTraversalResult>;
    fn call_hierarchy(&self, query: CallHierarchyQuery) -> Result<CallHierarchyResult>;
    fn trace_flow(&self, query: TraceFlowQuery) -> Result<TraceFlowResult>;
    fn impact_analysis(&self, query: ImpactAnalysisQuery) -> Result<ImpactAnalysisResult>;
}

impl QueryEngine for Database {
    fn find_symbol(&self, query: FindSymbolQuery) -> Result<Vec<SymbolMatch>> {
        let mut symbols =
            self.find_symbol_definitions(query.workspace_id, &query.name, query.limit)?;

        if let Some(kinds) = &query.kinds {
            symbols.retain(|s| kinds.contains(&s.kind));
        }

        if let Some(file_hint) = &query.file_hint {
            let hint = file_hint.to_lowercase();
            symbols.retain(|s| {
                self.find_file_by_id(query.workspace_id, s.file_id)
                    .ok()
                    .flatten()
                    .map(|f| f.rel_path.to_lowercase().contains(&hint))
                    .unwrap_or(false)
            });
        }

        if let Some(namespace_hint) = &query.namespace_hint {
            let hint = namespace_hint.to_lowercase();
            symbols.retain(|s| s.qualified_name.to_lowercase().contains(&hint));
        }

        let mut out = Vec::new();
        for symbol in symbols.into_iter().take(query.limit) {
            let file = self.find_file_by_id(query.workspace_id, symbol.file_id)?;
            let file_path = file
                .map(|f| f.rel_path)
                .unwrap_or_else(|| "<unknown>".into());
            out.push(SymbolMatch {
                symbol_id: symbol.id,
                name: symbol.name.clone(),
                qualified_name: symbol.qualified_name.clone(),
                file_path: file_path.clone(),
                line_start: symbol.span.start_line,
                line_end: symbol.span.end_line,
                evidence: packet(
                    AnswerState::Grounded,
                    QuestionClass::FindSymbol,
                    format!("symbol:{}", query.name),
                    format!("Found symbol {}", symbol.name),
                    format!("{} defined in {}", symbol.name, file_path),
                    vec![entry(
                        EvidenceKind::Definition,
                        file_path,
                        Some(symbol.qualified_name.clone()),
                        Some(symbol.span.start_line),
                        Some(symbol.span.end_line),
                        None,
                        "symbol definition indexed".into(),
                        EvidenceSource::Storage,
                        EvidenceConfidence::Grounded,
                    )],
                    Vec::new(),
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: Some(query.limit),
                        traversal_scope: Some("symbol_lookup".into()),
                        stop_reason: None,
                    },
                ),
            });
        }
        Ok(out)
    }

    fn build_evidence(&self, query: BuildEvidenceQuery) -> Result<BuildEvidenceResult> {
        let trimmed_query = query.query.trim().to_string();
        if trimmed_query.is_empty() {
            return Ok(BuildEvidenceResult {
                answer_state: AnswerState::Insufficient,
                evidence: packet(
                    AnswerState::Insufficient,
                    QuestionClass::BuildEvidence,
                    "<empty>".into(),
                    "Build evidence".into(),
                    "insufficient evidence request: query is empty".into(),
                    Vec::new(),
                    vec!["missing query text for buildEvidence".into()],
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: Some(query.max_files.max(1)),
                        traversal_scope: Some("build_evidence".into()),
                        stop_reason: Some("missing_query".into()),
                    },
                ),
            });
        }

        let lowered_query = trimmed_query.to_ascii_lowercase();
        let intent = query.intent.trim();
        if !intent.is_empty() && !intent.eq_ignore_ascii_case("explain") {
            return Ok(BuildEvidenceResult {
                answer_state: AnswerState::Unsupported,
                evidence: packet(
                    AnswerState::Unsupported,
                    QuestionClass::BuildEvidence,
                    trimmed_query,
                    "Build evidence (explain)".into(),
                    format!(
                        "unsupported build-evidence intent: '{intent}' is outside the bounded explain-only contract"
                    ),
                    Vec::new(),
                    vec![format!(
                        "query.buildEvidence intent must be empty or 'explain'; received '{intent}'"
                    )],
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: Some(query.max_files.max(1)),
                        traversal_scope: Some("build_evidence".into()),
                        stop_reason: Some("unsupported_intent".into()),
                    },
                ),
            });
        }

        if let Some((unsupported_class, reason)) =
            classify_unsupported_build_evidence_request(&lowered_query)
        {
            return Ok(BuildEvidenceResult {
                answer_state: AnswerState::Unsupported,
                evidence: packet(
                    AnswerState::Unsupported,
                    QuestionClass::BuildEvidence,
                    trimmed_query,
                    "Build evidence (explain)".into(),
                    format!(
                        "unsupported build-evidence request: {unsupported_class} is outside the bounded static repository-understanding contract"
                    ),
                    Vec::new(),
                    vec![reason.to_string()],
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: Some(query.max_files.max(1)),
                        traversal_scope: Some("build_evidence".into()),
                        stop_reason: Some(unsupported_class.into()),
                    },
                ),
            });
        }

        let mut subject_hints = Vec::new();
        if !query.targets.is_empty() {
            subject_hints.extend(query.targets.clone());
        }
        subject_hints.extend(extract_subject_tokens(&trimmed_query));
        if subject_hints.is_empty() {
            subject_hints.push(trimmed_query.clone());
        }

        let mut evidence_rows = Vec::new();
        let mut gaps = Vec::new();
        let mut unsupported_language_boundary = false;
        let mut degraded_index_boundary = false;
        let mut seen = HashSet::new();
        let mut limited = false;
        let max_evidence_rows = query.max_files.max(1) * query.max_snippets.max(1);

        'targets: for target in &subject_hints {
            let symbols =
                self.find_symbol_definitions(query.workspace_id, target, query.max_symbols.max(1))?;
            for symbol in symbols {
                let file = self.find_file_by_id(query.workspace_id, symbol.file_id)?;
                let file_path = file
                    .as_ref()
                    .map(|file| file.rel_path.clone())
                    .unwrap_or_else(|| "<unknown>".into());

                if let Some(file) = &file {
                    let capability = language_capability_for(
                        file.language,
                        LanguageCapability::StructuralIndexing,
                    );
                    if capability.state == LanguageCapabilityState::Unsupported {
                        unsupported_language_boundary = true;
                        push_unique_gap(
                            &mut gaps,
                            format!(
                                "unsupported language/capability boundary at {}: {}",
                                file.rel_path, capability.reason
                            ),
                        );
                        continue;
                    }
                    if capability.state != LanguageCapabilityState::Supported {
                        degraded_index_boundary = true;
                        push_unique_gap(
                            &mut gaps,
                            format!(
                                "partial language/capability boundary at {}: {}",
                                file.rel_path, capability.reason
                            ),
                        );
                    }
                    if file.parse_status != ParseStatus::Parsed {
                        degraded_index_boundary = true;
                        push_unique_gap(
                            &mut gaps,
                            format!(
                                "partial index coverage for {}: parse status is {:?}",
                                file.rel_path, file.parse_status
                            ),
                        );
                    }
                    if !matches!(
                        file.freshness_state,
                        FreshnessState::RefreshedCurrent | FreshnessState::RetainedCurrent
                    ) {
                        degraded_index_boundary = true;
                        push_unique_gap(
                            &mut gaps,
                            format!(
                                "stale or partial index coverage for {}: freshness state is {:?}",
                                file.rel_path, file.freshness_state
                            ),
                        );
                    }
                } else {
                    degraded_index_boundary = true;
                    push_unique_gap(
                        &mut gaps,
                        format!("indexed symbol '{}' points to a missing file", symbol.name),
                    );
                }

                let key = format!(
                    "definition:{}:{}:{}",
                    file_path, symbol.qualified_name, symbol.span.start_line
                );
                if !seen.insert(key) {
                    continue;
                }
                if evidence_rows.len() >= max_evidence_rows {
                    limited = true;
                    break 'targets;
                }

                evidence_rows.push(entry(
                    EvidenceKind::Definition,
                    file_path.clone(),
                    Some(symbol.qualified_name.clone()),
                    Some(symbol.span.start_line),
                    Some(symbol.span.end_line),
                    None,
                    format!("indexed symbol candidate for '{}'", target),
                    EvidenceSource::Storage,
                    EvidenceConfidence::Grounded,
                ));

                for chunk in self
                    .find_chunks_by_file(symbol.file_id)?
                    .into_iter()
                    .filter(|chunk| {
                        chunk.symbol_id == Some(symbol.id)
                            || chunk.parent_symbol_id == Some(symbol.id)
                    })
                    .take(query.max_snippets.max(1))
                {
                    let snippet = bounded_snippet(&chunk.content, 240);
                    let chunk_key = format!(
                        "chunk:{}:{}:{}",
                        file_path, chunk.span.start_line, chunk.span.end_line
                    );
                    if !seen.insert(chunk_key) {
                        continue;
                    }
                    if evidence_rows.len() >= max_evidence_rows {
                        limited = true;
                        break 'targets;
                    }
                    evidence_rows.push(entry(
                        EvidenceKind::Chunk,
                        file_path.clone(),
                        Some(symbol.qualified_name.clone()),
                        Some(chunk.span.start_line),
                        Some(chunk.span.end_line),
                        Some(snippet),
                        format!("semantic chunk for symbol '{}'", symbol.name),
                        EvidenceSource::Storage,
                        EvidenceConfidence::Grounded,
                    ));
                }
            }
        }

        if evidence_rows.len() > max_evidence_rows {
            evidence_rows.truncate(max_evidence_rows);
            limited = true;
        }

        let unresolved_rows = evidence_rows
            .iter()
            .filter(|row| row.confidence == EvidenceConfidence::Partial)
            .count();

        let answer_state = if evidence_rows.is_empty() && unsupported_language_boundary {
            AnswerState::Unsupported
        } else if evidence_rows.is_empty() {
            AnswerState::Insufficient
        } else if unresolved_rows > 0
            || limited
            || degraded_index_boundary
            || unsupported_language_boundary
        {
            AnswerState::Partial
        } else {
            AnswerState::Grounded
        };

        if evidence_rows.is_empty() {
            push_unique_gap(
                &mut gaps,
                "no indexed evidence entries matched the requested subject(s)".into(),
            );
        }
        if limited {
            push_unique_gap(
                &mut gaps,
                "bounded evidence limits reached; packet is truncated".into(),
            );
        }
        if let Some(freshness) = query.freshness.as_deref() {
            if freshness.eq_ignore_ascii_case("requireFresh")
                || freshness.eq_ignore_ascii_case("require_fresh")
            {
                push_unique_gap(
                    &mut gaps,
                    "freshness requirement requested; packet is grounded to current indexed state only"
                        .into(),
                );
            }
        }

        let summary_subject = if subject_hints.is_empty() {
            trimmed_query.clone()
        } else {
            subject_hints.join(", ")
        };

        let conclusion = if answer_state == AnswerState::Grounded {
            "bounded canonical evidence packet assembled from indexed definition and snippet truth"
                .to_string()
        } else if answer_state == AnswerState::Partial {
            "bounded canonical evidence packet assembled from indexed definition and snippet truth with explicit partial limits".to_string()
        } else if answer_state == AnswerState::Unsupported {
            "unsupported language or capability boundary prevents a canonical build-evidence packet"
                .to_string()
        } else {
            "insufficient indexed evidence for bounded canonical packet".to_string()
        };

        Ok(BuildEvidenceResult {
            answer_state,
            evidence: packet(
                answer_state,
                QuestionClass::BuildEvidence,
                summary_subject,
                format!(
                    "Build evidence ({})",
                    if query.intent.trim().is_empty() {
                        "explain"
                    } else {
                        query.intent.as_str()
                    }
                ),
                conclusion,
                evidence_rows,
                gaps,
                EvidenceBounds {
                    hop_count: Some(2),
                    node_limit: Some(query.max_files.max(1)),
                    traversal_scope: Some("build_evidence".into()),
                    stop_reason: if limited {
                        Some("node_limit_reached".into())
                    } else if answer_state == AnswerState::Unsupported {
                        Some("unsupported_language_capability".into())
                    } else if degraded_index_boundary || unsupported_language_boundary {
                        Some("partial_index_or_capability".into())
                    } else if answer_state == AnswerState::Insufficient {
                        Some("insufficient_evidence".into())
                    } else {
                        None
                    },
                },
            ),
        })
    }

    fn goto_definition(&self, query: GotoDefinitionQuery) -> Result<Option<DefinitionResult>> {
        let mut symbols = self.find_symbol_definitions(query.workspace_id, &query.symbol, 8)?;
        if let Some(path) = &query.file_path {
            let lowered = path.to_lowercase();
            symbols.retain(|s| {
                self.find_file_by_id(query.workspace_id, s.file_id)
                    .ok()
                    .flatten()
                    .map(|f| f.rel_path.to_lowercase() == lowered)
                    .unwrap_or(false)
            });
        }
        if symbols.is_empty() {
            return Ok(None);
        }
        let symbol = symbols.remove(0);
        let file = self.find_file_by_id(query.workspace_id, symbol.file_id)?;
        let file_path = file
            .map(|f| f.rel_path)
            .unwrap_or_else(|| "<unknown>".into());
        Ok(Some(DefinitionResult {
            symbol_id: symbol.id,
            name: symbol.name.clone(),
            qualified_name: symbol.qualified_name.clone(),
            file_path: file_path.clone(),
            line_start: symbol.span.start_line,
            line_end: symbol.span.end_line,
            evidence: packet(
                AnswerState::Grounded,
                QuestionClass::Definition,
                query.symbol,
                "Definition located".into(),
                format!(
                    "Definition found at {}:{}",
                    file_path, symbol.span.start_line
                ),
                vec![entry(
                    EvidenceKind::Definition,
                    file_path,
                    Some(symbol.qualified_name),
                    Some(symbol.span.start_line),
                    Some(symbol.span.end_line),
                    None,
                    "storage definition match".into(),
                    EvidenceSource::Storage,
                    EvidenceConfidence::Grounded,
                )],
                Vec::new(),
                EvidenceBounds {
                    hop_count: Some(0),
                    node_limit: Some(1),
                    traversal_scope: Some("goto_definition".into()),
                    stop_reason: None,
                },
            ),
        }))
    }

    fn find_references(&self, query: FindReferencesQuery) -> Result<ReferencesQueryResult> {
        let references: Vec<dh_types::GraphEdge> = if let Some(symbol_id) = query.symbol_id {
            self.find_incoming_edges(query.workspace_id, "symbol", symbol_id as i64, query.limit)?
                .into_iter()
                .filter(|e| matches!(e.kind, dh_types::EdgeKind::References))
                .collect()
        } else if let Some(symbol) = &query.symbol {
            let mut refs = Vec::new();
            if let Ok(syms) = self.find_symbol_definitions(query.workspace_id, symbol, 1) {
                if let Some(s) = syms.first() {
                    refs = self.find_incoming_edges(query.workspace_id, "symbol", s.id as i64, query.limit)?
                        .into_iter()
                        .filter(|e| matches!(e.kind, dh_types::EdgeKind::References))
                        .collect();
                }
            }
            refs
        } else {
            Vec::new()
        };

        let mut out = Vec::new();
        let mut evidence = Vec::new();
        let mut unresolved_seen = false;
        let subject = query
            .symbol
            .clone()
            .or(query.symbol_id.map(|id| id.to_string()))
            .unwrap_or_else(|| "<unknown>".into());
        for r in references {
            let source_file_id = match &r.from {
                NodeId::File(id) => *id,
                NodeId::Symbol(id) => self.find_symbol_by_id(query.workspace_id, *id)?.map(|s| s.file_id).unwrap_or(0),
                _ => 0,
            };
            let source_symbol_id = match &r.from {
                NodeId::Symbol(id) => Some(*id),
                _ => None,
            };
            let resolved = r.resolution == EdgeResolution::Resolved;

            let file_path = self
                .find_file_by_id(query.workspace_id, source_file_id)?
                .map(|f| f.rel_path)
                .unwrap_or_else(|| "<unknown>".into());
            if !query.include_tests && file_path.contains("test") {
                continue;
            }
            out.push(ReferenceResult {
                file_path: file_path.clone(),
                symbol_id: source_symbol_id,
                line_start: r.span.as_ref().map(|s| s.start_line).unwrap_or(0),
                line_end: r.span.as_ref().map(|s| s.end_line).unwrap_or(0),
                reason: r.reason.clone(),
                resolved,
            });
            evidence.push(entry(
                EvidenceKind::Reference,
                file_path,
                source_symbol_id
                    .and_then(|id| {
                        self.find_symbol_by_id(query.workspace_id, id)
                            .ok()
                            .flatten()
                    })
                    .map(|s| s.qualified_name),
                r.span.as_ref().map(|s| s.start_line),
                r.span.as_ref().map(|s| s.end_line),
                None,
                r.reason.clone(),
                EvidenceSource::Graph,
                if resolved {
                    EvidenceConfidence::Grounded
                } else {
                    unresolved_seen = true;
                    EvidenceConfidence::Partial
                },
            ));
            if out.len() >= query.limit {
                break;
            }
        }

        let answer_state = if out.is_empty() {
            AnswerState::Insufficient
        } else if unresolved_seen {
            AnswerState::Partial
        } else {
            AnswerState::Grounded
        };

        Ok(ReferencesQueryResult {
            answer_state,
            items: out,
            evidence: packet(
                answer_state,
                QuestionClass::References,
                subject,
                "References lookup".into(),
                if answer_state == AnswerState::Grounded {
                    "Found grounded references".into()
                } else if answer_state == AnswerState::Partial {
                    "Found references with unresolved edges".into()
                } else {
                    "No references found in bounded index scope".into()
                },
                evidence,
                if answer_state == AnswerState::Partial {
                    vec!["one or more references are unresolved".into()]
                } else if answer_state == AnswerState::Insufficient {
                    vec!["no references found for subject".into()]
                } else {
                    Vec::new()
                },
                EvidenceBounds {
                    hop_count: Some(1),
                    node_limit: Some(query.limit),
                    traversal_scope: Some("references_direct".into()),
                    stop_reason: None,
                },
            ),
        })
    }

    fn find_dependents(&self, query: FindDependentsQuery) -> Result<DependencyTraversalResult> {
        let files = self.list_files_by_workspace(query.workspace_id)?;
        let mut items = Vec::new();
        let mut evidence = Vec::new();
        let mut unresolved_seen = false;

        if let Some(target_file) = files.iter().find(|f| f.rel_path == query.target) {
            let edges = self.find_incoming_edges(query.workspace_id, "file", target_file.id as i64, query.limit)?
                .into_iter()
                .filter(|e| matches!(e.kind, dh_types::EdgeKind::Imports) || matches!(e.kind, dh_types::EdgeKind::ReExports));
            for imp in edges {
                let source_file_id = match imp.from {
                    NodeId::File(id) => id,
                    _ => continue,
                };
                if let Some(src) = files.iter().find(|f| f.id == source_file_id) {
                    items.push(src.rel_path.clone());
                    evidence.push(entry(
                        EvidenceKind::Dependent,
                        src.rel_path.clone(),
                        None,
                        imp.span.as_ref().map(|s| s.start_line),
                        imp.span.as_ref().map(|s| s.end_line),
                        None,
                        format!("imports {}", query.target),
                        EvidenceSource::Graph,
                        EvidenceConfidence::Grounded,
                    ));
                }
            }
        } else {
            let symbols = self.find_symbol_definitions(query.workspace_id, &query.target, 1)?;
            if let Some(target_symbol) = symbols.first() {
                let edges = self.find_incoming_edges(query.workspace_id, "symbol", target_symbol.id as i64, query.limit)?
                    .into_iter()
                    .filter(|e| matches!(e.kind, dh_types::EdgeKind::References));
                for r in edges {
                    let source_file_id = match r.from {
                        NodeId::File(id) => id,
                        NodeId::Symbol(id) => self.find_symbol_by_id(query.workspace_id, id)?.map(|s| s.file_id).unwrap_or(0),
                        _ => 0,
                    };
                    if let Some(src) = files.iter().find(|f| f.id == source_file_id) {
                        let resolved = r.resolution == EdgeResolution::Resolved;
                        if !resolved {
                            unresolved_seen = true;
                        }
                        items.push(src.rel_path.clone());
                        evidence.push(entry(
                            EvidenceKind::Dependent,
                            src.rel_path.clone(),
                            Some(query.target.clone()),
                            r.span.as_ref().map(|s| s.start_line),
                            r.span.as_ref().map(|s| s.end_line),
                            None,
                            "reference to target symbol".into(),
                            EvidenceSource::Graph,
                            if resolved {
                                EvidenceConfidence::Grounded
                            } else {
                                EvidenceConfidence::Partial
                            },
                        ));
                    }
                }
            }
        }

        let state = if items.is_empty() {
            AnswerState::Insufficient
        } else if unresolved_seen {
            AnswerState::Partial
        } else {
            AnswerState::Grounded
        };

        Ok(DependencyTraversalResult {
            answer_state: state,
            items: dedupe(items),
            evidence: packet(
                state,
                QuestionClass::Dependents,
                query.target.clone(),
                "Dependents lookup".into(),
                if state == AnswerState::Grounded {
                    "Found grounded direct dependents".into()
                } else if state == AnswerState::Partial {
                    "Found dependents with unresolved edges".into()
                } else {
                    "No direct dependents found in indexed facts".into()
                },
                evidence,
                if state == AnswerState::Insufficient {
                    vec!["no direct reverse import/reference edges".into()]
                } else if state == AnswerState::Partial {
                    vec!["one or more dependent edges are unresolved".into()]
                } else {
                    Vec::new()
                },
                EvidenceBounds {
                    hop_count: Some(1),
                    node_limit: Some(query.limit),
                    traversal_scope: Some("dependents_direct".into()),
                    stop_reason: None,
                },
            ),
        })
    }

    fn find_dependencies(&self, query: FindDependenciesQuery) -> Result<DependencyTraversalResult> {
        let file = self.get_file_by_path(query.workspace_id, &query.file_path)?;
        let Some(file) = file else {
            return Ok(DependencyTraversalResult {
                answer_state: AnswerState::Insufficient,
                items: Vec::new(),
                evidence: packet(
                    AnswerState::Insufficient,
                    QuestionClass::Dependencies,
                    query.file_path,
                    "Dependency lookup".into(),
                    "file not indexed".into(),
                    Vec::new(),
                    vec!["target file missing from index".into()],
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: Some(query.limit),
                        traversal_scope: Some("dependencies_direct".into()),
                        stop_reason: Some("missing_target".into()),
                    },
                ),
            });
        };

        let files = self.list_files_by_workspace(query.workspace_id)?;
        let mut items = Vec::new();
        let mut evidence = Vec::new();
        let imports = self.find_outgoing_edges(query.workspace_id, "file", file.id as i64, query.limit)?
            .into_iter()
            .filter(|e| matches!(e.kind, dh_types::EdgeKind::Imports) || matches!(e.kind, dh_types::EdgeKind::ReExports));
        for imp in imports {
            let label = match imp.to {
                NodeId::File(id) => files.iter().find(|f| f.id == id).map(|f| f.rel_path.clone()).unwrap_or_else(|| imp.reason.clone()),
                NodeId::Symbol(id) => self.find_symbol_by_id(query.workspace_id, id)?.map(|s| s.qualified_name).unwrap_or_else(|| imp.reason.clone()),
                _ => imp.reason.clone(),
            };
            items.push(label.clone());
            evidence.push(entry(
                EvidenceKind::Dependency,
                file.rel_path.clone(),
                None,
                imp.span.as_ref().map(|s| s.start_line),
                imp.span.as_ref().map(|s| s.end_line),
                None,
                format!("imports {}", label),
                EvidenceSource::Graph,
                if imp.resolution == EdgeResolution::Resolved {
                    EvidenceConfidence::Grounded
                } else {
                    EvidenceConfidence::Partial
                },
            ));
        }

        let state = if items.is_empty() {
            AnswerState::Insufficient
        } else if evidence
            .iter()
            .all(|e| matches!(e.confidence, EvidenceConfidence::Grounded))
        {
            AnswerState::Grounded
        } else {
            AnswerState::Partial
        };

        Ok(DependencyTraversalResult {
            answer_state: state,
            items: dedupe(items),
            evidence: packet(
                state,
                QuestionClass::Dependencies,
                query.file_path,
                "Dependency lookup".into(),
                "Collected direct dependencies".into(),
                evidence,
                if state == AnswerState::Partial {
                    vec!["unresolved import(s) present".into()]
                } else {
                    Vec::new()
                },
                EvidenceBounds {
                    hop_count: Some(1),
                    node_limit: Some(query.limit),
                    traversal_scope: Some("dependencies_direct".into()),
                    stop_reason: None,
                },
            ),
        })
    }

    fn call_hierarchy(&self, query: CallHierarchyQuery) -> Result<CallHierarchyResult> {
        let symbols = self.find_symbol_definitions(query.workspace_id, &query.symbol, 1)?;
        let Some(subject) = symbols.first() else {
            return Ok(CallHierarchyResult {
                answer_state: AnswerState::Insufficient,
                callers: Vec::new(),
                callees: Vec::new(),
                evidence: packet(
                    AnswerState::Insufficient,
                    QuestionClass::CallHierarchy,
                    query.symbol,
                    "Call hierarchy".into(),
                    "target symbol not indexed".into(),
                    Vec::new(),
                    vec!["missing target symbol".into()],
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: Some(query.limit),
                        traversal_scope: Some("call_hierarchy".into()),
                        stop_reason: Some("missing_target".into()),
                    },
                ),
            });
        };

        let mut callers = Vec::new();
        let mut callees = Vec::new();
        let mut evidence = Vec::new();
        let mut unresolved = false;

        for c in self.find_incoming_edges(query.workspace_id, "symbol", subject.id as i64, query.limit)?.into_iter().filter(|e| matches!(e.kind, dh_types::EdgeKind::Calls)) {
            let caller_symbol_id = match c.from {
                NodeId::Symbol(id) => Some(id),
                _ => None,
            };
            let source_file_id = match c.from {
                NodeId::File(id) => id,
                NodeId::Symbol(id) => self.find_symbol_by_id(query.workspace_id, id)?.map(|s| s.file_id).unwrap_or(0),
                _ => 0,
            };
            let label = caller_symbol_id
                .and_then(|id| {
                    self.find_symbol_by_id(query.workspace_id, id)
                        .ok()
                        .flatten()
                })
                .map(|s| s.qualified_name)
                .unwrap_or_else(|| format!("file:{}", source_file_id));
            callers.push(label.clone());
            let resolved = c.resolution == EdgeResolution::Resolved;
            if !resolved {
                unresolved = true;
            }
            evidence.push(entry(
                EvidenceKind::Call,
                self.find_file_by_id(query.workspace_id, source_file_id)?
                    .map(|f| f.rel_path)
                    .unwrap_or_else(|| "<unknown>".into()),
                Some(label),
                c.span.as_ref().map(|s| s.start_line),
                c.span.as_ref().map(|s| s.end_line),
                None,
                "caller edge".into(),
                EvidenceSource::Graph,
                if resolved {
                    EvidenceConfidence::Grounded
                } else {
                    EvidenceConfidence::Partial
                },
            ));
        }

        for c in self.find_outgoing_edges(query.workspace_id, "symbol", subject.id as i64, query.limit)?.into_iter().filter(|e| matches!(e.kind, dh_types::EdgeKind::Calls)) {
            let callee_symbol_id = match c.to {
                NodeId::Symbol(id) => Some(id),
                _ => None,
            };
            let label = callee_symbol_id
                .and_then(|id| {
                    self.find_symbol_by_id(query.workspace_id, id)
                        .ok()
                        .flatten()
                })
                .map(|s| s.qualified_name)
                .unwrap_or(c.reason.clone());
            let source_file_id = match c.from {
                NodeId::File(id) => id,
                NodeId::Symbol(id) => self.find_symbol_by_id(query.workspace_id, id)?.map(|s| s.file_id).unwrap_or(0),
                _ => 0,
            };
            callees.push(label.clone());
            let resolved = c.resolution == EdgeResolution::Resolved;
            if !resolved {
                unresolved = true;
            }
            evidence.push(entry(
                EvidenceKind::Call,
                self.find_file_by_id(query.workspace_id, source_file_id)?
                    .map(|f| f.rel_path)
                    .unwrap_or_else(|| "<unknown>".into()),
                Some(label),
                c.span.as_ref().map(|s| s.start_line),
                c.span.as_ref().map(|s| s.end_line),
                None,
                "callee edge".into(),
                EvidenceSource::Graph,
                if resolved {
                    EvidenceConfidence::Grounded
                } else {
                    EvidenceConfidence::Partial
                },
            ));
        }

        let state = if callers.is_empty() && callees.is_empty() {
            AnswerState::Insufficient
        } else if unresolved {
            AnswerState::Partial
        } else {
            AnswerState::Grounded
        };

        Ok(CallHierarchyResult {
            answer_state: state,
            callers: dedupe(callers),
            callees: dedupe(callees),
            evidence: packet(
                state,
                QuestionClass::CallHierarchy,
                query.symbol,
                "Call hierarchy".into(),
                "Bounded caller/callee edges".into(),
                evidence,
                if state == AnswerState::Partial {
                    vec!["unresolved/dynamic calls present".into()]
                } else {
                    Vec::new()
                },
                EvidenceBounds {
                    hop_count: Some(1),
                    node_limit: Some(query.limit),
                    traversal_scope: Some("call_hierarchy".into()),
                    stop_reason: None,
                },
            ),
        })
    }

    fn trace_flow(&self, query: TraceFlowQuery) -> Result<TraceFlowResult> {
        let from = self
            .find_symbol_definitions(query.workspace_id, &query.from_symbol, 1)?
            .first()
            .cloned();
        let to = self
            .find_symbol_definitions(query.workspace_id, &query.to_symbol, 1)?
            .first()
            .cloned();

        let (Some(from), Some(to)) = (from, to) else {
            return Ok(TraceFlowResult {
                answer_state: AnswerState::Insufficient,
                path: Vec::new(),
                evidence: packet(
                    AnswerState::Insufficient,
                    QuestionClass::TraceFlow,
                    format!("{} -> {}", query.from_symbol, query.to_symbol),
                    "Trace flow".into(),
                    "source or target symbol missing".into(),
                    Vec::new(),
                    vec!["missing source or target symbol".into()],
                    EvidenceBounds {
                        hop_count: Some(0),
                        node_limit: None,
                        traversal_scope: Some("trace_flow".into()),
                        stop_reason: Some("missing_endpoint".into()),
                    },
                ),
            });
        };

        let path = self.shortest_path(
            query.workspace_id,
            &NodeId::Symbol(from.id),
            &NodeId::Symbol(to.id),
            query.max_hops,
        )?;

        let Some(path) = path else {
            return Ok(TraceFlowResult {
                answer_state: AnswerState::Insufficient,
                path: Vec::new(),
                evidence: packet(
                    AnswerState::Insufficient,
                    QuestionClass::TraceFlow,
                    format!("{} -> {}", query.from_symbol, query.to_symbol),
                    "Trace flow".into(),
                    "no grounded path found within bounds".into(),
                    Vec::new(),
                    vec!["no path under max_hops".into()],
                    EvidenceBounds {
                        hop_count: Some(query.max_hops),
                        node_limit: None,
                        traversal_scope: Some("trace_flow".into()),
                        stop_reason: Some("path_not_found".into()),
                    },
                ),
            });
        };

        let mut labels = Vec::new();
        let mut evidence = Vec::new();
        let mut unresolved = false;
        for edge in &path.edges {
            let from_label = node_label(self, query.workspace_id, &edge.from)?;
            let to_label = node_label(self, query.workspace_id, &edge.to)?;
            labels.push(format!("{} -> {} ({:?})", from_label, to_label, edge.kind));
            if matches!(edge.resolution, EdgeResolution::Unresolved) {
                unresolved = true;
            }
            evidence.push(entry(
                EvidenceKind::TraceStep,
                node_file_path(self, query.workspace_id, &edge.from)?
                    .unwrap_or_else(|| "<unknown>".into()),
                Some(format!("{} -> {}", from_label, to_label)),
                edge.span.map(|s| s.start_line),
                edge.span.map(|s| s.end_line),
                None,
                edge.reason.clone(),
                EvidenceSource::Graph,
                if matches!(edge.resolution, EdgeResolution::Resolved) {
                    EvidenceConfidence::Grounded
                } else {
                    EvidenceConfidence::Partial
                },
            ));
        }

        let state = if unresolved {
            AnswerState::Partial
        } else {
            AnswerState::Grounded
        };

        Ok(TraceFlowResult {
            answer_state: state,
            path: labels,
            evidence: packet(
                state,
                QuestionClass::TraceFlow,
                format!("{} -> {}", query.from_symbol, query.to_symbol),
                "Trace flow".into(),
                "short explainable graph path".into(),
                evidence,
                if state == AnswerState::Partial {
                    vec!["path includes unresolved edge(s)".into()]
                } else {
                    Vec::new()
                },
                EvidenceBounds {
                    hop_count: Some(path.edges.len() as u32),
                    node_limit: None,
                    traversal_scope: Some("trace_flow".into()),
                    stop_reason: if path.truncated {
                        Some("truncated".into())
                    } else {
                        None
                    },
                },
            ),
        })
    }

    fn impact_analysis(&self, query: ImpactAnalysisQuery) -> Result<ImpactAnalysisResult> {
        let files = self.list_files_by_workspace(query.workspace_id)?;

        if let Some(file) = files.iter().find(|f| f.rel_path == query.target) {
            let ids = self.bounded_file_neighborhood(
                query.workspace_id,
                file.id,
                query.hop_limit,
                query.node_limit,
            )?;

            let impacted: Vec<String> = ids
                .iter()
                .filter_map(|id| {
                    files
                        .iter()
                        .find(|f| f.id == *id)
                        .map(|f| f.rel_path.clone())
                })
                .collect();

            let state = if impacted.is_empty() {
                AnswerState::Insufficient
            } else {
                AnswerState::Grounded
            };
            return Ok(ImpactAnalysisResult {
                answer_state: state,
                impacted: dedupe(impacted),
                evidence: packet(
                    state,
                    QuestionClass::Impact,
                    query.target,
                    "Impact analysis".into(),
                    "bounded file neighborhood".into(),
                    vec![entry(
                        EvidenceKind::ImpactEdge,
                        file.rel_path.clone(),
                        None,
                        None,
                        None,
                        None,
                        "bounded neighborhood expansion from file".into(),
                        EvidenceSource::Graph,
                        EvidenceConfidence::Grounded,
                    )],
                    Vec::new(),
                    EvidenceBounds {
                        hop_count: Some(query.hop_limit),
                        node_limit: Some(query.node_limit),
                        traversal_scope: Some("impact_file_neighborhood".into()),
                        stop_reason: None,
                    },
                ),
            });
        }

        let symbols = self.find_symbol_definitions(query.workspace_id, &query.target, 1)?;
        if let Some(symbol) = symbols.first() {
            let ids = self.bounded_symbol_neighborhood(
                query.workspace_id,
                symbol.id,
                query.hop_limit,
                query.node_limit,
            )?;
            let mut impacted = Vec::new();
            for symbol_id in ids {
                if let Some(s) = self.find_symbol_by_id(query.workspace_id, symbol_id)? {
                    impacted.push(s.qualified_name);
                }
            }

            let state = if impacted.is_empty() {
                AnswerState::Insufficient
            } else {
                AnswerState::Grounded
            };
            return Ok(ImpactAnalysisResult {
                answer_state: state,
                impacted: dedupe(impacted),
                evidence: packet(
                    state,
                    QuestionClass::Impact,
                    query.target,
                    "Impact analysis".into(),
                    "bounded symbol neighborhood".into(),
                    vec![entry(
                        EvidenceKind::ImpactEdge,
                        self.find_file_by_id(query.workspace_id, symbol.file_id)?
                            .map(|f| f.rel_path)
                            .unwrap_or_else(|| "<unknown>".into()),
                        Some(symbol.qualified_name.clone()),
                        Some(symbol.span.start_line),
                        Some(symbol.span.end_line),
                        None,
                        "bounded neighborhood expansion from symbol".into(),
                        EvidenceSource::Graph,
                        EvidenceConfidence::Grounded,
                    )],
                    Vec::new(),
                    EvidenceBounds {
                        hop_count: Some(query.hop_limit),
                        node_limit: Some(query.node_limit),
                        traversal_scope: Some("impact_symbol_neighborhood".into()),
                        stop_reason: None,
                    },
                ),
            });
        }

        Ok(ImpactAnalysisResult {
            answer_state: AnswerState::Unsupported,
            impacted: Vec::new(),
            evidence: packet(
                AnswerState::Unsupported,
                QuestionClass::Impact,
                query.target,
                "Impact analysis".into(),
                "target is not an indexed file or symbol".into(),
                Vec::new(),
                vec!["unsupported target shape".into()],
                EvidenceBounds {
                    hop_count: Some(0),
                    node_limit: Some(query.node_limit),
                    traversal_scope: Some("impact".into()),
                    stop_reason: Some("unsupported_target".into()),
                },
            ),
        })
    }
}

fn packet(
    answer_state: AnswerState,
    question_class: QuestionClass,
    subject: String,
    summary: String,
    conclusion: String,
    evidence: Vec<EvidenceEntry>,
    gaps: Vec<String>,
    bounds: EvidenceBounds,
) -> EvidencePacket {
    EvidencePacket {
        answer_state,
        question_class,
        subject,
        summary,
        conclusion,
        evidence,
        gaps,
        bounds,
    }
}

#[allow(clippy::too_many_arguments)]
fn entry(
    kind: EvidenceKind,
    file_path: String,
    symbol: Option<String>,
    line_start: Option<u32>,
    line_end: Option<u32>,
    snippet: Option<String>,
    reason: String,
    source: EvidenceSource,
    confidence: EvidenceConfidence,
) -> EvidenceEntry {
    EvidenceEntry {
        kind,
        file_path,
        symbol,
        line_start,
        line_end,
        snippet,
        reason,
        source,
        confidence,
    }
}

fn node_label(db: &Database, workspace_id: WorkspaceId, node: &NodeId) -> Result<String> {
    Ok(match node {
        NodeId::File(id) => db
            .find_file_by_id(workspace_id, *id)?
            .map(|f| f.rel_path)
            .unwrap_or_else(|| format!("file:{}", id)),
        NodeId::Symbol(id) => db
            .find_symbol_by_id(workspace_id, *id)?
            .map(|s| s.qualified_name)
            .unwrap_or_else(|| format!("symbol:{}", id)),
        NodeId::Chunk(id) => format!("chunk:{}", id),
    })
}

fn node_file_path(
    db: &Database,
    workspace_id: WorkspaceId,
    node: &NodeId,
) -> Result<Option<String>> {
    Ok(match node {
        NodeId::File(id) => db.find_file_by_id(workspace_id, *id)?.map(|f| f.rel_path),
        NodeId::Symbol(id) => db
            .find_symbol_by_id(workspace_id, *id)?
            .and_then(|s| db.find_file_by_id(workspace_id, s.file_id).ok().flatten())
            .map(|f| f.rel_path),
        NodeId::Chunk(_) => None,
    })
}

fn dedupe(mut input: Vec<String>) -> Vec<String> {
    input.sort();
    input.dedup();
    input
}

fn push_unique_gap(gaps: &mut Vec<String>, gap: String) {
    if !gaps.contains(&gap) {
        gaps.push(gap);
    }
}

fn classify_unsupported_build_evidence_request(
    lowered_query: &str,
) -> Option<(&'static str, &'static str)> {
    if lowered_query.contains("runtime trace") || lowered_query.contains("trace flow") {
        return Some((
            "runtime_trace",
            "runtime tracing and trace-flow execution are outside query.buildEvidence support",
        ));
    }
    if lowered_query.contains("trace") {
        return Some((
            "runtime_trace",
            "runtime tracing and trace-flow execution are outside query.buildEvidence support",
        ));
    }
    if lowered_query.contains("impact analysis") || lowered_query.contains("impact") {
        return Some((
            "impact_analysis",
            "impact-analysis requests are not part of the bounded build-evidence ask contract",
        ));
    }
    if lowered_query.contains("could break") || lowered_query.contains("what would break") {
        return Some((
            "impact_analysis",
            "impact-analysis requests are not part of the bounded build-evidence ask contract",
        ));
    }
    if lowered_query.contains("call hierarchy")
        || lowered_query.contains("call_hierarchy")
        || lowered_query.contains("call-hierarchy")
    {
        return Some((
            "call_hierarchy",
            "call-hierarchy requests are outside the bounded build-evidence ask contract",
        ));
    }
    if lowered_query.contains("multi-hop") {
        return Some((
            "multi_hop",
            "multi-hop path exploration is outside first-wave build-evidence support",
        ));
    }
    if lowered_query.contains("entire subsystem")
        || lowered_query.contains("everything")
        || lowered_query.contains("all behavior")
    {
        return Some((
            "unbounded_scope",
            "unbounded subsystem-wide requests need a finite subject before build evidence can be safe",
        ));
    }

    None
}

fn extract_subject_tokens(query: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for token in query
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '.' || c == '/' || c == '-'))
        .map(str::trim)
        .filter(|token| token.len() >= 3)
    {
        let lowered = token.to_ascii_lowercase();
        if matches!(
            lowered.as_str(),
            "how"
                | "does"
                | "this"
                | "that"
                | "with"
                | "work"
                | "works"
                | "project"
                | "repo"
                | "codebase"
                | "the"
                | "and"
                | "for"
                | "from"
                | "what"
        ) {
            continue;
        }
        if seen.insert(lowered) {
            out.push(token.to_string());
        }
    }
    out
}

fn bounded_snippet(content: &str, max_chars: usize) -> String {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    normalized.chars().take(max_chars).collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use dh_storage::{ChunkRepository, Database, FileRepository, SymbolRepository, GraphEdgeRepository};
    use dh_types::{
        Chunk, ChunkKind, EmbeddingStatus, File, FreshnessReason,
        FreshnessState, LanguageId, ParseStatus,
        Span, Symbol, SymbolKind, Visibility,
    };
    use tempfile::NamedTempFile;

    fn setup_db() -> anyhow::Result<Database> {
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

    fn seed(db: &Database) -> anyhow::Result<()> {
        db.upsert_file(&File {
            id: 1,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/main.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 10,
            mtime_unix_ms: 1,
            content_hash: "a".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 1,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-query-1".into()),
        })?;
        db.upsert_file(&File {
            id: 2,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/util.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 10,
            mtime_unix_ms: 1,
            content_hash: "b".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 1,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-query-2".into()),
        })?;

        db.insert_symbols(&[
            Symbol {
                id: 10,
                workspace_id: 1,
                file_id: 1,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "run".into(),
                qualified_name: "run".into(),
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
                symbol_hash: "s10".into(),
            },
            Symbol {
                id: 11,
                workspace_id: 1,
                file_id: 2,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "helper".into(),
                qualified_name: "helper".into(),
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
                symbol_hash: "s11".into(),
            },
        ])?;

        db.insert_edges(&[
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Imports,
                from: dh_types::NodeId::File(1),
                to: dh_types::NodeId::File(2),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span { start_byte: 0, end_byte: 1, start_line: 1, start_column: 0, end_line: 1, end_column: 1 }),
                reason: "import".into(),
            },
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::References,
                from: dh_types::NodeId::Symbol(10),
                to: dh_types::NodeId::Symbol(11),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span { start_byte: 0, end_byte: 1, start_line: 2, start_column: 0, end_line: 2, end_column: 1 }),
                reason: "reference".into(),
            },
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Calls,
                from: dh_types::NodeId::Symbol(10),
                to: dh_types::NodeId::Symbol(11),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span { start_byte: 0, end_byte: 1, start_line: 2, start_column: 0, end_line: 2, end_column: 1 }),
                reason: "call".into(),
            }
        ], 1)?;

        db.insert_chunks(&[
            Chunk {
                id: 999,
                workspace_id: 1,
                file_id: 1,
                symbol_id: Some(10),
                parent_symbol_id: None,
                kind: ChunkKind::Symbol,
                language: LanguageId::TypeScript,
                title: "run".into(),
                content: "run helper".into(),
                content_hash: "chunk-run".into(),
                token_estimate: 4,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                },
                prev_chunk_id: None,
                next_chunk_id: None,
                embedding_status: EmbeddingStatus::NotQueued,
            },
            Chunk {
                id: 1000,
                workspace_id: 1,
                file_id: 2,
                symbol_id: Some(11),
                parent_symbol_id: None,
                kind: ChunkKind::Symbol,
                language: LanguageId::TypeScript,
                title: "helper".into(),
                content: "helper implementation".into(),
                content_hash: "chunk-helper".into(),
                token_estimate: 4,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                },
                prev_chunk_id: None,
                next_chunk_id: None,
                embedding_status: EmbeddingStatus::NotQueued,
            },
        ])?;

        Ok(())
    }

    #[test]
    fn supports_grounded_definition_and_references() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        let def = db.goto_definition(GotoDefinitionQuery {
            workspace_id: 1,
            symbol: "helper".into(),
            file_path: None,
            line: None,
            column: None,
            prefer_runtime_symbol: true,
        })?;
        assert!(def.is_some());
        assert_eq!(
            def.expect("definition").evidence.answer_state,
            AnswerState::Grounded
        );

        let refs = db.find_references(FindReferencesQuery {
            workspace_id: 1,
            symbol_id: Some(11),
            symbol: None,
            include_type_only: false,
            include_tests: true,
            limit: 10,
        })?;
        assert!(!refs.items.is_empty());
        assert_eq!(refs.answer_state, AnswerState::Grounded);
        assert_eq!(refs.evidence.answer_state, AnswerState::Grounded);
        Ok(())
    }

    #[test]
    fn supports_dependency_and_dependent_queries_without_expanding_rhbe_scope() -> anyhow::Result<()>
    {
        let db = setup_db()?;
        seed(&db)?;

        let deps = db.find_dependencies(FindDependenciesQuery {
            workspace_id: 1,
            file_path: "src/main.ts".into(),
            limit: 10,
        })?;
        assert_eq!(deps.answer_state, AnswerState::Grounded);

        let dependents = db.find_dependents(FindDependentsQuery {
            workspace_id: 1,
            target: "src/util.ts".into(),
            limit: 10,
        })?;
        assert_eq!(dependents.answer_state, AnswerState::Grounded);

        Ok(())
    }

    #[test]
    fn references_are_partial_when_unresolved_rows_exist() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        db.insert_edges(&[
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::References,
                from: dh_types::NodeId::Symbol(10),
                to: dh_types::NodeId::Symbol(11),
                resolution: dh_types::EdgeResolution::Unresolved,
                confidence: dh_types::EdgeConfidence::BestEffort,
                span: Some(Span { start_byte: 0, end_byte: 1, start_line: 3, start_column: 0, end_line: 3, end_column: 1 }),
                reason: "reference".into(),
            }
        ], 1)?;

        let refs = db.find_references(FindReferencesQuery {
            workspace_id: 1,
            symbol_id: Some(11),
            symbol: None,
            include_type_only: false,
            include_tests: true,
            limit: 10,
        })?;

        assert_eq!(refs.answer_state, AnswerState::Partial);
        assert_eq!(refs.evidence.answer_state, AnswerState::Partial);
        assert!(refs
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("unresolved")));

        Ok(())
    }

    #[test]
    fn dependents_are_partial_when_unresolved_references_contribute() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        db.insert_edges(&[
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::References,
                from: dh_types::NodeId::Symbol(10),
                to: dh_types::NodeId::Symbol(11),
                resolution: dh_types::EdgeResolution::Unresolved,
                confidence: dh_types::EdgeConfidence::BestEffort,
                span: Some(Span { start_byte: 0, end_byte: 1, start_line: 4, start_column: 0, end_line: 4, end_column: 1 }),
                reason: "reference".into(),
            }
        ], 1)?;

        let dependents = db.find_dependents(FindDependentsQuery {
            workspace_id: 1,
            target: "helper".into(),
            limit: 10,
        })?;

        assert_eq!(dependents.answer_state, AnswerState::Partial);
        assert_eq!(dependents.evidence.answer_state, AnswerState::Partial);
        assert!(dependents
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("unresolved")));

        Ok(())
    }

    #[test]
    fn dependency_and_go_definition_capabilities_are_not_overclaimed() {
        let go_definition =
            language_capability_for(LanguageId::Go, LanguageCapability::DefinitionLookup);
        assert_eq!(go_definition.state, LanguageCapabilityState::Partial);
        assert!(go_definition.parser_backed);
        assert!(go_definition.reason.contains("same-package"));

        for language in [LanguageId::Python, LanguageId::Go, LanguageId::Rust] {
            for capability in [
                LanguageCapability::Dependencies,
                LanguageCapability::Dependents,
            ] {
                let entry = language_capability_for(language, capability);
                assert_eq!(entry.state, LanguageCapabilityState::Partial);
                assert!(entry.parser_backed);
                assert!(entry.reason.contains("partial"));
                assert!(entry.reason.contains("unresolved"));
            }
        }
    }

    #[test]
    fn build_evidence_packet_contract_covers_grounded_insufficient_and_unsupported(
    ) -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        let grounded = db.build_evidence(BuildEvidenceQuery {
            workspace_id: 1,
            query: "how does helper work?".into(),
            intent: "explain".into(),
            targets: vec!["helper".into()],
            max_files: 5,
            max_symbols: 8,
            max_snippets: 8,
            freshness: Some("indexed".into()),
        })?;
        assert_eq!(grounded.answer_state, AnswerState::Grounded);
        assert_eq!(grounded.evidence.answer_state, AnswerState::Grounded);
        assert_eq!(
            grounded.evidence.question_class,
            QuestionClass::BuildEvidence
        );
        assert!(!grounded.evidence.evidence.is_empty());
        assert!(grounded.evidence.bounds.traversal_scope.as_deref() == Some("build_evidence"));

        let insufficient = db.build_evidence(BuildEvidenceQuery {
            workspace_id: 1,
            query: "how does definitely_missing_subject work?".into(),
            intent: "explain".into(),
            targets: vec!["definitely_missing_subject".into()],
            max_files: 5,
            max_symbols: 8,
            max_snippets: 8,
            freshness: Some("indexed".into()),
        })?;
        assert_eq!(insufficient.answer_state, AnswerState::Insufficient);
        assert_eq!(
            insufficient.evidence.answer_state,
            AnswerState::Insufficient
        );
        assert_eq!(
            insufficient.evidence.bounds.stop_reason.as_deref(),
            Some("insufficient_evidence")
        );
        assert!(insufficient
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("no indexed evidence")));

        let unsupported = db.build_evidence(BuildEvidenceQuery {
            workspace_id: 1,
            query: "trace flow through the entire subsystem".into(),
            intent: "explain".into(),
            targets: Vec::new(),
            max_files: 5,
            max_symbols: 8,
            max_snippets: 8,
            freshness: Some("indexed".into()),
        })?;
        assert_eq!(unsupported.answer_state, AnswerState::Unsupported);
        assert_eq!(unsupported.evidence.answer_state, AnswerState::Unsupported);
        assert_eq!(
            unsupported.evidence.question_class,
            QuestionClass::BuildEvidence
        );
        assert_eq!(
            unsupported.evidence.bounds.stop_reason.as_deref(),
            Some("runtime_trace")
        );
        assert!(unsupported
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("runtime tracing")));

        for (query_text, stop_reason, expected_gap) in [
            (
                "impact analysis for helper",
                "impact_analysis",
                "impact-analysis requests",
            ),
            (
                "what could break if I change helper",
                "impact_analysis",
                "impact-analysis requests",
            ),
            (
                "call hierarchy for helper",
                "call_hierarchy",
                "call-hierarchy requests",
            ),
            ("trace helper", "runtime_trace", "runtime tracing"),
            (
                "call_hierarchy for helper",
                "call_hierarchy",
                "call-hierarchy requests",
            ),
        ] {
            let out_of_scope = db.build_evidence(BuildEvidenceQuery {
                workspace_id: 1,
                query: query_text.into(),
                intent: "explain".into(),
                targets: Vec::new(),
                max_files: 5,
                max_symbols: 8,
                max_snippets: 8,
                freshness: Some("indexed".into()),
            })?;
            assert_eq!(out_of_scope.answer_state, AnswerState::Unsupported);
            assert_eq!(out_of_scope.evidence.answer_state, AnswerState::Unsupported);
            assert_eq!(
                out_of_scope.evidence.question_class,
                QuestionClass::BuildEvidence
            );
            assert_eq!(
                out_of_scope.evidence.bounds.traversal_scope.as_deref(),
                Some("build_evidence")
            );
            assert_eq!(
                out_of_scope.evidence.bounds.stop_reason.as_deref(),
                Some(stop_reason)
            );
            assert!(out_of_scope
                .evidence
                .gaps
                .iter()
                .any(|gap| gap.contains(expected_gap)));
        }

        Ok(())
    }

    #[test]
    fn build_evidence_packet_preserves_partial_bounds_and_gaps() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        let partial = db.build_evidence(BuildEvidenceQuery {
            workspace_id: 1,
            query: "how does run work?".into(),
            intent: "explain".into(),
            targets: vec!["run".into()],
            max_files: 1,
            max_symbols: 8,
            max_snippets: 1,
            freshness: Some("indexed".into()),
        })?;

        assert_eq!(partial.answer_state, AnswerState::Partial);
        assert_eq!(partial.evidence.answer_state, AnswerState::Partial);
        assert_eq!(
            partial.evidence.bounds.stop_reason.as_deref(),
            Some("node_limit_reached")
        );
        assert_eq!(partial.evidence.evidence.len(), 1);
        assert!(partial
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("bounded evidence limits reached")));

        Ok(())
    }

    #[test]
    fn build_evidence_packet_rejects_non_explain_intents() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        for intent in ["trace", "impact", "call_hierarchy", "arbitrary"] {
            let unsupported = db.build_evidence(BuildEvidenceQuery {
                workspace_id: 1,
                query: "how does helper work?".into(),
                intent: intent.into(),
                targets: vec!["helper".into()],
                max_files: 5,
                max_symbols: 8,
                max_snippets: 8,
                freshness: Some("indexed".into()),
            })?;

            assert_eq!(unsupported.answer_state, AnswerState::Unsupported);
            assert_eq!(unsupported.evidence.answer_state, AnswerState::Unsupported);
            assert_eq!(
                unsupported.evidence.question_class,
                QuestionClass::BuildEvidence
            );
            assert!(unsupported.evidence.evidence.is_empty());
            assert_eq!(
                unsupported.evidence.bounds.stop_reason.as_deref(),
                Some("unsupported_intent")
            );
            assert!(unsupported
                .evidence
                .gaps
                .iter()
                .any(|gap| gap.contains("query.buildEvidence intent")));
        }

        Ok(())
    }

    #[test]
    fn build_evidence_packet_marks_exact_budget_cutoff_partial() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        let partial = db.build_evidence(BuildEvidenceQuery {
            workspace_id: 1,
            query: "how do helper and run work?".into(),
            intent: "explain".into(),
            targets: vec!["helper".into(), "run".into()],
            max_files: 1,
            max_symbols: 8,
            max_snippets: 1,
            freshness: Some("indexed".into()),
        })?;

        assert_eq!(partial.answer_state, AnswerState::Partial);
        assert_eq!(partial.evidence.answer_state, AnswerState::Partial);
        assert_eq!(partial.evidence.evidence.len(), 1);
        assert_eq!(
            partial.evidence.bounds.stop_reason.as_deref(),
            Some("node_limit_reached")
        );
        assert!(partial
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("bounded evidence limits reached")));

        Ok(())
    }

    #[test]
    fn build_evidence_packet_preserves_stale_index_as_partial() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;

        db.upsert_file(&File {
            id: 2,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/util.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 10,
            mtime_unix_ms: 1,
            content_hash: "b-stale".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::ParsedWithErrors,
            parse_error: Some("recoverable parser issue".into()),
            symbol_count: 1,
            chunk_count: 1,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::DegradedPartial,
            freshness_reason: Some(FreshnessReason::RecoverableParseIssues),
            last_freshness_run_id: Some("run-query-stale".into()),
        })?;

        let partial = db.build_evidence(BuildEvidenceQuery {
            workspace_id: 1,
            query: "how does helper work?".into(),
            intent: "explain".into(),
            targets: vec!["helper".into()],
            max_files: 5,
            max_symbols: 8,
            max_snippets: 8,
            freshness: Some("indexed".into()),
        })?;

        assert_eq!(partial.answer_state, AnswerState::Partial);
        assert_eq!(partial.evidence.answer_state, AnswerState::Partial);
        assert_eq!(
            partial.evidence.bounds.stop_reason.as_deref(),
            Some("partial_index_or_capability")
        );
        assert!(!partial.evidence.evidence.is_empty());
        assert!(partial
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("partial index coverage")));
        assert!(partial
            .evidence
            .gaps
            .iter()
            .any(|gap| gap.contains("stale or partial index coverage")));

        Ok(())
    }
}
