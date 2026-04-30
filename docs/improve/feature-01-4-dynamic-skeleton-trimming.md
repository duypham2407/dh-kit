# Cải tiến 4: Áp dụng "Dynamic Skeleton Trimming"

- **Nguyên tắc**: Đừng gửi toàn bộ nguyên mẫu (Skeleton) cố định cho LLM. Tầng Rust của bạn nên có cơ chế tự động cắt tỉa (Trimming) dựa trên ngân sách token hiện tại của LLM (Context Window).
- **Chi tiết**: Nếu Context Window còn rộng, trả về Skeleton kèm Docstrings. Nếu Context Window sắp cạn, Rust chỉ trả về tên hàm và kiểu dữ liệu (Types/Interfaces) mà thôi.
