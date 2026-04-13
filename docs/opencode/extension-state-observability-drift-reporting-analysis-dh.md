# Phân tích follow-on slice: extension state observability / drift reporting (DH)

**Ngày:** 2026-04-13  
**Mục tiêu tài liệu:** xác định vì sao lát cắt tiếp theo hợp lý là tăng khả năng quan sát (observability) và báo cáo drift cho extension runtime state đã tồn tại, theo phạm vi hẹp và vận hành được.

---

## 1) Vì sao đây là hướng tiếp theo hợp lý

DH đã hoàn tất 2 lớp nền quan trọng trước đó:

1. **Minimal extension contracts** (đã ổn định boundary semantics).
2. **Minimal extension runtime-state / fingerprint persistence** (đã có nền dữ liệu trạng thái theo thời gian).

Khi nền dữ liệu đã có, bước hợp lý tiếp theo không phải mở rộng platform plugin, mà là **giúp operator nhìn thấy và hiểu được trạng thái đó**:

- extension nào đang ở `first/same/updated`
- drift nào đang diễn ra theo thời gian
- drift đó xuất hiện ở đâu trong execution path

Nói ngắn gọn: DH đã có “dữ liệu”, follow-on này bổ sung “khả năng quan sát và báo cáo”.

---

## 2) Current DH state và observability gap chính xác

### Bề mặt hiện có liên quan trực tiếp

- `packages/runtime/src/extensions/extension-fingerprint.ts`
- `packages/runtime/src/extensions/extension-runtime-state-store.ts`
- `packages/runtime/src/extensions/touch-extension-state.ts`
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
- `packages/runtime/src/diagnostics/debug-dump.ts`

### Trạng thái hiện tại (factual)

- DH đã tính fingerprint và chạm (`touch`) runtime state.
- DH đã có persistence tối thiểu để phân loại trạng thái.
- Runtime path đã có nơi enforcement để tiêu thụ kết quả ở mức additive.

### Khoảng trống observability hiện tại

Khoảng trống không còn ở logic state transition, mà ở **operator visibility**:

1. Chưa có report tập trung cho drift theo extension id.
2. Chưa có snapshot quan sát dễ đọc cho operator (CLI/debug artifact) với ngữ nghĩa drift rõ.
3. Chưa có cách trả lời nhanh câu hỏi “drift này mới xảy ra hay đã kéo dài nhiều phiên?”.
4. `debug-dump` chưa trở thành điểm vào chuẩn cho extension-state drift diagnostics.

---

## 3) Operator hiện vẫn chưa dễ lấy insight nào

Các insight khó lấy nhanh ở trạng thái hiện tại:

- Top extension đang drift nhiều nhất trong phiên gần đây.
- Drift xảy ra do thay đổi fingerprint thực chất hay do input không ổn định.
- Mức độ drift theo lane/role/capability (ở mức summary, không cần metadata platform đầy đủ).
- Tương quan giữa routing enforcement và runtime state chuyển đổi.
- Dấu hiệu bất thường: một extension liên tục `updated` qua nhiều phiên liên tiếp.

Thiếu các insight này làm giảm khả năng điều hành vận hành, dù dữ liệu nền đã có.

---

## 4) Vì sao nên thêm bounded drift-reporting layer, không đi theo plugin metadata platform

DH nên chọn **lớp drift reporting giới hạn** thay vì mở rộng sang plugin metadata platform vì:

1. **Đúng mục tiêu slice:** bài toán hiện tại là observability trên state đã có, không phải mở rộng domain plugin.
2. **Giảm rủi ro scope creep:** platform metadata đầy đủ kéo theo API, schema, lifecycle, ownership phức tạp.
3. **Giữ ổn định runtime semantics:** drift report chỉ là lớp đọc/quan sát, không làm đổi planner/executor policy lõi.
4. **Nhanh tạo giá trị vận hành:** operator có thể debug drift ngay, không chờ một hệ thống metadata lớn.

Nguyên tắc: **read-oriented observability layer**, không phải feature platform layer.

---

## 5) Recommended narrow path

Đề xuất đường đi hẹp, theo thứ tự:

1. **Chuẩn hóa payload observability cho extension state**
   - Một schema summary nhỏ cho operator (per-extension + aggregate).
2. **Bổ sung drift-report builder**
   - Tính aggregate từ store/runtime touch records hiện có.
3. **Nối vào diagnostics entrypoint hiện hữu**
   - Đưa extension drift summary vào `debug-dump`.
4. **Bổ sung query/inspection nhẹ ở app runtime path**
   - Tại enforcement hoặc workflow runtime report, chỉ mang tính quan sát.
5. **Không thêm policy branch mới**
   - Drift không thay đổi quyết định routing ở slice này.

---

## 6) Package / module mapping

### Runtime layer

- `packages/runtime/src/extensions/extension-runtime-state-store.ts`
  - Nguồn dữ liệu persisted state để dựng drift report.

- `packages/runtime/src/extensions/touch-extension-state.ts`
  - Nguồn transition event cơ bản (`first/same/updated`) cho snapshot hiện tại.

- `packages/runtime/src/extensions/extension-fingerprint.ts`
  - Điểm cần guard để tránh false drift do fingerprint input không ổn định.

- `packages/runtime/src/diagnostics/debug-dump.ts`
  - Điểm surface operator-facing chính cho drift summary.

### App enforcement layer

- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - Điểm liên kết observability để gắn runtime-state insight vào enforcement diagnostics (additive).

### Khả năng thêm module mới (khuyến nghị)

- `packages/runtime/src/extensions/extension-drift-report.ts` (mới)
  - Build báo cáo drift từ store + runtime touch context.

- `packages/runtime/src/extensions/extension-drift-report.test.ts` (mới)
  - Test cho aggregate/edge cases drift reporting.

---

## 7) Proposed phases

### Phase 0 — Scope freeze cho observability-only
- Chốt rõ: chỉ extension-state observability/drift reporting.
- Khóa out-of-scope: không platform parity, không metadata subsystem expansion.

### Phase 1 — Drift report model
- Định nghĩa schema report (summary + per-extension).
- Chốt metrics tối thiểu: tổng extension, số `first/same/updated`, danh sách drift nóng.

### Phase 2 — Runtime report builder
- Implement builder đọc từ runtime-state store.
- Tạo output deterministic để dễ debug/so sánh.

### Phase 3 — Diagnostics integration
- Nối report vào `debug-dump`.
- Bảo đảm khi store lỗi vẫn degrade có kiểm soát và báo warning rõ.

### Phase 4 — Enforcement-facing additive visibility
- Nối insight nhẹ vào `enforce-mcp-routing` output/log boundary (nếu phù hợp).
- Không đổi semantics policy routing.

### Phase 5 — Validation & docs closure
- Test report correctness + malformed store/failure degrade.
- Cập nhật artifact chứng minh không vượt phạm vi.

---

## 8) Risks / watchouts

1. **False drift do fingerprint input noise**  
   Mitigation: giữ fingerprint input ổn định theo contract đã khóa.

2. **Drift report bị hiểu nhầm là policy signal**  
   Mitigation: tài liệu + naming khẳng định đây là observability signal, không phải decision rule.

3. **Over-reporting gây nhiễu operator**  
   Mitigation: mặc định summary gọn; chỉ mở rộng chi tiết khi debug dump bật.

4. **Scope trượt sang metadata management**  
   Mitigation: chỉ dùng dữ liệu có sẵn từ runtime state/fingerprint persistence; không thêm catalog API.

5. **Failure path không rõ ràng**  
   Mitigation: chuẩn hóa warning/error field trong drift report, không fail hard luồng chính.

---

## 9) Guiding recommendation

DH nên thực thi slice tiếp theo theo định hướng:

- **Extension-state observability first** (operator nhìn thấy state/drift rõ ràng).
- **Bounded drift reporting** (đủ sâu để vận hành, đủ hẹp để an toàn phạm vi).
- **Diagnostics integration qua surface hiện có** (`debug-dump`, enforcement boundary).
- **No plugin platform expansion** trong slice này.

Nếu tương lai cần plugin metadata platform parity, đó phải là một scope độc lập sau khi observability slice này ổn định.
