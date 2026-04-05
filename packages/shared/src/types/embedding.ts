export type EmbeddingProviderConfig = {
  providerId: string;
  modelName: string;
  apiKeyEnvVar: string;
  baseUrl?: string;
  dimensions: number;
  maxBatchSize: number;
};

export type EmbeddingRequest = {
  texts: string[];
  model: string;
};

export type EmbeddingResponse = {
  vectors: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
};

export type ChunkInput = {
  fileId: string;
  filePath: string;
  symbolId?: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  language: string;
};

export type SemanticSearchResult = {
  chunkId: string;
  filePath: string;
  symbolId?: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  similarity: number;
  language: string;
};

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingProviderConfig = {
  providerId: "openai",
  modelName: "text-embedding-3-small",
  apiKeyEnvVar: "OPENAI_API_KEY",
  dimensions: 1536,
  maxBatchSize: 96,
};
