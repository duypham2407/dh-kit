import { loadProviderRegistry, loadProviderRuntimeConfig } from "../config/provider-config-loader.js";
import * as ModelsDev from "../models-dev.js";

export type ProviderRegistryEntry = { providerId: string; name: string; available: boolean; priority: number };
export type ModelRegistryEntry = { providerId: string; modelId: string; name: string; available: boolean };
export type VariantRegistryEntry = { providerId: string; modelId: string; variantId: string };

export async function listProvidersAsync(repoRoot = process.cwd()): Promise<ProviderRegistryEntry[]> {
  const report = await loadProviderRegistry(repoRoot);
  return report.providers.map((provider) => ({
    providerId: provider.providerId,
    name: provider.name,
    available: provider.enabled && provider.runtimeAvailable,
    priority: 0,
  }));
}

export async function listModelsAsync(providerId: string, repoRoot = process.cwd()): Promise<ModelRegistryEntry[]> {
  const catalog = await ModelsDev.get();
  const report = await loadProviderRegistry(repoRoot, { catalog });
  const provider = report.providers.find((entry) => entry.providerId === providerId);
  if (!provider?.enabled) return [];

  const runtime = await loadProviderRuntimeConfig(repoRoot, providerId, { catalog });
  return Object.entries(runtime.models ?? {}).map(([modelId, model]: [string, any]) => ({
    providerId,
    modelId,
    name: model.name || modelId,
    available: true,
  }));
}

export async function listVariantsAsync(providerId: string, modelId: string): Promise<VariantRegistryEntry[]> {
  return ["default", "high-reasoning", "tool-use-optimized"].map((variantId) => ({
    providerId,
    modelId,
    variantId,
  }));
}
