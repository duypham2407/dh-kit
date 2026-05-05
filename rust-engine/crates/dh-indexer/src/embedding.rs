//! Embedding client trait and concrete implementations.
//!
//! `OpenAiEmbeddingClient` — real HTTP provider via OpenAI-compatible API.
//! `StubEmbeddingClient` — zero-vector fallback for environments without API keys.

use anyhow::{bail, Context, Result};
use dh_types::{EmbeddingConfig, EmbeddingProvider};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, warn};

// ─── Trait ───────────────────────────────────────────────────────────────────

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

    /// Returns whether this client produces real vectors (false for stub).
    fn is_real(&self) -> bool {
        true
    }

    /// Performs a lightweight connectivity test (embed one short string).
    fn health_check(&self) -> Result<()> {
        self.embed_query("dh engine health check")?;
        Ok(())
    }
}

// ─── OpenAI-compatible HTTP client ───────────────────────────────────────────

const OPENAI_DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const OPENAI_EMBED_PATH: &str = "/embeddings";
/// Max texts per API request (OpenAI limit: 2048, we use 100 for safety).
const BATCH_CHUNK_SIZE: usize = 100;
const REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a [String],
    encoding_format: &'a str,
}

#[derive(Debug, Deserialize)]
struct EmbedResponse {
    data: Vec<EmbedData>,
}

#[derive(Debug, Deserialize)]
struct EmbedData {
    embedding: Vec<f32>,
    index: usize,
}

/// Real HTTP-backed embedding client compatible with OpenAI and OpenAI-compatible APIs.
///
/// Reads API key from constructor and respects `config.base_url` for local models.
pub struct OpenAiEmbeddingClient {
    config: EmbeddingConfig,
    http: Client,
    endpoint: String,
    api_key: String,
}

impl OpenAiEmbeddingClient {
    /// Create from config + API key. Fails if the HTTP client cannot be built.
    pub fn new(config: EmbeddingConfig, api_key: String) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .context("build reqwest blocking client for embedding")?;

        let base_url = config
            .base_url
            .as_deref()
            .unwrap_or(OPENAI_DEFAULT_BASE_URL)
            .trim_end_matches('/');
        let endpoint = format!("{}{}", base_url, OPENAI_EMBED_PATH);

        Ok(Self {
            config,
            http,
            endpoint,
            api_key,
        })
    }

    /// Attempt to create from environment variables. Returns `None` if no API key.
    ///
    /// Env vars:
    /// - `OPENAI_API_KEY`           (required)
    /// - `DH_EMBEDDING_MODEL`       (default: `text-embedding-3-small`)
    /// - `DH_EMBEDDING_DIMENSIONS`  (default: `1536`)
    /// - `DH_EMBEDDING_BASE_URL`    (default: OpenAI API)
    pub fn from_env() -> Option<Result<Self>> {
        let api_key = std::env::var("OPENAI_API_KEY").ok()?;
        if api_key.trim().is_empty() {
            return None;
        }

        let model = std::env::var("DH_EMBEDDING_MODEL")
            .unwrap_or_else(|_| "text-embedding-3-small".to_string());
        let dimensions: usize = std::env::var("DH_EMBEDDING_DIMENSIONS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1536);
        let base_url = std::env::var("DH_EMBEDDING_BASE_URL").ok();

        let config = EmbeddingConfig {
            provider: EmbeddingProvider::OpenAI,
            model,
            dimensions,
            max_tokens: 512,
            base_url,
        };

        Some(Self::new(config, api_key))
    }

    fn call_embed_api(&self, texts: &[String]) -> Result<Vec<(usize, Vec<f32>)>> {
        let body = EmbedRequest {
            model: &self.config.model,
            input: texts,
            encoding_format: "float",
        };

        let resp = self
            .http
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .with_context(|| format!("POST {}", self.endpoint))?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().unwrap_or_default();
            bail!(
                "OpenAI embeddings API returned {}: {}",
                status,
                body_text.chars().take(200).collect::<String>()
            );
        }

        let parsed: EmbedResponse = resp.json().context("deserialize embeddings API response")?;

        Ok(parsed
            .data
            .into_iter()
            .map(|d| (d.index, d.embedding))
            .collect())
    }
}

impl EmbeddingClient for OpenAiEmbeddingClient {
    fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let mut result: Vec<Vec<f32>> = vec![vec![]; texts.len()];
        let dim = self.config.dimensions;

        // Send in chunks respecting the per-request batch limit.
        for (chunk_idx, chunk) in texts.chunks(BATCH_CHUNK_SIZE).enumerate() {
            let global_offset = chunk_idx * BATCH_CHUNK_SIZE;
            debug!(
                model = %self.config.model,
                batch_start = global_offset,
                batch_size = chunk.len(),
                "embedding batch"
            );

            let indexed = self.call_embed_api(&chunk.to_vec())?;

            for (local_idx, vector) in indexed {
                let global_idx = global_offset + local_idx;
                if global_idx >= result.len() {
                    bail!(
                        "Embedding API returned out-of-range index {} for batch of {}",
                        global_idx,
                        texts.len()
                    );
                }
                if vector.len() != dim {
                    warn!(
                        expected = dim,
                        got = vector.len(),
                        "embedding dimension mismatch — using returned vector as-is"
                    );
                }
                result[global_idx] = vector;
            }
        }

        // Guard: ensure no empty vectors slipped through.
        for (i, vec) in result.iter().enumerate() {
            if vec.is_empty() {
                bail!("Embedding API did not return a vector for input index {i}");
            }
        }

        Ok(result)
    }

    fn config(&self) -> &EmbeddingConfig {
        &self.config
    }
}

// ─── Stub (zero-vector fallback) ─────────────────────────────────────────────

/// A dummy embedding client that always returns zero-vectors.
/// Used when no API key is configured or for testing without network.
pub struct StubEmbeddingClient {
    config: EmbeddingConfig,
}

impl StubEmbeddingClient {
    pub fn new(config: EmbeddingConfig) -> Self {
        Self { config }
    }

    pub fn default_stub() -> Self {
        Self::new(EmbeddingConfig::default())
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

    fn is_real(&self) -> bool {
        false
    }

    fn health_check(&self) -> Result<()> {
        Ok(()) // Stub is always "healthy".
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/// Build the best available embedding client from environment.
/// Returns `OpenAiEmbeddingClient` if `OPENAI_API_KEY` is set, else `StubEmbeddingClient`.
pub fn build_embedding_client_from_env() -> Box<dyn EmbeddingClient> {
    match OpenAiEmbeddingClient::from_env() {
        Some(Ok(client)) => {
            tracing::info!(
                model = %client.config().model,
                "embedding provider: openai (real vectors)"
            );
            Box::new(client)
        }
        Some(Err(err)) => {
            warn!("Failed to build OpenAI embedding client: {err:#}. Falling back to stub.");
            Box::new(StubEmbeddingClient::default_stub())
        }
        None => {
            tracing::info!("No OPENAI_API_KEY set — embedding provider: stub (zero-vectors)");
            Box::new(StubEmbeddingClient::default_stub())
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn stub_config() -> EmbeddingConfig {
        EmbeddingConfig {
            provider: EmbeddingProvider::Stub,
            model: "stub".to_string(),
            dimensions: 4,
            max_tokens: 256,
            base_url: None,
        }
    }

    #[test]
    fn stub_embed_batch_returns_zero_vectors() {
        let client = StubEmbeddingClient::new(stub_config());
        let texts = vec!["hello".to_string(), "world".to_string()];
        let result = client.embed_batch(&texts).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], vec![0.0, 0.0, 0.0, 0.0]);
        assert_eq!(result[1], vec![0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn stub_embed_batch_empty_input() {
        let client = StubEmbeddingClient::new(stub_config());
        let result = client.embed_batch(&[]).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn stub_embed_query_returns_single_zero_vector() {
        let client = StubEmbeddingClient::new(stub_config());
        let result = client.embed_query("test").unwrap();
        assert_eq!(result.len(), 4);
        assert!(result.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn stub_is_not_real() {
        let client = StubEmbeddingClient::new(stub_config());
        assert!(!client.is_real());
    }

    #[test]
    fn stub_health_check_always_succeeds() {
        let client = StubEmbeddingClient::new(stub_config());
        assert!(client.health_check().is_ok());
    }

    #[test]
    fn build_from_env_falls_back_to_stub_when_no_key() {
        std::env::remove_var("OPENAI_API_KEY");
        let client = build_embedding_client_from_env();
        assert!(!client.is_real());
    }
}
