# Mapping selective-port session runtime từ upstream OpenCode sang DH

Ngày: 2026-04-11  
Phạm vi phân tích upstream: `packages/opencode/src/session/{run-state.ts, summary.ts, compaction.ts, retry.ts, revert.ts}`

---

## 1) Mục tiêu tài liệu

Tài liệu này là reference kiến trúc + roadmap để DH **chọn lọc** port các ý tưởng session runtime có giá trị cao từ upstream OpenCode, theo nguyên tắc:

- không mirror toàn bộ TS session stack upstream;
- chỉ lấy các năng lực giúp DH tăng độ ổn định runtime, khả năng resume/recovery, và quality của execution flow;
- giữ ranh giới package/module hiện có của DH.

Tài liệu bám sát kết luận đã chốt trong `docs/opencode/selective-port-roadmap-from-upstream-opencode.md`: **DH không nên copy nguyên monorepo TS upstream**.

---

## 2) Vì sao session runtime là vùng selective-port giá trị cao tiếp theo

Session/runtime là nơi hội tụ các failure mode tốn chi phí nhất trong vận hành thực tế:

1. **Busy-state và cancel semantics**: nếu không chuẩn, cùng một session có thể chạy chồng lệnh hoặc bị trạng thái "kẹt".
2. **Resume/recovery**: nếu resume chỉ kiểm lane mà không có run-state guard, khả năng drift state tăng nhanh khi user chạy lại luồng.
3. **Context pressure và overflow**: hội thoại dài + tool output lớn làm giảm chất lượng model; cần cơ chế compaction/prune có chủ đích.
4. **Retry policy**: thiếu chính sách retry có backoff/header-aware dễ gây spam provider hoặc UX kém.
5. **Revert/undo an toàn**: khi cần rollback theo message/part, thiếu snapshot + patch logic rõ sẽ gây inconsistency giữa chat history và filesystem diff.

So với việc port thêm framework-level wiring, các năng lực trên tạo giá trị trực tiếp cho trải nghiệm `dh ask/explain/trace` và lane workflows.

---

## 3) Thực trạng session/runtime của DH hiện tại (factual)

Dựa trên code hiện có:

- `apps/cli/src/runtime-client.ts`: CLI gọi trực tiếp vào runtime workflows (`runLaneWorkflow`, `runKnowledgeCommand`, `runDoctor`, `runIndexWorkflow`).
- `packages/runtime/src/session/session-manager.ts`:
  - tạo session lane-locked;
  - tạo execution envelope;
  - persist session/workflow/envelope qua SQLite + filesystem mirror;
  - ghi compatibility mirror workflow-state.
- `packages/runtime/src/session/session-resume.ts`:
  - đọc session từ `SessionStore`;
  - validate lane hợp lệ;
  - enforce lane lock khi resume.
- `packages/storage/src/sqlite/repositories/sessions-repo.ts`:
  - đã có persistence cho session fields cốt lõi (`lane`, `current_stage`, `status`, `semantic_mode`, `tool_enforcement_level`, ...).
- `packages/shared/src/types/session.ts`:
  - có `SessionState` dạng rõ ràng, đủ làm nền cho mở rộng selective-port.

Kết luận thực trạng:

- DH đã có **session identity + lane lock + workflow state persistence** tốt ở mức baseline.
- DH **chưa có một cụm session-runtime module riêng** tương đương các concern chi tiết upstream (`run-state`, `summary/diff`, `compaction`, `retry policy`, `revert`).
- Vì vậy, hướng đúng là bổ sung theo lát chức năng vào package boundaries hiện có, không kéo nguyên TS session subsystem từ upstream.

---

## 4) Bề mặt upstream session runtime nên nghiên cứu

Trọng tâm 5 file:

- `run-state.ts`
- `summary.ts`
- `compaction.ts`
- `retry.ts`
- `revert.ts`

Các file lân cận chỉ dùng làm ngữ cảnh khi cần:

- `processor.ts` (điểm gọi model processing trong compaction flow)
- `status.ts` (session busy/idle status service)
- `overflow.ts` (overflow heuristic dùng trong compaction)
- `prompt.ts`, `message.ts`, `schema.ts` (message/schema contracts phục vụ tương tác giữa các module)

---

## 5) Phân tích chi tiết 5 file mục tiêu và mapping sang DH

## 5.1 `run-state.ts`

### Nó likely cung cấp gì

- Quản lý **runner per session** với map `sessionID -> runner`.
- Guard `assertNotBusy` để chặn thao tác xung đột khi session đang chạy.
- `cancel(sessionID)` để hủy đúng phiên đang bận.
- `ensureRunning` / `startShell` để chuẩn hóa trạng thái busy/idle và xử lý interrupt.
- Gắn với `SessionStatus` để phản ánh trạng thái runtime.

### Vì sao quan trọng với DH

- DH hiện có lane lock khi resume, nhưng chưa có guard run-state mức runtime cho các thao tác cạnh tranh.
- Đây là nền để các chức năng như revert/cleanup hoặc retry không ghi đè lẫn nhau.

### Nên port gì

- Ý tưởng **session-scoped busy state + cancel token**.
- API tối thiểu: `assertNotBusy`, `markBusy/markIdle`, `cancel`, `withSessionRunGuard`.
- Cơ chế auto-cleanup state khi run hoàn tất.

### Không nên port wholesale

- Toàn bộ Effect Layer/ServiceMap runtime wiring của upstream.
- Bất kỳ dependency nào buộc DH phải theo mô hình effect-runtime của upstream.

### Điểm đến đề xuất trong DH

- `packages/runtime/src/session/session-run-state.ts` (module mới).
- Tích hợp tại:
  - `packages/opencode-app/src/workflows/run-lane-command.ts` (guard trước khi chạy stage nặng);
  - các điểm command execution trong `packages/opencode-app`.

### Priority

- **P0** (nền cho các concern còn lại).

---

## 5.2 `summary.ts`

### Nó likely cung cấp gì

- Tính diff/snapshot delta từ dãy message (step-start/step-finish snapshots).
- Lưu summary số liệu thay đổi (files/additions/deletions) cho session.
- Persist diff vào storage và publish event.
- Cập nhật summary theo message mục tiêu (user message + assistant response chain).

### Vì sao quan trọng với DH

- DH đã có workflow/audit state, nhưng thiếu lớp tóm tắt tiến triển ở mức session message timeline.
- Summary/diff giúp tăng khả năng resume “đúng ngữ cảnh”, giảm mất thông tin giữa các lần handoff.

### Nên port gì

- Contract summary gọn: `files_changed`, `additions`, `deletions`, `last_diff_at`.
- Hàm compute diff từ snapshot IDs hoặc fallback manual diff metadata nếu chưa có snapshot engine hoàn chỉnh.
- Cơ chế lưu diff tách biệt khỏi raw chat logs.

### Không nên port wholesale

- Copy nguyên message-v2 shape và event bus semantics của upstream.
- Copy logic unquote/path handling nếu chưa có nhu cầu tương thích dữ liệu git-quoted trong DH.

### Điểm đến đề xuất trong DH

- `packages/runtime/src/session/session-summary.ts` (module mới).
- `packages/storage/src/sqlite/repositories/session-summary-repo.ts` (module mới).
- Mở rộng `packages/shared/src/types/session.ts` bằng trường summary optional.

### Priority

- **P1**.

---

## 5.3 `compaction.ts`

### Nó likely cung cấp gì

- Overflow detection dựa trên token/model context.
- Pruning tool outputs cũ theo ngưỡng bảo vệ context (`PRUNE_PROTECT`, `PRUNE_MINIMUM`).
- Tạo vòng compaction message để model tự tóm tắt context và tiếp tục phiên.
- Replay logic khi overflow liên quan media/tool outputs.

### Vì sao quan trọng với DH

- `dh` hướng local-first + retrieval; các phiên dài hoặc tool-heavy sẽ sớm gặp context pressure.
- Nếu không có compaction có chủ đích, chất lượng trả lời giảm và xác suất thất bại tăng theo độ dài phiên.

### Nên port gì

- Overflow policy abstraction độc lập provider.
- Prune policy tối giản cho content nặng (ưu tiên tool output cũ, giữ phần “neo” quan trọng).
- Compaction trigger + synthetic continuation message cơ bản.

### Không nên port wholesale

- Không copy toàn bộ plugin trigger chain `experimental.*` của upstream.
- Không sao chép đầy đủ prompt template dài nếu chưa chứng minh hiệu quả trên DH.
- Không port nguyên processor integration stack.

### Điểm đến đề xuất trong DH

- `packages/runtime/src/session/session-compaction.ts` (module mới).
- `packages/opencode-app/src/workflows/`:
  - hook vào knowledge lanes (`ask/explain/trace`) trước khi gửi prompt lớn;
  - có thể bổ sung option `auto_compaction` trong runtime config.
- `packages/shared/src/types/session.ts` thêm metadata compaction (optional).

### Priority

- **P1** (sau run-state).

---

## 5.4 `retry.ts`

### Nó likely cung cấp gì

- Retry classification: lỗi nào retryable, lỗi nào không (vd context overflow thì không retry).
- Delay policy có ưu tiên header (`retry-after-ms`, `retry-after`, HTTP-date) rồi mới fallback exponential backoff.
- Hook cập nhật trạng thái retry attempt + thời điểm retry kế tiếp.

### Vì sao quan trọng với DH

- Hiện tại nếu retry nằm rải rác theo caller sẽ khó nhất quán giữa lane workflows và knowledge commands.
- Retry policy chuẩn giúp giảm lỗi transient provider/network mà không phá UX.

### Nên port gì

- `isRetryable(err)`, `computeRetryDelay(attempt, metadata)`, `maxDelay cap`.
- Chính sách no-retry cho overflow/semantic errors xác định.
- Emit retry telemetry đơn giản vào audit state.

### Không nên port wholesale

- Không kéo toàn bộ Effect Schedule stack.
- Không hard-code thông điệp kinh doanh upstream (ví dụ upsell message đặc thù OpenCode).

### Điểm đến đề xuất trong DH

- `packages/runtime/src/reliability/retry-policy.ts` (module mới, generic cho runtime).
- Tích hợp vào:
  - provider request layer trong `packages/providers`;
  - các luồng thực thi ở `packages/opencode-app/src/workflows`.

### Priority

- **P0** (đứng cùng run-state vì tác động reliability trực tiếp).

---

## 5.5 `revert.ts`

### Nó likely cung cấp gì

- Revert tới message/part mốc cụ thể với guard `assertNotBusy`.
- Snapshot track/restore + patch revert để rollback filesystem state tương ứng timeline.
- `unrevert` và `cleanup` để dọn message/part sau khi rollback hoàn tất.
- Đồng bộ lại session diff/summary sau revert.

### Vì sao quan trọng với DH

- DH có workflow state + audit; khi execution tạo thay đổi không mong muốn, cần rollback có cấu trúc thay vì thủ công.
- Đây là năng lực “safety net” cho delivery/migration lanes.

### Nên port gì

- Revert contract mức runtime: `revertTo(sessionId, checkpointId)`, `undoRevert(sessionId)`.
- Snapshot pointer + minimal patch list.
- Cleanup policy để timeline sau rollback nhất quán.

### Không nên port wholesale

- Không copy nguyên SyncEvent/bus event model upstream.
- Không bắt buộc có message-part granularity ngay milestone đầu nếu DH chưa cần.

### Điểm đến đề xuất trong DH

- `packages/runtime/src/session/session-revert.ts` (module mới).
- `packages/storage/src/sqlite/repositories/session-revert-repo.ts` (module mới hoặc mở rộng sessions-repo).
- Tích hợp với workflow/audit:
  - `packages/runtime/src/workflow/workflow-audit-service.ts`.

### Priority

- **P1**.

---

## 6) Đề xuất mapping ownership trong DH (theo package/module)

| Concern | Owner package chính | Module gợi ý |
|---|---|---|
| Busy/cancel run-state | `packages/runtime` | `src/session/session-run-state.ts` |
| Retry policy dùng chung | `packages/runtime` + `packages/providers` | `src/reliability/retry-policy.ts` + adapter ở provider calls |
| Session summary/diff | `packages/runtime` + `packages/storage` | `src/session/session-summary.ts`, `storage/.../session-summary-repo.ts` |
| Context compaction/prune | `packages/runtime` + `packages/opencode-app` | `src/session/session-compaction.ts`, workflow integration points |
| Revert/undo lifecycle | `packages/runtime` + `packages/storage` | `src/session/session-revert.ts`, revert persistence repo |
| Shared contracts | `packages/shared` | mở rộng `types/session.ts`, có thể thêm `types/session-runtime.ts` |
| Bridge nếu cần expose sang TS↔Go path | `packages/opencode-sdk` | chỉ thêm type/contracts tối giản, không chuyển core logic |

Nguyên tắc ownership:

- Runtime logic ở `packages/runtime`.
- Persistence ở `packages/storage`.
- Workflow orchestration gọi runtime từ `packages/opencode-app`.
- `opencode-sdk` chỉ giữ contract bridge khi thật sự cần giao tiếp TS↔Go, không biến thành nơi chứa business runtime.

---

## 7) Thứ tự triển khai incremental khuyến nghị

## Giai đoạn 1 (P0) — Reliability foundation

1. Tạo `session-run-state.ts` với guard busy/cancel tối thiểu.
2. Tạo `retry-policy.ts` dùng chung, tích hợp vào provider call path quan trọng.
3. Bổ sung audit fields tối thiểu cho retry/busy transitions.

Kết quả mong đợi: giảm race condition và tăng ổn định khi lỗi transient.

## Giai đoạn 2 (P1-a) — Session observability và context quality

4. Tạo `session-summary.ts` + repo lưu summary/diff.
5. Tạo `session-compaction.ts` bản tối giản (overflow detect + prune + continue message).

Kết quả mong đợi: resume/handoff rõ hơn, chất lượng phiên dài ổn định hơn.

## Giai đoạn 3 (P1-b) — Safety rollback

6. Tạo `session-revert.ts` bản milestone 1 (checkpoint-level, chưa cần full part-level).
7. Nối revert với workflow audit và summary refresh.

Kết quả mong đợi: có rollback path có cấu trúc cho delivery/migration.

---

## 8) Definition of Done cho milestone đầu tiên (Session Runtime Selective-Port M1)

M1 được coi là xong khi thỏa tất cả:

1. Có module `session-run-state` dùng thực tế trong ít nhất 1 lane workflow path.
2. Có `retry-policy` dùng chung trong ít nhất 1 provider execution path với backoff + retry-after support.
3. Có kiểm thử/validation cho:
   - busy guard hoạt động;
   - cancel không để session kẹt busy;
   - retry delay tính đúng cho các case header/no-header.
4. Không có thay đổi nào yêu cầu mirror toàn bộ upstream TS session stack.
5. Docs cập nhật rõ current-state vs target-state cho các module mới.

Ghi chú thực tế repo: vì toolchain/validation surfaces có thể giới hạn theo thời điểm, nếu chưa có command phù hợp thì phải ghi manual evidence rõ ràng, không khẳng định pass giả định.

---

## 9) Rủi ro và watchouts

1. **Scope creep thành “port full stack”**  
   Giảm thiểu: gate mỗi module bằng tiêu chí giá trị trực tiếp cho DH runtime.

2. **Đè lên boundaries hiện có giữa runtime/app/storage**  
   Giảm thiểu: giữ ownership rõ như bảng mapping; không nhét business logic vào SDK bridge package.

3. **Tối ưu context quá sớm làm giảm fidelity** (compaction/prune)  
   Giảm thiểu: rollout theo flag, đo chất lượng output trước khi bật mặc định.

4. **Retry quá hung hãn gây request storm**  
   Giảm thiểu: cap delay, cap attempts, tôn trọng `retry-after` headers.

5. **Revert gây lệch timeline chat vs state filesystem**  
   Giảm thiểu: milestone 1 chỉ support checkpoint-level rõ ràng; bổ sung cleanup invariants và audit.

6. **Tài liệu drift**  
   Giảm thiểu: luôn ghi rõ “current state” và “target state”, tránh ngôn ngữ hàm ý đã implement.

---

## 10) Kết luận ngắn

Session runtime là vùng selective-port có ROI cao tiếp theo cho DH, nhưng cách làm đúng là:

- port **ý tưởng cốt lõi** từ 5 file upstream;
- triển khai theo **lát nhỏ**, bám package boundaries của DH;
- giữ nguyên nguyên tắc: **không mirror toàn bộ TS session subsystem**.

Lộ trình khuyến nghị: `run-state + retry (P0)` → `summary + compaction (P1)` → `revert (P1)`.

---

## 11) Cập nhật hiện trạng triển khai (2026-04-11)

Đã triển khai trong DH (selective-port, không mirror upstream full stack):

- Run-state foundation:
  - `packages/runtime/src/session/session-run-state.ts`
  - tích hợp guard thực thi ở `packages/opencode-app/src/workflows/run-lane-command.ts`
  - ghi runtime events busy/idle vào `session_runtime_events`.
- Retry foundation:
  - `packages/runtime/src/reliability/{retry-policy,retrying-chat-provider}.ts`
  - provider error metadata có cấu trúc ở `packages/providers/src/chat/{types,openai-chat,anthropic-chat}.ts`
  - retry wrapper được thread qua lane workflow path.
- Summary/checkpoint/compaction:
  - `packages/runtime/src/session/{session-summary,session-compaction}.ts`
  - repos mới: `session-summary-repo`, `session-checkpoints-repo`
  - schema additive trong `packages/storage/src/sqlite/db.ts`
  - auto-compaction flag dùng key config `session.auto_compaction` (default-safe/off).
- Revert milestone 1:
  - `packages/runtime/src/session/session-revert.ts`
  - repo mới `session-revert-repo`
  - revert checkpoint-level có guard `assertNotBusy`, refresh pointers summary/checkpoint/revert.

Deferred/blocked đúng theo approved solution constraints:

- Hook compaction trực tiếp vào `ask/explain/trace` (P2B-05) **chưa làm** vì `run-knowledge-command.ts` hiện stateless.
- Cần follow-on scope riêng cho session-backed knowledge bridge nếu muốn hoàn tất phần này an toàn.

Ownership boundary giữ đúng:

- runtime logic ở `packages/runtime`
- persistence ở `packages/storage`
- orchestration ở `packages/opencode-app`
- contracts ở `packages/shared`
- không chuyển core runtime business logic sang `packages/opencode-sdk`.
