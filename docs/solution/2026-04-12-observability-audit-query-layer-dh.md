# Solution Package: Observability / Audit Query Layer (DH)

**Ngày:** 2026-04-12  
**Scope tham chiếu:** `docs/scope/2026-04-12-observability-audit-query-layer-dh.md`  
**Analysis tham chiếu:** `docs/opencode/observability-audit-query-layer-analysis-dh.md`

---

## 1) Architecture decisions

### AD-1: Giữ nguyên audit write path, chỉ thêm query/inspection layer
- `workflow-audit-service.ts` tiếp tục là điểm ghi dữ liệu audit.
- Slice này không thay đổi semantic ghi hiện có, chỉ bổ sung đường đọc/truy vấn.

### AD-2: Query contract tối thiểu, thống nhất giữa các repo
- Dùng filter lõi chung: `sessionId`, `role`, `envelopeId`, `fromTimestamp`, `toTimestamp`, `limit`.
- Ưu tiên API rõ, dễ hiểu, không DSL phức tạp.

### AD-3: Runtime aggregation dạng bounded inspection
- Tạo lớp tổng hợp query từ nhiều bảng audit để phục vụ điều tra.
- Không xây analytics engine nặng hoặc dashboard backend.

### AD-4: Debug surface mở rộng có giới hạn
- `debug-dump.ts` chỉ bổ sung summary/query snapshot phục vụ operator.
- Bắt buộc limit và phạm vi dữ liệu để tránh dump phình lớn.

### AD-5: Inspection-first, không platform hóa observability
- Slice này là query/inspection layer trên dữ liệu SQLite hiện có.
- Không mở rộng sang monitoring platform (dashboard, alerting, telemetry pipeline).

---

## 2) Target files/modules

### Runtime
- `packages/runtime/src/workflow/workflow-audit-service.ts`
  - Giữ write responsibilities; nếu cần chỉ thêm điểm nối query service (không đổi vai trò chính).

- `packages/runtime/src/diagnostics/debug-dump.ts`
  - Mở rộng dump output để kèm audit summary/query snapshot bounded.

- (Mới đề xuất) `packages/runtime/src/diagnostics/audit-query-service.ts`
  - Điều phối truy vấn đa-repo và trả về inspection payload nhất quán.

### Storage
- `packages/storage/src/sqlite/repositories/hook-invocation-logs-repo.ts`
  - Dùng làm baseline query style.

- `packages/storage/src/sqlite/repositories/tool-usage-audit-repo.ts`
  - Thêm read/query methods có filter/limit.

- `packages/storage/src/sqlite/repositories/skill-activation-audit-repo.ts`
  - Thêm read/query methods có filter/limit.

- `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts`
  - Thêm read/query methods có filter/limit.

---

## 3) Phased implementation plan

### Phase 0 — Query contract freeze
1. Chốt các use-case operator ưu tiên:
   - timeline theo session,
   - các decision degrade/fallback gần nhất,
   - breakdown tool/skill/mcp theo session.
2. Chốt query filter contract chung và default limit.

### Phase 1 — Repo query enablement
1. Bổ sung methods đọc/truy vấn cho 3 audit repos đang chỉ có `save(...)`.
2. Chuẩn hóa sort (newest-first) và pagination/limit behavior tối thiểu.
3. Đảm bảo backward compatibility với caller cũ.

### Phase 2 — Runtime aggregation service
1. Triển khai `audit-query-service` (hoặc tương đương) để ghép dữ liệu nhiều bảng.
2. Cung cấp các hàm query profile bounded (không generic reporting engine).
3. Chuẩn hóa output shape cho diagnostic usage.

### Phase 3 — Debug dump integration
1. Mở rộng `createDebugDump(...)` để gọi query service và thêm audit summary.
2. Giữ payload nhẹ qua limit/time-window mặc định.
3. Bảo đảm dump vẫn dùng được khi một phần audit table rỗng.

### Phase 4 — Validation và docs closure
1. Verify truy vấn theo session/time-range hoạt động đúng.
2. Verify empty/noise cases không làm hỏng dump.
3. Chốt docs/checklist/evidence cho handoff code-review/qa.

---

## 4) Validation strategy

Validation tập trung vào hành vi query/inspection:

1. **Session query correctness**
   - Cùng một session trả về đầy đủ tập audit theo limit/sort đúng.

2. **Time-range filtering**
   - Query theo cửa sổ thời gian trả về tập con đúng.

3. **Cross-table aggregation sanity**
   - Output summary phản ánh đúng dữ liệu từ tool/skill/mcp/hook sources.

4. **No-data resilience**
   - Khi bảng rỗng hoặc session chưa có dữ liệu, output vẫn hợp lệ.

5. **Bounded output checks**
   - Debug dump không vượt quá phạm vi kỳ vọng vì thiếu limit.

Ghi chú: do DH hiện có thể chưa có test/lint command chuẩn cho toàn bộ surfaces, cần ghi rõ manual evidence nếu thiếu đường validate tự động.

---

## 5) Compatibility boundaries

1. Không phá vỡ semantics ghi audit hiện tại.
2. Không yêu cầu thay thế SQLite bằng backend observability mới.
3. Không thay đổi workflow stage/lane contract.
4. Không biến debug surface thành dashboard/reporting platform.
5. Không yêu cầu phụ thuộc external monitoring stack.

---

## 6) Tuyên bố phạm vi rõ ràng

**Slice này chỉ là query/inspection layer trên audit data sẵn có.**

**Không phải dashboard/monitoring platform** và không bao gồm alerting pipeline, visualization UI, hay hệ thống telemetry mở rộng.
