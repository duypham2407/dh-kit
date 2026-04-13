# Checklist triển khai: Operator-safe Project/Worktree Utility Slice (DH)

**Ngày tạo:** 2026-04-12  
**Nguồn chuẩn:**
- `docs/opencode/operator-safe-project-worktree-utility-slice-analysis-dh.md`
- `docs/scope/2026-04-12-operator-safe-project-worktree-utility-slice-dh.md`
- `docs/solution/2026-04-12-operator-safe-project-worktree-utility-slice-dh.md`

---

## 1) Objective and scope

### Objective
Tạo utility bounded giúp operator thao tác project/worktree an toàn và dễ điều tra: có preflight rõ, dry-run rõ, kết quả giải thích được.

### Scope
- Chuẩn hóa contract utility (input/mode/result/reason).
- Triển khai checks an toàn cốt lõi (path/boundary/capability/idempotency tối thiểu).
- Tích hợp hẹp vào runtime surfaces liên quan.
- Cập nhật diagnostics và tài liệu hướng dẫn thực thi slice.

### Out-of-scope nhắc lại
- Full worktree/project subsystem parity.
- Broad VCS management system.
- Marketplace/automation platform cho repo/worktree.

---

## 2) Current vs target state

### Current
- Có scan/workspace hardening và segmentation.
- Có runtime index flow + diagnostics/debug dump.
- Chưa có module utility operator-safe project/worktree chuẩn hoá dùng chung.

### Target
- Có utility module bounded cho preflight + dry-run + execute-light.
- `check` là **advisory-only assessment** (không implicit abort trong `index-job-runner`).
- Có reason codes và envelope output nhất quán cho operator.
- Có integration hẹp với runtime jobs và debug dump để hỗ trợ vận hành.

---

## 3) Definition of Done (DoD)

- [x] [Completed] Contract utility được chốt rõ (mode/input/output/reason codes).
  - Evidence: file types/contracts + docs reference.
- [x] [Completed] Module utility operator-safe project/worktree được thêm với preflight checks bounded.
  - Evidence: module file + unit/manual verification notes.
- [x] [Completed] Runtime integration tại `index-job-runner.ts` hoàn tất mà không phá flow hiện có.
  - Evidence: diagnostics output trước/sau + test/manual evidence.
- [x] [Completed] `debug-dump.ts` có summary hẹp cho operator-safe checks.
  - Evidence: dump sample và field mapping.
- [x] [Completed] Validation đủ cho allow/block/dry-run/compatibility cases.
  - Evidence: test logs hoặc manual evidence có timestamp.
- [x] [Completed] Docs checklist/progress log được cập nhật đầy đủ, tuyên bố rõ bounded scope.
  - Evidence: docs đã cập nhật + nội dung out-of-scope rõ ràng.

---

## 4) Status legend / update protocol

### Legend
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Update protocol
1. Bắt đầu mục -> chuyển sang `[ ] [In progress]`.
2. Hoàn tất -> chuyển `[x] [Completed]` và ghi evidence ngay dưới mục.
3. Bị kẹt > 30 phút -> đổi `[ ] [Blocked]`, ghi nguyên nhân/owner/ETA.
4. Không đánh Completed nếu chưa có evidence.
5. Cuối mỗi session phải thêm một Progress Update.

---

## 5) Phases / workstreams

### Phase 0 — Scope & contract freeze
- [x] [Completed] Chốt utility-only boundary (không parity subsystem).
- [x] [Completed] Chốt operation list được hỗ trợ trong slice.
- [x] [Completed] Chốt mode `check/dry_run/execute`.
- [x] [Completed] Chốt reason code taxonomy.

### Phase 1 — Utility core implementation
- [x] [Completed] Tạo module utility operator-safe project/worktree.
- [x] [Completed] Triển khai canonical path + boundary checks.
- [x] [Completed] Triển khai marker/VCS capability preflight tối thiểu.
- [x] [Completed] Triển khai idempotency guard cơ bản.
- [x] [Completed] Trả về result envelope chuẩn.

### Phase 2 — Runtime integration hẹp
- [x] [Completed] Tích hợp preflight utility vào `index-job-runner.ts`.
- [x] [Completed] Kiểm soát fallback/fail-safe behavior khi check không đạt.
- [x] [Completed] Mở rộng `debug-dump.ts` với summary bounded.

### Phase 3 — Validation & closure
- [x] [Completed] Validate allow case trong boundary hợp lệ.
- [x] [Completed] Validate block case ngoài boundary/context sai.
- [x] [Completed] Validate dry-run không side effect.
- [x] [Completed] Validate runtime compatibility (không regression index flow).
- [x] [Completed] Chốt docs/evidence/handoff notes.

---

## 6) Detailed checklist items

### 6.1 Contract & types
- [x] [Completed] Định nghĩa input type cho operation target.
- [x] [Completed] Định nghĩa output envelope (`allowed/warnings/blockingReasons/recommendedAction`).
- [x] [Completed] Định nghĩa reason code list ổn định (machine-readable).
- [x] [Completed] Định nghĩa mode semantics (`check`, `dry_run`, `execute`).
  - Ghi chú: `check` = advisory-only, `dry_run` = preview/decision surface, `execute` = enforceable path.

### 6.2 Safety checks
- [x] [Completed] Canonicalization path bắt buộc trước mọi check.
- [x] [Completed] Boundary validation chống thao tác ngoài root cho phép.
- [x] [Completed] Capability check (marker/VCS availability) theo ngữ cảnh.
- [x] [Completed] Idempotency guard cho thao tác lặp.

### 6.3 Runtime integration
- [x] [Completed] Xác định điểm chèn preflight trong `index-job-runner.ts`.
- [x] [Completed] Chuẩn hoá hành vi khi blocked (không crash, có diagnostics rõ).
- [x] [Completed] Mapping kết quả utility vào diagnostics summary runtime.
- [x] [Completed] Đảm bảo `mode: check` không implicit abort trong `index-job-runner.ts`.

### 6.4 Diagnostics/debug support
- [x] [Completed] Bổ sung phần summary operator-safe vào debug dump type.
- [x] [Completed] Giữ payload nhẹ (không ghi full raw event stream).
- [x] [Completed] Bảo đảm backward compatibility của dump fields cũ.

### 6.5 Validation evidence
- [x] [Completed] Evidence cho path hợp lệ được allow.
- [x] [Completed] Evidence cho path ngoài boundary bị block.
- [x] [Completed] Evidence cho dry-run output có recommendedAction.
- [x] [Completed] Evidence cho runtime flow không regression sau integration.

---

## 7) Dependencies / sequencing notes

1. Contract freeze bắt buộc hoàn tất trước khi sửa nhiều callsite runtime.
2. Utility core phải xong trước runtime integration.
3. Debug dump update nên làm sau khi result envelope ổn định.
4. Nếu phát sinh nhu cầu beyond utility scope, phải tạo follow-on scope mới thay vì mở rộng trong slice này.

---

## 8) Risks / watchouts

- [x] [Completed] Scope creep sang full worktree lifecycle management.
  - Mitigation: giữ strict out-of-scope, chặn yêu cầu ngoài operation list.
- [x] [Completed] False-positive block gây cản trở operator.
  - Mitigation: reason code rõ + cho phép dry-run để giải thích.
- [x] [Completed] False-negative allow gây rủi ro boundary.
  - Mitigation: default deny khi không xác nhận được context an toàn.
- [x] [Completed] Debug dump quá nặng.
  - Mitigation: chỉ summary bounded + limit field.
- [x] [Completed] Drift contract giữa docs và code.
  - Mitigation: cập nhật docs cùng PR/slice và trace rõ evidence.

---

## 9) Progress log template

```md
### Progress Update — YYYY-MM-DD HH:mm
- Session owner:
- Phase đang làm:
- Trạng thái tổng quan: [ ] [Not started] / [ ] [In progress] / [x] [Completed] / [ ] [Blocked]

#### Việc đã hoàn thành
- [x] [Completed] ...
- Evidence:
  - <file/test/log/link>

#### Việc đang làm
- [ ] [In progress] ...

#### Blockers
- [ ] [Blocked] <mô tả>
  - Owner:
  - ETA:
  - Workaround:

#### Việc tiếp theo (ưu tiên)
1.
2.
3.
```

---

## 10) Resume quick-start

1. Đọc nhanh analysis/scope/solution của slice này.
2. Mở checklist, xác định mục `In progress` hoặc `Blocked` gần nhất.
3. Xác nhận contract freeze đã xong chưa; nếu chưa, không nhảy vào integration.
4. Làm theo thứ tự: utility core -> runtime integration -> debug summary -> validation.
5. Sau mỗi nhóm thay đổi, cập nhật checklist + evidence ngay.
6. Kết thúc session: thêm Progress Update để người sau resume trong <5 phút.

---

### Progress Update — 2026-04-13 01:42
- Session owner: Fullstack Agent
- Phase đang làm: Phase 3 — Validation & closure
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Bổ sung contract bounded operator-safe utility (mode/result/reason codes).
- [x] [Completed] Triển khai utility preflight checks cho canonical path, workspace boundary, capability/VCS tối thiểu, idempotency guard.
- [x] [Completed] Tích hợp utility hẹp vào `index-job-runner.ts` và `debug-dump.ts`.
- [x] [Completed] Bổ sung và cập nhật tests cho utility + runtime integration.
- [x] [Completed] Chạy typecheck + test pass.
- Evidence:
  - `packages/shared/src/types/operator-worktree.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/runtime/src/jobs/index-job-runner.test.ts`
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - `packages/runtime/src/diagnostics/audit-query-service.test.ts`
  - Command: `npm run check`
  - Command: `npm run test -- packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts packages/runtime/src/jobs/index-job-runner.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`

#### Việc đang làm
- [x] [Completed] Cập nhật checklist/progress/evidence cho handoff.

#### Blockers
- [ ] [Blocked] Không có blocker trong phạm vi scope đã phê duyệt.

#### Việc tiếp theo (ưu tiên)
1. Code review tập trung vào reason-code stability và integration diagnostics.
2. QA chạy smoke `debug-dump` trên repo thực tế có dữ liệu lớn.
3. Nếu cần thêm operation ngoài `index_workspace`, mở follow-on scope riêng.

### Progress Update — 2026-04-13 02:03
- Session owner: Fullstack Agent
- Phase đang làm: Review fixes alignment (post Solution Lead decision)
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Tách rõ warning code cho case thiếu marker: `workspace_missing_markers` (không còn ambiguity với `partial_workspace_scan`).
- [x] [Completed] Sửa recommendation logic để nhánh marker-warning reachable và đúng.
- [x] [Completed] Loại bỏ dead-contract mismatch: bỏ `target_not_absolute` khỏi reason-code set vì không dùng ở runtime check hiện tại.
- [x] [Completed] Tránh scan universe mismatch: utility nhận `knownWorkspaces` và `index-job-runner` truyền luôn workspaces đã scan.
- [x] [Completed] Căn chỉnh rõ semantics theo quyết định mới: `mode: check` advisory-only (không implicit abort trong index runner).
- [x] [Completed] Bổ sung tests liên quan review findings.
- Evidence:
  - `packages/shared/src/types/operator-worktree.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/runtime/src/jobs/index-job-runner.test.ts`
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - Command: `npm run check`
  - Command: `npm run test -- packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts packages/runtime/src/jobs/index-job-runner.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`

#### Việc đang làm
- [x] [Completed] Cập nhật checklist wording để phản ánh `check` advisory-only.

#### Blockers
- [ ] [Blocked] Không có blocker mới trong phạm vi review fixes.

#### Việc tiếp theo (ưu tiên)
1. Code review xác nhận naming/reason-code stability của contract mới.
2. QA smoke trên repo có workspace markers phức hợp để xác nhận advisory signals.
