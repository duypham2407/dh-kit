import type { ModelRegistryEntry } from "../../../../../packages/shared/src/types/model.js";
import { promptForSelection } from "../prompt.js";

export function selectModel(models: ModelRegistryEntry[]): ModelRegistryEntry {
  const model = models.find((entry) => entry.available);
  if (!model) {
    throw new Error("No available model is available.");
  }
  return model;
}

export function ensureAvailableModels(models: ModelRegistryEntry[]): ModelRegistryEntry[] {
  const availableModels = models.filter((entry) => entry.available);
  if (availableModels.length === 0) {
    throw new Error("No available model is available.");
  }
  return availableModels;
}

export async function promptModelSelection(models: ModelRegistryEntry[]): Promise<ModelRegistryEntry> {
  return promptForSelection({
    label: "Select model:",
    options: ensureAvailableModels(models),
    nonInteractiveFallback: ensureAvailableModels(models)[0],
  });
}
