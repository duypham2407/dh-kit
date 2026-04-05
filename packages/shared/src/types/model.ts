export type ResolvedModelSelection = {
  providerId: string;
  modelId: string;
  variantId: string;
};

export type AgentModelAssignment = ResolvedModelSelection & {
  agentId: string;
  updatedAt: string;
};

export type ProviderRegistryEntry = {
  providerId: string;
  displayName: string;
  enabled: boolean;
  supportsVariants: boolean;
};

export type ModelRegistryEntry = {
  providerId: string;
  modelId: string;
  displayName: string;
  available: boolean;
  supportsVariants: boolean;
};

export type VariantRegistryEntry = {
  providerId: string;
  modelId: string;
  variantId: string;
  displayName: string;
  available: boolean;
};
