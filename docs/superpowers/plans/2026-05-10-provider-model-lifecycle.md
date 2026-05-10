# Provider Model Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class provider/model lifecycle commands and runtime credential resolution so users can configure, inspect, verify, and use providers without editing source code.

**Architecture:** Keep models.dev as the catalog source, add a local `.dh/auth/providers.json` credential store, and centralize credential/config resolution in `packages/providers`. CLI modules only parse/render. Existing model assignment and `dh run` paths should consume the same provider loader so provider truth is not duplicated.

**Tech Stack:** TypeScript ESM, Vitest, Node `fs/path/os`, existing SQLite `ConfigRepo`, AI SDK provider packages already in `package.json`, Vercel AI SDK `generateText`, Rust tests as regression guards only.

---

## File Structure

- Create: `packages/shared/src/types/provider.ts`
  - Public and private provider lifecycle DTOs.
- Create: `packages/providers/src/auth/provider-auth-store.ts`
  - Read/write/delete local `.dh/auth/providers.json` records with public redaction helpers.
- Create: `packages/providers/src/auth/provider-auth-store.test.ts`
  - File persistence, delete behavior, public redaction.
- Create: `packages/providers/src/auth/provider-auth-service.ts`
  - Login/logout, credential precedence, redaction, provider verification.
- Create: `packages/providers/src/auth/provider-auth-service.test.ts`
  - Precedence, login/logout reports, redaction, verify classification.
- Create: `packages/providers/src/config/provider-config-loader.ts`
  - Merge models.dev, `opencode.json`, DH overrides, env, and credential status.
- Create: `packages/providers/src/config/provider-config-loader.test.ts`
  - Merge behavior, malformed config rejection, enabled/disabled filters, unsupported SDK reporting.
- Modify: `packages/providers/src/models-dev.ts`
  - Add cache metadata and refresh report helpers.
- Create: `packages/providers/src/models-dev.test.ts`
  - Cache metadata and refresh behavior with mocked fetch.
- Modify: `packages/providers/src/provider/provider.ts`
  - Export runtime SDK availability helpers and consume config loader where needed.
- Modify: `packages/providers/src/provider/legacy-adapter.ts`
  - Use config loader for list providers/models/variants.
- Modify: `packages/providers/src/chat/create-chat-provider.ts`
  - Use resolved provider runtime config and credentials.
- Modify: `packages/providers/src/chat/chat.test.ts`
  - Missing credential and injected credential tests.
- Modify: `packages/shared/src/types/config-schema.ts`
  - Add provider options fields currently needed by resolver.
- Modify: `packages/opencode-app/src/config/config-loader.ts`
  - Throw parse errors instead of logging and returning undefined.
- Modify: `packages/opencode-app/src/config/config-service.ts`
  - Surface provider loader results through config service.
- Modify: `packages/opencode-app/src/config/config-service.test.ts`
  - Parse failure and provider list behavior.
- Create: `apps/cli/src/commands/providers.ts`
  - `dh providers list/login/logout/verify`.
- Create: `apps/cli/src/commands/providers.test.ts`
  - CLI parsing/rendering/redaction.
- Create: `apps/cli/src/commands/models.ts`
  - `dh models [provider] [--refresh] [--verbose] [--json]`.
- Create: `apps/cli/src/commands/models.test.ts`
  - CLI parsing/rendering/cache metadata.
- Modify: `apps/cli/src/commands/config.ts`
  - Ensure `--show` prints credential status only, never raw secrets.
- Modify: `apps/cli/src/commands/root.ts`
  - Register `providers` and `models`.
- Modify: `apps/cli/src/commands/root.test.ts`
  - Help assertions.

## Execution Notes

- Keep `docs/scope/2026-05-10-delivery-request.md` untracked and untouched.
- Do not implement OAuth, browser auth, plugin provider auth, keychain integration, or Rust provider persistence.
- Use TDD for each task: write failing test, verify red, implement minimal code, verify green, commit.
- Do not print raw provider secrets in any command output, test failure message, or thrown error.

## Task 1: Shared Provider Lifecycle Types And Auth Store

**Files:**

- Create: `packages/shared/src/types/provider.ts`
- Create: `packages/providers/src/auth/provider-auth-store.ts`
- Create: `packages/providers/src/auth/provider-auth-store.test.ts`

- [ ] **Step 1: Write failing auth store tests**

Create `packages/providers/src/auth/provider-auth-store.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderAuthStore } from "./provider-auth-store.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-provider-auth-store-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("ProviderAuthStore", () => {
  it("stores api keys in the local ignored auth file and returns redacted public records", () => {
    const repo = makeRepo();
    const store = new ProviderAuthStore(repo);

    store.save({ providerId: "openai", type: "api_key", apiKey: "sk-secret" });

    const raw = store.get("openai");
    const pub = store.getPublic("openai");
    expect(raw?.type).toBe("api_key");
    expect(raw && "apiKey" in raw ? raw.apiKey : "").toBe("sk-secret");
    expect(pub).toMatchObject({ providerId: "openai", type: "api_key", credentialStatus: "stored" });
    expect(JSON.stringify(pub)).not.toContain("sk-secret");
    expect(fs.existsSync(path.join(repo, ".dh", "auth", "providers.json"))).toBe(true);
  });

  it("stores env var references without reading the env value", () => {
    const repo = makeRepo();
    const store = new ProviderAuthStore(repo);

    store.save({ providerId: "anthropic", type: "api_key_env", apiKeyEnv: "ANTHROPIC_API_KEY" });

    expect(store.get("anthropic")).toMatchObject({ type: "api_key_env", apiKeyEnv: "ANTHROPIC_API_KEY" });
    expect(store.getPublic("anthropic")).toMatchObject({
      providerId: "anthropic",
      type: "api_key_env",
      credentialStatus: "env",
      credentialSource: "ANTHROPIC_API_KEY",
    });
  });

  it("deletes local provider credentials", () => {
    const repo = makeRepo();
    const store = new ProviderAuthStore(repo);
    store.save({ providerId: "openai", type: "api_key", apiKey: "sk-secret" });

    expect(store.delete("openai")).toBe(true);
    expect(store.get("openai")).toBeUndefined();
    expect(store.delete("openai")).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing auth store test**

Run:

```bash
npm test -- provider-auth-store
```

Expected: FAIL because `provider-auth-store.ts` and shared provider types do not exist.

- [ ] **Step 3: Add shared provider lifecycle types**

Create `packages/shared/src/types/provider.ts`:

```ts
export type ProviderCredentialRecord =
  | {
      providerId: string;
      type: "api_key";
      apiKey: string;
      createdAt: string;
      updatedAt: string;
    }
  | {
      providerId: string;
      type: "api_key_env";
      apiKeyEnv: string;
      createdAt: string;
      updatedAt: string;
    };

export type ProviderCredentialPublicRecord = {
  providerId: string;
  type: ProviderCredentialRecord["type"];
  credentialStatus: "env" | "stored" | "config" | "none";
  credentialSource?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProviderCredentialResolution = {
  providerId: string;
  status: ProviderCredentialPublicRecord["credentialStatus"];
  source?: string;
  apiKey?: string;
};

export type ProviderRegistryEntry = {
  providerId: string;
  name: string;
  enabled: boolean;
  credentialStatus: ProviderCredentialPublicRecord["credentialStatus"];
  credentialSource?: string;
  modelCount: number;
  runtimeAvailable: boolean;
  unavailableReason?: "unsupported_sdk";
  npm?: string;
};

export type ProviderRegistryReport = {
  providers: ProviderRegistryEntry[];
};

export type ProviderLoginReport = {
  providerId: string;
  credentialStatus: "env" | "stored";
  credentialSource?: string;
};

export type ProviderLogoutReport = {
  providerId: string;
  removed: boolean;
};

export type ProviderVerifyReport = {
  providerId: string;
  modelId?: string;
  ok: boolean;
  reason?: "missing_credential" | "unsupported_sdk" | "auth_failed" | "request_failed";
  message: string;
};

export type ModelCatalogEntry = {
  providerId: string;
  modelId: string;
  name: string;
  available: boolean;
  status?: string;
  releaseDate?: string;
  limit?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  modalities?: Record<string, unknown>;
};

export type ModelCatalogReport = {
  refreshed: boolean;
  cache: {
    path: string;
    ageMs?: number;
  };
  models: ModelCatalogEntry[];
};
```

- [ ] **Step 4: Implement auth store**

Create `packages/providers/src/auth/provider-auth-store.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { ProviderCredentialPublicRecord, ProviderCredentialRecord } from "../../../shared/src/types/provider.js";
import { nowIso } from "../../../shared/src/utils/time.js";

type ProviderAuthFile = {
  version: 1;
  providers: Record<string, ProviderCredentialRecord>;
};

export class ProviderAuthStore {
  constructor(private readonly repoRoot: string) {}

  getPath(): string {
    return path.join(this.repoRoot, ".dh", "auth", "providers.json");
  }

  list(): ProviderCredentialRecord[] {
    return Object.values(this.readFile().providers);
  }

  get(providerId: string): ProviderCredentialRecord | undefined {
    return this.readFile().providers[providerId];
  }

  getPublic(providerId: string): ProviderCredentialPublicRecord | undefined {
    const record = this.get(providerId);
    return record ? toPublicRecord(record) : undefined;
  }

  listPublic(): ProviderCredentialPublicRecord[] {
    return this.list().map(toPublicRecord);
  }

  save(input: { providerId: string; type: "api_key"; apiKey: string } | { providerId: string; type: "api_key_env"; apiKeyEnv: string }): ProviderCredentialRecord {
    const file = this.readFile();
    const previous = file.providers[input.providerId];
    const timestamp = nowIso();
    const record: ProviderCredentialRecord = input.type === "api_key"
      ? {
          providerId: input.providerId,
          type: "api_key",
          apiKey: input.apiKey,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
      : {
          providerId: input.providerId,
          type: "api_key_env",
          apiKeyEnv: input.apiKeyEnv,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };

    file.providers[input.providerId] = record;
    this.writeFile(file);
    return record;
  }

  delete(providerId: string): boolean {
    const file = this.readFile();
    if (!file.providers[providerId]) return false;
    delete file.providers[providerId];
    this.writeFile(file);
    return true;
  }

  private readFile(): ProviderAuthFile {
    const filepath = this.getPath();
    if (!fs.existsSync(filepath)) return { version: 1, providers: {} };
    return JSON.parse(fs.readFileSync(filepath, "utf8")) as ProviderAuthFile;
  }

  private writeFile(file: ProviderAuthFile): void {
    const filepath = this.getPath();
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(filepath, 0o600);
    } catch {
      // Some platforms ignore chmod; the file remains under ignored local state.
    }
  }
}

function toPublicRecord(record: ProviderCredentialRecord): ProviderCredentialPublicRecord {
  return record.type === "api_key"
    ? {
        providerId: record.providerId,
        type: record.type,
        credentialStatus: "stored",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    : {
        providerId: record.providerId,
        type: record.type,
        credentialStatus: "env",
        credentialSource: record.apiKeyEnv,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
}
```

- [ ] **Step 5: Run passing auth store test**

Run:

```bash
npm test -- provider-auth-store
```

Expected: PASS.

- [ ] **Step 6: Commit auth store**

Run:

```bash
git add packages/shared/src/types/provider.ts packages/providers/src/auth/provider-auth-store.ts packages/providers/src/auth/provider-auth-store.test.ts
git commit -m "feat: add provider auth store"
```

## Task 2: Provider Auth Service And Redaction

**Files:**

- Create: `packages/providers/src/auth/provider-auth-service.ts`
- Create: `packages/providers/src/auth/provider-auth-service.test.ts`

- [ ] **Step 1: Write failing auth service tests**

Create `packages/providers/src/auth/provider-auth-service.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderAuthStore } from "./provider-auth-store.js";
import { loginProvider, logoutProvider, redactProviderSecrets, resolveProviderCredential } from "./provider-auth-service.js";

const repos: string[] = [];
const originalEnv = { ...process.env };

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-provider-auth-service-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("provider auth service", () => {
  it("resolves credentials with env before store before config", () => {
    const repo = makeRepo();
    process.env.OPENAI_API_KEY = "env-secret";
    new ProviderAuthStore(repo).save({ providerId: "openai", type: "api_key", apiKey: "stored-secret" });

    const resolved = resolveProviderCredential(repo, {
      providerId: "openai",
      env: ["OPENAI_API_KEY"],
      configApiKey: "config-secret",
    });

    expect(resolved).toMatchObject({ status: "env", source: "OPENAI_API_KEY", apiKey: "env-secret" });
  });

  it("logs in with env references and raw keys without leaking secrets in reports", () => {
    const repo = makeRepo();

    const envReport = loginProvider(repo, { providerId: "openai", apiKeyEnv: "OPENAI_API_KEY" });
    const keyReport = loginProvider(repo, { providerId: "anthropic", apiKey: "sk-secret" });

    expect(envReport).toEqual({ providerId: "openai", credentialStatus: "env", credentialSource: "OPENAI_API_KEY" });
    expect(keyReport).toEqual({ providerId: "anthropic", credentialStatus: "stored" });
    expect(JSON.stringify({ envReport, keyReport })).not.toContain("sk-secret");
  });

  it("logs out local credentials", () => {
    const repo = makeRepo();
    loginProvider(repo, { providerId: "openai", apiKey: "sk-secret" });

    expect(logoutProvider(repo, "openai")).toEqual({ providerId: "openai", removed: true });
    expect(() => logoutProvider(repo, "openai")).toThrow("No local credential found for provider 'openai'.");
  });

  it("redacts nested secret keys and secret-looking values", () => {
    const redacted = redactProviderSecrets({
      apiKey: "sk-secret",
      nested: { authorization: "Bearer token-secret", safe: "visible" },
    });

    expect(redacted).toEqual({
      apiKey: "[REDACTED_SECRET]",
      nested: { authorization: "[REDACTED_SECRET]", safe: "visible" },
    });
  });
});
```

- [ ] **Step 2: Run failing auth service test**

Run:

```bash
npm test -- provider-auth-service
```

Expected: FAIL because `provider-auth-service.ts` does not exist.

- [ ] **Step 3: Implement auth service**

Create `packages/providers/src/auth/provider-auth-service.ts`:

```ts
import type { ProviderCredentialResolution, ProviderLoginReport, ProviderLogoutReport } from "../../../shared/src/types/provider.js";
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

function envNamesForProvider(providerId: string, catalogEnv: string[]): string[] {
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
```

- [ ] **Step 4: Run passing auth service tests**

Run:

```bash
npm test -- provider-auth-service
```

Expected: PASS.

- [ ] **Step 5: Commit auth service**

Run:

```bash
git add packages/providers/src/auth/provider-auth-service.ts packages/providers/src/auth/provider-auth-service.test.ts
git commit -m "feat: add provider auth service"
```

## Task 3: Provider Config Loader

**Files:**

- Create: `packages/providers/src/config/provider-config-loader.ts`
- Create: `packages/providers/src/config/provider-config-loader.test.ts`
- Modify: `packages/shared/src/types/config-schema.ts`
- Modify: `packages/opencode-app/src/config/config-loader.ts`

- [ ] **Step 1: Write failing provider config loader tests**

Create `packages/providers/src/config/provider-config-loader.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadProviderRegistry } from "./provider-config-loader.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-provider-config-loader-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("provider config loader", () => {
  it("merges catalog providers with opencode.json overrides and credential status", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
      provider: {
        openai: { name: "OpenAI Custom", options: { apiKey: "config-secret" } },
        localai: {
          name: "LocalAI",
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: "http://localhost:8080/v1" },
          models: { "local-model": { name: "Local Model" } },
        },
      },
    }));

    const report = await loadProviderRegistry(repo, {
      catalog: {
        openai: { id: "openai", name: "OpenAI", env: ["OPENAI_API_KEY"], npm: "@ai-sdk/openai", models: { "gpt-test": { name: "GPT Test" } } as never },
      } as never,
    });

    expect(report.providers.find((provider) => provider.providerId === "openai")).toMatchObject({
      name: "OpenAI Custom",
      credentialStatus: "config",
      modelCount: 1,
      runtimeAvailable: true,
    });
    expect(report.providers.find((provider) => provider.providerId === "localai")).toMatchObject({
      name: "LocalAI",
      modelCount: 1,
      runtimeAvailable: true,
    });
    expect(JSON.stringify(report)).not.toContain("config-secret");
  });

  it("respects enabled and disabled provider filters", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
      enabled_providers: ["openai"],
      disabled_providers: ["anthropic"],
    }));

    const report = await loadProviderRegistry(repo, {
      catalog: {
        openai: { id: "openai", name: "OpenAI", env: [], npm: "@ai-sdk/openai", models: {} } as never,
        anthropic: { id: "anthropic", name: "Anthropic", env: [], npm: "@ai-sdk/anthropic", models: {} } as never,
      },
    });

    expect(report.providers.map((provider) => provider.providerId)).toEqual(["openai"]);
  });

  it("throws a clear error for malformed opencode.json", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), "{");

    await expect(loadProviderRegistry(repo, { catalog: {} as never })).rejects.toThrow("Failed to parse opencode.json:");
  });
});
```

- [ ] **Step 2: Run failing config loader test**

Run:

```bash
npm test -- provider-config-loader
```

Expected: FAIL because `provider-config-loader.ts` does not exist.

- [ ] **Step 3: Implement provider config loader**

Create `packages/providers/src/config/provider-config-loader.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { Info } from "../../../shared/src/types/model.js";
import type { ProviderRegistryReport } from "../../../shared/src/types/provider.js";
import { OpencodeConfigSchema, type OpencodeConfig, type ProviderConfig } from "../../../shared/src/types/config-schema.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { get as getModelsDev } from "../models-dev.js";
import { resolveProviderCredential } from "../auth/provider-auth-service.js";

const SUPPORTED_SDKS = new Set([
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai-compatible",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/azure",
  "@ai-sdk/groq",
  "@ai-sdk/mistral",
  "@ai-sdk/xai",
  "@ai-sdk/deepinfra",
  "@openrouter/ai-sdk-provider",
]);

export type ProviderRuntimeConfig = ProviderConfig & {
  id: string;
  name: string;
  models: Record<string, unknown>;
  env: string[];
  npm?: string;
};

export async function loadProviderRegistry(repoRoot: string, input: { catalog?: Record<string, Info> } = {}): Promise<ProviderRegistryReport> {
  const catalog = input.catalog ?? await getModelsDev();
  const config = loadProviderConfigFile(repoRoot);
  const overrides = new ConfigRepo(repoRoot).read<Record<string, ProviderConfig>>("provider.overrides") ?? {};
  const disabled = new Set(config.disabled_providers ?? []);
  const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined;

  const providerIds = new Set([...Object.keys(catalog), ...Object.keys(config.provider ?? {}), ...Object.keys(overrides)]);
  const providers = [...providerIds].sort().flatMap((providerId) => {
    if (disabled.has(providerId)) return [];
    if (enabled && !enabled.has(providerId)) return [];
    const runtime = resolveProviderRuntimeConfig(providerId, catalog, config.provider?.[providerId], overrides[providerId]);
    const credential = resolveProviderCredential(repoRoot, {
      providerId,
      env: runtime.env,
      configApiKey: runtime.options?.apiKey,
    });
    const runtimeAvailable = !runtime.npm || SUPPORTED_SDKS.has(runtime.npm);
    return [{
      providerId,
      name: runtime.name,
      enabled: true,
      credentialStatus: credential.status,
      credentialSource: credential.status === "env" ? credential.source : undefined,
      modelCount: Object.keys(runtime.models ?? {}).length,
      runtimeAvailable,
      unavailableReason: runtimeAvailable ? undefined : "unsupported_sdk" as const,
      npm: runtime.npm,
    }];
  });

  return { providers };
}

export function resolveProviderRuntimeConfig(
  providerId: string,
  catalog: Record<string, Info>,
  config?: ProviderConfig,
  override?: ProviderConfig,
): ProviderRuntimeConfig {
  const base = catalog[providerId] as ProviderConfig | undefined;
  const merged = mergeProviderConfig(base, config, override);
  return {
    ...merged,
    id: providerId,
    name: merged.name ?? providerId,
    env: merged.env ?? [],
    models: merged.models ?? {},
    npm: merged.npm ?? firstModelNpm(merged.models) ?? providerDefaultNpm(providerId),
  };
}

export function loadProviderConfigFile(repoRoot: string): OpencodeConfig {
  const configPath = path.join(repoRoot, "opencode.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return OpencodeConfigSchema.parse(JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch (error) {
    throw new Error(`Failed to parse opencode.json: ${(error as Error).message}`);
  }
}

function mergeProviderConfig(...configs: Array<ProviderConfig | undefined>): ProviderConfig {
  return configs.reduce<ProviderConfig>((acc, item) => ({
    ...acc,
    ...item,
    options: { ...(acc.options ?? {}), ...(item?.options ?? {}) },
    models: { ...(acc.models ?? {}), ...(item?.models ?? {}) },
  }), {});
}

function firstModelNpm(models: ProviderConfig["models"]): string | undefined {
  const first = models ? Object.values(models)[0] : undefined;
  return first?.provider?.npm;
}

function providerDefaultNpm(providerId: string): string | undefined {
  const defaults: Record<string, string> = {
    openai: "@ai-sdk/openai",
    anthropic: "@ai-sdk/anthropic",
    google: "@ai-sdk/google",
    "google-vertex": "@ai-sdk/google-vertex",
    "amazon-bedrock": "@ai-sdk/amazon-bedrock",
    azure: "@ai-sdk/azure",
    groq: "@ai-sdk/groq",
    mistral: "@ai-sdk/mistral",
    xai: "@ai-sdk/xai",
    deepinfra: "@ai-sdk/deepinfra",
    openrouter: "@openrouter/ai-sdk-provider",
  };
  return defaults[providerId];
}
```

- [ ] **Step 4: Update config loader parse behavior**

Modify `packages/opencode-app/src/config/config-loader.ts` so malformed config throws:

```ts
export function loadOpencodeConfig(repoRoot: string): OpencodeConfig | undefined {
  const configPath = path.join(repoRoot, "opencode.json");
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const json = JSON.parse(content);
    return OpencodeConfigSchema.parse(json);
  } catch (error) {
    throw new Error(`Failed to parse opencode.json: ${(error as Error).message}`);
  }
}
```

- [ ] **Step 5: Run passing provider config loader tests**

Run:

```bash
npm test -- provider-config-loader
```

Expected: PASS.

- [ ] **Step 6: Commit config loader**

Run:

```bash
git add packages/providers/src/config/provider-config-loader.ts packages/providers/src/config/provider-config-loader.test.ts packages/opencode-app/src/config/config-loader.ts packages/shared/src/types/config-schema.ts
git commit -m "feat: add provider config loader"
```

## Task 4: Models Cache Metadata And Registry Adapters

**Files:**

- Modify: `packages/providers/src/models-dev.ts`
- Create: `packages/providers/src/models-dev.test.ts`
- Modify: `packages/providers/src/provider/legacy-adapter.ts`
- Modify: `packages/opencode-app/src/config/config-service.ts`
- Modify: `packages/opencode-app/src/config/config-service.test.ts`

- [ ] **Step 1: Write failing models-dev tests**

Create `packages/providers/src/models-dev.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCachePathForDisplay, readModelsCacheMetadata } from "./models-dev.js";

describe("models-dev cache metadata", () => {
  it("formats home-relative cache paths", () => {
    expect(formatCachePathForDisplay("/Users/test/.dh/cache/models.json", "/Users/test")).toBe("~/.dh/cache/models.json");
  });

  it("returns cache metadata even when cache is absent", async () => {
    const metadata = await readModelsCacheMetadata("/tmp/does-not-exist-models.json");
    expect(metadata.path).toContain("models.json");
    expect(metadata.ageMs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run failing models-dev test**

Run:

```bash
npm test -- models-dev
```

Expected: FAIL because cache metadata helpers do not exist.

- [ ] **Step 3: Implement cache metadata helpers**

Modify `packages/providers/src/models-dev.ts`:

```ts
export type ModelsCacheMetadata = {
  path: string;
  ageMs?: number;
};

export function formatCachePathForDisplay(cachePath = filepath, home = os.homedir()): string {
  return cachePath.startsWith(home) ? cachePath.replace(home, "~") : cachePath;
}

export async function readModelsCacheMetadata(cachePath = filepath): Promise<ModelsCacheMetadata> {
  const stat = await fs.stat(cachePath).catch(() => null);
  return {
    path: formatCachePathForDisplay(cachePath),
    ageMs: stat ? Date.now() - stat.mtimeMs : undefined,
  };
}

export async function refreshWithMetadata(force = false): Promise<{ refreshed: boolean; cache: ModelsCacheMetadata }> {
  await refresh(force);
  return {
    refreshed: true,
    cache: await readModelsCacheMetadata(),
  };
}
```

- [ ] **Step 4: Write failing legacy adapter/config-service tests**

Add tests proving `listProvidersAsync` and `createConfigService(...).listProviders()` use the config loader with custom providers:

```ts
// packages/opencode-app/src/config/config-service.test.ts
it("lists custom providers from opencode.json through config service", async () => {
  const repo = makeTmpRepo();
  fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
    provider: {
      localai: {
        name: "LocalAI",
        npm: "@ai-sdk/openai-compatible",
        models: { "local-model": { name: "Local Model" } },
      },
    },
  }));

  const providers = await createConfigService(repo).listProviders();
  expect(providers.some((provider) => provider.providerId === "localai")).toBe(true);
});
```

- [ ] **Step 5: Implement registry adapter changes**

Modify `packages/providers/src/provider/legacy-adapter.ts`:

```ts
import { loadProviderRegistry, resolveProviderRuntimeConfig } from "../config/provider-config-loader.js";
import * as ModelsDev from "../models-dev.js";

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
  const runtime = resolveProviderRuntimeConfig(providerId, catalog, undefined, undefined);
  return Object.entries(runtime.models ?? {}).map(([modelId, model]: [string, any]) => ({
    providerId,
    modelId,
    name: model.name || modelId,
    available: true,
  }));
}
```

Update callers in config service and model validation to pass `repoRoot`.

- [ ] **Step 6: Run passing models/adapter tests**

Run:

```bash
npm test -- models-dev config-service
```

Expected: PASS.

- [ ] **Step 7: Commit models/adapters**

Run:

```bash
git add packages/providers/src/models-dev.ts packages/providers/src/models-dev.test.ts packages/providers/src/provider/legacy-adapter.ts packages/opencode-app/src/config/config-service.ts packages/opencode-app/src/config/config-service.test.ts packages/providers/src/resolution/resolve-agent-model.ts packages/providers/src/resolution/resolve-fallback-model.ts
git commit -m "feat: route provider registry through config loader"
```

## Task 5: Chat Provider Runtime Credential Integration

**Files:**

- Modify: `packages/providers/src/chat/create-chat-provider.ts`
- Modify: `packages/providers/src/chat/chat.test.ts`
- Modify: `packages/providers/src/provider/provider.ts`

- [ ] **Step 1: Write failing chat provider tests**

Add tests to `packages/providers/src/chat/chat.test.ts`:

```ts
it("fails with auth error when a configured provider has no credential", async () => {
  await expect(createChatProvider("/repo", {
    providerId: "openai",
    modelId: "gpt-test",
    variantId: "default",
  })).rejects.toMatchObject({
    kind: "auth",
    providerId: "openai",
  });
});

it("injects resolved api key into provider runtime options without exposing it", async () => {
  const repo = makeTmpRepo();
  new ProviderAuthStore(repo).save({ providerId: "openai", type: "api_key", apiKey: "sk-secret" });

  const provider = await createChatProvider(repo, {
    providerId: "openai",
    modelId: "gpt-test",
    variantId: "default",
  }, {
    generateText: async () => ({
      text: "OK",
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }) as never,
    modelFactory: () => ({}) as never,
  });

  const response = await provider.chat({ model: "openai/gpt-test", messages: [{ role: "user", content: "hi" }] });
  expect(response.content).toBe("OK");
});
```

If `chat.test.ts` lacks temp helpers, add `makeTmpRepo()` and cleanup matching nearby test style.

- [ ] **Step 2: Run failing chat provider tests**

Run:

```bash
npm test -- create-chat-provider chat
```

Expected: FAIL because `createChatProvider` does not accept injectable runtime dependencies and does not use credential resolver.

- [ ] **Step 3: Implement runtime credential integration**

Modify `packages/providers/src/chat/create-chat-provider.ts`:

- Add optional dependency injection for tests:

```ts
type CreateChatProviderDeps = {
  generateText?: typeof generateText;
  streamText?: typeof streamText;
  modelFactory?: (repoRoot: string, selection: ResolvedModelSelection) => Promise<any>;
};
```

- Resolve provider runtime config and credentials before creating the AI SDK model.
- If no credential is available and provider requires one, throw:

```ts
throw createChatProviderError({
  message: `Provider '${selection.providerId}' is missing credentials.`,
  providerId: selection.providerId,
  kind: "auth",
  retryable: false,
});
```

- Use redacted errors when wrapping runtime creation failures:

```ts
catch (error) {
  throw createChatProviderError({
    message: String(redactProviderSecrets((error as Error).message)),
    providerId: selection.providerId,
    kind: "unknown",
  });
}
```

- Pass API key/baseURL/options into SDK creator.

- [ ] **Step 4: Run passing chat provider tests**

Run:

```bash
npm test -- create-chat-provider chat
```

Expected: PASS.

- [ ] **Step 5: Commit runtime integration**

Run:

```bash
git add packages/providers/src/chat/create-chat-provider.ts packages/providers/src/chat/chat.test.ts packages/providers/src/provider/provider.ts
git commit -m "feat: resolve provider credentials for chat runtime"
```

## Task 6: Provider And Model CLI Commands

**Files:**

- Create: `apps/cli/src/commands/providers.ts`
- Create: `apps/cli/src/commands/providers.test.ts`
- Create: `apps/cli/src/commands/models.ts`
- Create: `apps/cli/src/commands/models.test.ts`
- Modify: `apps/cli/src/commands/config.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `apps/cli/src/commands/root.test.ts`

- [ ] **Step 1: Write failing providers CLI tests**

Create `apps/cli/src/commands/providers.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { runProvidersCommand } from "./providers.js";

afterEach(() => vi.restoreAllMocks());

describe("runProvidersCommand", () => {
  it("renders provider list JSON without secrets", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runProvidersCommand(["list", "--json"], "/repo", {
      listProviders: async () => ({ providers: [{ providerId: "openai", name: "OpenAI", enabled: true, credentialStatus: "stored", modelCount: 1, runtimeAvailable: true }] }),
      loginProvider: () => { throw new Error("unused"); },
      logoutProvider: () => { throw new Error("unused"); },
      verifyProvider: async () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).providers[0].credentialStatus).toBe("stored");
    expect(String(stdout.mock.calls[0]?.[0])).not.toContain("sk-");
  });

  it("rejects login without exactly one credential input", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitCode = await runProvidersCommand(["login", "openai"], "/repo");

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("Use exactly one of --api-key-env or --api-key.");
  });

  it("renders verify JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runProvidersCommand(["verify", "openai", "--model", "gpt-test", "--json"], "/repo", {
      listProviders: async () => ({ providers: [] }),
      loginProvider: () => { throw new Error("unused"); },
      logoutProvider: () => { throw new Error("unused"); },
      verifyProvider: async () => ({ providerId: "openai", modelId: "gpt-test", ok: false, reason: "missing_credential", message: "missing credential" }),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).reason).toBe("missing_credential");
  });
});
```

- [ ] **Step 2: Write failing models CLI tests**

Create `apps/cli/src/commands/models.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { runModelsCommand } from "./models.js";

afterEach(() => vi.restoreAllMocks());

describe("runModelsCommand", () => {
  it("renders model catalog JSON with cache metadata", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runModelsCommand(["openai", "--refresh", "--json"], "/repo", {
      listModels: async () => ({
        refreshed: true,
        cache: { path: "~/.dh/cache/models.json", ageMs: 1 },
        models: [{ providerId: "openai", modelId: "gpt-test", name: "GPT Test", available: true }],
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).models[0].modelId).toBe("gpt-test");
  });
});
```

- [ ] **Step 3: Run failing CLI tests**

Run:

```bash
npm test -- providers models root
```

Expected: FAIL because command modules and root registration do not exist.

- [ ] **Step 4: Implement providers CLI**

Create `apps/cli/src/commands/providers.ts`:

```ts
import { loginProvider, logoutProvider } from "../../../../packages/providers/src/auth/provider-auth-service.js";
import { loadProviderRegistry } from "../../../../packages/providers/src/config/provider-config-loader.js";
import type { ProviderRegistryReport, ProviderVerifyReport } from "../../../../packages/shared/src/types/provider.js";

type ProvidersDeps = {
  listProviders: (repoRoot: string) => Promise<ProviderRegistryReport>;
  loginProvider: typeof loginProvider;
  logoutProvider: typeof logoutProvider;
  verifyProvider: (repoRoot: string, input: { providerId: string; modelId?: string }) => Promise<ProviderVerifyReport>;
};

const defaultDeps: ProvidersDeps = {
  listProviders: loadProviderRegistry,
  loginProvider,
  logoutProvider,
  verifyProvider: async () => ({ providerId: "", ok: false, reason: "missing_credential", message: "provider verification is unavailable" }),
};

export async function runProvidersCommand(args: string[], repoRoot: string, deps: ProvidersDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "login") return runLogin(rest, repoRoot, deps);
    if (subcommand === "logout") return runLogout(rest, repoRoot, deps);
    if (subcommand === "verify") return runVerify(rest, repoRoot, deps);
    throw new Error(`Unknown providers command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

async function runList(args: string[], repoRoot: string, deps: ProvidersDeps): Promise<number> {
  const report = await deps.listProviders(repoRoot);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderProviders(report)}\n`);
  return 0;
}

function runLogin(args: string[], repoRoot: string, deps: ProvidersDeps): number {
  const providerId = args.find((arg) => !arg.startsWith("--"));
  if (!providerId) throw new Error("dh providers login requires <provider>.");
  const apiKeyEnv = readFlag(args, "--api-key-env");
  const apiKey = readFlag(args, "--api-key");
  const report = deps.loginProvider(repoRoot, { providerId, apiKeyEnv, apiKey });
  process.stdout.write(`provider credential: ${report.providerId} ${report.credentialStatus}${report.credentialSource ? ` ${report.credentialSource}` : ""}\n`);
  return 0;
}

function runLogout(args: string[], repoRoot: string, deps: ProvidersDeps): number {
  const providerId = args[0];
  if (!providerId) throw new Error("dh providers logout requires <provider>.");
  deps.logoutProvider(repoRoot, providerId);
  process.stdout.write(`removed provider credential: ${providerId}\n`);
  return 0;
}

async function runVerify(args: string[], repoRoot: string, deps: ProvidersDeps): Promise<number> {
  const providerId = args.find((arg) => !arg.startsWith("--"));
  if (!providerId) throw new Error("dh providers verify requires <provider>.");
  const report = await deps.verifyProvider(repoRoot, { providerId, modelId: readFlag(args, "--model") });
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${report.message}\n`);
  return report.ok ? 0 : 1;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function renderProviders(report: ProviderRegistryReport): string {
  if (report.providers.length === 0) return "no providers";
  return report.providers.map((provider) => `${provider.providerId}  ${provider.name}  ${provider.credentialStatus}  models=${provider.modelCount}`).join("\n");
}
```

- [ ] **Step 5: Implement models CLI and model catalog service**

Create `apps/cli/src/commands/models.ts`:

```ts
import type { ModelCatalogReport } from "../../../../packages/shared/src/types/provider.js";
import { loadModelCatalog } from "../../../../packages/providers/src/config/provider-config-loader.js";

type ModelsDeps = {
  listModels: (repoRoot: string, input: { providerId?: string; refresh?: boolean; verbose?: boolean }) => Promise<ModelCatalogReport>;
};

const defaultDeps: ModelsDeps = { listModels: loadModelCatalog };

export async function runModelsCommand(args: string[], repoRoot: string, deps: ModelsDeps = defaultDeps): Promise<number> {
  try {
    const json = args.includes("--json");
    const providerId = args.find((arg) => !arg.startsWith("--"));
    const report = await deps.listModels(repoRoot, {
      providerId,
      refresh: args.includes("--refresh"),
      verbose: args.includes("--verbose"),
    });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderModels(report)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function renderModels(report: ModelCatalogReport): string {
  if (report.models.length === 0) return "no models";
  return report.models.map((model) => `${model.providerId}/${model.modelId}  ${model.name}`).join("\n");
}
```

Add `loadModelCatalog` to `provider-config-loader.ts`; it should return `ModelCatalogReport`, call `refreshWithMetadata(true)` when requested, and filter by provider.

- [ ] **Step 6: Register root commands and config display**

Modify `apps/cli/src/commands/root.ts`:

```ts
import { runModelsCommand } from "./models.js";
import { runProvidersCommand } from "./providers.js";
```

Add help lines:

```text
  providers <list|login|logout|verify> [options]
  models [provider] [--refresh] [--verbose] [--json]
```

Add switch cases:

```ts
    case "providers":
      return runProvidersCommand(rest, repoRoot);
    case "models":
      return runModelsCommand(rest, repoRoot);
```

Modify `apps/cli/src/commands/config.ts` `--show` output to include provider credential status from `loadProviderRegistry(repoRoot)`, not raw keys.

- [ ] **Step 7: Run passing CLI tests**

Run:

```bash
npm test -- providers models root config
```

Expected: PASS.

- [ ] **Step 8: Commit CLI commands**

Run:

```bash
git add apps/cli/src/commands/providers.ts apps/cli/src/commands/providers.test.ts apps/cli/src/commands/models.ts apps/cli/src/commands/models.test.ts apps/cli/src/commands/config.ts apps/cli/src/commands/root.ts apps/cli/src/commands/root.test.ts packages/providers/src/config/provider-config-loader.ts
git commit -m "feat: add provider and model CLI commands"
```

## Task 7: Provider Verification Service

**Files:**

- Modify: `packages/providers/src/auth/provider-auth-service.ts`
- Modify: `packages/providers/src/auth/provider-auth-service.test.ts`
- Modify: `apps/cli/src/commands/providers.ts`
- Modify: `apps/cli/src/commands/providers.test.ts`

- [ ] **Step 1: Write failing verification service tests**

Add to `provider-auth-service.test.ts`:

```ts
it("classifies missing credentials during provider verification", async () => {
  const repo = makeRepo();
  const report = await verifyProvider(repo, {
    providerId: "openai",
    modelId: "gpt-test",
    createChatProvider: async () => {
      throw new Error("should not create provider without credentials");
    },
  });

  expect(report).toMatchObject({
    providerId: "openai",
    ok: false,
    reason: "missing_credential",
  });
});

it("returns ok when tiny non-streaming verification succeeds", async () => {
  const repo = makeRepo();
  loginProvider(repo, { providerId: "openai", apiKey: "sk-secret" });

  const report = await verifyProvider(repo, {
    providerId: "openai",
    modelId: "gpt-test",
    createChatProvider: async () => ({
      providerId: "openai",
      chat: async () => ({
        content: "OK",
        model: "gpt-test",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    }),
  });

  expect(report).toMatchObject({ ok: true, providerId: "openai", modelId: "gpt-test" });
  expect(JSON.stringify(report)).not.toContain("sk-secret");
});
```

- [ ] **Step 2: Run failing verification tests**

Run:

```bash
npm test -- provider-auth-service providers
```

Expected: FAIL because `verifyProvider` is not implemented and CLI still uses a temporary dependency that returns `missing_credential`.

- [ ] **Step 3: Implement `verifyProvider`**

Add to `provider-auth-service.ts`:

```ts
export async function verifyProvider(repoRoot: string, input: {
  providerId: string;
  modelId?: string;
  createChatProvider?: typeof createChatProvider;
}): Promise<ProviderVerifyReport> {
  const registry = await loadProviderRegistry(repoRoot);
  const provider = registry.providers.find((entry) => entry.providerId === input.providerId);
  if (!provider) return { providerId: input.providerId, ok: false, reason: "request_failed", message: `Provider '${input.providerId}' was not found.` };
  if (!provider.runtimeAvailable) return { providerId: input.providerId, ok: false, reason: "unsupported_sdk", message: `Provider '${input.providerId}' is not runtime-available.` };
  if (provider.credentialStatus === "none") return { providerId: input.providerId, ok: false, reason: "missing_credential", message: `Provider '${input.providerId}' has no credential.` };

  const modelId = input.modelId ?? await selectFirstModelId(repoRoot, input.providerId);
  try {
    const chat = await (input.createChatProvider ?? createChatProvider)(repoRoot, {
      providerId: input.providerId,
      modelId,
      variantId: "default",
    });
    await chat.chat({ model: `${input.providerId}/${modelId}`, messages: [{ role: "user", content: "Reply with OK." }], maxTokens: 4, temperature: 0 });
    return { providerId: input.providerId, modelId, ok: true, message: `Provider '${input.providerId}' verified with model '${modelId}'.` };
  } catch (error) {
    const message = String(redactProviderSecrets((error as Error).message));
    const reason = (error as { kind?: string }).kind === "auth" ? "auth_failed" : "request_failed";
    return { providerId: input.providerId, modelId, ok: false, reason, message };
  }
}
```

Add imports for `createChatProvider`, `loadProviderRegistry`, `loadModelCatalog`, and `ProviderVerifyReport`. Add `selectFirstModelId` helper using `loadModelCatalog`.

- [ ] **Step 4: Wire CLI to real verification**

Update `apps/cli/src/commands/providers.ts` default deps:

```ts
import { loginProvider, logoutProvider, verifyProvider } from "../../../../packages/providers/src/auth/provider-auth-service.js";

const defaultDeps: ProvidersDeps = {
  listProviders: loadProviderRegistry,
  loginProvider,
  logoutProvider,
  verifyProvider,
};
```

- [ ] **Step 5: Run passing verification tests**

Run:

```bash
npm test -- provider-auth-service providers
```

Expected: PASS.

- [ ] **Step 6: Commit verification**

Run:

```bash
git add packages/providers/src/auth/provider-auth-service.ts packages/providers/src/auth/provider-auth-service.test.ts apps/cli/src/commands/providers.ts apps/cli/src/commands/providers.test.ts
git commit -m "feat: add provider verification"
```

## Task 8: Full Verification

**Files:**

- Verify all files changed in Tasks 1-7.

- [ ] **Step 1: Run focused acceptance tests**

Run:

```bash
npm test -- provider-auth-store provider-auth-service provider-config-loader models-dev create-chat-provider chat providers models config-service root
```

Expected: PASS.

- [ ] **Step 2: Run full TypeScript tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Run Rust regression guard**

Run:

```bash
cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine
```

Expected: PASS.

- [ ] **Step 5: Manual fake-key redaction smoke**

Run through the available local CLI invocation method in this repo:

```bash
dh providers login openai --api-key sk-test-secret
dh providers list --json
dh providers logout openai
```

Expected:

- list output includes `openai`
- list output includes `stored`
- list output does not include `sk-test-secret`

If the local `dh` binary is not built in this workspace, skip this smoke and report that the verified replacement is CLI unit coverage plus full test suite.

- [ ] **Step 6: Optional real provider smoke**

Only run when a real key is already configured:

```bash
dh providers verify openai --model gpt-4.1-mini --json
```

Expected: `ok: true`. If no real credential exists, skip and report that no live provider credential was available.

- [ ] **Step 7: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional committed changes are absent from status. `?? docs/scope/2026-05-10-delivery-request.md` may remain untracked and must not be staged.
