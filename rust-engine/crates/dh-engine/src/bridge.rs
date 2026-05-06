use crate::hooks::{HookContext, HookDispatcher};
use crate::host_lifecycle::{lifecycle_contract, LifecycleContract};
use crate::worker_protocol::{
    is_worker_to_host_query_method, worker_protocol_contract, WorkerProtocolContract,
    BRIDGE_INITIALIZE_METHODS, BRIDGE_LIFECYCLE_CONTROL_METHODS, BUILD_EVIDENCE_DEFAULT_MAX_FILES,
    BUILD_EVIDENCE_DEFAULT_MAX_SNIPPETS, BUILD_EVIDENCE_DEFAULT_MAX_SYMBOLS,
    BUILD_EVIDENCE_HARD_MAX_FILES, BUILD_EVIDENCE_HARD_MAX_SNIPPETS,
    BUILD_EVIDENCE_HARD_MAX_SYMBOLS, QUERY_BUILD_EVIDENCE_METHOD, QUERY_CALL_HIERARCHY_METHOD,
    QUERY_ENTRY_POINTS_METHOD, QUERY_RELATIONSHIPS, WORKER_PROTOCOL_VERSION,
};
use anyhow::{Context, Result};
use dh_indexer;
use dh_query::{
    capability_state_to_wire, capability_to_wire, classify_relationship_support,
    classify_search_support, infer_language_from_path, infer_query_languages_from_paths,
    language_capability_matrix, language_id_to_wire, summarize_language_capability,
    BuildEvidenceQuery, CallHierarchyQuery, EntryPointsQuery, FindDependenciesQuery,
    FindDependentsQuery, FindReferencesQuery, FindSymbolQuery, GotoDefinitionQuery,
    ImpactAnalysisQuery, QueryEngine, SemanticSearchQuery, TraceFlowQuery,
};
use dh_storage::{Database, FileRepository, GraphRepository, HookLogRepository};
use dh_types::HookName;
use dh_types::{
    AgentRole, AnswerState, EvidenceBounds, EvidenceConfidence, EvidenceEntry, EvidenceKind,
    EvidencePacket, EvidenceSource, HookDecision, LanguageCapability, LanguageCapabilityState,
    LanguageCapabilitySummary, LanguageId, QuestionClass, SemanticMode, SessionState,
    SessionStatus, ToolEnforcementLevel, WorkflowLane,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};

const DEFAULT_DB_NAME: &str = "dh-index.db";
const JSON_RPC_CODEC: &str = "json-rpc-v1";
const MSGPACK_RPC_CODEC: &str = "msgpack-rpc-v1";
const DEFAULT_BRIDGE_MAX_FRAME_BYTES: usize = 16 * 1024 * 1024;
const MIN_BRIDGE_MAX_FRAME_BYTES: usize = 64 * 1024;
const JSON_RPC_CONTENT_TYPE: &str = "application/vscode-jsonrpc; charset=utf-8";
const MSGPACK_RPC_CONTENT_TYPE: &str = "application/x-msgpack; bridge=dh-jsonrpc; version=1";

#[derive(Debug, Clone)]
struct BridgeProtocolError {
    rpc_error: BridgeRpcError,
    request_id: Option<Value>,
    terminal: bool,
}

impl BridgeProtocolError {
    fn new(rpc_error: BridgeRpcError, request_id: Option<Value>, terminal: bool) -> Self {
        Self {
            rpc_error,
            request_id,
            terminal,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BridgeRpcError {
    jsonrpc_code: i64,
    symbolic_code: String,
    message: String,
}

#[allow(dead_code)]
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

    pub fn codec_unsupported(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32016,
            symbolic_code: "BRIDGE_CODEC_UNSUPPORTED".into(),
            message: message.into(),
        }
    }

    pub fn codec_decode_failed(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32017,
            symbolic_code: "BRIDGE_CODEC_DECODE_FAILED".into(),
            message: message.into(),
        }
    }

    pub fn frame_too_large(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32018,
            symbolic_code: "BRIDGE_FRAME_TOO_LARGE".into(),
            message: message.into(),
        }
    }

    pub fn codec_negotiation_failed(message: impl Into<String>) -> Self {
        Self {
            jsonrpc_code: -32019,
            symbolic_code: "BRIDGE_CODEC_NEGOTIATION_FAILED".into(),
            message: message.into(),
        }
    }

    pub fn to_response(self, id: Option<Value>) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": id.unwrap_or(Value::Null),
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
    pub id: Option<Value>,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BridgeCodec {
    Json,
    MessagePack,
}

impl BridgeCodec {
    fn wire_name(self) -> &'static str {
        match self {
            BridgeCodec::Json => JSON_RPC_CODEC,
            BridgeCodec::MessagePack => MSGPACK_RPC_CODEC,
        }
    }

    fn content_type(self) -> &'static str {
        match self {
            BridgeCodec::Json => JSON_RPC_CONTENT_TYPE,
            BridgeCodec::MessagePack => MSGPACK_RPC_CONTENT_TYPE,
        }
    }
}

#[derive(Debug, Clone)]
struct BridgeTransportState {
    codec: BridgeCodec,
    fallback_reason: Option<String>,
    max_frame_bytes: usize,
    codec_version: u8,
}

impl Default for BridgeTransportState {
    fn default() -> Self {
        Self {
            codec: BridgeCodec::Json,
            fallback_reason: None,
            max_frame_bytes: DEFAULT_BRIDGE_MAX_FRAME_BYTES,
            codec_version: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeTransportNegotiationResult {
    selected_codec: &'static str,
    selected_mode: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    fallback_reason: Option<String>,
    max_frame_bytes: usize,
    codec_version: u8,
}

impl BridgeTransportState {
    fn to_wire(&self) -> BridgeTransportNegotiationResult {
        BridgeTransportNegotiationResult {
            selected_codec: self.codec.wire_name(),
            selected_mode: if self.codec == BridgeCodec::MessagePack {
                MSGPACK_RPC_CODEC
            } else if self.fallback_reason.is_some() {
                "json-fallback"
            } else {
                "json"
            },
            fallback_reason: self.fallback_reason.clone(),
            max_frame_bytes: self.max_frame_bytes,
            codec_version: self.codec_version,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeTransportParams {
    #[serde(default)]
    supported_codecs: Vec<String>,
    preferred_codec: Option<String>,
    max_frame_bytes: Option<usize>,
    binary_bridge: Option<InitializeBinaryBridgeParams>,
    codec_override: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeBinaryBridgeParams {
    enabled: bool,
    #[allow(dead_code)]
    min_payload_bytes: Option<usize>,
}

#[derive(Debug, Clone)]
struct IncomingFrame {
    body: Vec<u8>,
    #[allow(dead_code)]
    content_type: Option<String>,
}

pub struct BridgeRpcRouter<'a> {
    workspace: &'a Path,
    db: &'a Database,
    dispatcher: &'a HookDispatcher,
    log_repo: &'a dyn HookLogRepository,
}

impl<'a> BridgeRpcRouter<'a> {
    pub fn new(
        workspace: &'a Path,
        db: &'a Database,
        dispatcher: &'a HookDispatcher,
        log_repo: &'a dyn HookLogRepository,
    ) -> Self {
        Self {
            workspace,
            db,
            dispatcher,
            log_repo,
        }
    }

    pub fn route(&self, request: RpcRequest) -> Value {
        handle_request(
            self.workspace,
            self.db,
            self.dispatcher,
            self.log_repo,
            request,
        )
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
struct BridgeResult<T: serde::Serialize = SearchItem> {
    #[serde(rename = "answerState")]
    answer_state: String,
    #[serde(rename = "questionClass")]
    question_class: String,
    items: Vec<T>,
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
    transport: BridgeTransportNegotiationResult,
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
    transport: BridgeTransportNegotiationResult,
    capabilities: BridgeCapabilities,
}

pub fn run_bridge_server(workspace: PathBuf) -> Result<()> {
    let db_path = workspace.join(DEFAULT_DB_NAME);
    let db = Database::new(&db_path).with_context(|| format!("open db: {}", db_path.display()))?;
    db.initialize()?;

    let dispatcher = HookDispatcher::new();

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = io::BufWriter::new(stdout.lock());

    let router = BridgeRpcRouter::new(&workspace, &db, &dispatcher, &db);
    let mut transport = BridgeTransportState::default();

    loop {
        let request =
            match read_rpc_request(&mut reader, transport.codec, transport.max_frame_bytes) {
                Ok(value) => value,
                Err(err) => {
                    eprintln!(
                        "bridge protocol failure: code={} message={}",
                        err.rpc_error.symbolic_code, err.rpc_error.message
                    );
                    if let Some(id) = err.request_id.clone() {
                        let response = err.rpc_error.to_response(Some(id));
                        write_rpc_response(
                            &mut writer,
                            &response,
                            transport.codec,
                            transport.max_frame_bytes,
                        )?;
                    }
                    if err.terminal {
                        break;
                    }
                    continue;
                }
            };

        let should_shutdown = request.method == "dh.shutdown";
        let response = if request.method == "dh.initialize" {
            match negotiate_transport(&request.params) {
                Ok(next_transport) => {
                    let response = ok_result(
                        request.id.clone(),
                        initialize_result(&workspace, next_transport.clone()),
                    );
                    transport = next_transport;
                    eprintln!(
                        "bridge selected codec: {}{}",
                        transport.to_wire().selected_mode,
                        transport
                            .fallback_reason
                            .as_deref()
                            .map(|reason| format!(" ({reason})"))
                            .unwrap_or_default()
                    );
                    response
                }
                Err(err) => err.to_response(request.id.clone()),
            }
        } else {
            router.route(request)
        };
        write_rpc_response(
            &mut writer,
            &response,
            transport.codec,
            transport.max_frame_bytes,
        )?;
        if should_shutdown {
            break;
        }
    }

    Ok(())
}

fn read_rpc_request(
    reader: &mut BufReader<impl Read>,
    codec: BridgeCodec,
    max_frame_bytes: usize,
) -> std::result::Result<RpcRequest, BridgeProtocolError> {
    let frame = read_frame(reader, max_frame_bytes)?;
    decode_rpc_request(&frame.body, codec).map_err(|err| {
        let request_id = extract_request_id(codec, &frame.body);
        BridgeProtocolError::new(
            BridgeRpcError::codec_decode_failed(format!(
                "decode {} request payload: {err}",
                codec.wire_name()
            )),
            request_id,
            true,
        )
    })
}

fn read_frame(
    reader: &mut BufReader<impl Read>,
    max_frame_bytes: usize,
) -> std::result::Result<IncomingFrame, BridgeProtocolError> {
    let mut content_length: Option<usize> = None;
    let mut content_type: Option<String> = None;

    loop {
        let mut line = String::new();
        let bytes = reader.read_line(&mut line).map_err(|err| {
            BridgeProtocolError::new(
                BridgeRpcError::invalid_request(format!(
                    "failed to read bridge frame header: {err}"
                )),
                None,
                true,
            )
        })?;
        if bytes == 0 {
            return Err(BridgeProtocolError::new(
                BridgeRpcError::invalid_request("bridge stdin closed"),
                None,
                true,
            ));
        }
        if line == "\r\n" {
            break;
        }

        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case("Content-Length") {
                let trimmed = value.trim();
                if content_length.is_some()
                    || trimmed.is_empty()
                    || !trimmed.chars().all(|c| c.is_ascii_digit())
                {
                    return Err(BridgeProtocolError::new(
                        BridgeRpcError::invalid_request("invalid Content-Length header"),
                        None,
                        true,
                    ));
                }
                content_length = Some(trimmed.parse::<usize>().map_err(|err| {
                    BridgeProtocolError::new(
                        BridgeRpcError::invalid_request(format!(
                            "invalid Content-Length header: {err}"
                        )),
                        None,
                        true,
                    )
                })?);
            }
            if key.trim().eq_ignore_ascii_case("Content-Type") {
                content_type = Some(value.trim().to_string());
            }
        }
    }

    let len = content_length.ok_or_else(|| {
        BridgeProtocolError::new(
            BridgeRpcError::invalid_request("missing Content-Length header"),
            None,
            true,
        )
    })?;
    if len > max_frame_bytes {
        return Err(BridgeProtocolError::new(
            BridgeRpcError::frame_too_large(format!(
                "bridge frame too large: {len} bytes exceeds maxFrameBytes={max_frame_bytes}"
            )),
            None,
            true,
        ));
    }
    let mut buf = vec![0_u8; len];
    reader.read_exact(&mut buf).map_err(|err| {
        BridgeProtocolError::new(
            BridgeRpcError::codec_decode_failed(format!(
                "bridge frame body truncated or unreadable: expected {len} bytes: {err}"
            )),
            None,
            true,
        )
    })?;

    Ok(IncomingFrame {
        body: buf,
        content_type,
    })
}

fn decode_rpc_request(buf: &[u8], codec: BridgeCodec) -> Result<RpcRequest> {
    let value: Value = match codec {
        BridgeCodec::Json => {
            let payload = std::str::from_utf8(buf).context("request payload is not utf8")?;
            serde_json::from_str(payload).context("invalid json request payload")?
        }
        BridgeCodec::MessagePack => {
            rmp_serde::from_slice(buf).context("invalid messagepack request payload")?
        }
    };

    let id = value.get("id").cloned();
    let method = value
        .get("method")
        .and_then(Value::as_str)
        .map(|v| v.to_string())
        .context("missing method")?;
    let params = value.get("params").cloned().unwrap_or_else(|| json!({}));

    Ok(RpcRequest { id, method, params })
}

fn extract_request_id(codec: BridgeCodec, buf: &[u8]) -> Option<Value> {
    let value: Result<Value> = match codec {
        BridgeCodec::Json => serde_json::from_slice(buf).context("invalid json request payload"),
        BridgeCodec::MessagePack => {
            rmp_serde::from_slice(buf).context("invalid messagepack request payload")
        }
    };
    value.ok().and_then(|value| value.get("id").cloned())
}

fn handle_request(
    workspace: &Path,
    db: &Database,
    dispatcher: &HookDispatcher,
    log_repo: &dyn HookLogRepository,
    request: RpcRequest,
) -> Value {
    match request.method.as_str() {
        "dh.initialize" => match negotiate_transport(&request.params) {
            Ok(transport) => ok_result(request.id, initialize_result(workspace, transport)),
            Err(err) => err.to_response(request.id),
        },
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

            let session_state = SessionState {
                id: "bridge-session".to_string(),
                repo_root: workspace.to_string_lossy().to_string(),
                lane: WorkflowLane::Quick,
                lane_locked: false,
                current_stage: "runCommand".to_string(),
                status: SessionStatus::Active,
                semantic_mode: SemanticMode::OnDemand,
                tool_enforcement_level: ToolEnforcementLevel::Hard,
                created_at_unix_ms: chrono::Utc::now().timestamp_millis(),
                updated_at_unix_ms: chrono::Utc::now().timestamp_millis(),
            };
            let ctx = HookContext {
                session: session_state,
                agent_id: "bridge".to_string(),
                role: AgentRole::Coordinator,
                stage: "runCommand".to_string(),
                lane: WorkflowLane::Quick,
            };

            let tool_name = query_method.clone();
            let input = json!({
                "tool_name": tool_name,
                "tool_args": query_params,
            });

            let (log, result) =
                dispatcher.dispatch(HookName::PreToolExec, &ctx, &input, "bridge-session", None);
            let _ = log_repo.insert_hook_log(&log);

            if let HookDecision::Block = result.decision {
                return BridgeRpcError::access_denied(format!(
                    "Hook blocked execution: {}",
                    result.reason
                ))
                .to_response(request.id);
            }

            let final_params = match result.decision {
                HookDecision::Modify => result.output,
                _ => query_params,
            };

            let delegated = BridgeRpcRouter::new(workspace, db, dispatcher, log_repo)
                .route_worker_query(RpcRequest {
                    id: request.id.clone(),
                    method: query_method.clone(),
                    params: final_params,
                });

            if delegated.get("error").is_some() {
                return delegated;
            }

            let delegated_result = delegated
                .get("result")
                .cloned()
                .unwrap_or_else(|| json!({}));

            let (ans_log, ans_result) = dispatcher.dispatch(
                HookName::PreAnswer,
                &ctx,
                &delegated_result,
                "bridge-session",
                None,
            );
            let _ = log_repo.insert_hook_log(&ans_log);

            if let HookDecision::Block = ans_result.decision {
                return BridgeRpcError::execution_failed(format!(
                    "Hook blocked answer: {}",
                    ans_result.reason
                ))
                .to_response(request.id);
            }

            let final_result = match ans_result.decision {
                HookDecision::Modify => ans_result.output,
                _ => delegated_result,
            };

            match final_result {
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
                            items: Vec::<SearchItem>::new(),
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

            // Use precomputed semanticVector from TS worker if provided; otherwise
            // auto-embed the query on-demand using the configured provider.
            let semantic_vector: Option<Vec<f32>> = if let Some(arr) = request
                .params
                .get("semanticVector")
                .and_then(|v| v.as_array())
            {
                // TS worker already sent a vector — use it directly.
                Some(
                    arr.iter()
                        .filter_map(|n| n.as_f64().map(|f| f as f32))
                        .collect(),
                )
            } else {
                // No precomputed vector: embed on-demand via env-configured client.
                let embed_client = dh_indexer::embedding::build_embedding_client_from_env();
                if embed_client.is_real() {
                    match embed_client.embed_query(&query) {
                        Ok(v) => Some(v),
                        Err(e) => {
                            eprintln!(
                                "[warn] query.buildEvidence: on-demand embedding failed for query '{query}': {e:#}"
                            );
                            None
                        }
                    }
                } else {
                    None // Stub provider: skip semantic search entirely.
                }
            };

            match db.build_evidence(BuildEvidenceQuery {
                workspace_id,
                query,
                intent,
                targets,
                max_files,
                max_symbols,
                max_snippets,
                freshness,
                semantic_vector,
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
        QUERY_CALL_HIERARCHY_METHOD => {
            let symbol = str_param(&request.params, "symbol").unwrap_or_default();
            if symbol.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "query.callHierarchy requires a 'symbol' parameter",
                );
            }
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let limit = int_param(&request.params, "limit", 100);
            let max_depth = int_param(&request.params, "maxDepth", 3) as u32;
            let language_hint = str_param_opt(&request.params, "language")
                .or_else(|| str_param_opt(&request.params, "filePath"));
            if language_hint
                .as_deref()
                .is_some_and(|value| infer_language_from_path(value).is_none())
            {
                return capability_unsupported(
                    request.id,
                    "query.callHierarchy is unsupported for unknown language scope",
                );
            }

            match db.call_hierarchy(CallHierarchyQuery {
                workspace_id,
                symbol,
                limit,
                max_depth,
            }) {
                Ok(result) => {
                    let mut json_callers = Vec::new();
                    for node in result.callers {
                        json_callers.push(json!({
                            "symbolId": match node.node.id { dh_types::NodeId::Symbol(id) => id, _ => 0 },
                            "qualifiedName": node.node.label,
                            "filePath": node.node.file_path.unwrap_or_default(),
                            "depth": node.call_depth,
                            "entryPoint": node.entry_point.map(|e| format!("{:?}", e)),
                        }));
                    }
                    let mut json_callees = Vec::new();
                    for node in result.callees {
                        json_callees.push(json!({
                            "symbolId": match node.node.id { dh_types::NodeId::Symbol(id) => id, _ => 0 },
                            "qualifiedName": node.node.label,
                            "filePath": node.node.file_path.unwrap_or_default(),
                            "depth": node.call_depth,
                            "entryPoint": node.entry_point.map(|e| format!("{:?}", e)),
                        }));
                    }

                    ok_result(
                        request.id,
                        BridgeResult::<serde_json::Value> {
                            answer_state: answer_state_str(result.answer_state).into(),
                            question_class: "call_hierarchy".into(),
                            items: vec![json!({
                                "callers": json_callers,
                                "callees": json_callees,
                            })],
                            evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                            language_capability_summary: None,
                        },
                    )
                }
                Err(err) => {
                    internal_error(request.id, format!("query.callHierarchy failed: {err}"))
                }
            }
        }
        QUERY_ENTRY_POINTS_METHOD => {
            let symbol = str_param(&request.params, "symbol").unwrap_or_default();
            if symbol.trim().is_empty() {
                return invalid_params(
                    request.id,
                    "query.entryPoints requires a 'symbol' parameter",
                );
            }
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let limit = int_param(&request.params, "limit", 100);
            let max_depth = int_param(&request.params, "maxDepth", 3) as u32;
            let language_hint = str_param_opt(&request.params, "language")
                .or_else(|| str_param_opt(&request.params, "filePath"));
            if language_hint
                .as_deref()
                .is_some_and(|value| infer_language_from_path(value).is_none())
            {
                return capability_unsupported(
                    request.id,
                    "query.entryPoints is unsupported for unknown language scope",
                );
            }

            match db.entry_points(EntryPointsQuery {
                workspace_id,
                symbol,
                limit,
                max_depth,
            }) {
                Ok(result) => {
                    let mut json_entry_points = Vec::new();
                    for node in result.entry_points {
                        json_entry_points.push(json!({
                            "symbolId": match node.node.id { dh_types::NodeId::Symbol(id) => id, _ => 0 },
                            "qualifiedName": node.node.label,
                            "filePath": node.node.file_path.unwrap_or_default(),
                            "depth": node.call_depth,
                            "entryPoint": node.entry_point.map(|e| format!("{:?}", e)),
                        }));
                    }

                    ok_result(
                        request.id,
                        BridgeResult::<serde_json::Value> {
                            answer_state: answer_state_str(result.answer_state).into(),
                            question_class: "entry_points".into(),
                            items: vec![json!({
                                "entryPoints": json_entry_points,
                            })],
                            evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                            language_capability_summary: None,
                        },
                    )
                }
                Err(err) => internal_error(request.id, format!("query.entryPoints failed: {err}")),
            }
        }
        "query.traceFlow" => {
            let from_symbol = str_param(&request.params, "fromSymbol").unwrap_or_default();
            let to_symbol = str_param(&request.params, "toSymbol").unwrap_or_default();
            if from_symbol.is_empty() || to_symbol.is_empty() {
                return invalid_params(
                    request.id,
                    "query.traceFlow requires 'fromSymbol' and 'toSymbol' parameters",
                );
            }
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let max_hops = int_param(&request.params, "maxHops", 10) as u32;

            match db.trace_flow(TraceFlowQuery {
                workspace_id,
                from_symbol,
                to_symbol,
                max_hops,
            }) {
                Ok(result) => {
                    let json_hops: Vec<serde_json::Value> = result
                        .hops
                        .iter()
                        .map(|h| {
                            json!({
                                "fromLabel": h.from_label,
                                "toLabel": h.to_label,
                                "fromFile": h.from_file,
                                "toFile": h.to_file,
                                "edgeKind": format!("{:?}", h.edge_kind),
                                "confidence": format!("{:?}", h.confidence),
                                "resolution": format!("{:?}", h.resolution),
                                "hopIndex": h.hop_index,
                                "reason": h.reason,
                            })
                        })
                        .collect();

                    ok_result(
                        request.id,
                        BridgeResult::<serde_json::Value> {
                            answer_state: answer_state_str(result.answer_state).into(),
                            question_class: "trace_flow".into(),
                            items: vec![json!({
                                "path": result.path,
                                "hops": json_hops,
                            })],
                            evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                            language_capability_summary: None,
                        },
                    )
                }
                Err(err) => internal_error(request.id, format!("query.traceFlow failed: {err}")),
            }
        }
        "query.impactAnalysis" => {
            let target = str_param(&request.params, "target").unwrap_or_default();
            if target.is_empty() {
                return invalid_params(
                    request.id,
                    "query.impactAnalysis requires a 'target' parameter",
                );
            }
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;
            let hop_limit = int_param(&request.params, "hopLimit", 3) as u32;
            let node_limit = int_param(&request.params, "nodeLimit", 100);

            match db.impact_analysis(ImpactAnalysisQuery {
                workspace_id,
                target,
                hop_limit,
                node_limit,
            }) {
                Ok(result) => {
                    let json_nodes: Vec<serde_json::Value> = result
                        .impact_nodes
                        .iter()
                        .map(|n| {
                            json!({
                                "qualifiedName": n.qualified_name,
                                "filePath": n.file_path,
                                "category": format!("{:?}", n.category),
                                "hopDistance": n.hop_distance,
                            })
                        })
                        .collect();

                    ok_result(
                        request.id,
                        BridgeResult::<serde_json::Value> {
                            answer_state: answer_state_str(result.answer_state).into(),
                            question_class: "impact_analysis".into(),
                            items: vec![json!({
                                "impacted": result.impacted,
                                "impactNodes": json_nodes,
                            })],
                            evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                            language_capability_summary: None,
                        },
                    )
                }
                Err(err) => {
                    internal_error(request.id, format!("query.impactAnalysis failed: {err}"))
                }
            }
        }
        "query.semanticSearch" => {
            let model = str_param(&request.params, "model")
                .unwrap_or_else(|| "text-embedding-3-small".to_string());

            let query_vector_json = request.params["queryVector"].as_array();
            if query_vector_json.is_none() {
                return invalid_params(request.id, "query.semanticSearch requires queryVector");
            }

            let query_vector: Vec<f32> = query_vector_json
                .unwrap()
                .iter()
                .filter_map(|v| v.as_f64().map(|f| f as f32))
                .collect();

            let limit = int_param(&request.params, "limit", 20);
            let min_score = request.params["minScore"].as_f64().unwrap_or(0.0) as f32;
            let workspace_id = int_param(&request.params, "workspaceId", 1) as i64;

            match db.semantic_search(SemanticSearchQuery {
                workspace_id,
                model,
                query_vector,
                limit,
                min_score,
            }) {
                Ok(result) => {
                    let json_matches: Vec<serde_json::Value> = result
                        .matches
                        .into_iter()
                        .map(|m| {
                            json!({
                                "chunkId": m.chunk_id,
                                "filePath": m.file_path,
                                "title": m.title,
                                "content": m.content,
                                "score": m.score,
                                "span": {
                                    "startLine": m.span.start_line,
                                    "startColumn": m.span.start_column,
                                    "endLine": m.span.end_line,
                                    "endColumn": m.span.end_column
                                }
                            })
                        })
                        .collect();

                    ok_result(
                        request.id,
                        BridgeResult::<serde_json::Value> {
                            answer_state: answer_state_str(result.answer_state).into(),
                            question_class: "semantic_search".into(),
                            items: vec![json!({
                                "matches": json_matches,
                                "backend": result.backend,
                                "degraded": result.degraded,
                                "degradedReason": result.degraded_reason,
                                "scannedRecords": result.scanned_records,
                            })],
                            evidence: Some(to_wire_evidence_packet(result.evidence, None)),
                            language_capability_summary: None,
                        },
                    )
                }
                Err(err) => {
                    internal_error(request.id, format!("query.semanticSearch failed: {err}"))
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
        items: Vec::<SearchItem>::new(),
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

fn write_rpc_response(
    writer: &mut io::BufWriter<impl Write>,
    payload: &Value,
    codec: BridgeCodec,
    max_frame_bytes: usize,
) -> Result<()> {
    let body = encode_rpc_value(payload, codec)?;
    if body.len() > max_frame_bytes {
        anyhow::bail!(
            "bridge response frame too large: {} bytes exceeds maxFrameBytes={}",
            body.len(),
            max_frame_bytes
        );
    }
    write!(
        writer,
        "Content-Length: {}\r\nContent-Type: {}\r\n\r\n",
        body.len(),
        codec.content_type()
    )?;
    writer.write_all(&body)?;
    writer.flush()?;
    Ok(())
}

fn encode_rpc_value(payload: &Value, codec: BridgeCodec) -> Result<Vec<u8>> {
    match codec {
        BridgeCodec::Json => Ok(serde_json::to_vec(payload)?),
        BridgeCodec::MessagePack => Ok(rmp_serde::to_vec_named(payload)?),
    }
}

fn negotiate_transport(
    params: &Value,
) -> std::result::Result<BridgeTransportState, BridgeRpcError> {
    let transport_params: InitializeTransportParams = params
        .get("transport")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|err| {
            BridgeRpcError::codec_negotiation_failed(format!("invalid transport params: {err}"))
        })?
        .unwrap_or_default();

    let requested_max_frame_bytes = transport_params
        .max_frame_bytes
        .unwrap_or(DEFAULT_BRIDGE_MAX_FRAME_BYTES);
    if !(MIN_BRIDGE_MAX_FRAME_BYTES..=DEFAULT_BRIDGE_MAX_FRAME_BYTES)
        .contains(&requested_max_frame_bytes)
    {
        return Err(BridgeRpcError::codec_negotiation_failed(format!(
            "maxFrameBytes must be between {MIN_BRIDGE_MAX_FRAME_BYTES} and {DEFAULT_BRIDGE_MAX_FRAME_BYTES}; received {requested_max_frame_bytes}"
        )));
    }
    let max_frame_bytes = requested_max_frame_bytes;
    let env_override = std::env::var("DH_BRIDGE_CODEC").unwrap_or_else(|_| "auto".into());
    let override_mode = normalize_codec_override(
        transport_params
            .codec_override
            .as_deref()
            .unwrap_or(&env_override),
    );

    if override_mode == "json" {
        return Ok(BridgeTransportState {
            codec: BridgeCodec::Json,
            fallback_reason: Some("forced_json".into()),
            max_frame_bytes,
            codec_version: 1,
        });
    }

    let binary_enabled = transport_params
        .binary_bridge
        .as_ref()
        .map(|binary| binary.enabled)
        .unwrap_or(true);
    let supports_msgpack = transport_params
        .supported_codecs
        .iter()
        .any(|codec| codec == MSGPACK_RPC_CODEC);
    let prefers_msgpack = transport_params
        .preferred_codec
        .as_deref()
        .is_none_or(|codec| codec == MSGPACK_RPC_CODEC);

    if binary_enabled && supports_msgpack && prefers_msgpack {
        return Ok(BridgeTransportState {
            codec: BridgeCodec::MessagePack,
            fallback_reason: None,
            max_frame_bytes,
            codec_version: 1,
        });
    }

    if override_mode == "msgpack" {
        return Err(BridgeRpcError::codec_negotiation_failed(
            "DH_BRIDGE_CODEC=msgpack requires both peers to support msgpack-rpc-v1",
        ));
    }

    let fallback_reason = if !binary_enabled {
        "binary_disabled"
    } else if !supports_msgpack {
        "peer_does_not_support_msgpack"
    } else {
        "peer_preferred_json"
    };

    Ok(BridgeTransportState {
        codec: BridgeCodec::Json,
        fallback_reason: Some(fallback_reason.into()),
        max_frame_bytes,
        codec_version: 1,
    })
}

fn normalize_codec_override(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "json" => "json",
        "msgpack" => "msgpack",
        _ => "auto",
    }
}

fn initialize_result(workspace: &Path, transport: BridgeTransportState) -> InitializeResult {
    let transport_wire = transport.to_wire();
    InitializeResult {
        server_name: "dh-engine",
        server_version: env!("CARGO_PKG_VERSION"),
        workspace_root: workspace.to_string_lossy().to_string(),
        protocol_version: WORKER_PROTOCOL_VERSION,
        transport: transport_wire.clone(),
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
            transport: transport_wire,
            lifecycle_control: WireLifecycleControl {
                methods: BRIDGE_LIFECYCLE_CONTROL_METHODS.to_vec(),
                max_auto_restarts: 1,
            },
            rust_host_lifecycle_contract: lifecycle_contract(),
            worker_protocol_contract: worker_protocol_contract(),
        },
    }
}

fn ok_result(id: Option<Value>, result: impl Serialize) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(Value::Null),
        "result": result,
    })
}

fn invalid_params(id: Option<Value>, message: &str) -> Value {
    BridgeRpcError::invalid_request(message).to_response(id)
}

fn method_not_supported(id: Option<Value>, message: &str) -> Value {
    BridgeRpcError::capability_unsupported(message).to_response(id)
}

fn capability_unsupported(id: Option<Value>, message: &str) -> Value {
    BridgeRpcError::capability_unsupported(message).to_response(id)
}

fn internal_error(id: Option<Value>, message: String) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(Value::Null),
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
        QuestionClass::SemanticSearch => "semantic_search",
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
        EvidenceSource::Semantic => "semantic",
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
        items: Vec::<SearchItem>::new(),
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
    use super::{
        decode_rpc_request, encode_rpc_value, handle_request, negotiate_transport, read_frame,
        read_rpc_request, write_rpc_response, BridgeCodec, BridgeRpcRouter, RpcRequest,
        DEFAULT_BRIDGE_MAX_FRAME_BYTES, JSON_RPC_CODEC, MIN_BRIDGE_MAX_FRAME_BYTES,
        MSGPACK_RPC_CODEC,
    };
    use crate::hooks::HookDispatcher;
    use dh_storage::{
        ChunkRepository, Database, EmbeddingRepository, FileRepository, GraphEdgeRepository,
        SymbolRepository,
    };
    use dh_types::{
        Chunk, ChunkKind, EdgeConfidence, EdgeKind, EdgeResolution, EmbeddingStatus, File,
        FreshnessReason, FreshnessState, GraphEdge, LanguageId, NodeId, ParseStatus, Span, Symbol,
        SymbolKind, Visibility,
    };
    use serde_json::json;
    use serde_json::Value;
    use std::io::{BufReader, Cursor};

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

        db.insert_edges(
            &[
                GraphEdge {
                    from: NodeId::File(1),
                    to: NodeId::File(2),
                    kind: EdgeKind::Imports,
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    reason: "./util".into(),
                    span: Some(Span {
                        start_byte: 0,
                        end_byte: 1,
                        start_line: 1,
                        start_column: 0,
                        end_line: 1,
                        end_column: 1,
                    }),
                    payload_json: None,
                },
                GraphEdge {
                    from: NodeId::Symbol(10),
                    to: NodeId::Symbol(11),
                    kind: EdgeKind::References,
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    reason: "helper".into(),
                    span: Some(Span {
                        start_byte: 0,
                        end_byte: 1,
                        start_line: 2,
                        start_column: 0,
                        end_line: 2,
                        end_column: 1,
                    }),
                    payload_json: None,
                },
                GraphEdge {
                    from: NodeId::Symbol(10),
                    to: NodeId::Symbol(11),
                    kind: EdgeKind::Calls,
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    reason: "helper".into(),
                    span: Some(Span {
                        start_byte: 0,
                        end_byte: 1,
                        start_line: 2,
                        start_column: 0,
                        end_line: 2,
                        end_column: 1,
                    }),
                    payload_json: None,
                },
                GraphEdge {
                    from: NodeId::Symbol(13),
                    to: NodeId::Symbol(12),
                    kind: EdgeKind::Calls,
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    reason: "py_helper".into(),
                    span: Some(Span {
                        start_byte: 0,
                        end_byte: 1,
                        start_line: 2,
                        start_column: 0,
                        end_line: 2,
                        end_column: 1,
                    }),
                    payload_json: None,
                },
                GraphEdge {
                    from: NodeId::Symbol(10),
                    to: NodeId::Symbol(14),
                    kind: EdgeKind::Calls,
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    reason: "rust_helper".into(),
                    span: Some(Span {
                        start_byte: 0,
                        end_byte: 1,
                        start_line: 3,
                        start_column: 0,
                        end_line: 3,
                        end_column: 1,
                    }),
                    payload_json: None,
                },
            ],
            1,
        )?;
        db.insert_edges(
            &[GraphEdge {
                from: NodeId::Symbol(13),
                to: NodeId::Symbol(12),
                kind: EdgeKind::Calls,
                resolution: EdgeResolution::Resolved,
                confidence: EdgeConfidence::Direct,
                reason: "py_helper".into(),
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                }),
                payload_json: None,
            }],
            3,
        )?;

        Ok(())
    }

    fn seed_semantic_chunk(
        db: &Database,
        chunk_id: i64,
        file_id: i64,
        title: &str,
        content_hash: &str,
        vector: &[f32],
    ) -> anyhow::Result<()> {
        db.insert_chunks(&[Chunk {
            id: chunk_id,
            workspace_id: 1,
            file_id,
            symbol_id: None,
            parent_symbol_id: None,
            kind: ChunkKind::FileHeader,
            language: LanguageId::TypeScript,
            title: title.to_string(),
            content: format!("semantic content for {title}"),
            content_hash: content_hash.to_string(),
            token_estimate: 5,
            span: Span {
                start_byte: 0,
                end_byte: 20,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 20,
            },
            prev_chunk_id: None,
            next_chunk_id: None,
            embedding_status: EmbeddingStatus::Indexed,
        }])?;
        db.upsert_embedding(chunk_id, "model-a", vector.len(), content_hash, vector)?;
        Ok(())
    }

    #[test]
    fn bridge_supports_required_question_classes() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let dispatcher = HookDispatcher::new();
        seed(&db)?;

        let mk = |method: &str, params: Value| RpcRequest {
            id: Some(json!(1)),
            method: method.into(),
            params,
        };

        let definition = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
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
            &dispatcher,
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
            &dispatcher,
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
            &dispatcher,
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "usage", "symbol": "helper", "workspaceId": 1 }),
            ),
        );
        assert!(usage["result"]["items"].as_array().is_some());
        assert_eq!(usage["result"]["answerState"], "partial");
        assert!(usage["result"]["evidence"].is_object());

        let deps = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
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
            &dispatcher,
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
            &dispatcher,
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
            &dispatcher,
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
            &dispatcher,
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
            &dispatcher,
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

        db.insert_edges(
            &[GraphEdge {
                from: NodeId::Symbol(10),
                to: NodeId::Symbol(11),
                kind: EdgeKind::References,
                resolution: EdgeResolution::Unresolved,
                confidence: EdgeConfidence::BestEffort,
                reason: "helper".into(),
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 3,
                    start_column: 0,
                    end_line: 3,
                    end_column: 1,
                }),
                payload_json: None,
            }],
            1,
        )?;

        let usage_partial = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
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
        let dispatcher = HookDispatcher::new();
        let response = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(42)),
                method: "dh.initialize".into(),
                params: json!({}),
            },
        );

        assert_eq!(response["result"]["protocolVersion"], "1");
        assert_eq!(response["result"]["capabilities"]["protocolVersion"], "1");
        assert_eq!(
            response["result"]["transport"]["selectedCodec"],
            JSON_RPC_CODEC
        );
        assert_eq!(
            response["result"]["transport"]["selectedMode"],
            json!("json-fallback")
        );
        assert_eq!(
            response["result"]["transport"]["fallbackReason"],
            json!("peer_does_not_support_msgpack")
        );
        assert_eq!(
            response["result"]["transport"]["maxFrameBytes"],
            json!(DEFAULT_BRIDGE_MAX_FRAME_BYTES)
        );
        assert_eq!(
            response["result"]["capabilities"]["transport"]["selectedCodec"],
            JSON_RPC_CODEC
        );
        assert_eq!(
            response["result"]["capabilities"]["methods"],
            json!([
                "dh.initialize",
                "query.search",
                "query.definition",
                "query.relationship",
                "query.buildEvidence",
                "query.callHierarchy",
                "query.entryPoints"
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
    fn initialize_negotiates_messagepack_when_supported() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let dispatcher = HookDispatcher::new();
        let response = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(142)),
                method: "dh.initialize".into(),
                params: json!({
                    "transport": {
                        "supportedCodecs": [JSON_RPC_CODEC, MSGPACK_RPC_CODEC],
                        "preferredCodec": MSGPACK_RPC_CODEC,
                        "maxFrameBytes": DEFAULT_BRIDGE_MAX_FRAME_BYTES,
                        "binaryBridge": { "enabled": true }
                    }
                }),
            },
        );

        assert_eq!(
            response["result"]["transport"]["selectedCodec"],
            MSGPACK_RPC_CODEC
        );
        assert_eq!(
            response["result"]["transport"]["selectedMode"],
            MSGPACK_RPC_CODEC
        );
        assert_eq!(
            response["result"]["capabilities"]["transport"]["selectedCodec"],
            MSGPACK_RPC_CODEC
        );
        assert!(response["result"]["transport"]["fallbackReason"].is_null());

        Ok(())
    }

    #[test]
    fn negotiate_transport_rejects_forced_messagepack_without_peer_support() {
        let result = negotiate_transport(&json!({
            "transport": {
                "supportedCodecs": [JSON_RPC_CODEC],
                "preferredCodec": JSON_RPC_CODEC,
                "codecOverride": "msgpack"
            }
        }));

        let response = result
            .expect_err("forced MessagePack should fail")
            .to_response(Some(json!(1)));
        assert_eq!(
            response["error"]["data"]["code"],
            json!("BRIDGE_CODEC_NEGOTIATION_FAILED")
        );
    }

    #[test]
    fn negotiate_transport_rejects_max_frame_bytes_below_lower_bound() {
        let result = negotiate_transport(&json!({
            "transport": {
                "supportedCodecs": [JSON_RPC_CODEC, MSGPACK_RPC_CODEC],
                "preferredCodec": MSGPACK_RPC_CODEC,
                "maxFrameBytes": MIN_BRIDGE_MAX_FRAME_BYTES - 1,
                "binaryBridge": { "enabled": true }
            }
        }));

        let response = result
            .expect_err("too-small maxFrameBytes should fail")
            .to_response(Some(json!(1)));
        assert_eq!(
            response["error"]["data"]["code"],
            json!("BRIDGE_CODEC_NEGOTIATION_FAILED")
        );
        assert!(response["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("maxFrameBytes")));
    }

    #[test]
    fn negotiate_transport_rejects_max_frame_bytes_above_upper_bound() {
        let result = negotiate_transport(&json!({
            "transport": {
                "supportedCodecs": [JSON_RPC_CODEC, MSGPACK_RPC_CODEC],
                "preferredCodec": MSGPACK_RPC_CODEC,
                "maxFrameBytes": DEFAULT_BRIDGE_MAX_FRAME_BYTES + 1,
                "binaryBridge": { "enabled": true }
            }
        }));

        let response = result
            .expect_err("too-large maxFrameBytes should fail")
            .to_response(Some(json!(1)));
        assert_eq!(
            response["error"]["data"]["code"],
            json!("BRIDGE_CODEC_NEGOTIATION_FAILED")
        );
    }

    #[test]
    fn msgpack_codec_preserves_large_payload_shape() -> anyhow::Result<()> {
        let vector = (0..1536)
            .map(|index| json!((index as f64) / 1536.0))
            .collect::<Vec<_>>();
        let request = json!({
            "jsonrpc": "2.0",
            "id": 77,
            "method": "query.buildEvidence",
            "params": {
                "query": "large vector",
                "semanticVector": vector,
                "ast": {
                    "kind": "module",
                    "children": (0..256).map(|index| json!({ "kind": "node", "index": index })).collect::<Vec<_>>()
                }
            }
        });

        let bytes = encode_rpc_value(&request, BridgeCodec::MessagePack)?;
        let decoded = decode_rpc_request(&bytes, BridgeCodec::MessagePack)?;

        assert_eq!(decoded.method, "query.buildEvidence");
        assert_eq!(
            decoded.params["semanticVector"].as_array().map(Vec::len),
            Some(1536)
        );
        assert_eq!(
            decoded.params["ast"]["children"].as_array().map(Vec::len),
            Some(256)
        );
        Ok(())
    }

    #[test]
    fn msgpack_codec_preserves_runtime_search_and_build_evidence_shapes() -> anyhow::Result<()> {
        let cases = [
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "runtime.ping",
                "params": {}
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "query.search",
                "params": { "query": "auth", "mode": "file_path", "limit": 3 }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "query.buildEvidence",
                "params": {
                    "query": "how does auth work?",
                    "intent": "explain",
                    "targets": ["AuthService"],
                    "budget": { "maxFiles": 4, "maxSymbols": 8, "maxSnippets": 6 }
                }
            }),
        ];

        for request in cases {
            let json_decoded = decode_rpc_request(
                &encode_rpc_value(&request, BridgeCodec::Json)?,
                BridgeCodec::Json,
            )?;
            let msgpack_decoded = decode_rpc_request(
                &encode_rpc_value(&request, BridgeCodec::MessagePack)?,
                BridgeCodec::MessagePack,
            )?;
            assert_eq!(json_decoded.id, msgpack_decoded.id);
            assert_eq!(json_decoded.method, msgpack_decoded.method);
            assert_eq!(json_decoded.params, msgpack_decoded.params);
        }

        Ok(())
    }

    #[test]
    fn malformed_msgpack_request_with_id_returns_structured_codec_error() -> anyhow::Result<()> {
        let partial = vec![
            0x82, 0xa2, b'i', b'd', 0x2a, 0xa6, b'm', b'e', b't', b'h', b'o', b'd',
        ];
        let mut frame = format!(
            "Content-Length: {}\r\nContent-Type: application/x-msgpack\r\n\r\n",
            partial.len()
        )
        .into_bytes();
        frame.extend_from_slice(&partial);
        let mut reader = BufReader::new(Cursor::new(frame));

        let err = read_rpc_request(
            &mut reader,
            BridgeCodec::MessagePack,
            DEFAULT_BRIDGE_MAX_FRAME_BYTES,
        )
        .expect_err("malformed MessagePack should return protocol error");
        assert_eq!(err.rpc_error.symbolic_code, "BRIDGE_CODEC_DECODE_FAILED");
        assert!(err.request_id.is_none());
        assert!(err.terminal);
        Ok(())
    }

    #[test]
    fn oversized_frame_returns_structured_frame_too_large_error_before_body_allocation() {
        let frame = format!(
            "Content-Length: {}\r\nContent-Type: application/x-msgpack\r\n\r\n",
            DEFAULT_BRIDGE_MAX_FRAME_BYTES + 1
        )
        .into_bytes();
        let mut reader = BufReader::new(Cursor::new(frame));

        let err = read_frame(&mut reader, DEFAULT_BRIDGE_MAX_FRAME_BYTES)
            .expect_err("oversized frame should fail before body read");
        assert_eq!(err.rpc_error.symbolic_code, "BRIDGE_FRAME_TOO_LARGE");
        assert!(err.request_id.is_none());
        assert!(err.terminal);
    }

    #[test]
    fn truncated_frame_body_returns_structured_decode_error_without_id() {
        let mut reader = BufReader::new(Cursor::new(
            b"Content-Length: 10\r\nContent-Type: application/x-msgpack\r\n\r\nabc".to_vec(),
        ));

        let err = read_frame(&mut reader, DEFAULT_BRIDGE_MAX_FRAME_BYTES)
            .expect_err("truncated frame should fail explicitly");
        assert_eq!(err.rpc_error.symbolic_code, "BRIDGE_CODEC_DECODE_FAILED");
        assert!(err.request_id.is_none());
        assert!(err.terminal);
    }

    #[test]
    fn strict_content_length_rejects_duplicate_and_non_numeric_headers() {
        let mut duplicate = BufReader::new(Cursor::new(
            b"Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}".to_vec(),
        ));
        let duplicate_err = read_frame(&mut duplicate, DEFAULT_BRIDGE_MAX_FRAME_BYTES)
            .expect_err("duplicate Content-Length should fail");
        assert_eq!(duplicate_err.rpc_error.symbolic_code, "INVALID_REQUEST");

        let mut non_numeric =
            BufReader::new(Cursor::new(b"Content-Length: 1junk\r\n\r\n{}".to_vec()));
        let non_numeric_err = read_frame(&mut non_numeric, DEFAULT_BRIDGE_MAX_FRAME_BYTES)
            .expect_err("non-numeric Content-Length should fail");
        assert_eq!(non_numeric_err.rpc_error.symbolic_code, "INVALID_REQUEST");
    }

    #[test]
    fn write_rpc_response_enforces_max_frame_bytes() {
        let payload = json!({ "jsonrpc": "2.0", "id": 1, "result": "x".repeat(2048) });
        let mut output = Vec::new();
        let mut writer = std::io::BufWriter::new(&mut output);

        let err = write_rpc_response(&mut writer, &payload, BridgeCodec::Json, 512)
            .expect_err("response larger than maxFrameBytes should fail");
        assert!(err.to_string().contains("bridge response frame too large"));
    }

    #[test]
    fn initialize_advertises_bounded_rust_host_lifecycle_contract() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let dispatcher = HookDispatcher::new();
        let response = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(43)),
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
        assert_eq!(protocol["framing"]["binaryCodec"], json!("msgpack-rpc-v1"));
        assert_eq!(protocol["framing"]["jsonBootstrap"], json!(true));
        assert_eq!(protocol["framing"]["jsonFallback"], json!(true));
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
                "query.buildEvidence",
                "query.callHierarchy",
                "query.entryPoints"
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
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        let response = router.route(RpcRequest {
            id: Some(json!(44)),
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
    fn bridge_semantic_search_preserves_matches_and_adds_backend_metadata() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        seed(&db)?;
        seed_semantic_chunk(&db, 900, 1, "run", "chunk-run", &[1.0, 0.0, 0.0])?;
        seed_semantic_chunk(&db, 901, 2, "helper", "chunk-helper", &[0.0, 1.0, 0.0])?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        let response = router.route(RpcRequest {
            id: Some(json!(52)),
            method: "query.semanticSearch".into(),
            params: json!({
                "workspaceId": 1,
                "model": "model-a",
                "queryVector": [1.0, 0.0, 0.0],
                "limit": 5,
                "minScore": 0.0
            }),
        });

        assert!(
            response.get("error").is_none(),
            "semantic bridge response should not be an error: {response:?}"
        );
        let payload = &response["result"]["items"][0];
        assert_eq!(payload["backend"], json!("vector_db"));
        assert_eq!(payload["degraded"], json!(false));
        assert!(payload["matches"]
            .as_array()
            .is_some_and(|matches| !matches.is_empty()));
        assert_eq!(payload["matches"][0]["chunkId"], json!(900));
        Ok(())
    }

    #[test]
    fn bridge_rpc_router_routes_named_build_evidence_without_generic_passthrough(
    ) -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        let response = router.route_worker_query(RpcRequest {
            id: Some(json!(46)),
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
    fn bridge_rpc_router_routes_call_hierarchy_through_worker_query_contract() -> anyhow::Result<()>
    {
        let (tmp, db) = setup_db()?;
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        let response = router.route_worker_query(RpcRequest {
            id: Some(json!(51)),
            method: "query.callHierarchy".into(),
            params: json!({
                "symbol": "helper",
                "workspaceId": 1,
                "limit": 10,
                "maxDepth": 3,
                "filePath": "src/util.ts"
            }),
        });

        assert!(response.get("error").is_none());
        assert_eq!(response["result"]["questionClass"], json!("call_hierarchy"));
        assert_eq!(
            response["result"]["evidence"]["questionClass"],
            json!("call_hierarchy")
        );
        let callers = response["result"]["items"][0]["callers"]
            .as_array()
            .expect("callers array");
        assert!(callers
            .iter()
            .any(|caller| caller["qualifiedName"] == "run"));
        assert!(response["result"]["items"][0]["callees"]
            .as_array()
            .is_some());

        Ok(())
    }

    #[test]
    fn bridge_rpc_router_routes_entry_points_through_worker_query_contract() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        db.upsert_file(&File {
            id: 6,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "api/routes.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "f".into(),
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
            last_freshness_run_id: Some("run-bridge-6".into()),
        })?;
        db.insert_symbols(&[Symbol {
            id: 16,
            workspace_id: 1,
            file_id: 6,
            parent_symbol_id: None,
            kind: SymbolKind::Function,
            name: "auth_handler".into(),
            qualified_name: "auth_handler".into(),
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
            symbol_hash: "s16".into(),
        }])?;
        db.insert_edges(
            &[GraphEdge {
                from: NodeId::Symbol(16),
                to: NodeId::Symbol(11),
                kind: EdgeKind::Calls,
                resolution: EdgeResolution::Resolved,
                confidence: EdgeConfidence::Direct,
                reason: "handler calls helper".into(),
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 0,
                    end_line: 2,
                    end_column: 1,
                }),
                payload_json: None,
            }],
            1,
        )?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        let response = router.route_worker_query(RpcRequest {
            id: Some(json!(52)),
            method: "query.entryPoints".into(),
            params: json!({
                "symbol": "helper",
                "workspaceId": 1,
                "limit": 10,
                "maxDepth": 3,
                "filePath": "src/util.ts"
            }),
        });

        assert!(response.get("error").is_none());
        assert_eq!(response["result"]["questionClass"], json!("entry_points"));
        assert_eq!(
            response["result"]["evidence"]["bounds"]["traversalScope"],
            json!("entry_points")
        );
        let entry_points = response["result"]["items"][0]["entryPoints"]
            .as_array()
            .expect("entryPoints array");
        assert!(entry_points
            .iter()
            .any(|entry_point| entry_point["qualifiedName"] == "auth_handler"
                && entry_point["entryPoint"] == "ApiRoute"));

        Ok(())
    }

    #[test]
    fn bridge_rpc_router_preserves_expanded_method_error_shape_for_unsupported_scope(
    ) -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        for method in ["query.callHierarchy", "query.entryPoints"] {
            let response = router.route_worker_query(RpcRequest {
                id: Some(json!(53)),
                method: method.into(),
                params: json!({
                    "symbol": "mystery_symbol",
                    "workspaceId": 1,
                    "language": "unknown"
                }),
            });

            assert_eq!(response["error"]["code"], json!(-32601));
            assert_eq!(
                response["error"]["data"]["code"],
                json!("CAPABILITY_UNSUPPORTED")
            );
            assert!(response["error"]["message"]
                .as_str()
                .is_some_and(|value| value.contains("unsupported for unknown language scope")));
        }

        Ok(())
    }

    #[test]
    fn bridge_build_evidence_rejects_non_explain_intents_without_grounding() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        for intent in ["trace", "impact", "call_hierarchy", "arbitrary"] {
            let response = router.route_worker_query(RpcRequest {
                id: Some(json!(50)),
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
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        let response = router.route_worker_query(RpcRequest {
            id: Some(json!(47)),
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
        let _dispatcher = HookDispatcher::new();
        seed(&db)?;
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

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
            id: Some(json!(48)),
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
            id: Some(json!(49)),
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
        let _dispatcher = HookDispatcher::new();
        let dispatcher = HookDispatcher::new();
        let router = BridgeRpcRouter::new(tmp.path(), &db, &dispatcher, &db);

        for method in ["tool.execute", "query.trace", "arbitrary.forward"] {
            let response = router.route_worker_query(RpcRequest {
                id: Some(json!(45)),
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
        let dispatcher = HookDispatcher::new();

        for method in ["query.trace"] {
            let response = handle_request(
                tmp.path(),
                &db,
                &dispatcher,
                &db,
                RpcRequest {
                    id: Some(json!(72)),
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
        let dispatcher = HookDispatcher::new();
        seed(&db)?;

        let initialized = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(7)),
                method: "dh.initialized".into(),
                params: json!({}),
            },
        );
        assert_eq!(initialized["result"]["accepted"], json!(true));
        assert_eq!(initialized["result"]["phase"], json!("startup"));

        let ready = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(8)),
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
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(9)),
                method: "runtime.ping".into(),
                params: json!({}),
            },
        );
        assert_eq!(ping["result"]["ok"], json!(true));
        assert_eq!(ping["result"]["phase"], json!("health"));

        let run_command = handle_request(
            tmp.path(),
            &db,
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(10)),
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
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(12)),
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
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(13)),
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
            &dispatcher,
            &db,
            RpcRequest {
                id: Some(json!(11)),
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
        let dispatcher = HookDispatcher::new();
        seed(&db)?;

        for relation in ["call_hierarchy", "trace_flow", "impact"] {
            let response = handle_request(
                tmp.path(),
                &db,
                &dispatcher,
                &db,
                RpcRequest {
                    id: Some(json!(71)),
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
