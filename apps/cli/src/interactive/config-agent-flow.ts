import { promptAgentSelection } from "./selectors/agent-selector.js";
import { ensureAvailableModels, promptModelSelection } from "./selectors/model-selector.js";
import { ensureEnabledProviders, promptProviderSelection } from "./selectors/provider-selector.js";
import { ensureAvailableVariants, promptVariantSelection } from "./selectors/variant-selector.js";
import { createConfigService } from "../../../../packages/opencode-app/src/config/config-service.js";

export type ConfigAgentFlowResult = {
  summary: string;
};

export async function runConfigAgentFlow(repoRoot: string): Promise<ConfigAgentFlowResult> {
  const configService = createConfigService(repoRoot);
  const agent = await promptAgentSelection(configService.listAgents());
  const currentAssignment = await configService.getAssignment(agent.agentId);
  const providers = ensureEnabledProviders(configService.listProviders());
  const provider = await promptProviderSelection(providers);
  const models = ensureAvailableModels(configService.listModels(provider.providerId));
  const model = await promptModelSelection(models);
  const variants = ensureAvailableVariants(configService.listVariants(provider.providerId, model.modelId));
  const variant = await promptVariantSelection(variants);

  await configService.assignModel({
    agentId: agent.agentId,
    providerId: provider.providerId,
    modelId: model.modelId,
    variantId: variant.variantId,
  });

  return {
    summary: [
      `Agent: ${agent.displayName}`,
      `Current: ${formatAssignment(currentAssignment)}`,
      `Updated: ${provider.displayName} / ${model.displayName} / ${variant.displayName}`,
    ].join("\n"),
  };
}

function formatAssignment(currentAssignment: Awaited<ReturnType<ReturnType<typeof createConfigService>["getAssignment"]>>): string {
  if (!currentAssignment) {
    return "none";
  }

  return `${currentAssignment.providerId} / ${currentAssignment.modelId} / ${currentAssignment.variantId}`;
}
