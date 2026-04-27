export type ResolvedModelSelection = {
  providerId: string;
  modelId: string;
  variantId: string;
};

export type AgentModelAssignment = ResolvedModelSelection & {
  agentId: string;
  updatedAt: string;
};

import { ModelConfig, ProviderConfig } from "./config-schema.js";



export type Model = ModelConfig & {
  id: string;
  providerID: string;
  api: { npm: string; url: string; id: string };
  capabilities: {
    toolcall: boolean;
    reasoning: boolean;
    attachment: boolean;
    temperature: boolean;
    input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean; };
    output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean; };
    interleaved: boolean | { field: "reasoning_content" | "reasoning_details" };
  };
  limit: {
    context: number;
    input?: number;
    output: number;
  };
  cost: {
    input: number;
    output: number;
    cache: { read: number; write: number };
    experimentalOver200K?: { input: number; output: number; cache: { read: number; write: number } };
  };
  release_date?: string;
  family?: string;
};

export type Info = ProviderConfig & {
  models: Record<string, Model>;
};

export type ListResult = Record<string, Info>;

export type ModelRegistryEntry = any;
export type ProviderRegistryEntry = any;
export type VariantRegistryEntry = any;
