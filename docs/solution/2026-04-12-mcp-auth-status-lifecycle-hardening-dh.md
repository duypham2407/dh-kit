# Solution Package: MCP Auth/Status Lifecycle Hardening (DH)

**Ngày:** 2026-04-12  
**Scope tham chiếu:** `docs/scope/2026-04-12-mcp-auth-status-lifecycle-hardening-dh.md`  
**Analysis tham chiếu:** `docs/opencode/mcp-auth-status-lifecycle-hardening-analysis-dh.md`

---

## 1) Architecture decisions

### AD-1: Giữ routing architecture hiện tại, chỉ harden auth/status lifecycle input
- Không đổi vai trò chính của registry/planner/enforcer.
- Bổ sung lifecycle semantics ở lớp auth/status provider để enforcer/planner tiêu thụ ổn định hơn.

### AD-2: Lifecycle model tối thiểu, không full state-machine
- Dùng status vocabulary đang có: `available | degraded | needs_auth | unavailable`.
- Bổ sung metadata lifecycle cần thiết: freshness timestamp/window + transition reason ngắn.
- Không mở rộng thành full OAuth/MCP lifecycle orchestration.

### AD-3: Server-bound identity là boundary bắt buộc
- Mọi auth readiness lookup phải giữ nguyên nguyên tắc gắn MCP + server identity.
- Tránh reuse sai credential context khi endpoint thay đổi.

### AD-4: Unknown/stale signal phải fail-safe
- Khi tín hiệu thiếu hoặc stale: không coi như “healthy available”.
- Ưu tiên warning rõ và fallback/degrade theo policy routing đã harden.

---

## 2) Target files/modules

### Core
- `packages/opencode-app/src/auth/mcp-auth-status.ts`
  - nâng từ helper mỏng thành provider lifecycle tối thiểu.

### Contract liên quan
- `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - bổ sung type metadata lifecycle dùng chung.

### Integration points
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - tiêu thụ lifecycle freshness/status cho quyết định fallback/warning.
- `packages/opencode-app/src/planner/choose-mcps.ts`
  - tiêu thụ tín hiệu tối thiểu cho ranking/rejection khi cần.

### Test surfaces (khi triển khai code)
- test planner/enforcer liên quan status/auth decision path.
- test snapshot/provider cho case stale/missing/fresh.

---

## 3) Phased implementation plan

### Phase 0 — Contract freeze
- Chốt shape lifecycle metadata tối thiểu.
- Chốt policy stale/missing signal và reason mapping.

### Phase 1 — Harden auth/status provider
- Nâng `mcp-auth-status.ts` để tạo lifecycle-aware snapshot.
- Chuẩn hóa server-bound keying và auth readiness derivation.

### Phase 2 — Integrate vào enforcer/planner
- Enforcer áp dụng policy fail-safe cho stale/missing.
- Planner dùng signal lifecycle mức tối thiểu, tránh coupling sâu.

### Phase 3 — Validation & documentation closure
- Validate matrix case trọng tâm.
- Cập nhật evidence/checklist để handoff implementation step kế tiếp.

---

## 4) Validation strategy

Ưu tiên validation theo hành vi routing:

1. **Fresh available** -> route bình thường.
2. **Needs_auth** -> blocked/degrade/fallback đúng policy.
3. **Unavailable** -> fallback có reason rõ.
4. **Stale status** -> warning + xử lý fail-safe.
5. **Missing signal** -> không quyết định mù, có cảnh báo.

Validation output cần chứng minh:
- quyết định cuối cùng nhất quán với lifecycle policy,
- reason/warning đủ để audit.

---

## 5) Compatibility boundaries

1. Không thay đổi mục tiêu MCP routing hardening đã hoàn thành; chỉ tăng độ tin cậy input auth/status.
2. Không introduce full OAuth callback/provider platform.
3. Không mirror toàn bộ upstream MCP manager.
4. Giữ tương thích với selective-port strategy của DH.

---

## 6) Ghi chú phạm vi rõ ràng

**Đây là lifecycle hardening only** cho auth/status phục vụ routing trong DH.

**Không phải** mục tiêu đạt full OAuth/MCP platform parity với upstream trong slice này.
