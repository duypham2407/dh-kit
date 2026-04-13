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

- [x] [Completed] Query contract/filter chung được chốt và dùng nhất quán giữa các audit repos.
  - Evidence: `packages/shared/src/types/audit.ts` thêm `AuditQueryFilter`, `DEFAULT_AUDIT_QUERY_LIMIT`, `MAX_AUDIT_QUERY_LIMIT`.
- [x] [Completed] `tool-usage-audit-repo.ts` có read/query methods (session/time-range/limit).
  - Evidence: `packages/storage/src/sqlite/repositories/tool-usage-audit-repo.ts` thêm `list(...)` và `listBySession(...)` với filter + bounded limit.
- [x] [Completed] `skill-activation-audit-repo.ts` có read/query methods (session/time-range/limit).
  - Evidence: `packages/storage/src/sqlite/repositories/skill-activation-audit-repo.ts` thêm `list(...)` và `listBySession(...)`.
- [x] [Completed] `mcp-route-audit-repo.ts` có read/query methods (session/time-range/limit).
  - Evidence: `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts` thêm `list(...)` và `listBySession(...)`.
- [x] [Completed] Có runtime audit query/aggregation layer bounded phục vụ operator inspection.
  - Evidence: file mới `packages/runtime/src/diagnostics/audit-query-service.ts` với profile `latestSession` + `recentWindow`.
- [x] [Completed] `debug-dump.ts` được mở rộng audit summary/query snapshot nhưng vẫn lightweight.
  - Evidence: `packages/runtime/src/diagnostics/debug-dump.ts` thêm `auditInspection` dùng limit mặc định 25 và cửa sổ 24h.
- [x] [Completed] Validation evidence cho session/time-range/no-data/bounded-output cases.
  - Evidence: `npm run check`; `npm run test -- packages/storage/src/sqlite/repositories/repos.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`.
- [x] [Completed] Tài liệu xác nhận rõ đây là query/inspection layer only, không phải dashboard platform.
  - Evidence: scope/solution nguồn giữ nguyên out-of-scope dashboard/alerting/external telemetry; implementation chỉ thêm query service + debug snapshot bounded.

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
- [x] [Completed] Chốt use-cases query operator ưu tiên.
- [x] [Completed] Chốt filter contract chuẩn: `sessionId`, `role`, `envelopeId`, `from/to`, `limit`.
- [x] [Completed] Chốt default limits để đảm bảo bounded output.

### Phase 1 — Repository query enablement
- [x] [Completed] Thêm query methods cho `tool-usage-audit-repo.ts`.
- [x] [Completed] Thêm query methods cho `skill-activation-audit-repo.ts`.
- [x] [Completed] Thêm query methods cho `mcp-route-audit-repo.ts`.
- [x] [Completed] Đồng bộ sort/order và error handling giữa các repo.

### Phase 2 — Runtime aggregation layer
- [x] [Completed] Tạo audit query service tổng hợp đa-bảng.
- [x] [Completed] Định nghĩa output shape inspection dùng chung.
- [x] [Completed] Đảm bảo service fail-soft khi một nguồn dữ liệu trống/lỗi cục bộ.

### Phase 3 — Debug surface integration
- [x] [Completed] Mở rộng `createDebugDump(...)` để kèm audit summary.
- [x] [Completed] Thêm query snapshot mặc định cho latest session và time-window gần.
- [x] [Completed] Kiểm tra kích thước output không phình bất thường.

### Phase 4 — Validation + docs closure
- [x] [Completed] Chạy/ghi nhận kiểm tra cho session query correctness.
- [x] [Completed] Chạy/ghi nhận kiểm tra cho time-range filter.
- [x] [Completed] Chạy/ghi nhận kiểm tra cho no-data resilience.
- [x] [Completed] Chạy/ghi nhận kiểm tra bounded-output behavior.
- [x] [Completed] Cập nhật docs/handoff notes hoàn chỉnh.

---

## 6) Detailed checklist items

### 6.1 Contract & API
- [x] [Completed] Định nghĩa `AuditQueryFilter` hoặc tương đương cho runtime/storage.
- [x] [Completed] Chốt quy ước timestamp và timezone handling.
- [x] [Completed] Chốt upper bound cho `limit` để tránh query quá nặng.

### 6.2 Storage repos
- [x] [Completed] Tool usage repo có list/query theo session + role + time range.
- [x] [Completed] Skill activation repo có list/query theo session + role + time range.
- [x] [Completed] MCP route repo có list/query theo session + role + time range.
- [x] [Completed] Mỗi repo có default newest-first sort và limit mặc định.

### 6.3 Runtime query layer
- [x] [Completed] Có hàm lấy timeline inspection cho một session.
- [x] [Completed] Có hàm lấy breakdown tool/skill/mcp bounded.
- [x] [Completed] Có normalize output shape để debug-dump dùng trực tiếp.

### 6.4 Debug dump
- [x] [Completed] Bổ sung phần audit summary vào `DebugDump` type.
- [x] [Completed] Bảo toàn backward compatibility cho trường hiện có trong dump.
- [x] [Completed] Đảm bảo output không chứa payload nhạy cảm ngoài phạm vi cần thiết.

### 6.5 Validation evidence
- [x] [Completed] Evidence cho truy vấn session có dữ liệu.
- [x] [Completed] Evidence cho truy vấn session không dữ liệu.
- [x] [Completed] Evidence cho filter time-range.
- [x] [Completed] Evidence cho bounded limit.

---

## 7) Dependencies / sequencing notes

1. Bắt buộc chốt contract filter trước khi sửa nhiều repo để tránh drift API.
2. Runtime aggregation layer phụ thuộc query methods từ repos.
3. Debug-dump integration nên làm sau khi query layer ổn định để tránh rework output shape.
4. Nếu có thay đổi schema (không kỳ vọng), phải đánh giá migration impact riêng.

---

## 8) Risks / watchouts

- [x] [Completed] Scope creep sang dashboard/monitoring platform.
  - Mitigation: giữ strictly inspection-only, không thêm UI/alerting.
- [x] [Completed] Query không giới hạn làm chậm runtime/debug.
  - Mitigation: bắt buộc `limit` mặc định và `maxLimit`.
- [x] [Completed] Inconsistent contract giữa repos gây khó dùng.
  - Mitigation: dùng filter type chung và checklist đồng bộ.
- [x] [Completed] Debug dump lộ dữ liệu quá mức cần thiết.
  - Mitigation: review payload fields, ưu tiên summary thay vì raw bulk data.
- [x] [Completed] Output dump phình lớn theo thời gian.
  - Mitigation: time window + bounded record count + profile mặc định.

---

### Progress Update — 2026-04-12 22:50
- Session owner: Fullstack Agent
- Phase đang làm: Phase 4 — Validation + docs closure
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Bổ sung contract query bounded dùng chung cho audit repos.
- [x] [Completed] Thêm query read path cho tool/skill/mcp audit repos.
- [x] [Completed] Thêm runtime audit aggregation layer (`audit-query-service`).
- [x] [Completed] Mở rộng `createDebugDump(...)` với `auditInspection` bounded profiles.
- [x] [Completed] Thêm tests cho filter/time-range/no-data/limit + debug dump integration.
- Evidence:
  - `packages/shared/src/types/audit.ts`
  - `packages/storage/src/sqlite/repositories/{tool-usage-audit-repo.ts,skill-activation-audit-repo.ts,mcp-route-audit-repo.ts}`
  - `packages/runtime/src/diagnostics/{audit-query-service.ts,debug-dump.ts}`
  - `packages/runtime/src/diagnostics/audit-query-service.test.ts`
  - `packages/storage/src/sqlite/repositories/repos.test.ts`
  - Command: `npm run check`
  - Command: `npm run test -- packages/storage/src/sqlite/repositories/repos.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`

#### Việc đang làm
- [x] [Completed] Cập nhật checklist và progress log.

#### Blockers
- [ ] [Blocked] Không có blocker kỹ thuật trong phạm vi slice đã phê duyệt.

#### Việc tiếp theo (ưu tiên)
1. Code review tập trung vào filter contract consistency và fail-soft behavior.
2. QA verify `dh doctor --debug-dump` output thực tế trên repo có dữ liệu audit lớn hơn.
3. Theo dõi nếu cần profile query inspection mới (vẫn giữ bounded scope).

### Progress Update — 2026-04-12 22:59
- Session owner: Fullstack Agent
- Phase đang làm: Post-review fixes (important findings)
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Làm rõ semantics summary: đổi `summary.total` -> `summary.timelineCount` để phản ánh đúng dữ liệu đã bị bounded.
- [x] [Completed] Thêm signal rõ ràng khi profile không hỗ trợ hook query: `recentWindow` không có `sessionId` sẽ ghi `errors[]` với source `hook`.
- [x] [Completed] Gộp helper query dùng chung cho 3 audit repos (`audit-query-utils.ts`).
- [x] [Completed] Dọn fallback/style low-risk (`Math.trunc(limit)` khi đã guard type, bỏ lặp helper cục bộ).
- Evidence:
  - `packages/runtime/src/diagnostics/audit-query-service.ts`
  - `packages/runtime/src/diagnostics/audit-query-service.test.ts`
  - `packages/storage/src/sqlite/repositories/audit-query-utils.ts`
  - `packages/storage/src/sqlite/repositories/{tool-usage-audit-repo.ts,skill-activation-audit-repo.ts,mcp-route-audit-repo.ts}`
  - Command: `npm run check`
  - Command: `npm run test -- packages/runtime/src/diagnostics/audit-query-service.test.ts packages/storage/src/sqlite/repositories/repos.test.ts`

#### Việc đang làm
- [x] [Completed] Cập nhật checklist/progress/evidence cho vòng sửa review.

#### Blockers
- [ ] [Blocked] Không có blocker kỹ thuật.

#### Việc tiếp theo (ưu tiên)
1. Code review xác nhận wording/semantics mới của `timelineCount`.
2. QA xác nhận operator hiểu đúng limitation hook ở profile recentWindow.

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
