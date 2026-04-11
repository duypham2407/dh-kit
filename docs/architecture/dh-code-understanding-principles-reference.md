# DH — Nguyên tắc đọc hiểu code (bản tham chiếu nội bộ)

Last reviewed: 2026-04-11

## 1) Mục đích

Tài liệu 1 trang này chốt các nguyên tắc quyết định cho DH khi trả lời câu hỏi về code: **đọc theo cấu trúc, truy hồi lai (hybrid), trả lời dựa trên bằng chứng, xác minh trước khi kết luận, và giữ kỷ luật workflow/runtime**.

## 2) Nguyên tắc cốt lõi (6)

1. **Structural-first, không text-first**  
   Bắt đầu từ symbol/AST/graph, không quét file thô theo tuần tự.

2. **Hybrid retrieval là mặc định**  
   Kết hợp keyword + symbol/AST + semantic + graph expansion có kiểm soát; không phụ thuộc một kênh duy nhất.

3. **Retrieve tối thiểu nhưng đủ**  
   Lập plan theo intent, budget, retry; mở rộng theo progressive zoom (rộng → sâu) khi thật sự cần.

4. **Evidence-first answer**  
   Mỗi claim quan trọng phải map được về `file/symbol/line/snippet/reason`.

5. **Explicit verification trước final**  
   Cross-check claim trọng yếu bằng nguồn bổ sung (ví dụ: symbol + graph/reference), xử lý mâu thuẫn trước khi trả lời.

6. **Runtime/workflow discipline**  
   Policy/gate phải được enforce ở runtime (không chỉ trong prompt), bám mode/lane và quy tắc workflow của DH.

## 3) Do / Don’t (ngắn)

**Do**
- Dùng AST/symbol làm anchor chính khi điều hướng code.
- Trả lời kèm evidence packet ngắn gọn, truy ngược được.
- Ghi rõ confidence và giả định còn mở.
- Nếu evidence chưa đủ: retry retrieval theo nhánh thiếu, không đoán.

**Don’t**
- Không trả lời chỉ dựa trên summary hoặc “cảm giác model”.
- Không mở graph không giới hạn gây nhiễu và tốn budget.
- Không dùng 1 tool cho mọi loại câu hỏi.
- Không bypass gate xác minh trước final answer.

## 4) Default pipeline khuyến nghị cho DH

1. **Intent + plan**: phân loại câu hỏi (`trace_flow`, `impact_analysis`, `where-is`, …), đặt budget/tool profile.  
2. **Seed retrieval**: chạy hybrid retrieval lớp rộng để lấy seed files/symbols.  
3. **Progressive zoom**: mở graph có giới hạn (depth/budget/noise threshold).  
4. **Build evidence packet**: gom bằng chứng theo claim (file/symbol/line/snippet/reason/confidence).  
5. **Verify + gate**: cross-check claim trọng yếu; fail thì quay lại bước 3/4 theo thiếu hụt cụ thể.  
6. **Final answer**: kết luận ngắn, kèm references + confidence + assumptions.

## 5) Công thức ngắn cho DH

> **Điều hướng theo cấu trúc → Truy hồi tối thiểu → Xác minh tường minh → Trả lời từ evidence packet.**
