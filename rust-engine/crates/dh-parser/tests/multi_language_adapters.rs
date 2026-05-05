use dh_parser::{
    adapters::{go::GoAdapter, python::PythonAdapter, rust::RustAdapter},
    pool::ParserPool,
    registry::LanguageRegistry,
    ExtractionContext, LanguageAdapter,
};
use dh_types::{ImportKind, LanguageId, ParseStatus, SymbolKind};
use std::path::Path;

fn parse_with_adapter<'a, A: LanguageAdapter>(
    adapter: &A,
    rel_path: &'a str,
    source: &'a str,
) -> (dh_parser::ParseOutput, ExtractionContext<'a>) {
    let mut pool = ParserPool::new();
    let parser = pool
        .parser_for(adapter.language_id())
        .expect("parser for adapter language should be available");
    let parse_output = adapter
        .parse(parser, source, None)
        .expect("source should parse for test fixture");

    let ctx = ExtractionContext {
        workspace_id: 1,
        root_id: 1,
        package_id: Some(1),
        file_id: 41,
        rel_path,
        source,
        abs_path: None,
        workspace_root: None,
        workspace_roots: Vec::new(),
        package_roots: Vec::new(),
    };

    (parse_output, ctx)
}

#[test]
fn registry_and_pool_dispatch_for_python_go_rust() {
    let mut registry = LanguageRegistry::new();
    registry.register(PythonAdapter);
    registry.register(GoAdapter);
    registry.register(RustAdapter);

    assert_eq!(
        registry
            .by_path(Path::new("sample.py"))
            .expect(".py should match")
            .language_id(),
        LanguageId::Python
    );
    assert_eq!(
        registry
            .by_path(Path::new("sample.go"))
            .expect(".go should match")
            .language_id(),
        LanguageId::Go
    );
    assert_eq!(
        registry
            .by_path(Path::new("sample.rs"))
            .expect(".rs should match")
            .language_id(),
        LanguageId::Rust
    );

    let samples = [
        (
            LanguageId::Python,
            "def helper(x):\n    return x + 1\n\nclass Service:\n    def run(self):\n        return helper(1)\n",
        ),
        (
            LanguageId::Go,
            "package main\n\nimport \"fmt\"\n\nfunc Helper() int {\n    return 1\n}\n\nfunc main() {\n    fmt.Println(Helper())\n}\n",
        ),
        (
            LanguageId::Rust,
            "use crate::util::helper;\n\npub fn run() {\n    helper();\n}\n\npub struct Service;\n",
        ),
    ];

    let mut pool = ParserPool::new();
    for (language, source) in samples {
        let adapter = registry
            .by_language(language)
            .expect("adapter should be registered for language");
        let parser = pool
            .parser_for(language)
            .expect("parser should be available for language");
        let parsed = adapter
            .parse(parser, source, None)
            .expect("source should parse in pool parser");
        assert_eq!(parsed.language, language);
        assert!(parsed.tree.root_node().named_child_count() > 0);
    }
}

#[test]
fn python_adapter_extracts_bounded_structural_facts() {
    let source = r#"
import os
from pkg.subpkg import helper as helper_alias
from pkg.star import *

VALUE = 1

class Service(BaseService):
    def run(self):
        return helper_alias(VALUE)

def helper(value):
    return value + 1
"#;

    let adapter = PythonAdapter;
    let (parsed, ctx) = parse_with_adapter(&adapter, "tests/fixtures/sample.py", source);

    let symbols = adapter.extract_symbols(&ctx, &parsed.tree);
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Class && symbol.name == "Service"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Function && symbol.name == "helper"));

    let imports = adapter.extract_imports(&ctx, &parsed.tree);
    assert!(imports.iter().any(|item| item.raw_specifier == "os"));
    assert!(imports.iter().any(|item| item.raw_specifier == "pkg.subpkg"
        && item.imported_name.as_deref() == Some("helper")));
    assert!(
        imports
            .iter()
            .any(|item| item.raw_specifier == "pkg.star"
                && item.imported_name.as_deref() == Some("*"))
    );

    let exports = adapter.extract_exports(&ctx, &parsed.tree);
    assert!(exports.iter().any(|item| item.exported_name == "Service"));

    let calls = adapter.extract_call_edges(&ctx, &parsed.tree, &symbols);
    assert!(calls
        .iter()
        .any(|item| item.callee_display_name.contains("helper_alias")));

    let references = adapter.extract_references(&ctx, &parsed.tree, &symbols);
    assert!(references.iter().any(|item| item.target_name == "VALUE"));

    let chunks = adapter.extract_chunks(&ctx, &parsed.tree, &symbols);
    assert!(chunks
        .iter()
        .any(|item| item.kind == dh_types::ChunkKind::FileHeader));
    assert!(chunks
        .iter()
        .any(|item| item.kind == dh_types::ChunkKind::Symbol));

    let mut imports_for_resolve = imports.clone();
    let unresolved = adapter.resolve_imports(&ctx, &mut imports_for_resolve, &symbols);
    assert!(!unresolved.is_empty());
    assert!(imports_for_resolve
        .iter()
        .all(|item| item.resolution_error.is_some()));

    let diagnostics = adapter.collect_diagnostics(source, &parsed.tree);
    assert!(diagnostics.iter().all(|diag| !diag.level.is_empty()));
}

#[test]
fn go_adapter_extracts_bounded_structural_facts() {
    let source = r#"
package service

import (
    "fmt"
    alias "example.com/shared"
)

type Service struct{}

func (s Service) Run() int {
    fmt.Println(alias.Helper())
    return Helper()
}

func Helper() int { return 1 }
"#;

    let adapter = GoAdapter;
    let (parsed, ctx) = parse_with_adapter(&adapter, "tests/fixtures/sample.go", source);

    let symbols = adapter.extract_symbols(&ctx, &parsed.tree);
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Struct && symbol.name == "Service"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Function && symbol.name == "Helper"));

    let imports = adapter.extract_imports(&ctx, &parsed.tree);
    assert!(imports.iter().any(|item| item.raw_specifier == "fmt"));
    assert!(imports
        .iter()
        .any(|item| item.raw_specifier == "example.com/shared"));
    assert!(imports.iter().all(|item| item.kind == ImportKind::EsmNamed));

    let exports = adapter.extract_exports(&ctx, &parsed.tree);
    assert!(exports.iter().any(|item| item.exported_name == "Service"));
    assert!(exports.iter().any(|item| item.exported_name == "Helper"));

    let calls = adapter.extract_call_edges(&ctx, &parsed.tree, &symbols);
    assert!(!calls.is_empty());

    let references = adapter.extract_references(&ctx, &parsed.tree, &symbols);
    assert!(references.iter().any(|item| item.target_name == "Helper"));

    let chunks = adapter.extract_chunks(&ctx, &parsed.tree, &symbols);
    assert!(chunks
        .iter()
        .any(|item| item.kind == dh_types::ChunkKind::FileHeader));

    let mut imports_for_resolve = imports.clone();
    let unresolved = adapter.resolve_imports(&ctx, &mut imports_for_resolve, &symbols);
    assert!(!unresolved.is_empty());
}

#[test]
fn rust_adapter_extracts_bounded_structural_facts() {
    let source = r#"
use crate::dep::helper;

pub struct Service;

pub fn run() {
    helper();
}

pub trait Worker {
    fn work(&self);
}

pub enum Status { Ready }
"#;

    let adapter = RustAdapter;
    let (parsed, ctx) = parse_with_adapter(&adapter, "tests/fixtures/sample.rs", source);

    let symbols = adapter.extract_symbols(&ctx, &parsed.tree);
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Struct && symbol.name == "Service"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Function && symbol.name == "run"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Trait && symbol.name == "Worker"));

    let imports = adapter.extract_imports(&ctx, &parsed.tree);
    assert!(imports
        .iter()
        .any(|item| item.raw_specifier.contains("crate::dep::helper")));

    let exports = adapter.extract_exports(&ctx, &parsed.tree);
    assert!(exports.iter().any(|item| item.exported_name == "Service"));
    assert!(exports.iter().any(|item| item.exported_name == "run"));

    let calls = adapter.extract_call_edges(&ctx, &parsed.tree, &symbols);
    assert!(calls
        .iter()
        .any(|item| item.callee_display_name.contains("helper")));

    let references = adapter.extract_references(&ctx, &parsed.tree, &symbols);
    assert!(references.iter().any(|item| item.target_name == "helper"));

    let chunks = adapter.extract_chunks(&ctx, &parsed.tree, &symbols);
    assert!(chunks
        .iter()
        .any(|item| item.kind == dh_types::ChunkKind::FileHeader));

    let mut imports_for_resolve = imports.clone();
    let unresolved = adapter.resolve_imports(&ctx, &mut imports_for_resolve, &symbols);
    assert!(!unresolved.is_empty());
}

#[test]
fn extract_file_facts_reports_parse_status_for_new_languages() {
    let source = "def helper(x):\n    return x\n";
    let mut registry = dh_parser::default_language_registry();
    registry.register(PythonAdapter);
    let mut pool = ParserPool::new();

    let ctx = ExtractionContext {
        workspace_id: 1,
        root_id: 1,
        package_id: Some(1),
        file_id: 42,
        rel_path: "sample.py",
        source,
        abs_path: None,
        workspace_root: None,
        workspace_roots: Vec::new(),
        package_roots: Vec::new(),
    };

    let facts = dh_parser::extract_file_facts(&registry, &mut pool, LanguageId::Python, &ctx)
        .expect("python extract_file_facts should succeed");
    assert!(matches!(
        facts.parse_status,
        ParseStatus::Parsed | ParseStatus::ParsedWithErrors
    ));
    assert!(!facts.symbols.is_empty());
}
