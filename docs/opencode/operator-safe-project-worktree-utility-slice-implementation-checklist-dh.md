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
- Có reason codes và envelope output nhất quán cho operator.
- Có integration hẹp với runtime jobs và debug dump để hỗ trợ vận hành.

---

## 3) Definition of Done (DoD)

- [ ] [Not started] Contract utility được chốt rõ (mode/input/output/reason codes).
  - Evidence: file types/contracts + docs reference.
- [ ] [Not started] Module utility operator-safe project/worktree được thêm với preflight checks bounded.
  - Evidence: module file + unit/manual verification notes.
- [ ] [Not started] Runtime integration tại `index-job-runner.ts` hoàn tất mà không phá flow hiện có.
  - Evidence: diagnostics output trước/sau + test/manual evidence.
- [ ] [Not started] `debug-dump.ts` có summary hẹp cho operator-safe checks.
  - Evidence: dump sample và field mapping.
- [ ] [Not started] Validation đủ cho allow/block/dry-run/compatibility cases.
  - Evidence: test logs hoặc manual evidence có timestamp.
- [ ] [Not started] Docs checklist/progress log được cập nhật đầy đủ, tuyên bố rõ bounded scope.
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
- [ ] [Not started] Chốt utility-only boundary (không parity subsystem).
- [ ] [Not started] Chốt operation list được hỗ trợ trong slice.
- [ ] [Not started] Chốt mode `check/dry_run/execute`.
- [ ] [Not started] Chốt reason code taxonomy.

### Phase 1 — Utility core implementation
- [ ] [Not started] Tạo module utility operator-safe project/worktree.
- [ ] [Not started] Triển khai canonical path + boundary checks.
- [ ] [Not started] Triển khai marker/VCS capability preflight tối thiểu.
- [ ] [Not started] Triển khai idempotency guard cơ bản.
- [ ] [Not started] Trả về result envelope chuẩn.

### Phase 2 — Runtime integration hẹp
- [ ] [Not started] Tích hợp preflight utility vào `index-job-runner.ts`.
- [ ] [Not started] Kiểm soát fallback/fail-safe behavior khi check không đạt.
- [ ] [Not started] Mở rộng `debug-dump.ts` với summary bounded.

### Phase 3 — Validation & closure
- [ ] [Not started] Validate allow case trong boundary hợp lệ.
- [ ] [Not started] Validate block case ngoài boundary/context sai.
- [ ] [Not started] Validate dry-run không side effect.
- [ ] [Not started] Validate runtime compatibility (không regression index flow).
- [ ] [Not started] Chốt docs/evidence/handoff notes.

---

## 6) Detailed checklist items

### 6.1 Contract & types
- [ ] [Not started] Định nghĩa input type cho operation target.
- [ ] [Not started] Định nghĩa output envelope (`allowed/warnings/blockingReasons/recommendedAction`).
- [ ] [Not started] Định nghĩa reason code list ổn định (machine-readable).
- [ ] [Not started] Định nghĩa mode semantics (`check`, `dry_run`, `execute`).

### 6.2 Safety checks
- [ ] [Not started] Canonicalization path bắt buộc trước mọi check.
- [ ] [Not started] Boundary validation chống thao tác ngoài root cho phép.
- [ ] [Not started] Capability check (marker/VCS availability) theo ngữ cảnh.
- [ ] [Not started] Idempotency guard cho thao tác lặp.

### 6.3 Runtime integration
- [ ] [Not started] Xác định điểm chèn preflight trong `index-job-runner.ts`.
- [ ] [Not started] Chuẩn hoá hành vi khi blocked (không crash, có diagnostics rõ).
- [ ] [Not started] Mapping kết quả utility vào diagnostics summary runtime.

### 6.4 Diagnostics/debug support
- [ ] [Not started] Bổ sung phần summary operator-safe vào debug dump type.
- [ ] [Not started] Giữ payload nhẹ (không ghi full raw event stream).
- [ ] [Not started] Bảo đảm backward compatibility của dump fields cũ.

### 6.5 Validation evidence
- [ ] [Not started] Evidence cho path hợp lệ được allow.
- [ ] [Not started] Evidence cho path ngoài boundary bị block.
- [ ] [Not started] Evidence cho dry-run output có recommendedAction.
- [ ] [Not started] Evidence cho runtime flow không regression sau integration.

---

## 7) Dependencies / sequencing notes

1. Contract freeze bắt buộc hoàn tất trước khi sửa nhiều callsite runtime.
2. Utility core phải xong trước runtime integration.
3. Debug dump update nên làm sau khi result envelope ổn định.
4. Nếu phát sinh nhu cầu beyond utility scope, phải tạo follow-on scope mới thay vì mở rộng trong slice này.

---

## 8) Risks / watchouts

- [ ] [Not started] Scope creep sang full worktree lifecycle management.
  - Mitigation: giữ strict out-of-scope, chặn yêu cầu ngoài operation list.
- [ ] [Not started] False-positive block gây cản trở operator.
  - Mitigation: reason code rõ + cho phép dry-run để giải thích.
- [ ] [Not started] False-negative allow gây rủi ro boundary.
  - Mitigation: default deny khi không xác nhận được context an toàn.
- [ ] [Not started] Debug dump quá nặng.
  - Mitigation: chỉ summary bounded + limit field.
- [ ] [Not started] Drift contract giữa docs và code.
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
