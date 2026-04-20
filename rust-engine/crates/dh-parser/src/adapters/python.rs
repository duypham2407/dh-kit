//! Python tree-sitter adapter (bounded structural support).

use super::common::{
    build_basic_chunks, collect_syntax_diagnostics, first_line, node_text, public_api_fingerprint,
    span_from_node, stable_id, structure_fingerprint, walk_named_nodes,
};
use crate::{ExtractionContext, LanguageAdapter, ParseOutput, TypeRelation, UnresolvedImport};
use anyhow::{anyhow, Result};
use dh_types::{
    CallEdge, CallKind, Chunk, ExportFact, Import, ImportKind, LanguageId, ParseDiagnostic,
    Reference, ReferenceKind, Symbol, SymbolKind, Visibility,
};
use std::path::Path;
use tree_sitter::{Node, Parser, Tree};

const PY_EXTENSIONS: &[&str] = &["py"];

#[derive(Debug, Clone, Default)]
pub struct PythonAdapter;

impl PythonAdapter {
    fn parse_symbol_nodes(
        &self,
        node: Node<'_>,
        ctx: &ExtractionContext<'_>,
        source: &str,
        containers: &mut Vec<(i64, String)>,
        out: &mut Vec<Symbol>,
    ) {
        match node.kind() {
            "class_definition" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    let symbol = build_symbol(
                        ctx,
                        node,
                        SymbolKind::Class,
                        &name,
                        containers,
                        Some(first_line(&node_text(node, source), 220)),
                        Some("python class".into()),
                    );
                    let container = (symbol.id, symbol.qualified_name.clone());
                    out.push(symbol);
                    containers.push(container);
                    self.visit_named_children(node, ctx, source, containers, out);
                    containers.pop();
                    return;
                }
            }
            "function_definition" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    let mut symbol = build_symbol(
                        ctx,
                        node,
                        SymbolKind::Function,
                        &name,
                        containers,
                        Some(first_line(&node_text(node, source), 220)),
                        Some("python function".into()),
                    );
                    symbol.async_flag = false;
                    out.push(symbol);
                    return;
                }
            }
            "decorated_definition" => {
                if let Some(definition) = node.named_children(&mut node.walk()).find(|child| {
                    child.kind() == "function_definition" || child.kind() == "class_definition"
                }) {
                    self.parse_symbol_nodes(definition, ctx, source, containers, out);
                    return;
                }
            }
            _ => {}
        }

        self.visit_named_children(node, ctx, source, containers, out);
    }

    fn visit_named_children(
        &self,
        node: Node<'_>,
        ctx: &ExtractionContext<'_>,
        source: &str,
        containers: &mut Vec<(i64, String)>,
        out: &mut Vec<Symbol>,
    ) {
        let count = node.named_child_count();
        for idx in 0..count {
            if let Some(child) = node.named_child(idx) {
                self.parse_symbol_nodes(child, ctx, source, containers, out);
            }
        }
    }
}

impl LanguageAdapter for PythonAdapter {
    fn language_id(&self) -> LanguageId {
        LanguageId::Python
    }

    fn display_name(&self) -> &'static str {
        "Python"
    }

    fn file_extensions(&self) -> &'static [&'static str] {
        PY_EXTENSIONS
    }

    fn grammar(&self) -> tree_sitter::Language {
        tree_sitter_python::LANGUAGE.into()
    }

    fn matches_path(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("py"))
            .unwrap_or(false)
    }

    fn detect_from_shebang(&self, shebang: &str) -> bool {
        let s = shebang.to_lowercase();
        s.contains("python") || s.contains("pypy")
    }

    fn parse(
        &self,
        parser: &mut Parser,
        source: &str,
        old_tree: Option<&Tree>,
    ) -> Result<ParseOutput> {
        parser.set_language(&self.grammar()).map_err(|err| {
            anyhow!(
                "failed to set parser language {:?}: {err}",
                self.language_id()
            )
        })?;

        let tree = parser
            .parse(source, old_tree)
            .ok_or_else(|| anyhow!("tree-sitter parser returned no tree"))?;

        Ok(ParseOutput {
            has_errors: tree.root_node().has_error(),
            tree,
            language: self.language_id(),
        })
    }

    fn collect_diagnostics(&self, source: &str, tree: &Tree) -> Vec<ParseDiagnostic> {
        collect_syntax_diagnostics(source, tree)
    }

    fn extract_symbols(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Symbol> {
        let mut symbols = Vec::new();
        self.parse_symbol_nodes(
            tree.root_node(),
            ctx,
            ctx.source,
            &mut Vec::new(),
            &mut symbols,
        );
        symbols.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                a.qualified_name.as_str(),
                format!("{:?}", a.kind),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    b.qualified_name.as_str(),
                    format!("{:?}", b.kind),
                ))
        });
        symbols
    }

    fn extract_imports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Import> {
        let mut imports = Vec::new();
        for node in walk_named_nodes(tree.root_node()) {
            match node.kind() {
                "import_statement" => {
                    let text = node_text(node, ctx.source);
                    let span = span_from_node(node);
                    for token in text.trim().trim_start_matches("import ").split(',') {
                        let token = token.trim();
                        if token.is_empty() {
                            continue;
                        }
                        let (raw_specifier, local_name, alias) =
                            if let Some((left, right)) = token.split_once(" as ") {
                                (
                                    left.trim().to_string(),
                                    Some(right.trim().to_string()),
                                    Some(right.trim().to_string()),
                                )
                            } else {
                                (token.to_string(), Some(token.to_string()), None)
                            };

                        imports.push(Import {
                            id: stable_id(&format!(
                                "py-import|{}|{}|{}|{}",
                                ctx.rel_path, raw_specifier, span.start_byte, span.end_byte
                            )),
                            workspace_id: ctx.workspace_id,
                            source_file_id: ctx.file_id,
                            source_symbol_id: None,
                            raw_specifier,
                            imported_name: None,
                            local_name,
                            alias,
                            kind: ImportKind::EsmNamed,
                            is_type_only: false,
                            is_reexport: false,
                            resolved_file_id: None,
                            resolved_symbol_id: None,
                            span,
                            resolution_error: Some(
                                "python import resolution is bounded and may remain unresolved"
                                    .into(),
                            ),
                        });
                    }
                }
                "import_from_statement" => {
                    let text = node_text(node, ctx.source);
                    let span = span_from_node(node);
                    let (raw_specifier, imported_clause) =
                        if let Some((_, rest)) = text.split_once("from ") {
                            if let Some((specifier, imported)) = rest.split_once(" import ") {
                                (specifier.trim().to_string(), imported.trim().to_string())
                            } else {
                                (String::new(), String::new())
                            }
                        } else {
                            (String::new(), String::new())
                        };

                    if raw_specifier.is_empty() {
                        continue;
                    }

                    for token in imported_clause.split(',') {
                        let token = token.trim();
                        if token.is_empty() {
                            continue;
                        }
                        let is_star = token == "*";
                        let (imported_name, local_name, alias) =
                            if let Some((left, right)) = token.split_once(" as ") {
                                (
                                    Some(left.trim().to_string()),
                                    Some(right.trim().to_string()),
                                    Some(right.trim().to_string()),
                                )
                            } else if is_star {
                                (Some("*".into()), Some("*".into()), None)
                            } else {
                                (Some(token.to_string()), Some(token.to_string()), None)
                            };

                        imports.push(Import {
                            id: stable_id(&format!(
                                "py-from-import|{}|{}|{}|{}|{}",
                                ctx.rel_path,
                                raw_specifier,
                                imported_name.clone().unwrap_or_default(),
                                span.start_byte,
                                span.end_byte
                            )),
                            workspace_id: ctx.workspace_id,
                            source_file_id: ctx.file_id,
                            source_symbol_id: None,
                            raw_specifier: raw_specifier.clone(),
                            imported_name,
                            local_name,
                            alias,
                            kind: ImportKind::EsmNamed,
                            is_type_only: false,
                            is_reexport: false,
                            resolved_file_id: None,
                            resolved_symbol_id: None,
                            span,
                            resolution_error: if is_star {
                                Some("star import is bounded and not fully resolved".into())
                            } else {
                                Some(
                                    "python import resolution is bounded and may remain unresolved"
                                        .into(),
                                )
                            },
                        });
                    }
                }
                _ => {}
            }
        }

        imports.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                a.raw_specifier.as_str(),
                a.imported_name.as_deref().unwrap_or(""),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    b.raw_specifier.as_str(),
                    b.imported_name.as_deref().unwrap_or(""),
                ))
        });

        imports
    }

    fn extract_exports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<ExportFact> {
        let mut exports = Vec::new();
        for symbol in self.extract_symbols(ctx, tree).iter() {
            if symbol.parent_symbol_id.is_none() {
                exports.push(ExportFact {
                    source_file_id: ctx.file_id,
                    source_symbol_id: Some(symbol.id),
                    exported_name: symbol.name.clone(),
                    local_name: Some(symbol.name.clone()),
                    raw_specifier: None,
                    is_default: false,
                    is_star: false,
                    is_type_only: false,
                    span: symbol.span,
                });
            }
        }
        exports
    }

    fn extract_call_edges(
        &self,
        ctx: &ExtractionContext<'_>,
        tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<CallEdge> {
        let mut edges = Vec::new();
        for node in walk_named_nodes(tree.root_node()) {
            if node.kind() != "call" {
                continue;
            }
            let function = node
                .child_by_field_name("function")
                .or_else(|| node.named_child(0));
            let Some(function) = function else { continue };
            let callee_text = node_text(function, ctx.source);
            if callee_text.trim().is_empty() {
                continue;
            }

            let span = span_from_node(node);
            edges.push(CallEdge {
                id: stable_id(&format!(
                    "py-call|{}|{}|{}|{}",
                    ctx.rel_path, callee_text, span.start_byte, span.end_byte
                )),
                workspace_id: ctx.workspace_id,
                source_file_id: ctx.file_id,
                caller_symbol_id: super::common::find_enclosing_symbol(symbols, span.start_byte),
                callee_symbol_id: None,
                callee_qualified_name: Some(callee_text.clone()),
                callee_display_name: callee_text.clone(),
                kind: if callee_text.contains('.') {
                    CallKind::Method
                } else {
                    CallKind::Direct
                },
                resolved: false,
                span,
            });
        }

        edges.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                a.callee_display_name.as_str(),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    b.callee_display_name.as_str(),
                ))
        });

        edges
    }

    fn extract_references(
        &self,
        ctx: &ExtractionContext<'_>,
        tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<Reference> {
        let mut references = Vec::new();
        for node in walk_named_nodes(tree.root_node()) {
            if node.kind() != "identifier" && node.kind() != "attribute" {
                continue;
            }

            let target_name = if node.kind() == "attribute" {
                node.child_by_field_name("attribute")
                    .map(|attr| node_text(attr, ctx.source))
                    .unwrap_or_else(|| node_text(node, ctx.source))
            } else {
                node_text(node, ctx.source)
            };

            if target_name.trim().is_empty() {
                continue;
            }

            let span = span_from_node(node);
            references.push(Reference {
                id: stable_id(&format!(
                    "py-ref|{}|{}|{}|{}",
                    ctx.rel_path, target_name, span.start_byte, span.end_byte
                )),
                workspace_id: ctx.workspace_id,
                source_file_id: ctx.file_id,
                source_symbol_id: super::common::find_enclosing_symbol(symbols, span.start_byte),
                target_symbol_id: None,
                target_name,
                kind: ReferenceKind::Read,
                resolved: false,
                resolution_confidence: 0.5,
                span,
            });
        }

        references.sort_by(|a, b| {
            (a.span.start_byte, a.span.end_byte, a.target_name.as_str()).cmp(&(
                b.span.start_byte,
                b.span.end_byte,
                b.target_name.as_str(),
            ))
        });

        references
    }

    fn extract_inheritance(
        &self,
        _ctx: &ExtractionContext<'_>,
        _tree: &Tree,
        _symbols: &[Symbol],
    ) -> Vec<TypeRelation> {
        Vec::new()
    }

    fn extract_chunks(
        &self,
        ctx: &ExtractionContext<'_>,
        _tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<Chunk> {
        build_basic_chunks(ctx, self.language_id(), symbols)
    }

    fn resolve_imports(
        &self,
        _ctx: &ExtractionContext<'_>,
        imports: &mut [Import],
        _symbols: &[Symbol],
    ) -> Vec<UnresolvedImport> {
        let mut unresolved = Vec::new();
        for import in imports {
            if import.resolved_file_id.is_none() && import.resolved_symbol_id.is_none() {
                if import.resolution_error.is_none() {
                    import.resolution_error = Some(
                        "python import resolution is bounded and may remain unresolved".into(),
                    );
                }
                unresolved.push(UnresolvedImport);
            }
        }
        unresolved
    }

    fn bind_references(
        &self,
        _ctx: &ExtractionContext<'_>,
        _references: &mut [Reference],
        _symbols: &[Symbol],
        _import_map: &[Import],
    ) {
        // bounded syntax-first support only
    }

    fn bind_call_edges(
        &self,
        _ctx: &ExtractionContext<'_>,
        _calls: &mut [CallEdge],
        _symbols: &[Symbol],
        _import_map: &[Import],
    ) {
        // bounded syntax-first support only
    }

    fn structure_fingerprint(
        &self,
        symbols: &[Symbol],
        imports: &[Import],
        exports: &[ExportFact],
    ) -> String {
        structure_fingerprint(symbols, imports, exports)
    }

    fn public_api_fingerprint(&self, symbols: &[Symbol], exports: &[ExportFact]) -> String {
        public_api_fingerprint(symbols, exports)
    }
}

fn build_symbol(
    ctx: &ExtractionContext<'_>,
    node: Node<'_>,
    kind: SymbolKind,
    name: &str,
    containers: &[(i64, String)],
    signature: Option<String>,
    detail: Option<String>,
) -> Symbol {
    let span = span_from_node(node);
    let qualified_name = if let Some((_, parent_qname)) = containers.last() {
        format!("{}.{}", parent_qname, name)
    } else {
        name.to_string()
    };
    let parent_symbol_id = containers.last().map(|(id, _)| *id);
    let symbol_hash_material = format!(
        "{}|{}|{:?}|{}|{}|{}",
        ctx.rel_path,
        qualified_name,
        kind,
        span.start_byte,
        span.end_byte,
        signature.as_deref().unwrap_or("")
    );

    Symbol {
        id: stable_id(&format!("py-symbol|{}", symbol_hash_material)),
        workspace_id: ctx.workspace_id,
        file_id: ctx.file_id,
        parent_symbol_id,
        kind,
        name: name.to_string(),
        qualified_name,
        signature,
        detail,
        visibility: Visibility::Public,
        exported: parent_symbol_id.is_none(),
        async_flag: false,
        static_flag: false,
        span,
        symbol_hash: super::common::blake3_hex(&symbol_hash_material),
    }
}
