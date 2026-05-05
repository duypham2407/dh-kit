use crate::host_lifecycle::{SUPPORTED_COMMANDS_FIRST_WAVE, SUPPORT_BOUNDARY_FIRST_WAVE};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};

pub const WORKER_PROTOCOL_VERSION: &str = "1";
pub const WORKER_PROTOCOL_TRANSPORT: &str = "jsonrpc_stdio_content_length";
pub const QUERY_CALL_HIERARCHY_METHOD: &str = "query.callHierarchy";
pub const QUERY_ENTRY_POINTS_METHOD: &str = "query.entryPoints";
pub const QUERY_BUILD_EVIDENCE_METHOD: &str = "query.buildEvidence";
pub const BUILD_EVIDENCE_DEFAULT_MAX_FILES: usize = 5;
pub const BUILD_EVIDENCE_DEFAULT_MAX_SYMBOLS: usize = 8;
pub const BUILD_EVIDENCE_DEFAULT_MAX_SNIPPETS: usize = 8;
pub const BUILD_EVIDENCE_HARD_MAX_FILES: usize = 20;
pub const BUILD_EVIDENCE_HARD_MAX_SYMBOLS: usize = 32;
pub const BUILD_EVIDENCE_HARD_MAX_SNIPPETS: usize = 32;
pub const BUILD_EVIDENCE_REQUEST_FIELDS: [&str; 5] =
    ["query", "intent", "targets", "budget", "freshness"];
pub const BUILD_EVIDENCE_REQUIRED_FIELDS: [&str; 1] = ["query"];
pub const BUILD_EVIDENCE_SUPPORTED_INTENTS: [&str; 1] = ["explain"];
pub const BUILD_EVIDENCE_ANSWER_STATES: [&str; 4] =
    ["grounded", "partial", "insufficient", "unsupported"];
pub const BUILD_EVIDENCE_UNSUPPORTED_CLASSES: [&str; 5] = [
    "runtime_trace",
    "impact_analysis",
    "call_hierarchy",
    "multi_hop",
    "unbounded_scope",
];

pub const HOST_HANDSHAKE_METHODS: [&str; 2] = ["dh.initialize", "dh.initialized"];
pub const HOST_TO_WORKER_REQUEST_METHODS: [&str; 4] = [
    "session.runCommand",
    "runtime.ping",
    "session.cancel",
    "dh.shutdown",
];
pub const WORKER_TO_HOST_QUERY_METHODS: [&str; 6] = [
    "query.search",
    "query.definition",
    "query.relationship",
    QUERY_BUILD_EVIDENCE_METHOD,
    QUERY_CALL_HIERARCHY_METHOD,
    QUERY_ENTRY_POINTS_METHOD,
];
pub const WORKER_TO_HOST_NOTIFICATIONS: [&str; 3] =
    ["dh.ready", "event.output.delta", "event.warning"];
pub const QUERY_RELATIONSHIPS: [&str; 3] = ["usage", "dependencies", "dependents"];
pub const BRIDGE_INITIALIZE_METHODS: [&str; 7] = [
    "dh.initialize",
    "query.search",
    "query.definition",
    "query.relationship",
    QUERY_BUILD_EVIDENCE_METHOD,
    QUERY_CALL_HIERARCHY_METHOD,
    QUERY_ENTRY_POINTS_METHOD,
];
pub const BRIDGE_LIFECYCLE_CONTROL_METHODS: [&str; 5] = [
    "dh.initialized",
    "dh.ready",
    "session.runCommand",
    "runtime.ping",
    "dh.shutdown",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcFramingContract {
    pub transport: &'static str,
    pub protocol_version: &'static str,
    pub content_length_framing: bool,
    pub stdout_protocol_only: bool,
    pub stderr_logs_only: bool,
    pub network_transport: bool,
    pub arbitrary_method_passthrough: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerProtocolContract {
    pub protocol_version: &'static str,
    pub support_boundary: &'static str,
    pub supported_commands: Vec<&'static str>,
    pub framing: JsonRpcFramingContract,
    pub host_handshake_methods: Vec<&'static str>,
    pub host_to_worker_request_methods: Vec<&'static str>,
    pub worker_to_host_query_methods: Vec<&'static str>,
    pub worker_to_host_notifications: Vec<&'static str>,
    pub supported_relationships: Vec<&'static str>,
    pub build_evidence: BuildEvidenceProtocolContract,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildEvidenceBudgetContract {
    pub default_max_files: usize,
    pub default_max_symbols: usize,
    pub default_max_snippets: usize,
    pub hard_max_files: usize,
    pub hard_max_symbols: usize,
    pub hard_max_snippets: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildEvidenceProtocolContract {
    pub method: &'static str,
    pub question_class: &'static str,
    pub request_fields: Vec<&'static str>,
    pub required_fields: Vec<&'static str>,
    pub supported_intents: Vec<&'static str>,
    pub budget: BuildEvidenceBudgetContract,
    pub answer_states: Vec<&'static str>,
    pub canonical_packet_owner: &'static str,
    pub typescript_packet_synthesis: bool,
    pub lifecycle_evidence_separation: bool,
    pub generic_passthrough: bool,
    pub unsupported_classes: Vec<&'static str>,
}

pub fn worker_protocol_contract() -> WorkerProtocolContract {
    WorkerProtocolContract {
        protocol_version: WORKER_PROTOCOL_VERSION,
        support_boundary: SUPPORT_BOUNDARY_FIRST_WAVE,
        supported_commands: SUPPORTED_COMMANDS_FIRST_WAVE.to_vec(),
        framing: JsonRpcFramingContract {
            transport: WORKER_PROTOCOL_TRANSPORT,
            protocol_version: WORKER_PROTOCOL_VERSION,
            content_length_framing: true,
            stdout_protocol_only: true,
            stderr_logs_only: true,
            network_transport: false,
            arbitrary_method_passthrough: false,
        },
        host_handshake_methods: HOST_HANDSHAKE_METHODS.to_vec(),
        host_to_worker_request_methods: HOST_TO_WORKER_REQUEST_METHODS.to_vec(),
        worker_to_host_query_methods: WORKER_TO_HOST_QUERY_METHODS.to_vec(),
        worker_to_host_notifications: WORKER_TO_HOST_NOTIFICATIONS.to_vec(),
        supported_relationships: QUERY_RELATIONSHIPS.to_vec(),
        build_evidence: build_evidence_protocol_contract(),
    }
}

pub fn build_evidence_protocol_contract() -> BuildEvidenceProtocolContract {
    BuildEvidenceProtocolContract {
        method: QUERY_BUILD_EVIDENCE_METHOD,
        question_class: "build_evidence",
        request_fields: BUILD_EVIDENCE_REQUEST_FIELDS.to_vec(),
        required_fields: BUILD_EVIDENCE_REQUIRED_FIELDS.to_vec(),
        supported_intents: BUILD_EVIDENCE_SUPPORTED_INTENTS.to_vec(),
        budget: BuildEvidenceBudgetContract {
            default_max_files: BUILD_EVIDENCE_DEFAULT_MAX_FILES,
            default_max_symbols: BUILD_EVIDENCE_DEFAULT_MAX_SYMBOLS,
            default_max_snippets: BUILD_EVIDENCE_DEFAULT_MAX_SNIPPETS,
            hard_max_files: BUILD_EVIDENCE_HARD_MAX_FILES,
            hard_max_symbols: BUILD_EVIDENCE_HARD_MAX_SYMBOLS,
            hard_max_snippets: BUILD_EVIDENCE_HARD_MAX_SNIPPETS,
        },
        answer_states: BUILD_EVIDENCE_ANSWER_STATES.to_vec(),
        canonical_packet_owner: "rust",
        typescript_packet_synthesis: false,
        lifecycle_evidence_separation: true,
        generic_passthrough: false,
        unsupported_classes: BUILD_EVIDENCE_UNSUPPORTED_CLASSES.to_vec(),
    }
}

pub fn is_worker_to_host_query_method(method: &str) -> bool {
    WORKER_TO_HOST_QUERY_METHODS.contains(&method)
}

pub fn jsonrpc_request(id: u64, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
}

pub fn jsonrpc_notification(method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    })
}

pub fn jsonrpc_message_id(message: &Value) -> Option<u64> {
    message.get("id").and_then(Value::as_u64)
}

pub fn jsonrpc_message_method(message: &Value) -> Option<&str> {
    message.get("method").and_then(Value::as_str)
}

pub fn jsonrpc_message_result(message: &Value) -> Option<&Value> {
    message.get("result")
}

pub fn jsonrpc_message_error(message: &Value) -> Option<&Value> {
    message.get("error")
}

pub fn read_content_length_message(reader: &mut BufReader<impl Read>) -> Result<Value> {
    let mut content_length: Option<usize> = None;

    loop {
        let mut line = String::new();
        let bytes = reader.read_line(&mut line)?;
        if bytes == 0 {
            anyhow::bail!("worker stdout closed");
        }

        if line == "\r\n" || line == "\n" {
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
    let payload = String::from_utf8(buf).context("worker protocol payload is not utf8")?;
    serde_json::from_str(&payload).context("invalid worker protocol json payload")
}

pub fn write_content_length_message(writer: &mut impl Write, payload: &Value) -> Result<()> {
    let body = serde_json::to_string(payload)?;
    write!(writer, "Content-Length: {}\r\n\r\n{}", body.len(), body)?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;

    #[test]
    fn worker_protocol_contract_freezes_first_wave_methods_and_transport() -> anyhow::Result<()> {
        let contract = worker_protocol_contract();
        let value = serde_json::to_value(&contract)?;

        assert_eq!(value["protocolVersion"], json!("1"));
        assert_eq!(
            value["supportBoundary"],
            json!("knowledge_commands_first_wave")
        );
        assert_eq!(
            value["supportedCommands"],
            json!(["ask", "explain", "trace"])
        );
        assert_eq!(
            value["framing"]["transport"],
            json!("jsonrpc_stdio_content_length")
        );
        assert_eq!(value["framing"]["contentLengthFraming"], json!(true));
        assert_eq!(value["framing"]["stdoutProtocolOnly"], json!(true));
        assert_eq!(value["framing"]["stderrLogsOnly"], json!(true));
        assert_eq!(value["framing"]["networkTransport"], json!(false));
        assert_eq!(value["framing"]["arbitraryMethodPassthrough"], json!(false));
        assert_eq!(
            value["workerToHostQueryMethods"],
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
            value["supportedRelationships"],
            json!(["usage", "dependencies", "dependents"])
        );
        assert_eq!(
            value["buildEvidence"]["method"],
            json!("query.buildEvidence")
        );
        assert_eq!(
            value["buildEvidence"]["questionClass"],
            json!("build_evidence")
        );
        assert_eq!(
            value["buildEvidence"]["requestFields"],
            json!(["query", "intent", "targets", "budget", "freshness"])
        );
        assert_eq!(value["buildEvidence"]["requiredFields"], json!(["query"]));
        assert_eq!(
            value["buildEvidence"]["supportedIntents"],
            json!(["explain"])
        );
        assert_eq!(
            value["buildEvidence"]["answerStates"],
            json!(["grounded", "partial", "insufficient", "unsupported"])
        );
        assert_eq!(
            value["buildEvidence"]["canonicalPacketOwner"],
            json!("rust")
        );
        assert_eq!(
            value["buildEvidence"]["typescriptPacketSynthesis"],
            json!(false)
        );
        assert_eq!(
            value["buildEvidence"]["lifecycleEvidenceSeparation"],
            json!(true)
        );
        assert_eq!(value["buildEvidence"]["genericPassthrough"], json!(false));
        assert_eq!(
            value["buildEvidence"]["budget"]["defaultMaxFiles"],
            json!(5)
        );
        assert_eq!(
            value["buildEvidence"]["budget"]["defaultMaxSymbols"],
            json!(8)
        );
        assert_eq!(
            value["buildEvidence"]["budget"]["defaultMaxSnippets"],
            json!(8)
        );
        assert_eq!(value["buildEvidence"]["budget"]["hardMaxFiles"], json!(20));
        assert_eq!(
            value["buildEvidence"]["budget"]["hardMaxSymbols"],
            json!(32)
        );
        assert_eq!(
            value["buildEvidence"]["budget"]["hardMaxSnippets"],
            json!(32)
        );
        assert_eq!(
            value["buildEvidence"]["unsupportedClasses"],
            json!([
                "runtime_trace",
                "impact_analysis",
                "call_hierarchy",
                "multi_hop",
                "unbounded_scope"
            ])
        );

        Ok(())
    }

    #[test]
    fn worker_to_host_router_accepts_only_bounded_query_methods() {
        assert!(is_worker_to_host_query_method("query.search"));
        assert!(is_worker_to_host_query_method("query.definition"));
        assert!(is_worker_to_host_query_method("query.relationship"));
        assert!(is_worker_to_host_query_method("query.buildEvidence"));
        assert!(is_worker_to_host_query_method("query.callHierarchy"));
        assert!(is_worker_to_host_query_method("query.entryPoints"));
        assert!(!is_worker_to_host_query_method("query.trace"));
        assert!(!is_worker_to_host_query_method("query.traceFlow"));
        assert!(!is_worker_to_host_query_method("query.impactAnalysis"));
        assert!(!is_worker_to_host_query_method("query.semanticSearch"));
        assert!(!is_worker_to_host_query_method("tool.execute"));
        assert!(!is_worker_to_host_query_method("arbitrary.forward"));
    }

    #[test]
    fn build_evidence_contract_freezes_packet_state_and_authority_boundary() -> anyhow::Result<()> {
        let contract = build_evidence_protocol_contract();
        let value = serde_json::to_value(&contract)?;

        assert_eq!(value["method"], json!("query.buildEvidence"));
        assert_eq!(value["questionClass"], json!("build_evidence"));
        assert_eq!(
            value["answerStates"],
            json!(["grounded", "partial", "insufficient", "unsupported"])
        );
        assert_eq!(value["canonicalPacketOwner"], json!("rust"));
        assert_eq!(value["typescriptPacketSynthesis"], json!(false));
        assert_eq!(value["lifecycleEvidenceSeparation"], json!(true));
        assert_eq!(value["genericPassthrough"], json!(false));

        Ok(())
    }

    #[test]
    fn content_length_framing_round_trips_jsonrpc_messages() -> anyhow::Result<()> {
        let payload = jsonrpc_request(7, "runtime.ping", json!({ "scope": "test" }));
        let mut encoded = Vec::new();
        write_content_length_message(&mut encoded, &payload)?;

        let mut reader = BufReader::new(Cursor::new(encoded));
        let decoded = read_content_length_message(&mut reader)?;

        assert_eq!(decoded, payload);
        assert_eq!(jsonrpc_message_id(&decoded), Some(7));
        assert_eq!(jsonrpc_message_method(&decoded), Some("runtime.ping"));
        assert!(jsonrpc_message_result(&decoded).is_none());
        assert!(jsonrpc_message_error(&decoded).is_none());

        Ok(())
    }
}
