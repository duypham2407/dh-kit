# DH System Overview

Last reviewed against code: 2026-06-21

## Mục tiêu

Tài liệu này mô tả kiến trúc thực tế của `dh`, một AI coding assistant local-first chạy trên
terminal cho macOS/Linux. Kiến trúc chia làm hai nửa rõ ràng:

- **Rust engine** (`dh-engine`): code intelligence + runtime host. Scan repo, parse bằng
  tree-sitter, lưu SQLite, trả lời truy vấn có bằng chứng trong phạm vi giới hạn, và **làm chủ
  process lifecycle** của toàn bộ cây tiến trình local.
- **TypeScript worker** (`worker.mjs`): workflow/agent/LLM logic, chạy như tiến trình con được
  Rust giám sát.

Tài liệu này là overview cấp hệ thống. Chi tiết schema index nằm ở
`docs/architecture/indexing-model.md`. Chi tiết retrieval nằm ở
`docs/architecture/retrieval-strategy.md`. Source tree thật nằm ở
`docs/architecture/source-tree-blueprint.md`. Định hướng sản phẩm hiện tại nằm ở
`docs/adr/2026-05-10-personal-coding-assistant-direction.md`.

> Lưu ý lịch sử: bản trước của tài liệu này mô tả `dh` như một fork OpenCode với Go core. Hướng
> đó đã bị bỏ — Go core bị gỡ hoàn toàn ở commit `ee2c1e2`. Các tài liệu Go-era được giữ ở
> `docs/archive/architecture/` chỉ để tham chiếu lịch sử.

## Ranh giới quyền lực (runtime authority)

Nguyên tắc nền: **Rust là host, TypeScript là worker.** Ranh giới này được mã hóa trong code,
không chỉ trong docs:

- `packages/shared/src/types/runtime-authority.ts` — type `RuntimeAuthorityOwner`
  (`"rust" | "typescript_worker" | "typescript_compatibility"`) và `finalStatus` được đóng dấu
  lên mọi kết quả.
- `rust-engine/crates/dh-engine/src/host_lifecycle.rs::lifecycle_contract()` — Rust khai báo nó
  sở hữu startup, readiness, health, timeout, recovery, shutdown, cleanup và exit classification.

Phân chia trách nhiệm:

| Quyền | Chủ sở hữu |
|---|---|
| Process lifecycle: spawn/supervise/timeout/recovery/exit-code | Rust `dh-engine` |
| Code intelligence: parse, index, store, query evidence | Rust crates |
| Workflow/agent orchestration, prompt, LLM call, session memory | TS worker |

## Kiến trúc phân lớp

```text
CLI (apps/cli, hoặc invoke trực tiếp dh-engine)
-> Rust host: dh-engine (supervisor + bridge RPC router + lifecycle authority)
   -> spawn + giám sát TS worker (node worker.mjs) qua JSON-RPC/stdio
   -> phục vụ reverse-RPC query.* từ worker vào QueryEngine trên SQLite
-> Rust code-intelligence crates: dh-indexer / dh-parser / dh-query / dh-graph / dh-storage
-> SQLite (dh-index.db): sqlite-vec + FTS5
```

TS worker không bao giờ tự spawn Rust; nó chỉ phục vụ command và gọi ngược vào host đang chạy
(`HostBridgeClient`).

## Rust crate map

7 crate, đồ thị phụ thuộc là DAG không có cycle (leaf → root):

| Crate | Vai trò |
|---|---|
| `dh-types` | leaf — vocab chung: File/Symbol/Span/Chunk/EdgeKind/EvidencePacket/AnswerState |
| `dh-storage` | SQLite (rusqlite bundled + sqlite-vec + FTS5), repository traits, schema |
| `dh-parser` | tree-sitter extraction: TS/TSX/JS/JSX đầy đủ; Python/Go/Rust adapter; module resolver |
| `dh-graph` | projection `graph_edges`, hydration theo freshness |
| `dh-query` | trait `QueryEngine`; `build_evidence` — entrypoint bounded explain-only |
| `dh-indexer` | pipeline: scan → hash (blake3) → dirty-set → parse/persist → link → hydrate → embed |
| `dh-engine` | binary: CLI + worker supervisor + bridge RPC router + lifecycle authority |

Phụ thuộc: `dh-engine` → tất cả; `dh-indexer` → parser/storage/graph/query/types;
`dh-query`/`dh-graph` → storage/types; mọi crate → `dh-types`.

## TypeScript package map

Đây là các package logic (xem `source-tree-blueprint.md` về việc chúng không phải npm workspace
unit thật). Tất cả dep nằm ở `package.json` gốc; import chéo dùng path tương đối + tsconfig alias.

| Package | Vai trò |
|---|---|
| `opencode-app` | package TS lớn nhất: worker entry, lane workflows, team/tools/agent/planner/executor |
| `providers` | wrapper quanh Vercel AI SDK + các `@ai-sdk/*` provider, model routing |
| `runtime` | session, workflow state, hooks, diagnostics, extensions |
| `retrieval` + `storage` | RAG TS (legacy cho luồng Rust-hosted — xem mục Canonical vs legacy) |
| `intelligence` | parse bằng web-tree-sitter WASM (song song với Rust `dh-parser`) |
| `opencode-sdk` | SDK/bridge nội bộ dh-original (KHÔNG vendored), cung cấp protocol + runtime values |
| `shared` | types/constants/contracts dùng chung, gồm `runtime-authority.ts` |
| `sdk` + `server` | fetch client + localhost HTTP server cho `dh serve` / TUI |

Apps: `apps/cli` (router lệnh mỏng), `apps/tui` (REPL readline trên `dh serve`).

> Tên `opencode-app` / `opencode-sdk` / `opencode.json` là di tích branding ban đầu — đây là code
> dh-original, không phải fork upstream (xem `packages/opencode-sdk/FORK_ORIGIN.md`).

## Luồng điều khiển — `dh ask` / `explain` / `trace`

```text
CLI -> main::run_knowledge_command
  -> resolve worker bundle (worker.mjs) + check platform (chỉ linux/macos)
  -> host_commands::run_hosted_knowledge_command: mở dh-index.db
  -> dựng WorkerSupervisor + BridgeRpcRouter (bound vào DB)
  -> supervisor spawn `node worker.mjs`
  -> handshake: dh.initialize / version-check / dh.initialized / dh.ready
  -> gửi session.runCommand
       worker dựng report bằng TS, nhưng gọi NGƯỢC JSON-RPC query.* (search/definition/
       buildEvidence/...) -> host_handler -> route_worker_query -> dh_query::QueryEngine trên SQLite
       event.tool.outputChunk stream ra stdout
  -> khi có kết quả: supervisor.shutdown()
  -> bọc trong RustHostedKnowledgeReport (Rust giữ lifecycle authority; body TS là "evidence only")
```

Giao thức: JSON-RPC trên stdio, `protocolVersion = 1`, Content-Length framing, codec msgpack/json.
Lifecycle: heartbeat ping (2 lần miss = fail), timeout → cancel → grace-drain, recovery
single-restart replay-safe; phân loại `CleanSuccess` vs `RecoveredDegradedSuccess`.

`dh trace` được host hóa trên lifecycle path nhưng kết quả command vẫn có thể là `unsupported`
trong bản hiện tại — đây là giới hạn cố ý.

## Luồng điều khiển — lane `quick` (và `delivery`/`migration`)

```text
apps/cli/runtime-client.ts -> runLane (mặc định Rust-hosted)
  -> run-rust-hosted-lane-command.ts: spawn `cargo run -p dh-engine -- <lane> --json`
  -> parse envelope Rust (workerResult + rustLifecycle), đóng dấu runtimeAuthority='rust'
       trong worker: session.runLane -> runLaneWorkflow -> runQuickWorkflow
         -> runQuickAgent (LLM coordinator) + gate eval + browser verify + quality-gate report
```

Lane thuần TS chỉ chạy khi `DH_ENABLE_TS_LANE_COMPAT=1`, tự đóng dấu `typescript_compatibility`.

## build_evidence — "packet truth"

`dh-query::build_evidence` là entrypoint bounded cho hiểu-rộng tĩnh:

- validate intent, phân loại các lớp **unsupported** (`runtime_trace`, `impact_analysis`,
  `call_hierarchy`, `multi_hop`, `unbounded_scope`).
- trả về `EvidencePacket` với `AnswerState` (`Grounded` / `Partial` / `Insufficient` /
  `Unsupported`) kèm bounds và gaps.

Đây là lý do `dh ask` từ chối các câu hỏi mở quá rộng thay vì bịa câu trả lời — một quyết định
thiết kế trung thực, không phải bug.

## Indexing model

`dh-indexer` chạy incremental:

1. scan workspace
2. hash bằng blake3 (content / structure / public-API) để tính dirty-set
3. parse + persist symbol/edge/chunk
4. link relationship
5. hydrate graph theo freshness
6. embed (nếu có `OPENAI_API_KEY`; thiếu key thì degrade về stub zero-vector, doctor báo rõ)

Freshness state machine: `refreshed` / `retained` / `degraded` / `not_current` / `deleted`.

## Nguyên tắc thiết kế

1. Rust làm chủ lifecycle; TS làm workflow. Ranh giới enforce trong code, không chỉ prompt.
2. Code intelligence là capability lõi (Rust), không phải phần phụ.
3. Evidence đi cùng câu trả lời; thà trả `unsupported` còn hơn bịa.
4. Index-time loop tách khỏi query-time loop để request path không phụ thuộc reindex nặng.
5. Phạm vi cố tình hẹp: hiểu repo tĩnh có giới hạn; không OpenCode parity, không web/desktop,
   không plugin cộng đồng (xem ADR 2026-05-10).

## Canonical vs legacy/compatibility

**Canonical (đường chính):**
- Rust `dh-engine` host; `runDirect`/`runLane` mặc định Rust-hosted (`runtimeAuthority='rust'`).
- `ask`/`explain`/`trace` qua worker (`typescript_worker`, evidence ủy quyền cho Rust).
- `dh-query::build_evidence`; `dh-storage` sqlite-vec; `dh-indexer` native tree-sitter.

**Legacy/compatibility-only:**
- lane thuần TS `runLaneWorkflow` (gated `DH_ENABLE_TS_LANE_COMPAT=1`).
- `dh serve` HTTP server + `apps/tui`.
- retrieval TS (`runRetrieval`/`buildEvidencePackets`) — packet TS non-canonical cho luồng
  Rust-hosted; vector store TS (JSON-TEXT + JS HNSW) bị Rust BLOB+sqlite-vec thay thế.

## Tài liệu liên quan

- `docs/architecture/source-tree-blueprint.md`: source tree thật
- `docs/architecture/indexing-model.md`: schema và mô hình index
- `docs/architecture/retrieval-strategy.md`: intent, tool selection, context building
- `docs/architecture/workflow-orchestration.md`: lane model, handoff, orchestration contract
- `docs/architecture/runtime-state-schema.md`: session/workflow/work-item/envelope/audit state
- `docs/adr/2026-05-10-personal-coding-assistant-direction.md`: định hướng sản phẩm hiện tại
- `docs/adr/2026-05-10-web-desktop-parity-decision.md`: quyết định không làm web/desktop lúc này
- `docs/archive/architecture/`: các tài liệu Go-era đã archive (chỉ tham chiếu lịch sử)

## Kết luận

Kiến trúc xoay quanh một mục tiêu cụ thể: cho AI context thật về codebase thay vì đoán từ text
match. Đạt được bằng cách để Rust sở hữu code intelligence + lifecycle (chắc chắn, test kỹ) và để
TS lo workflow/LLM (linh hoạt, nhiều provider). Ranh giới authority rõ ràng và enforce trong code
là điểm mạnh nền tảng của hệ thống.
