use anyhow::Result;
use dh_types::EmbeddingConfig;

/// A client interface for generating vector embeddings from text.
pub trait EmbeddingClient: Send + Sync {
    /// Generates embeddings for a batch of text chunks.
    fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>;

    /// Generates an embedding for a single text query.
    fn embed_query(&self, text: &str) -> Result<Vec<f32>> {
        let mut results = self.embed_batch(&[text.to_string()])?;
        results
            .pop()
            .ok_or_else(|| anyhow::anyhow!("Empty embedding result"))
    }

    /// Returns the active configuration of this client.
    fn config(&self) -> &EmbeddingConfig;
}

/// A dummy embedding client that always returns zero-vectors.
pub struct StubEmbeddingClient {
    config: EmbeddingConfig,
}

impl StubEmbeddingClient {
    pub fn new(config: EmbeddingConfig) -> Self {
        Self { config }
    }
}

impl EmbeddingClient for StubEmbeddingClient {
    fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let dim = self.config.dimensions;
        Ok(texts.iter().map(|_| vec![0.0; dim]).collect())
    }

    fn config(&self) -> &EmbeddingConfig {
        &self.config
    }
}
