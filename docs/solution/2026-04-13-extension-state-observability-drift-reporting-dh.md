# Solution Package: Extension State Observability / Drift Reporting (DH)

**Date:** 2026-04-13  
**Approved scope:** `docs/scope/2026-04-13-extension-state-observability-drift-reporting-dh.md`  
**Analysis input:** `docs/opencode/extension-state-observability-drift-reporting-analysis-dh.md`

---

## Solution Intent

Xây lớp **observability/query/reporting** cho extension runtime state đã tồn tại, tập trung vào drift reporting cho operator. Lát cắt này chỉ thêm khả năng nhìn thấy/kiểm tra drift; không thay đổi platform semantics và không mở rộng thành metadata platform.

> **Explicit scope note:** Đây là **extension-state observability only**. Không phải plugin platform parity, không phải mở rộng metadata subsystem.

---

## Architecture Decisions

### AD-1 — Reuse runtime-state foundation, không tạo nguồn dữ liệu song song

Drift reporting phải dựa trên dữ liệu đã tồn tại ở runtime-state store/touch flow:

- `extension-fingerprint.ts`
- `extension-runtime-state-store.ts`
- `touch-extension-state.ts`

Không tạo một persistence pipeline khác chỉ cho reporting.

### AD-2 — Drift report là read-oriented layer

Layer mới chỉ làm tổng hợp/summarize để operator đọc. Không can thiệp vào planner/executor routing decision logic.

### AD-3 — Chuẩn hóa report schema tối thiểu

Đề xuất schema hẹp, đủ dùng:

- `summary`: tổng extension quan sát, counts theo state (`first/same/updated`), timestamp report.
- `extensions[]`: danh sách extension với state hiện tại và fingerprint summary cần thiết.
- `warnings[]`: cảnh báo khi dữ liệu không đầy đủ hoặc store lỗi.

### AD-4 — Diagnostics-first surfacing

`packages/runtime/src/diagnostics/debug-dump.ts` là điểm surfacing operator-facing chính của slice này. Đây là entrypoint tự nhiên cho inspection.

### AD-5 — Enforcement visibility additive

`packages/opencode-app/src/executor/enforce-mcp-routing.ts` chỉ nhận/đính kèm insight drift ở mức additive (audit/report field hoặc warning), không thêm nhánh policy mới.

### AD-6 — Bounded failure behavior

Nếu store unreadable/malformed/unwritable:

- luồng chính không fail hard,
- report trả warning có cấu trúc,
- mức observability degrade rõ ràng.

---

## Target Files / Modules

## Existing anchors (phải dùng)

- `packages/runtime/src/extensions/extension-fingerprint.ts`
- `packages/runtime/src/extensions/extension-runtime-state-store.ts`
- `packages/runtime/src/extensions/touch-extension-state.ts`
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
- `packages/runtime/src/diagnostics/debug-dump.ts`

## Recommended new modules

- `packages/runtime/src/extensions/extension-drift-report.ts`
  - Build drift summary từ runtime state hiện có.
- `packages/runtime/src/extensions/extension-drift-report.test.ts`
  - Test aggregate + edge cases.

## Likely touched diagnostics/executor test surfaces

- `packages/runtime/src/diagnostics/debug-dump*.test.ts` (nếu có)
- `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`

---

## Phased Implementation Plan

### Phase 0 — Scope freeze & observability contract

**Goal:** chốt ranh giới observability-only.

Work:
- chốt report fields tối thiểu,
- xác nhận out-of-scope plugin-platform parity,
- xác nhận không dùng drift làm policy gate.

### Phase 1 — Drift report model + builder

**Goal:** có một builder deterministic từ runtime-state data.

Work:
- định nghĩa types cho summary/per-extension/warnings,
- implement report aggregation,
- bảo đảm output ổn định cho debug/inspection.

### Phase 2 — Diagnostics integration

**Goal:** operator xem được drift từ diagnostics flow.

Work:
- nối builder vào `debug-dump.ts`,
- include extension drift section trong output,
- xử lý warning khi data source degraded.

### Phase 3 — Enforcement additive reporting

**Goal:** execution boundary có thể phản chiếu insight drift.

Work:
- gắn drift insight vào output/report path tại `enforce-mcp-routing.ts` (additive),
- giữ nguyên routing semantics.

### Phase 4 — Validation + docs closure

**Goal:** chứng minh correctness và phạm vi.

Work:
- test drift count/report correctness,
- test malformed/missing store behavior,
- test compatibility không phá output hiện có,
- cập nhật artifacts xác nhận no platform expansion.

---

## Validation Strategy

1. **Unit-level validation**
   - report builder đúng counts `first/same/updated`.
   - per-extension view đúng state hiện tại.
   - warnings xuất hiện đúng khi store lỗi.

2. **Diagnostics integration validation**
   - `debug-dump` chứa section drift summary theo schema đã chốt.
   - khi runtime-state data không đọc được, output vẫn có diagnostics + warning hữu ích.

3. **Executor compatibility validation**
   - enforcement output hiện có không bị phá vỡ.
   - drift insight nếu có chỉ là additive.

4. **Scope guard validation**
   - review checklist xác nhận không thêm plugin metadata APIs/platform behaviors.

---

## Compatibility Boundaries

1. Không thay đổi semantics `ExtensionRuntimeState` (`first/same/updated`).
2. Không biến drift signal thành planner/executor routing rule.
3. Không thay ownership persistence từ runtime layer sang app layer.
4. Không yêu cầu migration metadata schema rộng ngoài report schema cục bộ của slice này.
5. Không thay đổi đáng kể giao diện output đang tiêu thụ downstream; chỉ thêm field/report section theo kiểu additive.

---

## Explicit Non-Goals (guardrails)

- Không làm plugin platform parity.
- Không làm metadata catalog/query platform đầy đủ.
- Không thêm lifecycle orchestration mới cho extension.
- Không mở rộng discovery/install/distribution workflows.
