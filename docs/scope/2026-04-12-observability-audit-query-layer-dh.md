# Scope Package: Observability / Audit Query Layer (DH)

**Ngày:** 2026-04-12  
**Owner:** DH runtime/storage team  
**Liên kết phân tích:** `docs/opencode/observability-audit-query-layer-analysis-dh.md`

---

## 1) Problem statement

DH hiện đã ghi audit data vào SQLite qua nhiều bề mặt runtime, nhưng operator-facing khả năng truy vấn/inspection còn thiếu. Kết quả là khi debug hoặc điều tra hành vi routing/enforcement theo session, nhóm vận hành phải dựa vào dữ liệu rời rạc và debug dump hẹp.

Slice này nhằm bổ sung lớp query/inspection có giới hạn trên dữ liệu audit hiện có, để tăng khả năng điều tra thực tế mà không mở rộng thành nền tảng monitoring/dashboard lớn.

---

## 2) Current vs target state

| Hạng mục | Current (DH) | Target (slice này) |
|---|---|---|
| Ghi audit runtime | Đã có qua `workflow-audit-service.ts` | Giữ nguyên |
| Hook audit query | Có `findLatestDecision`, `listBySession` | Giữ và dùng làm baseline |
| Tool/Skill/MCP audit query | Chỉ có `save(...)` | Có query methods có filter/limit cơ bản |
| Debug dump | Chủ yếu latest session hook logs + diagnostics hẹp | Có thêm audit summary/query snapshot bounded |
| Operator query surface | Chưa thống nhất | Có contract query/inspection nhất quán |

---

## 3) In-scope

1. Bổ sung read/query methods cho:
   - `tool-usage-audit-repo.ts`
   - `skill-activation-audit-repo.ts`
   - `mcp-route-audit-repo.ts`
2. Định nghĩa contract query filters tối thiểu (sessionId, role, envelopeId, from/to, limit).
3. Thêm lớp query/aggregation bounded trong runtime để phục vụ inspection.
4. Mở rộng `debug-dump.ts` để xuất audit summary/query snapshot hữu ích cho operator.
5. Cập nhật tài liệu và checklist để sẵn sàng triển khai code.

---

## 4) Out-of-scope

- Dashboard UI.
- Monitoring platform đầy đủ (alerting, metrics pipeline, retention engine, external telemetry backend).
- Thay đổi schema lớn không cần thiết cho query slice này.
- Re-architecture workflow audit write path.

---

## 5) Acceptance criteria

1. Có mô tả contract query layer rõ ràng, bounded, phù hợp dữ liệu audit hiện có.
2. Có kế hoạch cụ thể để 3 repo audit còn thiếu query methods được nâng cấp read/query.
3. Có hướng mở rộng `debug-dump.ts` theo mô hình inspection-only, không biến thành nền tảng reporting lớn.
4. Có validation strategy cho truy vấn theo session/time-range và case empty result.
5. Có tuyên bố rõ: đây là query/inspection layer, **không** phải dashboard/monitoring platform.

---

## 6) Risks / assumptions

### Risks
- Scope creep sang analytics/monitoring platform.
- Truy vấn không giới hạn gây tải cao hoặc output dump quá lớn.
- Inconsistent query contract giữa các repo audit.
- Rò rỉ thông tin nhạy cảm nếu debug snapshot chứa payload quá rộng.

### Assumptions
- Audit write path hiện tại ổn định và tiếp tục là nguồn dữ liệu chính.
- SQLite repos là lớp truy cập dữ liệu chính cho slice này.
- Nhu cầu trước mắt là inspection/debug cho operator, không phải BI/dashboard.

---

## 7) Sequencing expectations

1. Freeze query contract/filter chung trước.
2. Nâng cấp query methods cho repos audit (tool/skill/mcp).
3. Thêm runtime aggregation/query service bounded.
4. Mở rộng debug-dump theo output có giới hạn.
5. Chốt validation + tài liệu.

**Nguyên tắc sequencing:** ưu tiên khả năng điều tra thực tế trước, tránh đầu tư vào bề mặt hiển thị/monitoring lớn ngoài phạm vi.
