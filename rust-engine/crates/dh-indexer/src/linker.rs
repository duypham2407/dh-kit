use anyhow::Result;
use dh_parser::module_resolver::{ModuleResolution, ModuleResolutionStatus};
use dh_storage::{Database, FileRepository, GraphEdgeRepository, SymbolRepository};
use dh_types::{
    CallEdge, EdgeConfidence, EdgeKind, EdgeResolution, File, FileId, GraphEdge, Import, NodeId,
    Reference, Symbol, SymbolId, WorkspaceId,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LinkReport {
    pub linked_imports: u64,
    pub linked_cross_root_imports: u64,
    pub linked_calls: u64,
    pub linked_cross_root_calls: u64,
    pub linked_references: u64,
    pub unresolved_imports: u64,
    pub unresolved_cross_root_imports: u64,
    pub unresolved_calls: u64,
    pub unresolved_references: u64,
    pub link_ms: u128,
}

#[derive(Debug, Clone, Copy)]
pub struct LinkFileInput<'a> {
    pub file: &'a File,
    pub imports: &'a [Import],
    pub call_edges: &'a [CallEdge],
    pub references: &'a [Reference],
}

#[derive(Debug, Clone, Default)]
pub struct LinkFileOutput {
    pub edges: Vec<GraphEdge>,
    pub report: LinkReport,
}

#[derive(Debug, Clone)]
struct WorkspaceSnapshot {
    files_by_id: HashMap<FileId, File>,
    files_by_abs_path: HashMap<PathBuf, FileId>,
    symbols_by_id: HashMap<SymbolId, Symbol>,
    symbols_by_file_and_name: HashMap<(FileId, String), Vec<SymbolId>>,
    exported_symbols_by_file_and_name: HashMap<(FileId, String), Vec<SymbolId>>,
    symbols_by_name: HashMap<String, Vec<SymbolId>>,
}

#[derive(Debug, Clone)]
struct ImportBinding {
    target_file_id: FileId,
    imported_name: Option<String>,
    local_name: String,
}

#[derive(Debug, Clone, Default)]
struct SourceScope {
    import_bindings_by_local_name: HashMap<String, Vec<ImportBinding>>,
    namespace_imports_by_local_name: HashMap<String, Vec<FileId>>,
}

#[derive(Debug, Clone)]
struct SymbolResolution {
    target: Option<SymbolId>,
    link_status: &'static str,
    link_reason: &'static str,
    reason_detail: String,
    candidate_symbol_ids: Vec<SymbolId>,
}

#[derive(Debug, Clone)]
pub struct LinkWorkspaceSnapshot {
    snapshot: WorkspaceSnapshot,
}

impl LinkWorkspaceSnapshot {
    pub fn new(
        workspace_root: &Path,
        root_paths: &HashMap<i64, PathBuf>,
        files: Vec<File>,
        symbols: Vec<Symbol>,
    ) -> Self {
        Self {
            snapshot: WorkspaceSnapshot::new(
                normalize_path(workspace_root),
                root_paths.clone(),
                files,
                symbols,
            ),
        }
    }

    #[must_use]
    pub fn link_file(&self, input: LinkFileInput<'_>) -> LinkFileOutput {
        link_file_with_snapshot(&self.snapshot, input)
    }
}

impl WorkspaceSnapshot {
    fn new(
        workspace_root: PathBuf,
        root_paths: HashMap<i64, PathBuf>,
        files: Vec<File>,
        symbols: Vec<Symbol>,
    ) -> Self {
        let mut files_by_id = HashMap::new();
        let mut files_by_abs_path = HashMap::new();
        for file in files {
            if file.deleted_at_unix_ms.is_none() {
                let file_root = root_paths.get(&file.root_id).unwrap_or(&workspace_root);
                files_by_abs_path.insert(normalize_path(&file_root.join(&file.rel_path)), file.id);
            }
            files_by_id.insert(file.id, file);
        }

        let mut symbols_by_id = HashMap::new();
        let mut symbols_by_file_and_name: HashMap<(FileId, String), Vec<SymbolId>> = HashMap::new();
        let mut exported_symbols_by_file_and_name: HashMap<(FileId, String), Vec<SymbolId>> =
            HashMap::new();
        let mut symbols_by_name: HashMap<String, Vec<SymbolId>> = HashMap::new();
        for symbol in symbols {
            symbols_by_file_and_name
                .entry((symbol.file_id, symbol.name.clone()))
                .or_default()
                .push(symbol.id);
            symbols_by_file_and_name
                .entry((symbol.file_id, symbol.qualified_name.clone()))
                .or_default()
                .push(symbol.id);
            if symbol.exported {
                exported_symbols_by_file_and_name
                    .entry((symbol.file_id, symbol.name.clone()))
                    .or_default()
                    .push(symbol.id);
                exported_symbols_by_file_and_name
                    .entry((symbol.file_id, symbol.qualified_name.clone()))
                    .or_default()
                    .push(symbol.id);
            }
            symbols_by_name
                .entry(symbol.name.clone())
                .or_default()
                .push(symbol.id);
            symbols_by_name
                .entry(symbol.qualified_name.clone())
                .or_default()
                .push(symbol.id);
            symbols_by_id.insert(symbol.id, symbol);
        }

        Self {
            files_by_id,
            files_by_abs_path,
            symbols_by_id,
            symbols_by_file_and_name,
            exported_symbols_by_file_and_name,
            symbols_by_name,
        }
    }

    fn file_id_for_abs_path(&self, path: &Path) -> Option<FileId> {
        self.files_by_abs_path.get(&normalize_path(path)).copied()
    }

    fn file_for_id(&self, id: FileId) -> Option<&File> {
        self.files_by_id.get(&id)
    }

    fn symbol_for_id(&self, id: SymbolId) -> Option<&Symbol> {
        self.symbols_by_id.get(&id)
    }

    fn exported_symbols(&self, file_id: FileId, imported_name: &str) -> Vec<SymbolId> {
        unique_symbol_ids(
            self.exported_symbols_by_file_and_name
                .get(&(file_id, imported_name.to_string()))
                .into_iter()
                .flatten()
                .copied(),
        )
    }

    fn symbols_in_file(&self, file_id: FileId, name: &str) -> Vec<SymbolId> {
        unique_symbol_ids(
            self.symbols_by_file_and_name
                .get(&(file_id, name.to_string()))
                .into_iter()
                .flatten()
                .copied(),
        )
    }

    fn symbols_by_name(&self, name: &str) -> Vec<SymbolId> {
        unique_symbol_ids(
            self.symbols_by_name
                .get(name)
                .into_iter()
                .flatten()
                .copied(),
        )
    }
}

pub fn link_file_facts(
    workspace_root: &Path,
    root_paths: &HashMap<i64, PathBuf>,
    workspace_files: &[File],
    workspace_symbols: &[Symbol],
    input: LinkFileInput<'_>,
) -> LinkFileOutput {
    let snapshot = WorkspaceSnapshot::new(
        normalize_path(workspace_root),
        root_paths.clone(),
        workspace_files.to_vec(),
        workspace_symbols.to_vec(),
    );
    link_file_with_snapshot(&snapshot, input)
}

pub fn link_workspace(
    db: &Database,
    workspace_id: WorkspaceId,
    workspace_root: &Path,
    root_paths: &HashMap<i64, PathBuf>,
) -> Result<LinkReport> {
    let files = db.list_files_by_workspace(workspace_id)?;
    let symbols = db.find_symbols_by_workspace(workspace_id)?;
    let snapshot = WorkspaceSnapshot::new(
        normalize_path(workspace_root),
        root_paths.clone(),
        files.clone(),
        symbols,
    );
    let mut relinked_by_file = Vec::new();
    let mut report = LinkReport::default();

    let started = std::time::Instant::now();
    for file in files {
        if file.deleted_at_unix_ms.is_some() {
            continue;
        }
        let edges = db.find_edges_by_file(file.id)?;
        let relinked = relink_existing_edges(&snapshot, &file, &edges);
        report.accumulate(relinked.report);
        relinked_by_file.push((file.id, relinked.edges));
    }
    report.link_ms = started.elapsed().as_millis();

    db.connection()
        .execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
    let write_result = (|| -> Result<()> {
        for (file_id, edges) in relinked_by_file {
            db.connection().execute(
                "DELETE FROM graph_edges WHERE source_file_id = ?1",
                rusqlite::params![file_id],
            )?;
            if !edges.is_empty() {
                db.insert_edges(&edges, file_id)?;
            }
        }
        Ok(())
    })();

    match write_result {
        Ok(()) => db.connection().execute_batch("COMMIT")?,
        Err(err) => {
            let _ = db.connection().execute_batch("ROLLBACK");
            return Err(err);
        }
    }

    Ok(report)
}

pub fn summarize_workspace_edges(
    db: &Database,
    workspace_id: WorkspaceId,
    workspace_root: &Path,
    root_paths: &HashMap<i64, PathBuf>,
) -> Result<LinkReport> {
    let started = std::time::Instant::now();
    let files = db.list_files_by_workspace(workspace_id)?;
    let symbols = db.find_symbols_by_workspace(workspace_id)?;
    let snapshot = WorkspaceSnapshot::new(
        normalize_path(workspace_root),
        root_paths.clone(),
        files.clone(),
        symbols,
    );
    let mut report = LinkReport::default();

    for file in files {
        if file.deleted_at_unix_ms.is_some() {
            continue;
        }

        let edges = db.find_edges_by_file(file.id)?;
        report.accumulate(summarize_file_edges(&snapshot, &file, &edges));
    }

    report.link_ms = started.elapsed().as_millis();
    Ok(report)
}

fn summarize_file_edges(
    snapshot: &WorkspaceSnapshot,
    file: &File,
    edges: &[GraphEdge],
) -> LinkReport {
    let mut report = LinkReport::default();
    for edge in edges {
        match edge.kind {
            EdgeKind::Imports | EdgeKind::ReExports => {
                register_import(&mut report, edge, file, snapshot);
            }
            EdgeKind::Calls => register_call(&mut report, edge, file, snapshot),
            EdgeKind::References => register_reference(&mut report, edge),
            _ => {}
        }
    }
    report
}

fn link_file_with_snapshot(
    snapshot: &WorkspaceSnapshot,
    input: LinkFileInput<'_>,
) -> LinkFileOutput {
    let mut output = LinkFileOutput::default();
    let source_scope = SourceScope::new(snapshot, input.imports);

    for import in input.imports {
        let edge = link_import(snapshot, input.file, import);
        register_import(&mut output.report, &edge, input.file, snapshot);
        output.edges.push(edge);
    }

    for call in input.call_edges {
        let edge = link_call(snapshot, &source_scope, input.file, call);
        register_call(&mut output.report, &edge, input.file, snapshot);
        output.edges.push(edge);
    }

    for reference in input.references {
        let edge = link_reference(snapshot, &source_scope, input.file, reference);
        register_reference(&mut output.report, &edge);
        output.edges.push(edge);
    }

    output
}

fn relink_existing_edges(
    snapshot: &WorkspaceSnapshot,
    file: &File,
    edges: &[GraphEdge],
) -> LinkFileOutput {
    let mut output = LinkFileOutput::default();
    let source_scope = SourceScope::from_edges(snapshot, edges);
    for edge in edges {
        let relinked = match (edge.kind, edge.resolution) {
            (EdgeKind::Imports | EdgeKind::ReExports, EdgeResolution::Unresolved) => {
                relink_import_edge(snapshot, file, edge)
            }
            (EdgeKind::Calls, EdgeResolution::Unresolved) => {
                relink_call_edge(snapshot, &source_scope, file, edge)
            }
            (EdgeKind::References, EdgeResolution::Unresolved) => {
                relink_reference_edge(snapshot, &source_scope, file, edge)
            }
            _ => edge.clone(),
        };
        match relinked.kind {
            EdgeKind::Imports | EdgeKind::ReExports => {
                register_import(&mut output.report, &relinked, file, snapshot)
            }
            EdgeKind::Calls => register_call(&mut output.report, &relinked, file, snapshot),
            EdgeKind::References => register_reference(&mut output.report, &relinked),
            _ => {}
        }
        output.edges.push(relinked);
    }
    output
}

fn relink_import_edge(
    snapshot: &WorkspaceSnapshot,
    source_file: &File,
    edge: &GraphEdge,
) -> GraphEdge {
    let Some(payload) = edge.payload_json.as_ref().and_then(parse_payload) else {
        return edge.clone();
    };
    let Some(resolved_abs_path) = payload
        .get("resolved_abs_path")
        .and_then(Value::as_str)
        .map(PathBuf::from)
    else {
        return edge.clone();
    };
    let Some(target_file_id) = snapshot.file_id_for_abs_path(&resolved_abs_path) else {
        return edge.clone();
    };
    let imported_name = payload.get("imported_name").and_then(Value::as_str);
    let target_symbol_candidates = imported_name
        .map(|name| snapshot.exported_symbols(target_file_id, name))
        .unwrap_or_default();
    let target_symbol_id = unique_symbol_id(&target_symbol_candidates);

    let mut relinked = edge.clone();
    relinked.to = NodeId::File(target_file_id);
    relinked.resolution = EdgeResolution::Resolved;
    relinked.confidence = EdgeConfidence::Direct;
    relinked.reason = format!(
        "resolved import '{}'",
        payload_string(&payload, "specifier")
    );
    relinked.payload_json = Some(merge_payload(
        payload,
        json!({
            "link_status": "linked",
            "link_reason": "resolved_path_matched_indexed_file",
            "source_file_id": source_file.id,
            "target_file_id": target_file_id,
            "target_symbol_id": target_symbol_id,
            "target_symbol_candidate_ids": target_symbol_candidates,
        }),
    ));
    relinked
}

fn relink_call_edge(
    snapshot: &WorkspaceSnapshot,
    source_scope: &SourceScope,
    source_file: &File,
    edge: &GraphEdge,
) -> GraphEdge {
    let Some(payload) = edge.payload_json.as_ref().and_then(parse_payload) else {
        return edge.clone();
    };
    let resolution = resolve_source_symbol(
        snapshot,
        source_scope,
        source_file,
        payload.get("callee_display_name").and_then(Value::as_str),
        payload.get("callee_qualified_name").and_then(Value::as_str),
        "callee_symbol_not_found",
    );

    let Some(target) = resolution.target else {
        let mut relinked = edge.clone();
        relinked.resolution = EdgeResolution::Unresolved;
        relinked.confidence = EdgeConfidence::BestEffort;
        relinked.reason = format!(
            "unresolved call '{}': {}",
            payload_string(&payload, "callee_display_name"),
            resolution.reason_detail
        );
        relinked.payload_json = Some(merge_payload(
            payload,
            json!({
                "link_status": resolution.link_status,
                "link_reason": resolution.link_reason,
                "callee_symbol_id": Value::Null,
                "candidate_symbol_ids": resolution.candidate_symbol_ids,
            }),
        ));
        return relinked;
    };

    let mut relinked = edge.clone();
    relinked.to = NodeId::Symbol(target);
    relinked.resolution = EdgeResolution::Resolved;
    relinked.confidence = EdgeConfidence::Direct;
    relinked.reason = format!(
        "resolved call '{}'",
        payload_string(&payload, "callee_display_name")
    );
    relinked.payload_json = Some(merge_payload(
        payload,
        json!({
            "link_status": resolution.link_status,
            "link_reason": resolution.link_reason,
            "callee_symbol_id": target,
            "candidate_symbol_ids": resolution.candidate_symbol_ids,
        }),
    ));
    relinked
}

fn relink_reference_edge(
    snapshot: &WorkspaceSnapshot,
    source_scope: &SourceScope,
    source_file: &File,
    edge: &GraphEdge,
) -> GraphEdge {
    let Some(payload) = edge.payload_json.as_ref().and_then(parse_payload) else {
        return edge.clone();
    };
    let resolution = resolve_source_symbol(
        snapshot,
        source_scope,
        source_file,
        payload.get("target_name").and_then(Value::as_str),
        None,
        "target_symbol_not_found",
    );

    let Some(target) = resolution.target else {
        let mut relinked = edge.clone();
        relinked.resolution = EdgeResolution::Unresolved;
        relinked.confidence = EdgeConfidence::BestEffort;
        relinked.reason = format!(
            "unresolved reference '{}': {}",
            payload_string(&payload, "target_name"),
            resolution.reason_detail
        );
        relinked.payload_json = Some(merge_payload(
            payload,
            json!({
                "link_status": resolution.link_status,
                "link_reason": resolution.link_reason,
                "target_symbol_id": Value::Null,
                "candidate_symbol_ids": resolution.candidate_symbol_ids,
            }),
        ));
        return relinked;
    };

    let mut relinked = edge.clone();
    relinked.to = NodeId::Symbol(target);
    relinked.resolution = EdgeResolution::Resolved;
    relinked.confidence = EdgeConfidence::Direct;
    relinked.reason = format!(
        "resolved reference '{}'",
        payload_string(&payload, "target_name")
    );
    relinked.payload_json = Some(merge_payload(
        payload,
        json!({
            "link_status": resolution.link_status,
            "link_reason": resolution.link_reason,
            "target_symbol_id": target,
            "candidate_symbol_ids": resolution.candidate_symbol_ids,
        }),
    ));
    relinked
}

fn link_import(snapshot: &WorkspaceSnapshot, source_file: &File, import: &Import) -> GraphEdge {
    let parsed_resolution = import
        .resolution_error
        .as_deref()
        .and_then(ModuleResolution::from_resolution_error);
    let resolved_file_id = import.resolved_file_id.or_else(|| {
        parsed_resolution
            .as_ref()
            .and_then(|resolution| resolution.resolved_abs_path.as_deref())
            .and_then(|path| snapshot.file_id_for_abs_path(path))
            .or_else(|| {
                import
                    .resolution_error
                    .as_deref()
                    .and_then(extract_resolved_abs_path)
                    .and_then(|path| snapshot.file_id_for_abs_path(&path))
            })
    });
    let resolved_symbol_id = import.resolved_symbol_id.or_else(|| {
        resolved_file_id.and_then(|file_id| {
            import
                .imported_name
                .as_deref()
                .and_then(|name| unique_symbol_id(&snapshot.exported_symbols(file_id, name)))
        })
    });
    let resolved_file_id = resolved_file_id.or_else(|| {
        resolved_symbol_id.and_then(|symbol_id| {
            snapshot
                .symbol_for_id(symbol_id)
                .map(|symbol| symbol.file_id)
        })
    });

    let reason = parsed_resolution
        .as_ref()
        .map(|resolution| resolution.reason.as_str())
        .unwrap_or(if import.resolution_error.is_some() {
            "resolver_metadata_unparsed"
        } else {
            "missing_resolver_metadata"
        });
    let is_external = parsed_resolution
        .as_ref()
        .is_some_and(|resolution| resolution.status == ModuleResolutionStatus::External);
    let is_unresolved = resolved_file_id.is_none() && resolved_symbol_id.is_none();

    let payload = import_payload(
        source_file,
        import,
        parsed_resolution.as_ref(),
        resolved_file_id,
        resolved_symbol_id,
        if is_unresolved {
            "unresolved"
        } else {
            "linked"
        },
        if is_unresolved {
            if is_external {
                "external_dependency"
            } else {
                reason
            }
        } else if parsed_resolution
            .as_ref()
            .and_then(|resolution| resolution.resolved_abs_path.as_ref())
            .is_some()
        {
            "resolved_path_matched_indexed_file"
        } else {
            "prebound_import_id"
        },
    );

    GraphEdge {
        kind: if import.is_reexport {
            EdgeKind::ReExports
        } else {
            EdgeKind::Imports
        },
        from: NodeId::File(import.source_file_id),
        to: resolved_file_id
            .map(NodeId::File)
            .or_else(|| resolved_symbol_id.map(NodeId::Symbol))
            .unwrap_or(NodeId::File(import.source_file_id)),
        resolution: if is_unresolved {
            EdgeResolution::Unresolved
        } else {
            EdgeResolution::Resolved
        },
        confidence: if is_unresolved {
            EdgeConfidence::BestEffort
        } else {
            EdgeConfidence::Direct
        },
        span: Some(import.span),
        reason: if is_unresolved {
            format!("unresolved import '{}': {reason}", import.raw_specifier)
        } else {
            format!("resolved import '{}'", import.raw_specifier)
        },
        payload_json: Some(payload.to_string()),
    }
}

fn link_call(
    snapshot: &WorkspaceSnapshot,
    source_scope: &SourceScope,
    source_file: &File,
    call: &CallEdge,
) -> GraphEdge {
    let resolution = call
        .callee_symbol_id
        .map(SymbolResolution::prebound)
        .unwrap_or_else(|| {
            resolve_source_symbol(
                snapshot,
                source_scope,
                source_file,
                Some(&call.callee_display_name),
                call.callee_qualified_name.as_deref(),
                "callee_symbol_not_found",
            )
        });
    let target = resolution.target;

    let payload = json!({
        "kind": "call",
        "source_file_id": source_file.id,
        "caller_symbol_id": call.caller_symbol_id,
        "callee_symbol_id": target,
        "candidate_symbol_ids": resolution.candidate_symbol_ids,
        "callee_display_name": call.callee_display_name,
        "callee_qualified_name": call.callee_qualified_name,
        "call_kind": format!("{:?}", call.kind),
        "link_status": resolution.link_status,
        "link_reason": resolution.link_reason,
    });

    GraphEdge {
        kind: EdgeKind::Calls,
        from: call
            .caller_symbol_id
            .map(NodeId::Symbol)
            .unwrap_or(NodeId::File(call.source_file_id)),
        to: target
            .map(NodeId::Symbol)
            .unwrap_or(NodeId::File(call.source_file_id)),
        resolution: if target.is_some() {
            EdgeResolution::Resolved
        } else {
            EdgeResolution::Unresolved
        },
        confidence: if target.is_some() {
            EdgeConfidence::Direct
        } else {
            EdgeConfidence::BestEffort
        },
        span: Some(call.span),
        reason: if target.is_some() {
            format!("resolved call '{}'", call.callee_display_name)
        } else {
            format!(
                "unresolved call '{}': {}",
                call.callee_display_name, resolution.reason_detail
            )
        },
        payload_json: Some(payload.to_string()),
    }
}

fn link_reference(
    snapshot: &WorkspaceSnapshot,
    source_scope: &SourceScope,
    source_file: &File,
    reference: &Reference,
) -> GraphEdge {
    let resolution = reference
        .target_symbol_id
        .map(SymbolResolution::prebound)
        .unwrap_or_else(|| {
            resolve_source_symbol(
                snapshot,
                source_scope,
                source_file,
                Some(&reference.target_name),
                None,
                "target_symbol_not_found",
            )
        });
    let target = resolution.target;
    let payload = json!({
        "kind": "reference",
        "source_file_id": source_file.id,
        "source_symbol_id": reference.source_symbol_id,
        "target_symbol_id": target,
        "candidate_symbol_ids": resolution.candidate_symbol_ids,
        "target_name": reference.target_name,
        "reference_kind": format!("{:?}", reference.kind),
        "resolution_confidence": reference.resolution_confidence,
        "link_status": resolution.link_status,
        "link_reason": resolution.link_reason,
    });

    GraphEdge {
        kind: EdgeKind::References,
        from: reference
            .source_symbol_id
            .map(NodeId::Symbol)
            .unwrap_or(NodeId::File(reference.source_file_id)),
        to: target
            .map(NodeId::Symbol)
            .unwrap_or(NodeId::File(reference.source_file_id)),
        resolution: if target.is_some() {
            EdgeResolution::Resolved
        } else {
            EdgeResolution::Unresolved
        },
        confidence: if target.is_some() {
            EdgeConfidence::Direct
        } else {
            EdgeConfidence::BestEffort
        },
        span: Some(reference.span),
        reason: if target.is_some() {
            format!("resolved reference '{}'", reference.target_name)
        } else {
            format!(
                "unresolved reference '{}': {}",
                reference.target_name, resolution.reason_detail
            )
        },
        payload_json: Some(payload.to_string()),
    }
}

impl SourceScope {
    fn new(snapshot: &WorkspaceSnapshot, imports: &[Import]) -> Self {
        let mut scope = Self::default();
        for import in imports {
            let Some(target_file_id) = resolved_import_file_id(snapshot, import) else {
                continue;
            };
            scope.add_import(
                target_file_id,
                import.imported_name.clone(),
                import.local_name.clone(),
            );
        }
        scope
    }

    fn from_edges(snapshot: &WorkspaceSnapshot, edges: &[GraphEdge]) -> Self {
        let mut scope = Self::default();
        for edge in edges {
            if !matches!(edge.kind, EdgeKind::Imports | EdgeKind::ReExports) {
                continue;
            }
            let Some(payload) = edge.payload_json.as_ref().and_then(parse_payload) else {
                continue;
            };
            let Some(target_file_id) = target_file_id(edge, snapshot).or_else(|| {
                payload
                    .get("target_file_id")
                    .and_then(Value::as_i64)
                    .map(|id| id as FileId)
            }) else {
                continue;
            };
            scope.add_import(
                target_file_id,
                payload
                    .get("imported_name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                payload
                    .get("local_name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
            );
        }
        scope
    }

    fn add_import(
        &mut self,
        target_file_id: FileId,
        imported_name: Option<String>,
        local_name: Option<String>,
    ) {
        let Some(local_name) = local_name.filter(|name| !name.is_empty()) else {
            return;
        };

        if imported_name.as_deref() == Some("*") {
            self.namespace_imports_by_local_name
                .entry(local_name)
                .or_default()
                .push(target_file_id);
            return;
        }

        self.import_bindings_by_local_name
            .entry(local_name.clone())
            .or_default()
            .push(ImportBinding {
                target_file_id,
                imported_name,
                local_name,
            });
    }

    fn direct_imports(&self, local_name: &str) -> &[ImportBinding] {
        self.import_bindings_by_local_name
            .get(local_name)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    fn namespace_imports(&self, local_name: &str) -> &[FileId] {
        self.namespace_imports_by_local_name
            .get(local_name)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }
}

impl SymbolResolution {
    fn resolved(target: SymbolId, link_reason: &'static str) -> Self {
        Self {
            target: Some(target),
            link_status: "linked",
            link_reason,
            reason_detail: link_reason.to_string(),
            candidate_symbol_ids: vec![target],
        }
    }

    fn unresolved(
        link_reason: &'static str,
        reason_detail: String,
        candidates: Vec<SymbolId>,
    ) -> Self {
        Self {
            target: None,
            link_status: "unresolved",
            link_reason,
            reason_detail,
            candidate_symbol_ids: candidates,
        }
    }

    fn prebound(target: SymbolId) -> Self {
        Self::resolved(target, "prebound_symbol_id")
    }
}

fn resolved_import_file_id(snapshot: &WorkspaceSnapshot, import: &Import) -> Option<FileId> {
    import.resolved_file_id.or_else(|| {
        import
            .resolution_error
            .as_deref()
            .and_then(ModuleResolution::from_resolution_error)
            .and_then(|resolution| resolution.resolved_abs_path)
            .and_then(|path| snapshot.file_id_for_abs_path(&path))
            .or_else(|| {
                import
                    .resolution_error
                    .as_deref()
                    .and_then(extract_resolved_abs_path)
                    .and_then(|path| snapshot.file_id_for_abs_path(&path))
            })
    })
}

fn resolve_source_symbol(
    snapshot: &WorkspaceSnapshot,
    source_scope: &SourceScope,
    source_file: &File,
    display_name: Option<&str>,
    qualified_name: Option<&str>,
    missing_reason: &'static str,
) -> SymbolResolution {
    let Some(display_name) = display_name.filter(|name| !name.is_empty()) else {
        return SymbolResolution::unresolved(
            missing_reason,
            missing_reason.to_string(),
            Vec::new(),
        );
    };

    let local_candidates = snapshot.symbols_in_file(source_file.id, display_name);
    if let Some(target) = unique_symbol_id(&local_candidates) {
        return SymbolResolution::resolved(target, "source_file_local_symbol_matched");
    }
    if local_candidates.len() > 1 {
        return SymbolResolution::unresolved(
            "ambiguous_source_file_local_symbol",
            format!(
                "ambiguous_source_file_local_symbol: {} local candidates for '{display_name}'",
                local_candidates.len()
            ),
            local_candidates,
        );
    }

    let imported_candidates =
        imported_symbol_candidates(snapshot, source_scope, display_name, qualified_name);
    if let Some(target) = unique_symbol_id(&imported_candidates) {
        return SymbolResolution::resolved(target, "imported_symbol_matched");
    }
    if imported_candidates.len() > 1 {
        return SymbolResolution::unresolved(
            "ambiguous_imported_symbol",
            format!(
                "ambiguous_imported_symbol: {} imported candidates for '{display_name}'",
                imported_candidates.len()
            ),
            imported_candidates,
        );
    }

    let fallback_name = qualified_name
        .filter(|name| !name.is_empty())
        .unwrap_or(display_name);
    let global_candidates = unique_symbol_ids(
        snapshot
            .symbols_by_name(display_name)
            .into_iter()
            .chain(snapshot.symbols_by_name(fallback_name)),
    );
    if let Some(target) = unique_symbol_id(&global_candidates) {
        return SymbolResolution::resolved(target, "unique_workspace_symbol_matched");
    }
    if global_candidates.len() > 1 {
        return SymbolResolution::unresolved(
            "ambiguous_workspace_symbol",
            format!(
                "ambiguous_workspace_symbol: {} candidates for '{display_name}' remain after local/import scope lookup",
                global_candidates.len()
            ),
            global_candidates,
        );
    }

    SymbolResolution::unresolved(missing_reason, missing_reason.to_string(), Vec::new())
}

fn imported_symbol_candidates(
    snapshot: &WorkspaceSnapshot,
    source_scope: &SourceScope,
    display_name: &str,
    qualified_name: Option<&str>,
) -> Vec<SymbolId> {
    let mut candidates = Vec::new();

    for binding in source_scope.direct_imports(display_name) {
        let lookup_name = binding
            .imported_name
            .as_deref()
            .filter(|name| *name != "default")
            .unwrap_or(&binding.local_name);
        candidates.extend(snapshot.exported_symbols(binding.target_file_id, lookup_name));
        if binding.imported_name.as_deref() == Some("default") {
            candidates.extend(snapshot.exported_symbols(binding.target_file_id, "default"));
        }
    }

    if let Some((namespace, member)) = qualified_name.and_then(split_namespace_qualified_name) {
        for file_id in source_scope.namespace_imports(namespace) {
            candidates.extend(snapshot.exported_symbols(*file_id, member));
        }
    }

    unique_symbol_ids(candidates)
}

fn split_namespace_qualified_name(value: &str) -> Option<(&str, &str)> {
    let (namespace, member) = value.split_once('.')?;
    if namespace.is_empty() || member.is_empty() || member.contains('.') {
        return None;
    }
    Some((namespace, member))
}

fn unique_symbol_id(candidates: &[SymbolId]) -> Option<SymbolId> {
    match candidates {
        [candidate] => Some(*candidate),
        _ => None,
    }
}

fn unique_symbol_ids<I>(ids: I) -> Vec<SymbolId>
where
    I: IntoIterator<Item = SymbolId>,
{
    let mut unique = Vec::new();
    for id in ids {
        if !unique.contains(&id) {
            unique.push(id);
        }
    }
    unique
}

#[cfg(test)]
mod tests {
    use super::unique_symbol_id;

    #[test]
    fn linker_unique_symbol_id_returns_none_for_empty_candidates() {
        assert_eq!(unique_symbol_id(&[]), None);
    }

    #[test]
    fn linker_unique_symbol_id_returns_single_candidate() {
        assert_eq!(unique_symbol_id(&[42]), Some(42));
    }

    #[test]
    fn linker_unique_symbol_id_preserves_ambiguity_for_multiple_candidates() {
        assert_eq!(unique_symbol_id(&[41, 42]), None);
    }
}

fn register_import(
    report: &mut LinkReport,
    edge: &GraphEdge,
    source_file: &File,
    snapshot: &WorkspaceSnapshot,
) {
    let target_file = target_file_id(edge, snapshot);
    let cross_root = payload_root_diff(edge).unwrap_or(false)
        || target_file
            .and_then(|file_id| snapshot.file_for_id(file_id))
            .is_some_and(|target| target.root_id != source_file.root_id);

    if edge.resolution == EdgeResolution::Resolved {
        report.linked_imports = report.linked_imports.saturating_add(1);
        if cross_root {
            report.linked_cross_root_imports = report.linked_cross_root_imports.saturating_add(1);
        }
    } else {
        report.unresolved_imports = report.unresolved_imports.saturating_add(1);
        if cross_root_hint(edge, snapshot, source_file) {
            report.unresolved_cross_root_imports =
                report.unresolved_cross_root_imports.saturating_add(1);
        }
    }
}

fn register_call(
    report: &mut LinkReport,
    edge: &GraphEdge,
    source_file: &File,
    snapshot: &WorkspaceSnapshot,
) {
    if edge.resolution == EdgeResolution::Resolved {
        report.linked_calls = report.linked_calls.saturating_add(1);
        if target_file_id(edge, snapshot)
            .and_then(|file_id| snapshot.file_for_id(file_id))
            .is_some_and(|target| target.root_id != source_file.root_id)
        {
            report.linked_cross_root_calls = report.linked_cross_root_calls.saturating_add(1);
        }
    } else {
        report.unresolved_calls = report.unresolved_calls.saturating_add(1);
    }
}

fn register_reference(report: &mut LinkReport, edge: &GraphEdge) {
    if edge.resolution == EdgeResolution::Resolved {
        report.linked_references = report.linked_references.saturating_add(1);
    } else {
        report.unresolved_references = report.unresolved_references.saturating_add(1);
    }
}

impl LinkReport {
    pub fn accumulate(&mut self, other: LinkReport) {
        self.linked_imports = self.linked_imports.saturating_add(other.linked_imports);
        self.linked_cross_root_imports = self
            .linked_cross_root_imports
            .saturating_add(other.linked_cross_root_imports);
        self.linked_calls = self.linked_calls.saturating_add(other.linked_calls);
        self.linked_cross_root_calls = self
            .linked_cross_root_calls
            .saturating_add(other.linked_cross_root_calls);
        self.linked_references = self
            .linked_references
            .saturating_add(other.linked_references);
        self.unresolved_imports = self
            .unresolved_imports
            .saturating_add(other.unresolved_imports);
        self.unresolved_cross_root_imports = self
            .unresolved_cross_root_imports
            .saturating_add(other.unresolved_cross_root_imports);
        self.unresolved_calls = self.unresolved_calls.saturating_add(other.unresolved_calls);
        self.unresolved_references = self
            .unresolved_references
            .saturating_add(other.unresolved_references);
        self.link_ms = self.link_ms.saturating_add(other.link_ms);
    }
}

fn target_file_id(edge: &GraphEdge, snapshot: &WorkspaceSnapshot) -> Option<FileId> {
    match &edge.to {
        NodeId::File(id) => Some(*id),
        NodeId::Symbol(id) => snapshot.symbol_for_id(*id).map(|symbol| symbol.file_id),
        NodeId::Chunk(_) => None,
    }
}

fn cross_root_hint(edge: &GraphEdge, snapshot: &WorkspaceSnapshot, source_file: &File) -> bool {
    payload_root_diff(edge).unwrap_or(false)
        || target_file_id(edge, snapshot)
            .and_then(|file_id| snapshot.file_for_id(file_id))
            .is_some_and(|file| file.root_id != source_file.root_id)
}

fn payload_root_diff(edge: &GraphEdge) -> Option<bool> {
    let payload = edge.payload_json.as_ref().and_then(parse_payload)?;
    let source_root = payload.get("source_root").and_then(Value::as_str)?;
    let target_root = payload.get("target_root").and_then(Value::as_str)?;
    Some(normalize_path(Path::new(source_root)) != normalize_path(Path::new(target_root)))
}

fn import_payload(
    source_file: &File,
    import: &Import,
    resolution: Option<&ModuleResolution>,
    target_file_id: Option<FileId>,
    target_symbol_id: Option<SymbolId>,
    link_status: &str,
    link_reason: &str,
) -> Value {
    let (status, reason, kind, resolved_abs_path, source_root, target_root, confidence) =
        if let Some(resolution) = resolution {
            (
                resolution.status.as_str().to_string(),
                resolution.reason.as_str().to_string(),
                resolution
                    .resolution_kind
                    .map(|kind| kind.as_str().to_string()),
                resolution
                    .resolved_abs_path
                    .as_ref()
                    .map(|path| path.display().to_string()),
                resolution
                    .source_root
                    .as_ref()
                    .map(|path| path.display().to_string()),
                resolution
                    .target_root
                    .as_ref()
                    .map(|path| path.display().to_string()),
                Some(resolution.confidence),
            )
        } else {
            (
                if target_file_id.is_some() || target_symbol_id.is_some() {
                    "resolved".to_string()
                } else {
                    "unresolved".to_string()
                },
                import
                    .resolution_error
                    .clone()
                    .unwrap_or_else(|| "missing_resolver_metadata".to_string()),
                None,
                None,
                None,
                None,
                None,
            )
        };

    json!({
        "kind": "import",
        "source_file_id": source_file.id,
        "specifier": import.raw_specifier,
        "imported_name": import.imported_name,
        "local_name": import.local_name,
        "alias": import.alias,
        "is_type_only": import.is_type_only,
        "is_reexport": import.is_reexport,
        "resolver_status": status,
        "resolver_reason": reason,
        "resolution_kind": kind,
        "resolved_abs_path": resolved_abs_path,
        "source_root": source_root,
        "target_root": target_root,
        "resolver_confidence": confidence,
        "target_file_id": target_file_id,
        "target_symbol_id": target_symbol_id,
        "link_status": link_status,
        "link_reason": link_reason,
    })
}

fn parse_payload(value: &String) -> Option<Value> {
    serde_json::from_str(value).ok()
}

fn merge_payload(mut original: Value, additions: Value) -> String {
    if let (Some(original), Some(additions)) = (original.as_object_mut(), additions.as_object()) {
        for (key, value) in additions {
            original.insert(key.clone(), value.clone());
        }
    }
    original.to_string()
}

fn payload_string(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn extract_resolved_abs_path(value: &str) -> Option<PathBuf> {
    value.split("; ").find_map(|part| {
        part.trim()
            .strip_prefix("resolved_abs_path=")
            .map(PathBuf::from)
    })
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize()
        .unwrap_or_else(|_| normalize_path_lexically(path))
}

fn normalize_path_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    let absolute = path.is_absolute();
    for component in path.components() {
        match component {
            std::path::Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            std::path::Component::RootDir => normalized.push(component.as_os_str()),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if !normalized.pop() && !absolute {
                    normalized.push("..");
                }
            }
            std::path::Component::Normal(value) => normalized.push(value),
        }
    }
    if normalized.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        normalized
    }
}
