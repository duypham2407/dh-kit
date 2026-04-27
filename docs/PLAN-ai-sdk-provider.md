# Plan: Migrate Provider Layer to Vercel AI SDK

**Date:** 2026-04-27
**Status:** Draft — Awaiting Approval
**Lane:** `quick`
**Scope:** `packages/providers`, `packages/opencode-app`, `packages/shared`

---

## Problem Statement

Hiện tại `packages/providers/src/chat/` chứa 3 client viết bằng `fetch` thủ công (`openai-chat.ts`, `anthropic-chat.ts`, `proxypal-chat.ts`), mỗi cái tự implement retry, error parsing, response normalization — tạo ra ~600 dòng code boilerplate trùng lặp.

Quan trọng hơn, hệ thống **không đọc config từ file** (`opencode.json`). Provider và model bị hardcode trong code (`switch(providerId)`), khiến user không thể tự thêm provider mới (local Ollama, LM Studio, bất kỳ proxy OpenAI-compatible) mà không sửa source code.

Mục tiêu: **Chuyển sang Vercel AI SDK** — chuẩn mà OpenCode đang dùng — để provider trở thành **config-driven**, mọi proxy/endpoint chỉ cần thay `baseURL` + `apiKey` trong `opencode.json`.

---

## Target Architecture

```
opencode.json (user config)
    │
    ▼
┌────────────────────────────────────────────┐
│ ConfigService reads provider.* entries     │
│ → creates AI SDK LanguageModel instances   │
│ → registers into ProviderRegistry          │
└──────────────┬─────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────┐
│ ProviderRegistry (runtime, in-memory)      │
│                                            │
│  "proxypal"    → createOpenAI({baseURL})   │
│  "anthropic"   → createAnthropic({...})    │
│  "openai"      → createOpenAI({...})       │
│  "custom-xyz"  → createOpenAI({baseURL})   │
└──────────────┬─────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────┐
│ Agent Layer                                │
│ import { generateText, streamText } from   │
│   "ai" SDK                                 │
│                                            │
│ Uses LanguageModel from registry           │
│ Tool calling, structured output built-in   │
└────────────────────────────────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> **Breaking Change:** Interface `ChatProvider` hiện tại sẽ bị thay thế bằng `LanguageModelV1` của Vercel AI SDK. Mọi consumer (`worker-command-router.ts`, `run-knowledge-command.ts`, `run-lane-command.ts`) phải được cập nhật.

> [!IMPORTANT]
> **New Dependencies:** Cần thêm `ai` (core SDK), `@ai-sdk/openai`, `@ai-sdk/anthropic` vào `package.json`. Tổng ~3 packages.

---

## Open Questions

> [!IMPORTANT]
> 1. **Config file path:** Sử dụng `opencode.json` ở project root hay tạo `dh.json` riêng? (Recommend: dùng `opencode.json` giống OpenCode để tương thích).

> [!IMPORTANT]
> 2. **Fallback khi không có config:** Nếu user không có `opencode.json`, hệ thống nên auto-detect API keys từ env vars hay báo lỗi? (Recommend: auto-detect env vars như hiện tại, config file là optional override).

---

## Proposed Changes

### Phase 1: Install Dependencies & Define Config Schema

#### [MODIFY] [package.json](file:///Users/duypham/Code/DH/package.json)

Thêm AI SDK dependencies:

```json
{
  "dependencies": {
    "ai": "^5.x",
    "@ai-sdk/openai": "^2.x",
    "@ai-sdk/anthropic": "^2.x"
  }
}
```

#### [NEW] [config-schema.ts](file:///Users/duypham/Code/DH/packages/shared/src/types/config-schema.ts)

Zod schema cho `opencode.json` provider block, matching format hiện có trong `example/opencode.json`:

```typescript
// Defines: ProviderConfigSchema, ModelConfigSchema, VariantConfigSchema
// Matches the OpenCode JSON structure:
// provider.<id>.npm       → SDK package name
// provider.<id>.options   → { baseURL, apiKey, ... }
// provider.<id>.models.*  → model definitions with limits/variants
```

---

### Phase 2: Config-Driven Provider Registry

#### [MODIFY] [provider-registry.ts](file:///Users/duypham/Code/DH/packages/providers/src/registry/provider-registry.ts)

**Trước:** Hardcoded list trả về `["openai", "anthropic"]`.
**Sau:** Đọc config từ `opencode.json`, merge với env-var fallbacks, trả về dynamic list.

```typescript
// Before: return [ { providerId: "openai" }, { providerId: "anthropic" } ]
// After:  reads opencode.json → builds entries for each provider.* key
//         + auto-adds openai/anthropic if env vars exist but no config
```

#### [MODIFY] [model-registry.ts](file:///Users/duypham/Code/DH/packages/providers/src/registry/model-registry.ts)

**Trước:** Hardcoded 3 models.
**Sau:** Reads `provider.<id>.models.*` from config.

#### [MODIFY] [variant-registry.ts](file:///Users/duypham/Code/DH/packages/providers/src/registry/variant-registry.ts)

**Trước:** Hardcoded 5 variants.
**Sau:** Reads `provider.<id>.models.<model>.variants.*` from config.

---

### Phase 3: AI SDK Provider Factory (Core Change)

#### [NEW] [ai-provider-factory.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/ai-provider-factory.ts)

Factory tạo `LanguageModel` instances từ AI SDK, dựa trên config đã parse:

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

// Nhận parsed config → trả về LanguageModel
// Logic:
// - npm === "@ai-sdk/openai"    → createOpenAI({ baseURL, apiKey })
// - npm === "@ai-sdk/anthropic" → createAnthropic({ baseURL, apiKey })
// - default                     → createOpenAI({ baseURL, apiKey })
//   (vì hầu hết proxy đều OpenAI-compatible)
```

Đây là file quan trọng nhất — nó thay thế toàn bộ `openai-chat.ts`, `anthropic-chat.ts`, `proxypal-chat.ts`.

#### [MODIFY] [create-chat-provider.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/create-chat-provider.ts)

**Trước:** `switch(providerId)` → hardcoded factory functions.
**Sau:** Đọc config → gọi `ai-provider-factory` → trả về `LanguageModel`.

Trong giai đoạn transition, file này sẽ wrap AI SDK `LanguageModel` thành interface `ChatProvider` cũ để giảm blast radius. Sau đó Phase 4 sẽ xóa wrapper này.

#### [MODIFY] [types.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/types.ts)

Giữ lại `ChatProviderError` types (vẫn hữu ích). Export thêm re-export từ `ai` SDK để consumers không cần import trực tiếp.

#### [DELETE] [openai-chat.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/openai-chat.ts)

Không cần nữa — AI SDK handle toàn bộ.

#### [DELETE] [anthropic-chat.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/anthropic-chat.ts)

Không cần nữa — AI SDK handle toàn bộ.

#### [DELETE] [proxypal-chat.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/proxypal-chat.ts)

ProxyPal chỉ là `createOpenAI({ baseURL: "http://127.0.0.1:8317/v1" })` — 1 dòng thay vì 282 dòng.

---

### Phase 4: Update Consumers

#### [MODIFY] [worker-command-router.ts](file:///Users/duypham/Code/DH/packages/opencode-app/src/worker/worker-command-router.ts)

**Trước (line 73):** `createChatProvider({ providerId: "proxypal", model: "gpt-4o" })`
**Sau:** Dùng `LanguageModel` từ registry, gọi qua `generateText`/`streamText`.

#### [MODIFY] [run-knowledge-command.ts](file:///Users/duypham/Code/DH/packages/opencode-app/src/workflows/run-knowledge-command.ts)

**Trước (line 291-341):** Manual chat + streaming logic với custom `ChatProvider`.
**Sau:** Sử dụng `streamText()` từ AI SDK. Xóa toàn bộ manual SSE parsing.

```typescript
// Before:
if (input.provider.chatStream) {
  const response = await input.provider.chatStream(request, onChunk);
}
// After:
const result = streamText({
  model: languageModel,
  messages: [...],
  onChunk({ chunk }) { peer.notify("event.tool.outputChunk", { chunk: chunk.textDelta }); }
});
```

#### [MODIFY] [run-lane-command.ts](file:///Users/duypham/Code/DH/packages/opencode-app/src/workflows/run-lane-command.ts)

Cập nhật import path từ `ChatProvider` → `LanguageModel`.

#### [MODIFY] [config-service.ts](file:///Users/duypham/Code/DH/packages/opencode-app/src/config/config-service.ts)

Thêm method `loadProviderConfig()` đọc `opencode.json` từ workspace root.

---

### Phase 5: Update Tests & Cleanup

#### [MODIFY] [chat.test.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/chat.test.ts)

Cập nhật test suite cho factory mới. Mock AI SDK responses thay vì mock fetch.

#### [MODIFY] [retrying-chat-provider.test.ts](file:///Users/duypham/Code/DH/packages/runtime/src/reliability/retrying-chat-provider.test.ts)

Cập nhật retry tests — AI SDK có retry mechanism riêng, có thể simplify.

#### [KEEP] [mock-chat.ts](file:///Users/duypham/Code/DH/packages/providers/src/chat/mock-chat.ts)

Giữ lại cho unit tests. Wrap thành AI SDK `MockLanguageModelV1` nếu cần.

---

## Migration Safety

| Risk | Mitigation |
|------|------------|
| Breaking existing `ChatProvider` consumers | Phase 3 tạo compatibility wrapper; Phase 4 mới xóa |
| `opencode.json` không tồn tại | Fallback tự động: detect env vars (`OPENAI_API_KEY`, etc.) |
| AI SDK version mismatch | Pin exact versions trong `package.json` |
| Streaming behavior khác biệt | Test streaming trên cả ProxyPal và direct Anthropic |

---

## File Impact Summary

| Action | File | Reason |
|--------|------|--------|
| **NEW** | `packages/shared/src/types/config-schema.ts` | Zod schema cho provider config |
| **NEW** | `packages/providers/src/chat/ai-provider-factory.ts` | AI SDK factory core |
| **MODIFY** | `package.json` | Add `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic` |
| **MODIFY** | `packages/providers/src/chat/create-chat-provider.ts` | Config-driven factory |
| **MODIFY** | `packages/providers/src/chat/types.ts` | Re-export AI SDK types |
| **MODIFY** | `packages/providers/src/registry/provider-registry.ts` | Dynamic from config |
| **MODIFY** | `packages/providers/src/registry/model-registry.ts` | Dynamic from config |
| **MODIFY** | `packages/providers/src/registry/variant-registry.ts` | Dynamic from config |
| **MODIFY** | `packages/opencode-app/src/worker/worker-command-router.ts` | Use AI SDK |
| **MODIFY** | `packages/opencode-app/src/workflows/run-knowledge-command.ts` | Use `streamText` |
| **MODIFY** | `packages/opencode-app/src/workflows/run-lane-command.ts` | Update imports |
| **MODIFY** | `packages/opencode-app/src/config/config-service.ts` | Load provider config |
| **MODIFY** | `packages/providers/src/chat/chat.test.ts` | Update tests |
| **DELETE** | `packages/providers/src/chat/openai-chat.ts` | Replaced by AI SDK |
| **DELETE** | `packages/providers/src/chat/anthropic-chat.ts` | Replaced by AI SDK |
| **DELETE** | `packages/providers/src/chat/proxypal-chat.ts` | Replaced by AI SDK |

---

## Verification Plan

### Automated Tests

```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Unit tests
npx vitest run

# 3. Integration test: verify ProxyPal works via AI SDK
# (manual — start ProxyPal local, run `dh ask "test"`)
```

### Manual Verification

1. **ProxyPal mode:** Chạy `dh ask "how does auth work?"` → verify streaming output qua ProxyPal proxy.
2. **Direct Anthropic:** Set `ANTHROPIC_API_KEY`, configure `opencode.json` → verify direct call hoạt động.
3. **No config fallback:** Xóa `opencode.json`, chỉ set env var → verify tự động detect.
4. **Custom provider:** Thêm 1 custom provider vào `opencode.json` trỏ tới Ollama local → verify kết nối thành công.

---

## Execution Order

```
Phase 1 (Dependencies + Schema)
  └── Phase 2 (Registry becomes config-driven)
        └── Phase 3 (AI SDK Factory + Compatibility Wrapper)
              └── Phase 4 (Update Consumers, remove wrapper)
                    └── Phase 5 (Tests + Delete dead files)
```

Ước tính thời gian: **1-2 sessions** (~4-6 giờ làm việc).
