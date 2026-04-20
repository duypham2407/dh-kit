//! Go tree-sitter adapter (bounded structural support).

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

const GO_EXTENSIONS: &[&str] = &["go"];

#[derive(Debug, Clone, Default)]
pub struct GoAdapter;

impl GoAdapter {
    fn parse_symbol_nodes(
        &self,
        node: Node<'_>,
        ctx: &ExtractionContext<'_>,
        source: &str,
        containers: &mut Vec<(i64, String)>,
        out: &mut Vec<Symbol>,
    ) {
        match node.kind() {
            "function_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    out.push(build_symbol(
                        ctx,
                        node,
                        SymbolKind::Function,
                        &name,
                        containers,
                        Some(first_line(&node_text(node, source), 220)),
                        Some("go function".into()),
                    ));
                    return;
                }
            }
            "method_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    out.push(build_symbol(
                        ctx,
                        node,
                        SymbolKind::Method,
                        &name,
                        containers,
                        Some(first_line(&node_text(node, source), 220)),
                        Some("go method".into()),
                    ));
                    return;
                }
            }
            "type_declaration" => {
                for spec in node.named_children(&mut node.walk()) {
                    if spec.kind() != "type_spec" {
                        continue;
                    }
                    if let Some(name_node) = spec.child_by_field_name("name") {
                        let name = node_text(name_node, source);
                        let type_kind = spec
                            .child_by_field_name("type")
                            .map(|n| n.kind().to_string())
                            .unwrap_or_default();
                        let kind = if type_kind.contains("struct") {
                            SymbolKind::Struct
                        } else if type_kind.contains("interface") {
                            SymbolKind::Interface
                        } else {
                            SymbolKind::TypeAlias
                        };
                        out.push(build_symbol(
                            ctx,
                            spec,
                            kind,
                            &name,
                            containers,
                            Some(first_line(&node_text(spec, source), 220)),
                            Some("go type".into()),
                        ));
                    }
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

impl LanguageAdapter for GoAdapter {
    fn language_id(&self) -> LanguageId {
        LanguageId::Go
    }

    fn display_name(&self) -> &'static str {
        "Go"
    }

    fn file_extensions(&self) -> &'static [&'static str] {
        GO_EXTENSIONS
    }

    fn grammar(&self) -> tree_sitter::Language {
        tree_sitter_go::LANGUAGE.into()
    }

    fn matches_path(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("go"))
            .unwrap_or(false)
    }

    fn detect_from_shebang(&self, shebang: &str) -> bool {
        shebang.to_lowercase().contains("go")
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
                "import_spec" => {
                    let span = span_from_node(node);
                    let path_node = node.child_by_field_name("path").or_else(|| {
                        node.named_children(&mut node.walk())
                            .find(|child| child.kind() == "interpreted_string_literal")
                    });
                    let Some(path_node) = path_node else { continue };

                    let raw = node_text(path_node, ctx.source)
                        .trim_matches('"')
                        .trim_matches('`')
                        .to_string();
                    if raw.is_empty() {
                        continue;
                    }

                    let local_name = node
                        .child_by_field_name("name")
                        .map(|name| node_text(name, ctx.source))
                        .filter(|name| !name.trim().is_empty());

                    imports.push(Import {
                        id: stable_id(&format!(
                            "go-import|{}|{}|{}|{}",
                            ctx.rel_path, raw, span.start_byte, span.end_byte
                        )),
                        workspace_id: ctx.workspace_id,
                        source_file_id: ctx.file_id,
                        source_symbol_id: None,
                        raw_specifier: raw,
                        imported_name: None,
                        local_name,
                        alias: None,
                        kind: ImportKind::EsmNamed,
                        is_type_only: false,
                        is_reexport: false,
                        resolved_file_id: None,
                        resolved_symbol_id: None,
                        span,
                        resolution_error: Some(
                            "go import resolution is bounded and may remain unresolved across packages".into(),
                        ),
                    });
                }
                _ => {}
            }
        }

        imports.sort_by(|a, b| {
            (a.span.start_byte, a.span.end_byte, a.raw_specifier.as_str()).cmp(&(
                b.span.start_byte,
                b.span.end_byte,
                b.raw_specifier.as_str(),
            ))
        });

        imports
    }

    fn extract_exports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<ExportFact> {
        let mut exports = Vec::new();
        for symbol in self.extract_symbols(ctx, tree).iter() {
            if is_exported_go_name(&symbol.name) {
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
            if node.kind() != "call_expression" {
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
                    "go-call|{}|{}|{}|{}",
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
            if node.kind() != "identifier" && node.kind() != "field_identifier" {
                continue;
            }
            let target_name = node_text(node, ctx.source);
            if target_name.trim().is_empty() {
                continue;
            }
            let span = span_from_node(node);
            references.push(Reference {
                id: stable_id(&format!(
                    "go-ref|{}|{}|{}|{}",
                    ctx.rel_path, target_name, span.start_byte, span.end_byte
                )),
                workspace_id: ctx.workspace_id,
                source_file_id: ctx.file_id,
                source_symbol_id: super::common::find_enclosing_symbol(symbols, span.start_byte),
                target_symbol_id: None,
                target_name,
                kind: ReferenceKind::Read,
                resolved: false,
                resolution_confidence: 0.55,
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
                        "go import resolution is bounded and may remain unresolved across packages"
                            .into(),
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
    let exported = is_exported_go_name(name);
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
        id: stable_id(&format!("go-symbol|{}", symbol_hash_material)),
        workspace_id: ctx.workspace_id,
        file_id: ctx.file_id,
        parent_symbol_id,
        kind,
        name: name.to_string(),
        qualified_name,
        signature,
        detail,
        visibility: if exported {
            Visibility::Public
        } else {
            Visibility::Internal
        },
        exported,
        async_flag: false,
        static_flag: false,
        span,
        symbol_hash: super::common::blake3_hex(&symbol_hash_material),
    }
}

fn is_exported_go_name(name: &str) -> bool {
    name.chars()
        .next()
        .map(|ch| ch.is_ascii_uppercase())
        .unwrap_or(false)
}
