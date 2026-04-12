# Phân tích slice: Operator-safe Project/Worktree Utility (DH)

**Ngày:** 2026-04-12  
**Mục tiêu:** Đề xuất slice follow-on hẹp, thực dụng, tập trung utility hỗ trợ operator cho thao tác project/worktree an toàn trong DH.

---

## 1) Vì sao đây là hướng tiếp theo hợp lý

DH đã hoàn thành các lớp nền quan trọng gần đây:

- hardening scan project/workspace,
- marker-driven multi-workspace segmentation,
- semantic retrieval hardening,
- observability/audit query layer.

Nghĩa là DH đã làm tốt phần **nhìn thấy** và **hiểu cấu trúc** workspace, nhưng còn thiếu một lớp utility vận hành nhỏ giúp operator thao tác project/worktree an toàn, nhất quán, và có guardrail rõ ràng.

Slice tiếp theo hợp lý là bổ sung **operator-safe utility** (kiểm tra trước thao tác, chuẩn hoá path/root, dry-run, chuẩn output), thay vì mở rộng thêm subsystem lớn.

---

## 2) Current DH state và operator-safety gap cụ thể

### 2.1 Current state (factual)

- `packages/intelligence/src/workspace/detect-projects.ts`
  - đã có canonicalize path, kiểm soát boundary (`isPathWithinWorkspace`), marker-driven workspace discovery.
- `packages/runtime/src/jobs/index-job-runner.ts`
  - đã dùng `detectProjects(...)`, có diagnostics workspaceCoverage/partialScan/stopReason.
- `packages/runtime/src/diagnostics/debug-dump.ts`
  - đã có dump runtime + audit inspection.

### 2.2 Gap operator-safety hiện tại

DH chưa có utility project/worktree chuyên cho operator với các ràng buộc an toàn sau ở mức module dùng chung:

1. **Preflight validation tập trung** cho thao tác repo/worktree (đường dẫn hợp lệ, nằm trong boundary cho phép, trạng thái VCS khả dụng).
2. **Chuẩn hoá operation intent** (ví dụ check/preview/action) trước khi runtime job hoặc command lớp trên gọi xuống.
3. **Dry-run + explainability** cho thao tác có rủi ro vừa (ví dụ thay đổi target root/worktree context).
4. **Chuẩn hoá error taxonomy/operator message** để điều tra nhanh (thay vì lỗi rời rạc theo từng callsite).
5. **Bounded helper API** để tránh callsite tự dựng logic shell/VCS tùy biến.

---

## 3) Ý tưởng nào đáng mượn hẹp từ upstream project/worktree surfaces

Nguồn tham chiếu giới hạn:

- `/Users/duypham/Code/opencode/packages/opencode/src/worktree/index.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/project/project.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/project/vcs.ts`

Các ý tưởng đáng mượn **chọn lọc**:

1. **Explicit input contract cho operation**
   - upstream dùng schema rõ cho Create/Remove/Reset input.
   - DH nên mượn tinh thần “input có shape rõ + validate sớm”, nhưng áp dụng bản nhỏ cho utility preflight.

2. **Error type rõ theo loại failure**
   - upstream có nhóm lỗi `NotGit`, `CreateFailed`, `RemoveFailed`...
   - DH nên mượn mô hình phân nhóm lỗi operator-safe (invalid path, out-of-bound, vcs-unavailable, unsafe-state).

3. **Phân tách preflight vs execute**
   - upstream thể hiện rõ lifecycle prepare/setup/boot.
   - DH nên mượn pattern tách preflight utility trước, chưa cần triển khai full execution orchestration.

4. **VCS awareness ở mức info/diff trạng thái**
   - upstream `project/vcs.ts` cho thấy cách tư duy trạng thái branch/diff.
   - DH chỉ nên mượn mức kiểm tra khả dụng/điều kiện an toàn tối thiểu, không mượn full diff subsystem.

---

## 4) Vì sao DH không nên port full parity project/worktree subsystem

Không nên port full parity ngay vì:

1. **Lệch mục tiêu slice:** mục tiêu hiện tại là utility an toàn cho operator, không phải xây nền tảng worktree lifecycle hoàn chỉnh.
2. **Rủi ro scope creep lớn:** full parity kéo theo branch/worktree lifecycle, sandbox orchestration, event bus sâu, boot flow phức tạp.
3. **Tăng coupling runtime không cần thiết:** DH hiện đã có flow indexing/diagnostics riêng; port sâu có thể làm vỡ ranh giới module hiện tại.
4. **Chi phí verify cao:** full parity cần test matrix VCS/worktree đa tình huống; vượt ngoài follow-on slice bounded.
5. **Không cần thiết cho nhu cầu trước mắt:** operator cần guardrail và helper chuẩn trước, chưa cần nền tảng quản trị worktree đầy đủ.

---

## 5) Recommended narrow path

Đề xuất đường triển khai hẹp:

1. Tạo **project/worktree operator utility module** với các hàm preflight/an toàn.
2. Chuẩn hóa **Operation Mode**: `check` / `dry_run` / `execute` (execute chỉ cho thao tác nhẹ, không quản trị full worktree lifecycle).
3. Chuẩn hóa **safety checks**:
   - canonical path,
   - boundary allowlist,
   - marker/VCS capability check,
   - idempotency guard.
4. Chuẩn hóa **result envelope** cho operator:
   - `allowed`, `warnings`, `blockingReasons`, `recommendedAction`.
5. Tích hợp utility theo điểm chạm hẹp ở runtime surfaces hiện có (index job + debug diagnostics), không mở rộng command system lớn.

---

## 6) Package/module mapping đề xuất

### A) Intelligence layer

- `packages/intelligence/src/workspace/detect-projects.ts`
  - tái sử dụng logic canonical/path boundary làm nền cho utility checks.

### B) Runtime layer

- `packages/runtime/src/jobs/index-job-runner.ts`
  - điểm chạm để gọi preflight utility trước các operation liên quan workspace target.

- `packages/runtime/src/diagnostics/debug-dump.ts`
  - thêm summary rất hẹp về trạng thái operator-safe checks gần nhất (nếu có), phục vụ điều tra.

- (Mới đề xuất) `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - nơi đặt preflight helpers + result envelope chuẩn.

### C) Shared types (nếu cần)

- (Mới đề xuất) `packages/shared/src/types/operator-worktree.ts`
  - định nghĩa type cho input filter/check result để callsite dùng nhất quán.

---

## 7) Proposed phases

### Phase 0 — Scope freeze
- Chốt rõ utility-only, không full lifecycle.
- Chốt danh sách thao tác được phép hỗ trợ trong slice.

### Phase 1 — Safety contract
- Chốt input contract + result envelope + error taxonomy.
- Chốt mode `check/dry_run/execute` và rule khi nào được execute.

### Phase 2 — Utility implementation (bounded)
- Thêm module utility operator-safe.
- Triển khai preflight checks cốt lõi và mapping reason codes.

### Phase 3 — Runtime integration hẹp
- Gắn vào index job runner ở điểm cần preflight.
- Gắn vào debug-dump summary ở mức lightweight.

### Phase 4 — Validation + docs
- Verify case hợp lệ/không hợp lệ/dry-run/blocked.
- Chốt checklist và guidance cho operator.

---

## 8) Risks / watchouts

1. **Scope trượt sang VCS manager đầy đủ** (branch/create/remove/reset).
2. **Over-generalization API** làm utility khó dùng.
3. **Sai boundary checks** dẫn tới false allow/false block.
4. **Thông điệp lỗi không hành động được** cho operator.
5. **Debug output phình to** nếu log quá nhiều chi tiết thao tác.

Mitigation: giữ utility cực hẹp, reason code rõ, default deny với hành động chưa được mô tả rõ, và chỉ xuất diagnostics tóm tắt.

---

## 9) Guiding recommendation

DH nên đi theo hướng:

- **Bounded operator utility slice** cho project/worktree,
- **preflight-first, explainability-first**, 
- **reuse tối đa** path/workspace intelligence đã có,
- **không theo đuổi parity** với upstream worktree/project subsystem.

Mục tiêu của slice là tăng độ an toàn vận hành và tính nhất quán cho operator ngay bây giờ, với rủi ro kiến trúc thấp và khả năng mở rộng có kiểm soát về sau.
