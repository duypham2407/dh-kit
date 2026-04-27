import type { AgentModelAssignment, ResolvedModelSelection } from "../../../shared/src/types/model.js";
import { listModels } from "../registry/model-registry.js";
import { listProviders } from "../registry/provider-registry.js";
import { listVariants } from "../registry/variant-registry.js";
import { resolveFallbackModel } from "./resolve-fallback-model.js";

export function resolveAgentModel(repoRoot: string, agentId: string, assignment?: AgentModelAssignment): ResolvedModelSelection {
  if (assignment) {
    validateResolvedModel(repoRoot, agentId, assignment.providerId, assignment.modelId, assignment.variantId);
    return {
      providerId: assignment.providerId,
      modelId: assignment.modelId,
      variantId: assignment.variantId,
    };
  }

  return resolveFallbackModel(repoRoot, agentId);
}

export function validateResolvedModel(repoRoot: string, agentId: string, providerId: string, modelId: string, variantId: string): void {
  const provider = listProviders(repoRoot).find((entry) => entry.providerId === providerId && entry.enabled);
  if (!provider) {
    throw new Error(`Provider '${providerId}' is not enabled for agent '${agentId}'.`);
  }

  const model = listModels(repoRoot, providerId).find((entry) => entry.modelId === modelId && entry.available);
  if (!model) {
    throw new Error(`Model '${modelId}' is not available for provider '${providerId}' and agent '${agentId}'.`);
  }

  const variant = listVariants(repoRoot, providerId, modelId).find((entry) => entry.variantId === variantId && entry.available);
  if (!variant) {
    throw new Error(`Variant '${variantId}' is not available for model '${modelId}' and agent '${agentId}'.`);
  }
}
