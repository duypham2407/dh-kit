// Simple branded types for ProviderID and ModelID.
// In OpenCode this uses Effect.Schema.brand, here we use simple TS branding.

export type ProviderID = string & { readonly __brand: unique symbol };
export type ModelID = string & { readonly __brand: unique symbol };

export const ProviderID = {
  make: (id: string): ProviderID => id as ProviderID,
  opencode: "opencode" as ProviderID,
  anthropic: "anthropic" as ProviderID,
  openai: "openai" as ProviderID,
  google: "google" as ProviderID,
  googleVertex: "google-vertex" as ProviderID,
  githubCopilot: "github-copilot" as ProviderID,
  amazonBedrock: "amazon-bedrock" as ProviderID,
  azure: "azure" as ProviderID,
  openrouter: "openrouter" as ProviderID,
  mistral: "mistral" as ProviderID,
  gitlab: "gitlab" as ProviderID,
};

export const ModelID = {
  make: (id: string): ModelID => id as ModelID,
};
