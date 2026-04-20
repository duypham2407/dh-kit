//! Parser crate for tree-sitter based extraction.
//!
//! This crate hosts language adapters and normalized fact extraction.
//! The primary public surface is:
//! - [`LanguageAdapter`] trait for per-language extraction
//! - [`LanguageRegistry`](registry::LanguageRegistry) for adapter dispatch
//! - [`ParserPool`](pool::ParserPool) for cached parser reuse
//! - [`TypeScriptAdapter`](adapters::typescript::TypeScriptAdapter) for TS/TSX/JS/JSX

pub mod adapters;
pub mod pool;
pub mod registry;

use adapters::{
    go::GoAdapter, python::PythonAdapter, rust::RustAdapter, typescript::TypeScriptAdapter,
};
use anyhow::{anyhow, Context, Result};
use dh_types::{
    CallEdge, Chunk, ExportFact, FileChangeEvent, Import, IndexProgressEvent, LanguageId,
    ParseDiagnostic, ParseStatus, Reference, Symbol,
};
use std::path::Path;
use tree_sitter::{Parser, Tree};

use crate::{pool::ParserPool, registry::LanguageRegistry};

pub struct ParseOutput {
    pub tree: Tree,
    pub has_errors: bool,
    pub language: LanguageId,
}

/// Normalized parser facts extracted for a single file.
///
/// This is the high-level, boundary-safe extraction payload for callers
/// outside `dh-parser`. It deliberately exposes only normalized domain facts
/// and parse metadata from `dh-types`.
#[derive(Debug, Clone)]
pub struct ExtractedFacts {
    pub parse_status: ParseStatus,
    pub parse_error: Option<String>,
    pub has_errors: bool,
    pub symbols: Vec<Symbol>,
    pub imports: Vec<Import>,
    pub exports: Vec<ExportFact>,
    pub call_edges: Vec<CallEdge>,
    pub references: Vec<Reference>,
    pub chunks: Vec<Chunk>,
    pub diagnostics: Vec<ParseDiagnostic>,
    pub structure_fingerprint: String,
    pub public_api_fingerprint: String,
}

pub struct ExtractionContext<'a> {
    pub workspace_id: i64,
    pub root_id: i64,
    pub package_id: Option<i64>,
    pub file_id: i64,
    pub rel_path: &'a str,
    pub source: &'a str,
}

pub struct ParseError;

pub struct TypeRelation;

pub struct UnresolvedImport;

/// Build a language registry with the currently supported built-in adapters.
#[must_use]
pub fn default_language_registry() -> LanguageRegistry {
    let mut registry = LanguageRegistry::new();
    registry.register(TypeScriptAdapter::for_language(LanguageId::TypeScript));
    registry.register(TypeScriptAdapter::for_language(LanguageId::Tsx));
    registry.register(TypeScriptAdapter::for_language(LanguageId::JavaScript));
    registry.register(TypeScriptAdapter::for_language(LanguageId::Jsx));
    registry.register(PythonAdapter);
    registry.register(GoAdapter);
    registry.register(RustAdapter);
    registry
}

/// Parse and extract all facts from source code.
///
/// Tree handling stays internal to `dh-parser`; callers receive only
/// normalized facts and parse metadata.
pub fn extract_file_facts(
    registry: &LanguageRegistry,
    pool: &mut ParserPool,
    language: LanguageId,
    ctx: &ExtractionContext<'_>,
) -> Result<ExtractedFacts> {
    let adapter = registry
        .by_language(language)
        .ok_or_else(|| anyhow!("no adapter registered for language {language:?}"))?;

    let parsed = {
        let parser = pool
            .parser_for(language)
            .with_context(|| format!("get parser for {language:?}"))?;
        adapter.parse(parser, ctx.source, None)?
    };

    let symbols = adapter.extract_symbols(ctx, &parsed.tree);
    let mut imports = adapter.extract_imports(ctx, &parsed.tree);
    let exports = adapter.extract_exports(ctx, &parsed.tree);
    let mut call_edges = adapter.extract_call_edges(ctx, &parsed.tree, &symbols);
    let mut references = adapter.extract_references(ctx, &parsed.tree, &symbols);
    let chunks = adapter.extract_chunks(ctx, &parsed.tree, &symbols);

    adapter.resolve_imports(ctx, &mut imports, &symbols);
    adapter.bind_references(ctx, &mut references, &symbols, &imports);
    adapter.bind_call_edges(ctx, &mut call_edges, &symbols, &imports);

    let diagnostics = adapter.collect_diagnostics(ctx.source, &parsed.tree);
    let parse_status = if parsed.has_errors || !diagnostics.is_empty() {
        ParseStatus::ParsedWithErrors
    } else {
        ParseStatus::Parsed
    };

    let parse_error = if diagnostics.is_empty() {
        None
    } else {
        Some(
            diagnostics
                .iter()
                .take(5)
                .map(|diagnostic| diagnostic.message.clone())
                .collect::<Vec<_>>()
                .join("; "),
        )
    };

    let structure_fingerprint = adapter.structure_fingerprint(&symbols, &imports, &exports);
    let public_api_fingerprint = adapter.public_api_fingerprint(&symbols, &exports);

    Ok(ExtractedFacts {
        parse_status,
        parse_error,
        has_errors: parsed.has_errors,
        symbols,
        imports,
        exports,
        call_edges,
        references,
        chunks,
        diagnostics,
        structure_fingerprint,
        public_api_fingerprint,
    })
}

pub trait LanguageAdapter: Send + Sync {
    fn language_id(&self) -> LanguageId;
    fn display_name(&self) -> &'static str;
    fn file_extensions(&self) -> &'static [&'static str];
    fn grammar(&self) -> tree_sitter::Language;

    fn matches_path(&self, path: &Path) -> bool;
    fn detect_from_shebang(&self, shebang: &str) -> bool;

    fn parse(
        &self,
        parser: &mut Parser,
        source: &str,
        old_tree: Option<&Tree>,
    ) -> Result<ParseOutput>;
    fn collect_diagnostics(&self, source: &str, tree: &Tree) -> Vec<ParseDiagnostic>;

    fn extract_symbols(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Symbol>;
    fn extract_imports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Import>;
    fn extract_exports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<ExportFact>;
    fn extract_call_edges(
        &self,
        ctx: &ExtractionContext<'_>,
        tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<CallEdge>;
    fn extract_references(
        &self,
        ctx: &ExtractionContext<'_>,
        tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<Reference>;
    fn extract_inheritance(
        &self,
        ctx: &ExtractionContext<'_>,
        tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<TypeRelation>;
    fn extract_chunks(
        &self,
        ctx: &ExtractionContext<'_>,
        tree: &Tree,
        symbols: &[Symbol],
    ) -> Vec<Chunk>;
    fn resolve_imports(
        &self,
        ctx: &ExtractionContext<'_>,
        imports: &mut [Import],
        symbols: &[Symbol],
    ) -> Vec<UnresolvedImport>;
    fn bind_references(
        &self,
        ctx: &ExtractionContext<'_>,
        references: &mut [Reference],
        symbols: &[Symbol],
        import_map: &[Import],
    );
    fn bind_call_edges(
        &self,
        ctx: &ExtractionContext<'_>,
        calls: &mut [CallEdge],
        symbols: &[Symbol],
        import_map: &[Import],
    );
    fn structure_fingerprint(
        &self,
        symbols: &[Symbol],
        imports: &[Import],
        exports: &[ExportFact],
    ) -> String;
    fn public_api_fingerprint(&self, symbols: &[Symbol], exports: &[ExportFact]) -> String;
}

#[allow(dead_code)]
fn _placeholders(_events: Vec<IndexProgressEvent>, _changes: Vec<FileChangeEvent>) {}
