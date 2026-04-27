import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import { listModels } from "../registry/model-registry.js";
import { listProviders } from "../registry/provider-registry.js";
import { listVariants } from "../registry/variant-registry.js";
import type { ResolvedModelSelection } from "../../../shared/src/types/model.js";

export function resolveFallbackModel(repoRoot: string, agentId: string): ResolvedModelSelection {
  const agent = DEFAULT_AGENT_REGISTRY.find((entry) => entry.agentId === agentId);
  if (!agent?.defaultProvider || !agent.defaultModel || !agent.defaultVariant) {
    throw new Error(`No default model fallback is configured for agent '${agentId}'.`);
  }

  const provider = listProviders(repoRoot).find((entry) => entry.providerId === agent.defaultProvider && entry.enabled);
  if (!provider) {
    throw new Error(`Default provider '${agent.defaultProvider}' is not enabled for agent '${agentId}'.`);
  }

  const model = listModels(repoRoot, agent.defaultProvider).find((entry) => entry.modelId === agent.defaultModel && entry.available);
  if (!model) {
    throw new Error(`Default model '${agent.defaultModel}' is not available for agent '${agentId}'.`);
  }

  const variant = listVariants(repoRoot, agent.defaultProvider, agent.defaultModel).find(
    (entry) => entry.variantId === agent.defaultVariant && entry.available,
  );
  if (!variant) {
    throw new Error(`Default variant '${agent.defaultVariant}' is not available for agent '${agentId}'.`);
  }

  return {
    providerId: provider.providerId,
    modelId: model.modelId,
    variantId: variant.variantId,
  };
}
