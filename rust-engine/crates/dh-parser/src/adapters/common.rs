use crate::ExtractionContext;
use dh_types::{
    Chunk, ChunkKind, EmbeddingStatus, ExportFact, Import, ParseDiagnostic, Span, Symbol,
};
use tree_sitter::{Node, Tree};

pub fn stable_id(material: &str) -> i64 {
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

pub fn blake3_hex(input: &str) -> String {
    blake3::hash(input.as_bytes()).to_hex().to_string()
}

pub fn node_text(node: Node<'_>, source: &str) -> String {
    node.utf8_text(source.as_bytes()).unwrap_or("").to_string()
}

pub fn span_from_node(node: Node<'_>) -> Span {
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

pub fn span_from_byte_range(source: &str, start: u32, end: u32) -> Span {
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

pub fn walk_named_nodes(root: Node<'_>) -> Vec<Node<'_>> {
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

pub fn collect_syntax_diagnostics(source: &str, tree: &Tree) -> Vec<ParseDiagnostic> {
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

    diagnostics.sort_by_key(|diag| {
        (
            diag.span
                .as_ref()
                .map(|span| span.start_byte)
                .unwrap_or(u32::MAX),
            diag.message.clone(),
        )
    });
    diagnostics.dedup_by(|a, b| {
        a.message == b.message
            && a.span.as_ref().map(|span| span.start_byte)
                == b.span.as_ref().map(|span| span.start_byte)
    });

    if diagnostics.is_empty() && tree.root_node().has_error() {
        diagnostics.push(ParseDiagnostic {
            level: "error".to_string(),
            message: "tree contains recoverable parse errors".to_string(),
            span: Some(span_from_node(tree.root_node())),
        });
    }

    if diagnostics.is_empty() && source.trim().is_empty() {
        diagnostics.push(ParseDiagnostic {
            level: "warning".to_string(),
            message: "file is empty".to_string(),
            span: None,
        });
    }

    diagnostics
}

pub fn first_line(input: &str, max_len: usize) -> String {
    let line = input.lines().next().unwrap_or("").trim();
    if line.len() <= max_len {
        return line.to_string();
    }
    format!("{}…", &line[..max_len])
}

pub fn text_by_byte_range(source: &str, start: u32, end: u32) -> String {
    let start = start as usize;
    let end = end as usize;
    if start >= end || start >= source.len() {
        return String::new();
    }

    let mut safe_start = start.min(source.len());
    while safe_start > 0 && !source.is_char_boundary(safe_start) {
        safe_start -= 1;
    }

    let mut safe_end = end.min(source.len());
    while safe_end > safe_start && !source.is_char_boundary(safe_end) {
        safe_end -= 1;
    }

    source[safe_start..safe_end].to_string()
}

pub fn estimate_tokens(content: &str) -> u32 {
    let bytes = content.len() as u32;
    (bytes / 4).max(1)
}

pub fn byte_end_for_first_n_lines(source: &str, lines: usize) -> u32 {
    if lines == 0 {
        return 0;
    }

    let mut line_count = 1_usize;
    for (idx, byte) in source.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            if line_count >= lines {
                return (idx + 1) as u32;
            }
            line_count += 1;
        }
    }

    source.len() as u32
}

pub fn line_col_at_byte(source: &str, byte: usize) -> (u32, u32) {
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

pub fn find_enclosing_symbol(symbols: &[Symbol], byte: u32) -> Option<i64> {
    symbols
        .iter()
        .filter(|symbol| symbol.span.start_byte <= byte && byte <= symbol.span.end_byte)
        .min_by_key(|symbol| symbol.span.end_byte.saturating_sub(symbol.span.start_byte))
        .map(|symbol| symbol.id)
}

pub fn build_basic_chunks(
    ctx: &ExtractionContext<'_>,
    language: dh_types::LanguageId,
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

    chunks.push(Chunk {
        id: stable_id(&format!("chunk|{}|header|{}", ctx.file_id, ctx.rel_path)),
        workspace_id: ctx.workspace_id,
        file_id: ctx.file_id,
        symbol_id: None,
        parent_symbol_id: None,
        kind: ChunkKind::FileHeader,
        language,
        title: format!("{} header", ctx.rel_path),
        content_hash: blake3_hex(&header_content),
        token_estimate: estimate_tokens(&header_content),
        content: header_content,
        span: span_from_byte_range(ctx.source, 0, header_end),
        prev_chunk_id: None,
        next_chunk_id: None,
        embedding_status: EmbeddingStatus::NotQueued,
    });

    for symbol in symbols {
        let content = text_by_byte_range(ctx.source, symbol.span.start_byte, symbol.span.end_byte);
        chunks.push(Chunk {
            id: stable_id(&format!(
                "chunk|{}|symbol|{}|{}|{}",
                ctx.file_id, ctx.rel_path, symbol.qualified_name, symbol.span.start_byte
            )),
            workspace_id: ctx.workspace_id,
            file_id: ctx.file_id,
            symbol_id: Some(symbol.id),
            parent_symbol_id: symbol.parent_symbol_id,
            kind: if symbol.kind == dh_types::SymbolKind::Method {
                ChunkKind::Method
            } else {
                ChunkKind::Symbol
            },
            language,
            title: symbol.qualified_name.clone(),
            content_hash: blake3_hex(&content),
            token_estimate: estimate_tokens(&content),
            content,
            span: symbol.span,
            prev_chunk_id: None,
            next_chunk_id: None,
            embedding_status: EmbeddingStatus::NotQueued,
        });
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

pub fn structure_fingerprint(
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

pub fn public_api_fingerprint(symbols: &[Symbol], exports: &[ExportFact]) -> String {
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
