# AI đọc hiểu code nhanh và chắc cho DH: cấu trúc kỹ thuật và ưu tiên triển khai

Last reviewed against code: 2026-04-11

## Mục tiêu

Tài liệu này chốt lại cấu trúc kỹ thuật để AI trong DH đọc hiểu code **nhanh, đúng, và kiểm chứng được** mà không cần “đọc file tuần tự từng chữ”.

Nội dung được viết theo hướng kiến trúc thực dụng, dùng làm tài liệu tham chiếu cho quyết định sản phẩm/runtime trong các pha tiếp theo của DH.

---

## 1. Tư duy đúng: đừng để AI "đọc file", hãy để nó "đọc hệ thống"

### Khái niệm

Đọc code hiệu quả không bắt đầu từ raw file text. Nó bắt đầu từ mô hình hệ thống:

- entry points
- symbol quan trọng
- quan hệ import/call/reference
- boundaries giữa package/module
- luồng dữ liệu chính

### Vì sao quan trọng

- Giảm nhiễu: không nạp context dư thừa.
- Tăng độ đúng: kết luận dựa trên quan hệ thực của codebase.
- Tăng tốc: đi đúng điểm nóng thay vì quét toàn bộ file.

### Áp dụng cho DH

- Mọi query phải qua bước xác định intent trước khi lấy nội dung.
- Retrieval mặc định là hybrid (keyword + symbol/AST + semantic + graph), không dùng một nguồn đơn lẻ.
- Runtime giữ kỷ luật qua policy/gating thay vì để model tự quyết toàn bộ.

---

## 2. 12 kỹ thuật quan trọng nhất

> Đây là 12 kỹ thuật cốt lõi để đạt chất lượng “đọc nhanh và chắc” ở cấp sản phẩm.

### 1) AST-first parsing

**Là gì:** Parse code thành AST trước khi search sâu.
**Giá trị:** Hiểu đúng cấu trúc cú pháp, giảm lỗi nhầm tên/chuỗi.
**Áp dụng DH:** AST là pipeline mặc định cho indexing; regex chỉ fallback.

### 2) Symbol indexing

**Là gì:** Index theo symbol (function/class/method/interface/type/exported API).
**Giá trị:** Hỗ trợ definition/reference lookup đáng tin cậy.
**Áp dụng DH:** Symbol là anchor chính cho retrieval và context builder.

### 3) Import graph

**Là gì:** Đồ thị phụ thuộc module-file qua import/export.
**Giá trị:** Thấy dependency topology của hệ thống.
**Áp dụng DH:** Dùng để mở rộng context nhẹ, kiểm soát theo depth/budget.

### 4) Call graph

**Là gì:** Đồ thị quan hệ gọi hàm/method.
**Giá trị:** Thiết yếu cho trace flow và impact analysis.
**Áp dụng DH:** Ưu tiên call graph khi query hỏi “chạy qua đâu”.

### 5) Symbol-based chunking

**Là gì:** Cắt chunk theo ranh giới có nghĩa (symbol/block) thay vì token cố định.
**Giá trị:** Chunk giữ trọn ngữ cảnh logic, giảm mất mạch.
**Áp dụng DH:** Chuẩn hóa `symbol_chunk` làm loại chunk chủ lực.

### 6) Hierarchical summaries

**Là gì:** Tóm tắt theo tầng: symbol -> file -> module -> subsystem.
**Giá trị:** Trả lời câu hỏi rộng mà vẫn truy ngược chi tiết.
**Áp dụng DH:** Summary phải link ngược về evidence; có cơ chế invalidation theo hash/version.

### 7) Evidence packet building

**Là gì:** Gói bằng chứng chuẩn gồm file/symbol/line/snippet/reason/confidence.
**Giá trị:** Chuyển từ “model opinion” sang “kết luận có chứng cứ”.
**Áp dụng DH:** Final answer bắt buộc map được về evidence packet.

### 8) Query planning

**Là gì:** Lập retrieval plan trước khi chạy tools (intent, seed terms, tool profile, budget, retry).
**Giá trị:** Kiểm soát cost/latency/chất lượng ổn định.
**Áp dụng DH:** Planner là bước bắt buộc trước execution.

### 9) Progressive zoom

**Là gì:** Mở context theo lớp: rộng -> vừa -> sâu.
**Giá trị:** Tránh over-retrieval, vẫn đủ dữ kiện khi cần đi sâu.
**Áp dụng DH:** Chỉ zoom sâu khi gate cho thấy evidence chưa đủ.

### 10) Confidence gating

**Là gì:** Cổng kiểm tra độ chắc chắn trước final answer.
**Giá trị:** Giảm hallucination kỹ thuật.
**Áp dụng DH:** Gắn vào pre-answer policy; fail thì bắt buộc retry retrieval.

### 11) Explicit verification

**Là gì:** Xác minh tường minh các claim quan trọng bằng cross-check evidence.
**Giá trị:** Tránh kết luận dựa trên một nguồn mỏng.
**Áp dụng DH:** Claim quan trọng phải có ít nhất 1–2 evidence items độc lập hoặc quan hệ bổ sung (symbol + graph).

### 12) Runtime tool/policy enforcement

**Là gì:** Enforce tool usage và answer policy ở runtime layer (không chỉ prompt).
**Giá trị:** Kỷ luật vận hành ổn định giữa agent/mode/session.
**Áp dụng DH:** Dùng hook/policy để chặn trả lời khi thiếu bằng chứng hoặc dùng tool sai chiến lược.

---

## 3. Stack tối thiểu để AI đọc code tốt

Đây là baseline stack nên có để DH đạt chất lượng thực dụng:

1. **Parser & Indexer lớp cấu trúc**
   - AST parser theo ngôn ngữ
   - symbol extraction
   - incremental indexing theo file hash

2. **Graph intelligence**
   - import graph
   - call graph
   - reference edges

3. **Hybrid retrieval engine**
   - keyword retrieval
   - symbol/AST retrieval
   - semantic retrieval
   - graph expansion có điều kiện

4. **Context builder theo evidence packet**
   - assemble context tối thiểu nhưng đủ
   - giữ provenance rõ ràng

5. **Verification & gating layer**
   - confidence gate
   - explicit verification rules
   - retry policy khi evidence thiếu

6. **Telemetry/quality loop**
   - query logs
   - tool usage logs
   - evidence coverage metrics

> Kết luận thực dụng: nếu thiếu (1), (3), hoặc (5), hệ thống sẽ trả lời nhanh nhưng kém chắc; nếu thiếu (2), hệ thống khó trace flow; nếu thiếu (6), chất lượng khó cải thiện theo thời gian.

---

## 4. Với DH, nên ưu tiên kỹ thuật nào trước?

Ưu tiên dưới đây bám hướng kiến trúc hiện tại của DH (hybrid retrieval + code intelligence + evidence-first + runtime discipline):

### P0 – Bắt buộc trước

1. **AST-first parsing + Symbol indexing**
   - Nền dữ liệu cấu trúc cho toàn bộ retrieval.
2. **Evidence packet schema + pre-answer confidence gate**
   - Nền cho hành vi evidence-first thật sự.
3. **Query planning cơ bản (intent -> tool profile -> budget)**
   - Nền để kiểm soát quality/cost nhất quán.

### P1 – Tăng độ chắc cho truy vấn khó

4. **Import graph + Call graph expansion có kiểm soát**
   - Đặc biệt cho `trace_flow`, `impact_analysis`, `bug_investigation`.
5. **Symbol-based chunking chuẩn hóa**
   - Nâng chất lượng context cho LLM.
6. **Explicit verification rules theo loại claim**
   - Claim quan trọng cần cross-check rõ ràng.

### P2 – Tối ưu quy mô và trải nghiệm

7. **Hierarchical summaries có invalidation**
   - Tối ưu câu hỏi broad codebase.
8. **Telemetry cho evidence coverage/confidence drift**
   - Đóng vòng lặp cải tiến retrieval.
9. **Policy tuning theo lane/mode**
   - Giữ kỷ luật khác nhau giữa quick/delivery/migration.

---

## 5. Một pipeline "đọc code nhanh và chắc" mẫu

Ví dụ câu hỏi: **"Lane lock trong DH được enforce ở đâu và nếu cần sửa thì ảnh hưởng gì?"**

### Bước 0 — Xác định intent

- Intent chính: `trace_flow` + `impact_analysis`
- Seed terms: `lane lock`, `session state`, `pre-answer`, `workflow`, `mode`

### Bước 1 — Retrieval lớp rộng (ít tốn kém)

1. Symbol search cho các symbol có tên liên quan lane/session/workflow.
2. Keyword search để bắt config/enum/stage names.
3. Semantic search để nối phrasing người dùng với tên kỹ thuật nội bộ.

**Đầu ra:** danh sách seed files/symbols có score.

### Bước 2 — Progressive zoom theo graph

1. Mở import graph 1 hop từ seed files.
2. Mở call graph theo hướng entry -> enforcement points.
3. Cắt nếu vượt budget hoặc thêm node noise.

**Đầu ra:** tập node đã mở rộng có liên quan cao, không lan tràn.

### Bước 3 — Assemble evidence packet

Mỗi claim dự kiến phải có evidence:

- `file_path`
- `symbol`
- `line_range`
- `snippet`
- `why_relevant`
- `confidence_item`

Ví dụ claim map:

- Claim A: lane lock được inject ở session context path -> evidence từ symbol xử lý session state.
- Claim B: pre-answer gate không override lane nhưng chặn answer thiếu evidence -> evidence từ policy/gate path.

### Bước 4 — Explicit verification

- Cross-check claim A bằng ít nhất 2 nguồn bổ sung (symbol + call/reference edge).
- Nếu mâu thuẫn, hạ confidence và quay lại Bước 2 mở rộng có kiểm soát.

### Bước 5 — Confidence gate trước khi trả lời

Điều kiện pass ví dụ:

- Mỗi claim trọng yếu có evidence line-range cụ thể.
- Coverage đủ cho cả câu hỏi “ở đâu” và “ảnh hưởng gì”.
- Không còn mâu thuẫn chưa giải quyết trong packet.

Nếu fail: retry retrieval theo nhánh còn thiếu (không reset toàn bộ).

### Bước 6 — Final answer từ evidence packet

- Trả lời ngắn gọn phần kết luận.
- Kèm references theo file/symbol/line.
- Nêu rõ confidence tổng và các giả định còn tồn tại.

---

## 6. Những anti-pattern cần tránh

1. **Text-first tuyệt đối:** quét raw file lớn rồi để model tự suy luận.
2. **Single-tool mindset:** chỉ semantic hoặc chỉ keyword cho mọi query.
3. **Fixed-token chunking mặc định:** làm vỡ ngữ nghĩa symbol.
4. **Graph expansion không kiểm soát:** nhiễu cao, tốn budget.
5. **Summary-only answering:** không truy ngược evidence nguồn.
6. **Confidence “trang trí”:** có điểm số nhưng không ràng buộc hành vi.
7. **Không explicit verification:** kết luận từ một chứng cứ mỏng.
8. **Không runtime enforcement:** policy chỉ nằm ở prompt nên dễ drift.
9. **Không telemetry:** không biết vì sao chất lượng tăng/giảm.

---

## 7. Kỹ thuật nâng cao nếu muốn Cursor-level hơn

Các kỹ thuật sau không bắt buộc cho baseline, nhưng cần nếu DH muốn đạt trải nghiệm cao hơn:

1. **Query rewriter theo intent + codebase dialect**
   - Tự rewrite seed terms theo naming conventions nội bộ.

2. **Learning-to-rank cho evidence retrieval**
   - Học từ query logs để cải thiện ranking theo task type.

3. **Cross-file program slice extraction**
   - Trích “lát cắt hành vi” thay vì snippet rời.

4. **Adaptive budgeting theo độ khó query**
   - Budget động theo uncertainty và expected impact.

5. **Temporal/code-change awareness**
   - Ưu tiên evidence từ vùng code mới thay đổi khi điều tra regression.

6. **Claim-level contradiction detector**
   - Tự phát hiện claim xung đột giữa các evidence items.

7. **Mode-aware policy tuning (quick/delivery/migration)**
   - Ngưỡng confidence và độ sâu verification khác nhau theo mode.

---

## 8. Nếu phải chốt ngắn gọn: 5 kỹ thuật đáng tiền nhất

Nếu DH chỉ chọn 5 kỹ thuật tạo ROI cao nhất ở giai đoạn hiện tại:

1. **AST-first parsing**
2. **Symbol indexing**
3. **Import + call graph expansion có kiểm soát**
4. **Evidence packet building**
5. **Confidence gating + explicit verification**

Lý do: bộ 5 này tạo chuỗi đầy đủ từ “hiểu cấu trúc” -> “thu thập bằng chứng” -> “khóa chất lượng trước khi trả lời”.

---

## 9. Công thức ngắn cho DH

> **Navigate structurally -> Retrieve minimally -> Verify explicitly -> Answer from evidence packets.**

Diễn giải áp dụng:

- **Navigate structurally:** bắt đầu từ symbol/graph, không từ raw text đại trà.
- **Retrieve minimally:** lấy đúng-ngắn-đủ theo plan và budget.
- **Verify explicitly:** mọi claim quan trọng đều phải được xác minh tường minh.
- **Answer from evidence packets:** câu trả lời phải truy ngược được về file/symbol/line cụ thể.
