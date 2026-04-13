# Scope Package: Operator-safe Project/Worktree Utility Slice (DH)

**Ngày:** 2026-04-12  
**Owner:** DH runtime/intelligence team  
**Analysis tham chiếu:** `docs/opencode/operator-safe-project-worktree-utility-slice-analysis-dh.md`

---

## 1) Problem statement

DH đã harden tốt phần scan/segmentation/retrieval/observability, nhưng thiếu lớp utility nhỏ để operator thao tác project/worktree theo cách an toàn, có preflight rõ ràng và output giải thích được.

Hiện nhiều kiểm tra an toàn nằm rải rác theo callsite hoặc chưa chuẩn hóa thành contract dùng chung, làm tăng rủi ro thao tác sai bối cảnh và khó debug khi có incident vận hành.

---

## 2) Current vs target state

| Hạng mục | Current state | Target state (slice này) |
|---|---|---|
| Path/workspace detection | Đã có trong `detect-projects.ts` | Tiếp tục tái sử dụng, không thay thế |
| Index/runtime integration | Có runtime job và diagnostics | Có preflight utility chung trước thao tác liên quan project/worktree |
| Operator-safe contract | Chưa có module utility chuẩn | Có input/result/error contract bounded |
| Explainability | Chưa đồng nhất | Có `allowed/warnings/blockingReasons/recommendedAction` |
| Dry-run behavior | Chưa chuẩn hóa | Có mode `check` / `dry_run` / `execute` giới hạn |

---

## 3) In-scope

1. Định nghĩa contract utility cho thao tác project/worktree theo hướng operator-safe.
2. Triển khai preflight checks hẹp:
   - canonical path,
   - boundary validation,
   - marker/VCS capability check tối thiểu,
   - guard idempotent cơ bản.
3. Chuẩn hóa result envelope cho operator support/debug.
4. Tích hợp điểm chạm hẹp vào runtime surfaces hiện có:
   - `packages/runtime/src/jobs/index-job-runner.ts`
   - `packages/runtime/src/diagnostics/debug-dump.ts`
5. Cập nhật tài liệu/checklist để triển khai và vận hành slice.

---

## 4) Out-of-scope

- Port toàn bộ subsystem worktree/project từ upstream.
- Quản trị full VCS/worktree lifecycle (create/remove/reset branch-worktree orchestration đầy đủ).
- Marketplace/tooling platform cho repo/worktree.
- Hệ thống VCS management diện rộng hoặc command framework mới lớn.
- Thay đổi lớn kiến trúc scan/index hiện tại.

---

## 5) Acceptance criteria

1. Có tài liệu contract rõ cho utility operator-safe (input, mode, output, error/reason codes).
2. Có plan triển khai module utility bounded, reuse logic path/workspace hiện có.
3. Có mô tả tích hợp hẹp vào `index-job-runner.ts` và `debug-dump.ts`.
4. Có chiến lược validation cho các case:
   - valid operation,
   - blocked vì out-of-bound/invalid context,
   - dry-run result,
   - không phá flow runtime hiện có.
5. Có tuyên bố rõ: slice này chỉ là **operator utility bounded**, không phải nền tảng worktree/VCS full parity.

---

## 6) Risks / assumptions

### Risks
- Scope creep sang full worktree platform.
- Rule an toàn quá chặt gây false block cho operator.
- Rule an toàn quá lỏng gây thao tác sai boundary.
- Error/output không đủ rõ để operator hành động.

### Assumptions
- Logic detection/path hardening hiện tại là nền đủ tốt để tái sử dụng.
- Nhu cầu trước mắt là utility vận hành an toàn, không phải feature parity upstream.
- Runtime surfaces liên quan (index-job-runner, debug-dump) là điểm tích hợp đủ cho slice.

---

## 7) Sequencing expectations

1. Freeze scope utility-only và danh sách operation hỗ trợ.
2. Chốt contract + reason codes trước khi code.
3. Triển khai utility module bounded.
4. Tích hợp runtime theo điểm chạm hẹp.
5. Validate behavior + cập nhật docs/checklist.

**Nguyên tắc sequencing:** preflight/an toàn trước, execution sau; tránh mở rộng sang lifecycle management đầy đủ trong cùng slice.
