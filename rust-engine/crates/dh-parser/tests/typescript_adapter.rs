use dh_parser::{
    adapters::typescript::TypeScriptAdapter, pool::ParserPool, registry::LanguageRegistry,
    ExtractionContext, LanguageAdapter,
};
use dh_types::{CallKind, ChunkKind, ImportKind, LanguageId, ReferenceKind, SymbolKind};
use std::path::Path;

fn parse_with_adapter<'a>(
    adapter: &TypeScriptAdapter,
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
        file_id: 42,
        rel_path,
        source,
    };

    (parse_output, ctx)
}

#[test]
fn registry_and_pool_dispatch_for_ts_js_variants() {
    let mut registry = LanguageRegistry::new();
    for language in [
        LanguageId::TypeScript,
        LanguageId::Tsx,
        LanguageId::JavaScript,
        LanguageId::Jsx,
    ] {
        registry.register(TypeScriptAdapter::for_language(language));
    }

    assert_eq!(
        registry
            .by_path(Path::new("sample.ts"))
            .expect(".ts should match")
            .language_id(),
        LanguageId::TypeScript
    );
    assert_eq!(
        registry
            .by_path(Path::new("sample.tsx"))
            .expect(".tsx should match")
            .language_id(),
        LanguageId::Tsx
    );
    assert_eq!(
        registry
            .by_path(Path::new("sample.js"))
            .expect(".js should match")
            .language_id(),
        LanguageId::JavaScript
    );
    assert_eq!(
        registry
            .by_path(Path::new("sample.jsx"))
            .expect(".jsx should match")
            .language_id(),
        LanguageId::Jsx
    );

    let samples = [
        (LanguageId::TypeScript, "export const value: number = 1;"),
        (
            LanguageId::Tsx,
            "export const App = () => <div>Hello</div>;",
        ),
        (
            LanguageId::JavaScript,
            "const dep = require('./dep'); function run(){ dep(); }",
        ),
        (
            LanguageId::Jsx,
            "function App(){ return <section/>; } export default App;",
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
fn extracts_normalized_facts_from_ts_fixture() {
    let source = include_str!("fixtures/sample.ts");
    let adapter = TypeScriptAdapter::for_language(LanguageId::TypeScript);
    let (parsed, ctx) = parse_with_adapter(&adapter, "tests/fixtures/sample.ts", source);

    let symbols = adapter.extract_symbols(&ctx, &parsed.tree);
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Function && symbol.name == "helper"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Class && symbol.name == "Service"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Method && symbol.name == "method"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Interface && symbol.name == "User"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::TypeAlias && symbol.name == "Id"));
    assert!(symbols
        .iter()
        .any(|symbol| symbol.kind == SymbolKind::Enum && symbol.name == "Role"));
    assert!(symbols
        .iter()
        .any(|symbol| matches!(symbol.kind, SymbolKind::Constant | SymbolKind::Variable)));

    let imports = adapter.extract_imports(&ctx, &parsed.tree);
    assert!(imports
        .iter()
        .any(|item| item.kind == ImportKind::EsmDefault));
    assert!(imports.iter().any(|item| item.kind == ImportKind::EsmNamed));
    assert!(imports
        .iter()
        .any(|item| item.kind == ImportKind::EsmNamespace));
    assert!(imports
        .iter()
        .any(|item| item.kind == ImportKind::EsmSideEffect));
    assert!(imports.iter().any(|item| item.kind == ImportKind::ReExport));
    assert!(imports
        .iter()
        .any(|item| item.kind == ImportKind::CommonJsRequire));
    assert!(imports
        .iter()
        .any(|item| item.kind == ImportKind::ConditionalRequire));
    assert!(imports.iter().any(|item| item.kind == ImportKind::Dynamic));
    assert!(imports.iter().any(|item| item.is_type_only));
    assert!(imports.iter().any(|item| {
        item.raw_specifier == "./combo"
            && item.kind == ImportKind::EsmDefault
            && item.imported_name.as_deref() == Some("default")
            && item.local_name.as_deref() == Some("defaultNs")
    }));
    assert!(imports.iter().any(|item| {
        item.raw_specifier == "./combo"
            && item.kind == ImportKind::EsmNamespace
            && item.imported_name.as_deref() == Some("*")
            && item.local_name.as_deref() == Some("comboNs")
            && item.alias.as_deref() == Some("comboNs")
    }));

    let exports = adapter.extract_exports(&ctx, &parsed.tree);
    assert!(exports.iter().any(|item| item.exported_name == "reNamed"));
    assert!(exports.iter().any(|item| item.is_star));
    assert!(exports.iter().any(|item| item.is_type_only));
    assert!(exports.iter().any(|item| item.is_default));

    let calls = adapter.extract_call_edges(&ctx, &parsed.tree, &symbols);
    assert!(calls.iter().any(|item| item.kind == CallKind::Direct));
    assert!(calls.iter().any(|item| item.kind == CallKind::Method));
    assert!(calls.iter().any(|item| item.kind == CallKind::Constructor));

    let references = adapter.extract_references(&ctx, &parsed.tree, &symbols);
    assert!(references
        .iter()
        .any(|item| item.kind == ReferenceKind::Read));
    assert!(references
        .iter()
        .any(|item| item.kind == ReferenceKind::Write));
    assert!(references
        .iter()
        .any(|item| item.kind == ReferenceKind::Type));
    assert!(!references.iter().any(|item| item.target_name == "alpha"));
    assert!(!references.iter().any(|item| item.target_name == "beta"));

    let chunks = adapter.extract_chunks(&ctx, &parsed.tree, &symbols);
    let header = chunks
        .iter()
        .find(|item| item.kind == ChunkKind::FileHeader)
        .expect("header chunk must exist");
    assert!(chunks.iter().any(|item| item.kind == ChunkKind::FileHeader));
    assert!(chunks.iter().any(|item| item.kind == ChunkKind::Symbol));
    assert!(chunks.iter().any(|item| item.kind == ChunkKind::Method));
    assert!(chunks
        .iter()
        .any(|item| item.kind == ChunkKind::ClassSummary));
    assert!(
        header.span.end_byte >= header.span.start_byte
            && (header.content.is_empty() || header.span.end_byte > header.span.start_byte)
    );

    let mut imports_for_resolve = imports.clone();
    let unresolved = adapter.resolve_imports(&ctx, &mut imports_for_resolve, &symbols);
    assert!(!unresolved.is_empty());
    assert!(imports_for_resolve
        .iter()
        .all(|item| item.resolution_error.is_some()));

    let mut refs_for_bind = references.clone();
    let mut calls_for_bind = calls.clone();
    adapter.bind_references(&ctx, &mut refs_for_bind, &symbols, &imports_for_resolve);
    adapter.bind_call_edges(&ctx, &mut calls_for_bind, &symbols, &imports_for_resolve);

    let structure_fp_1 = adapter.structure_fingerprint(&symbols, &imports_for_resolve, &exports);
    let structure_fp_2 = adapter.structure_fingerprint(&symbols, &imports_for_resolve, &exports);
    assert_eq!(structure_fp_1, structure_fp_2);

    let public_api_fp_1 = adapter.public_api_fingerprint(&symbols, &exports);
    let public_api_fp_2 = adapter.public_api_fingerprint(&symbols, &exports);
    assert_eq!(public_api_fp_1, public_api_fp_2);
}

#[test]
fn file_header_span_matches_fallback_content_when_first_symbol_starts_at_zero() {
    let source = "export function root() {\n  return 1;\n}\n";
    let adapter = TypeScriptAdapter::for_language(LanguageId::TypeScript);
    let (parsed, ctx) = parse_with_adapter(&adapter, "tests/fixtures/header_zero.ts", source);

    let symbols = adapter.extract_symbols(&ctx, &parsed.tree);
    let chunks = adapter.extract_chunks(&ctx, &parsed.tree, &symbols);
    let header = chunks
        .iter()
        .find(|chunk| chunk.kind == ChunkKind::FileHeader)
        .expect("header chunk should exist");

    assert_eq!(header.span.start_byte, 0);
    assert_eq!(header.span.end_byte as usize, header.content.len());
    assert!(!header.content.is_empty());
}

#[test]
fn collects_diagnostics_for_recoverable_parse_errors() {
    let source = r#"
export function broken( {
  const x =
}
"#;

    let adapter = TypeScriptAdapter::for_language(LanguageId::TypeScript);
    let mut pool = ParserPool::new();
    let parser = pool
        .parser_for(adapter.language_id())
        .expect("parser should exist for TypeScript");
    let parsed = adapter
        .parse(parser, source, None)
        .expect("tree-sitter should still produce tree for recoverable errors");

    assert!(parsed.has_errors);
    let diagnostics = adapter.collect_diagnostics(source, &parsed.tree);
    assert!(!diagnostics.is_empty());
    assert!(diagnostics.iter().all(|diag| diag.level == "error"));
}

#[test]
fn parses_tsx_js_jsx_sources() {
    let cases = [
        (
            LanguageId::Tsx,
            "sample.tsx",
            "export const Component = () => <div>{value}</div>;",
        ),
        (
            LanguageId::JavaScript,
            "sample.js",
            "const dep = require('./dep'); function run(){ return dep(); } module.exports = run;",
        ),
        (
            LanguageId::Jsx,
            "sample.jsx",
            "function App(){ return <main/>; } exports.App = App;",
        ),
    ];

    for (language, rel_path, source) in cases {
        let adapter = TypeScriptAdapter::for_language(language);
        let (parsed, ctx) = parse_with_adapter(&adapter, rel_path, source);
        assert_eq!(parsed.language, language);

        let symbols = adapter.extract_symbols(&ctx, &parsed.tree);
        assert!(!symbols.is_empty());

        let imports = adapter.extract_imports(&ctx, &parsed.tree);
        if language == LanguageId::JavaScript {
            assert!(imports
                .iter()
                .any(|item| item.kind == ImportKind::CommonJsRequire));
        }

        let exports = adapter.extract_exports(&ctx, &parsed.tree);
        assert!(!exports.is_empty());
    }
}
