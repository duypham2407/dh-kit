//! Parser crate for tree-sitter based extraction.
//! This crate will host language adapters and normalized fact extraction.

use anyhow::Result;
use dh_types::{
    CallEdge, Chunk, ExportFact, FileChangeEvent, Import, IndexProgressEvent, LanguageId, ParseDiagnostic,
    Reference, Symbol,
};
use std::path::Path;
use tree_sitter::{Parser, Tree};

pub struct ParseOutput {
    pub tree: Tree,
    pub has_errors: bool,
    pub language: LanguageId,
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

pub trait LanguageAdapter: Send + Sync {
    fn language_id(&self) -> LanguageId;
    fn display_name(&self) -> &'static str;
    fn file_extensions(&self) -> &'static [&'static str];
    fn grammar(&self) -> tree_sitter::Language;

    fn matches_path(&self, path: &Path) -> bool;
    fn detect_from_shebang(&self, shebang: &str) -> bool;

    fn parse(&self, parser: &mut Parser, source: &str, old_tree: Option<&Tree>) -> Result<ParseOutput>;
    fn collect_diagnostics(&self, source: &str, tree: &Tree) -> Vec<ParseDiagnostic>;

    fn extract_symbols(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Symbol>;
    fn extract_imports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Import>;
    fn extract_exports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<ExportFact>;
    fn extract_call_edges(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<CallEdge>;
    fn extract_references(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<Reference>;
    fn extract_inheritance(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<TypeRelation>;
    fn extract_chunks(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<Chunk>;
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
    fn structure_fingerprint(&self, symbols: &[Symbol], imports: &[Import], exports: &[ExportFact]) -> String;
    fn public_api_fingerprint(&self, symbols: &[Symbol], exports: &[ExportFact]) -> String;
}

#[allow(dead_code)]
fn _placeholders(_events: Vec<IndexProgressEvent>, _changes: Vec<FileChangeEvent>) {}
