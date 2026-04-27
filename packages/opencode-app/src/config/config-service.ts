import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import { listProvidersAsync, listModelsAsync, listVariantsAsync } from "../../../providers/src/provider/legacy-adapter.js";
import { validateResolvedModel } from "../../../providers/src/resolution/resolve-agent-model.js";
import { AgentModelAssignmentsRepo } from "../../../storage/src/sqlite/repositories/agent-model-assignments-repo.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import type { AgentModelAssignment, ModelRegistryEntry, ProviderRegistryEntry, VariantRegistryEntry } from "../../../shared/src/types/model.js";
import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import type { EmbeddingProviderConfig } from "../../../shared/src/types/embedding.js";
import type { SemanticMode } from "../../../shared/src/types/lane.js";
import { DEFAULT_EMBEDDING_CONFIG } from "../../../shared/src/types/embedding.js";
import { loadOpencodeConfig } from "./config-loader.js";
import type { OpencodeConfig } from "../../../shared/src/types/config-schema.js";

export type ConfigService = {
  loadProviderConfig(): OpencodeConfig["provider"];
  listAgents(): AgentRegistryEntry[];
  getAssignment(agentId: string): Promise<AgentModelAssignment | undefined>;
  listAssignments(): Promise<AgentModelAssignment[]>;
  listProviders(): Promise<ProviderRegistryEntry[]>;
  listModels(providerId: string): Promise<ModelRegistryEntry[]>;
  listVariants(providerId: string, modelId: string): Promise<VariantRegistryEntry[]>;
  assignModel(input: Omit<AgentModelAssignment, "updatedAt">): Promise<AgentModelAssignment>;
  getSemanticMode(): SemanticMode;
  setSemanticMode(mode: SemanticMode): void;
  getEmbeddingConfig(): EmbeddingProviderConfig;
  setEmbeddingConfig(config: Partial<EmbeddingProviderConfig>): void;
};

export function createConfigService(repoRoot: string): ConfigService {
  const repo = new AgentModelAssignmentsRepo(repoRoot);
  const configRepo = new ConfigRepo(repoRoot);
  return {
    listAgents: () => DEFAULT_AGENT_REGISTRY,
    getAssignment: (agentId) => repo.findByAgentId(agentId),
    listAssignments: () => repo.list(),
    loadProviderConfig: () => {
      const config = loadOpencodeConfig(repoRoot);
      return config?.provider;
    },
    listProviders: () => listProvidersAsync(),
    listModels: (providerId) => listModelsAsync(providerId),
    listVariants: (providerId, modelId) => listVariantsAsync(providerId, modelId),
    assignModel: async (input) => {
      await validateResolvedModel(repoRoot, input.agentId, input.providerId, input.modelId, input.variantId);
      return repo.saveAssignment(input);
    },
    getSemanticMode: () => {
      return configRepo.read<SemanticMode>("semantic.mode") ?? "always";
    },
    setSemanticMode: (mode) => {
      configRepo.write("semantic.mode", mode);
    },
    getEmbeddingConfig: () => {
      const stored = configRepo.read<Partial<EmbeddingProviderConfig>>("embedding.provider");
      return { ...DEFAULT_EMBEDDING_CONFIG, ...stored };
    },
    setEmbeddingConfig: (config) => {
      const current = configRepo.read<Partial<EmbeddingProviderConfig>>("embedding.provider") ?? {};
      configRepo.write("embedding.provider", { ...current, ...config });
    },
  };
}
