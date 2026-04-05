import { createConfigService } from "../../../../packages/opencode-app/src/config/config-service.js";
import { reembedAllChunks, createEmbeddingProvider } from "../../../../packages/retrieval/src/semantic/embedding-pipeline.js";
import { ChunksRepo } from "../../../../packages/storage/src/sqlite/repositories/chunks-repo.js";
import { promptForSelection } from "./prompt.js";

export type ConfigEmbeddingFlowResult = {
  summary: string;
  reembedTriggered: boolean;
  reembedResult?: {
    embeddingsStored: number;
    totalTokens: number;
  };
};

type EmbeddingModelOption = {
  displayName: string;
  modelName: string;
  dimensions: number;
};

const EMBEDDING_MODEL_OPTIONS: EmbeddingModelOption[] = [
  { displayName: "text-embedding-3-small (1536d, cheapest)", modelName: "text-embedding-3-small", dimensions: 1536 },
  { displayName: "text-embedding-3-large (3072d, best quality)", modelName: "text-embedding-3-large", dimensions: 3072 },
  { displayName: "text-embedding-ada-002 (1536d, legacy)", modelName: "text-embedding-ada-002", dimensions: 1536 },
];

export async function runConfigEmbeddingFlow(repoRoot: string): Promise<ConfigEmbeddingFlowResult> {
  const configService = createConfigService(repoRoot);
  const currentConfig = configService.getEmbeddingConfig();

  const selected = await promptForSelection({
    label: `Current model: ${currentConfig.modelName} (${currentConfig.dimensions}d)\nSelect embedding model:`,
    options: EMBEDDING_MODEL_OPTIONS,
    nonInteractiveFallback: EMBEDDING_MODEL_OPTIONS[0],
  });

  const modelChanged = selected.modelName !== currentConfig.modelName;
  const oldModelName = currentConfig.modelName;

  // Persist the new config
  configService.setEmbeddingConfig({
    modelName: selected.modelName,
    dimensions: selected.dimensions,
  });

  const lines: string[] = [
    `Embedding model: ${oldModelName} -> ${selected.modelName}`,
    `Dimensions: ${currentConfig.dimensions} -> ${selected.dimensions}`,
  ];

  // If model changed and there are existing chunks, trigger reembedding
  if (modelChanged) {
    const chunksRepo = new ChunksRepo(repoRoot);
    const chunkCount = chunksRepo.count();

    if (chunkCount > 0) {
      lines.push(``, `Model changed. Re-embedding ${chunkCount} chunks...`);

      const newConfig = configService.getEmbeddingConfig();
      const provider = createEmbeddingProvider(newConfig);
      const result = await reembedAllChunks(repoRoot, provider, oldModelName);

      lines.push(
        `Re-embedding complete:`,
        `  embeddings stored: ${result.embeddingsStored}`,
        `  total tokens: ${result.totalTokens}`,
      );

      return {
        summary: lines.join("\n"),
        reembedTriggered: true,
        reembedResult: {
          embeddingsStored: result.embeddingsStored,
          totalTokens: result.totalTokens,
        },
      };
    }

    lines.push(``, `Model changed but no chunks exist yet. Run "dh index" first.`);
  } else {
    lines.push(``, `Model unchanged -- no re-embedding needed.`);
  }

  return {
    summary: lines.join("\n"),
    reembedTriggered: false,
  };
}
