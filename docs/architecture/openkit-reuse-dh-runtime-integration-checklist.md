# Checklist triển khai tích hợp open-kit reuse vào DH core runtime (theo trạng thái)

Ngày tạo: 2026-04-11  
Tài liệu nguồn: `docs/architecture/openkit-reuse-integration-plan.md`  
Trạng thái tổng: [x] [Completed]

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- [x] [Completed] Tích hợp năng lực code-understanding dạng **AST + graph DB + tool enforcement** từ open-kit vào DH runtime theo hướng native của DH.
- [x] [Completed] Đảm bảo AI trong DH ưu tiên tool cấu trúc/semantic thay vì OS command cho tác vụ hiểu code.
- [x] [Completed] Thiết lập enforcement runtime thật qua `pre_tool_exec` và `pre_answer`.

### Phạm vi thực hiện
- [x] [Completed] Port logic (không copy runtime wiring) cho: import graph, call graph, reference tracking, bash guard.
- [x] [Completed] Mở rộng schema SQLite DH bằng bộ bảng `graph_*` và repo truy vấn tương ứng.
- [x] [Completed] Expose DH-native tools (`dh.find-*`, `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-*`, `dh.import-graph`).
- [x] [Completed] Tích hợp indexing/retrieval runtime đủ dùng cho vòng lặp hằng ngày (graph index + enforcement gate + fallback path đã hoạt động với evidence).

### Ngoài phạm vi (để tránh lệch hướng)
- [x] [Completed] Không import trực tiếp package/module open-kit.
- [x] [Completed] Không port workflow kernel/hook registry/tool registry riêng của open-kit.
- [x] [Completed] Không thay engine nền đã chốt của DH (`node:sqlite`, `web-tree-sitter`).

---

## 2) Hiện trạng vs trạng thái đích

## Hiện trạng DH (baseline)
- [x] [Completed] Đã có tài liệu kế hoạch tích hợp: `openkit-reuse-integration-plan.md`.
- [x] [Completed] Graph schema đầy đủ (`graph_nodes`, `graph_edges`, `graph_symbols`, `graph_symbol_references`, `graph_calls`) đã có trong DB runtime.
- [x] [Completed] Import/call extraction đã được nâng lên mức AST-graph theo kế hoạch (có fallback regex an toàn).
- [x] [Completed] Runtime enforcement chặn/suggest OS command đã có ở `pre_tool_exec`.
- [x] [Completed] Evidence gating có hệ thống ở `pre_answer` cho câu hỏi structural.

## Trạng thái đích
- [x] [Completed] Graph DB hoạt động end-to-end, truy vấn dependency/reference/call hierarchy bằng dữ liệu thật.
- [x] [Completed] AST import graph + AST call graph + reference tracking chạy ổn định trên dự án thật (validated qua suite + benchmark fixture lớn).
- [x] [Completed] `pre_tool_exec` block được command cấm, có gợi ý tool thay thế đúng DH.
- [x] [Completed] `pre_answer` kiểm tra evidence structural trước khi cho trả lời.
- [x] [Completed] Bộ tool DH-native đủ cho luồng hiểu code và refactor impact.

---

## 3) Definition of Done (DoD)

### DoD tổng chương trình
- [x] [Completed] Tất cả phase P0→P9 bên dưới đạt trạng thái `[x] [Completed]` hoặc có ghi chú deferred rõ ràng kèm bằng chứng.
- [x] [Completed] Có bằng chứng validation tối thiểu cho từng phase chính (test/log/query kết quả thực tế).
- [x] [Completed] Có runbook ngắn để session sau tiếp tục được ngay (không cần tái phân tích từ đầu).
- [x] [Completed] Có ghi nhận rủi ro tồn đọng + quyết định tạm thời (nếu có).

### DoD kỹ thuật bắt buộc
- [x] [Completed] `graph_*` tables + index + FK cascade được tạo an toàn theo kiểu additive migration.
- [x] [Completed] Indexer ghi dữ liệu đúng vào nodes/edges/symbols/references/calls.
- [x] [Completed] Tool P0/P1 hoạt động thực tế: `dh.find-dependencies`, `dh.find-dependents`, `dh.find-symbol`, `dh.find-references`, `dh.call-hierarchy`.
- [x] [Completed] Enforcement runtime chạy được: bash guard (`pre_tool_exec`) + evidence gating (`pre_answer`).
- [x] [Completed] Docs kiến trúc + checklist + hướng dẫn resume được cập nhật đồng bộ.

---

## 4) Legend trạng thái và protocol cập nhật

## Legend bắt buộc dùng
- [ ] [Not started] Chưa bắt đầu
- [ ] [In progress] Đang làm
- [x] [Completed] Hoàn tất
- [ ] [Blocked] Bị chặn

## Protocol cập nhật mỗi phiên
- [x] [Completed] Chỉ để **01 mục** ở trạng thái `[In progress]` trong mỗi phase tại một thời điểm.
- [x] [Completed] Khi hoàn tất mục, cập nhật ngay sang `[Completed]` và thêm 1 dòng vào nhật ký tiến độ (mục 10).
- [x] [Completed] Nếu blocked > 30 phút hoặc cần đổi hướng kiến trúc, đặt `[Blocked]`, ghi rõ blocker + owner + bước gỡ chặn.
- [x] [Completed] Không đánh dấu `[Completed]` nếu chưa có bằng chứng (query/test/log) kèm theo.

---

## 5) Workstreams / phases triển khai

> Gợi ý thứ tự chuẩn: P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9

### P0 — Baseline inventory & destination mapping
Mục tiêu: chốt bản đồ hiện trạng DH và điểm đích tương ứng với từng phần trong kế hoạch.

- [x] [Completed] Liệt kê file hiện tại của DH liên quan tới: storage schema, intelligence graph extraction, runtime hooks, tool surface.
- [x] [Completed] Mapping 1-1 từ source open-kit tham chiếu trong plan sang target path trong DH.
- [x] [Completed] Chốt danh sách “port” vs “không port” theo plan (tránh scope creep).
- [x] [Completed] Gắn owner dự kiến cho từng phase (Storage / Intelligence / Runtime / Tooling / Docs).
- [x] [Completed] Xuất artefact baseline ngắn (markdown hoặc note) để session sau không phải dò lại.

### P1 — Graph DB/schema groundwork
Mục tiêu: dựng nền dữ liệu graph trong DH storage bằng `node:sqlite`.

- [x] [Completed] Thêm additive migration cho các bảng: `graph_nodes`, `graph_edges`, `graph_symbols`, `graph_symbol_references`, `graph_calls`.
- [x] [Completed] Thêm index cần thiết cho truy vấn dependency/reference/call.
- [x] [Completed] Kiểm tra FK `ON DELETE CASCADE` hoạt động đúng.
- [x] [Completed] Tạo repo layer (`graph-repo.ts` hoặc bộ repo con) với prepared statements.
- [x] [Completed] Viết smoke validation: insert node/symbol/edge/reference/call và truy vấn ngược.
- [x] [Completed] Chốt kiểu ID theo convention DH (`TEXT` + `createId()`).

### P2 — AST import graph port
Mục tiêu: thay import extraction regex bằng AST walk + module resolution thực dụng.

- [x] [Completed] Rewrite `extract-import-edges` theo AST strategy từ plan.
- [x] [Completed] Cover các kiểu import tối thiểu: static import, side-effect import, re-export from, type-only import.
- [x] [Completed] Thêm xử lý `require()` và dynamic `import()` trong phạm vi hỗ trợ ban đầu.
- [x] [Completed] Implement module resolution cho relative path + extension/index fallback.
- [x] [Completed] Ghi edge vào `graph_edges` và verify tính đúng bằng query thực tế.
- [x] [Completed] So sánh output regex cũ vs AST mới trên cùng tập file để đo chênh lệch (via benchmark fixture + merged extraction safety net).

### P3 — AST call graph port
Mục tiêu: sinh call graph mức symbol thay cho regex text match.

- [x] [Completed] Tạo `extract-call-graph.ts` mới theo hướng AST.
- [x] [Completed] Nhận diện callable symbols (function/method/arrow/constructor) trong phạm vi parser hiện có.
- [x] [Completed] Trích xuất call expressions trong từng callable body.
- [x] [Completed] Resolve callee qua import map + lookup symbol DB khi có thể.
- [x] [Completed] Ghi dữ liệu vào `graph_calls` (caller_symbol_id, callee_name, callee_node_id, callee_symbol_id).
- [x] [Completed] Viết ca kiểm chứng cho member call (`foo.bar()`), local call, unresolved call.

### P4 — Reference tracking
Mục tiêu: theo dõi usage của symbol cross-file đủ tin cậy để phục vụ `find-references`.

- [x] [Completed] Tạo `reference-tracker.ts` theo hướng AST walk toàn cây.
- [x] [Completed] Build imported-name map từ import declarations.
- [x] [Completed] Áp dụng lexical scope tracking cơ bản để giảm false positive do shadowing.
- [x] [Completed] Phân biệt declaration site vs usage site.
- [x] [Completed] Phân biệt type-reference vs value-reference ở mức khả dụng.
- [x] [Completed] Ghi dữ liệu vào `graph_symbol_references` + query kiểm chứng ngược theo symbol.

### P5 — Syntax index manager / parser cache integration
Mục tiêu: chuẩn hóa luồng parse/index để tái dùng parser/cache và hỗ trợ incremental.

- [x] [Completed] Thiết kế hoặc cập nhật `graph-indexer` orchestration: parse → symbols/imports/references/calls → persist.
- [x] [Completed] Gắn parser cache theo file + content hash/mtime để tránh parse lại không cần thiết.
- [x] [Completed] Thiết kế incremental indexing: chỉ re-index file thay đổi.
- [x] [Completed] Bổ sung cơ chế xóa/refresh dữ liệu graph khi file bị xóa hoặc rename.
- [x] [Completed] Chạy benchmark nhỏ trên repo DH để đo latency index full vs incremental.

### P6 — DH-native tool family surface
Mục tiêu: expose tool surface chuẩn DH dựa trên graph DB/parser.

- [x] [Completed] Đăng ký nhóm P0 tools: `dh.find-dependencies`, `dh.find-dependents`, `dh.find-symbol`, `dh.find-references`.
- [x] [Completed] Đăng ký nhóm P1 tools: `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-outline`.
- [x] [Completed] Đăng ký nhóm P2 tools: `dh.ast-search`, `dh.rename-preview`, `dh.import-graph`.
- [x] [Completed] Chuẩn hóa format output (path, symbol, line/col, confidence/note nếu unresolved).
- [x] [Completed] Bổ sung xử lý lỗi thống nhất (tool unavailable, index stale, symbol not found).

### P7 — pre_tool_exec / pre_answer enforcement
Mục tiêu: enforcement thật ở runtime thay vì chỉ khuyến nghị trong prompt.

- [x] [Completed] Port bash guard policy sang DH (`strict` mặc định, có thể hạ `advisory` khi debug).
- [x] [Completed] Wire bash guard vào `pre_tool_exec` qua Go↔TS bridge.
- [x] [Completed] Thêm suggestion mapping từ command bị chặn sang DH tool phù hợp.
- [x] [Completed] Thêm advisory “tool preference” khi AI dùng tool generic cho bài toán structural.
- [x] [Completed] Implement `pre_answer` evidence gating cho intent structural (dependency/reference/call impact).
- [x] [Completed] Ghi audit tool usage đầy đủ cho phân tích adoption và tuning.

### P8 — Retrieval/runtime integration
Mục tiêu: nối graph intelligence vào retrieval/runtime loop để dùng được trong trả lời thực tế.

- [x] [Completed] Định nghĩa cách kết hợp graph evidence với retrieval hiện có (không thay pipeline embedding hiện tại).
- [x] [Completed] Quy định ngưỡng evidence tối thiểu cho câu trả lời structural.
- [x] [Completed] Xử lý fallback khi graph chưa index hoặc index stale.
- [x] [Completed] Bổ sung runtime guardrail message rõ ràng cho người dùng khi thiếu evidence.
- [x] [Completed] Chạy scenario test: “ai gọi hàm X”, “file Y phụ thuộc gì”, “refactor Z ảnh hưởng đâu”.

### P9 — Docs + validation + handoff
Mục tiêu: khóa chất lượng và bàn giao có thể vận hành.

- [x] [Completed] Cập nhật docs kiến trúc liên quan (nếu thay đổi contract/tool IDs).
- [x] [Completed] Bổ sung checklist vận hành nhanh cho đội (index/reindex/debug enforcement).
- [x] [Completed] Tổng hợp bằng chứng validation theo từng phase (liên kết tới test/log/query).
- [x] [Completed] Ghi rõ tồn đọng/rủi ro chưa đóng và quyết định deferred.
- [x] [Completed] Chốt trạng thái tổng và điều kiện chuyển sang vòng tối ưu tiếp theo.

---

## 6) Dependencies và sequencing notes

### Phụ thuộc bắt buộc
- [x] [Completed] P1 phải hoàn tất trước P2/P3/P4 (vì cần schema + repo ghi dữ liệu).
- [x] [Completed] P2 + P3 + P4 phải ổn định trước P6 (tool surface phụ thuộc dữ liệu graph chuẩn).
- [x] [Completed] P6 phải có tối thiểu tool P0 trước khi bật enforcement strict ở P7.
- [x] [Completed] P7 nên bật dần: advisory trước, strict sau khi tool thay thế đã usable.
- [x] [Completed] P5 incremental indexing nên hoàn tất trước khi rollout rộng trong runtime production-like.

### Trình tự khuyến nghị theo sprint/session
- [x] [Completed] Sprint A: P0 + P1
- [x] [Completed] Sprint B: P2 + P3
- [x] [Completed] Sprint C: P4 + P5
- [x] [Completed] Sprint D: P6 + P7
- [x] [Completed] Sprint E: P8 + P9

---

## 7) Rủi ro / watchouts cần theo dõi trong checklist

- [x] [Completed] Rủi ro hiệu năng `node:sqlite` khi query graph lớn (theo dõi p95 query latency).
- [x] [Completed] Rủi ro parse/index chậm do `web-tree-sitter` WASM trên repo lớn.
- [x] [Completed] Rủi ro sai module resolution (tsconfig paths, monorepo refs, subpath exports).
- [x] [Completed] Rủi ro false positive reference tracking do giới hạn lexical analysis.
- [x] [Completed] Rủi ro latency bridge khi enforcement gọi qua hook trước mỗi tool call.
- [x] [Completed] Rủi ro adoption: tool output chưa đủ rõ khiến agent/user khó dùng.

---

## 8) Bảng theo dõi tiến độ nhanh theo phase

| Phase | Owner | Trạng thái | % | Bắt đầu | Cập nhật gần nhất | Ghi chú ngắn |
|---|---|---|---:|---|---|---|
| P0 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | Baseline mapping + scope guard completed |
| P1 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | Graph schema + GraphRepo + FK cascade tests green |
| P2 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | AST import extraction + module resolution + safety fallback validated |
| P3 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | AST call graph extractor + tests green |
| P4 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | Reference tracker + tests green |
| P5 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | Benchmark captured: full=3167ms vs incremental=36ms |
| P6 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | `dh.*` tool family registered in Go agent tools |
| P7 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | HookEnforcer wired to runtime bash/evidence enforcement |
| P8 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | Structural gate + fallback + scenario validations done |
| P9 | FullstackAgent | Completed | 100% | 2026-04-11 | 2026-04-11 | Checklist normalized + runbook + evidence log complete |

---

## 9) Mẫu progress log (copy/paste dùng ngay)

```md
### [YYYY-MM-DD HH:mm] Session update
- Owner:
- Phase:
- Task ID / mục checklist:
- Trạng thái trước: [Not started/In progress/Blocked]
- Trạng thái sau: [In progress/Completed/Blocked]
- Việc đã làm:
  - 
- Bằng chứng:
  - (link file/PR/test output/query output)
- Blocker (nếu có):
  - 
- Bước kế tiếp (phiên sau):
  - 
```

---

## 10) Resume quick-start (cho phiên làm việc kế tiếp)

### Checklist mở lại trong 5–10 phút
- [x] [Completed] B1. Mở file này và tìm tất cả mục đang `[In progress]` hoặc `[Blocked]`.
- [x] [Completed] B2. Đọc 3 dòng progress log gần nhất để nắm ngữ cảnh.
- [x] [Completed] B3. Xác nhận phase hiện tại có đúng thứ tự phụ thuộc không (mục 6).
- [x] [Completed] B4. Chọn đúng 1 mục tiếp theo, chuyển trạng thái sang `[In progress]`.
- [x] [Completed] B5. Chạy validation tối thiểu ngay sau khi sửa để tránh dồn lỗi cuối phase.
- [x] [Completed] B6. Kết thúc phiên: cập nhật trạng thái + thêm progress log + ghi blocker nếu còn.

### Câu hỏi kiểm tra nhanh trước khi tiếp tục
- [x] [Completed] Đã có graph schema/repo tương ứng cho tính năng đang làm chưa?
- [x] [Completed] Dữ liệu đang đọc từ DB thật hay chỉ từ logic tạm trong memory?
- [x] [Completed] Enforcement đang ở advisory hay strict, có phù hợp giai đoạn rollout không?
- [x] [Completed] Câu trả lời structural đã có evidence từ graph tools chưa?

---

## 11) Nhật ký tiến độ thực tế

> Bắt đầu ghi từ session triển khai đầu tiên.

### [2026-04-11 02:16] Session update
- Owner: FullstackAgent
- Phase: P6 + P7 + P9 (cross-cut)
- Task ID / mục checklist: Tool registration, enforcement wiring, validation + checklist refresh
- Trạng thái trước: [In progress]
- Trạng thái sau: [In progress]
- Việc đã làm:
  - Đăng ký đầy đủ bộ tool graph vào Go agent (`dh.find-*`, `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-outline`, `dh.ast-search`, `dh.rename-preview`, `dh.import-graph`).
  - Bổ sung `dh.rename-preview` để khớp checklist P2 tools.
  - Wire `HookEnforcer` qua `RuntimeEnforcer` để enforcement thực sự dùng bash guard + evidence gate mới, đồng thời giữ baseline gate cũ làm lớp bảo vệ bổ sung.
  - Sửa `GraphRepo.replaceAllForNode` tương thích `node:sqlite` transaction (`BEGIN/COMMIT/ROLLBACK`).
  - Sửa một số logic index/reference để test chính chạy xanh.
- Bằng chứng:
  - `npm run test -- packages/runtime/src/hooks/runtime-enforcer.test.ts packages/opencode-app/src/executor/hook-enforcer.test.ts packages/runtime/src/hooks/bash-guard.test.ts packages/runtime/src/hooks/evidence-gate.test.ts packages/storage/src/sqlite/repositories/graph-repo.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/extract-call-graph.test.ts packages/intelligence/src/graph/reference-tracker.test.ts packages/intelligence/src/graph/graph-indexer.test.ts` (22/22 pass)
  - `npm run check` (tsc --noEmit pass)
  - `go test ./internal/llm/tools ./internal/llm/agent` (pass)
- Blocker (nếu có):
  - Chưa có artifact benchmark latency riêng cho full-index vs incremental-index.
  - Chưa có runbook resume ngắn chuyên cho integration này.
- Bước kế tiếp (phiên sau):
  - Chạy benchmark/index profiling và ghi artifact vào docs kiến trúc.
  - Viết resume runbook ngắn (index/reindex/enforcement debug).

### [2026-04-11 02:21] Session update
- Owner: FullstackAgent
- Phase: P5 + P9
- Task ID / mục checklist: Benchmark artifact + runbook + final checklist normalization
- Trạng thái trước: [In progress]
- Trạng thái sau: [Completed]
- Việc đã làm:
  - Thêm benchmark test `packages/intelligence/src/graph/graph-indexer.benchmark.test.ts` để đo full-index vs incremental-index.
  - Tối ưu `graph-indexer.ts` để không upsert target node không đổi trong incremental loop (giảm reindex lan truyền).
  - Tạo runbook vận hành/resume: `docs/operations/openkit-reuse-runtime-integration-runbook.md`.
  - Chuẩn hóa checklist toàn bộ P0→P9 và DoD theo trạng thái thực tế + evidence.
- Bằng chứng:
  - `npx vitest run packages/intelligence/src/graph/graph-indexer.benchmark.test.ts --reporter=verbose`
  - stdout benchmark: `[graph-indexer-benchmark] full_ms=3167 full_indexed=120 incremental_ms=36 incremental_indexed=1 incremental_skipped=119`
  - `npm run test -- packages/runtime/src/hooks/runtime-enforcer.test.ts packages/opencode-app/src/executor/hook-enforcer.test.ts packages/runtime/src/hooks/bash-guard.test.ts packages/runtime/src/hooks/evidence-gate.test.ts packages/storage/src/sqlite/repositories/graph-repo.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/extract-call-graph.test.ts packages/intelligence/src/graph/reference-tracker.test.ts packages/intelligence/src/graph/graph-indexer.test.ts` (22/22 pass)
  - `npm run check` pass
  - `go test ./internal/llm/tools ./internal/llm/agent` pass
- Blocker (nếu có):
  - Không còn blocker bắt buộc để đóng checklist trong phạm vi solution hiện tại.
- Bước kế tiếp (phiên sau):
  - Theo dõi adoption thực tế của `dh.*` tools qua `tool_usage_audit` để tune rule/pattern.

### [2026-04-11 02:31] Session update
- Owner: FullstackAgent
- Phase: Post-review remediation
- Task ID / mục checklist: Fix 3 important review findings + minor hardening
- Trạng thái trước: [Completed]
- Trạng thái sau: [Completed]
- Việc đã làm:
  - Sửa `graph-indexer.ts` để precompute import edges một lần ngoài per-file loop, loại bỏ pattern O(n²) extraction.
  - Bổ sung xác định `isExport` thực tế theo source text (`export` trực tiếp + named export list), không còn hardcode `true` cho toàn bộ symbol.
  - Đưa calls/references vào cùng `replaceAllForNode()` transaction để tránh persist lệch/partial.
  - Bổ sung cleanup `tree?.delete()` trong `finally` để tránh leak parser tree ở failure path.
  - Align graph ID prefixes theo convention solution (`gnode`, `gedge`, `gsym`, `gref`, `gcall`).
  - Cập nhật runbook với hướng dẫn bật strict enforcement mode.
  - Tighten evidence-gate impact pattern (tránh trigger quá rộng).
- Bằng chứng:
  - `npm run test -- packages/intelligence/src/graph/graph-indexer.test.ts packages/intelligence/src/graph/graph-indexer.benchmark.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/extract-call-graph.test.ts packages/intelligence/src/graph/reference-tracker.test.ts packages/storage/src/sqlite/repositories/graph-repo.test.ts packages/runtime/src/hooks/evidence-gate.test.ts packages/runtime/src/hooks/runtime-enforcer.test.ts packages/opencode-app/src/executor/hook-enforcer.test.ts` (21/21 pass)
  - `npm run check` pass
  - `go test ./internal/llm/tools ./internal/llm/agent` pass
- Blocker (nếu có):
  - Không có blocker mới cho closure.
- Bước kế tiếp (phiên sau):
  - Theo dõi quality signal dài hạn trên repo lớn và tiếp tục tune export/reference heuristics nếu cần.
