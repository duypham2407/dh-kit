# Solution Package: Operator-safe Project/Worktree Utility Slice (DH)

**Ngày:** 2026-04-12  
**Scope tham chiếu:** `docs/scope/2026-04-12-operator-safe-project-worktree-utility-slice-dh.md`  
**Analysis tham chiếu:** `docs/opencode/operator-safe-project-worktree-utility-slice-analysis-dh.md`

---

## 1) Architecture decisions

### AD-1: Utility slice bounded, không full platform
- Slice này chỉ xây utility preflight/an toàn cho operator trên thao tác project/worktree.
- Không triển khai full lifecycle subsystem kiểu upstream worktree/project.

### AD-2: Reuse surfaces hiện có, không tạo đường song song
- Tận dụng `detect-projects.ts` và path boundary helpers hiện có.
- Tích hợp vào runtime hiện hữu (`index-job-runner.ts`, `debug-dump.ts`) theo điểm chạm hẹp.

### AD-3: Preflight-first contract
- Mọi operation trong phạm vi slice đi qua preflight check trước.
- `execute` chỉ áp dụng cho thao tác nhẹ đã được allow rõ trong contract.

### AD-3a: `check` là advisory-only, không phải hard gate
- Trong slice này, `mode: "check"` có nhiệm vụ **đánh giá và ghi nhận trạng thái an toàn**, không tự động chặn runtime flow đang tồn tại.
- `allowed=false` ở `check` vẫn phải trả `blockingReasons[]` và `recommendedAction`, nhưng ý nghĩa là **operator advisory / diagnostics signal**, không phải lệnh abort bắt buộc tại mọi callsite.
- Hard blocking chỉ nên được áp dụng khi callsite đang thực sự chuẩn bị quyết định thao tác tiếp theo theo semantics `dry_run` hoặc `execute`.
- Với integration hẹp tại `index-job-runner.ts`, `check` chỉ dùng để làm rõ safety state và định hướng bước tiếp theo; không được đổi slice này thành gate làm fail indexing flow hiện tại chỉ vì preflight báo `allowed=false`.

### AD-4: Explainable result envelope
- Kết quả utility phải có cấu trúc nhất quán cho operator:
  - `allowed`
  - `warnings[]`
  - `blockingReasons[]`
  - `recommendedAction`

### AD-5: Safety by default, bounded diagnostics
- Mặc định chặn thao tác khi thiếu điều kiện an toàn.
- Debug/diagnostics chỉ thêm summary cần thiết, không biến thành event/reporting subsystem mới.

**Làm rõ để tránh hiểu sai:** nguyên tắc “mặc định chặn” áp dụng cho **quyết định thao tác thực thi** trong utility contract, không biến `check` thành enforced stop ở integration runtime hẹp của slice này.

---

## 2) Target files/modules

### Runtime (điểm chính)
- `packages/runtime/src/jobs/index-job-runner.ts`
  - thêm điểm gọi preflight utility trước operation workspace target nhạy cảm.

- `packages/runtime/src/diagnostics/debug-dump.ts`
  - thêm summary nhẹ về trạng thái operator-safe utility checks gần nhất (nếu có).

- **Đề xuất mới:** `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - chứa logic preflight/an toàn + reason code mapping + result envelope.

### Intelligence / workspace support
- `packages/intelligence/src/workspace/detect-projects.ts`
  - tái sử dụng logic canonical/path boundary (không thay đổi nhiệm vụ cốt lõi).

### Shared types (tuỳ chọn nhưng khuyến nghị)
- **Đề xuất mới:** `packages/shared/src/types/operator-worktree.ts`
  - type cho mode/input/result/reason-code để callsite đồng nhất.

---

## 3) Phased implementation plan

### Phase 0 — Contract freeze
1. Chốt danh sách operation được hỗ trợ trong slice (hẹp).
2. Chốt mode vận hành: `check`, `dry_run`, `execute`.
3. Chốt reason codes cho case block/warn.
4. Chốt semantics mode:
   - `check`: advisory-only assessment, không side effects, không tự block runtime flow hiện có.
   - `dry_run`: preview của decision surface; trả về allow/block/warning rõ để operator biết nếu tiếp tục thì điều gì sẽ xảy ra.
   - `execute`: chỉ được tiếp tục khi preflight cho phép trong contract bounded của slice.

### Phase 1 — Utility core
1. Tạo module utility operator-safe project/worktree.
2. Triển khai preflight checks cốt lõi:
   - canonicalize/normalize path,
   - boundary allow,
   - marker/VCS capability tối thiểu,
   - idempotency guard cơ bản.
3. Trả về envelope chuẩn cho operator.

### Phase 2 — Runtime integration (bounded)
1. Gắn preflight utility vào `index-job-runner.ts` ở điểm phù hợp.
2. Đảm bảo behavior không làm vỡ flow indexing hiện tại; `mode: "check"` tại callsite này chỉ ghi nhận diagnostics/advisory, không trở thành hard gate mới.
3. Mở rộng `debug-dump.ts` để phản ánh summary utility checks.

### Phase 3 — Validation + docs closure
1. Validate các case allow/block/dry-run.
2. Validate fail-safe behavior khi thiếu capability hoặc context không hợp lệ.
3. Chốt checklist + evidence + ghi chú vận hành.

---

## 4) Validation strategy

Chiến lược validation ưu tiên hành vi operator-safe:

1. **Allow path**
   - Input hợp lệ trong boundary -> `allowed=true`.

2. **Block path**
    - Input ngoài boundary/không hợp lệ -> `allowed=false`, reason code đúng.
   - Với `mode: "check"`, kết quả này phải được hiểu là advisory signal cho diagnostics/follow-up, không phải implicit abort của runtime flow hiện hữu.

3. **Dry-run explainability**
   - `dry_run` phải trả warning/blocking/recommendedAction rõ ràng, không side effects, và phản ánh decision surface mà callsite có thể dùng để chặn bước thực thi tiếp theo.

4. **Runtime compatibility**
   - `index-job-runner` vẫn trả diagnostics chuẩn, không regression luồng scan/index chỉ vì `check` báo `allowed=false`.

5. **Diagnostics boundedness**
   - `debug-dump` chỉ thêm summary hẹp, không phình payload bất thường.

Ghi chú: nếu repo không có command test/lint thống nhất cho toàn surface, phải ghi manual verification evidence trung thực.

---

## 5) Compatibility boundaries

1. Không thay thế hoặc rewrite `detect-projects` pipeline hiện tại.
2. Không thay đổi lane/workflow contract của DH.
3. Không thêm full VCS/worktree management subsystem.
4. Không thêm marketplace hoặc nền tảng quản trị repo/worktree diện rộng.
5. Không yêu cầu parity với upstream `worktree/index.ts`, `project/project.ts`, `project/vcs.ts`.

---

## 6) Tuyên bố phạm vi rõ ràng

**Đây là bounded operator utility slice only.**

Slice này tập trung vào helper an toàn cho thao tác project/worktree ở mức thực dụng (preflight, dry-run, explainability, integration hẹp).

**Không phải** full worktree platform, không phải hệ thống quản trị VCS rộng, và không bao gồm parity kiến trúc đầy đủ với upstream.
