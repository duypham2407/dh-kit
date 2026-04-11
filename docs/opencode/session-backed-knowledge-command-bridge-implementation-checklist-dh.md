# Checklist triển khai session-backed knowledge command bridge (DH)

Ngày tạo: 2026-04-11  
Scope nguồn: `docs/scope/2026-04-11-session-backed-knowledge-command-bridge.md`  
Solution nguồn: `docs/solution/2026-04-11-session-backed-knowledge-command-bridge.md`  
Mục tiêu unblock: `P2B-05` (compaction hook cho `ask` / `explain` / `trace`)

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Triển khai **cầu nối session-backed ở mức hẹp và additive** cho luồng knowledge command.
- Unblock `P2B-05` bằng cách cho phép compaction hook chạy trước prompt lớn trong `ask` / `explain` / `trace`.
- Giữ nguyên lõi retrieval hiện tại (stateless execution core), chỉ bọc thêm session bridge preflight/postflight.

### Phạm vi (in-scope)
- Thiết kế và tích hợp bridge contract cho create/resume session trong knowledge command path.
- Kết nối persistence/runtime report tối thiểu phục vụ session linkage.
- Hook compaction vào knowledge command path sau khi session linkage hợp lệ.
- Đồng bộ CLI/presenter theo hướng additive, không phá output hiện có.
- Validation + docs closure để có thể resume và bàn giao rõ ràng.

### Ngoài phạm vi (out-of-scope)
- Redesign lane semantics hoặc tạo lane mới.
- Redesign retrieval/indexing/ranking/evidence selection.
- Mở rộng full parity với upstream session subsystem.
- Refactor diện rộng ngoài mục tiêu unblock `P2B-05`.

---

## 2) Current state vs Target state (DH reality)

| Hạng mục | Current state (DH hiện tại) | Target state (sau checklist) |
|---|---|---|
| `runKnowledgeCommand` | Stateless: nhận `kind`, `input`, `repoRoot`; chạy retrieval trực tiếp | Session-backed wrapper additive quanh retrieval core |
| Session linkage cho `ask/explain/trace` | Chưa có create/resume contract riêng cho knowledge path | Có create/resume/fail contract rõ, validate repo ownership/resumability |
| Compaction hook knowledge path | `P2B-05` đang blocked | Compaction preflight chạy được trước prompt lớn khi session linkage hợp lệ |
| Runtime persistence/report | Chưa có bridge metadata chuyên cho knowledge command path | Có persistence/report additive cho `sessionId`, `resumed`, `compacted` (tuỳ chọn) |
| CLI/presenter | Wrapper mỏng, chưa có session-aware options/reporting | Thêm input/output additive, giữ tương thích text/JSON hiện có |
| Lane semantics | Đã có semantics hiện tại, không cần đổi | Giữ nguyên, không redesign |

---

## 3) Definition of Done

- [x] [Completed] DoD-01: Có bridge contract rõ cho create/resume/invalid-session trong knowledge command path.
- [x] [Completed] DoD-02: `run-knowledge-command` chạy theo mô hình session-backed wrapper + stateless retrieval core giữ nguyên.
- [x] [Completed] DoD-03: Compaction hook cho `ask` / `explain` / `trace` chạy được trước prompt lớn khi session linkage hợp lệ.
- [x] [Completed] DoD-04: CLI/presenter vẫn tương thích output cũ; mọi trường mới là additive và optional.
- [x] [Completed] DoD-05: Có bằng chứng validation thực thi cho create/resume/fail/compaction/no-regression.
- [x] [Completed] DoD-06: Tài liệu checklist + progress log + resume quick-start được cập nhật đầy đủ.
- [x] [Completed] DoD-07: Không có thay đổi lane-semantics redesign và không có retrieval redesign.

---

## 4) Status legend và protocol cập nhật

### Legend bắt buộc
- [ ] [Not started] Chưa bắt đầu.
- [ ] [In progress] Đang làm.
- [x] [Completed] Hoàn tất và có evidence.
- [ ] [Blocked] Bị chặn (phải ghi rõ blocker + owner + next action).

### Protocol cập nhật
1. Mỗi item checklist chỉ có **một trạng thái hiệu lực** tại một thời điểm.
2. Khi chuyển sang `[Completed]`, bắt buộc thêm evidence vào `Progress log`.
3. Khi chuyển sang `[Blocked]`, bắt buộc ghi: blocker, owner, next action, điều kiện gỡ chặn.
4. Không đánh dấu `[Completed]` nếu mới tạo file/skeleton mà chưa có tích hợp thực.
5. Cuối mỗi phiên phải cập nhật `Resume quick-start`.

---

## 5) Phases / workstreams triển khai

## Phase 0 — Baseline inventory knowledge command path

- [x] [Completed] **KB-P0-01** Tạo checklist triển khai này dưới `docs/opencode/` với status protocol đầy đủ.
- [x] [Completed] **KB-P0-02** Chốt inventory đường đi hiện tại của `run-knowledge-command.ts` (input -> retrieval -> report).
- [x] [Completed] **KB-P0-03** Liệt kê entry points CLI đang gọi `runtime.runKnowledge()` (`ask.ts`, `explain.ts`, `trace.ts`).
- [x] [Completed] **KB-P0-04** Lập danh sách report fields hiện tại phải giữ tương thích.
- [x] [Completed] **KB-P0-05** Chốt baseline statement chính thức trong log: “`runKnowledgeCommand` hiện stateless”.

## Phase 1 — Bridge contract / session linkage design

- [x] [Completed] **KB-P1-01** Thiết kế contract input additive cho knowledge session linkage (vd: optional session id/resume token).
- [x] [Completed] **KB-P1-02** Thiết kế contract output additive (vd: `sessionId`, `resumed`, `compacted`).
- [x] [Completed] **KB-P1-03** Định nghĩa rõ failure semantics: missing/invalid/foreign-repo/non-resumable session.
- [x] [Completed] **KB-P1-04** Chốt nguyên tắc “bridge command-scoped, không kéo lane-session semantics vào knowledge path”.
- [x] [Completed] **KB-P1-05** Chốt contract review note để tránh scope creep sang full session parity.

## Phase 2 — Runtime persistence và report changes (additive, narrow)

- [x] [Completed] **KB-P2-01** Tạo/hoàn thiện bridge service module cho create/resume/load-summary/record-events.
- [x] [Completed] **KB-P2-02** Quyết định persistence shape tối thiểu cho knowledge-session linkage (reuse hoặc repo riêng).
- [x] [Completed] **KB-P2-03** Áp dụng schema/repo thay đổi theo hướng additive, không phá dữ liệu hiện có.
- [x] [Completed] **KB-P2-04** Cập nhật `run-knowledge-command.ts` thành wrapper session-backed quanh retrieval core.
- [x] [Completed] **KB-P2-05** Đảm bảo report hiện có không đổi semantics; trường mới phải optional/additive.

## Phase 3 — Compaction hook integration cho ask/explain/trace

- [x] [Completed] **KB-P3-01** Xác định preflight point trước prompt assembly trong knowledge command path.
- [x] [Completed] **KB-P3-02** Gắn compaction call chỉ khi session linkage hợp lệ và điều kiện overflow đạt ngưỡng.
- [x] [Completed] **KB-P3-03** Persist kết quả compaction/continuation summary vào runtime events/summary surfaces phù hợp.
- [x] [Completed] **KB-P3-04** Xác nhận `P2B-05` chỉ được mở block khi hook chạy được trên cả `ask`/`explain`/`trace`.
- [x] [Completed] **KB-P3-05** Kiểm tra không có drift sang retrieval redesign hoặc lane redesign.

## Phase 4 — CLI/presenter alignment

- [x] [Completed] **KB-P4-01** Cập nhật `apps/cli/src/runtime-client.ts` để thread input/output session metadata additive.
- [x] [Completed] **KB-P4-02** Cập nhật `apps/cli/src/commands/ask.ts` với resume/session option tối thiểu (nếu cần).
- [x] [Completed] **KB-P4-03** Cập nhật `apps/cli/src/commands/explain.ts` tương tự.
- [x] [Completed] **KB-P4-04** Cập nhật `apps/cli/src/commands/trace.ts` tương tự.
- [x] [Completed] **KB-P4-05** Cập nhật presenter knowledge command để hiển thị metadata additive, không phá text/JSON cũ.

## Phase 5 — Validation / docs closure

- [x] [Completed] **KB-P5-01** Chạy validation path khả dụng (`npm run check`, `npm run test` và targeted tests liên quan bridge).
- [x] [Completed] **KB-P5-02** Ghi evidence cho các case bắt buộc: new session, resume session, invalid session, compaction trigger.
- [x] [Completed] **KB-P5-03** Ghi evidence no-regression cho report fields hiện có.
- [x] [Completed] **KB-P5-04** Cập nhật checklist trạng thái cuối và đánh giá đạt/không đạt DoD.
- [x] [Completed] **KB-P5-05** Cập nhật tài liệu liên quan nếu contract thực thi khác với giả định ban đầu (không đổi lane semantics).

---

## 6) Checklist chi tiết theo bề mặt thay đổi

### 6.1 Workflow/runtime surfaces
- [x] [Completed] **KB-WS-01** `packages/opencode-app/src/workflows/run-knowledge-command.ts` đổi sang session-backed wrapper, retrieval core giữ nguyên.
- [x] [Completed] **KB-WS-02** `packages/runtime/src/session/knowledge-command-session-bridge.ts` có create/resume/load/persist API rõ.
- [x] [Completed] **KB-WS-03** Nếu cần, mở rộng tối thiểu `packages/runtime/src/session/session-summary.ts` theo hướng tương thích.
- [x] [Completed] **KB-WS-04** Nếu cần, mở rộng tối thiểu `packages/runtime/src/session/session-compaction.ts` chỉ cho input shape bridge.

### 6.2 Storage/shared surfaces
- [x] [Completed] **KB-SS-01** Xác định reuse hay tạo mới repo cho knowledge-session linkage.
- [x] [Completed] **KB-SS-02** Nếu có schema change, chỉ additive (table/index/cột mới) và có migration note.
- [x] [Completed] **KB-SS-03** Shared types (nếu đụng) chỉ thêm optional fields, không breaking contract.

### 6.3 CLI/presenter surfaces
- [x] [Completed] **KB-CP-01** Runtime client hỗ trợ session metadata qua request/response.
- [x] [Completed] **KB-CP-02** `ask/explain/trace` giữ UX cũ cho default path, session features là optional.
- [x] [Completed] **KB-CP-03** Presenter text/JSON output vẫn parse ổn với consumer cũ.

### 6.4 Test/verification surfaces
- [x] [Completed] **KB-TV-01** Bridge tests cho create/resume/invalid-session/foreign-repo.
- [x] [Completed] **KB-TV-02** Workflow test cho compaction preflight trong knowledge path.
- [x] [Completed] **KB-TV-03** Presenter tests cho output additive.
- [x] [Completed] **KB-TV-04** Regression tests cho report fields hiện có.

---

## 7) Dependencies / sequencing notes

### Trình tự bắt buộc
1. Phase 0 (baseline inventory) trước.
2. Phase 1 (contract) phải chốt trước integration sâu.
3. Phase 2 (runtime/persistence/report) trước compaction hook.
4. Phase 3 (compaction integration) là bước unblock `P2B-05`.
5. Phase 4 (CLI/presenter) đi sau contract ổn định.
6. Phase 5 (validation/docs closure) là gate đóng việc.

### Phụ thuộc chính
- `KB-P3-*` phụ thuộc `KB-P1-*` + `KB-P2-*`.
- `KB-P4-*` phụ thuộc contract đã chốt để tránh đổi CLI nhiều lần.
- `KB-P5-*` phụ thuộc test/evidence thực tế; không chấp nhận “ước lượng pass”.

### Điều kiện mở chặn `P2B-05`
- Có session linkage chạy thật cho knowledge command path.
- Compaction hook chạy trước prompt lớn ở `ask` / `explain` / `trace`.
- Có evidence test/log tương ứng cho cả success path và failure path.

---

## 8) Risks / watchouts

- [ ] [Not started] **KB-R01 Scope creep sang full session parity**  
  Giảm thiểu: bám scope/solution hiện tại, chỉ làm bridge command-scoped.

- [ ] [Not started] **KB-R02 Vô tình redesign retrieval core**  
  Giảm thiểu: giữ `runRetrieval()` là stateless execution core, chỉ bọc wrapper.

- [ ] [Not started] **KB-R03 Drift lane semantics**  
  Giảm thiểu: cấm tạo lane mới/cấm đổi semantics hiện có trong checklist này.

- [ ] [Not started] **KB-R04 Breaking report/CLI compatibility**  
  Giảm thiểu: mọi trường mới phải additive + optional; giữ output cũ mặc định.

- [ ] [Not started] **KB-R05 Ambiguous resume/failure behavior**  
  Giảm thiểu: chốt semantics lỗi rõ trong Phase 1 và test đầy đủ ở Phase 5.

- [ ] [Not started] **KB-R06 Persistence boundary drift giữa runtime/storage/shared**  
  Giảm thiểu: owner mapping rõ, chỉ thêm dependency khi thật cần.

---

## 9) Progress log template

> Mỗi phiên thêm 1 entry mới, không ghi đè entry cũ.

```md
### [YYYY-MM-DD HH:mm] Session #<n> - <owner>
- Mục tiêu phiên:
  - ...
- Checklist items cập nhật trạng thái:
  - <ID> từ [Not started] -> [In progress]
  - <ID> từ [In progress] -> [Completed]
  - <ID> -> [Blocked] (blocker/owner/next action)
- Files thay đổi:
  - ...
- Evidence/validation:
  - Command/manual check:
  - Kết quả:
- Rủi ro phát sinh / quyết định:
  - ...
- Next actions:
  - ...
```

## Progress log

### [2026-04-11 00:00] Session #0 - Bootstrap checklist
- Mục tiêu phiên:
  - Tạo checklist thực thi trạng thái hóa cho session-backed knowledge command bridge.
- Checklist items cập nhật trạng thái:
  - `KB-P0-01` từ [Not started] -> [Completed].
- Files thay đổi:
  - `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
- Evidence/validation:
  - Manual evidence: checklist được tạo theo approved scope/solution, chưa thực thi code.
- Rủi ro phát sinh / quyết định:
  - Quyết định giữ phạm vi hẹp, additive, không đổi lane semantics.
- Next actions:
  - Bắt đầu `KB-P0-02` và `KB-P0-03` để chốt baseline inventory.

### [2026-04-11 12:46] Session #1 - Fullstack Agent
- Mục tiêu phiên:
  - Triển khai đầy đủ bridge session-backed hẹp cho `ask` / `explain` / `trace` theo scope/solution đã duyệt.
- Checklist items cập nhật trạng thái:
  - Hoàn tất `KB-P0-02` -> `KB-P0-05`, `KB-P1-*`, `KB-P2-*`, `KB-P4-*`, `KB-P5-*`, `KB-WS-*`, `KB-SS-*`, `KB-CP-*`, `KB-TV-*`.
  - `KB-P3-03` -> `[Blocked]`.
- Files thay đổi:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.test.ts`
  - `apps/cli/src/runtime-client.ts`
  - `apps/cli/src/commands/ask.ts`
  - `apps/cli/src/commands/explain.ts`
  - `apps/cli/src/commands/trace.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
- Evidence/validation:
  - Command/manual check:
    - `npm run check`
    - `npm run test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
    - `npm run test -- packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
    - `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.test.ts`
    - `npm run test -- apps/cli/src/presenters/knowledge-command.test.ts`
    - `npm run test`
  - Kết quả:
    - Tất cả pass; full suite: 53 files passed, 226 tests passed, 4 skipped.
- Rủi ro phát sinh / quyết định:
  - Quyết định giữ `runRetrieval()` là stateless core, bridge chỉ preflight/postflight.
  - Không mở rộng lane semantics hoặc retrieval architecture.
  - `KB-P3-03` bị block do runtime events/summary tables hiện có FK sang bảng `sessions` lane-runtime; knowledge bridge dùng bảng linkage riêng để giữ scope hẹp, nên chưa persist vào surfaces này mà không kéo theo scope mở rộng.
  - Blocker: foreign-key boundary giữa knowledge-session linkage và lane-session runtime surfaces.
  - Owner: runtime/storage maintainers.
  - Next action: thiết kế bước follow-up additive để ánh xạ knowledge-session vào runtime events/summary mà không nhập lane semantics.
  - Điều kiện gỡ chặn: có contract đã duyệt cho cách persist cross-surface (hoặc nới FK) mà vẫn giữ narrow scope.
- Next actions:
  - Chuyển sang review/QA với trạng thái `P2B-05` unblocked một phần (bridge + compaction preflight có), và nêu rõ blocker `KB-P3-03`.

### [2026-04-11 13:09] Session #2 - Fullstack Agent (review findings fix)
- Mục tiêu phiên:
  - Sửa 3 finding quan trọng từ review và xử lý cleanup thấp-rủi-ro nếu phù hợp.
- Checklist items cập nhật trạng thái:
  - Giữ nguyên trạng thái phase/doD; cập nhật implementation quality theo review findings trong phạm vi scope/solution.
- Files thay đổi:
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/commands/ask.ts`
  - `apps/cli/src/commands/explain.ts`
  - `apps/cli/src/commands/trace.ts`
  - `apps/cli/src/commands/knowledge-command-args.ts`
  - `apps/cli/src/commands/knowledge-command-args.test.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
- Evidence/validation:
  - Command/manual check:
    - `npm run check`
    - `npm run test -- packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
    - `npm run test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
    - `npm run test -- apps/cli/src/commands/knowledge-command-args.test.ts`
    - `npm run test -- apps/cli/src/presenters/knowledge-command.test.ts`
    - `npm run test`
  - Kết quả:
    - Tất cả pass; full suite: 54 files passed, 232 tests passed, 4 skipped.
- Rủi ro phát sinh / quyết định:
  - Bounded/truncated persisted `lastInput` để tránh prompt lớn ảnh hưởng heuristic vòng sau.
  - Đổi tên cờ `continuationSummaryCreated` thành `continuationSummaryGeneratedInMemory` để phản ánh đúng semantics hiện tại (không imply persisted).
  - Parsing `--resume-session` được gom helper và fail fast khi thiếu/invalid value.
  - Không mở rộng sang `KB-P3-03` blocked persistence work.
- Next actions:
  - Handoff lại cho review/QA với findings đã xử lý.

### [2026-04-11 13:42] Session #3 - Fullstack Agent (KB-P3-03 follow-on closure)
- Mục tiêu phiên:
  - Hoàn tất follow-on `KB-P3-03` bằng contract persistence cross-surface hẹp/additive cho knowledge-command sessions.
- Checklist items cập nhật trạng thái:
  - `KB-P3-03` từ [Blocked] -> [Completed].
- Files thay đổi:
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.test.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.test.ts`
  - `packages/runtime/src/session/knowledge-command-runtime-persistence.ts`
  - `packages/runtime/src/session/knowledge-command-runtime-persistence.test.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `docs/opencode/cross-surface-knowledge-session-persistence-implementation-checklist-dh.md`
  - `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
- Evidence/validation:
  - Command/manual check:
    - `npm run check`
    - `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.test.ts`
    - `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.test.ts`
    - `npm run test -- packages/runtime/src/session/knowledge-command-runtime-persistence.test.ts`
    - `npm run test -- packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
    - `npm run test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
    - `npm run test -- apps/cli/src/presenters/knowledge-command.test.ts`
    - `npm run test`
  - Kết quả:
    - Tất cả pass; full suite: 57 files passed, 240 tests passed, 4 skipped.
- Rủi ro phát sinh / quyết định:
  - Chọn đúng hướng solution: thêm knowledge-owned shadow surfaces, không đổi lane-session tables/semantics.
  - Enforce event+summary persistence là một outcome duy nhất (transaction + rollback khi fail).
  - Bridge/report tách rõ generated-in-memory vs persisted cross-surface để tránh over-claim.
- Next actions:
  - Chuyển review/QA follow-on theo quy trình.

---

## 10) Resume quick-start

Khi quay lại làm việc, chạy nhanh theo thứ tự sau:

1. Đọc `Progress log` entry mới nhất để biết item đang dở.
2. Xác nhận lại blocker hiện tại của `P2B-05` (nếu còn) và điều kiện mở chặn.
3. Chuyển **duy nhất 1 item** sang `[In progress]` trước khi chỉnh code.
4. Hoàn tất item -> thêm evidence -> cập nhật trạng thái `[Completed]`.
5. Nếu bị chặn -> chuyển `[Blocked]`, ghi rõ owner + next action + điều kiện gỡ chặn.
6. Kết phiên: cập nhật `Progress log` + rà lại DoD.

Checklist ưu tiên resume hiện tại:
- [ ] [In progress] **Next-01** Code review + QA verification cho closure của `KB-P3-03`.
- [ ] [Not started] **Next-02** Xử lý findings (nếu có) từ Code Reviewer/QA.
- [ ] [Not started] **Next-03** Chốt gate kết thúc theo workflow sau khi QA xác nhận.
