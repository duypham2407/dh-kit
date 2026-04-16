use anyhow::{Context, Result};
use dh_query::{
    FindDependenciesQuery, FindDependentsQuery, FindReferencesQuery, FindSymbolQuery,
    GotoDefinitionQuery, QueryEngine,
};
use dh_storage::Database;
use dh_types::{AnswerState, EvidencePacket, QuestionClass};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};

const DEFAULT_DB_NAME: &str = "dh-index.db";

#[derive(Debug)]
struct RpcRequest {
    id: Value,
    method: String,
    params: Value,
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
struct BridgeResult {
    #[serde(rename = "answerState")]
    answer_state: String,
    #[serde(rename = "questionClass")]
    question_class: String,
    items: Vec<SearchItem>,
    evidence: Option<EvidencePacket>,
}

pub fn run_bridge_server(workspace: PathBuf) -> Result<()> {
    let db_path = workspace.join(DEFAULT_DB_NAME);
    let db = Database::new(&db_path).with_context(|| format!("open db: {}", db_path.display()))?;
    db.initialize()?;

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = io::BufWriter::new(stdout.lock());

    loop {
        let request = match read_rpc_request(&mut reader) {
            Ok(value) => value,
            Err(err) => {
                eprintln!("bridge read failed: {err}");
                break;
            }
        };

        let response = handle_request(&workspace, &db, request);
        write_rpc_response(&mut writer, &response)?;
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
        "dh.initialize" => json!({
            "jsonrpc": "2.0",
            "id": request.id,
            "result": {
                "serverName": "dh-engine",
                "serverVersion": env!("CARGO_PKG_VERSION"),
                "workspaceRoot": workspace.to_string_lossy(),
                "protocolVersion": "1",
                "capabilities": {
                    "protocolVersion": "1",
                    "methods": [
                        "dh.initialize",
                        "query.search",
                        "query.definition",
                        "query.relationship"
                    ],
                    "queryRelationship": {
                        "supportedRelations": [
                            "usage",
                            "dependencies",
                            "dependents"
                        ]
                    }
                }
            }
        }),
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
                    let items: Vec<SearchItem> = matches
                        .into_iter()
                        .map(|m| SearchItem {
                            file_path: m.file_path,
                            line_start: m.line_start,
                            line_end: m.line_end,
                            snippet: m.qualified_name,
                            reason: "symbol match".into(),
                            score: 0.95,
                        })
                        .collect();

                    ok_result(
                        request.id,
                        BridgeResult {
                            answer_state: "grounded".into(),
                            question_class: "find_symbol".into(),
                            items,
                            evidence: None,
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

            match db.goto_definition(GotoDefinitionQuery {
                workspace_id,
                symbol: symbol.clone(),
                file_path: str_param_opt(&request.params, "filePath"),
                line: int_param_opt(&request.params, "line").map(|v| v as u32),
                column: int_param_opt(&request.params, "column").map(|v| v as u32),
                prefer_runtime_symbol: bool_param(&request.params, "preferRuntimeSymbol", true),
            }) {
                Ok(Some(def)) => ok_result(
                    request.id,
                    BridgeResult {
                        answer_state: answer_state_str(def.evidence.answer_state).into(),
                        question_class: question_class_str(def.evidence.question_class).into(),
                        items: vec![SearchItem {
                            file_path: def.file_path,
                            line_start: def.line_start,
                            line_end: def.line_end,
                            snippet: def.qualified_name,
                            reason: "definition".into(),
                            score: 0.99,
                        }],
                        evidence: Some(def.evidence),
                    },
                ),
                Ok(None) => ok_result(
                    request.id,
                    BridgeResult {
                        answer_state: "insufficient".into(),
                        question_class: "definition".into(),
                        items: Vec::new(),
                        evidence: None,
                    },
                ),
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
                    match db.find_references(FindReferencesQuery {
                        workspace_id,
                        symbol_id: None,
                        symbol: Some(symbol),
                        include_type_only: false,
                        include_tests: true,
                        limit,
                    }) {
                        Ok(result) => ok_result(
                            request.id,
                            BridgeResult {
                                answer_state: answer_state_str(result.answer_state).into(),
                                question_class: "references".into(),
                                items: result
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
                                    .collect(),
                                evidence: Some(result.evidence),
                            },
                        ),
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
                    match db.find_dependencies(FindDependenciesQuery {
                        workspace_id,
                        file_path,
                        limit,
                    }) {
                        Ok(result) => ok_result(
                            request.id,
                            BridgeResult {
                                answer_state: answer_state_str(result.answer_state).into(),
                                question_class: "dependencies".into(),
                                items: result
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
                                    .collect(),
                                evidence: Some(result.evidence),
                            },
                        ),
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
                    match db.find_dependents(FindDependentsQuery {
                        workspace_id,
                        target,
                        limit,
                    }) {
                        Ok(result) => ok_result(
                            request.id,
                            BridgeResult {
                                answer_state: answer_state_str(result.answer_state).into(),
                                question_class: "dependents".into(),
                                items: result
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
                                    .collect(),
                                evidence: Some(result.evidence),
                            },
                        ),
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
        _ => json!({
            "jsonrpc": "2.0",
            "id": request.id,
            "error": {
                "code": -32601,
                "message": format!("method not found: {}", request.method)
            }
        }),
    }
}

fn write_rpc_response(writer: &mut io::BufWriter<impl Write>, payload: &Value) -> Result<()> {
    let body = serde_json::to_string(payload)?;
    write!(writer, "Content-Length: {}\r\n\r\n{}", body.len(), body)?;
    writer.flush()?;
    Ok(())
}

fn ok_result(id: Value, result: impl Serialize) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
}

fn invalid_params(id: Value, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": -32602,
            "message": message
        }
    })
}

fn method_not_supported(id: Value, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": -32601,
            "message": message
        }
    })
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
        QuestionClass::Definition => "definition",
        QuestionClass::References => "references",
        QuestionClass::Dependencies => "dependencies",
        QuestionClass::Dependents => "dependents",
        QuestionClass::CallHierarchy => "call_hierarchy",
        QuestionClass::TraceFlow => "trace_flow",
        QuestionClass::Impact => "impact",
    }
}

#[cfg(test)]
mod tests {
    use super::{handle_request, RpcRequest};
    use dh_storage::{
        CallEdgeRepository, Database, FileRepository, ImportRepository, ReferenceRepository,
        SymbolRepository,
    };
    use dh_types::{
        CallEdge, CallKind, File, Import, ImportKind, LanguageId, ParseStatus, Reference,
        ReferenceKind, Span, Symbol, SymbolKind, Visibility,
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

        db.insert_call_edges(&[CallEdge {
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
        }])?;

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

        let unsupported = handle_request(
            tmp.path(),
            &db,
            mk(
                "query.relationship",
                json!({ "relation": "impact", "target": "unknown-target", "workspaceId": 1 }),
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
                "query.relationship"
            ])
        );
        assert_eq!(
            response["result"]["capabilities"]["queryRelationship"]["supportedRelations"],
            json!(["usage", "dependencies", "dependents"])
        );

        Ok(())
    }
}
