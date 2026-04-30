# Cải tiến 2: Tối ưu hóa nút thắt cổ chai JSON-RPC (Bridge)

- **Vấn đề của dh-kit**: Sử dụng `dh-jsonrpc-stdio-client.ts` (truyền text JSON qua Stdio) là một cách tốt để bắt đầu. Tuy nhiên, khi gửi qua lại các mảng Vector Embeddings lớn (VD: mảng float32 chứa 1536 chiều của OpenAI) hoặc cây AST khổng lồ, việc serialize/deserialize JSON sẽ ngốn rất nhiều CPU và độ trễ.
- **Đề xuất**: Thay vì JSON thuần, hãy nâng cấp giao thức giao tiếp giữa Rust và TS bằng MessagePack hoặc Protobuf/gRPC. Dữ liệu truyền đi sẽ ở dạng nhị phân (binary), giúp tốc độ giao tiếp giữa Host và Worker tăng lên từ 5-10 lần.
