# PLAN: Clone OpenCode Provider Architecture (Option B)

> **Goal:** Thay thế hoàn toàn hạ tầng Provider hiện tại bằng kiến trúc tham chiếu từ `@opencode`
> (`/Users/duypham/Code/opencode/packages/opencode/src/provider/`).
> Đảm bảo tính tương thích với hệ thống config `opencode.json` đã có và
> các consumer hiện tại (`worker-command-router`, `config-service`, `planner`).

---

## Tổng quan Kiến trúc OpenCode (Nguồn tham chiếu)

```
opencode/packages/opencode/src/provider/
├── provider.ts      # 1724 dòng — Core: BUNDLED_PROVIDERS, custom loaders, SDK caching,
│                    #   Model/Info schemas (Effect), State management, Layer composition
├── transform.ts     # 1170 dòng — Message normalization, caching, variant generation
├── models.ts        # 175 dòng  — models.dev fetch + cache + snapshot
├── schema.ts        # 37 dòng   — Branded types: ProviderID, ModelID
├── error.ts         # 202 dòng  — Overflow detection, APICallError parsing
├── auth.ts          # 225 dòng  — OAuth/API key flows, Effect-based auth service
└── index.ts         # 6 dòng    — Re-exports
```

### Các pattern chính cần clone:
1. **`BUNDLED_PROVIDERS`** — Dynamic import map cho 22+ SDK packages
2. **`custom()` loaders** — Per-provider logic (Bedrock region, Vertex auth, Azure...)
3. **`State` management** — SDK instance cache, model loader cache, vars loader cache
4. **`Provider.Interface`** — Effect-based service: `list`, `getProvider`, `getModel`, `getLanguage`
5. **`ProviderTransform`** — Message normalization per-SDK, caching headers, variant generation
6. **`ProviderError`** — Overflow pattern matching, structured APICallError parsing
7. **`ModelsDev`** — Remote model database fetch from models.dev

---

## Phân tích Khoảng cách (Gap Analysis)

| Thành phần | OpenCode | DH Hiện tại | Gap |
|---|---|---|---|
| **Provider Factory** | Dynamic import map, 22+ SDKs, SDK caching | Static import 2 SDKs (openai, anthropic) | Rất lớn |
| **Config Schema** | Effect Schema + models.dev merge | Zod schema, đơn giản | Trung bình |
| **Model Database** | Fetch từ models.dev, local cache, snapshot fallback | Hardcoded `DEFAULT_MODELS` | Lớn |
| **State Management** | Effect `InstanceState`, Map-based caching | Không có (stateless per-call) | Lớn |
| **Message Transform** | Per-SDK normalization, cache control, interleaved reasoning | Không có | Lớn |
| **Error Handling** | 28 regex overflow patterns, structured parsing | Đơn giản `ChatProviderError` | Trung bình |
| **Variant System** | Dynamic generation từ model capabilities | Static hardcoded defaults | Trung bình |
| **Auth System** | OAuth + API key + Plugin auth + AWS credential chain | Chỉ env vars + config apiKey | Lớn |
| **Effect.js** | Core dependency cho DI, error, state | Không sử dụng | **Gap lớn nhất** |

---

## Chiến lược Implementation

### Quyết định kiến trúc quan trọng

> [!IMPORTANT]
> **Effect.js Integration**: OpenCode sử dụng `Effect.js` làm backbone cho toàn bộ
> Provider system (DI, error handling, state management). Clone trực tiếp yêu cầu
> cài đặt Effect.js và tạo Effect-based service layer trong DH.

> [!WARNING]
> **Breaking Change**: Toàn bộ các consumer hiện tại (6+ files) sẽ cần được
> cập nhật để gọi Provider thông qua Effect service thay vì function calls thuần.
> Đây là thay đổi kiến trúc lớn nhất trong lịch sử dự án.

---

## Phase 0: Cài đặt Dependencies & Effect Foundation

### Mục tiêu
Cài đặt Effect.js và các @ai-sdk packages cần thiết. Tạo base utilities.

### [NEW] `package.json` — Dependencies bổ sung
```
Dependencies cần thêm:
- effect                    # Core Effect runtime
- @ai-sdk/openai-compatible # Fallback cho custom providers
- @ai-sdk/google            # Google Gemini
- @ai-sdk/amazon-bedrock    # AWS Bedrock
- @ai-sdk/azure             # Azure OpenAI
- @ai-sdk/google-vertex     # GCP Vertex AI
- @ai-sdk/mistral           # Mistral
- @ai-sdk/groq              # Groq
- @ai-sdk/xai               # xAI/Grok
- @ai-sdk/deepinfra         # DeepInfra
- @openrouter/ai-sdk-provider # OpenRouter
- remeda                    # Utility (mapValues, mergeDeep, etc.)
- fuzzysort                 # Fuzzy model search

DevDependencies:
- @ai-sdk/provider          # Provider types (LanguageModelV3)
```

### [NEW] `packages/providers/src/effect/` — Effect bridge utilities
- `bridge.ts` — Thin wrapper để chạy Effect programs trong vanilla async context
- `instance-state.ts` — Simplified version of OpenCode's InstanceState

### Verification
- `npm install` thành công
- `npm run check` thành công với new deps

---

## Phase 1: Branded Types & Core Schemas

### Mục tiêu
Tạo type-safe branded IDs và model/provider schemas tương đương OpenCode.

### [NEW] `packages/providers/src/schema.ts`
Tương đương `opencode/src/provider/schema.ts`:
- `ProviderID` — Branded string type
- `ModelID` — Branded string type

### [MODIFY] `packages/shared/src/types/config-schema.ts`
Mở rộng config schema để match OpenCode's `config/provider.ts`:
- Thêm `env`, `whitelist`, `blacklist`, `timeout`, `chunkTimeout` vào ProviderConfig
- Thêm `cost`, `capabilities`, `status`, `headers`, `release_date` vào ModelConfig
- Thêm `disabled_providers`, `enabled_providers`, `model`, `small_model` vào root config

### [MODIFY] `packages/shared/src/types/model.ts`
Thay thế các Registry Entry types bằng full `Provider.Model` và `Provider.Info`:
- `Model` schema (id, providerID, api, name, capabilities, cost, limit, variants...)
- `Info` schema (id, name, source, env, key, options, models)
- `ListResult` schema
- Giữ lại `ResolvedModelSelection` và `AgentModelAssignment` cho backward compat

### Verification
- Type check passes
- Existing tests vẫn compile

---

## Phase 2: Models Database (models.dev Integration)

### Mục tiêu
Fetch model database từ models.dev thay vì hardcode.

### [NEW] `packages/providers/src/models-dev.ts`
Port từ `opencode/src/provider/models.ts`:
- `Data` lazy loader — Fetch `https://models.dev/api.json`
- Local file cache (`~/.dh/cache/models.json`)
- TTL-based refresh (5 phút)
- Fallback snapshot nếu fetch thất bại
- `get()` / `refresh()` exports

### [NEW] `packages/providers/src/models-snapshot.ts`
- Bundled fallback snapshot (generate bằng script)

### Verification
- `models-dev.get()` trả về Record<string, Provider> với đầy đủ model info
- Cache file được tạo đúng

---

## Phase 3: Provider Core (Effect-based Service)

### Mục tiêu
Đây là phase quan trọng nhất. Port toàn bộ core `provider.ts` logic.

### [NEW] `packages/providers/src/provider/provider.ts`
Port ~1200 dòng logic từ `opencode/src/provider/provider.ts`:

**3.1 — BUNDLED_PROVIDERS map:**
```typescript
const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {
  "@ai-sdk/anthropic": () => import("@ai-sdk/anthropic").then(m => m.createAnthropic),
  "@ai-sdk/openai": () => import("@ai-sdk/openai").then(m => m.createOpenAI),
  "@ai-sdk/google": () => import("@ai-sdk/google").then(m => m.createGoogleGenerativeAI),
  // ... 20+ entries
}
```

**3.2 — Custom loaders `custom(dep)`:**
Port các loader functions cho:
- `anthropic` — Custom headers (interleaved-thinking)
- `openai` — responses API routing
- `azure` — Resource name resolution, completion URL routing
- `amazon-bedrock` — Region prefix logic (us., eu., ap., global.)
- `google-vertex` — Project/location resolution, GoogleAuth
- `openrouter` — Referer headers

**3.3 — State management:**
```typescript
interface State {
  models: Map<string, LanguageModelV3>    // SDK instance cache
  providers: Record<ProviderID, Info>     // Loaded providers
  sdk: Map<string, BundledSDK>           // SDK factory cache
  modelLoaders: Record<string, CustomModelLoader>
  varsLoaders: Record<string, CustomVarsLoader>
}
```

**3.4 — Provider.Interface (Effect Service):**
```typescript
export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model>
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3>
  readonly closest: (providerID, query) => Effect.Effect<{providerID, modelID} | undefined>
  readonly getSmallModel: (providerID) => Effect.Effect<Model | undefined>
  readonly defaultModel: () => Effect.Effect<{providerID, modelID}>
}
```

**3.5 — SDK Resolution (`resolveSDK`):**
- Hash-based SDK instance caching
- Dynamic baseURL resolution with variable substitution
- Custom fetch wrapper (timeout, SSE chunk timeout)
- Bundled provider loading (dynamic import)
- Installed provider loading (npm package resolution)

**3.6 — Layer Composition:**
```typescript
export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(ConfigService.defaultLayer),
    Layer.provide(EnvService.defaultLayer),
    // Simplified: no Auth/Plugin layers initially
  )
)
```

### [NEW] `packages/providers/src/provider/index.ts`
Re-export barrel file

### Verification
- Provider.list() returns providers loaded from config + env
- Provider.getLanguage() returns working LanguageModel instance
- SDK caching works (same provider/options returns cached instance)

---

## Phase 4: Provider Transform

### Mục tiêu
Port message normalization và variant generation.

### [NEW] `packages/providers/src/provider/transform.ts`
Port essential transforms từ `opencode/src/provider/transform.ts`:

**4.1 — Message normalization (MVP scope):**
- Anthropic: Filter empty content, scrub toolCallIds, reorder tool blocks
- OpenAI: Strip itemId metadata
- DeepSeek: Ensure reasoning on assistant messages
- Interleaved reasoning field mapping

**4.2 — Cache control:**
- Anthropic cache control headers (system + last 2 messages)
- Bedrock cachePoint
- OpenRouter cache

**4.3 — Unsupported parts filter:**
- Detect unsupported modalities and convert to text error message

**4.4 — Variant generation:**
- `variants(model)` function — generate reasoning effort variants per provider
- Temperature/topP/topK defaults per model family

### Verification
- Transform correctly normalizes Anthropic messages
- Variants generate correctly for Claude, GPT-5, Gemini models

---

## Phase 5: Error Handling

### Mục tiêu
Port structured error handling cho API errors.

### [NEW] `packages/providers/src/provider/error.ts`
Port từ `opencode/src/provider/error.ts`:
- `OVERFLOW_PATTERNS` — 28 regex patterns cho context overflow detection
- `parseAPICallError()` — Structured error parsing
- `parseStreamError()` — SSE stream error parsing
- `message()` — Human-readable error message extraction
- `isOverflow()` — Context overflow detection

### [MODIFY] `packages/providers/src/chat/types.ts`
Cập nhật `ChatProviderErrorKind` để include `overflow` (đã có) và thêm:
- `context_overflow` error type mapping
- Structured error metadata

### Verification
- Overflow patterns correctly detect all major provider error formats
- Error messages are human-readable

---

## Phase 6: Xóa Legacy & Rewire Consumers

### Mục tiêu
Xóa bỏ hệ thống registry cũ và kết nối consumers với Provider Effect service mới.

### [DELETE] Files to remove:
- `packages/providers/src/chat/ai-provider-factory.ts` (replaced by provider.ts)
- `packages/providers/src/registry/provider-registry.ts` (replaced by Provider.list)
- `packages/providers/src/registry/model-registry.ts` (replaced by Provider.getModel)
- `packages/providers/src/registry/variant-registry.ts` (replaced by transform.variants)
- `packages/providers/src/resolution/resolve-agent-model.ts` (simplified)
- `packages/providers/src/resolution/resolve-fallback-model.ts` (simplified)

### [MODIFY] `packages/providers/src/chat/create-chat-provider.ts`
Cập nhật để sử dụng Provider service thay vì `createLanguageModel`:
```typescript
export async function createChatProvider(
  providerService: Provider.Interface,
  providerID: ProviderID,
  modelID: ModelID,
): Promise<ChatProvider> {
  const model = await Effect.runPromise(providerService.getModel(providerID, modelID))
  const language = await Effect.runPromise(providerService.getLanguage(model))
  // ... rest uses generateText/streamText with language model
}
```

### [MODIFY] `packages/opencode-app/src/config/config-service.ts`
- Replace `listProviders/listModels/listVariants` calls with Provider service
- Khởi tạo Provider service tại application bootstrap

### [MODIFY] `packages/opencode-app/src/worker/worker-command-router.ts`
- Inject Provider service vào WorkerCommandRouter
- Sử dụng service để resolve model khi cần

### [MODIFY] `packages/opencode-app/src/planner/build-execution-envelope.ts`
- Replace `resolveAgentModel` với Provider service call

### [MODIFY] `packages/opencode-app/src/planner/choose-agent-model.ts`
- Simplify: use Provider.defaultModel() or resolved selection

### [MODIFY] `packages/runtime/src/session/session-manager.ts`
- Inject Provider service, pass to planner functions

### [MODIFY] `packages/runtime/src/diagnostics/doctor.ts`
- Replace registry calls with Provider service

### Verification
- `npm run check` passes with 0 errors
- All existing tests pass or are updated

---

## Phase 7: Config Service Simplification

### Mục tiêu
Port OpenCode's config `provider.ts` schema vào config layer.

### [MODIFY] `packages/shared/src/types/config-schema.ts`
Align hoàn toàn với OpenCode's `config/provider.ts` schema:
- Full model config (cost, capabilities, status, modalities, experimental modes)
- Provider whitelist/blacklist
- Timeout/chunkTimeout options
- Variant disable/override

### [NEW] `packages/providers/src/config-loader.ts`
Unified config loading (replace 4 duplicate `loadConfig` functions):
- Effect-based config reader
- Validation with detailed error messages
- Merge logic: models.dev database + config file + env vars

### Verification
- Config loading from `opencode.json` works correctly
- Merge priority: config > env > models.dev defaults

---

## Phase 8: Simplified Auth Layer

### Mục tiêu
MVP auth layer — API key from config or env. No OAuth flow yet.

### [NEW] `packages/providers/src/auth/auth.ts`
Simplified version of OpenCode's auth:
- API key resolution: config.options.apiKey > env var > undefined
- Per-provider env var mapping (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- Effect service interface for future OAuth extension

### Verification
- Auth correctly resolves API keys from env and config
- Provider creation succeeds with resolved auth

---

## Phase 9: Integration Tests & Cleanup

### Mục tiêu
Full integration testing and cleanup.

### [MODIFY] `packages/providers/src/chat/chat.test.ts`
- Update tests to use Provider service
- Add tests for dynamic provider loading
- Add tests for SDK caching
- Add tests for error classification

### [NEW] `packages/providers/src/provider/provider.test.ts`
- Unit tests for State management
- Unit tests for config merge logic
- Unit tests for variant generation
- Unit tests for message transforms

### Final Verification
- `npm run check` — 0 errors
- `npm run test` — All tests pass
- Manual test: `dh ask` with OpenAI provider
- Manual test: `dh ask` with Anthropic provider

---

## Phân công Agent

| Phase | Agent | Nhiệm vụ |
|---|---|---|
| 0 | `backend-specialist` | Cài đặt deps, tạo Effect bridge |
| 1 | `backend-specialist` | Branded types, schema alignment |
| 2 | `backend-specialist` | models.dev integration |
| 3 | `backend-specialist` | **Core provider service** (heaviest) |
| 4 | `backend-specialist` | Transform layer |
| 5 | `backend-specialist` | Error handling |
| 6 | `orchestrator` | Consumer rewiring, breaking change management |
| 7 | `backend-specialist` | Config simplification |
| 8 | `backend-specialist` | Auth layer |
| 9 | `qa` | Integration tests, verification |

---

## Estimation

| Phase | Effort | Risk |
|---|---|---|
| Phase 0 | 🟢 Low | Low |
| Phase 1 | 🟡 Medium | Low |
| Phase 2 | 🟡 Medium | Medium (network dependency) |
| Phase 3 | 🔴 **High** | **High** (1200+ LOC, core logic) |
| Phase 4 | 🔴 High | Medium (complex transforms) |
| Phase 5 | 🟡 Medium | Low |
| Phase 6 | 🔴 **High** | **High** (breaking changes, 8+ files) |
| Phase 7 | 🟡 Medium | Low |
| Phase 8 | 🟢 Low | Low |
| Phase 9 | 🟡 Medium | Medium |

**Total estimated effort:** HIGH  
**Estimated total new/modified files:** ~25 files  
**Estimated total new LOC:** ~2500-3000 lines  
**Risk level:** HIGH (Effect.js adoption + breaking consumer changes)

---

## Open Questions

> [!IMPORTANT]
> 1. **Effect.js Scope**: Chỉ dùng Effect trong Provider layer hay mở rộng ra toàn bộ packages?
>    OpenCode dùng Effect everywhere. Nếu ta chỉ dùng trong providers, cần một bridge layer
>    để convert Effect → Promise tại boundary.
>
> 2. **models.dev Dependency**: Có muốn depend vào models.dev API hay prefer self-hosted/bundled model list?
>    OpenCode fetch real-time. Ta có thể bắt đầu với bundled snapshot chỉ.
>
> 3. **Auth Scope cho MVP**: Chỉ API key (env + config) hay cần OAuth flow ngay?
>    OpenCode có full OAuth. Ta có thể defer OAuth.
>
> 4. **Provider Scope cho MVP**: Cần bao nhiêu providers trong BUNDLED_PROVIDERS?
>    OpenCode có 22+. Ta có thể bắt đầu với 5-7 (openai, anthropic, google, openrouter, azure, bedrock, mistral).
>
> 5. **Transform Scope**: Cần full message normalization hay chỉ essential (Anthropic + OpenAI)?
>    OpenCode có ~400 dòng transforms. Ta có thể bắt đầu với Anthropic + OpenAI only.
