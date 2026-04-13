# Phân tích: Observability / Audit Query Layer (DH)

**Ngày:** 2026-04-12  
**Mục tiêu phân tích:** Đề xuất slice tiếp theo tập trung vào lớp truy vấn/inspection dữ liệu audit đã có trong DH, phục vụ operator và debug thực tế.

---

## 1) Vì sao đây là hướng tiếp theo hợp lý

DH đã có nền ghi nhận audit tương đối tốt ở runtime:

- `packages/runtime/src/workflow/workflow-audit-service.ts` đã ghi nhiều loại tín hiệu (tool usage, skill activation, mcp route, hook decision, runtime event).
- Các repo SQLite chuyên biệt đã tồn tại cho từng loại audit.
- `packages/runtime/src/diagnostics/debug-dump.ts` đã có đường xuất debug snapshot.

Điểm nghẽn hiện tại không nằm ở **ghi dữ liệu**, mà nằm ở **khả năng truy vấn và quan sát có chủ đích** khi operator cần điều tra nhanh.

Vì vậy, bước tiếp theo hợp lý là bổ sung một lớp query/inspection có giới hạn, thay vì mở rộng thêm cơ chế ingest/telemetry mới.

---

## 2) Current DH observability state và gap cụ thể

## 2.1 Những gì đã có (factual)

### Runtime ghi audit
- `workflow-audit-service.ts` có các hàm ghi:
  - `recordRequiredTool(...)` -> `tool_usage_audit`
  - `recordSkillActivation(...)` -> `skill_activation_audit`
  - `recordMcpRoute(...)` -> `mcp_route_audit`
  - `recordHookDecision(...)` -> `hook_invocation_logs`
  - `recordRuntimeEvent(...)` -> `session_runtime_events`

### Storage repo hiện trạng
- `hook-invocation-logs-repo.ts`:
  - có `save(...)`
  - có `findLatestDecision(...)`
  - có `listBySession(...)`
- `tool-usage-audit-repo.ts`: hiện chỉ có `save(...)`
- `skill-activation-audit-repo.ts`: hiện chỉ có `save(...)`
- `mcp-route-audit-repo.ts`: hiện chỉ có `save(...)`

### Diagnostics hiện trạng
- `debug-dump.ts` hiện thu thập:
  - `latestSessionHookLogs` (chỉ hook logs của latest session)
  - vài metric hệ thống (chunk/embedding count, semantic mode, paths)

## 2.2 Gap chính xác

1. **Thiếu query API/repo cho 3 bảng audit chính** (tool/skill/mcp route): chỉ ghi được, chưa truy vấn được.
2. **debug-dump bao phủ hẹp**: mới nghiêng về hook logs latest session, chưa có snapshot tổng hợp audit cross-table.
3. **Thiếu operator-facing query surface thống nhất**: chưa có contract rõ để hỏi kiểu “phiên X vì sao bị degrade/fallback nhiều?”.
4. **Thiếu truy vấn theo cửa sổ thời gian / theo role / theo envelope** phục vụ điều tra lỗi vận hành.
5. **Thiếu chuẩn tương quan sự kiện** giữa tool-skill-mcp-hook-runtime event trong cùng session/envelope.

---

## 3) What already exists vs what is missing

## 3.1 Đã có
- Luồng ghi audit từ runtime vào SQLite hoạt động.
- Schema phân loại theo bảng/loại sự kiện đã rõ.
- Hook logs đã có query cơ bản theo session.

## 3.2 Còn thiếu cho operator/query/debug
- Read/query methods có giới hạn và có filter cho:
  - tool usage audit
  - skill activation audit
  - mcp route audit
- Một lớp query service tổng hợp (không phải dashboard) để trả về dữ liệu điều tra theo use-case.
- Mở rộng debug dump ở mức có kiểm soát để kèm audit summary/query snapshot.
- Chuẩn output nhất quán (ví dụ: filter input, time range, limit, sort) để dùng ổn định trong runtime/debug command.

---

## 4) Vì sao DH nên làm bounded query layer thay vì platform monitoring/dashboard lớn

1. **Phù hợp reality của DH hiện tại:** DH đang có SQLite local audit và debug surface nhỏ; chưa có nhu cầu/infra cho observability platform đầy đủ.
2. **Giảm scope creep:** dashboard/monitoring platform đòi hỏi ingestion pipeline, alerting, retention policy, UI, auth model.
3. **Tăng giá trị ngay cho operator:** query layer nhỏ có thể giải quyết trực tiếp các câu hỏi debug thường gặp.
4. **Bảo toàn kiến trúc hiện tại:** tận dụng repo + debug-dump hiện có, không kéo thêm dependency hệ thống lớn.
5. **Cho phép tiến hóa dần:** sau khi query layer ổn định mới đánh giá có cần dashboard ngoài hay không.

Kết luận: với mục tiêu slice kế tiếp, **query/inspection bounded** là hướng chi phí-hiệu quả tốt nhất.

---

## 5) Recommended narrow path

Đường triển khai hẹp, thực dụng:

1. **Bổ sung read/query methods trong các audit repos hiện có**
   - Query theo sessionId, role, envelopeId, time range, limit.
   - Giữ API đơn giản, không xây query DSL phức tạp.

2. **Tạo một lớp tổng hợp audit query trong runtime**
   - Chuyên phục vụ điều tra operator/debug.
   - Trả về snapshot có cấu trúc từ nhiều bảng audit.

3. **Mở rộng `debug-dump.ts` theo chế độ bounded**
   - Vẫn giữ lightweight.
   - Bổ sung phần audit summary tối thiểu và vài truy vấn mặc định hữu ích.

4. **Định nghĩa rõ query profiles mặc định**
   - Ví dụ: latest session timeline, failed/degraded decisions gần nhất, tool/skill/mcp breakdown theo session.

5. **Không triển khai UI dashboard/alerting trong slice này**
   - Chỉ tập trung data access + inspection contract.

---

## 6) Mapping cụ thể sang DH packages/modules

### Runtime
- `packages/runtime/src/workflow/workflow-audit-service.ts`
  - Giữ vai trò write service (không thay đổi mục tiêu chính).
  - Có thể bổ sung điểm vào query delegation hoặc tách service query riêng cùng khu vực workflow/diagnostics.

- `packages/runtime/src/diagnostics/debug-dump.ts`
  - Mở rộng output để chứa audit query snapshot tóm tắt có giới hạn.

### Storage
- `packages/storage/src/sqlite/repositories/hook-invocation-logs-repo.ts`
  - Đã có query cơ bản -> làm mốc chuẩn thiết kế cho các repo audit còn lại.

- `packages/storage/src/sqlite/repositories/tool-usage-audit-repo.ts`
- `packages/storage/src/sqlite/repositories/skill-activation-audit-repo.ts`
- `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts`
  - Bổ sung read/query methods tương tự mức tối thiểu như hook logs repo.

---

## 7) Proposed phases

### Phase 0 — Query contract freeze
- Chốt use-cases operator chính và query shape tối thiểu.
- Chốt filter chuẩn: sessionId, role, envelopeId, from/to timestamp, limit.

### Phase 1 — Repo read/query enablement
- Thêm methods query cho tool/skill/mcp repos.
- Giữ tương thích backward với luồng `save(...)` hiện tại.

### Phase 2 — Runtime aggregation layer
- Tạo lớp query tổng hợp dữ liệu đa bảng.
- Trả ra cấu trúc phục vụ debug investigation.

### Phase 3 — Debug surface expansion
- Mở rộng `debug-dump.ts` với audit summary/query snapshot bounded.
- Đảm bảo output vẫn nhẹ, dễ đọc, không thành report engine lớn.

### Phase 4 — Validation + docs closure
- Kiểm tra truy vấn theo session/time-range và case không có dữ liệu.
- Chốt tài liệu scope/solution/checklist cho bước code.

---

## 8) Risks / watchouts

1. **Overfetch dữ liệu** làm debug-dump phình lớn.
2. **Query không có giới hạn** gây chậm khi dữ liệu audit tăng.
3. **Trượt sang analytics platform** (aggregation phức tạp, UI dashboards).
4. **Inconsistent filters giữa repos** làm operator khó dùng.
5. **Rủi ro lộ dữ liệu nhạy cảm trong dump** nếu không kiểm soát trường output.

Mitigation chính: bắt buộc limit/filter chuẩn, giữ scope inspection-only, và ưu tiên output tối thiểu đủ điều tra.

---

## 9) Guiding recommendation

DH nên triển khai slice “**observability audit query layer**” theo nguyên tắc:

- **Query/inspection layer only** trên dữ liệu audit đã có.
- **Operator-first**: giải quyết nhanh câu hỏi điều tra thực tế.
- **Bounded scope**: không dashboard, không monitoring platform, không alerting stack.
- **Reuse tối đa surfaces hiện hữu**: repos SQLite + debug-dump.

Nếu thực hiện đúng, slice này sẽ nâng mạnh năng lực debug vận hành của DH với chi phí thấp và rủi ro kiến trúc nhỏ.
