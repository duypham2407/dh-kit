# Provider And Model Lifecycle Design

## Goal

Milestone 4 makes DH providers and models first-class, configurable, inspectable, and verifiable from the CLI without requiring source edits.

Users should be able to list supported providers, store or reference credentials, verify a provider/model, refresh the models.dev cache, and use configured providers through the existing `dh run` path.

## Scope

In scope:

- `dh providers list [--json]`
- `dh providers login [provider] [--api-key-env <name>] [--api-key <value>]`
- `dh providers logout <provider>`
- `dh providers verify <provider> [--model <model>] [--json]`
- `dh models [provider] [--refresh] [--verbose] [--json]`
- Local credential store under `.dh/auth/providers.json`.
- Credential precedence:
  1. process environment variables
  2. local DH credential store
  3. repo `opencode.json` provider options
  4. models.dev provider defaults
- Provider config loader that merges models.dev, repo-local `opencode.json`, and DH local provider overrides.
- Redaction for provider secrets in CLI, config display, errors, and debug-style output.
- Provider verification using one tiny non-streaming request when a credential exists.
- Support for the AI SDK provider packages already present in `package.json`.

Out of scope:

- OAuth/browser/device login.
- OpenCode plugin provider auth.
- Cloud account or billing flows.
- Remote credential sync.
- OS keychain integration.
- Rust ownership of provider config or credential persistence.

## Approach

Use **local credentials plus config-driven registry**.

Options considered:

- **Clone OpenCode provider internals.** This gives broad behavior, but OpenCode's provider layer depends on its plugin/auth/effect runtime and a larger server model. Importing it directly would add hidden coupling before DH has plugin and server milestones.
- **Implement only env-var support.** This is safe but incomplete: users still cannot log in, list credential state, or verify a provider without editing shell configuration.
- **Recommended: small DH provider lifecycle over existing registry.** Keep models.dev as the catalog source, add a local credential service, merge repo config explicitly, and route `createChatProvider` through one credential resolver. This gives practical daily-use provider UX while staying compatible with future Rust/server work.

## Data And Storage

### Local Credential Store

Store credentials in `.dh/auth/providers.json`. The `.dh/` directory is already ignored by git.

Credential file shape:

```json
{
  "version": 1,
  "providers": {
    "openai": {
      "providerId": "openai",
      "type": "api_key",
      "apiKey": "sk-...",
      "createdAt": "2026-05-10T00:00:00.000Z",
      "updatedAt": "2026-05-10T00:00:00.000Z"
    },
    "anthropic": {
      "providerId": "anthropic",
      "type": "api_key_env",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "createdAt": "2026-05-10T00:00:00.000Z",
      "updatedAt": "2026-05-10T00:00:00.000Z"
    }
  }
}
```

File creation should use mode `0600` where the platform supports it. This is not encryption; it is local project state. The CLI must describe stored keys as `stored` or `env:<name>`, never print raw values.

### Shared Types

Add provider lifecycle DTOs under `packages/shared/src/types/provider.ts`:

- `ProviderCredentialRecord`
- `ProviderCredentialPublicRecord`
- `ProviderRegistryReport`
- `ProviderLoginReport`
- `ProviderLogoutReport`
- `ProviderVerifyReport`
- `ModelCatalogReport`
- `ModelCatalogEntry`

Use public DTOs for CLI output. Raw credential records must stay inside provider auth modules.

## Provider Config Loader

Create `packages/providers/src/config/provider-config-loader.ts`.

Inputs:

- models.dev catalog from `packages/providers/src/models-dev.ts`
- repo-local `opencode.json`
- existing DH `ConfigRepo` overrides under key `provider.overrides`
- process environment
- local credential store

Behavior:

- Parse `opencode.json` with `OpencodeConfigSchema`.
- If `opencode.json` exists but is malformed, throw a clear error. Do not log and silently ignore it.
- Merge provider records by provider id.
- Respect `enabled_providers` and `disabled_providers`.
- Preserve custom provider entries from `opencode.json`.
- Attach public credential status:
  - `env`
  - `stored`
  - `config`
  - `none`
- Expose credential resolution separately so raw secrets are not part of list output.

## Credential Precedence

Credential resolver order:

1. Environment variables from provider catalog `env`, plus common explicit env names for supported providers.
2. `.dh/auth/providers.json`.
3. `opencode.json` `provider.<id>.options.apiKey`.
4. No credential.

If a provider has both env and stored credentials, list output should say `env` because that is what runtime will use.

Common env names:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_PROFILE`, `AWS_BEARER_TOKEN_BEDROCK`
- `AZURE_API_KEY`, `AZURE_RESOURCE_NAME`
- `GROQ_API_KEY`
- `MISTRAL_API_KEY`
- `XAI_API_KEY`
- `DEEPINFRA_API_KEY`
- `OPENROUTER_API_KEY`

## Supported Providers

The first implementation should expose support for provider packages that are already dependencies:

- OpenAI: `@ai-sdk/openai`
- Anthropic: `@ai-sdk/anthropic`
- OpenAI-compatible: `@ai-sdk/openai-compatible`
- Google Generative AI: `@ai-sdk/google`
- Google Vertex: `@ai-sdk/google-vertex`
- Amazon Bedrock: `@ai-sdk/amazon-bedrock`
- Azure: `@ai-sdk/azure`
- Groq: `@ai-sdk/groq`
- Mistral: `@ai-sdk/mistral`
- xAI: `@ai-sdk/xai`
- DeepInfra: `@ai-sdk/deepinfra`
- OpenRouter: `@openrouter/ai-sdk-provider`

If models.dev advertises a provider whose SDK is not bundled, DH should list it as catalog-visible but runtime-unavailable with reason `unsupported_sdk`.

## Command Semantics

### `dh providers list [--json]`

Plain output:

- provider id
- display name
- enabled/disabled
- credential status
- model count
- runtime availability

JSON output:

```json
{
  "providers": [
    {
      "providerId": "openai",
      "name": "OpenAI",
      "enabled": true,
      "credentialStatus": "env",
      "credentialSource": "OPENAI_API_KEY",
      "modelCount": 12,
      "runtimeAvailable": true
    }
  ]
}
```

No raw secrets are allowed in either output mode.

### `dh providers login [provider] [--api-key-env <name>] [--api-key <value>]`

Rules:

- Provider id is required for non-interactive Milestone 4.
- Exactly one of `--api-key-env` or `--api-key` is required.
- `--api-key-env` stores only the env var name.
- `--api-key` stores the key in `.dh/auth/providers.json`.
- Output confirms provider and storage type, not key content.

Invalid combinations return exit code `1` with a deterministic message.

### `dh providers logout <provider>`

Removes only the local DH credential record. It does not unset process env vars and does not edit `opencode.json`.

If no local credential exists, return exit code `1` with `No local credential found for provider '<id>'.`

### `dh providers verify <provider> [--model <model>] [--json]`

Verification steps:

- Resolve provider config and credentials.
- Resolve model:
  - explicit `--model <model>`
  - default model from `opencode.json` if it matches provider
  - first available non-deprecated model from catalog
- If no credential exists, return `ok: false`, reason `missing_credential`.
- If credential exists, create a chat provider and run a tiny non-streaming request.

The prompt should be minimal and deterministic, such as `Reply with OK.`.

Errors must be redacted. Authentication failures should be classified as `auth_failed`; unsupported SDK as `unsupported_sdk`; network/provider failures as `request_failed`.

### `dh models [provider] [--refresh] [--verbose] [--json]`

Behavior:

- `--refresh` calls models.dev refresh and invalidates the in-process cache.
- Without provider, lists all enabled providers' models.
- With provider, lists only that provider.
- `--verbose` includes cost, limits, modalities, release date, and status when available.
- JSON output includes cache metadata:

```json
{
  "refreshed": true,
  "cache": {
    "path": "~/.dh/cache/models.json",
    "ageMs": 1234
  },
  "models": []
}
```

## Runtime Integration

Update `createChatProvider` so provider construction uses resolved provider runtime options:

- SDK npm package from model/provider config.
- base URL from resolved config.
- API key from credential resolver.
- provider-specific extra options when already represented in config.

If runtime creation fails due to missing credentials, throw a typed auth error that does not include the secret value.

Update legacy listing functions to call the new provider config loader. This keeps `config --agent`, model assignment validation, and fallback model resolution aligned with the new provider lifecycle.

## Redaction Rules

Centralize redaction in provider auth service:

- redact object keys matching `apiKey`, `api_key`, `token`, `authorization`, `secret`, `password`, `accessKey`, `secretAccessKey`
- redact string values that look like bearer tokens or `sk-...`
- never include raw `process.env` values in reports

Redaction markers:

- `[REDACTED_SECRET]`
- `env:<NAME>`
- `stored`

## Error Handling

Required deterministic errors:

- `dh providers login requires <provider>.`
- `Use exactly one of --api-key-env or --api-key.`
- `--api-key-env requires a variable name.`
- `--api-key requires a value.`
- `No local credential found for provider '<id>'.`
- `Provider '<id>' was not found.`
- `Model '<model>' was not found for provider '<id>'.`
- `Failed to parse opencode.json: <message>`
- `Provider '<id>' is not runtime-available: unsupported SDK '<package>'.`

## Testing Strategy

Use TDD and temp repositories.

Focused test areas:

- `provider-auth-store.test.ts`
  - writes mode-safe local credential file
  - reads public redacted records
  - deletes local credentials
- `provider-auth-service.test.ts`
  - precedence env > store > config
  - login/logout reports do not leak secrets
  - redaction covers nested objects
- `provider-config-loader.test.ts`
  - merges models.dev and `opencode.json`
  - rejects malformed `opencode.json`
  - respects enabled/disabled providers
  - reports unsupported SDKs
- `models-dev.test.ts`
  - refresh reports cache metadata and invalidates cache
- `create-chat-provider.test.ts`
  - injects resolved API key/baseURL without printing secrets
  - reports missing credentials as auth errors
- CLI tests:
  - `providers list/login/logout/verify`
  - `models --refresh --verbose --json`
  - root help includes new surfaces

Acceptance commands:

```bash
npm test -- provider-auth-store provider-auth-service provider-config-loader models-dev create-chat-provider providers models config-service root
npm run check
cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine
```

Manual smoke:

```bash
dh providers login openai --api-key-env OPENAI_API_KEY
dh providers list --json
dh models openai --json
dh providers verify openai --model gpt-4.1-mini --json
```

The fake-key smoke must prove secrets are not printed. Real provider verification requires a real credential and may be skipped with an explicit note when no credential is configured.

## Success Criteria

- Provider and model commands are visible in root help.
- Users can store or reference provider credentials without editing source code.
- Provider list output is useful and secret-safe.
- Model list and refresh use models.dev cache truthfully.
- Provider verification distinguishes missing credential, unsupported SDK, auth failure, and request failure.
- `dh run` can use configured providers through the same resolver path.
- Existing agent model assignment validation uses the new provider registry instead of hardcoded or stale listing assumptions.
