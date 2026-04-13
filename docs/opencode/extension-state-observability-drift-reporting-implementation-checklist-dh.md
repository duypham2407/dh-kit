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

- [ ] [Not started] Có report schema tối thiểu (summary/per-extension/warnings) được chốt.
- [ ] [Not started] Có drift report builder đọc từ runtime-state surfaces hiện có.
- [ ] [Not started] `debug-dump` hiển thị extension drift summary nhất quán.
- [ ] [Not started] Enforcement/report boundary có drift insight additive.
- [ ] [Not started] Có test cho aggregate correctness + edge cases malformed/missing store.
- [ ] [Not started] Có bằng chứng compatibility: không phá output quan trọng hiện có.
- [ ] [Not started] Có xác nhận phạm vi: không plugin platform parity, không metadata expansion.

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

- [ ] [Not started] Xác nhận lại boundary: chỉ extension-state observability/drift reporting.
- [ ] [Not started] Đánh dấu rõ non-goals trong working notes/review checklist.
- [ ] [Not started] Chốt vị trí surfaces sẽ touch (runtime extensions + debug-dump + enforcement).

## Phase 1 — Report model definition

- [ ] [Not started] Định nghĩa report types: summary/per-extension/warnings.
- [ ] [Not started] Chốt metrics tối thiểu: total extensions, counts first/same/updated, warnings.
- [ ] [Not started] Chốt quy tắc output deterministic để dễ compare/debug.

## Phase 2 — Drift report builder

- [ ] [Not started] Implement builder dùng dữ liệu từ runtime-state store/touch outputs.
- [ ] [Not started] Bao phủ xử lý missing/malformed/unreadable state.
- [ ] [Not started] Đảm bảo warnings có cấu trúc, không throw fail hard luồng chính.

## Phase 3 — Diagnostics integration

- [ ] [Not started] Nối drift report vào `packages/runtime/src/diagnostics/debug-dump.ts`.
- [ ] [Not started] Bảo đảm debug output có section extension drift rõ và gọn.
- [ ] [Not started] Xác nhận degrade path vẫn cung cấp diagnostics hữu ích.

## Phase 4 — Enforcement additive visibility

- [ ] [Not started] Tích hợp insight drift vào `packages/opencode-app/src/executor/enforce-mcp-routing.ts` ở dạng additive.
- [ ] [Not started] Xác nhận không đổi planner/executor decision semantics.
- [ ] [Not started] Xác nhận backward compatibility cho consumers hiện có.

## Phase 5 — Validation & closure

- [ ] [Not started] Thêm/chạy test cho report correctness (aggregate/per-extension).
- [ ] [Not started] Thêm/chạy test cho malformed/missing store + warning behavior.
- [ ] [Not started] Chạy validation path chuẩn của repo cho thay đổi liên quan.
- [ ] [Not started] Đối chiếu AC và ghi pass/fail evidence.
- [ ] [Not started] Chốt tài liệu closure: xác nhận không scope creep.

---

## 6) Detailed Checklist Items

- [ ] [Not started] Inventory lại các field fingerprint ổn định đang dùng để tránh false drift.
- [ ] [Not started] Xác định mapping từ runtime-state records -> drift summary fields.
- [ ] [Not started] Thiết kế format report phù hợp cho operator đọc nhanh (compact-first).
- [ ] [Not started] Thiết kế format report phù hợp cho debug sâu (detail-on-demand).
- [ ] [Not started] Thêm unit tests cho report builder với dataset nhiều extension.
- [ ] [Not started] Thêm regression tests cho diagnostics integration.
- [ ] [Not started] Thêm regression tests cho enforcement additive payload/warnings.
- [ ] [Not started] Xác nhận không thêm API metadata tổng quát ngoài nhu cầu report.

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

- [ ] [Not started] **False drift vì input không ổn định**  
  Mitigation: chỉ dùng stable fingerprint inputs đã chuẩn hóa.

- [ ] [Not started] **Report bị hiểu sai thành policy gate**  
  Mitigation: ranh giới code+tài liệu rõ ràng, naming phản ánh observability-only.

- [ ] [Not started] **Output quá verbose gây nhiễu vận hành**  
  Mitigation: summary mặc định ngắn gọn; chi tiết khi debug dump chuyên sâu.

- [ ] [Not started] **Scope creep sang metadata platform**  
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
