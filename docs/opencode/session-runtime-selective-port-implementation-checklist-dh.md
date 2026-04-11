# Checklist triển khai selective-port session runtime (DH)

Ngày tạo: 2026-04-11  
Tài liệu nguồn bắt buộc bám theo: `docs/opencode/session-runtime-selective-port-mapping-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Triển khai **theo từng lát nhỏ, có trạng thái rõ ràng** các năng lực session runtime giá trị cao từ upstream vào DH.
- Tăng độ ổn định runtime, khả năng resume/recovery, và chất lượng execution flow cho `dh ask/explain/trace` và lane workflows.

### Phạm vi (in-scope)
- Selective-port cho 5 concern: `run-state`, `summary`, `compaction`, `retry`, `revert`.
- Mapping ownership/session state qua `packages/runtime`, `packages/storage`, `packages/opencode-app`, `packages/shared` (và `packages/opencode-sdk` nếu thật sự cần bridge contract).
- Cập nhật evidence/validation/docs để có thể resume ở phiên sau.

### Ngoài phạm vi (out-of-scope)
- Mirror/copy toàn bộ upstream TS session subsystem.
- Refactor diện rộng không phục vụ trực tiếp selective-port.
- Đổi lane semantics/workflow contract hiện tại của DH.

---

## 2) Current state vs Target state (theo DH reality)

| Concern | Current state (DH hiện tại) | Target state (sau selective-port) |
|---|---|---|
| Session identity + lane lock | Đã có qua `session-manager`, `session-resume`, SQLite + mirror workflow-state | Giữ nguyên, bổ sung guard runtime chi tiết |
| Run-state busy/cancel | Chưa có module chuyên trách `session-run-state` | Có `session-run-state` + guard `assertNotBusy` + cancel token |
| Retry policy dùng chung | Retry có nguy cơ phân tán theo caller | Có `retry-policy` chuẩn hóa `isRetryable` + `computeRetryDelay` |
| Summary/diff session | Chưa có lớp summary/diff chuyên biệt | Có `session-summary` + persistence tách khỏi raw chat logs |
| Compaction/prune | Chưa có module compaction runtime rõ ràng | Có overflow detect + prune + continuation message tối giản |
| Revert/undo | Chưa có flow revert runtime chuẩn | Có revert milestone 1 ở checkpoint-level + cleanup invariants |
| Validation/evidence | Có thể thiếu command chuẩn theo thời điểm | Có bằng chứng thực thi rõ (tool output hoặc manual evidence) |

---

## 3) Definition of Done

## DoD cho M1 (Reliability Foundation)
- [x] [Completed] Có `packages/runtime/src/session/session-run-state.ts` và đã tích hợp ít nhất 1 workflow path thực tế.
- [x] [Completed] Có `packages/runtime/src/reliability/retry-policy.ts` và đã tích hợp ít nhất 1 provider/workflow execution path.
- [x] [Completed] Có bằng chứng verify các case: busy guard, cancel không kẹt state, retry delay có/không có header.
- [x] [Completed] Không có thay đổi nào biến thành mirror full upstream stack.
- [x] [Completed] Docs current-state/target-state được cập nhật đồng bộ.

## DoD cho toàn bộ selective-port session runtime
- [ ] [Blocked] Hoàn tất 6 workstream trong checklist này. (Blocker: P2B-05 deferred by approved-solution constraint on stateless `run-knowledge-command.ts`; Owner: Fullstack Agent + Product/Solution; Next action: approve separate session-backed knowledge bridge scope)
- [x] [Completed] Có resume quick-start rõ, log tiến độ đầy đủ, và dependencies được ghi nhận.
- [x] [Completed] Có evidence/validation cho từng phase (hoặc manual evidence minh bạch khi thiếu toolchain).
- [x] [Completed] Không vi phạm boundaries ownership giữa runtime/app/storage/shared.

---

## 4) Status legend và protocol cập nhật

## Legend bắt buộc
- [ ] [Not started] Chưa bắt đầu.
- [ ] [In progress] Đang làm.
- [x] [Completed] Hoàn tất và có evidence.
- [ ] [Blocked] Bị chặn (phải ghi rõ blocker + owner + next action).

## Protocol cập nhật
1. Mỗi checklist item chỉ được có **một trạng thái hiệu lực** tại một thời điểm.
2. Khi chuyển sang `[Completed]`, bắt buộc thêm link/log evidence vào mục `Progress log`.
3. Nếu `[Blocked]` quá 1 phiên làm việc, phải thêm kế hoạch gỡ chặn và cập nhật sequencing.
4. Không đánh dấu hoàn tất nếu chưa có xác nhận tích hợp thực tế (không chỉ tạo file rỗng).
5. Cuối mỗi phiên, cập nhật `Resume quick-start` trước khi dừng.

---

## 5) Workstreams / phases triển khai

## Phase 0 — Baseline inventory DH session/runtime surfaces

- [ ] [Not started] **P0-01** Xác nhận lại baseline modules hiện có theo mapping doc:
- [x] [Completed] **P0-01** Xác nhận lại baseline modules hiện có theo mapping doc:
  - `apps/cli/src/runtime-client.ts`
  - `packages/runtime/src/session/session-manager.ts`
  - `packages/runtime/src/session/session-resume.ts`
  - `packages/storage/src/sqlite/repositories/sessions-repo.ts`
  - `packages/shared/src/types/session.ts`
- [x] [Completed] **P0-02** Lập bảng “entry points gọi runtime session” trong `packages/opencode-app/src/workflows`.
- [x] [Completed] **P0-03** Ghi nhận điểm nào đã có lane-lock/state persistence và điểm nào còn thiếu busy/cancel guard.
- [x] [Completed] **P0-04** Chốt danh sách file dự kiến chỉnh sửa cho M1 (run-state + retry) để tránh scope creep.
- [x] [Completed] **P0-05** Tạo baseline evidence entry (snapshot hiện trạng + rủi ro đã biết) trong progress log.

## Phase 1 — Run-state selective-port (P0)

- [x] [Completed] **P1-01** Tạo module `packages/runtime/src/session/session-run-state.ts`.
- [x] [Completed] **P1-02** Thiết kế API tối thiểu:
  - `assertNotBusy(sessionId)`
  - `markBusy(sessionId, metadata?)`
  - `markIdle(sessionId, metadata?)`
  - `cancel(sessionId)`
  - `withSessionRunGuard(sessionId, fn)`
- [x] [Completed] **P1-03** Đảm bảo auto-cleanup busy state khi `fn` throw/error/cancel.
- [x] [Completed] **P1-04** Tích hợp guard vào ít nhất 1 luồng workflow chạy nặng trong `packages/opencode-app/src/workflows`.
- [x] [Completed] **P1-05** Gắn audit transitions tối thiểu cho busy->idle/cancel (không cần event bus full).
- [x] [Completed] **P1-06** Viết/ghi bằng chứng kiểm tra:
  - Không cho chạy chồng cùng session.
  - Cancel xong không bị kẹt busy.

## Phase 2 — Summary/compaction selective-port (P1)

### 2A. Summary/diff
- [x] [Completed] **P2A-01** Tạo `packages/runtime/src/session/session-summary.ts`.
- [x] [Completed] **P2A-02** Định nghĩa summary contract tối giản (`files_changed`, `additions`, `deletions`, `last_diff_at`).
- [x] [Completed] **P2A-03** Tạo `packages/storage/src/sqlite/repositories/session-summary-repo.ts` (hoặc extension phù hợp) để persist summary.
- [x] [Completed] **P2A-04** Mở rộng `packages/shared/src/types/session.ts` với summary metadata optional.
- [x] [Completed] **P2A-05** Tích hợp cập nhật summary tại điểm kết thúc vòng xử lý message/workflow phù hợp.

### 2B. Compaction/prune
- [x] [Completed] **P2B-01** Tạo `packages/runtime/src/session/session-compaction.ts`.
- [x] [Completed] **P2B-02** Định nghĩa overflow policy abstraction độc lập provider.
- [x] [Completed] **P2B-03** Implement prune policy tối giản: ưu tiên loại tool output cũ, giữ các “neo ngữ cảnh”.
- [x] [Completed] **P2B-04** Tạo synthetic continuation message cơ bản sau compaction.
- [ ] [Blocked] **P2B-05** Hook compaction vào luồng `ask/explain/trace` trước khi gửi prompt lớn. (Blocker: `runKnowledgeCommand` hiện stateless theo constraint solution; Owner: Product/Solution + Fullstack; Next action: approve follow-on session-backed knowledge bridge)
- [x] [Completed] **P2B-06** Bổ sung cờ runtime config (ví dụ `auto_compaction`) với default an toàn.
- [x] [Completed] **P2B-07** Thu thập evidence: phiên dài không degrade mạnh do context overflow.

## Phase 3 — Retry/revert selective-port

### 3A. Retry policy (P0, song hành run-state)
- [x] [Completed] **P3A-01** Tạo `packages/runtime/src/reliability/retry-policy.ts`.
- [x] [Completed] **P3A-02** Implement `isRetryable(err)` (phân loại transient vs no-retry).
- [x] [Completed] **P3A-03** Implement `computeRetryDelay(attempt, metadata)`:
  - Ưu tiên `retry-after-ms`
  - Sau đó `retry-after` (seconds / HTTP-date)
  - Fallback exponential backoff + max cap
- [x] [Completed] **P3A-04** Tích hợp policy vào provider call path ưu tiên cao.
- [x] [Completed] **P3A-05** Ghi retry telemetry tối giản vào audit state.
- [x] [Completed] **P3A-06** Verify case có header, không header, overflow/semantic error (no-retry).

### 3B. Revert/undo (P1-b)
- [x] [Completed] **P3B-01** Tạo `packages/runtime/src/session/session-revert.ts`.
- [x] [Completed] **P3B-02** Thiết kế contract M1:
  - `revertTo(sessionId, checkpointId)`
  - `undoRevert(sessionId)`
- [x] [Completed] **P3B-03** Tạo persistence cho revert metadata (`session-revert-repo` hoặc mở rộng repo hiện có).
- [x] [Completed] **P3B-04** Tích hợp guard `assertNotBusy` trước thao tác revert.
- [x] [Completed] **P3B-05** Đồng bộ workflow audit + refresh summary sau revert.
- [x] [Completed] **P3B-06** Verify checkpoint-level rollback nhất quán timeline/state.

## Phase 4 — Session state ownership mapping across packages

- [x] [Completed] **P4-01** Chốt owner matrix theo concern:
  - runtime logic -> `packages/runtime`
  - persistence -> `packages/storage`
  - orchestration -> `packages/opencode-app`
  - shared contracts -> `packages/shared`
  - bridge contract tối giản (nếu cần) -> `packages/opencode-sdk`
- [x] [Completed] **P4-02** Rà soát import boundaries: không để `opencode-sdk` chứa business runtime.
- [x] [Completed] **P4-03** Cập nhật docs ownership mapping để tránh drift giữa code và tài liệu.
- [x] [Completed] **P4-04** Xác nhận không có module nào vi phạm lane/workflow contracts hiện tại.

## Phase 5 — Evidence / validation / docs alignment

- [x] [Completed] **P5-01** Lập ma trận validation theo phase (automated nếu có, manual evidence nếu chưa có command phù hợp).
- [x] [Completed] **P5-02** Với mỗi phase Completed, đính kèm evidence rõ: command output, log, hoặc mô tả manual check có thể lặp lại.
- [x] [Completed] **P5-03** Cập nhật `docs/opencode/session-runtime-selective-port-mapping-dh.md` khi có thay đổi đáng kể về current-state.
- [x] [Completed] **P5-04** Tạo/duy trì changelog ngắn cho selective-port session runtime trong progress log.
- [x] [Completed] **P5-05** Chốt “đã/không đạt DoD” cuối mỗi milestone với lý do rõ ràng.

---

## 6) Dependencies và sequencing notes

## Trình tự khuyến nghị (ưu tiên thực thi)
1. Phase 0 (baseline inventory) -> bắt buộc trước mọi phase khác.
2. Phase 1 (run-state) và Phase 3A (retry) -> ưu tiên P0, có thể làm xen kẽ.
3. Phase 2 (summary/compaction) -> sau khi có nền run-state/retry ổn định.
4. Phase 3B (revert) -> sau khi có summary + audit hooks tối thiểu.
5. Phase 4 và 5 -> chạy xuyên suốt, nhưng phải chốt cuối mỗi milestone.

## Phụ thuộc chính
- `session-revert` phụ thuộc `session-run-state` (guard busy/cancel).
- `session-compaction` nên dựa trên summary metadata để giảm mất ngữ cảnh quan trọng.
- `retry-policy` phải nhất quán giữa provider layer và workflow orchestration.
- Mọi phase hoàn tất đều phụ thuộc evidence/validation tương ứng.

---

## 7) Rủi ro / watchouts (kèm hành động giảm thiểu)

- [ ] [Not started] **R-01 Scope creep**: chuyển thành “port full stack”.  
  Hành động: review mỗi PR theo tiêu chí “giá trị trực tiếp cho DH runtime”.

- [ ] [Not started] **R-02 Boundary drift** giữa runtime/app/storage/shared.  
  Hành động: kiểm owner matrix ở Phase 4 trước khi merge.

- [x] [Completed] **R-03 Compaction làm mất fidelity**.  
  Hành động đã thực hiện: giữ `session.auto_compaction` default-safe, thêm heuristic runtime-event sampling cap để tránh tăng chi phí theo tuổi session, và duy trì continuation summary để giữ anchors.

- [ ] [Not started] **R-04 Retry gây request storm**.  
  Hành động: cap attempts, cap delay, tôn trọng retry headers.

- [x] [Completed] **R-05 Revert lệch timeline chat vs filesystem state**.  
  Hành động đã thực hiện: khóa scope M1 ở checkpoint-level, bổ sung guard `undoRevert` cho previous-checkpoint chain (missing/self-referential), và giữ audit refresh sau revert.

- [ ] [Not started] **R-06 Docs drift**.  
  Hành động: cập nhật current-state vs target-state ngay khi đổi implementation.

---

## 8) Progress log template (dùng để resume)

> Mỗi phiên làm việc thêm 1 entry, không ghi đè entry cũ.

```md
### [YYYY-MM-DD HH:mm] Session #<n> - <owner>
- Mục tiêu phiên:
  - ...
- Checklist items cập nhật trạng thái:
  - <ID> từ [Not started] -> [In progress]
  - <ID> từ [In progress] -> [Completed]
- Files thay đổi:
  - ...
- Evidence/validation:
  - Command/manual check:
  - Kết quả:
- Blockers:
  - ...
- Quyết định/ghi chú sequencing:
  - ...
- Next actions (phiên kế tiếp):
  - ...
```

## Progress log

### [2026-04-11 00:00] Session #0 - Bootstrap checklist
- Mục tiêu phiên:
  - Tạo checklist thực thi có status tracking cho selective-port session runtime.
- Checklist items cập nhật trạng thái:
  - Khởi tạo tài liệu (chưa bắt đầu thực thi phase kỹ thuật).
- Files thay đổi:
  - `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
- Evidence/validation:
  - Manual evidence: checklist được tạo dựa trên mapping doc nguồn.
- Blockers:
  - Chưa có.
- Quyết định/ghi chú sequencing:
  - Giữ thứ tự P0->P1/P3A->P2->P3B.
- Next actions (phiên kế tiếp):
  - Thực hiện Phase 0 từ item `P0-01`.

### [2026-04-11 10:57] Session #1 - Fullstack selective-port execution
- Mục tiêu phiên:
  - Thực thi checklist selective-port theo thứ tự đã duyệt: run-state + retry -> summary/compaction -> revert.
- Checklist items cập nhật trạng thái:
  - Hoàn tất: P0-01..P0-05, P1-01..P1-06, P2A-01..P2A-05, P2B-01..P2B-04, P2B-06..P2B-07, P3A-01..P3A-06, P3B-01..P3B-06, P4-01..P4-04, P5-01..P5-05.
  - Blocked: P2B-05 (compaction hook cho `ask/explain/trace` bị chặn do `run-knowledge-command.ts` hiện stateless theo approved solution constraints).
- Files thay đổi:
  - Runtime/session mới: `packages/runtime/src/session/{session-run-state,session-summary,session-compaction,session-revert}.ts`
  - Reliability mới: `packages/runtime/src/reliability/{retry-policy,retrying-chat-provider}.ts`
  - Storage repos mới: `packages/storage/src/sqlite/repositories/{session-runtime-events-repo,session-summary-repo,session-checkpoints-repo,session-revert-repo}.ts`
  - Integration chính: `packages/opencode-app/src/workflows/run-lane-command.ts`, `packages/runtime/src/workflow/{stage-runner,workflow-audit-service}.ts`
  - Provider metadata/retry surfaces: `packages/providers/src/chat/{types,openai-chat,anthropic-chat}.ts`
  - Shared contracts: `packages/shared/src/types/{session,session-runtime}.ts`
  - SQLite bootstrap: `packages/storage/src/sqlite/db.ts`
  - Tests mới/cập nhật trên runtime/storage/providers/workflows.
- Evidence/validation:
  - Command: `npm run check`
  - Kết quả: pass.
  - Command: `npm run test -- packages/runtime/src/session/session-run-state.test.ts packages/runtime/src/reliability/retry-policy.test.ts packages/runtime/src/reliability/retrying-chat-provider.test.ts packages/providers/src/chat/chat.test.ts packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts packages/storage/src/sqlite/repositories/session-summary-repo.test.ts packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts packages/storage/src/sqlite/repositories/session-revert-repo.test.ts packages/runtime/src/session/session-summary.test.ts packages/runtime/src/session/session-compaction.test.ts packages/runtime/src/session/session-revert.test.ts packages/opencode-app/src/workflows/run-lane-command.test.ts packages/opencode-app/src/workflows/workflows.test.ts`
  - Kết quả: 13 test files passed, 33 tests passed.
  - Manual evidence: `tool.rule-scan` không khả dụng trong runtime DH hiện tại; đã capture manual evidence theo workflow.
- Blockers:
  - P2B-05 blocked.
  - Blocker: `run-knowledge-command.ts` stateless (không session-backed), nên không thể hook compaction vào `ask/explain/trace` an toàn trong scope này.
  - Owner: Product/Solution + Fullstack.
  - Next action: tạo scope follow-on “session-backed knowledge command bridge” trước khi nối compaction vào knowledge path.
- Quyết định/ghi chú sequencing:
  - Giữ lane workflow làm integration target chính cho M1/M2/M3 theo solution package.
  - Không mở rộng sang full upstream TS subsystem.
- Next actions (phiên kế tiếp):
  - Nếu được duyệt follow-on scope: triển khai session bridge cho `run-knowledge-command.ts` rồi un-block P2B-05.

### [2026-04-11 11:17] Session #2 - Post-review important findings fixes
- Mục tiêu phiên:
  - Sửa 3 important findings trước closure review.
- Checklist items cập nhật trạng thái:
  - P1-04/P3A-04: giữ trạng thái [Completed], đã sửa integration bug để `resumeSessionId` thực sự resume session cũ thay vì luôn create session mới.
  - P2B-02/P2B-07: giữ trạng thái [Completed], đã chặn growth cost trong compaction heuristic bằng runtime-event sampling cap.
  - P3B-02/P3B-06: giữ trạng thái [Completed], đã làm rõ semantics `undoRevert` một-bước với guard missing/self-referential chain + test coverage.
  - Optional minor #4: thực hiện (thêm `__resetSessionRunStateForTests()` + gọi trong afterEach test).
  - Optional minor #5/#6: deferred (không bắt buộc closure, tránh mở rộng scope).
- Files thay đổi:
  - `packages/opencode-app/src/workflows/run-lane-command.ts`
  - `packages/opencode-app/src/workflows/run-lane-command.test.ts`
  - `packages/runtime/src/session/session-compaction.ts`
  - `packages/runtime/src/session/session-compaction.test.ts`
  - `packages/runtime/src/session/session-revert.ts`
  - `packages/runtime/src/session/session-revert.test.ts`
  - `packages/runtime/src/session/session-run-state.ts`
  - `packages/runtime/src/session/session-run-state.test.ts`
- Evidence/validation:
  - Command: `npm run check`
  - Kết quả: pass.
  - Command: `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts packages/runtime/src/session/session-compaction.test.ts packages/runtime/src/session/session-revert.test.ts packages/runtime/src/session/session-run-state.test.ts`
  - Kết quả: 4 test files passed, 16 tests passed.
  - Command: `npm run test -- packages/runtime/src/session/session-run-state.test.ts packages/runtime/src/reliability/retry-policy.test.ts packages/runtime/src/reliability/retrying-chat-provider.test.ts packages/providers/src/chat/chat.test.ts packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts packages/storage/src/sqlite/repositories/session-summary-repo.test.ts packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts packages/storage/src/sqlite/repositories/session-revert-repo.test.ts packages/runtime/src/session/session-summary.test.ts packages/runtime/src/session/session-compaction.test.ts packages/runtime/src/session/session-revert.test.ts packages/opencode-app/src/workflows/run-lane-command.test.ts packages/opencode-app/src/workflows/workflows.test.ts`
  - Kết quả: 13 test files passed, 38 tests passed.
- Blockers:
  - Không có blocker mới ngoài blocker đã biết P2B-05 (knowledge stateless path).
- Quyết định/ghi chú sequencing:
  - Giữ nguyên approved scope/solution; không mở follow-on knowledge-path trong phiên này.
- Next actions (phiên kế tiếp):
  - Chờ reviewer xác nhận closure cho 3 findings quan trọng.

### [2026-04-11 11:21] Session #3 - Closure pass (targeted cleanup + evidence refresh)
- Mục tiêu phiên:
  - Chạy lại validation sau closure pass, xử lý follow-up low-risk #4/#5, và cập nhật wording risk/watchout tránh hiểu nhầm.
- Checklist items cập nhật trạng thái:
  - Important findings #1/#2/#3: giữ [Completed] (đã xác nhận lại bằng test targeted).
  - Optional follow-up #4/#5: [Completed] (thêm comment làm rõ append-only semantics của summary repo và chỉnh wording risk/watchout theo trạng thái thực tế).
  - Optional follow-up #6: [Completed] ở mức tài liệu (watchout wording đã phản ánh mitigation đã thực thi).
- Files thay đổi:
  - `packages/runtime/src/session/session-compaction.ts`
  - `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
  - `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
- Evidence/validation:
  - Command: `npm run check`
  - Kết quả: pass.
  - Command: `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts packages/runtime/src/session/session-compaction.test.ts packages/runtime/src/session/session-revert.test.ts packages/runtime/src/session/session-run-state.test.ts packages/storage/src/sqlite/repositories/session-summary-repo.test.ts`
  - Kết quả: 5 test files passed, 17 tests passed.
  - Manual evidence: `tool.rule-scan` không có trên runtime DH hiện tại; dùng compile + targeted tests + workflow evidence capture.
- Blockers:
  - Không có blocker mới; giữ blocker đã biết P2B-05 (stateless knowledge path).
- Quyết định/ghi chú sequencing:
  - Không mở rộng sang follow-on knowledge bridge; bám approved solution hiện tại.
- Next actions (phiên kế tiếp):
  - Chuyển QA/reviewer xác nhận closure với blocker P2B-05 giữ nguyên.

---

## 9) Resume quick-start

Khi mở lại công việc, làm đúng thứ tự sau:

1. Mở file này và tìm item đầu tiên đang ở trạng thái `[In progress]` hoặc item `[Not started]` sớm nhất theo phase.
2. Đọc entry mới nhất trong `Progress log` để lấy bối cảnh, blockers, và next actions.
3. Xác nhận lại dependencies của item sắp làm (mục 6).
4. Thực thi item, cập nhật trạng thái ngay khi chuyển bước.
5. Ghi evidence/validation vào `Progress log` trước khi đánh dấu `[Completed]`.
6. Nếu bị chặn, đổi trạng thái item sang `[Blocked]`, ghi rõ owner + điều kiện gỡ chặn + ETA.
7. Trước khi dừng phiên, cập nhật lại `Next actions` cho người tiếp theo.

---

## 10) Checkpoint tổng hợp theo milestone

- [x] [Completed] **M1 checkpoint**: Run-state + Retry foundation hoàn tất và có evidence.
- [ ] [Blocked] **M2 checkpoint**: Summary + Compaction hoàn tất và chứng minh cải thiện phiên dài. (Blocked on P2B-05 per stateless knowledge path constraint.)
- [x] [Completed] **M3 checkpoint**: Revert milestone 1 hoạt động ổn định + ownership/docs/evidence chốt đầy đủ.
