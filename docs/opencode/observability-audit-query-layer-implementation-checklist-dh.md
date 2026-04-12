# Checklist triển khai: Observability / Audit Query Layer (DH)

**Ngày tạo:** 2026-04-12  
**Nguồn chuẩn:**
- `docs/opencode/observability-audit-query-layer-analysis-dh.md`
- `docs/scope/2026-04-12-observability-audit-query-layer-dh.md`
- `docs/solution/2026-04-12-observability-audit-query-layer-dh.md`

---

## 1) Objective and scope

### Objective
Nâng năng lực operator-facing inspection/query trên dữ liệu audit SQLite hiện có trong DH để debug/điều tra nhanh hơn và nhất quán hơn.

### Scope
- Bổ sung query methods cho các audit repos còn thiếu read path.
- Thêm runtime audit query aggregation layer bounded.
- Mở rộng debug-dump để có audit summary/query snapshot thực dụng.
- Chốt validation và tài liệu cho slice này.

### Out-of-scope nhắc lại
- Dashboard UI và monitoring platform đầy đủ.
- Alerting pipeline và external telemetry backend.
- Refactor lớn vượt ngoài query/inspection surfaces.

---

## 2) Current vs target state

### Current
- Audit write path đã có qua `workflow-audit-service.ts`.
- `hook-invocation-logs-repo.ts` đã có query cơ bản.
- `tool-usage-audit-repo.ts`, `skill-activation-audit-repo.ts`, `mcp-route-audit-repo.ts` hiện chỉ `save(...)`.
- `debug-dump.ts` mới bao phủ hook logs latest session và diagnostics hẹp.

### Target
- 3 repo audit còn thiếu có query methods với filter/limit chuẩn.
- Có runtime query aggregation service cho inspection use-cases chính.
- Debug dump có audit summary/query snapshot bounded cho operator.
- Có kiểm soát phạm vi để không trượt sang dashboard/monitoring platform.

---

## 3) Definition of Done (DoD)

- [ ] [Not started] Query contract/filter chung được chốt và dùng nhất quán giữa các audit repos.
- [ ] [Not started] `tool-usage-audit-repo.ts` có read/query methods (session/time-range/limit).
- [ ] [Not started] `skill-activation-audit-repo.ts` có read/query methods (session/time-range/limit).
- [ ] [Not started] `mcp-route-audit-repo.ts` có read/query methods (session/time-range/limit).
- [ ] [Not started] Có runtime audit query/aggregation layer bounded phục vụ operator inspection.
- [ ] [Not started] `debug-dump.ts` được mở rộng audit summary/query snapshot nhưng vẫn lightweight.
- [ ] [Not started] Validation evidence cho session/time-range/no-data/bounded-output cases.
- [ ] [Not started] Tài liệu xác nhận rõ đây là query/inspection layer only, không phải dashboard platform.

---

## 4) Status legend / update protocol

### Legend
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Update protocol
1. Bắt đầu mục nào -> đổi sang `[ ] [In progress]`.
2. Hoàn tất mục nào -> đổi `[x] [Completed]` + ghi evidence ngay dưới mục.
3. Blocked quá 30 phút -> đổi `[ ] [Blocked]` + ghi nguyên nhân/owner/ETA.
4. Không đánh Completed nếu chưa có evidence.
5. Cuối mỗi session: cập nhật Progress Log.

---

## 5) Phases / workstreams

### Phase 0 — Contract freeze
- [ ] [Not started] Chốt use-cases query operator ưu tiên.
- [ ] [Not started] Chốt filter contract chuẩn: `sessionId`, `role`, `envelopeId`, `from/to`, `limit`.
- [ ] [Not started] Chốt default limits để đảm bảo bounded output.

### Phase 1 — Repository query enablement
- [ ] [Not started] Thêm query methods cho `tool-usage-audit-repo.ts`.
- [ ] [Not started] Thêm query methods cho `skill-activation-audit-repo.ts`.
- [ ] [Not started] Thêm query methods cho `mcp-route-audit-repo.ts`.
- [ ] [Not started] Đồng bộ sort/order và error handling giữa các repo.

### Phase 2 — Runtime aggregation layer
- [ ] [Not started] Tạo audit query service tổng hợp đa-bảng.
- [ ] [Not started] Định nghĩa output shape inspection dùng chung.
- [ ] [Not started] Đảm bảo service fail-soft khi một nguồn dữ liệu trống/lỗi cục bộ.

### Phase 3 — Debug surface integration
- [ ] [Not started] Mở rộng `createDebugDump(...)` để kèm audit summary.
- [ ] [Not started] Thêm query snapshot mặc định cho latest session và time-window gần.
- [ ] [Not started] Kiểm tra kích thước output không phình bất thường.

### Phase 4 — Validation + docs closure
- [ ] [Not started] Chạy/ghi nhận kiểm tra cho session query correctness.
- [ ] [Not started] Chạy/ghi nhận kiểm tra cho time-range filter.
- [ ] [Not started] Chạy/ghi nhận kiểm tra cho no-data resilience.
- [ ] [Not started] Chạy/ghi nhận kiểm tra bounded-output behavior.
- [ ] [Not started] Cập nhật docs/handoff notes hoàn chỉnh.

---

## 6) Detailed checklist items

### 6.1 Contract & API
- [ ] [Not started] Định nghĩa `AuditQueryFilter` hoặc tương đương cho runtime/storage.
- [ ] [Not started] Chốt quy ước timestamp và timezone handling.
- [ ] [Not started] Chốt upper bound cho `limit` để tránh query quá nặng.

### 6.2 Storage repos
- [ ] [Not started] Tool usage repo có list/query theo session + role + time range.
- [ ] [Not started] Skill activation repo có list/query theo session + role + time range.
- [ ] [Not started] MCP route repo có list/query theo session + role + time range.
- [ ] [Not started] Mỗi repo có default newest-first sort và limit mặc định.

### 6.3 Runtime query layer
- [ ] [Not started] Có hàm lấy timeline inspection cho một session.
- [ ] [Not started] Có hàm lấy breakdown tool/skill/mcp bounded.
- [ ] [Not started] Có normalize output shape để debug-dump dùng trực tiếp.

### 6.4 Debug dump
- [ ] [Not started] Bổ sung phần audit summary vào `DebugDump` type.
- [ ] [Not started] Bảo toàn backward compatibility cho trường hiện có trong dump.
- [ ] [Not started] Đảm bảo output không chứa payload nhạy cảm ngoài phạm vi cần thiết.

### 6.5 Validation evidence
- [ ] [Not started] Evidence cho truy vấn session có dữ liệu.
- [ ] [Not started] Evidence cho truy vấn session không dữ liệu.
- [ ] [Not started] Evidence cho filter time-range.
- [ ] [Not started] Evidence cho bounded limit.

---

## 7) Dependencies / sequencing notes

1. Bắt buộc chốt contract filter trước khi sửa nhiều repo để tránh drift API.
2. Runtime aggregation layer phụ thuộc query methods từ repos.
3. Debug-dump integration nên làm sau khi query layer ổn định để tránh rework output shape.
4. Nếu có thay đổi schema (không kỳ vọng), phải đánh giá migration impact riêng.

---

## 8) Risks / watchouts

- [ ] [Not started] Scope creep sang dashboard/monitoring platform.
  - Mitigation: giữ strictly inspection-only, không thêm UI/alerting.
- [ ] [Not started] Query không giới hạn làm chậm runtime/debug.
  - Mitigation: bắt buộc `limit` mặc định và `maxLimit`.
- [ ] [Not started] Inconsistent contract giữa repos gây khó dùng.
  - Mitigation: dùng filter type chung và checklist đồng bộ.
- [ ] [Not started] Debug dump lộ dữ liệu quá mức cần thiết.
  - Mitigation: review payload fields, ưu tiên summary thay vì raw bulk data.
- [ ] [Not started] Output dump phình lớn theo thời gian.
  - Mitigation: time window + bounded record count + profile mặc định.

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

1. Đọc nhanh 3 tài liệu nguồn (analysis/scope/solution) của slice này.
2. Mở checklist, xác định mục `[ ] [In progress]` hoặc `[ ] [Blocked]` gần nhất.
3. Xác nhận Phase 0 contract đã freeze chưa; nếu chưa, không nhảy vào implementation chi tiết.
4. Tiến hành theo thứ tự repo query -> runtime aggregation -> debug-dump integration.
5. Sau mỗi nhóm thay đổi, cập nhật checklist và ghi evidence tương ứng.
6. Kết thúc session: điền Progress Update để người sau resume nhanh.
