//! TypeScript / JavaScript tree-sitter adapter.
//!
//! Slice 2B scope: syntax-first extraction for TS/TSX/JS/JSX with
//! deterministic normalized facts.

use crate::{
    module_resolver::{ModuleResolutionStatus, ModuleResolver},
    ExtractionContext, LanguageAdapter, ParseOutput, TypeRelation, UnresolvedImport,
};
use anyhow::{anyhow, Result};
use dh_types::{
    CallEdge, CallKind, Chunk, ChunkKind, EmbeddingStatus, ExportFact, Import, ImportKind,
    LanguageId, ParseDiagnostic, Reference, ReferenceKind, Span, Symbol, SymbolKind, Visibility,
};
use std::path::Path;
use tree_sitter::{Node, Parser, Tree};

const TS_EXTENSIONS: &[&str] = &["ts", "mts", "cts", "d.ts"];
const TSX_EXTENSIONS: &[&str] = &["tsx"];
const JS_EXTENSIONS: &[&str] = &["js", "mjs", "cjs"];
const JSX_EXTENSIONS: &[&str] = &["jsx"];

#[derive(Debug, Clone)]
struct Container {
    id: i64,
    qname: String,
}

/// TS/JS adapter for tree-sitter extraction.
#[derive(Debug, Clone, Copy)]
pub struct TypeScriptAdapter {
    language: LanguageId,
}

impl Default for TypeScriptAdapter {
    fn default() -> Self {
        Self {
            language: LanguageId::TypeScript,
        }
    }
}

impl TypeScriptAdapter {
    #[must_use]
    pub fn for_language(language: LanguageId) -> Self {
        let language = match language {
            LanguageId::TypeScript | LanguageId::Tsx | LanguageId::JavaScript | LanguageId::Jsx => {
                language
            }
            _ => LanguageId::TypeScript,
        };
        Self { language }
    }

    fn parse_symbol_nodes(
        &self,
        node: Node<'_>,
        ctx: &ExtractionContext<'_>,
        source: &str,
        containers: &mut Vec<Container>,
        out: &mut Vec<Symbol>,
    ) {
        match node.kind() {
            "class_declaration" => {
                if let Some(name) = declaration_name(node, source) {
                    let symbol = build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::Class,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    );
                    let container = Container {
                        id: symbol.id,
                        qname: symbol.qualified_name.clone(),
                    };
                    out.push(symbol);
                    containers.push(container);
                    self.visit_named_children(node, ctx, source, containers, out);
                    containers.pop();
                    return;
                }
            }
            "method_definition" => {
                if let Some(name) = declaration_name(node, source) {
                    let mut symbol = build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::Method,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    );
                    symbol.static_flag = has_token_child(node, source, "static");
                    symbol.visibility = visibility_for_node(node, source, symbol.exported);

                    let container = Container {
                        id: symbol.id,
                        qname: symbol.qualified_name.clone(),
                    };
                    out.push(symbol);
                    containers.push(container);
                    self.visit_named_children(node, ctx, source, containers, out);
                    containers.pop();
                    return;
                }
            }
            "function_declaration" | "generator_function_declaration" => {
                if let Some(name) = declaration_name(node, source) {
                    let mut symbol = build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::Function,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    );
                    symbol.async_flag = has_token_child(node, source, "async");

                    let container = Container {
                        id: symbol.id,
                        qname: symbol.qualified_name.clone(),
                    };
                    out.push(symbol);
                    containers.push(container);
                    self.visit_named_children(node, ctx, source, containers, out);
                    containers.pop();
                    return;
                }
            }
            "interface_declaration" => {
                if let Some(name) = declaration_name(node, source) {
                    out.push(build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::Interface,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    ));
                }
            }
            "type_alias_declaration" => {
                if let Some(name) = declaration_name(node, source) {
                    out.push(build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::TypeAlias,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    ));
                }
            }
            "enum_declaration" => {
                if let Some(name) = declaration_name(node, source) {
                    out.push(build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::Enum,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    ));
                }
            }
            "public_field_definition" => {
                if let Some(name) = declaration_name(node, source) {
                    let mut symbol = build_symbol(
                        ctx,
                        source,
                        node,
                        SymbolKind::Field,
                        &name,
                        containers,
                        declaration_exported(node),
                        symbol_signature(node, source),
                        None,
                    );
                    symbol.visibility = visibility_for_node(node, source, symbol.exported);
                    out.push(symbol);
                }
            }
            "variable_declarator" => {
                if let Some(name) = declaration_name(node, source) {
                    let is_const = node
                        .parent()
                        .map(|parent| {
                            if parent.kind() == "lexical_declaration" {
                                node_text(parent, source).trim_start().starts_with("const ")
                            } else {
                                false
                            }
                        })
                        .unwrap_or(false);

                    let initializer = node.child_by_field_name("value");
                    let mut signature = symbol_signature(node, source);
                    let mut async_flag = false;
                    if let Some(init) = initializer {
                        let init_kind = init.kind();
                        if matches!(
                            init_kind,
                            "arrow_function"
                                | "function"
                                | "function_expression"
                                | "generator_function"
                        ) {
                            signature = Some(format!(
                                "{} = {}",
                                name,
                                first_line(&node_text(init, source), 180)
                            ));
                            async_flag = has_token_child(init, source, "async");
                        }
                    }

                    let mut symbol = build_symbol(
                        ctx,
                        source,
                        node,
                        if is_const {
                            SymbolKind::Constant
                        } else {
                            SymbolKind::Variable
                        },
                        &name,
                        containers,
                        declaration_exported(node),
                        signature,
                        None,
                    );
                    symbol.async_flag = async_flag;
                    out.push(symbol);
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
        containers: &mut Vec<Container>,
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

impl LanguageAdapter for TypeScriptAdapter {
    fn language_id(&self) -> LanguageId {
        self.language
    }

    fn display_name(&self) -> &'static str {
        match self.language {
            LanguageId::TypeScript => "TypeScript",
            LanguageId::Tsx => "TSX",
            LanguageId::JavaScript => "JavaScript",
            LanguageId::Jsx => "JSX",
            _ => "TypeScript",
        }
    }

    fn file_extensions(&self) -> &'static [&'static str] {
        match self.language {
            LanguageId::TypeScript => TS_EXTENSIONS,
            LanguageId::Tsx => TSX_EXTENSIONS,
            LanguageId::JavaScript => JS_EXTENSIONS,
            LanguageId::Jsx => JSX_EXTENSIONS,
            _ => TS_EXTENSIONS,
        }
    }

    fn grammar(&self) -> tree_sitter::Language {
        match self.language {
            LanguageId::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            LanguageId::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            LanguageId::JavaScript | LanguageId::Jsx => tree_sitter_javascript::LANGUAGE.into(),
            _ => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        }
    }

    fn matches_path(&self, path: &Path) -> bool {
        let ext = match path.extension().and_then(|ext| ext.to_str()) {
            Some(ext) => ext,
            None => return false,
        };

        match self.language {
            LanguageId::TypeScript => matches!(ext, "ts" | "mts" | "cts"),
            LanguageId::Tsx => ext == "tsx",
            LanguageId::JavaScript => matches!(ext, "js" | "mjs" | "cjs"),
            LanguageId::Jsx => ext == "jsx",
            _ => false,
        }
    }

    fn detect_from_shebang(&self, shebang: &str) -> bool {
        match self.language {
            LanguageId::JavaScript | LanguageId::Jsx => {
                let s = shebang.to_lowercase();
                s.contains("node") || s.contains("deno") || s.contains("bun") || s.contains("zx")
            }
            _ => false,
        }
    }

    fn parse(
        &self,
        parser: &mut Parser,
        source: &str,
        old_tree: Option<&Tree>,
    ) -> Result<ParseOutput> {
        parser
            .set_language(&self.grammar())
            .map_err(|err| anyhow!("failed to set parser language {:?}: {err}", self.language))?;

        let tree = parser
            .parse(source, old_tree)
            .ok_or_else(|| anyhow!("tree-sitter parser returned no tree"))?;

        Ok(ParseOutput {
            has_errors: tree.root_node().has_error(),
            tree,
            language: self.language,
        })
    }

    fn collect_diagnostics(&self, _source: &str, tree: &Tree) -> Vec<ParseDiagnostic> {
        let mut diagnostics = Vec::new();
        let mut stack = vec![tree.root_node()];

        while let Some(node) = stack.pop() {
            if node.is_error() {
                diagnostics.push(ParseDiagnostic {
                    level: "error".to_string(),
                    message: format!("syntax error: {}", node.kind()),
                    span: Some(span_from_node(node)),
                });
            }

            if node.is_missing() {
                diagnostics.push(ParseDiagnostic {
                    level: "error".to_string(),
                    message: format!("missing node: {}", node.kind()),
                    span: Some(span_from_node(node)),
                });
            }

            for idx in 0..node.child_count() {
                if let Some(child) = node.child(idx) {
                    stack.push(child);
                }
            }
        }

        diagnostics.sort_by(|a, b| diagnostic_sort_key(a).cmp(&diagnostic_sort_key(b)));
        diagnostics.dedup_by(|a, b| diagnostic_sort_key(a) == diagnostic_sort_key(b));

        if diagnostics.is_empty() && tree.root_node().has_error() {
            diagnostics.push(ParseDiagnostic {
                level: "error".to_string(),
                message: "tree contains recoverable parse errors".to_string(),
                span: Some(span_from_node(tree.root_node())),
            });
        }

        diagnostics
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
                "import_statement" => parse_import_statement(ctx, node, ctx.source, &mut imports),
                "call_expression" => parse_call_import(ctx, node, ctx.source, &mut imports),
                "export_statement" => parse_reexport_imports(ctx, node, ctx.source, &mut imports),
                _ => {}
            }
        }

        sort_and_dedupe_imports(&mut imports);

        imports
    }

    fn extract_exports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<ExportFact> {
        let mut exports = Vec::new();

        for node in walk_named_nodes(tree.root_node()) {
            match node.kind() {
                "export_statement" => parse_export_statement(ctx, node, ctx.source, &mut exports),
                "assignment_expression" => {
                    parse_commonjs_exports(ctx, node, ctx.source, &mut exports)
                }
                _ => {}
            }
        }

        exports.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                a.exported_name.as_str(),
                a.local_name.as_deref().unwrap_or(""),
                a.raw_specifier.as_deref().unwrap_or(""),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    b.exported_name.as_str(),
                    b.local_name.as_deref().unwrap_or(""),
                    b.raw_specifier.as_deref().unwrap_or(""),
                ))
        });

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
            match node.kind() {
                "call_expression" => {
                    let Some(callee) = node
                        .child_by_field_name("function")
                        .or_else(|| node.named_child(0))
                    else {
                        continue;
                    };
                    let callee_text = node_text(callee, ctx.source);
                    let callee_display_name = call_display_name(&callee_text);
                    if callee_display_name.is_empty() {
                        continue;
                    }

                    let span = span_from_node(node);
                    let caller_symbol_id = find_enclosing_symbol(symbols, span.start_byte);
                    let kind = if callee_text.contains('.') || callee_text.contains("?.") {
                        CallKind::Method
                    } else {
                        CallKind::Direct
                    };

                    edges.push(CallEdge {
                        id: stable_id(&format!(
                            "call|{}|{}|{}|{}",
                            ctx.rel_path, span.start_byte, span.end_byte, callee_text
                        )),
                        workspace_id: ctx.workspace_id,
                        source_file_id: ctx.file_id,
                        caller_symbol_id,
                        callee_symbol_id: None,
                        callee_qualified_name: Some(callee_text.clone()),
                        callee_display_name,
                        kind,
                        resolved: false,
                        span,
                    });
                }
                "new_expression" => {
                    let Some(callee) = node
                        .child_by_field_name("constructor")
                        .or_else(|| node.child_by_field_name("function"))
                        .or_else(|| node.named_child(0))
                    else {
                        continue;
                    };

                    let callee_text = node_text(callee, ctx.source);
                    let callee_display_name = call_display_name(&callee_text);
                    if callee_display_name.is_empty() {
                        continue;
                    }

                    let span = span_from_node(node);
                    let caller_symbol_id = find_enclosing_symbol(symbols, span.start_byte);
                    edges.push(CallEdge {
                        id: stable_id(&format!(
                            "ctor|{}|{}|{}|{}",
                            ctx.rel_path, span.start_byte, span.end_byte, callee_text
                        )),
                        workspace_id: ctx.workspace_id,
                        source_file_id: ctx.file_id,
                        caller_symbol_id,
                        callee_symbol_id: None,
                        callee_qualified_name: Some(callee_text.clone()),
                        callee_display_name,
                        kind: CallKind::Constructor,
                        resolved: false,
                        span,
                    });
                }
                _ => {}
            }
        }

        edges.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                format!("{:?}", a.kind),
                a.callee_display_name.as_str(),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    format!("{:?}", b.kind),
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
            let is_identifier = matches!(
                node.kind(),
                "identifier"
                    | "property_identifier"
                    | "shorthand_property_identifier"
                    | "shorthand_property_identifier_pattern"
                    | "type_identifier"
                    | "private_property_identifier"
            );

            if !is_identifier {
                continue;
            }

            let mut target_name = node_text(node, ctx.source);
            if target_name.starts_with('#') {
                target_name = target_name.trim_start_matches('#').to_string();
            }
            if target_name.is_empty() || is_reserved_name(&target_name) {
                continue;
            }

            if is_object_literal_key(node) {
                continue;
            }

            let span = span_from_node(node);
            let source_symbol_id = find_enclosing_symbol(symbols, span.start_byte);

            let kind = if is_type_position(node) {
                ReferenceKind::Type
            } else if is_write_position(node, ctx.source) {
                ReferenceKind::Write
            } else {
                ReferenceKind::Read
            };

            let resolution_confidence = match kind {
                ReferenceKind::Type => 0.7,
                ReferenceKind::Write => 0.65,
                ReferenceKind::Read => 0.5,
                _ => 0.4,
            };

            references.push(Reference {
                id: stable_id(&format!(
                    "ref|{}|{}|{}|{}|{:?}",
                    ctx.rel_path, span.start_byte, span.end_byte, target_name, kind
                )),
                workspace_id: ctx.workspace_id,
                source_file_id: ctx.file_id,
                source_symbol_id,
                target_symbol_id: None,
                target_name,
                kind,
                resolved: false,
                resolution_confidence,
                span,
            });
        }

        references.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                format!("{:?}", a.kind),
                a.target_name.as_str(),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    format!("{:?}", b.kind),
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
        // Slice 2B: explicit no-op stub. Full binding will be added later.
        Vec::new()
    }

    fn extract_chunks(
        &self,
        ctx: &ExtractionContext<'_>,
        _tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<Chunk> {
        let mut chunks = Vec::new();
        let source_len = ctx.source.len() as u32;

        let first_symbol_start = symbols
            .iter()
            .map(|symbol| symbol.span.start_byte)
            .min()
            .unwrap_or(source_len);
        let mut header_end = first_symbol_start.min(source_len);
        let mut header_content = text_by_byte_range(ctx.source, 0, header_end);
        if header_content.trim().is_empty() {
            let fallback_end = byte_end_for_first_n_lines(ctx.source, 12).min(source_len);
            if fallback_end > 0 {
                header_end = fallback_end;
                header_content = text_by_byte_range(ctx.source, 0, header_end);
            }
        }
        let header_span = span_from_byte_range(ctx.source, 0, header_end);

        chunks.push(Chunk {
            id: stable_id(&format!("chunk|{}|header|{}", ctx.file_id, ctx.rel_path)),
            workspace_id: ctx.workspace_id,
            file_id: ctx.file_id,
            symbol_id: None,
            parent_symbol_id: None,
            kind: ChunkKind::FileHeader,
            language: self.language,
            title: format!("{} header", ctx.rel_path),
            content_hash: blake3_hex(&header_content),
            token_estimate: estimate_tokens(&header_content),
            content: header_content,
            span: header_span,
            prev_chunk_id: None,
            next_chunk_id: None,
            embedding_status: EmbeddingStatus::NotQueued,
        });

        for symbol in symbols {
            let content =
                text_by_byte_range(ctx.source, symbol.span.start_byte, symbol.span.end_byte);
            let (chunk_kind, title_prefix) = match symbol.kind {
                SymbolKind::Method => (ChunkKind::Method, "method"),
                _ => (ChunkKind::Symbol, "symbol"),
            };

            chunks.push(Chunk {
                id: stable_id(&format!(
                    "chunk|{}|{}|{}|{}|{}",
                    ctx.file_id,
                    ctx.rel_path,
                    title_prefix,
                    symbol.qualified_name,
                    symbol.span.start_byte
                )),
                workspace_id: ctx.workspace_id,
                file_id: ctx.file_id,
                symbol_id: Some(symbol.id),
                parent_symbol_id: symbol.parent_symbol_id,
                kind: chunk_kind,
                language: self.language,
                title: format!("{} {}", title_prefix, symbol.qualified_name),
                content_hash: blake3_hex(&content),
                token_estimate: estimate_tokens(&content),
                content,
                span: symbol.span,
                prev_chunk_id: None,
                next_chunk_id: None,
                embedding_status: EmbeddingStatus::NotQueued,
            });

            if symbol.kind == SymbolKind::Class {
                let mut methods = symbols
                    .iter()
                    .filter(|candidate| {
                        candidate.parent_symbol_id == Some(symbol.id)
                            && matches!(
                                candidate.kind,
                                SymbolKind::Method | SymbolKind::Field | SymbolKind::Property
                            )
                    })
                    .map(|candidate| candidate.name.clone())
                    .collect::<Vec<_>>();

                methods.sort();
                let summary = if methods.is_empty() {
                    format!("class {}", symbol.qualified_name)
                } else {
                    format!(
                        "class {}\nchildren: {}",
                        symbol.qualified_name,
                        methods.join(", ")
                    )
                };

                chunks.push(Chunk {
                    id: stable_id(&format!(
                        "chunk|{}|class-summary|{}|{}",
                        ctx.file_id, ctx.rel_path, symbol.qualified_name
                    )),
                    workspace_id: ctx.workspace_id,
                    file_id: ctx.file_id,
                    symbol_id: Some(symbol.id),
                    parent_symbol_id: None,
                    kind: ChunkKind::ClassSummary,
                    language: self.language,
                    title: format!("class summary {}", symbol.qualified_name),
                    content_hash: blake3_hex(&summary),
                    token_estimate: estimate_tokens(&summary),
                    content: summary,
                    span: symbol.span,
                    prev_chunk_id: None,
                    next_chunk_id: None,
                    embedding_status: EmbeddingStatus::NotQueued,
                });
            }
        }

        chunks.sort_by(|a, b| {
            (
                a.span.start_byte,
                a.span.end_byte,
                format!("{:?}", a.kind),
                a.title.as_str(),
            )
                .cmp(&(
                    b.span.start_byte,
                    b.span.end_byte,
                    format!("{:?}", b.kind),
                    b.title.as_str(),
                ))
        });

        let ids = chunks.iter().map(|chunk| chunk.id).collect::<Vec<_>>();
        for (idx, chunk) in chunks.iter_mut().enumerate() {
            chunk.prev_chunk_id = if idx > 0 { Some(ids[idx - 1]) } else { None };
            chunk.next_chunk_id = ids.get(idx + 1).copied();
        }

        chunks
    }

    fn resolve_imports(
        &self,
        ctx: &ExtractionContext<'_>,
        imports: &mut [Import],
        _symbols: &[Symbol],
    ) -> Vec<UnresolvedImport> {
        let mut unresolved = Vec::new();
        let resolver = ModuleResolver::from_extraction_context(ctx);

        for import in imports {
            if import.resolved_file_id.is_some() || import.resolved_symbol_id.is_some() {
                continue;
            }

            let resolution = resolver.resolve(&import.raw_specifier);
            import.resolution_error = Some(resolution.to_resolution_error());

            if !matches!(
                resolution.status,
                ModuleResolutionStatus::Resolved | ModuleResolutionStatus::External
            ) {
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
        // Slice 2B: explicit no-op stub.
    }

    fn bind_call_edges(
        &self,
        _ctx: &ExtractionContext<'_>,
        _calls: &mut [CallEdge],
        _symbols: &[Symbol],
        _import_map: &[Import],
    ) {
        // Slice 2B: explicit no-op stub.
    }

    fn structure_fingerprint(
        &self,
        symbols: &[Symbol],
        imports: &[Import],
        exports: &[ExportFact],
    ) -> String {
        let mut entries = Vec::new();

        for symbol in symbols {
            entries.push(format!(
                "S|{:?}|{}|{}|{}|{}|{}|{}",
                symbol.kind,
                symbol.qualified_name,
                symbol.signature.as_deref().unwrap_or(""),
                symbol.exported,
                symbol.async_flag,
                symbol.static_flag,
                symbol.span.start_byte
            ));
        }

        for import in imports {
            entries.push(format!(
                "I|{:?}|{}|{}|{}|{}|{}|{}",
                import.kind,
                import.raw_specifier,
                import.imported_name.as_deref().unwrap_or(""),
                import.local_name.as_deref().unwrap_or(""),
                import.alias.as_deref().unwrap_or(""),
                import.is_type_only,
                import.is_reexport
            ));
        }

        for export in exports {
            entries.push(format!(
                "E|{}|{}|{}|{}|{}|{}",
                export.exported_name,
                export.local_name.as_deref().unwrap_or(""),
                export.raw_specifier.as_deref().unwrap_or(""),
                export.is_default,
                export.is_star,
                export.is_type_only
            ));
        }

        entries.sort();
        blake3_hex(&entries.join("\n"))
    }

    fn public_api_fingerprint(&self, symbols: &[Symbol], exports: &[ExportFact]) -> String {
        let mut entries = Vec::new();

        for symbol in symbols.iter().filter(|symbol| symbol.exported) {
            entries.push(format!(
                "PS|{:?}|{}|{}|{}",
                symbol.kind,
                symbol.qualified_name,
                symbol.signature.as_deref().unwrap_or(""),
                symbol.span.start_byte
            ));
        }

        for export in exports {
            entries.push(format!(
                "PE|{}|{}|{}|{}|{}|{}",
                export.exported_name,
                export.local_name.as_deref().unwrap_or(""),
                export.raw_specifier.as_deref().unwrap_or(""),
                export.is_default,
                export.is_star,
                export.is_type_only
            ));
        }

        entries.sort();
        blake3_hex(&entries.join("\n"))
    }
}

fn sort_and_dedupe_imports(imports: &mut Vec<Import>) {
    imports.sort_by(|a, b| {
        (
            a.span.start_byte,
            a.span.end_byte,
            format!("{:?}", a.kind),
            a.raw_specifier.as_str(),
            a.imported_name.as_deref().unwrap_or(""),
            a.local_name.as_deref().unwrap_or(""),
            a.alias.as_deref().unwrap_or(""),
            a.is_type_only,
            a.is_reexport,
            a.resolution_error.as_deref().unwrap_or(""),
            a.id,
        )
            .cmp(&(
                b.span.start_byte,
                b.span.end_byte,
                format!("{:?}", b.kind),
                b.raw_specifier.as_str(),
                b.imported_name.as_deref().unwrap_or(""),
                b.local_name.as_deref().unwrap_or(""),
                b.alias.as_deref().unwrap_or(""),
                b.is_type_only,
                b.is_reexport,
                b.resolution_error.as_deref().unwrap_or(""),
                b.id,
            ))
    });
    imports.dedup_by(|a, b| same_import_extraction_artifact(a, b));
}

fn same_import_extraction_artifact(a: &Import, b: &Import) -> bool {
    a.id == b.id
        && a.workspace_id == b.workspace_id
        && a.source_file_id == b.source_file_id
        && a.source_symbol_id == b.source_symbol_id
        && a.raw_specifier == b.raw_specifier
        && a.imported_name == b.imported_name
        && a.local_name == b.local_name
        && a.alias == b.alias
        && a.kind == b.kind
        && a.is_type_only == b.is_type_only
        && a.is_reexport == b.is_reexport
        && a.resolved_file_id == b.resolved_file_id
        && a.resolved_symbol_id == b.resolved_symbol_id
        && a.span == b.span
        && a.resolution_error == b.resolution_error
}

fn build_symbol(
    ctx: &ExtractionContext<'_>,
    source: &str,
    node: Node<'_>,
    kind: SymbolKind,
    name: &str,
    containers: &[Container],
    exported: bool,
    signature: Option<String>,
    detail: Option<String>,
) -> Symbol {
    let span = span_from_node(node);
    let qualified_name = if let Some(parent) = containers.last() {
        format!("{}.{}", parent.qname, name)
    } else {
        name.to_string()
    };
    let parent_symbol_id = containers.last().map(|container| container.id);
    let visibility = visibility_for_node(node, source, exported);
    let async_flag = has_token_child(node, source, "async");
    let static_flag = has_token_child(node, source, "static");

    let symbol_hash_material = format!(
        "{}|{}|{:?}|{}|{}|{}|{}",
        ctx.rel_path,
        qualified_name,
        kind,
        span.start_byte,
        span.end_byte,
        exported,
        signature.as_deref().unwrap_or("")
    );

    Symbol {
        id: stable_id(&format!("symbol|{symbol_hash_material}")),
        workspace_id: ctx.workspace_id,
        file_id: ctx.file_id,
        parent_symbol_id,
        kind,
        name: name.to_string(),
        qualified_name,
        signature,
        detail,
        visibility,
        exported,
        async_flag,
        static_flag,
        span,
        symbol_hash: blake3_hex(&symbol_hash_material),
    }
}

fn parse_import_statement(
    ctx: &ExtractionContext<'_>,
    node: Node<'_>,
    source: &str,
    out: &mut Vec<Import>,
) {
    let raw = node_text(node, source);
    let text = compact_ws(&raw);
    if !text.starts_with("import ") {
        return;
    }

    let span = span_from_node(node);
    let specifier = extract_quoted_specifier(&text).unwrap_or_default();

    if !text.contains(" from ") {
        out.push(new_import(
            ctx,
            span,
            specifier,
            None,
            None,
            None,
            ImportKind::EsmSideEffect,
            false,
            false,
            None,
        ));
        return;
    }

    let Some(from_idx) = text.find(" from ") else {
        return;
    };
    let mut clause = text["import".len()..from_idx].trim().to_string();
    let global_type_only = clause.starts_with("type ");
    if global_type_only {
        clause = clause.trim_start_matches("type ").trim().to_string();
    }

    for segment in split_top_level_import_clause_segments(&clause) {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }

        if let Some(named) = segment
            .strip_prefix('{')
            .and_then(|value| value.strip_suffix('}'))
        {
            for entry in named
                .split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
            {
                let (item_type_only, normalized) = if let Some(rest) = entry.strip_prefix("type ") {
                    (true, rest.trim())
                } else {
                    (false, entry)
                };

                if let Some((left, right)) = normalized.split_once(" as ") {
                    let imported_name = left.trim().to_string();
                    let local_name = right.trim().to_string();
                    out.push(new_import(
                        ctx,
                        span,
                        specifier.clone(),
                        Some(imported_name),
                        Some(local_name.clone()),
                        Some(local_name),
                        ImportKind::EsmNamed,
                        global_type_only || item_type_only,
                        false,
                        None,
                    ));
                } else {
                    let name = normalized.trim().to_string();
                    out.push(new_import(
                        ctx,
                        span,
                        specifier.clone(),
                        Some(name.clone()),
                        Some(name),
                        None,
                        ImportKind::EsmNamed,
                        global_type_only || item_type_only,
                        false,
                        None,
                    ));
                }
            }
            continue;
        }

        if let Some(namespace) = parse_namespace_import(segment) {
            out.push(new_import(
                ctx,
                span,
                specifier.clone(),
                Some("*".to_string()),
                Some(namespace.clone()),
                Some(namespace),
                ImportKind::EsmNamespace,
                global_type_only,
                false,
                None,
            ));
            continue;
        }

        out.push(new_import(
            ctx,
            span,
            specifier.clone(),
            Some("default".to_string()),
            Some(segment.to_string()),
            None,
            ImportKind::EsmDefault,
            global_type_only,
            false,
            None,
        ));
    }
}

fn parse_call_import(
    ctx: &ExtractionContext<'_>,
    node: Node<'_>,
    source: &str,
    out: &mut Vec<Import>,
) {
    let Some(function_node) = node
        .child_by_field_name("function")
        .or_else(|| node.named_child(0))
    else {
        return;
    };
    let fn_name = node_text(function_node, source);

    if fn_name != "require" && fn_name != "import" {
        return;
    }

    let span = span_from_node(node);
    let local_name = infer_assigned_local_name(node, source);
    let is_conditional = has_ancestor_kind(node, "conditional_expression")
        || has_ancestor_kind(node, "ternary_expression")
        || has_ancestor_kind(node, "if_statement")
        || has_ancestor_kind(node, "switch_case");

    let (specifier, resolution_error) = if let Some(specifier) = first_string_argument(node, source)
    {
        (specifier, None)
    } else {
        (
            "<dynamic-expression>".to_string(),
            Some("non-literal module specifier".to_string()),
        )
    };

    let kind = if fn_name == "import" {
        ImportKind::Dynamic
    } else if is_conditional {
        ImportKind::ConditionalRequire
    } else {
        ImportKind::CommonJsRequire
    };

    out.push(new_import(
        ctx,
        span,
        specifier,
        None,
        local_name,
        None,
        kind,
        false,
        false,
        resolution_error,
    ));
}

fn parse_reexport_imports(
    ctx: &ExtractionContext<'_>,
    node: Node<'_>,
    source: &str,
    out: &mut Vec<Import>,
) {
    let raw = node_text(node, source);
    let text = compact_ws(&raw);

    if !text.starts_with("export ") || !text.contains(" from ") {
        return;
    }

    let span = span_from_node(node);
    let specifier = extract_quoted_specifier(&text).unwrap_or_default();
    let Some(from_idx) = text.find(" from ") else {
        return;
    };
    let clause = text["export".len()..from_idx].trim();
    let global_type_only = clause.starts_with("type ");
    let clause = clause.trim_start_matches("type ").trim();

    if clause.starts_with('*') {
        let namespace = clause
            .strip_prefix("* as ")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        out.push(new_import(
            ctx,
            span,
            specifier,
            Some("*".to_string()),
            namespace.clone(),
            namespace,
            ImportKind::ReExport,
            global_type_only,
            true,
            None,
        ));
        return;
    }

    if let Some(brace_start) = clause.find('{') {
        if let Some(brace_end) = clause.rfind('}') {
            let named = &clause[brace_start + 1..brace_end];
            for entry in named
                .split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
            {
                let (item_type_only, normalized) = if let Some(rest) = entry.strip_prefix("type ") {
                    (true, rest.trim())
                } else {
                    (false, entry)
                };

                let (imported_name, local_name, alias) =
                    if let Some((left, right)) = normalized.split_once(" as ") {
                        let left = left.trim().to_string();
                        let right = right.trim().to_string();
                        (Some(left), Some(right.clone()), Some(right))
                    } else {
                        let name = normalized.trim().to_string();
                        (Some(name.clone()), Some(name), None)
                    };

                out.push(new_import(
                    ctx,
                    span,
                    specifier.clone(),
                    imported_name,
                    local_name,
                    alias,
                    ImportKind::ReExport,
                    global_type_only || item_type_only,
                    true,
                    None,
                ));
            }
        }
    }
}

fn parse_export_statement(
    ctx: &ExtractionContext<'_>,
    node: Node<'_>,
    source: &str,
    out: &mut Vec<ExportFact>,
) {
    let raw = node_text(node, source);
    let text = compact_ws(&raw);
    if !text.starts_with("export ") {
        return;
    }

    let span = span_from_node(node);
    let raw_specifier = extract_quoted_specifier(&text);

    if text.starts_with("export default ") {
        let local_name = parse_default_export_local_name(&text);
        out.push(ExportFact {
            source_file_id: ctx.file_id,
            source_symbol_id: None,
            exported_name: "default".to_string(),
            local_name,
            raw_specifier,
            is_default: true,
            is_star: false,
            is_type_only: false,
            span,
        });
        return;
    }

    if text.starts_with("export *") {
        let exported_name = text
            .strip_prefix("export * as ")
            .and_then(|rest| rest.split(" from ").next())
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or("*")
            .to_string();

        out.push(ExportFact {
            source_file_id: ctx.file_id,
            source_symbol_id: None,
            exported_name,
            local_name: None,
            raw_specifier,
            is_default: false,
            is_star: true,
            is_type_only: text.starts_with("export type *"),
            span,
        });
        return;
    }

    if let Some(body) = export_brace_body(&text) {
        let global_type_only = text.starts_with("export type ");
        for item in body
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
        {
            let (item_type_only, normalized) = if let Some(rest) = item.strip_prefix("type ") {
                (true, rest.trim())
            } else {
                (false, item)
            };

            let (local_name, exported_name) =
                if let Some((left, right)) = normalized.split_once(" as ") {
                    (left.trim().to_string(), right.trim().to_string())
                } else {
                    let name = normalized.trim().to_string();
                    (name.clone(), name)
                };

            out.push(ExportFact {
                source_file_id: ctx.file_id,
                source_symbol_id: None,
                exported_name,
                local_name: Some(local_name),
                raw_specifier: raw_specifier.clone(),
                is_default: false,
                is_star: false,
                is_type_only: global_type_only || item_type_only,
                span,
            });
        }
        return;
    }

    for (name, is_type_only) in parse_exported_declaration_names(&text) {
        out.push(ExportFact {
            source_file_id: ctx.file_id,
            source_symbol_id: None,
            exported_name: name.clone(),
            local_name: Some(name),
            raw_specifier: None,
            is_default: false,
            is_star: false,
            is_type_only,
            span,
        });
    }
}

fn parse_commonjs_exports(
    ctx: &ExtractionContext<'_>,
    node: Node<'_>,
    source: &str,
    out: &mut Vec<ExportFact>,
) {
    let text = compact_ws(&node_text(node, source));
    let span = span_from_node(node);

    if text.starts_with("module.exports =") {
        out.push(ExportFact {
            source_file_id: ctx.file_id,
            source_symbol_id: None,
            exported_name: "default".to_string(),
            local_name: None,
            raw_specifier: None,
            is_default: true,
            is_star: false,
            is_type_only: false,
            span,
        });
        return;
    }

    if let Some(rest) = text.strip_prefix("exports.") {
        let mut name = String::new();
        for ch in rest.chars() {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '$' {
                name.push(ch);
            } else {
                break;
            }
        }

        if !name.is_empty() {
            out.push(ExportFact {
                source_file_id: ctx.file_id,
                source_symbol_id: None,
                exported_name: name.clone(),
                local_name: Some(name),
                raw_specifier: None,
                is_default: false,
                is_star: false,
                is_type_only: false,
                span,
            });
        }
    }

    if let Some(rest) = text.strip_prefix("module.exports.") {
        let mut name = String::new();
        for ch in rest.chars() {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '$' {
                name.push(ch);
            } else {
                break;
            }
        }

        if !name.is_empty() {
            out.push(ExportFact {
                source_file_id: ctx.file_id,
                source_symbol_id: None,
                exported_name: name.clone(),
                local_name: Some(name),
                raw_specifier: None,
                is_default: false,
                is_star: false,
                is_type_only: false,
                span,
            });
        }
    }
}

fn new_import(
    ctx: &ExtractionContext<'_>,
    span: Span,
    raw_specifier: String,
    imported_name: Option<String>,
    local_name: Option<String>,
    alias: Option<String>,
    kind: ImportKind,
    is_type_only: bool,
    is_reexport: bool,
    resolution_error: Option<String>,
) -> Import {
    let id_material = format!(
        "import|{}|{:?}|{}|{}|{}|{}|{}|{}",
        ctx.rel_path,
        kind,
        span.start_byte,
        span.end_byte,
        raw_specifier,
        imported_name.as_deref().unwrap_or(""),
        local_name.as_deref().unwrap_or(""),
        alias.as_deref().unwrap_or("")
    );

    Import {
        id: stable_id(&id_material),
        workspace_id: ctx.workspace_id,
        source_file_id: ctx.file_id,
        source_symbol_id: None,
        raw_specifier,
        imported_name,
        local_name,
        alias,
        kind,
        is_type_only,
        is_reexport,
        resolved_file_id: None,
        resolved_symbol_id: None,
        span,
        resolution_error,
    }
}

fn declaration_name(node: Node<'_>, source: &str) -> Option<String> {
    node.child_by_field_name("name")
        .map(|name| normalize_identifier(&node_text(name, source)))
        .and_then(|name| if name.is_empty() { None } else { Some(name) })
}

fn declaration_exported(node: Node<'_>) -> bool {
    has_ancestor_kind(node, "export_statement")
}

fn has_ancestor_kind(mut node: Node<'_>, expected: &str) -> bool {
    while let Some(parent) = node.parent() {
        if parent.kind() == expected {
            return true;
        }
        node = parent;
    }
    false
}

fn symbol_signature(node: Node<'_>, source: &str) -> Option<String> {
    let text = node_text(node, source);
    if text.trim().is_empty() {
        None
    } else {
        Some(first_line(&compact_ws(&text), 240))
    }
}

fn has_token_child(node: Node<'_>, source: &str, token: &str) -> bool {
    for idx in 0..node.child_count() {
        if let Some(child) = node.child(idx) {
            if child.kind() == token {
                return true;
            }
            let child_text = node_text(child, source);
            if child_text == token {
                return true;
            }
        }
    }

    false
}

fn visibility_for_node(node: Node<'_>, source: &str, exported: bool) -> Visibility {
    for idx in 0..node.child_count() {
        if let Some(child) = node.child(idx) {
            if child.kind() == "accessibility_modifier" {
                let text = node_text(child, source);
                return match text.as_str() {
                    "public" => Visibility::Public,
                    "private" => Visibility::Private,
                    "protected" => Visibility::Protected,
                    _ => Visibility::Unknown,
                };
            }
        }
    }

    if exported {
        Visibility::Public
    } else {
        Visibility::Unknown
    }
}

fn span_from_node(node: Node<'_>) -> Span {
    let start = node.start_position();
    let end = node.end_position();
    Span {
        start_byte: node.start_byte() as u32,
        end_byte: node.end_byte() as u32,
        start_line: start.row as u32 + 1,
        start_column: start.column as u32,
        end_line: end.row as u32 + 1,
        end_column: end.column as u32,
    }
}

fn span_from_byte_range(source: &str, start: u32, end: u32) -> Span {
    let (start_line, start_column) = line_col_at_byte(source, start as usize);
    let (end_line, end_column) = line_col_at_byte(source, end as usize);
    Span {
        start_byte: start,
        end_byte: end,
        start_line,
        start_column,
        end_line,
        end_column,
    }
}

fn line_col_at_byte(source: &str, byte: usize) -> (u32, u32) {
    let mut line: u32 = 1;
    let mut col: u32 = 0;

    for (idx, ch) in source.bytes().enumerate() {
        if idx >= byte {
            break;
        }
        if ch == b'\n' {
            line += 1;
            col = 0;
        } else {
            col += 1;
        }
    }

    (line, col)
}

fn walk_named_nodes(root: Node<'_>) -> Vec<Node<'_>> {
    let mut out = Vec::new();
    let mut stack = vec![root];

    while let Some(node) = stack.pop() {
        out.push(node);
        let count = node.named_child_count();
        for idx in (0..count).rev() {
            if let Some(child) = node.named_child(idx) {
                stack.push(child);
            }
        }
    }

    out
}

fn node_text(node: Node<'_>, source: &str) -> String {
    node.utf8_text(source.as_bytes()).unwrap_or("").to_string()
}

fn normalize_identifier(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let mut out = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '$' || ch == '#' {
            out.push(ch);
        } else if !out.is_empty() {
            break;
        }
    }

    out.trim_start_matches('#').to_string()
}

fn compact_ws(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn first_line(input: &str, max_len: usize) -> String {
    let line = input.lines().next().unwrap_or("").trim();
    if line.len() <= max_len {
        line.to_string()
    } else {
        let end = line
            .char_indices()
            .map(|(idx, _)| idx)
            .take_while(|idx| *idx <= max_len)
            .last()
            .unwrap_or(0);
        format!("{}…", &line[..end])
    }
}

fn stable_id(material: &str) -> i64 {
    let hash = blake3::hash(material.as_bytes());
    let mut bytes = [0_u8; 8];
    bytes.copy_from_slice(&hash.as_bytes()[..8]);
    let id = (u64::from_le_bytes(bytes) & 0x7FFF_FFFF_FFFF_FFFF) as i64;
    if id == 0 {
        1
    } else {
        id
    }
}

fn blake3_hex(input: &str) -> String {
    blake3::hash(input.as_bytes()).to_hex().to_string()
}

fn diagnostic_sort_key(diagnostic: &ParseDiagnostic) -> (u32, u32, String) {
    let (start, end) = diagnostic
        .span
        .map(|span| (span.start_byte, span.end_byte))
        .unwrap_or((u32::MAX, u32::MAX));
    (start, end, diagnostic.message.clone())
}

fn extract_quoted_specifier(input: &str) -> Option<String> {
    for quote in ['\'', '"'] {
        if let Some(start) = input.find(quote) {
            let rest = &input[start + 1..];
            if let Some(end_rel) = rest.find(quote) {
                return Some(rest[..end_rel].to_string());
            }
        }
    }

    None
}

fn split_top_level_import_clause_segments(clause: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut start = 0_usize;
    let mut brace_depth = 0_u32;

    for (idx, ch) in clause.char_indices() {
        match ch {
            '{' => brace_depth = brace_depth.saturating_add(1),
            '}' => brace_depth = brace_depth.saturating_sub(1),
            ',' if brace_depth == 0 => {
                let segment = clause[start..idx].trim();
                if !segment.is_empty() {
                    segments.push(segment.to_string());
                }
                start = idx + 1;
            }
            _ => {}
        }
    }

    let tail = clause[start..].trim();
    if !tail.is_empty() {
        segments.push(tail.to_string());
    }

    segments
}

fn parse_namespace_import(input: &str) -> Option<String> {
    let input = input.trim();
    if let Some(rest) = input.strip_prefix("* as ") {
        let name = normalize_identifier(rest);
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}

fn first_string_argument(call: Node<'_>, source: &str) -> Option<String> {
    let args = call
        .child_by_field_name("arguments")
        .or_else(|| call.named_child(1))?;

    for idx in 0..args.named_child_count() {
        let arg = args.named_child(idx)?;
        match arg.kind() {
            "string" => {
                let text = node_text(arg, source);
                return unquote(&text);
            }
            "template_string" => {
                let text = node_text(arg, source);
                if !text.contains("${") {
                    return unquote(&text);
                }
            }
            _ => {}
        }
    }

    None
}

fn unquote(value: &str) -> Option<String> {
    let value = value.trim();
    if value.len() < 2 {
        return None;
    }

    let first = value.chars().next()?;
    let last = value.chars().last()?;
    if (first == '\'' || first == '"' || first == '`') && last == first {
        Some(value[1..value.len() - 1].to_string())
    } else {
        None
    }
}

fn infer_assigned_local_name(node: Node<'_>, source: &str) -> Option<String> {
    let parent = node.parent()?;
    if parent.kind() != "variable_declarator" {
        return None;
    }

    parent
        .child_by_field_name("name")
        .map(|name| normalize_identifier(&node_text(name, source)))
        .filter(|name| !name.is_empty())
}

fn call_display_name(callee_text: &str) -> String {
    let normalized = callee_text.trim();
    if normalized.is_empty() {
        return String::new();
    }

    let tail = normalized
        .rsplit(['.', '?'])
        .find(|segment| !segment.is_empty())
        .unwrap_or(normalized);
    normalize_identifier(tail)
}

fn find_enclosing_symbol(symbols: &[Symbol], byte: u32) -> Option<i64> {
    symbols
        .iter()
        .filter(|symbol| symbol.span.start_byte <= byte && byte <= symbol.span.end_byte)
        .min_by_key(|symbol| symbol.span.end_byte.saturating_sub(symbol.span.start_byte))
        .map(|symbol| symbol.id)
}

fn is_object_literal_key(node: Node<'_>) -> bool {
    if let Some(parent) = node.parent() {
        if parent.kind() == "pair" {
            if let Some(key) = parent.child_by_field_name("key") {
                return same_range(key, node);
            }
        }
    }

    false
}

fn is_type_position(node: Node<'_>) -> bool {
    if node.kind() == "type_identifier" {
        return true;
    }

    let mut current = node;
    while let Some(parent) = current.parent() {
        if matches!(
            parent.kind(),
            "type_annotation"
                | "type_alias_declaration"
                | "interface_declaration"
                | "extends_clause"
                | "implements_clause"
                | "type_arguments"
                | "type_parameters"
                | "type_parameter"
                | "type_query"
                | "import_type"
        ) {
            return true;
        }
        current = parent;
    }

    false
}

fn is_write_position(node: Node<'_>, source: &str) -> bool {
    if let Some(parent) = node.parent() {
        if let Some(name_node) = parent.child_by_field_name("name") {
            if same_range(name_node, node) {
                return true;
            }
        }

        if matches!(
            parent.kind(),
            "assignment_expression" | "augmented_assignment_expression"
        ) {
            if let Some(left) = parent.child_by_field_name("left") {
                if contains_range(left, node) {
                    return true;
                }
            }
        }

        if parent.kind() == "update_expression" {
            return true;
        }
    }

    // Fallback: declaration keywords often mark writes for nearby identifier.
    let mut current = node;
    while let Some(parent) = current.parent() {
        if parent.kind() == "lexical_declaration" {
            let text = node_text(parent, source);
            if text.starts_with("const ") || text.starts_with("let ") || text.starts_with("var ") {
                return true;
            }
        }

        current = parent;
    }

    false
}

fn same_range(a: Node<'_>, b: Node<'_>) -> bool {
    a.start_byte() == b.start_byte() && a.end_byte() == b.end_byte()
}

fn contains_range(container: Node<'_>, target: Node<'_>) -> bool {
    container.start_byte() <= target.start_byte() && target.end_byte() <= container.end_byte()
}

fn is_reserved_name(name: &str) -> bool {
    matches!(
        name,
        "import"
            | "export"
            | "from"
            | "as"
            | "type"
            | "default"
            | "class"
            | "function"
            | "const"
            | "let"
            | "var"
            | "new"
            | "return"
            | "if"
            | "else"
            | "extends"
            | "implements"
            | "await"
            | "this"
            | "super"
    )
}

fn text_by_byte_range(source: &str, start: u32, end: u32) -> String {
    if start >= end {
        return String::new();
    }

    source
        .get(start as usize..end as usize)
        .map(ToString::to_string)
        .unwrap_or_default()
}

fn estimate_tokens(content: &str) -> u32 {
    let count = content.split_whitespace().count() as u32;
    if count == 0 {
        1
    } else {
        count
    }
}

fn byte_end_for_first_n_lines(source: &str, line_count: usize) -> u32 {
    if line_count == 0 || source.is_empty() {
        return 0;
    }

    let mut lines_seen = 0_usize;
    for (idx, byte) in source.bytes().enumerate() {
        if byte == b'\n' {
            lines_seen += 1;
            if lines_seen >= line_count {
                return (idx + 1) as u32;
            }
        }
    }

    source.len() as u32
}

fn parse_default_export_local_name(text: &str) -> Option<String> {
    let rest = text.trim_start_matches("export default ").trim();

    for prefix in ["class ", "function ", "async function "] {
        if let Some(after) = rest.strip_prefix(prefix) {
            let name = normalize_identifier(after);
            if !name.is_empty() {
                return Some(name);
            }
        }
    }

    let token = normalize_identifier(rest);
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

fn export_brace_body(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&text[start + 1..end])
}

fn parse_exported_declaration_names(text: &str) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    let mut push_name = |name: String, is_type_only: bool| {
        if !name.is_empty() {
            out.push((name, is_type_only));
        }
    };

    if let Some(rest) = text.strip_prefix("export interface ") {
        push_name(normalize_identifier(rest), false);
        return out;
    }
    if let Some(rest) = text.strip_prefix("export enum ") {
        push_name(normalize_identifier(rest), false);
        return out;
    }
    if let Some(rest) = text.strip_prefix("export class ") {
        push_name(normalize_identifier(rest), false);
        return out;
    }
    if let Some(rest) = text.strip_prefix("export function ") {
        push_name(normalize_identifier(rest), false);
        return out;
    }
    if let Some(rest) = text.strip_prefix("export async function ") {
        push_name(normalize_identifier(rest), false);
        return out;
    }
    if let Some(rest) = text.strip_prefix("export type ") {
        if let Some((left, _right)) = rest.split_once('=') {
            push_name(normalize_identifier(left), true);
            return out;
        }
    }
    if let Some(rest) = text
        .strip_prefix("export const ")
        .or_else(|| text.strip_prefix("export let "))
        .or_else(|| text.strip_prefix("export var "))
    {
        let declarations = rest.split(';').next().unwrap_or(rest);
        for part in declarations.split(',') {
            let name_part = part.split('=').next().unwrap_or("");
            let name = normalize_identifier(name_part);
            if !name.is_empty() {
                push_name(name, false);
            }
        }
        return out;
    }

    out
}
