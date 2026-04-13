# Scope Package: Extension State Observability / Drift Reporting (DH)

**Date:** 2026-04-13  
**Owner:** DH runtime / orchestration team  
**Execution driver:** `docs/opencode/extension-state-observability-drift-reporting-analysis-dh.md`

---

## Problem Statement

DH đã hoàn tất minimal extension contracts và minimal extension runtime-state/fingerprint persistence. Tuy nhiên operator vẫn thiếu một lớp quan sát tập trung để trả lời nhanh:

- extension nào đang drift,
- drift xuất hiện ở mức nào (`first/same/updated`),
- drift đó có thể được kiểm tra qua diagnostics/reporting theo cách ổn định.

Bài toán cần giải là **bổ sung khả năng query/report/inspection cho extension runtime state hiện có**, không mở rộng sang plugin platform parity hay metadata platform diện rộng.

---

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Runtime state foundation | Đã có fingerprint + runtime state store + touch logic | Giữ nguyên nền tảng này, không tái thiết kế |
| Operator observability | Chưa có drift reporting layer rõ ràng, dễ dùng | Có drift report summary và inspection path rõ cho operator |
| Diagnostics integration | `debug-dump` chưa là điểm vào chuẩn cho extension drift insight | `debug-dump` có phần extension-state drift summary có cấu trúc |
| Enforcement visibility | Enforcement có thể touch state nhưng chưa chuẩn hóa insight report | Enforcement có surface additive cho insight drift (không đổi policy) |
| Scope boundary | Có nguy cơ trượt sang metadata/platform expansion | Giới hạn chặt: observability/query/reporting only |

---

## In Scope

1. Định nghĩa payload/report model tối thiểu cho extension state observability.
2. Bổ sung drift summary/inspection logic dựa trên runtime-state data đã tồn tại.
3. Tích hợp drift report vào bề mặt diagnostics phù hợp (`debug-dump` là ưu tiên).
4. Tích hợp visibility additive tại execution boundary phù hợp (ví dụ enforcement reporting).
5. Bảo đảm failure handling có kiểm soát khi store unreadable/malformed.
6. Validation cho độ đúng report và compatibility không phá luồng hiện tại.

---

## Out of Scope

- Mở rộng plugin platform parity.
- Xây mới hoặc mở rộng metadata management platform diện rộng.
- Dynamic plugin discovery/install/publish/distribution.
- Đổi semantics planner/executor policy dựa trên drift.
- Bổ sung state category mới ngoài `first/same/updated`.
- Refactor lớn không phục vụ trực tiếp observability/drift reporting.

---

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | Scope giữ đúng observability/drift-reporting-only | Tài liệu/thiết kế/implementation không yêu cầu plugin platform parity hoặc metadata subsystem expansion |
| AC-2 | Có report model tối thiểu cho operator | Có định nghĩa report payload rõ (aggregate + per-extension mức cần thiết) |
| AC-3 | Drift report lấy dữ liệu từ runtime-state nền hiện hữu | Không tạo nguồn dữ liệu song song; dùng store/touch/fingerprint surfaces hiện có |
| AC-4 | Diagnostics có thể hiển thị drift summary | `debug-dump` hoặc diagnostics output tương đương có phần extension drift rõ ràng |
| AC-5 | Enforcement visibility là additive | Không thay đổi quyết định routing core; chỉ thêm quan sát/report |
| AC-6 | Failure path được xử lý bounded | Khi store lỗi/malformed, luồng chính không fail hard; operator vẫn thấy warning hợp lệ |
| AC-7 | Validation bao phủ drift-report correctness | Có test/check cho aggregate counts, per-extension state view, edge cases malformed/missing store |
| AC-8 | Compatibility boundary được giữ | Không phá backward compatibility quan trọng ở runtime/executor surfaces |

---

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| False drift từ fingerprint input không ổn định | Làm giảm độ tin cậy report | Tái sử dụng quy tắc fingerprint ổn định đã có; tránh input transient |
| Drift report bị dùng sai mục đích như policy signal | Có thể làm lệch semantics routing | Tài liệu + naming + code boundary rõ: report chỉ quan sát |
| Scope creep sang metadata platform | Vượt phạm vi slice và tăng chi phí | Review gate bám chặt out-of-scope |
| Output quá nhiều gây nhiễu operator | Khó dùng trong vận hành | Mặc định summary gọn, chi tiết bật theo diagnostics context |

### Assumptions

1. Nền runtime-state/fingerprint persistence đã tồn tại và dùng được.
2. Các bề mặt sau là anchor chính cho slice:  
   - `packages/runtime/src/extensions/extension-fingerprint.ts`  
   - `packages/runtime/src/extensions/extension-runtime-state-store.ts`  
   - `packages/runtime/src/extensions/touch-extension-state.ts`  
   - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`  
   - `packages/runtime/src/diagnostics/debug-dump.ts`
3. Slice này ưu tiên insight vận hành, không phải mở rộng domain extension platform.

---

## Sequencing Expectations

### Required order

1. **Phase 0 — Scope freeze**: khóa rõ observability-only và drift-reporting boundary.
2. **Phase 1 — Report model**: định nghĩa schema/report contract hẹp.
3. **Phase 2 — Report builder**: dựng logic tổng hợp drift từ state hiện có.
4. **Phase 3 — Diagnostics integration**: surfacing vào `debug-dump`.
5. **Phase 4 — Enforcement additive visibility**: gắn insight ở execution/report boundary.
6. **Phase 5 — Validation closure**: kiểm chứng correctness, compatibility, bounded failure behavior.

### Hard sequencing rules

- Không mở rộng plugin metadata platform trong lúc làm drift reporting.
- Không biến drift report thành policy gate ở planner/executor.
- Không claim complete nếu thiếu evidence cho diagnostics visibility và failure degrade behavior.
