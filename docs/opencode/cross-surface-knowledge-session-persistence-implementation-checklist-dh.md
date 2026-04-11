# Checklist triển khai trạng thái hóa: cross-surface knowledge-session persistence (DH)

Ngày tạo: 2026-04-11  
Scope nguồn: `docs/scope/2026-04-11-cross-surface-knowledge-session-persistence.md`  
Solution nguồn: `docs/solution/2026-04-11-cross-surface-knowledge-session-persistence.md`  
Blocked item cần gỡ: `KB-P3-03` trong `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Gỡ chặn `KB-P3-03` bằng cách triển khai **persistence contract cross-surface** cho knowledge-command session theo hướng **hẹp + additive**.
- Đảm bảo metadata compaction/continuation được ghi nhận nhất quán trên các bề mặt runtime dành cho knowledge session.
- Không redesign session tổng thể, không đổi lane semantics, không đổi retrieval core.

### Phạm vi in-scope
- Inventory và chốt ranh giới persistence hiện tại (FK-bound lane surfaces vs knowledge session table).
- Chọn contract cross-surface đã được duyệt trong solution (ưu tiên shadow surfaces cho knowledge session).
- Thêm schema/repo additive cho knowledge runtime events + knowledge summaries.
- Tích hợp bridge để persist event + summary như một kết quả đơn vị.
- Cập nhật reporting/workflow output theo hướng additive để phản ánh trạng thái persisted/failure.
- Validation + docs closure để đóng blocker `KB-P3-03`.

### Ngoài phạm vi out-of-scope
- Redesign toàn bộ session model.
- Ép knowledge session thành lane session đầy đủ.
- Đổi semantics của `session_runtime_events` / `session_summaries` hiện có.
- Thay đổi retrieval/ranking/prompt assembly.
- Refactor ngoài mục tiêu gỡ blocker.

---

## 2) Current state vs Target state

| Bề mặt | Current state (DH hiện tại) | Target state (sau checklist) |
|---|---|---|
| Blocker `KB-P3-03` | Đang blocked vì knowledge bridge dùng persistence riêng, trong khi runtime lane surfaces FK sang `sessions` | Unblocked với contract persistence cross-surface cho knowledge sessions |
| Knowledge bridge | Đã có create/resume + in-memory continuation signal | Có persistence adapter ghi event + summary thực tế cho knowledge session |
| Runtime event/summary persistence | Chỉ lane-session tables là write-path chính | Có thêm knowledge-owned surfaces additive, không phá lane tables |
| Tính nhất quán persistence | Có nguy cơ partial/không rõ persisted | Có rule binary rõ: thành công cả event+summary hoặc fail toàn bộ outcome |
| Reporting | Có thể chỉ phản ánh in-memory summary | Có cờ/trường additive phản ánh persisted success/failure trung thực |

---

## 3) Definition of Done (DoD)

- [x] [Completed] **DoD-01**: Ranh giới persistence hiện tại được inventory và ghi rõ vì sao `KB-P3-03` blocked.
- [x] [Completed] **DoD-02**: Contract cross-surface được chốt theo solution đã duyệt, không drift sang session redesign.
- [x] [Completed] **DoD-03**: Schema/repo additive cho knowledge runtime events + knowledge summaries được triển khai và test pass.
- [x] [Completed] **DoD-04**: Bridge tích hợp persistence event + summary theo một đơn vị outcome (không over-claim persisted).
- [x] [Completed] **DoD-05**: Reporting/workflow output có trạng thái additive cho success/failure persistence.
- [x] [Completed] **DoD-06**: Validation evidence đầy đủ cho success path, failure path, và no-regression lane-session.
- [x] [Completed] **DoD-07**: `KB-P3-03` được cập nhật khỏi blocked với bằng chứng thực thi + tài liệu cập nhật đầy đủ.

---

## 4) Status legend và protocol cập nhật

### Legend bắt buộc
- [ ] [Not started]
- [ ] [In progress]
- [x] [Completed]
- [ ] [Blocked]

### Protocol cập nhật
1. Mỗi checklist item chỉ có **một trạng thái hiệu lực** tại một thời điểm.
2. Chuyển sang `[In progress]` trước khi sửa code/tài liệu.
3. Chỉ đánh dấu `[Completed]` khi có evidence (test/log/manual) trong Progress log.
4. Nếu `[Blocked]`, bắt buộc ghi: blocker, owner, impact, next action, điều kiện gỡ chặn.
5. Kết phiên phải cập nhật `Progress log` + `Resume quick-start`.

---

## 5) Phases / workstreams

## Phase 0 — Baseline inventory của persistence boundary hiện tại

- [x] [Completed] **KBX-P0-01** Xác nhận baseline từ artifacts hiện hữu: knowledge bridge đã tồn tại nhưng `KB-P3-03` blocked.
- [x] [Completed] **KBX-P0-02** Liệt kê chính xác các table/repo liên quan: `knowledge_command_sessions`, `session_runtime_events`, `session_summaries`.
- [x] [Completed] **KBX-P0-03** Ghi rõ FK boundary: lane surfaces FK sang `sessions`; knowledge path không sở hữu lane session.
- [x] [Completed] **KBX-P0-04** Chốt inventory write-path/read-path hiện tại cho compaction + continuation metadata.
- [x] [Completed] **KBX-P0-05** Chốt baseline note trong log: blocker là persistence contract, không phải thiếu bridge logic.

## Phase 1 — Contract choice cho cross-surface persistence

- [x] [Completed] **KBX-P1-01** Chốt phương án contract theo solution: additive knowledge-owned shadow surfaces.
- [x] [Completed] **KBX-P1-02** Định nghĩa metadata bắt buộc phải persist: compaction event details, continuation summary, latest resume-visible state.
- [x] [Completed] **KBX-P1-03** Chốt rule outcome: event + summary là một kết quả persistence duy nhất (tránh partial ambiguous).
- [x] [Completed] **KBX-P1-04** Chốt failure semantics: invalid/unlinked session fail fast; write failure không được báo persisted success.
- [x] [Completed] **KBX-P1-05** Ghi contract note xác nhận hướng narrow/additive, không đổi lane semantics.

## Phase 2 — Additive schema/repo work

- [x] [Completed] **KBX-P2-01** Thêm schema additive cho `knowledge_command_runtime_events` (FK sang `knowledge_command_sessions`).
- [x] [Completed] **KBX-P2-02** Thêm schema additive cho `knowledge_command_summaries` (FK sang `knowledge_command_sessions`).
- [x] [Completed] **KBX-P2-03** Thêm indexes tối thiểu phục vụ latest summary lookup + event history lookup.
- [x] [Completed] **KBX-P2-04** Tạo/hoàn thiện repo `knowledge-command-runtime-events-repo`.
- [x] [Completed] **KBX-P2-05** Tạo/hoàn thiện repo `knowledge-command-summary-repo`.
- [x] [Completed] **KBX-P2-06** Viết test repo cho create/upsert/read/latest theo contract đã chốt.

## Phase 3 — Bridge integration và reporting changes

- [x] [Completed] **KBX-P3-01** Tạo/hoàn thiện persistence adapter cho knowledge bridge (event + summary write unit).
- [x] [Completed] **KBX-P3-02** Tích hợp adapter vào `knowledge-command-session-bridge` sau compaction/continuation decision.
- [x] [Completed] **KBX-P3-03** Đảm bảo bridge trả kết quả persistence rõ: success/failure/warning additive.
- [x] [Completed] **KBX-P3-04** Cập nhật `run-knowledge-command` để propagate trạng thái persistence mà không đổi retrieval behavior.
- [x] [Completed] **KBX-P3-05** Cập nhật presenter/report fields theo hướng additive, giữ compatibility output hiện tại.
- [x] [Completed] **KBX-P3-06** Đồng bộ trạng thái trong checklist nguồn, chuyển `KB-P3-03` khi đủ evidence.

## Phase 4 — Validation và docs closure

- [x] [Completed] **KBX-P4-01** Chạy targeted tests cho repo mới (events/summaries).
- [x] [Completed] **KBX-P4-02** Chạy bridge/workflow tests cho success path persisted.
- [x] [Completed] **KBX-P4-03** Chạy failure-path tests (write fail / invalid session / unlinked session).
- [x] [Completed] **KBX-P4-04** Chạy regression checks để chứng minh lane-session behavior không đổi.
- [x] [Completed] **KBX-P4-05** Cập nhật docs/checklist liên quan và chốt DoD + bằng chứng đóng blocker.

---

## 6) Checklist chi tiết theo bề mặt

### 6.1 Storage / schema
- [x] [Completed] **KBX-SS-01** Schema mới là additive-only, không sửa FK contract của lane tables hiện hữu.
- [x] [Completed] **KBX-SS-02** Có migration/init logic rõ cho DB mới hoặc DB hiện hữu.
- [x] [Completed] **KBX-SS-03** Có test xác nhận FK ownership đúng với `knowledge_command_sessions`.

### 6.2 Runtime bridge / workflow
- [x] [Completed] **KBX-RW-01** Bridge không còn over-claim persisted khi chỉ có in-memory continuation.
- [x] [Completed] **KBX-RW-02** Bridge persistence failure được phản ánh rõ ở output contract.
- [x] [Completed] **KBX-RW-03** Workflow vẫn chạy retrieval bình thường khi contract cho phép degrade hợp lệ.

### 6.3 Reporting / CLI presenter
- [x] [Completed] **KBX-RP-01** Trường mới là optional/additive; consumer cũ vẫn parse được.
- [x] [Completed] **KBX-RP-02** Có thông điệp/cờ rõ để phân biệt persisted vs generated-in-memory.
- [x] [Completed] **KBX-RP-03** Không phát sinh yêu cầu redesign UX/CLI ngoài phạm vi.

### 6.4 Test / evidence
- [x] [Completed] **KBX-TV-01** Có evidence cho case: new session không compaction -> không false persisted state.
- [x] [Completed] **KBX-TV-02** Có evidence cho case: resumed + overflow -> persist event + summary thành công.
- [x] [Completed] **KBX-TV-03** Có evidence cho case: write failure -> không báo thành công persisted.
- [x] [Completed] **KBX-TV-04** Có evidence cho case: invalid/unlinked session -> fail fast theo contract.

---

## 7) Dependencies / sequencing notes

### Trình tự bắt buộc
1. **Phase 0** phải hoàn tất trước khi chốt contract.
2. **Phase 1** phải chốt trước schema/repo implementation.
3. **Phase 2** hoàn tất trước bridge integration ở Phase 3.
4. **Phase 3** hoàn tất trước validation/docs closure ở Phase 4.
5. Chỉ cập nhật trạng thái `KB-P3-03` khỏi blocked khi Phase 4 có evidence hợp lệ.

### Ghi chú phụ thuộc
- `KBX-P2-*` phụ thuộc `KBX-P1-*`.
- `KBX-P3-*` phụ thuộc `KBX-P2-*`.
- `KBX-P4-*` phụ thuộc ít nhất `KBX-P3-01..05`.
- Mọi thay đổi reporting phụ thuộc contract failure semantics đã chốt.

---

## 8) Risks / watchouts

- [x] [Completed] **KBX-RISK-01** Scope creep sang session redesign tổng thể.  
  Watchout: chỉ giải quyết FK-bound blocker cho cross-surface persistence.

- [x] [Completed] **KBX-RISK-02** Vô tình chạm semantics lane tables hiện hữu.  
  Watchout: lane tables giữ nguyên contract; giải pháp là additive knowledge surfaces.

- [x] [Completed] **KBX-RISK-03** Partial persistence gây trạng thái mơ hồ.  
  Watchout: enforce unit outcome event+summary, không xác nhận thành công nếu thiếu một phần.

- [x] [Completed] **KBX-RISK-04** Over-claim persistence trong report.  
  Watchout: tách rõ generated-in-memory và persisted cross-surface.

- [x] [Completed] **KBX-RISK-05** No-regression lane consumers không được chứng minh.  
  Watchout: bắt buộc regression evidence trước khi đóng blocker.

---

## 9) Progress log template

```md
### [YYYY-MM-DD HH:mm] Session #<n> - <owner>
- Mục tiêu phiên:
  - ...
- Checklist items cập nhật trạng thái:
  - <ID> từ [Not started] -> [In progress]
  - <ID> từ [In progress] -> [Completed]
  - <ID> -> [Blocked] (blocker/owner/impact/next action)
- Files thay đổi:
  - ...
- Evidence/validation:
  - Command/manual check:
  - Kết quả:
- Rủi ro/quyết định:
  - ...
- Next actions:
  - ...
```

## Progress log

### [2026-04-11 00:00] Session #0 - Bootstrap follow-on checklist
- Mục tiêu phiên:
  - Tạo checklist thực thi trạng thái hóa cho follow-on scope/solution nhằm gỡ `KB-P3-03`.
- Checklist items cập nhật trạng thái:
  - `KBX-P0-01` từ [Not started] -> [Completed].
- Files thay đổi:
  - `docs/opencode/cross-surface-knowledge-session-persistence-implementation-checklist-dh.md`
- Evidence/validation:
  - Manual evidence: checklist đã được tạo theo scope/solution approved; chưa thực thi code.
- Rủi ro/quyết định:
  - Chốt hướng narrow/additive; không redesign session.
- Next actions:
  - Bắt đầu inventory đầy đủ cho `KBX-P0-02..05`.

### [2026-04-11 13:42] Session #1 - Fullstack Agent (KB-P3-03 follow-on implementation)
- Mục tiêu phiên:
  - Triển khai đầy đủ follow-on persistence contract cross-surface cho knowledge-command sessions theo scope/solution đã duyệt.
- Checklist items cập nhật trạng thái:
  - `KBX-P0-02..05` từ [Not started] -> [Completed].
  - `KBX-P1-01..05` từ [Not started] -> [Completed].
  - `KBX-P2-01..06` từ [Not started] -> [Completed].
  - `KBX-P3-01..06` từ [Not started] -> [Completed].
  - `KBX-P4-01..05` từ [Not started] -> [Completed].
  - `KBX-SS-*`, `KBX-RW-*`, `KBX-RP-*`, `KBX-TV-*`, `KBX-RISK-*` từ [Not started] -> [Completed].
  - `DoD-01..07` từ [Not started] -> [Completed].
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
  - `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
  - `docs/opencode/cross-surface-knowledge-session-persistence-implementation-checklist-dh.md`
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
- Rủi ro/quyết định:
  - Giữ nguyên lane-session tables/semantics (`session_runtime_events`, `session_summaries`) và chỉ thêm shadow knowledge surfaces.
  - Ghi compaction event + continuation summary như một outcome duy nhất bằng transaction; fail thì rollback và warning additive.
  - Không redesign session architecture tổng thể.
- Next actions:
  - Chuyển review/QA cho follow-on `KB-P3-03` với evidence hiện tại.

### [2026-04-11 13:51] Session #2 - Fullstack Agent (code review findings follow-up)
- Mục tiêu phiên:
  - Sửa latent transaction fragility ở persistence adapter và cleanup 2 minor findings.
- Checklist items cập nhật trạng thái:
  - `KBX-P3-01`, `KBX-P3-03`, `KBX-RISK-03` giữ [Completed] nhưng đã harden implementation theo review finding quan trọng.
  - `KBX-P0-01` từ [Not started] -> [Completed] để đồng bộ với progress log baseline.
- Files thay đổi:
  - `packages/runtime/src/session/knowledge-command-runtime-persistence.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.ts`
  - `docs/opencode/cross-surface-knowledge-session-persistence-implementation-checklist-dh.md`
- Evidence/validation:
  - Command/manual check:
    - `npm run check`
    - `npm run test -- packages/runtime/src/session/knowledge-command-runtime-persistence.test.ts`
    - `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.test.ts`
    - `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.test.ts`
    - `npm run test -- packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
    - `npm run test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - Kết quả:
    - Tất cả pass.
- Rủi ro/quyết định:
  - Transaction persistence giờ explicit dùng chung DB handle xuyên suốt unit-of-work, không còn phụ thuộc implicit DB cache behavior của repo nội bộ.
  - Xóa cờ event JSON `continuationSummaryPersisted` (thông tin dư thừa/ambiguous), giữ cờ persisted ở output contract thay vì trùng nghĩa trong payload event.
- Next actions:
  - Chờ reviewer xác nhận finding quan trọng đã đóng.

---

## 10) Resume quick-start

Khi quay lại, thực hiện nhanh theo thứ tự:

1. Đọc `Progress log` mới nhất và xác định item đang dở.
2. Xác nhận trạng thái blocker `KB-P3-03` trong checklist nguồn.
3. Chuyển đúng **1 item** sang `[In progress]` trước khi sửa.
4. Hoàn tất item -> bổ sung evidence -> chuyển `[Completed]`.
5. Nếu bị chặn -> chuyển `[Blocked]`, ghi đủ blocker/owner/impact/next action/điều kiện gỡ.
6. Kết phiên: cập nhật progress log + rà DoD.

Checklist ưu tiên resume hiện tại:
- [ ] [In progress] **Next-01** Code review + QA verification cho follow-on `KB-P3-03`.
- [ ] [Not started] **Next-02** Theo dõi phản hồi QA và xử lý nếu có findings.
- [ ] [Not started] **Next-03** Chốt cập nhật workflow-state/gate khi reviewer + QA xác nhận.
