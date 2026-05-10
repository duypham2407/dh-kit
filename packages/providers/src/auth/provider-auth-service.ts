import type {
  ProviderCredentialResolution,
  ProviderLoginReport,
  ProviderLogoutReport,
} from "../../../shared/src/types/provider.js";
import { ProviderAuthStore } from "./provider-auth-store.js";

export function loginProvider(repoRoot: string, input: { providerId: string; apiKey?: string; apiKeyEnv?: string }): ProviderLoginReport {
  if (Boolean(input.apiKey) === Boolean(input.apiKeyEnv)) {
    throw new Error("Use exactly one of --api-key-env or --api-key.");
  }
  const store = new ProviderAuthStore(repoRoot);
  if (input.apiKeyEnv) {
    store.save({ providerId: input.providerId, type: "api_key_env", apiKeyEnv: input.apiKeyEnv });
    return { providerId: input.providerId, credentialStatus: "env", credentialSource: input.apiKeyEnv };
  }
  store.save({ providerId: input.providerId, type: "api_key", apiKey: input.apiKey! });
  return { providerId: input.providerId, credentialStatus: "stored" };
}

export function logoutProvider(repoRoot: string, providerId: string): ProviderLogoutReport {
  const removed = new ProviderAuthStore(repoRoot).delete(providerId);
  if (!removed) throw new Error(`No local credential found for provider '${providerId}'.`);
  return { providerId, removed };
}

export function resolveProviderCredential(repoRoot: string, input: {
  providerId: string;
  env?: string[];
  configApiKey?: string;
}): ProviderCredentialResolution {
  for (const envName of envNamesForProvider(input.providerId, input.env ?? [])) {
    const value = process.env[envName];
    if (value) return { providerId: input.providerId, status: "env", source: envName, apiKey: value };
  }

  const stored = new ProviderAuthStore(repoRoot).get(input.providerId);
  if (stored?.type === "api_key") {
    return { providerId: input.providerId, status: "stored", apiKey: stored.apiKey };
  }
  if (stored?.type === "api_key_env") {
    const value = process.env[stored.apiKeyEnv];
    return value
      ? { providerId: input.providerId, status: "env", source: stored.apiKeyEnv, apiKey: value }
      : { providerId: input.providerId, status: "none", source: stored.apiKeyEnv };
  }

  if (input.configApiKey) {
    return { providerId: input.providerId, status: "config", apiKey: input.configApiKey };
  }

  return { providerId: input.providerId, status: "none" };
}

export function redactProviderSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSecretKey(key) ? "[REDACTED_SECRET]" : redactProviderSecrets(entry),
      ]),
    );
  }
  if (typeof value === "string" && /bearer\s+[a-z0-9._:-]+|sk-[a-z0-9._:-]+/i.test(value)) {
    return "[REDACTED_SECRET]";
  }
  return value;
}

export function envNamesForProvider(providerId: string, catalogEnv: string[]): string[] {
  const common: Record<string, string[]> = {
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    "google-vertex": ["GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"],
    "amazon-bedrock": ["AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_PROFILE"],
    azure: ["AZURE_API_KEY", "AZURE_RESOURCE_NAME"],
    groq: ["GROQ_API_KEY"],
    mistral: ["MISTRAL_API_KEY"],
    xai: ["XAI_API_KEY"],
    deepinfra: ["DEEPINFRA_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
  };
  return [...new Set([...(common[providerId] ?? []), ...catalogEnv])];
}

function isSecretKey(key: string): boolean {
  return /api[_-]?key|token|authorization|secret|password|accesskey|secretaccesskey/i.test(key);
}
