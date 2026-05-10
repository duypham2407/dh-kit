import type { AgentModelAssignment, ResolvedModelSelection } from "../../../shared/src/types/model.js";
import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import { listModelsAsync, listProvidersAsync, listVariantsAsync } from "../provider/legacy-adapter.js";
import { resolveFallbackModel } from "./resolve-fallback-model.js";

export async function resolveAgentModel(
  repoRoot: string,
  agentId: string,
  assignment?: AgentModelAssignment,
  fallbackAgent?: AgentRegistryEntry,
): Promise<ResolvedModelSelection> {
  if (assignment) {
    await validateResolvedModel(repoRoot, agentId, assignment.providerId, assignment.modelId, assignment.variantId);
    return {
      providerId: assignment.providerId,
      modelId: assignment.modelId,
      variantId: assignment.variantId,
    };
  }

  return resolveFallbackModel(repoRoot, agentId, fallbackAgent);
}

export async function validateResolvedModel(repoRoot: string, agentId: string, providerId: string, modelId: string, variantId: string): Promise<void> {
  const providers = await listProvidersAsync(repoRoot);
  const provider = providers.find((entry) => entry.providerId === providerId && entry.available);
  if (!provider) {
    throw new Error(`Provider '${providerId}' is not enabled for agent '${agentId}'.`);
  }

  const models = await listModelsAsync(providerId, repoRoot);
  const model = models.find((entry) => entry.modelId === modelId && entry.available);
  if (!model) {
    throw new Error(`Model '${modelId}' is not available for provider '${providerId}' and agent '${agentId}'.`);
  }

  const variants = await listVariantsAsync(providerId, modelId);
  const variant = variants.find((entry: any) => entry.variantId === variantId && entry.available !== false);
  if (!variant) {
    throw new Error(`Variant '${variantId}' is not available for model '${modelId}' and agent '${agentId}'.`);
  }
}
