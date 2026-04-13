# Checklist triển khai theo trạng thái: Extension State Observability / Drift Reporting (DH)

**Ngày tạo:** 2026-04-13  
**Nguồn đã phê duyệt:**
- `docs/opencode/extension-state-observability-drift-reporting-analysis-dh.md`
- `docs/scope/2026-04-13-extension-state-observability-drift-reporting-dh.md`
- `docs/solution/2026-04-13-extension-state-observability-drift-reporting-dh.md`

---

## 1) Objective and Scope

### Objective
- Bổ sung lớp quan sát và drift reporting cho extension runtime state hiện có.
- Giúp operator query/report/inspect drift rõ ràng qua diagnostics và execution reporting boundary.

### Scope (in-scope)
- Định nghĩa report model hẹp cho extension-state observability.
- Xây builder tổng hợp drift từ runtime state/fingerprint persistence hiện có.
- Nối report vào diagnostics (`debug-dump`) và execution boundary dạng additive.
- Bao phủ validation cho correctness, compatibility, và bounded failure behavior.

### Out-of-scope
- Không mở rộng plugin platform parity.
- Không xây metadata management platform diện rộng.
- Không biến drift signal thành policy gate của planner/executor.

---

## 2) Current vs Target State

| Hạng mục | Current | Target |
|---|---|---|
| Runtime state nền | Đã có fingerprint/store/touch | Tiếp tục dùng lại, không tạo pipeline song song |
| Operator insight | Chưa có drift report tập trung dễ dùng | Có drift summary + per-extension inspection rõ |
| Diagnostics | Chưa chuẩn hóa extension drift trong debug dump | Debug dump có section extension drift có cấu trúc |
| Execution reporting | Chưa thống nhất insight drift ở enforcement boundary | Có additive drift visibility, không đổi policy |
| Scope control | Có nguy cơ trượt sang platform expansion | Giữ chặt observability-only |

---

## 3) Definition of Done

- [x] [Completed] Có report schema tối thiểu (summary/per-extension/warnings) được chốt.
- [x] [Completed] Có drift report builder đọc từ runtime-state surfaces hiện có.
- [x] [Completed] `debug-dump` hiển thị extension drift summary nhất quán.
- [x] [Completed] Enforcement/report boundary có drift insight additive.
- [x] [Completed] Có test cho aggregate correctness + edge cases malformed/missing store.
- [x] [Completed] Có bằng chứng compatibility: không phá output quan trọng hiện có.
- [x] [Completed] Có xác nhận phạm vi: không plugin platform parity, không metadata expansion.

---

## 4) Status Legend / Update Protocol

### Status legend
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Update protocol
1. Chỉ một phase ở trạng thái `[ ] [In progress]` tại một thời điểm.
2. Mỗi item chuyển `[x] [Completed]` phải kèm evidence ngay dưới item.
3. Blocked > 30 phút: chuyển `[ ] [Blocked]` + ghi owner/ETA/workaround.
4. Không nhảy phase nếu dependency phase trước chưa thỏa.
5. Kết session phải cập nhật Progress log + Resume quick-start.

---

## 5) Phases / Workstreams

## Phase 0 — Scope freeze (observability-only)

- [x] [Completed] Xác nhận lại boundary: chỉ extension-state observability/drift reporting.
- [x] [Completed] Đánh dấu rõ non-goals trong working notes/review checklist.
- [x] [Completed] Chốt vị trí surfaces sẽ touch (runtime extensions + debug-dump + enforcement).

## Phase 1 — Report model definition

- [x] [Completed] Định nghĩa report types: summary/per-extension/warnings.
- [x] [Completed] Chốt metrics tối thiểu: total extensions, counts first/same/updated, warnings.
- [x] [Completed] Chốt quy tắc output deterministic để dễ compare/debug.

## Phase 2 — Drift report builder

- [x] [Completed] Implement builder dùng dữ liệu từ runtime-state store/touch outputs.
- [x] [Completed] Bao phủ xử lý missing/malformed/unreadable state.
- [x] [Completed] Đảm bảo warnings có cấu trúc, không throw fail hard luồng chính.

## Phase 3 — Diagnostics integration

- [x] [Completed] Nối drift report vào `packages/runtime/src/diagnostics/debug-dump.ts`.
- [x] [Completed] Bảo đảm debug output có section extension drift rõ và gọn.
- [x] [Completed] Xác nhận degrade path vẫn cung cấp diagnostics hữu ích.

## Phase 4 — Enforcement additive visibility

- [x] [Completed] Tích hợp insight drift vào `packages/opencode-app/src/executor/enforce-mcp-routing.ts` ở dạng additive.
- [x] [Completed] Xác nhận không đổi planner/executor decision semantics.
- [x] [Completed] Xác nhận backward compatibility cho consumers hiện có.

## Phase 5 — Validation & closure

- [x] [Completed] Thêm/chạy test cho report correctness (aggregate/per-extension).
- [x] [Completed] Thêm/chạy test cho malformed/missing store + warning behavior.
- [x] [Completed] Chạy validation path chuẩn của repo cho thay đổi liên quan.
- [x] [Completed] Đối chiếu AC và ghi pass/fail evidence.
- [x] [Completed] Chốt tài liệu closure: xác nhận không scope creep.

---

## 6) Detailed Checklist Items

- [x] [Completed] Inventory lại các field fingerprint ổn định đang dùng để tránh false drift.
- [x] [Completed] Xác định mapping từ runtime-state records -> drift summary fields.
- [x] [Completed] Thiết kế format report phù hợp cho operator đọc nhanh (compact-first).
- [x] [Completed] Thiết kế format report phù hợp cho debug sâu (detail-on-demand).
- [x] [Completed] Thêm unit tests cho report builder với dataset nhiều extension.
- [x] [Completed] Thêm regression tests cho diagnostics integration.
- [x] [Completed] Thêm regression tests cho enforcement additive payload/warnings.
- [x] [Completed] Xác nhận không thêm API metadata tổng quát ngoài nhu cầu report.

---

## 7) Dependencies / Sequencing Notes

### Dependencies
- Depend on existing runtime-state persistence slice đã hoàn tất.
- Depend on extension fingerprint stability rules đã được khóa ở slice trước.

### Sequencing notes
- Không implement diagnostics integration trước khi report model được chốt.
- Không implement enforcement visibility trước khi drift builder ổn định.
- Không claim done nếu chưa có evidence cho bounded failure behavior.

---

## 8) Risks / Watchouts

- [x] [Completed] **False drift vì input không ổn định**  
  Mitigation: chỉ dùng stable fingerprint inputs đã chuẩn hóa.

- [x] [Completed] **Report bị hiểu sai thành policy gate**  
  Mitigation: ranh giới code+tài liệu rõ ràng, naming phản ánh observability-only.

- [x] [Completed] **Output quá verbose gây nhiễu vận hành**  
  Mitigation: summary mặc định ngắn gọn; chi tiết khi debug dump chuyên sâu.

- [x] [Completed] **Scope creep sang metadata platform**  
  Mitigation: review gate bám non-goals và AC-1.

---

## 9) Progress Log Template

```md
### Progress Update — YYYY-MM-DD HH:mm
- Session owner:
- Phase đang làm:
- Trạng thái tổng quan: [ ] [Not started] / [ ] [In progress] / [x] [Completed] / [ ] [Blocked]

#### Việc đã hoàn thành
- [x] [Completed] ...
- Evidence:
  - <file/test/log>

#### Việc đang làm
- [ ] [In progress] ...

#### Blockers
- [ ] [Blocked] <mô tả blocker>
  - Owner xử lý:
  - ETA:
  - Workaround tạm thời:

#### Rủi ro mới phát sinh
- ...

#### Việc tiếp theo (1-3 mục ưu tiên)
1.
2.
3.
```

---

## 10) Resume Quick-Start

1. Mở 3 tài liệu nguồn (analysis/scope/solution) của slice này.
2. Kiểm tra checklist và đặt đúng một phase thành `[ ] [In progress]`.
3. Xác nhận dependencies phase trước đã đạt.
4. Ưu tiên hoàn thành items critical của phase hiện tại trước khi mở phase sau.
5. Cập nhật evidence ngay sau từng thay đổi/test.
6. Kết thúc session bằng một `Progress Update` mới.

---

## 11) Progress Update

### Progress Update — 2026-04-13 08:50
- Session owner: Fullstack Agent
- Phase đang làm: Phase 5 — Validation & closure
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Hoàn tất drift report model + deterministic builder dựa trên runtime-state data hiện có.
- [x] [Completed] Tích hợp drift summary vào `debug-dump` diagnostics output.
- [x] [Completed] Bổ sung additive drift visibility tại enforcement/report boundary, giữ nguyên routing semantics.
- [x] [Completed] Bổ sung test coverage cho drift builder, diagnostics integration, và enforcement additive behavior.
- [x] [Completed] Chạy validation repo path (`npm run check`, `npm run test`) và pass.

#### Evidence
- Files mới/chính:
  - `packages/runtime/src/extensions/extension-drift-report.ts`
  - `packages/runtime/src/extensions/extension-drift-report.test.ts`
- Files cập nhật:
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - `packages/runtime/src/diagnostics/audit-query-service.test.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`
  - `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - `packages/opencode-app/src/workflows/delivery.ts`
  - `packages/opencode-app/src/workflows/migration.ts`
- Commands:
  - `npm run check` (pass)
  - `npm run test` (pass, 329 passed / 4 skipped)

#### Blockers
- Không có blocker active.

#### Rủi ro mới phát sinh
- Không phát sinh rủi ro mới ngoài risks đã theo dõi.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. Chờ code review theo lane hiện tại.
2. Nếu QA yêu cầu, bổ sung thêm test cho edge scenarios cụ thể của drift warnings.
3. Giữ boundary: không mở rộng sang plugin platform parity/metadata platform.

### Progress Update — 2026-04-13 08:52
- Session owner: Fullstack Agent
- Phase đang làm: Follow-up maintainability fix (post-review)
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Loại bỏ inline duplicated type của `extensionStateDrift` trong `debug-dump.ts`, chuyển sang import và dùng trực tiếp `ExtensionStateDriftReport`.
- [x] [Completed] Thêm comment làm rõ drift view của debug-dump là persisted-state oriented và `state` có thể `undefined` khi không có runtime touch in-flight.
- [x] [Completed] Bổ sung test nhỏ cho case store vắng mặt (clean report, không warning).

#### Evidence
- Files:
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - `packages/runtime/src/extensions/extension-drift-report.test.ts`
- Commands:
  - `npm run check` (pass)
  - `npm run test -- packages/runtime/src/extensions/extension-drift-report.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts` (pass)

#### Blockers
- Không có blocker.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. Chờ review xác nhận clean closure cho finding maintainability.
