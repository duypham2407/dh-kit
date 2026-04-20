//! Language adapter registry for parser dispatch.

use crate::LanguageAdapter;
use dh_types::LanguageId;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

/// Thread-safe registry of language adapters keyed by [`LanguageId`].
#[derive(Default)]
pub struct LanguageRegistry {
    by_id: HashMap<LanguageId, Arc<dyn LanguageAdapter>>,
    adapters: Vec<Arc<dyn LanguageAdapter>>,
}

impl LanguageRegistry {
    /// Create an empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Register or replace an adapter for its [`LanguageId`].
    pub fn register<A>(&mut self, adapter: A)
    where
        A: LanguageAdapter + 'static,
    {
        let adapter: Arc<dyn LanguageAdapter> = Arc::new(adapter);
        self.register_arc(adapter);
    }

    /// Register an already `Arc`-wrapped adapter.
    pub fn register_arc(&mut self, adapter: Arc<dyn LanguageAdapter>) {
        let language_id = adapter.language_id();
        self.by_id.insert(language_id, Arc::clone(&adapter));
        self.adapters
            .retain(|existing| existing.language_id() != language_id);
        self.adapters.push(adapter);
    }

    /// Lookup adapter by language id.
    #[must_use]
    pub fn by_language(&self, language_id: LanguageId) -> Option<Arc<dyn LanguageAdapter>> {
        self.by_id.get(&language_id).cloned()
    }

    /// Lookup adapter using file extension.
    #[must_use]
    pub fn by_path(&self, path: &Path) -> Option<Arc<dyn LanguageAdapter>> {
        self.adapters
            .iter()
            .find(|adapter| adapter.matches_path(path))
            .cloned()
    }

    /// Returns all registered adapters.
    #[must_use]
    pub fn adapters(&self) -> &[Arc<dyn LanguageAdapter>] {
        &self.adapters
    }
}
