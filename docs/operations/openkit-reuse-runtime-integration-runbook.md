# OpenKit Reuse Runtime Integration — Resume & Ops Runbook

Date: 2026-04-11  
Owner: FullstackAgent  
Scope refs:
- `docs/scope/2026-04-11-openkit-reuse-dh-runtime-integration.md`
- `docs/solution/2026-04-11-openkit-reuse-dh-runtime-integration.md`
- `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md`

---

## 1) Resume trong 5–10 phút

1. Mở checklist: `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md`
2. Đọc mục progress log mới nhất + phase table.
3. Xác nhận runtime graph tools đã được register trong Go agent:
   - `packages/opencode-core/internal/llm/agent/tools.go`
4. Xác nhận enforcement hook đang đi qua `RuntimeEnforcer`:
   - `packages/opencode-app/src/executor/hook-enforcer.ts`
5. Chạy quick validation:
   - `npm run check`
   - `npm run test -- packages/runtime/src/hooks/runtime-enforcer.test.ts packages/opencode-app/src/executor/hook-enforcer.test.ts`

---

## 2) Validation command set chuẩn

### TS validation

```bash
npm run check
npm run test -- packages/runtime/src/hooks/runtime-enforcer.test.ts packages/opencode-app/src/executor/hook-enforcer.test.ts packages/runtime/src/hooks/bash-guard.test.ts packages/runtime/src/hooks/evidence-gate.test.ts packages/storage/src/sqlite/repositories/graph-repo.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/extract-call-graph.test.ts packages/intelligence/src/graph/reference-tracker.test.ts packages/intelligence/src/graph/graph-indexer.test.ts
```

### Go validation

```bash
go test ./internal/llm/tools ./internal/llm/agent
```

Workdir for Go command: `packages/opencode-core/`

---

## 3) Benchmark/index latency evidence

Run:

```bash
npx vitest run packages/intelligence/src/graph/graph-indexer.benchmark.test.ts --reporter=verbose
```

Expected stdout format:

```text
[graph-indexer-benchmark] full_ms=<n> full_indexed=<n> incremental_ms=<n> incremental_indexed=<n> incremental_skipped=<n>
```

Current evidence snapshot (2026-04-11):
- `full_ms=3167`
- `full_indexed=120`
- `incremental_ms=36`
- `incremental_indexed=1`
- `incremental_skipped=119`

Interpretation: incremental indexing đang hoạt động đúng semantics “chỉ index file thay đổi”.

---

## 4) Debug guide (nhanh)

### Enforcement mode (strict/advisory)

- Current logic in `packages/runtime/src/hooks/runtime-enforcer.ts` maps:
  - `sessions.tool_enforcement_level = "very-hard"` -> bash guard `strict`
  - any other/unset value -> `advisory`
- To enforce strict behavior for a session, ensure session state is saved with `toolEnforcementLevel: "very-hard"` before running tool calls.

### A. `dh.*` tools không thấy trong runtime
- Kiểm tra registration tại `packages/opencode-core/internal/llm/agent/tools.go`
- Chạy `go test ./internal/llm/agent` để bắt compile/regression.

### B. Bash command không bị block/suggest đúng
- Kiểm tra `packages/runtime/src/hooks/bash-guard.ts`
- Kiểm tra đường đi hook `packages/opencode-app/src/executor/hook-enforcer.ts`
- Kiểm tra quyết định ghi vào DB qua `HookInvocationLogsRepo`.

### C. Pre-answer không gate câu hỏi structural
- Kiểm tra pattern tại `packages/runtime/src/hooks/evidence-gate.ts`
- Đảm bảo `toolsUsed` có chứa `dh.*` phù hợp intent.

### D. Graph index chậm hoặc sai
- Chạy benchmark test để lấy số liệu mới.
- Kiểm tra `packages/intelligence/src/graph/graph-indexer.ts` và `graph_nodes.content_hash` semantics.

---

## 5) Deferred items (nếu cần)

- So sánh formal report regex-vs-AST trên codebase lớn (ngoài phạm vi smoke test hiện tại).
- Mở rộng module resolution cho tsconfig paths / aliases (`@/`, `~/`) nếu yêu cầu product ưu tiên.

Nếu deferred, cập nhật checklist với: reason + owner + next action + evidence hiện có.
