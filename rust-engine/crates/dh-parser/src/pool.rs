//! Per-worker parser cache for tree-sitter language parsers.

use anyhow::{anyhow, Context, Result};
use dh_types::LanguageId;
use std::collections::HashMap;
use tree_sitter::Parser;

/// Per-worker parser pool keyed by [`LanguageId`].
///
/// Parsers are reused to reduce allocation and language setup overhead.
#[derive(Default)]
pub struct ParserPool {
    parsers: HashMap<LanguageId, Parser>,
}

impl ParserPool {
    /// Create an empty parser pool.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Get a mutable parser configured for the requested language.
    pub fn parser_for(&mut self, language: LanguageId) -> Result<&mut Parser> {
        let parser = self.parsers.entry(language).or_insert_with(Parser::new);

        let grammar = grammar_for(language)
            .ok_or_else(|| anyhow!("unsupported language for parser pool: {language:?}"))?;

        parser
            .set_language(&grammar)
            .with_context(|| format!("set parser language: {language:?}"))?;

        Ok(parser)
    }
}

fn grammar_for(language: LanguageId) -> Option<tree_sitter::Language> {
    match language {
        LanguageId::TypeScript => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        LanguageId::Tsx => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        LanguageId::JavaScript | LanguageId::Jsx => Some(tree_sitter_javascript::LANGUAGE.into()),
        LanguageId::Python => Some(tree_sitter_python::LANGUAGE.into()),
        LanguageId::Go => Some(tree_sitter_go::LANGUAGE.into()),
        LanguageId::Rust => Some(tree_sitter_rust::LANGUAGE.into()),
        _ => None,
    }
}
