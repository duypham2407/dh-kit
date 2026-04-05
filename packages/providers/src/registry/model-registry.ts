import type { ModelRegistryEntry } from "../../../shared/src/types/model.js";

const MODELS: ModelRegistryEntry[] = [
  { providerId: "openai", modelId: "gpt-5", displayName: "gpt-5", available: true, supportsVariants: true },
  { providerId: "openai", modelId: "gpt-codex", displayName: "gpt-codex", available: true, supportsVariants: true },
  { providerId: "anthropic", modelId: "claude-opus", displayName: "claude-opus", available: true, supportsVariants: true },
];

export function listModels(providerId: string): ModelRegistryEntry[] {
  return MODELS.filter((model) => model.providerId === providerId);
}
