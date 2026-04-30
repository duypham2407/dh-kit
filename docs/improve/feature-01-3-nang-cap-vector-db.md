# Cải tiến 3: Nâng cấp SQLite + ANN Index thành Vector DB chuyên dụng

- **Vấn đề của dh-kit**: File `ann-index.ts` và thư mục `sqlite/repositories/embeddings-repo.ts` cho thấy họ tự build cơ chế tìm kiếm Vector (Approximate Nearest Neighbor) trên nền SQLite. Điều này linh hoạt nhưng hiệu năng query vector trên SQLite thuần không thể so sánh với các công cụ chuyên dụng.
- **Đề xuất**: Ở tầng Rust, hãy tích hợp thẳng LanceDB hoặc Qdrant (Local Rust Crate). Chúng được tối ưu hóa ở mức phần cứng cho việc query vector, giúp quá trình Retrieval (RAG) diễn ra trong vài mili-giây, ngay cả với codebase lớn.
