import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import { listModels } from "../../../providers/src/registry/model-registry.js";
import { listProviders } from "../../../providers/src/registry/provider-registry.js";
import { listVariants } from "../../../providers/src/registry/variant-registry.js";
import { validateResolvedModel } from "../../../providers/src/resolution/resolve-agent-model.js";
import { AgentModelAssignmentsRepo } from "../../../storage/src/sqlite/repositories/agent-model-assignments-repo.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import type { AgentModelAssignment, ModelRegistryEntry, ProviderRegistryEntry, VariantRegistryEntry } from "../../../shared/src/types/model.js";
import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import type { EmbeddingProviderConfig } from "../../../shared/src/types/embedding.js";
import type { SemanticMode } from "../../../shared/src/types/lane.js";
import { DEFAULT_EMBEDDING_CONFIG } from "../../../shared/src/types/embedding.js";

export type ConfigService = {
  listAgents(): AgentRegistryEntry[];
  getAssignment(agentId: string): Promise<AgentModelAssignment | undefined>;
  listAssignments(): Promise<AgentModelAssignment[]>;
  listProviders(): ProviderRegistryEntry[];
  listModels(providerId: string): ModelRegistryEntry[];
  listVariants(providerId: string, modelId: string): VariantRegistryEntry[];
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
    listProviders,
    listModels,
    listVariants,
    assignModel: async (input) => {
      validateResolvedModel(input.agentId, input.providerId, input.modelId, input.variantId);
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
