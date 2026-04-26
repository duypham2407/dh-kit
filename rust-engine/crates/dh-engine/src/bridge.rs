use crate::host_lifecycle::{lifecycle_contract, LifecycleContract};
use crate::worker_protocol::{
    is_worker_to_host_query_method, worker_protocol_contract, WorkerProtocolContract,
    BRIDGE_INITIALIZE_METHODS, BRIDGE_LIFECYCLE_CONTROL_METHODS, BUILD_EVIDENCE_DEFAULT_MAX_FILES,
    BUILD_EVIDENCE_DEFAULT_MAX_SNIPPETS, BUILD_EVIDENCE_DEFAULT_MAX_SYMBOLS,
    BUILD_EVIDENCE_HARD_MAX_FILES, BUILD_EVIDENCE_HARD_MAX_SNIPPETS,
    BUILD_EVIDENCE_HARD_MAX_SYMBOLS, QUERY_BUILD_EVIDENCE_METHOD, QUERY_RELATIONSHIPS,
    WORKER_PROTOCOL_VERSION,
};
use anyhow::{Context, Result};
use dh_query::{
    capability_state_to_wire, capability_to_wire, classify_relationship_support,
    classify_search_support, infer_language_from_path, infer_query_languages_from_paths,
    language_capability_matrix, language_id_to_wire, summarize_language_capability,
    BuildEvidenceQuery, FindDependenciesQuery, FindDependentsQuery, FindReferencesQuery,
    FindSymbolQuery, GotoDefinitionQuery, QueryEngine,
};
use dh_storage::{Database, FileRepository, GraphRepository};
use dh_types::{
    AnswerState, EvidenceBounds, EvidenceConfidence, EvidenceEntry, EvidenceKind, EvidencePacket,
    EvidenceSource, LanguageCapability, LanguageCapabilityState, LanguageCapabilitySummary,
    LanguageId, QuestionClass,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};

const DEFAULT_DB_NAME: &str = "dh-index.db";

#[derive(Debug, Clone)]
pub struct BridgeRpcError {
    jsonrpc_code: i64,
    symbolic_code: String,
    message: String,
}

impl BridgeRpcError {
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32602,
            symbolic_code: "INVALID_REQUEST".into(),
            message: message.into(),
        }
    }

    pub fn capability_unsupported(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32601,
            symbolic_code: "CAPABILITY_UNSUPPORTED".into(),
            message: message.into(),
        }
    }

    pub fn access_denied(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32010,
            symbolic_code: "ACCESS_DENIED".into(),
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32011,
            symbolic_code: "NOT_FOUND".into(),
            message: message.into(),
        }
    }

    pub fn timeout(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32012,
            symbolic_code: "TIMEOUT".into(),
            message: message.into(),
        }
    }

    pub fn execution_failed(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32013,
            symbolic_code: "EXECUTION_FAILED".into(),
            message: message.into(),
        }
    }

    pub fn runtime_unavailable(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32014,
            symbolic_code: "RUNTIME_UNAVAILABLE".into(),
            message: message.into(),
        }
    }

    pub fn binary_file_unsupported(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32015,
            symbolic_code: "BINARY_FILE_UNSUPPORTED".into(),
            message: message.into(),
        }
    }

    pub fn to_response(self, id: Value) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": self.jsonrpc_code,
                "message": self.message,
                "data": {
                    "code": self.symbolic_code,
                },
            }
        })
    }
}

#[derive(Debug, Clone)]
pub struct RpcRequest {
    pub id: Value,
    pub method: String,
    pub params: Value,
}

pub struct BridgeRpcRouter<'a> {
    workspace: &'a Path,
    db: &'a Database,
}

impl<'a> BridgeRpcRouter<'a> {
    pub fn new(workspace: &'a Path, db: &'a Database) -> Self {
        Self { workspace, db }
    }

    pub fn route(&self, request: RpcRequest) -> Value {
        handle_request(self.workspace, self.db, request)
    }

    pub fn route_worker_query(&self, request: RpcRequest) -> Value {
        if !is_worker_to_host_query_method(&request.method) {
            return BridgeRpcError::capability_unsupported(format!(
                "worker-to-host RPC method '{}' is outside the first-wave host query contract",
                request.method
            ))
            .to_response(request.id);
        }

        self.route(request)
    }
}

#[derive(Debug, Serialize)]
struct SearchItem {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "lineStart")]
    line_start: u32,
    #[serde(rename = "lineEnd")]
    line_end: u32,
    snippet: String,
    reason: String,
    score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireLanguageCapabilityEntry {
    language: String,
    capability: String,
    state: String,
    reason: String,
    parser_backed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireLanguageCapabilityLanguageSummary {
    language: String,
    state: String,
    reason: String,
    parser_backed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireLanguageCapabilitySummary {
    capability: String,
    weakest_state: String,
    languages: Vec<WireLanguageCapabilityLanguageSummary>,
    retrieval_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireEvidenceEntry {
    kind: String,
    file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    symbol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line_start: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line_end: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    snippet: Option<String>,
    reason: String,
    source: String,
    confidence: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireEvidenceBounds {
    #[serde(skip_serializing_if = "Option::is_none")]
    hop_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    node_limit: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    traversal_scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireEvidencePacket {
    answer_state: String,
    question_class: String,
    subject: String,
    summary: String,
    conclusion: String,
    evidence: Vec<WireEvidenceEntry>,
    gaps: Vec<String>,
    bounds: WireEvidenceBounds,
}

#[derive(Debug, Serialize)]
struct BridgeResult {
    #[serde(rename = "answerState")]
    answer_state: String,
    #[serde(rename = "questionClass")]
    question_class: String,
    items: Vec<SearchItem>,
    evidence: Option<WireEvidencePacket>,
    #[serde(
        rename = "languageCapabilitySummary",
        skip_serializing_if = "Option::is_none"
    )]
    language_capability_summary: Option<WireLanguageCapabilitySummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireLifecycleControl {
    methods: Vec<&'static str>,
    max_auto_restarts: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeCapabilities {
    protocol_version: &'static str,
    methods: Vec<&'static str>,
    query_relationship: BridgeQueryRelationshipCapabilities,
    language_capability_matrix: Vec<WireLanguageCapabilityEntry>,
    lifecycle_control: WireLifecycleControl,
    rust_host_lifecycle_contract: LifecycleContract,
    worker_protocol_contract: WorkerProtocolContract,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeQueryRelationshipCapabilities {
    supported_relations: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InitializeResult {
    server_name: &'static str,
    server_version: &'static str,
    workspace_root: String,
    protocol_version: &'static str,
    capabilities: BridgeCapabilities,
}

pub fn run_bridge_server(workspace: PathBuf) -> Result<()> {
    let db_path = workspace.join(DEFAULT_DB_NAME);
    let db = Database::new(&db_path).with_context(|| format!("open db: {}", db_path.display()))?;
    db.initialize()?;

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = io::BufWriter::new(stdout.lock());

    let router = BridgeRpcRouter::new(&workspace, &db);

    loop {
        let request = match read_rpc_request(&mut reader) {
            Ok(value) => value,
            Err(err) => {
                eprintln!("bridge read failed: {err}");
                break;
            }
        };

        let should_shutdown = request.method == "dh.shutdown";
        let response = router.route(request);
        write_rpc_response(&mut writer, &response)?;
        if should_shutdown {
            break;
        }
    }

    Ok(())
}

fn read_rpc_request(reader: &mut BufReader<impl Read>) -> Result<RpcRequest> {
    let mut content_length: Option<usize> = None;

    loop {
        let mut line = String::new();
        let bytes = reader.read_line(&mut line)?;
        if bytes == 0 {
            anyhow::bail!("bridge stdin closed");
        }
        if line == "\r\n" {
            break;
        }

        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case("Content-Length") {
                content_length = Some(
                    value
                        .trim()
                        .parse::<usize>()
                        .context("invalid Content-Length header")?,
                );
            }
        }
    }

    let len = content_length.context("missing Content-Length header")?;
    let mut buf = vec![0_u8; len];
    reader.read_exact(&mut buf)?;
    let payload = String::from_utf8(buf).context("request payload is not utf8")?;
    let value: Value = serde_json::from_str(&payload).context("invalid json request payload")?;

    let id = value.get("id").cloned().context("missing request id")?;
    let method = value
        .get("method")
        .and_then(Value::as_str)
        .map(|v| v.to_string())
        .context("missing method")?;
    let params = value.get("params").cloned().unwrap_or_else(|| json!({}));

    Ok(RpcRequest { id, method, params })
}

fn handle_request(workspace: &Path, db: &Database, request: RpcRequest) -> Value {
    match request.method.as_str() {
        "dh.initialize" => ok_result(request.id, initialize_result(workspace)),
        "dh.initialized" => ok_result(
            request.id,
            json!({
                "accepted": true,
                "phase": "startup"
            }),
        ),
        "dh.ready" => ok_result(
            request.id,
            json!({
                "ready": true,
                "workerState": "ready",
                "healthState": "healthy",
                "phase": "startup"
            }),
        ),
        "runtime.ping" => ok_result(
            request.id,
            json!({
                "ok": true,
                "workerState": "ready",
                "healthState": "healthy",
                "phase": "health"
            }),
        ),
        "dh.shutdown" => ok_result(
            request.id,
            json!({
                "accepted": true,
                "phase": "shutdown"
            }),
        ),
        "session.runCommand" => {
            let query = request
                .params
                .get("query")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let query_method = query
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let query_params = query.get("params").cloned().unwrap_or_else(|| json!({}));

            if query_method.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "session.runCommand requires query.method and query.params",
                );
            }

            if !is_worker_to_host_query_method(&query_method) {
                return method_not_supported(
                    request.id,
                    &format!("session.runCommand does not support method: {query_method}"),
                );
            }

            let delegated = BridgeRpcRouter::new(workspace, db).route_worker_query(RpcRequest {
                id: request.id.clone(),
                method: query_method.clone(),
                params: query_params,
            });

            if delegated.get("error").is_some() {
                return delegated;
            }

            let delegated_result = delegated
                .get("result")
                .cloned()
                .unwrap_or_else(|| json!({}));

            match delegated_result {
                Value::Object(mut map) => {
                    map.insert("method".to_string(), Value::String(query_method));
                    ok_result(request.id, Value::Object(map))
                }
                other => ok_result(
                    request.id,
                    json!({
                        "method": query_method,
                        "payload": other
                    }),
                ),
            }
        }
        "query.search" => {
            let query = str_param(&request.params, "query").unwrap_or_default();
            if query.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "query.search requires a non-empty 'query' parameter",
                );
            }
            let limit = int_param(&request.params, "limit", 5).min(20);
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let mode = str_param(&request.params, "mode").unwrap_or_else(|| "symbol".into());

            let engine_result = db.find_symbol(FindSymbolQuery {
                workspace_id,
                name: query.clone(),
                kinds: None,
                file_hint: None,
                namespace_hint: None,
                include_external: false,
                limit,
            });

            match engine_result {
                Ok(matches) => {
                    let items: Vec<SearchItem> = if mode == "file_path" {
                        db.list_files_by_workspace(workspace_id)
                            .unwrap_or_default()
                            .into_iter()
                            .filter(|file| {
                                file.rel_path.to_lowercase().contains(&query.to_lowercase())
                            })
                            .take(limit)
                            .map(|file| SearchItem {
                                file_path: file.rel_path,
                                line_start: 1,
                                line_end: 1,
                                snippet: "path match".into(),
                                reason: "file path match".into(),
                                score: 0.9,
                            })
                            .collect()
                    } else {
                        matches
                            .into_iter()
                            .map(|m| SearchItem {
                                file_path: m.file_path,
                                line_start: m.line_start,
                                line_end: m.line_end,
                                snippet: m.qualified_name,
                                reason: if mode == "structural" {
                                    "bounded structural/symbol proxy".into()
                                } else if mode == "concept" {
                                    "bounded concept/symbol proxy".into()
                                } else {
                                    "symbol match".into()
                                },
                                score: 0.95,
                            })
                            .collect()
                    };

                    let mut language_paths = items
                        .iter()
                        .map(|item| item.file_path.clone())
                        .collect::<Vec<_>>();
                    if mode == "file_path" {
                        language_paths.push(query.clone());
                    }
                    let language_summary = classify_search_support(
                        &mode,
                        &infer_query_languages_from_paths(&language_paths),
                        mode != "symbol",
                    );

                    let wire_question_class = search_question_class(&mode);
                    let evidence = build_search_evidence_packet(&query, &mode, &items);
                    ok_result(
                        request.id,
                        BridgeResult {
                            answer_state: answer_state_str(evidence.answer_state).into(),
                            question_class: wire_question_class.into(),
                            items,
                            evidence: Some(to_wire_evidence_packet(
                                evidence,
                                Some(wire_question_class),
                            )),
                            language_capability_summary: Some(to_wire_language_capability_summary(
                                language_summary,
                            )),
                        },
                    )
                }
                Err(err) => internal_error(request.id, format!("query.search failed: {err}")),
            }
        }
        "query.definition" => {
            let symbol = str_param(&request.params, "symbol").unwrap_or_default();
            if symbol.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "query.definition requires a non-empty 'symbol' parameter",
                );
            }
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let file_path_hint = str_param_opt(&request.params, "filePath");

            match db.goto_definition(GotoDefinitionQuery {
                workspace_id,
                symbol: symbol.clone(),
                file_path: file_path_hint.clone(),
                line: int_param_opt(&request.params, "line").map(|v| v as u32),
                column: int_param_opt(&request.params, "column").map(|v| v as u32),
                prefer_runtime_symbol: bool_param(&request.params, "preferRuntimeSymbol", true),
            }) {
                Ok(Some(def)) => {
                    let items = vec![SearchItem {
                        file_path: def.file_path.clone(),
                        line_start: def.line_start,
                        line_end: def.line_end,
                        snippet: def.qualified_name,
                        reason: "definition".into(),
                        score: 0.99,
                    }];
                    let mut language_paths = vec![def.file_path];
                    if let Some(path) = file_path_hint.clone() {
                        language_paths.push(path);
                    }
                    let language_summary = summarize_language_capability(
                        LanguageCapability::DefinitionLookup,
                        &infer_query_languages_from_paths(&language_paths),
                        false,
                    );

                    ok_result(
                        request.id,
                        BridgeResult {
                            answer_state: answer_state_str(def.evidence.answer_state).into(),
                            question_class: question_class_str(def.evidence.question_class).into(),
                            items,
                            evidence: Some(to_wire_evidence_packet(def.evidence, None)),
                            language_capability_summary: Some(to_wire_language_capability_summary(
                                language_summary,
                            )),
                        },
                    )
                }
                Ok(None) => {
                    let definition_evidence = build_definition_insufficient_evidence_packet(
                        &symbol,
                        file_path_hint.as_deref(),
                    );
                    ok_result(
                        request.id,
                        BridgeResult {
                            answer_state: "insufficient".into(),
                            question_class: "definition".into(),
                            items: Vec::new(),
                            evidence: Some(to_wire_evidence_packet(definition_evidence, None)),
                            language_capability_summary: Some(to_wire_language_capability_summary(
                                {
                                    let hint_paths =
                                        file_path_hint.clone().into_iter().collect::<Vec<_>>();
                                    summarize_language_capability(
                                        LanguageCapability::DefinitionLookup,
                                        &infer_query_languages_from_paths(&hint_paths),
                                        false,
                                    )
                                },
                            )),
                        },
                    )
                }
                Err(err) => internal_error(request.id, format!("query.definition failed: {err}")),
            }
        }
        "query.relationship" => {
            let relation = str_param(&request.params, "relation").unwrap_or_default();
            if relation.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "query.relationship requires a non-empty 'relation' parameter",
                );
            }
            let limit = int_param(&request.params, "limit", 5).min(20);
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            match relation.as_str() {
                "usage" => {
                    let symbol = str_param(&request.params, "symbol").unwrap_or_default();
                    if symbol.trim().is_empty() {
                        return invalid_params(
                            request.id,
                            "query.relationship usage requires non-empty 'symbol'",
                        );
                    }
                    let inferred_languages = infer_languages_for_symbol(db, workspace_id, &symbol);
                    if let Some(summary) = unsupported_relationship_summary("usage", &inferred_languages)
                    {
                        return ok_result(
                            request.id,
                            unsupported_relationship_result(
                                "usage",
                                "references",
                                &symbol,
                                summary,
                            ),
                        );
                    }
                    match db.find_references(FindReferencesQuery {
                        workspace_id,
                        symbol_id: None,
                        symbol: Some(symbol.clone()),
                        include_type_only: false,
                        include_tests: true,
                        limit,
                    }) {
                        Ok(result) => {
                            let items = result
                                .items
                                .into_iter()
                                .map(|r| SearchItem {
                                    file_path: r.file_path,
                                    line_start: r.line_start,
                                    line_end: r.line_end,
                                    snippet: r.reason,
                                    reason: "usage/reference".into(),
                                    score: if r.resolved { 0.92 } else { 0.72 },
                                })
                                .collect::<Vec<_>>();
                            let language_summary = relationship_capability_summary(
                                "usage",
                                &items,
                                &[symbol.clone()],
                                &inferred_languages,
                            );

                            ok_result(
                                request.id,
                                BridgeResult {
                                    answer_state: answer_state_str(result.answer_state).into(),
                                    question_class: "references".into(),
                                    items,
                                    evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                                    language_capability_summary: Some(language_summary),
                                },
                            )
                        }
                        Err(err) => {
                            internal_error(request.id, format!("query.relationship failed: {err}"))
                        }
                    }
                }
                "dependencies" => {
                    let file_path = str_param(&request.params, "filePath").unwrap_or_default();
                    if file_path.trim().is_empty() {
                        return invalid_params(
                            request.id,
                            "query.relationship dependencies requires non-empty 'filePath'",
                        );
                    }
                    let inferred_languages = infer_languages_for_target(db, workspace_id, &file_path);
                    if let Some(summary) = unsupported_relationship_summary("dependencies", &inferred_languages)
                    {
                        return ok_result(
                            request.id,
                            unsupported_relationship_result(
                                "dependencies",
                                "dependencies",
                                &file_path,
                                summary,
                            ),
                        );
                    }
                    match db.find_dependencies(FindDependenciesQuery {
                        workspace_id,
                        file_path: file_path.clone(),
                        limit,
                    }) {
                        Ok(result) => {
                            let items = result
                                .items
                                .into_iter()
                                .map(|dep| SearchItem {
                                    file_path: dep,
                                    line_start: 0,
                                    line_end: 0,
                                    snippet: "dependency".into(),
                                    reason: "direct dependency".into(),
                                    score: 0.9,
                                })
                                .collect::<Vec<_>>();
                            let language_summary = relationship_capability_summary(
                                "dependencies",
                                &items,
                                &[file_path.clone()],
                                &inferred_languages,
                            );

                            ok_result(
                                request.id,
                                BridgeResult {
                                    answer_state: answer_state_str(result.answer_state).into(),
                                    question_class: "dependencies".into(),
                                    items,
                                    evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                                    language_capability_summary: Some(language_summary),
                                },
                            )
                        }
                        Err(err) => {
                            internal_error(request.id, format!("query.relationship failed: {err}"))
                        }
                    }
                }
                "dependents" => {
                    let target = str_param(&request.params, "target").unwrap_or_default();
                    if target.trim().is_empty() {
                        return invalid_params(
                            request.id,
                            "query.relationship dependents requires non-empty 'target'",
                        );
                    }
                    let inferred_languages = infer_languages_for_target(db, workspace_id, &target);
                    if let Some(summary) = unsupported_relationship_summary("dependents", &inferred_languages)
                    {
                        return ok_result(
                            request.id,
                            unsupported_relationship_result(
                                "dependents",
                                "dependents",
                                &target,
                                summary,
                            ),
                        );
                    }
                    match db.find_dependents(FindDependentsQuery {
                        workspace_id,
                        target: target.clone(),
                        limit,
                    }) {
                        Ok(result) => {
                            let items = result
                                .items
                                .into_iter()
                                .map(|dep| SearchItem {
                                    file_path: dep,
                                    line_start: 0,
                                    line_end: 0,
                                    snippet: "dependent".into(),
                                    reason: "direct dependent".into(),
                                    score: 0.9,
                                })
                                .collect::<Vec<_>>();
                            let language_summary = relationship_capability_summary(
                                "dependents",
                                &items,
                                &[target.clone()],
                                &inferred_languages,
                            );

                            ok_result(
                                request.id,
                                BridgeResult {
                                    answer_state: answer_state_str(result.answer_state).into(),
                                    question_class: "dependents".into(),
                                    items,
                                    evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                                    language_capability_summary: Some(language_summary),
                                },
                            )
                        }
                        Err(err) => {
                            internal_error(request.id, format!("query.relationship failed: {err}"))
                        }
                    }
                }
                _ => method_not_supported(
                    request.id,
                    &format!(
                        "query.relationship relation not supported in bridge contract v2: {relation}"
                    ),
                ),
            }
        }
        QUERY_BUILD_EVIDENCE_METHOD => {
            let query = str_param(&request.params, "query").unwrap_or_default();
            if query.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "query.buildEvidence requires a non-empty 'query' parameter",
                );
            }

            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let raw_intent = str_param(&request.params, "intent").unwrap_or_default();
            let intent = raw_intent.trim();
            if !intent.is_empty() && !intent.eq_ignore_ascii_case("explain") {
                return ok_result(
                    request.id,
                    unsupported_build_evidence_intent_result(query, intent),
                );
            }
            let intent = "explain".to_string();
            let targets = string_array_param(&request.params, "targets");
            let budget = request
                .params
                .get("budget")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let max_files = int_param(&budget, "maxFiles", BUILD_EVIDENCE_DEFAULT_MAX_FILES)
                .min(BUILD_EVIDENCE_HARD_MAX_FILES);
            let max_symbols = int_param(&budget, "maxSymbols", BUILD_EVIDENCE_DEFAULT_MAX_SYMBOLS)
                .min(BUILD_EVIDENCE_HARD_MAX_SYMBOLS);
            let max_snippets =
                int_param(&budget, "maxSnippets", BUILD_EVIDENCE_DEFAULT_MAX_SNIPPETS)
                    .min(BUILD_EVIDENCE_HARD_MAX_SNIPPETS);
            let freshness = str_param_opt(&request.params, "freshness");

            match db.build_evidence(BuildEvidenceQuery {
                workspace_id,
                query,
                intent,
                targets,
                max_files,
                max_symbols,
                max_snippets,
                freshness,
            }) {
                Ok(result) => {
                    let items = build_evidence_preview_items(&result.evidence);
                    ok_result(
                        request.id,
                        BridgeResult {
                            answer_state: answer_state_str(result.answer_state).into(),
                            question_class: "build_evidence".into(),
                            items,
                            evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                            language_capability_summary: None,
                        },
                    )
                }
                Err(err) => {
                    internal_error(request.id, format!("query.buildEvidence failed: {err}"))
                }
            }
        }
        _ => method_not_supported(
            request.id,
            &format!(
                "RPC method '{}' is outside the bounded bridge query contract",
                request.method
            ),
        ),
    }
}

fn unsupported_build_evidence_intent_result(query: String, intent: &str) -> BridgeResult {
    BridgeResult {
        answer_state: "unsupported".into(),
        question_class: "build_evidence".into(),
        items: Vec::new(),
        evidence: Some(WireEvidencePacket {
            answer_state: "unsupported".into(),
            question_class: "build_evidence".into(),
            subject: query,
            summary: "Build evidence (explain)".into(),
            conclusion: format!(
                "unsupported build-evidence intent: '{intent}' is outside the bounded explain-only contract"
            ),
            evidence: Vec::new(),
            gaps: vec![format!(
                "query.buildEvidence intent must be empty or 'explain'; received '{intent}'"
            )],
            bounds: WireEvidenceBounds {
                hop_count: Some(0),
                node_limit: Some(0),
                traversal_scope: Some("build_evidence".into()),
                stop_reason: Some("unsupported_intent".into()),
            },
        }),
        language_capability_summary: None,
    }
}

fn write_rpc_response(writer: &mut io::BufWriter<impl Write>, payload: &Value) -> Result<()> {
    let body = serde_json::to_string(payload)?;
    write!(writer, "Content-Length: {}\r\n\r\n{}", body.len(), body)?;
    writer.flush()?;
    Ok(())
}

fn initialize_result(workspace: &Path) -> InitializeResult {
    InitializeResult {
        server_name: "dh-engine",
        server_version: env!("CARGO_PKG_VERSION"),
        workspace_root: workspace.to_string_lossy().to_string(),
        protocol_version: WORKER_PROTOCOL_VERSION,
        capabilities: BridgeCapabilities {
            protocol_version: WORKER_PROTOCOL_VERSION,
            methods: BRIDGE_INITIALIZE_METHODS.to_vec(),
            query_relationship: BridgeQueryRelationshipCapabilities {
                supported_relations: QUERY_RELATIONSHIPS.to_vec(),
            },
            language_capability_matrix: language_capability_matrix()
                .into_iter()
                .map(to_wire_language_capability_entry)
                .collect::<Vec<_>>(),
            lifecycle_control: WireLifecycleControl {
                methods: BRIDGE_LIFECYCLE_CONTROL_METHODS.to_vec(),
                max_auto_restarts: 1,
            },
            rust_host_lifecycle_contract: lifecycle_contract(),
            worker_protocol_contract: worker_protocol_contract(),
        },
    }
}

fn ok_result(id: Value, result: impl Serialize) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
}

fn invalid_params(id: Value, message: &str) -> Value {
    BridgeRpcError::invalid_request(message).to_response(id)
}

fn method_not_supported(id: Value, message: &str) -> Value {
    BridgeRpcError::capability_unsupported(message).to_response(id)
}

fn internal_error(id: Value, message: String) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": -32001,
            "message": message
        }
    })
}

fn str_param(params: &Value, key: &str) -> Option<String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn str_param_opt(params: &Value, key: &str) -> Option<String> {
    str_param(params, key).filter(|s| !s.trim().is_empty())
}

fn string_array_param(params: &Value, key: &str) -> Vec<String> {
    params
        .get(key)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn int_param(params: &Value, key: &str, default: usize) -> usize {
    params
        .get(key)
        .and_then(Value::as_u64)
        .map(|v| v as usize)
        .unwrap_or(default)
}

fn int_param_opt(params: &Value, key: &str) -> Option<usize> {
    params.get(key).and_then(Value::as_u64).map(|v| v as usize)
}

fn bool_param(params: &Value, key: &str, default: bool) -> bool {
    params.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn answer_state_str(state: AnswerState) -> &'static str {
    match state {
        AnswerState::Grounded => "grounded",
        AnswerState::Partial => "partial",
        AnswerState::Insufficient => "insufficient",
        AnswerState::Unsupported => "unsupported",
    }
}

fn question_class_str(class: QuestionClass) -> &'static str {
    match class {
        QuestionClass::FindSymbol => "find_symbol",
        QuestionClass::BuildEvidence => "build_evidence",
        QuestionClass::Definition => "definition",
        QuestionClass::References => "references",
        QuestionClass::Dependencies => "dependencies",
        QuestionClass::Dependents => "dependents",
        QuestionClass::CallHierarchy => "call_hierarchy",
        QuestionClass::TraceFlow => "trace_flow",
        QuestionClass::Impact => "impact",
    }
}

fn search_question_class(mode: &str) -> &'static str {
    if mode == "file_path" {
        "search_file_discovery"
    } else if mode == "structural" {
        "search_structural"
    } else if mode == "concept" {
        "search_concept_relevance"
    } else {
        "search_symbol"
    }
}

fn build_search_evidence_packet(query: &str, mode: &str, items: &[SearchItem]) -> EvidencePacket {
    let retrieval_only = mode != "symbol";
    let kind = if retrieval_only {
        EvidenceKind::Chunk
    } else {
        EvidenceKind::Definition
    };
    let source = if retrieval_only {
        EvidenceSource::Query
    } else {
        EvidenceSource::Storage
    };

    let mut evidence_entries = Vec::new();
    for item in items.iter().take(20) {
        let confidence = if !retrieval_only && item.score >= 0.90 {
            EvidenceConfidence::Grounded
        } else {
            EvidenceConfidence::Partial
        };

        evidence_entries.push(EvidenceEntry {
            kind,
            file_path: item.file_path.clone(),
            symbol: None,
            line_start: if item.line_start > 0 {
                Some(item.line_start)
            } else {
                None
            },
            line_end: if item.line_end > 0 {
                Some(item.line_end)
            } else {
                None
            },
            snippet: Some(item.snippet.clone()),
            reason: item.reason.clone(),
            source,
            confidence,
        });
    }

    let answer_state = if items.is_empty() {
        AnswerState::Insufficient
    } else if retrieval_only {
        AnswerState::Partial
    } else if evidence_entries
        .iter()
        .all(|entry| entry.confidence == EvidenceConfidence::Grounded)
    {
        AnswerState::Grounded
    } else {
        AnswerState::Partial
    };

    let mut gaps = Vec::new();
    if items.is_empty() {
        gaps.push(format!("no {mode} search matches found for '{query}'"));
    } else if retrieval_only {
        gaps.push(
            "search results are retrieval-backed and do not prove parser-backed relation support"
                .into(),
        );
    } else if answer_state == AnswerState::Partial {
        gaps.push("one or more symbol matches are lower confidence".into());
    }

    EvidencePacket {
        answer_state,
        question_class: QuestionClass::FindSymbol,
        subject: query.to_string(),
        summary: format!("{mode} search results"),
        conclusion: match answer_state {
            AnswerState::Grounded => "grounded symbol search evidence available".into(),
            AnswerState::Partial => {
                if retrieval_only {
                    "partial retrieval-backed search evidence available".into()
                } else {
                    "partial symbol-search evidence available".into()
                }
            }
            AnswerState::Insufficient => "insufficient search evidence".into(),
            AnswerState::Unsupported => "unsupported search request".into(),
        },
        evidence: evidence_entries,
        gaps,
        bounds: EvidenceBounds {
            hop_count: Some(0),
            node_limit: Some(items.len()),
            traversal_scope: Some(search_question_class(mode).into()),
            stop_reason: if items.is_empty() {
                Some("no_matches".into())
            } else {
                None
            },
        },
    }
}

fn build_definition_insufficient_evidence_packet(
    symbol: &str,
    file_path_hint: Option<&str>,
) -> EvidencePacket {
    let mut gaps = vec![format!(
        "no parser-backed definition match found for '{symbol}'"
    )];
    if let Some(hint) = file_path_hint {
        gaps.push(format!(
            "no definition candidate found in hinted path '{hint}'"
        ));
    }

    EvidencePacket {
        answer_state: AnswerState::Insufficient,
        question_class: QuestionClass::Definition,
        subject: symbol.to_string(),
        summary: "Definition lookup".into(),
        conclusion: format!("insufficient definition evidence for '{symbol}'"),
        evidence: Vec::new(),
        gaps,
        bounds: EvidenceBounds {
            hop_count: Some(0),
            node_limit: Some(0),
            traversal_scope: Some("goto_definition".into()),
            stop_reason: Some("no_definition_match".into()),
        },
    }
}

fn build_evidence_preview_items(packet: &EvidencePacket) -> Vec<SearchItem> {
    packet
        .evidence
        .iter()
        .take(10)
        .map(|entry| SearchItem {
            file_path: entry.file_path.clone(),
            line_start: entry.line_start.unwrap_or(0),
            line_end: entry.line_end.unwrap_or(0),
            snippet: entry
                .snippet
                .clone()
                .or_else(|| entry.symbol.clone())
                .unwrap_or_else(|| entry.reason.clone()),
            reason: entry.reason.clone(),
            score: match entry.confidence {
                EvidenceConfidence::Grounded => 0.95,
                EvidenceConfidence::Partial => 0.70,
            },
        })
        .collect()
}

fn to_wire_evidence_packet(
    packet: EvidencePacket,
    question_class_override: Option<&str>,
) -> WireEvidencePacket {
    WireEvidencePacket {
        answer_state: answer_state_str(packet.answer_state).to_string(),
        question_class: question_class_override
            .unwrap_or(question_class_str(packet.question_class))
            .to_string(),
        subject: packet.subject,
        summary: packet.summary,
        conclusion: packet.conclusion,
        evidence: packet
            .evidence
            .into_iter()
            .map(|entry| WireEvidenceEntry {
                kind: evidence_kind_str(entry.kind).to_string(),
                file_path: entry.file_path,
                symbol: entry.symbol,
                line_start: entry.line_start,
                line_end: entry.line_end,
                snippet: entry.snippet,
                reason: entry.reason,
                source: evidence_source_str(entry.source).to_string(),
                confidence: evidence_confidence_str(entry.confidence).to_string(),
            })
            .collect(),
        gaps: packet.gaps,
        bounds: WireEvidenceBounds {
            hop_count: packet.bounds.hop_count,
            node_limit: packet.bounds.node_limit,
            traversal_scope: packet.bounds.traversal_scope,
            stop_reason: packet.bounds.stop_reason,
        },
    }
}

fn evidence_kind_str(kind: EvidenceKind) -> &'static str {
    match kind {
        EvidenceKind::Definition => "definition",
        EvidenceKind::Reference => "reference",
        EvidenceKind::Dependency => "dependency",
        EvidenceKind::Dependent => "dependent",
        EvidenceKind::Call => "call",
        EvidenceKind::TraceStep => "trace_step",
        EvidenceKind::ImpactEdge => "impact_edge",
        EvidenceKind::Chunk => "chunk",
    }
}

fn evidence_source_str(source: EvidenceSource) -> &'static str {
    match source {
        EvidenceSource::Graph => "graph",
        EvidenceSource::Query => "query",
        EvidenceSource::Storage => "storage",
    }
}

fn evidence_confidence_str(confidence: EvidenceConfidence) -> &'static str {
    match confidence {
        EvidenceConfidence::Grounded => "grounded",
        EvidenceConfidence::Partial => "partial",
    }
}

fn to_wire_language_capability_entry(
    entry: dh_types::LanguageCapabilityEntry,
) -> WireLanguageCapabilityEntry {
    WireLanguageCapabilityEntry {
        language: language_id_to_wire(entry.language).to_string(),
        capability: capability_to_wire(entry.capability).to_string(),
        state: capability_state_to_wire(entry.state).replace('_', "-"),
        reason: entry.reason,
        parser_backed: entry.parser_backed,
    }
}

fn to_wire_language_capability_summary(
    summary: LanguageCapabilitySummary,
) -> WireLanguageCapabilitySummary {
    WireLanguageCapabilitySummary {
        capability: capability_to_wire(summary.capability).to_string(),
        weakest_state: capability_state_to_wire(summary.weakest_state).replace('_', "-"),
        languages: summary
            .languages
            .into_iter()
            .map(|language| WireLanguageCapabilityLanguageSummary {
                language: language_id_to_wire(language.language).to_string(),
                state: capability_state_to_wire(language.state).replace('_', "-"),
                reason: language.reason,
                parser_backed: language.parser_backed,
            })
            .collect(),
        retrieval_only: summary.retrieval_only,
    }
}

fn relationship_capability_summary(
    relation: &str,
    items: &[SearchItem],
    language_hints: &[String],
    inferred_languages: &[LanguageId],
) -> WireLanguageCapabilitySummary {
    let mut languages = inferred_languages.to_vec();
    let mut paths = items
        .iter()
        .map(|item| item.file_path.clone())
        .collect::<Vec<_>>();
    for hint in language_hints {
        paths.push(hint.clone());
    }
    merge_languages(&mut languages, infer_query_languages_from_paths(&paths));
    if languages.is_empty() {
        languages.push(LanguageId::Unknown);
    }

    let summary = classify_relationship_support(relation, &languages, false);
    to_wire_language_capability_summary(summary)
}

fn unsupported_relationship_summary(
    relation: &str,
    inferred_languages: &[LanguageId],
) -> Option<WireLanguageCapabilitySummary> {
    if inferred_languages.is_empty() {
        return None;
    }

    let summary = classify_relationship_support(relation, inferred_languages, false);
    if summary.weakest_state == LanguageCapabilityState::Unsupported {
        Some(to_wire_language_capability_summary(summary))
    } else {
        None
    }
}

fn unsupported_relationship_result(
    relation: &str,
    question_class: &str,
    subject: &str,
    summary: WireLanguageCapabilitySummary,
) -> BridgeResult {
    let evidence_question_class = match question_class {
        "dependencies" => QuestionClass::Dependencies,
        "dependents" => QuestionClass::Dependents,
        _ => QuestionClass::References,
    };

    let mut gaps = summary
        .languages
        .iter()
        .filter(|entry| entry.state == "unsupported")
        .map(|entry| format!("{}: {}", entry.language, entry.reason))
        .collect::<Vec<_>>();
    if gaps.is_empty() {
        gaps.push(format!(
            "relationship '{relation}' is unsupported for inferred language capability profile"
        ));
    }

    let evidence = to_wire_evidence_packet(
        EvidencePacket {
            answer_state: AnswerState::Unsupported,
            question_class: evidence_question_class,
            subject: subject.to_string(),
            summary: format!("{relation} relationship capability"),
            conclusion: format!(
                "unsupported relationship evidence for '{relation}' in inferred language set"
            ),
            evidence: Vec::new(),
            gaps,
            bounds: EvidenceBounds {
                hop_count: Some(0),
                node_limit: Some(0),
                traversal_scope: Some(format!("relationship_{relation}")),
                stop_reason: Some("unsupported_language_capability".into()),
            },
        },
        Some(question_class),
    );

    BridgeResult {
        answer_state: "unsupported".into(),
        question_class: question_class.into(),
        items: Vec::new(),
        evidence: Some(evidence),
        language_capability_summary: Some(summary),
    }
}

fn infer_languages_for_target(db: &Database, workspace_id: i64, target: &str) -> Vec<LanguageId> {
    let mut languages = Vec::new();

    if let Some(language) = infer_language_from_path(target) {
        languages.push(language);
    }

    if let Ok(Some(file)) = db.get_file_by_path(workspace_id, target) {
        push_language(&mut languages, file.language);
    }

    if languages.is_empty() {
        merge_languages(
            &mut languages,
            infer_languages_for_symbol(db, workspace_id, target),
        );
    }

    languages
}

fn infer_languages_for_symbol(db: &Database, workspace_id: i64, symbol: &str) -> Vec<LanguageId> {
    if symbol.trim().is_empty() {
        return Vec::new();
    }

    let mut languages = Vec::new();
    let Ok(symbols) = db.find_symbol_definitions(workspace_id, symbol, 16) else {
        return languages;
    };

    for matched in symbols {
        if let Ok(Some(file)) = db.find_file_by_id(workspace_id, matched.file_id) {
            push_language(&mut languages, file.language);
        }
    }

    languages
}

fn merge_languages(target: &mut Vec<LanguageId>, source: Vec<LanguageId>) {
    for language in source {
        push_language(target, language);
    }
}

fn push_language(target: &mut Vec<LanguageId>, language: LanguageId) {
    if !target.contains(&language) {
        target.push(language);
    }
}

#[cfg(test)]
mod tests {
    use super::{handle_request, BridgeRpcRouter, RpcRequest};
    use dh_storage::{
        CallEdgeRepository, Database, FileRepository, ImportRepository, ReferenceRepository,
        SymbolRepository,
    };
    use dh_types::{
        CallEdge, CallKind, File, FreshnessReason, FreshnessState, Import, ImportKind, LanguageId,
        ParseStatus, Reference, ReferenceKind, Span, Symbol, SymbolKind, Visibility,
    };
    use serde_json::json;
    use serde_json::Value;

    fn setup_db() -> anyhow::Result<(tempfile::TempDir, Database)> {
        let tmp = tempfile::tempdir()?;
        let db_path = tmp.path().join("dh-index.db");
        let db = Database::new(&db_path)?;
        db.initialize()?;
        db.connection().execute(
            "INSERT INTO workspaces(id, root_path, created_at, updated_at) VALUES (1, '/tmp/ws', 0, 0)",
            [],
        )?;
        db.connection().execute(
            "INSERT INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES (1, 1, '/tmp/ws', 'git_root', NULL)",
            [],
        )?;
        Ok((tmp, db))
    }

    fn seed(db: &Database) -> anyhow::Result<()> {
        db.upsert_file(&File {
            id: 1,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/main.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "a".into(),
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
            last_freshness_run_id: Some("run-bridge-1".into()),
        })?;
        db.upsert_file(&File {
            id: 2,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/util.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "b".into(),
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
            last_freshness_run_id: Some("run-bridge-2".into()),
        })?;
        db.upsert_file(&File {
            id: 3,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/mod.py".into(),
            language: LanguageId::Python,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "c".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 2,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-bridge-3".into()),
        })?;
        db.upsert_file(&File {
            id: 4,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/lib.rs".into(),
            language: LanguageId::Rust,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "d".into(),
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
            last_freshness_run_id: Some("run-bridge-4".into()),
        })?;
        db.upsert_file(&File {
            id: 5,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/legacy.unknown".into(),
            language: LanguageId::Unknown,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "e".into(),
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
            last_freshness_run_id: Some("run-bridge-5".into()),
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
            Symbol {
                id: 12,
                workspace_id: 1,
                file_id: 3,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "py_helper".into(),
                qualified_name: "py_helper".into(),
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
                symbol_hash: "s12".into(),
            },
            Symbol {
                id: 13,
                workspace_id: 1,
                file_id: 3,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "py_caller".into(),
                qualified_name: "py_caller".into(),
                signature: None,
                detail: None,
                visibility: Visibility::Public,
                exported: true,
                async_flag: false,
                static_flag: false,
                span: Span {
                    start_byte: 2,
                    end_byte: 3,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                },
                symbol_hash: "s13".into(),
            },
            Symbol {
                id: 14,
                workspace_id: 1,
                file_id: 4,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "rust_helper".into(),
                qualified_name: "rust_helper".into(),
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
                symbol_hash: "s14".into(),
            },
            Symbol {
                id: 15,
                workspace_id: 1,
                file_id: 5,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "mystery_symbol".into(),
                qualified_name: "mystery_symbol".into(),
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
                symbol_hash: "s15".into(),
            },
        ])?;

        db.insert_imports(&[Import {
            id: 100,
            workspace_id: 1,
            source_file_id: 1,
            source_symbol_id: None,
            raw_specifier: "./util".into(),
            imported_name: Some("helper".into()),
            local_name: Some("helper".into()),
            alias: None,
            kind: ImportKind::EsmNamed,
            is_type_only: false,
            is_reexport: false,
            resolved_file_id: Some(2),
            resolved_symbol_id: Some(11),
            span: Span {
                start_byte: 0,
                end_byte: 1,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 1,
            },
            resolution_error: None,
        }])?;

        db.insert_references(&[Reference {
            id: 101,
            workspace_id: 1,
            source_file_id: 1,
            source_symbol_id: Some(10),
            target_symbol_id: Some(11),
            target_name: "helper".into(),
            kind: ReferenceKind::Call,
            resolved: true,
            resolution_confidence: 1.0,
            span: Span {
                start_byte: 0,
                end_byte: 1,
                start_line: 2,
                start_column: 0,
                end_line: 2,
                end_column: 1,
            },
        }])?;

        db.insert_call_edges(&[
            CallEdge {
                id: 102,
                workspace_id: 1,
                source_file_id: 1,
                caller_symbol_id: Some(10),
                callee_symbol_id: Some(11),
                callee_qualified_name: Some("helper".into()),
                callee_display_name: "helper".into(),
                kind: CallKind::Direct,
                resolved: true,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                },
            },
            CallEdge {
                id: 103,
                workspace_id: 1,
                source_file_id: 3,
                caller_symbol_id: Some(13),
                callee_symbol_id: Some(12),
                callee_qualified_name: Some("py_helper".into()),
                callee_display_name: "py_helper".into(),
                kind: CallKind::Direct,
                resolved: true,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                },
            },
            CallEdge {
                id: 104,
                workspace_id: 1,
                source_file_id: 1,
                caller_symbol_id: Some(10),
                callee_symbol_id: Some(14),
                callee_qualified_name: Some("rust_helper".into()),
                callee_display_name: "rust_helper".into(),
                kind: CallKind::Direct,
                resolved: true,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 3,
                    start_column: 0,
                    end_line: 3,
                    end_column: 1,
                },
            },
        ])?;

        Ok(())
    }

    #[test]
    fn bridge_supports_required_question_classes() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;

        let mk = |method: &str, params: Value| RpcRequest {
            id: json!(1),
            method: method.into(),
            params,
        };

        let definition = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.definition",
                json!({ "symbol": "helper", "workspaceId": 1 }),
            ),
        );
        assert!(definition["result"]["items"].as_array().is_some());
        assert_eq!(
            definition["result"]["evidence"]["questionClass"],
            json!("definition")
        );

        let search = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.search",
                json!({ "query": "main", "workspaceId": 1, "mode": "file_path" }),
            ),
        );
        assert_eq!(
            search["result"]["questionClass"],
            json!("search_file_discovery")
        );
        assert_eq!(
            search["result"]["evidence"]["questionClass"],
            json!("search_file_discovery")
        );

        let definition_none = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.definition",
                json!({ "symbol": "missingSymbol", "workspaceId": 1 }),
            ),
        );
        assert_eq!(
            definition_none["result"]["answerState"],
            json!("insufficient")
        );
        assert_eq!(
            definition_none["result"]["evidence"]["questionClass"],
            json!("definition")
        );
        assert!(definition_none["result"]["evidence"]["gaps"]
            .as_array()
            .is_some_and(|gaps| gaps.iter().any(|gap| gap
                .as_str()
                .is_some_and(|text| text.contains("no parser-backed definition match")))));

        let usage = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "usage", "symbol": "helper", "workspaceId": 1 }),
            ),
        );
        assert!(usage["result"]["items"].as_array().is_some());
        assert_eq!(usage["result"]["answerState"], "grounded");
        assert!(usage["result"]["evidence"].is_object());

        let deps = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "dependencies", "filePath": "src/main.ts", "workspaceId": 1 }),
            ),
        );
        assert!(deps["result"]["items"].as_array().is_some());

        let dependents = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "dependents", "target": "src/util.ts", "workspaceId": 1 }),
            ),
        );
        assert!(dependents["result"]["items"].as_array().is_some());

        let build_evidence = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.buildEvidence",
                json!({
                    "query": "how does helper work?",
                    "intent": "explain",
                    "targets": ["helper"],
                    "budget": {
                        "maxFiles": 5,
                        "maxSymbols": 8,
                        "maxSnippets": 8
                    },
                    "workspaceId": 1
                }),
            ),
        );
        assert_eq!(build_evidence["result"]["answerState"], json!("grounded"));
        assert_eq!(
            build_evidence["result"]["questionClass"],
            json!("build_evidence")
        );
        assert_eq!(
            build_evidence["result"]["evidence"]["questionClass"],
            json!("build_evidence")
        );
        assert!(build_evidence["result"]["evidence"]["evidence"]
            .as_array()
            .is_some_and(|items| !items.is_empty()));

        let build_evidence_unsupported = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.buildEvidence",
                json!({
                    "query": "trace flow through the entire subsystem",
                    "intent": "explain",
                    "workspaceId": 1
                }),
            ),
        );
        assert_eq!(
            build_evidence_unsupported["result"]["answerState"],
            json!("unsupported")
        );
        assert_eq!(
            build_evidence_unsupported["result"]["evidence"]["bounds"]["stopReason"],
            json!("runtime_trace")
        );

        let unsupported_unknown_usage = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "usage", "symbol": "mystery_symbol", "workspaceId": 1 }),
            ),
        );
        assert_eq!(
            unsupported_unknown_usage["result"]["answerState"],
            json!("unsupported")
        );
        assert_eq!(
            unsupported_unknown_usage["result"]["questionClass"],
            json!("references")
        );
        assert_eq!(
            unsupported_unknown_usage["result"]["evidence"]["questionClass"],
            json!("references")
        );
        assert_eq!(
            unsupported_unknown_usage["result"]["evidence"]["bounds"]["stopReason"],
            json!("unsupported_language_capability")
        );
        assert!(unsupported_unknown_usage["result"]["evidence"]["gaps"]
            .as_array()
            .is_some_and(|gaps| !gaps.is_empty()));

        let unsupported = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "deep_impact", "target": "unknown-target", "workspaceId": 1 }),
            ),
        );
        assert_eq!(unsupported["error"]["code"], -32601);
        assert!(unsupported["error"]["message"]
            .as_str()
            .is_some_and(|value| value.contains("bridge contract v2")));

        db.insert_references(&[Reference {
            id: 999,
            workspace_id: 1,
            source_file_id: 1,
            source_symbol_id: Some(10),
            target_symbol_id: Some(11),
            target_name: "helper".into(),
            kind: ReferenceKind::Call,
            resolved: false,
            resolution_confidence: 0.25,
            span: Span {
                start_byte: 0,
                end_byte: 1,
                start_line: 3,
                start_column: 0,
                end_line: 3,
                end_column: 1,
            },
        }])?;

        let usage_partial = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "usage", "symbol": "helper", "workspaceId": 1 }),
            ),
        );
        assert_eq!(usage_partial["result"]["answerState"], "partial");
        assert!(usage_partial["result"]["evidence"].is_object());
        assert!(usage_partial["result"]["evidence"]["gaps"]
            .as_array()
            .is_some_and(|gaps| gaps
                .iter()
                .any(|gap| gap.as_str().is_some_and(|text| text.contains("unresolved")))));

        Ok(())
    }

    #[test]
    fn initialize_advertises_stable_v2_capabilities() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let response = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(42),
                method: "dh.initialize".into(),
                params: json!({}),
            },
        );

        assert_eq!(response["result"]["protocolVersion"], "1");
        assert_eq!(response["result"]["capabilities"]["protocolVersion"], "1");
        assert_eq!(
            response["result"]["capabilities"]["methods"],
            json!([
                "dh.initialize",
                "query.search",
                "query.definition",
                "query.relationship",
                "query.buildEvidence"
            ])
        );
        assert_eq!(
            response["result"]["capabilities"]["queryRelationship"]["supportedRelations"],
            json!(["usage", "dependencies", "dependents"])
        );
        assert_eq!(
            response["result"]["capabilities"]["lifecycleControl"]["methods"],
            json!([
                "dh.initialized",
                "dh.ready",
                "session.runCommand",
                "runtime.ping",
                "dh.shutdown"
            ])
        );
        assert_eq!(
            response["result"]["capabilities"]["lifecycleControl"]["maxAutoRestarts"],
            json!(1)
        );

        Ok(())
    }

    #[test]
    fn initialize_advertises_bounded_rust_host_lifecycle_contract() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let response = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(43),
                method: "dh.initialize".into(),
                params: json!({}),
            },
        );

        let contract = &response["result"]["capabilities"]["rustHostLifecycleContract"];
        assert_eq!(contract["topology"], json!("rust_host_ts_worker"));
        assert_eq!(
            contract["supportBoundary"],
            json!("knowledge_commands_first_wave")
        );
        assert_eq!(
            contract["supportedCommands"],
            json!(["ask", "explain", "trace"])
        );
        assert_eq!(contract["authorityOwner"], json!("rust"));
        assert_eq!(contract["workerRole"], json!("typescript_worker"));
        assert_eq!(contract["boundaries"]["localOnly"], json!(true));
        assert_eq!(contract["boundaries"]["networkTransport"], json!(false));
        assert_eq!(contract["boundaries"]["daemonMode"], json!(false));
        assert_eq!(contract["boundaries"]["windowsSupport"], json!(false));

        let protocol = &response["result"]["capabilities"]["workerProtocolContract"];
        assert_eq!(
            protocol["framing"]["transport"],
            json!("jsonrpc_stdio_content_length")
        );
        assert_eq!(protocol["framing"]["networkTransport"], json!(false));
        assert_eq!(
            protocol["framing"]["arbitraryMethodPassthrough"],
            json!(false)
        );
        assert_eq!(
            protocol["workerToHostQueryMethods"],
            json!([
                "query.search",
                "query.definition",
                "query.relationship",
                "query.buildEvidence"
            ])
        );
        assert_eq!(
            protocol["buildEvidence"]["answerStates"],
            json!(["grounded", "partial", "insufficient", "unsupported"])
        );
        assert_eq!(
            protocol["buildEvidence"]["canonicalPacketOwner"],
            json!("rust")
        );
        assert_eq!(
            protocol["buildEvidence"]["lifecycleEvidenceSeparation"],
            json!(true)
        );
        assert_eq!(
            protocol["buildEvidence"]["typescriptPacketSynthesis"],
            json!(false)
        );
        assert_eq!(
            protocol["buildEvidence"]["genericPassthrough"],
            json!(false)
        );

        Ok(())
    }

    #[test]
    fn bridge_rpc_router_reuses_query_handlers_without_stdio_server() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;
        let router = BridgeRpcRouter::new(tmp.path(), &db);

        let response = router.route_worker_query(RpcRequest {
            id: json!(44),
            method: "query.definition".into(),
            params: json!({ "symbol": "helper", "workspaceId": 1 }),
        });

        assert_eq!(response["result"]["questionClass"], json!("definition"));
        let items = response["result"]["items"].as_array();
        assert!(items.is_some());
        assert!(!items.unwrap().is_empty());

        Ok(())
    }

    #[test]
    fn bridge_rpc_router_routes_named_build_evidence_without_generic_passthrough(
    ) -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;
        let router = BridgeRpcRouter::new(tmp.path(), &db);

        let response = router.route_worker_query(RpcRequest {
            id: json!(46),
            method: "query.buildEvidence".into(),
            params: json!({
                "query": "how does helper work?",
                "intent": "explain",
                "targets": ["helper"],
                "budget": {
                    "maxFiles": 5,
                    "maxSymbols": 8,
                    "maxSnippets": 8
                },
                "freshness": "indexed",
                "workspaceId": 1
            }),
        });

        assert_eq!(response["result"]["answerState"], json!("grounded"));
        assert_eq!(response["result"]["questionClass"], json!("build_evidence"));
        assert_eq!(
            response["result"]["evidence"]["answerState"],
            json!("grounded")
        );
        assert_eq!(
            response["result"]["evidence"]["questionClass"],
            json!("build_evidence")
        );
        assert!(response["result"]["evidence"]["evidence"]
            .as_array()
            .is_some_and(|items| !items.is_empty()));
        assert!(response["result"]["items"]
            .as_array()
            .is_some_and(|items| !items.is_empty()));

        Ok(())
    }

    #[test]
    fn bridge_build_evidence_rejects_non_explain_intents_without_grounding() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;
        let router = BridgeRpcRouter::new(tmp.path(), &db);

        for intent in ["trace", "impact", "call_hierarchy", "arbitrary"] {
            let response = router.route_worker_query(RpcRequest {
                id: json!(50),
                method: "query.buildEvidence".into(),
                params: json!({
                    "query": "how does helper work?",
                    "intent": intent,
                    "targets": ["helper"],
                    "workspaceId": 1
                }),
            });

            assert_eq!(response["result"]["answerState"], json!("unsupported"));
            assert_eq!(response["result"]["questionClass"], json!("build_evidence"));
            assert_eq!(response["result"]["items"], json!([]));
            assert_eq!(
                response["result"]["evidence"]["answerState"],
                json!("unsupported")
            );
            assert_eq!(
                response["result"]["evidence"]["bounds"]["stopReason"],
                json!("unsupported_intent")
            );
            assert!(response["result"]["evidence"]["evidence"]
                .as_array()
                .is_some_and(|items| items.is_empty()));
            assert!(response["result"]["evidence"]["gaps"]
                .as_array()
                .is_some_and(|gaps| gaps.iter().any(|gap| gap
                    .as_str()
                    .is_some_and(|value| value.contains("query.buildEvidence intent")))));
        }

        Ok(())
    }

    #[test]
    fn bridge_build_evidence_preserves_unsupported_language_packet_state() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;
        let router = BridgeRpcRouter::new(tmp.path(), &db);

        let response = router.route_worker_query(RpcRequest {
            id: json!(47),
            method: "query.buildEvidence".into(),
            params: json!({
                "query": "how does mystery_symbol work?",
                "intent": "explain",
                "targets": ["mystery_symbol"],
                "workspaceId": 1
            }),
        });

        assert_eq!(response["result"]["answerState"], json!("unsupported"));
        assert_eq!(
            response["result"]["evidence"]["answerState"],
            json!("unsupported")
        );
        assert_eq!(
            response["result"]["evidence"]["bounds"]["stopReason"],
            json!("unsupported_language_capability")
        );
        assert!(response["result"]["evidence"]["evidence"]
            .as_array()
            .is_some_and(|items| items.is_empty()));
        assert!(response["result"]["evidence"]["gaps"]
            .as_array()
            .is_some_and(|gaps| gaps.iter().any(|gap| gap
                .as_str()
                .is_some_and(|value| value.contains("unsupported language/capability")))));

        Ok(())
    }

    #[test]
    fn bridge_build_evidence_preserves_partial_and_insufficient_packet_states() -> anyhow::Result<()>
    {
        let (tmp, db) = setup_db()?;
        seed(&db)?;
        let router = BridgeRpcRouter::new(tmp.path(), &db);

        db.upsert_file(&File {
            id: 1,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/main.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "a-stale".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::ParsedWithErrors,
            parse_error: Some("recoverable parser issue".into()),
            symbol_count: 1,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::DegradedPartial,
            freshness_reason: Some(FreshnessReason::RecoverableParseIssues),
            last_freshness_run_id: Some("run-bridge-partial".into()),
        })?;

        let partial = router.route_worker_query(RpcRequest {
            id: json!(48),
            method: "query.buildEvidence".into(),
            params: json!({
                "query": "how does run work?",
                "intent": "explain",
                "targets": ["run"],
                "budget": {
                    "maxFiles": 1,
                    "maxSymbols": 8,
                    "maxSnippets": 1
                },
                "workspaceId": 1
            }),
        });

        assert_eq!(partial["result"]["answerState"], json!("partial"));
        assert_eq!(
            partial["result"]["evidence"]["answerState"],
            json!("partial")
        );
        assert_eq!(
            partial["result"]["evidence"]["bounds"]["stopReason"],
            json!("partial_index_or_capability")
        );
        assert!(partial["result"]["evidence"]["gaps"]
            .as_array()
            .is_some_and(|gaps| gaps.iter().any(|gap| gap
                .as_str()
                .is_some_and(|value| value.contains("partial index coverage")))));

        let insufficient = router.route_worker_query(RpcRequest {
            id: json!(49),
            method: "query.buildEvidence".into(),
            params: json!({
                "query": "how does definitely_missing_subject work?",
                "intent": "explain",
                "targets": ["definitely_missing_subject"],
                "workspaceId": 1
            }),
        });

        assert_eq!(insufficient["result"]["answerState"], json!("insufficient"));
        assert_eq!(
            insufficient["result"]["evidence"]["answerState"],
            json!("insufficient")
        );
        assert_eq!(
            insufficient["result"]["evidence"]["bounds"]["stopReason"],
            json!("insufficient_evidence")
        );
        assert!(insufficient["result"]["evidence"]["evidence"]
            .as_array()
            .is_some_and(|items| items.is_empty()));
        assert!(insufficient["result"]["evidence"]["gaps"]
            .as_array()
            .is_some_and(|gaps| gaps.iter().any(|gap| gap
                .as_str()
                .is_some_and(|value| value.contains("no indexed evidence")))));

        Ok(())
    }

    #[test]
    fn bridge_rpc_router_rejects_methods_outside_worker_query_contract() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let router = BridgeRpcRouter::new(tmp.path(), &db);

        for method in [
            "tool.execute",
            "query.trace",
            "query.impactAnalysis",
            "query.callHierarchy",
            "arbitrary.forward",
        ] {
            let response = router.route_worker_query(RpcRequest {
                id: json!(45),
                method: method.into(),
                params: json!({}),
            });

            assert_eq!(response["error"]["code"], json!(-32601));
            assert_eq!(
                response["error"]["data"]["code"],
                json!("CAPABILITY_UNSUPPORTED")
            );
            assert!(response["error"]["message"]
                .as_str()
                .is_some_and(|value| value.contains("outside the first-wave host query contract")));
        }

        Ok(())
    }

    #[test]
    fn direct_bridge_rejects_out_of_scope_query_methods_with_capability_reason(
    ) -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;

        for method in ["query.trace", "query.impactAnalysis", "query.callHierarchy"] {
            let response = handle_request(
                tmp.path(),
                &db,
                RpcRequest {
                    id: json!(72),
                    method: method.into(),
                    params: json!({}),
                },
            );

            assert_eq!(response["error"]["code"], json!(-32601));
            assert_eq!(
                response["error"]["data"]["code"],
                json!("CAPABILITY_UNSUPPORTED")
            );
            assert!(response["error"]["message"]
                .as_str()
                .is_some_and(|value| value.contains("outside the bounded bridge query contract")));
        }

        Ok(())
    }

    #[test]
    fn lifecycle_control_methods_are_supported() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;

        let initialized = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(7),
                method: "dh.initialized".into(),
                params: json!({}),
            },
        );
        assert_eq!(initialized["result"]["accepted"], json!(true));
        assert_eq!(initialized["result"]["phase"], json!("startup"));

        let ready = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(8),
                method: "dh.ready".into(),
                params: json!({}),
            },
        );
        assert_eq!(ready["result"]["ready"], json!(true));
        assert_eq!(ready["result"]["workerState"], json!("ready"));
        assert_eq!(ready["result"]["healthState"], json!("healthy"));

        let ping = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(9),
                method: "runtime.ping".into(),
                params: json!({}),
            },
        );
        assert_eq!(ping["result"]["ok"], json!(true));
        assert_eq!(ping["result"]["phase"], json!("health"));

        let run_command = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(10),
                method: "session.runCommand".into(),
                params: json!({
                    "query": {
                        "method": "query.definition",
                        "params": {
                            "symbol": "helper",
                            "workspaceId": 1
                        }
                    }
                }),
            },
        );
        assert_eq!(run_command["result"]["method"], json!("query.definition"));
        assert!(run_command["result"]["items"].as_array().is_some());

        let run_build_evidence = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(12),
                method: "session.runCommand".into(),
                params: json!({
                    "query": {
                        "method": "query.buildEvidence",
                        "params": {
                            "query": "how does helper work?",
                            "intent": "explain",
                            "targets": ["helper"],
                            "workspaceId": 1
                        }
                    }
                }),
            },
        );
        assert_eq!(
            run_build_evidence["result"]["method"],
            json!("query.buildEvidence")
        );
        assert_eq!(
            run_build_evidence["result"]["questionClass"],
            json!("build_evidence")
        );
        assert_eq!(
            run_build_evidence["result"]["evidence"]["questionClass"],
            json!("build_evidence")
        );

        let run_arbitrary_method = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(13),
                method: "session.runCommand".into(),
                params: json!({
                    "query": {
                        "method": "arbitrary.forward",
                        "params": {}
                    }
                }),
            },
        );
        assert_eq!(run_arbitrary_method["error"]["code"], json!(-32601));
        assert_eq!(
            run_arbitrary_method["error"]["data"]["code"],
            json!("CAPABILITY_UNSUPPORTED")
        );

        let shutdown = handle_request(
            tmp.path(),
            &db,
            RpcRequest {
                id: json!(11),
                method: "dh.shutdown".into(),
                params: json!({}),
            },
        );
        assert_eq!(shutdown["result"]["accepted"], json!(true));
        assert_eq!(shutdown["result"]["phase"], json!("shutdown"));

        Ok(())
    }

    #[test]
    fn out_of_scope_relation_family_requests_are_rejected() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;

        for relation in ["call_hierarchy", "trace_flow", "impact"] {
            let response = handle_request(
                tmp.path(),
                &db,
                RpcRequest {
                    id: json!(71),
                    method: "query.relationship".into(),
                    params: json!({
                        "relation": relation,
                        "symbol": "helper",
                        "target": "src/main.ts",
                        "fromSymbol": "run",
                        "toSymbol": "helper",
                        "workspaceId": 1
                    }),
                },
            );

            assert_eq!(response["error"]["code"], -32601);
            assert!(response["error"]["message"]
                .as_str()
                .is_some_and(|value| value.contains("bridge contract v2")));
        }

        Ok(())
    }
}
