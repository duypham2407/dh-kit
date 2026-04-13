# Checklist cấp chương trình: Operator-safe Project/Worktree (DH)

**Ngày tạo:** 2026-04-13  
**Nguồn dẫn xuất chính:** `docs/opencode/operator-safe-project-worktree-master-plan-dh.md`  
**Mục đích tài liệu:** một checklist tổng thể cấp chương trình để triển khai xuyên suốt nhiều phase, tránh phân mảnh thành các micro-plan rời rạc.

---

## 1) Mục tiêu và phạm vi

### Mục tiêu chương trình
Xây dựng **operator-safe workspace operation layer** cho DH theo hướng có guardrail, có khả năng giải thích, có bounded execution, có báo cáo vận hành, và có phục hồi mức nhẹ (rollback-light) — **nhưng không trượt sang parity đầy đủ với nền tảng VCS/worktree**.

### Phạm vi triển khai
- Chuẩn hoá contract và boundary cho toàn lifecycle thao tác project/worktree.
- Bổ sung nền tảng snapshot + restore-light ở mức bounded.
- Bổ sung temp workspace/isolated target handling theo policy.
- Bổ sung bounded apply execution helpers (dry_run/execute parity có kiểm soát).
- Chuẩn hoá execution reporting và operator summaries.
- Bổ sung maintenance utilities cho hygiene/cleanup/inspect.
- Đánh giá điểm quyết định optional worktree wrapper (go/no-go có tiêu chí).
- Validation và closure cấp chương trình.

### Ngoài phạm vi (khóa cứng)
- Full parity subsystem project/vcs/worktree.
- Branch lifecycle platform, merge/rebase/reset orchestration diện rộng.
- Full git porcelain replacement.
- Hứa hẹn rollback hoàn hảo cho mọi tình huống filesystem/VCS.

---

## 2) Trạng thái hiện tại vs trạng thái mục tiêu

### Current state (DH reality)
- [x] [Completed] Scan hardening đã hoàn tất.
- [x] [Completed] Marker-driven segmentation đã hoàn tất.
- [x] [Completed] Operator-safe utility preflight slice đã hoàn tất.
- [x] [Completed] Có nền contract/result envelope hẹp cho check/dry_run/execute.

### Target state cấp chương trình
- [x] [Completed] Contract chương trình và boundary freeze thống nhất cho toàn operation lifecycle.
- [x] [Completed] Snapshot + restore-light capability hoạt động trong bounded scope.
- [x] [Completed] Temp workspace / isolated target lifecycle có create-use-cleanup rõ.
- [x] [Completed] Bounded apply helpers có policy, parity dry_run/execute, và metadata phục vụ rollback/report.
- [x] [Completed] Execution report chuẩn + operator summary nhất quán.
- [x] [Completed] Maintenance utilities đủ để inspect/prune/cleanup artifacts.
- [x] [Completed] Quyết định rõ optional worktree wrapper (go/no-go + tiêu chí).
- [x] [Completed] Validation + closure theo DoD chương trình.

---

## 3) Definition of Done (DoD) cho toàn bộ chương trình

Chương trình chỉ được coi là hoàn tất khi **tất cả** tiêu chí dưới đây đạt trạng thái Completed:

- [x] [Completed] Có operation model thống nhất từ preflight -> prepare -> apply -> report -> cleanup/rollback-light.
- [x] [Completed] Workspace/boundary truth tái sử dụng nhất quán từ scan hardening + segmentation (không tạo source of truth song song).
- [x] [Completed] Snapshot capability đủ dùng cho thao tác có side effect bounded.
- [x] [Completed] Restore-light/rollback-light có giới hạn hỗ trợ và tuyên bố rõ giới hạn.
- [x] [Completed] Temp workspace/isolated target handling có lifecycle, TTL/stale policy, cleanup path rõ.
- [x] [Completed] Bounded apply policy rõ surfaces cho phép + conflict/failure handling + parity dry_run/execute.
- [x] [Completed] Execution report chuẩn hóa được preflight/apply/outcome/warnings/recommended next action.
- [x] [Completed] Maintenance utilities dùng được cho list/inspect/prune artifacts vận hành.
- [x] [Completed] Optional worktree wrapper (nếu implement) vẫn là adapter mỏng, không làm DH drift thành VCS platform.
- [x] [Completed] Tài liệu vận hành phản ánh đúng bản chất “operator-safe bounded layer”, không over-claim.

---

## 4) Status legend và protocol cập nhật

### Legend bắt buộc
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Protocol cập nhật
1. Khi bắt đầu một mục: đổi sang `[ ] [In progress]`.
2. Chỉ đổi sang `[x] [Completed]` khi có evidence (PR/commit/file/test/log/tài liệu).
3. Nếu kẹt > 1 session hoặc thiếu phụ thuộc: đổi `[ ] [Blocked]`, ghi rõ blocker, owner, ETA, workaround.
4. Mỗi lần cập nhật phase phải thêm entry vào Progress Log.
5. Không mở rộng scope ngoài checklist này nếu chưa có quyết định chương trình.

---

## 5) Workstreams/Phases cấp chương trình

> Lưu ý: Đây là checklist chương trình từ trạng thái hiện tại đi tiếp. Các mục nền tảng đã hoàn tất được ghi nhận nhưng không tái triển khai lại.

### Phase 0 — Program alignment & baseline lock
- [x] [Completed] Xác nhận current assets đã có: scan hardening, segmentation, preflight slice.
- [x] [Completed] Chốt nguyên tắc chống drift: DH không mở rộng thành full VCS/worktree platform.
- [x] [Completed] Chốt owner chương trình, cadence review, và format báo cáo tiến độ thống nhất.
- [x] [Completed] Chốt danh sách operation ưu tiên đưa vào bounded execution wave đầu.

### Phase 1 — Contract and boundary freeze
- [x] [Completed] Freeze vocabulary chương trình: operation intent, risk class, mode semantics, reason/warning codes.
- [x] [Completed] Chuẩn hóa mapping từ workspace truth -> operation context (không duplicate model).
- [x] [Completed] Phân tách rõ advisory-only checks vs execution-gating checks.
- [x] [Completed] Chốt operation catalog được support trong bounded layer (và danh sách không support).
- [x] [Completed] Freeze schema contracts trong shared types để runtime/diagnostics cùng consume.

### Phase 2 — Snapshot and restore-light foundations
- [x] [Completed] Thiết kế snapshot manifest tối thiểu (metadata đủ cho debug và rollback-light).
- [x] [Completed] Triển khai capture snapshot trước apply cho operation có side effect.
- [x] [Completed] Định nghĩa restore-light/rollback-light contract theo khả năng bounded thực tế.
- [x] [Completed] Chuẩn hóa failure class khi snapshot thất bại (prepare failure) và hành động tiếp theo.
- [x] [Completed] Viết guideline operator: khi nào snapshot bắt buộc, khi nào có thể skip.

### Phase 3 — Temp workspace / isolated target handling
- [x] [Completed] Thiết kế abstraction temp workspace/staging area (không bắt buộc dùng git worktree).
- [x] [Completed] Triển khai lifecycle create -> use -> cleanup cho temp areas.
- [x] [Completed] Thêm TTL/stale detection policy cho artifacts tạm.
- [x] [Completed] Ràng buộc boundary/path policy khi thao tác trên isolated target.
- [x] [Completed] Bổ sung guardrails tránh leak dữ liệu hoặc side effect ngoài vùng cho phép.

### Phase 4 — Bounded apply execution helpers
- [x] [Completed] Xây bounded apply helper theo surface allowlist/policy.
- [x] [Completed] Thiết kế parity giữa `dry_run` và `execute` trên cùng contract.
- [x] [Completed] Chuẩn hóa conflict handling và failure handling cho apply.
- [x] [Completed] Capture apply metadata đủ dùng cho rollback-light/reporting.
- [x] [Completed] Chặn bypass callsite: jobs/commands phải đi qua operator-safe gateway.

### Phase 5 — Execution reporting / operator summaries
- [x] [Completed] Chốt execution report schema thống nhất (preflight/snapshot/apply/outcome/warnings).
- [x] [Completed] Tạo operator summary dạng ngắn gọn, hành động được (recommended next action).
- [x] [Completed] Tích hợp diagnostics/debug surfaces để consume report thay vì tạo contract riêng.
- [x] [Completed] Chuẩn hóa classification lỗi: preflight failure / prepare failure / apply failure / cleanup failure / rollback-degraded.
- [x] [Completed] Bảo đảm report hữu ích cho audit và điều tra session gần nhất.

### Phase 6 — Maintenance utilities
- [x] [Completed] Utility list/inspect temp workspaces.
- [x] [Completed] Utility inspect snapshot metadata gần nhất.
- [x] [Completed] Utility prune stale temp/snapshot/execution artifacts theo policy.
- [x] [Completed] Utility hỗ trợ recovery hygiene sau failure dang dở.
- [x] [Completed] Tài liệu runbook maintenance định kỳ cho operator.

### Phase 7 — Optional worktree wrapper decision point (Go/No-Go)
- [x] [Completed] Xác định tiêu chí quyết định (giá trị isolation, chi phí vận hành, rủi ro scope creep).
- [x] [Completed] Đánh giá khoảng trống còn lại sau Phase 1-6 (temp workspace đã đủ hay chưa).
- [x] [Completed] Ra quyết định chính thức:
  - [x] [Completed] **No-Go:** giữ temp workspace nội bộ là mặc định lâu dài.
  - [ ] [Not started] **Go có điều kiện:** implement wrapper mỏng, optional, dùng chung lifecycle/reporting, không branch-platform.
- [x] [Completed] Nếu Go: chốt guardrails chống drift parity VCS/worktree.

### Phase 8 — Validation and closure
- [x] [Completed] Validation end-to-end cho ít nhất 1 luồng thành công đầy đủ (preflight -> snapshot -> apply -> report -> cleanup).
- [x] [Completed] Validation cho các failure path chính + rollback-light/degraded paths.
- [x] [Completed] Xác nhận maintenance utilities xử lý được stale artifacts trong môi trường thật.
- [x] [Completed] Đối chiếu toàn bộ DoD chương trình và đánh dấu Completed từng mục.
- [x] [Completed] Chốt báo cáo đóng chương trình + khuyến nghị wave kế tiếp (nếu có).

---

## 6) Ghi chú phụ thuộc và sequencing

### Chuỗi phụ thuộc bắt buộc
1. Phase 1 (contract freeze) phải xong trước khi mở rộng apply/report rộng.
2. Phase 2 (snapshot) + Phase 4 (apply metadata) là điều kiện cần để rollback-light có ý nghĩa.
3. Phase 5 (report schema) phải ổn định trước khi mở rộng diagnostics/maintenance sâu.
4. Phase 6 nên bám artifacts thật; không thiết kế maintenance quá xa thực tế runtime.
5. Phase 7 (optional worktree wrapper) chỉ xem xét sau khi Phase 1-6 ổn định.

### Anti-pattern cần tránh
- Nhảy thẳng vào worktree wrapper trước khi có execution envelope nội bộ.
- Mở operation catalog quá nhanh khi risk classification chưa freeze.
- Cho phép callsite bypass gateway vì “tiện”.
- Đổi semantics mode giữa packages gây contract drift.

---

## 7) Risks / tradeoffs watchlist

- [ ] [In progress] **Scope creep thành VCS/worktree platform parity**  
  Mitigation: khóa out-of-scope, review mọi đề xuất theo tiêu chí bounded operator-safe.

- [ ] [In progress] **Quá mỏng (chỉ preflight, không execution story)**  
  Mitigation: ưu tiên hoàn tất Phase 2-5 như lõi bắt buộc.

- [ ] [In progress] **Contract drift giữa shared/runtime/diagnostics**  
  Mitigation: shared schema là source chung; diagnostics chỉ consume.

- [ ] [In progress] **Maintenance debt do artifacts tạm tăng dần**  
  Mitigation: Phase 6 là bắt buộc, không coi là nice-to-have.

- [ ] [In progress] **Tradeoff safety vs ergonomics**  
  Mitigation: risk-tiering rõ + explainability + recommended actions cụ thể.

- [ ] [In progress] **Tradeoff temp workspace nội bộ vs optional worktree wrapper**  
  Mitigation: mặc định temp workspace; worktree wrapper chỉ bật khi justified rõ.

---

## 8) Progress log template (dùng cho cập nhật định kỳ)

```md
### Progress Update — YYYY-MM-DD HH:mm
- Session owner:
- Phase:
- Trạng thái tổng quan: [ ] [Not started] / [ ] [In progress] / [x] [Completed] / [ ] [Blocked]

#### Việc hoàn tất trong phiên
- [x] [Completed] ...
- Evidence:
  - <file/PR/log/link>

#### Việc đang làm
- [ ] [In progress] ...

#### Blockers
- [ ] [Blocked] <mô tả blocker>
  - Owner:
  - ETA:
  - Workaround:

#### Việc tiếp theo (ưu tiên)
1.
2.
3.

#### Nhắc lại anti-drift
- Xác nhận: không mở rộng sang parity VCS/worktree platform.

---

### Progress Update — 2026-04-13 22:00
- Session owner: FullstackAgent
- Phase: Post-review remediation
- Trạng thái tổng quan: [x] [Completed]

#### Việc hoàn tất trong phiên
- [x] [Completed] Sửa finding quan trọng: tách rõ rollback unavailable khỏi rollback degraded để execute delegated flow báo cáo `succeeded`/`none` khi preflight+apply path thành công.
- [x] [Completed] Bổ sung runtime guard low-risk cho `operation_not_supported` để reason code có thể được emit đúng contract.
- [x] [Completed] Điều chỉnh thứ tự recommendation: ưu tiên `add_workspace_marker` trước `idempotentSkip` nhằm giảm shadow không mong muốn.
- [x] [Completed] Bổ sung test regression cho 3 finding ở `operator-safe-project-worktree-utils.test.ts`.
- Evidence:
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-rollback-light.ts`
  - `packages/shared/src/types/operator-worktree.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
  - `npm run check`
  - `npm test -- packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
  - `npm test -- packages/runtime/src/jobs/index-job-runner.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`

#### Việc đang làm
- [ ] [In progress] Theo dõi thêm telemetry thực tế để xác nhận không có consumer nào phụ thuộc ngầm vào behavior cũ của rollback degraded.

#### Blockers
- [ ] [Blocked] Không có blocker mở trong phiên remediation.
  - Owner: N/A
  - ETA: N/A
  - Workaround: N/A

#### Việc tiếp theo (ưu tiên)
1. Theo dõi report outcome distribution sau khi merge review-fix.
2. Nếu mở rộng operation catalog, giữ nguyên guard `operation_not_supported` theo cùng pattern.
3. Duy trì bounded scope; không mở wrapper/VCS behavior ngoài quyết định No-Go hiện tại.

#### Nhắc lại anti-drift
- Xác nhận: không mở rộng sang parity VCS/worktree platform.
```

---

## 9) Resume quick-start (để tiếp tục trong <5 phút)

1. Mở `docs/opencode/operator-safe-project-worktree-master-plan-dh.md` để nạp lại bức tranh capability map tổng thể.
2. Mở checklist này, tìm các mục đang `[ ] [In progress]` hoặc `[ ] [Blocked]` gần nhất.
3. Kiểm tra Progress Update cuối cùng để biết owner trước đã dừng ở đâu.
4. Xác nhận điều kiện phụ thuộc phase trước đã đủ chưa (đặc biệt Phase 1 trước Phase 4/5).
5. Thực thi theo thứ tự: **Contract freeze -> Snapshot/Temp -> Bounded apply -> Report -> Maintenance -> Decision optional wrapper -> Validation/closure**.
6. Cập nhật ngay status + evidence sau mỗi nhóm thay đổi; không để dồn cuối phiên.
7. Kết phiên bắt buộc thêm một Progress Update mới.

---

## 10) Program status snapshot (cập nhật)

- Trạng thái chương trình hiện tại: `[x] [Completed]`
- Các năng lực nền đã xong: scan hardening, segmentation, operator-safe preflight.
- Trọng tâm từ đây: vận hành ổn định, quan sát artifact hygiene, và mở rộng operation catalog theo bounded policy khi được phê duyệt.
- Ràng buộc chiến lược: DH giữ vai trò operator-safe bounded layer; **không drift thành full VCS/worktree platform parity**.

---

### Progress Update — 2026-04-13 21:40
- Session owner: FullstackAgent
- Phase: 0-8 (program completion pass)
- Trạng thái tổng quan: [x] [Completed]

#### Việc hoàn tất trong phiên
- [x] [Completed] Hoàn tất contract freeze + execution lifecycle xuyên suốt preflight -> prepare -> apply -> report -> rollback-light/cleanup.
- [x] [Completed] Bổ sung snapshot artifacts, temp workspace lifecycle, bounded apply parity semantics, rollback-light bounded contract.
- [x] [Completed] Chuẩn hóa execution report + tích hợp vào index job diagnostics và debug dump.
- [x] [Completed] Bổ sung maintenance utilities list/prune artifacts + runbook vận hành.
- [x] [Completed] Chốt quyết định Optional Worktree Wrapper = No-Go trong phase hiện tại.
- Evidence:
  - `packages/shared/src/types/operator-worktree.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`
  - `packages/runtime/src/workspace/operator-safe-temp-workspace.ts`
  - `packages/runtime/src/workspace/operator-safe-bounded-apply.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-rollback-light.ts`
  - `packages/runtime/src/workspace/operator-safe-execution-report.ts`
  - `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - `docs/operations/operator-safe-project-worktree-maintenance-runbook.md`
  - `docs/adr/2026-04-13-operator-safe-worktree-wrapper-no-go-dh.md`

#### Việc đang làm
- [ ] [In progress] Theo dõi post-closure telemetry để quyết định có cần mở bounded operation wave mới hay không.

#### Blockers
- [ ] [Blocked] Không có blocker runtime/code-level trong phiên này.
  - Owner: N/A
  - ETA: N/A
  - Workaround: N/A

#### Việc tiếp theo (ưu tiên)
1. Theo dõi artifacts report/snapshot/temp theo cadence maintenance runbook.
2. Nếu mở operation mới ngoài `index_workspace`, phải đi qua cùng gateway + report contract.
3. Chỉ mở lại quyết định worktree wrapper khi có gap isolation lặp lại và đo được.

#### Nhắc lại anti-drift
- Xác nhận: không mở rộng sang parity VCS/worktree platform.
