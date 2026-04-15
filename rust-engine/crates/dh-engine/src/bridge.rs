use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};

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

pub fn run_bridge_server(workspace: PathBuf) -> Result<()> {
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

        let response = handle_request(&workspace, request);
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

    let id = value
        .get("id")
        .cloned()
        .context("missing request id")?;
    let method = value
        .get("method")
        .and_then(Value::as_str)
        .map(|v| v.to_string())
        .context("missing method")?;
    let params = value.get("params").cloned().unwrap_or_else(|| json!({}));

    Ok(RpcRequest { id, method, params })
}

fn handle_request(workspace: &Path, request: RpcRequest) -> Value {
    match request.method.as_str() {
        "dh.initialize" => json!({
            "jsonrpc": "2.0",
            "id": request.id,
            "result": {
                "serverName": "dh-engine",
                "serverVersion": env!("CARGO_PKG_VERSION"),
                "workspaceRoot": workspace.to_string_lossy(),
                "protocolVersion": "1"
            }
        }),
        "query.search" => {
            let query = request
                .params
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if query.is_empty() {
                return json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "error": {
                        "code": -32602,
                        "message": "query.search requires a non-empty 'query' parameter"
                    }
                });
            }

            let limit = request
                .params
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(5)
                .min(20) as usize;

            match search_workspace(workspace, query, limit) {
                Ok(items) => json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "result": {
                        "items": items
                    }
                }),
                Err(err) => json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "error": {
                        "code": -32001,
                        "message": format!("query.search failed: {err}")
                    }
                }),
            }
        }
        "query.definition" => {
            let symbol = request
                .params
                .get("symbol")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if symbol.is_empty() {
                return json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "error": {
                        "code": -32602,
                        "message": "query.definition requires a non-empty 'symbol' parameter"
                    }
                });
            }

            let limit = request
                .params
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(5)
                .min(20) as usize;

            match definition_lookup(workspace, symbol, limit) {
                Ok(items) => json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "result": {
                        "items": items
                    }
                }),
                Err(err) => json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "error": {
                        "code": -32001,
                        "message": format!("query.definition failed: {err}")
                    }
                }),
            }
        }
        "query.relationship" => {
            let relation = request
                .params
                .get("relation")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if relation.is_empty() {
                return json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "error": {
                        "code": -32602,
                        "message": "query.relationship requires a non-empty 'relation' parameter"
                    }
                });
            }

            let limit = request
                .params
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(5)
                .min(20) as usize;

            let result = match relation {
                "usage" => {
                    let symbol = request
                        .params
                        .get("symbol")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    if symbol.is_empty() {
                        return json!({
                            "jsonrpc": "2.0",
                            "id": request.id,
                            "error": {
                                "code": -32602,
                                "message": "query.relationship usage requires non-empty 'symbol'"
                            }
                        });
                    }
                    relationship_usage(workspace, symbol, limit)
                }
                "dependencies" => {
                    let file_path = request
                        .params
                        .get("filePath")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    if file_path.is_empty() {
                        return json!({
                            "jsonrpc": "2.0",
                            "id": request.id,
                            "error": {
                                "code": -32602,
                                "message": "query.relationship dependencies requires non-empty 'filePath'"
                            }
                        });
                    }
                    relationship_dependencies(workspace, file_path, limit)
                }
                "dependents" => {
                    let target = request
                        .params
                        .get("target")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    if target.is_empty() {
                        return json!({
                            "jsonrpc": "2.0",
                            "id": request.id,
                            "error": {
                                "code": -32602,
                                "message": "query.relationship dependents requires non-empty 'target'"
                            }
                        });
                    }
                    relationship_dependents(workspace, target, limit)
                }
                _ => {
                    return json!({
                        "jsonrpc": "2.0",
                        "id": request.id,
                        "error": {
                            "code": -32602,
                            "message": format!("query.relationship relation not supported: {relation}")
                        }
                    });
                }
            };

            match result {
                Ok(items) => json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "result": {
                        "items": items
                    }
                }),
                Err(err) => json!({
                    "jsonrpc": "2.0",
                    "id": request.id,
                    "error": {
                        "code": -32001,
                        "message": format!("query.relationship failed: {err}")
                    }
                }),
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

fn search_workspace(workspace: &Path, query: &str, limit: usize) -> Result<Vec<SearchItem>> {
    let mut out = Vec::new();
    let lowered = query.to_lowercase();

    collect_matches(workspace, workspace, &lowered, limit, &mut out)?;
    Ok(out)
}

fn collect_matches(
    root: &Path,
    dir: &Path,
    lowered_query: &str,
    limit: usize,
    out: &mut Vec<SearchItem>,
) -> Result<()> {
    if out.len() >= limit {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        if out.len() >= limit {
            break;
        }
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            if let Some(name) = path.file_name().and_then(|v| v.to_str()) {
                if name == ".git" || name == "node_modules" || name == ".dh" || name == "dist" {
                    continue;
                }
            }
            collect_matches(root, &path, lowered_query, limit, out)?;
            continue;
        }

        if !metadata.is_file() || metadata.len() > 512_000 {
            continue;
        }

        let text = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        for (idx, line) in text.lines().enumerate() {
            if out.len() >= limit {
                break;
            }
            if !line.to_lowercase().contains(lowered_query) {
                continue;
            }

            let rel_path = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            out.push(SearchItem {
                file_path: rel_path,
                line_start: (idx + 1) as u32,
                line_end: (idx + 1) as u32,
                snippet: line.trim().to_string(),
                reason: "substring match".to_string(),
                score: 0.9,
            });
        }
    }

    Ok(())
}

fn definition_lookup(workspace: &Path, symbol: &str, limit: usize) -> Result<Vec<SearchItem>> {
    let mut out = Vec::new();
    collect_files(workspace, workspace, &mut |path| {
        if out.len() >= limit {
            return Ok(());
        }
        let text = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(_) => return Ok(()),
        };
        for (idx, line) in text.lines().enumerate() {
            if out.len() >= limit {
                break;
            }
            if !is_definition_like_line(line, symbol) {
                continue;
            }
            out.push(SearchItem {
                file_path: to_rel_path(workspace, path),
                line_start: (idx + 1) as u32,
                line_end: (idx + 1) as u32,
                snippet: line.trim().to_string(),
                reason: format!("definition-like match for symbol '{symbol}'"),
                score: 0.96,
            });
        }
        Ok(())
    })?;
    Ok(out)
}

fn relationship_usage(workspace: &Path, symbol: &str, limit: usize) -> Result<Vec<SearchItem>> {
    let mut out = Vec::new();
    let lowered = symbol.to_lowercase();
    collect_files(workspace, workspace, &mut |path| {
        if out.len() >= limit {
            return Ok(());
        }
        let text = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(_) => return Ok(()),
        };
        for (idx, line) in text.lines().enumerate() {
            if out.len() >= limit {
                break;
            }
            let line_lowered = line.to_lowercase();
            if !line_lowered.contains(&lowered) {
                continue;
            }
            if is_definition_like_line(line, symbol) {
                continue;
            }
            out.push(SearchItem {
                file_path: to_rel_path(workspace, path),
                line_start: (idx + 1) as u32,
                line_end: (idx + 1) as u32,
                snippet: line.trim().to_string(),
                reason: format!("one-hop usage reference for '{symbol}'"),
                score: 0.88,
            });
        }
        Ok(())
    })?;
    Ok(out)
}

fn relationship_dependencies(workspace: &Path, file_path: &str, limit: usize) -> Result<Vec<SearchItem>> {
    let canonical = normalize_repo_relative_path(file_path);
    let target = workspace.join(&canonical);
    if !target.exists() {
        return Ok(Vec::new());
    }

    let text = fs::read_to_string(&target).unwrap_or_default();
    let mut out = Vec::new();
    for (idx, line) in text.lines().enumerate() {
        if out.len() >= limit {
            break;
        }
        if let Some(dep) = parse_import_target(line) {
            out.push(SearchItem {
                file_path: dep,
                line_start: (idx + 1) as u32,
                line_end: (idx + 1) as u32,
                snippet: line.trim().to_string(),
                reason: format!("direct dependency/import from '{canonical}'"),
                score: 0.9,
            });
        }
    }

    Ok(out)
}

fn relationship_dependents(workspace: &Path, target: &str, limit: usize) -> Result<Vec<SearchItem>> {
    let needle = normalize_repo_relative_path(target);
    let file_name_needle = Path::new(&needle)
        .file_name()
        .and_then(|v| v.to_str())
        .map(|v| v.to_lowercase());
    let file_stem_needle = Path::new(&needle)
        .file_stem()
        .and_then(|v| v.to_str())
        .map(|v| v.to_lowercase());
    let mut out = Vec::new();
    collect_files(workspace, workspace, &mut |path| {
        if out.len() >= limit {
            return Ok(());
        }
        let text = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(_) => return Ok(()),
        };
        for (idx, line) in text.lines().enumerate() {
            if out.len() >= limit {
                break;
            }
            if !is_import_like_line(line) {
                continue;
            }
            let lowered = line.to_lowercase();
            let matches_full = lowered.contains(&needle.to_lowercase());
            let matches_file_name = file_name_needle
                .as_ref()
                .map(|name| lowered.contains(name))
                .unwrap_or(false);
            let matches_file_stem = file_stem_needle
                .as_ref()
                .map(|stem| lowered.contains(stem))
                .unwrap_or(false);
            if !matches_full && !matches_file_name && !matches_file_stem {
                continue;
            }
            out.push(SearchItem {
                file_path: to_rel_path(workspace, path),
                line_start: (idx + 1) as u32,
                line_end: (idx + 1) as u32,
                snippet: line.trim().to_string(),
                reason: format!("one-hop dependent/importer match for '{target}'"),
                score: 0.86,
            });
        }
        Ok(())
    })?;

    Ok(out)
}

fn collect_files(root: &Path, dir: &Path, visit: &mut impl FnMut(&Path) -> Result<()>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            if let Some(name) = path.file_name().and_then(|v| v.to_str()) {
                if name == ".git" || name == "node_modules" || name == ".dh" || name == "dist" {
                    continue;
                }
            }
            collect_files(root, &path, visit)?;
            continue;
        }

        if !metadata.is_file() || metadata.len() > 512_000 {
            continue;
        }
        let _ = root;
        visit(&path)?;
    }
    Ok(())
}

fn to_rel_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn normalize_repo_relative_path(input: &str) -> String {
    input.trim().trim_matches('"').trim_matches('`').replace('\\', "/")
}

fn parse_import_target(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if let Some(pos) = trimmed.find(" from ") {
        let part = &trimmed[(pos + 6)..];
        return extract_quoted(part);
    }

    if trimmed.starts_with("import ") {
        return extract_quoted(trimmed);
    }
    if trimmed.starts_with("use ") {
        return Some(trimmed.trim_start_matches("use ").trim_end_matches(';').trim().to_string());
    }
    if trimmed.contains("require(") {
        if let Some(start) = trimmed.find("require(") {
            let part = &trimmed[(start + 8)..];
            return extract_quoted(part);
        }
    }
    None
}

fn extract_quoted(input: &str) -> Option<String> {
    for quote in ['\'', '"'] {
        if let Some(start) = input.find(quote) {
            let rem = &input[(start + 1)..];
            if let Some(end) = rem.find(quote) {
                return Some(rem[..end].to_string());
            }
        }
    }
    None
}

fn is_import_like_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with("import ")
        || trimmed.starts_with("export ")
        || trimmed.starts_with("use ")
        || trimmed.contains("require(")
}

fn is_definition_like_line(line: &str, symbol: &str) -> bool {
    let trimmed = line.trim();
    let patterns = [
        format!("function {symbol}"),
        format!("class {symbol}"),
        format!("const {symbol}"),
        format!("let {symbol}"),
        format!("var {symbol}"),
        format!("type {symbol}"),
        format!("interface {symbol}"),
        format!("fn {symbol}"),
        format!("struct {symbol}"),
        format!("enum {symbol}"),
        format!("trait {symbol}"),
        format!("impl {symbol}"),
    ];
    patterns.iter().any(|p| trimmed.contains(p))
}

#[cfg(test)]
mod tests {
    use super::{
        definition_lookup, handle_request, relationship_dependencies, relationship_dependents,
        relationship_usage, search_workspace, RpcRequest,
    };
    use serde_json::json;
    use std::fs;

    #[test]
    fn query_search_returns_items_for_matching_content() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(tmp.path().join("auth.ts"), "export function login() {}\n").expect("write fixture");

        let items = search_workspace(tmp.path(), "login", 5).expect("search");
        assert!(!items.is_empty());
        assert_eq!(items[0].file_path, "auth.ts");
    }

    #[test]
    fn initialize_method_returns_server_identity() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let request = RpcRequest {
            id: json!(1),
            method: "dh.initialize".to_string(),
            params: json!({}),
        };

        let response = handle_request(tmp.path(), request);
        assert_eq!(response["jsonrpc"], "2.0");
        assert_eq!(response["id"], 1);
        assert_eq!(response["result"]["serverName"], "dh-engine");
    }

    #[test]
    fn query_definition_returns_definition_like_matches() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(
            tmp.path().join("lib.ts"),
            "export function runKnowledgeCommand() {}\n",
        )
        .expect("write fixture");

        let items = definition_lookup(tmp.path(), "runKnowledgeCommand", 5).expect("definition lookup");
        assert!(!items.is_empty());
        assert_eq!(items[0].file_path, "lib.ts");
    }

    #[test]
    fn query_relationship_usage_returns_one_hop_usage_lines() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(
            tmp.path().join("use.ts"),
            "const value = runKnowledgeCommand();\n",
        )
        .expect("write fixture");

        let items = relationship_usage(tmp.path(), "runKnowledgeCommand", 5).expect("usage lookup");
        assert!(!items.is_empty());
    }

    #[test]
    fn query_relationship_dependencies_returns_import_targets() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(
            tmp.path().join("entry.ts"),
            "import { x } from './dep.ts';\n",
        )
        .expect("write fixture");

        let items = relationship_dependencies(tmp.path(), "entry.ts", 5).expect("dependency lookup");
        assert!(!items.is_empty());
        assert_eq!(items[0].file_path, "./dep.ts");
    }

    #[test]
    fn query_relationship_dependents_returns_importers() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(
            tmp.path().join("entry.ts"),
            "import { x } from './dep.ts';\n",
        )
        .expect("write fixture");

        let items = relationship_dependents(tmp.path(), "dep.ts", 5).expect("dependents lookup");
        assert!(!items.is_empty());
        assert_eq!(items[0].file_path, "entry.ts");
    }

    #[test]
    fn query_relationship_dependents_matches_by_file_name_when_target_is_full_path() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(tmp.path().join("packages/opencode-app/src/workflows"))
            .expect("mkdir");
        fs::write(
            tmp.path().join("packages/opencode-app/src/workflows/run-knowledge-command.ts"),
            "export const marker = 1;\n",
        )
        .expect("write fixture");
        fs::write(
            tmp.path().join("entry.ts"),
            "import { marker } from './packages/opencode-app/src/workflows/run-knowledge-command';\n",
        )
        .expect("write fixture");

        let items = relationship_dependents(
            tmp.path(),
            "packages/opencode-app/src/workflows/run-knowledge-command.ts",
            5,
        )
        .expect("dependents lookup");
        assert!(!items.is_empty());
        assert_eq!(items[0].file_path, "entry.ts");
    }
}
