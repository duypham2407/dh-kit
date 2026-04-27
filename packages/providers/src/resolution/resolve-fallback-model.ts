import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import { listModelsAsync, listProvidersAsync, listVariantsAsync } from "../provider/legacy-adapter.js";
import type { ResolvedModelSelection } from "../../../shared/src/types/model.js";

export async function resolveFallbackModel(repoRoot: string, agentId: string): Promise<ResolvedModelSelection> {
  const agent = DEFAULT_AGENT_REGISTRY.find((entry) => entry.agentId === agentId);
  if (!agent?.defaultProvider || !agent.defaultModel || !agent.defaultVariant) {
    throw new Error(`No default model fallback is configured for agent '${agentId}'.`);
  }

  const providers = await listProvidersAsync();
  const provider = providers.find((entry) => entry.providerId === agent.defaultProvider && entry.available);
  if (!provider) {
    throw new Error(`Default provider '${agent.defaultProvider}' is not enabled for agent '${agentId}'.`);
  }

  const models = await listModelsAsync(agent.defaultProvider);
  const model = models.find((entry) => entry.modelId === agent.defaultModel && entry.available);
  if (!model) {
    throw new Error(`Default model '${agent.defaultModel}' is not available for agent '${agentId}'.`);
  }

  const variants = await listVariantsAsync(agent.defaultProvider, agent.defaultModel);
  const variant = variants.find(
    (entry: any) => entry.variantId === agent.defaultVariant && entry.available !== false,
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
