# Cải tiến 1: Chuyển dịch hoàn toàn logic Graph & AST xuống Rust

- **Vấn đề của dh-kit**: Trong thư mục `packages/intelligence/src/graph/`, ta thấy TS vẫn đang đảm nhiệm việc `extract-call-edges.ts` và `extract-import-edges.ts`. Việc dùng TS để duyệt AST và dựng Call Graph cho một project lớn sẽ làm nghẽn Event Loop của Node.js/Bun.
- **Đề xuất**: Đẩy 100% logic trích xuất đồ thị gọi hàm (Call Graph) và Import/Export xuống crate `dh-graph` của Rust. Tầng TypeScript chỉ nên gửi lệnh: *"Cho tôi biết hàm A gọi đến những hàm nào"*, và Rust sẽ query trong bộ nhớ của nó rồi trả về kết quả cuối cùng.
