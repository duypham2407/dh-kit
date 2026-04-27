# Tổng hợp Chi tiết Thay đổi Kiến trúc dh-kit (Rust + TypeScript)

Dựa trên các tài liệu kiến trúc đã được chốt (đặc biệt là Migration Plan và Deep Dive 02) và những phân tích vừa qua, dưới đây là bản tổng hợp chi tiết và chuẩn xác nhất về những thay đổi bạn cần triển khai cho dh-kit.

Triết lý cốt lõi của toàn bộ quá trình này là: **"Rust sở hữu sự thật về cấu trúc (Structural Truth). TypeScript sở hữu sự thật về điều phối (Orchestration Truth)."** [cite: 2026-04-13-rust-ts-migration-plan-dh.md]

## 1. Đảo ngược mô hình tiến trình (Process Model Inversion)
Bạn cần thay đổi cách ứng dụng khởi động. Thay vì Node.js gọi Rust, Rust sẽ làm Host [cite: 2026-04-13-rust-ts-migration-plan-dh.md].

* **Rust Binary làm Host**: Khi người dùng gõ lệnh `dh ask ...`, file thực thi Rust (chuyển dịch từ logic `cmd/dh/main.go` cũ sang `dh-engine`) sẽ khởi chạy đầu tiên, đảm nhận việc parse CLI arguments và quản lý vòng đời ứng dụng [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-04-process-model.md].
* **TypeScript làm Worker**: Rust sẽ spawn (tạo tiến trình con) một TS worker (chạy bằng Node.js được bundle sẵn) để xử lý logic AI [cite: 2026-04-13-rust-ts-migration-plan-dh.md].
* **Quản lý vòng đời (Lifecycle)**: Rust sẽ theo dõi sức khỏe (health-check) của TS Worker. Nếu TS Worker bị crash, Rust sẽ tự động khởi động lại (restart) [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-04-process-model.md].

## 2. Triển khai Cầu nối JSON-RPC 2.0 chuẩn LSP (The Bridge)
Hủy bỏ hoàn toàn ý định dùng NAPI-RS. Cầu nối giao tiếp sẽ chạy qua luồng Stdio (Standard Input/Output) bằng giao thức JSON-RPC 2.0 [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-02-bridge-jsonrpc.md].

* **Content-Length Framing**: Cả Rust và TS phải bọc payload JSON bằng header `Content-Length: <size>\r\n\r\n` (giống hệt giao thức Language Server Protocol - LSP) để truyền tải an toàn các dữ liệu nhiều dòng như source code hay patch [cite: deep-dive-02-bridge-jsonrpc.md].
* **Quy tắc Stdio nghiêm ngặt**: Luồng `stdout` CHỈ ĐƯỢC DÙNG cho giao thức JSON-RPC. Tất cả các log debug, panic, hay error message của con người phải được đẩy sang `stderr` để không làm hỏng dữ liệu cầu nối [cite: deep-dive-02-bridge-jsonrpc.md].
* **Cơ chế Handshake**: Khi khởi động, TS Worker phải gửi request `initialize`, Rust phản hồi `InitializeResult` (chứa capabilities), sau đó TS gửi `initialized` để bắt đầu làm việc [cite: deep-dive-02-bridge-jsonrpc.md].

## 3. Dịch chuyển toàn bộ "Code Intelligence" xuống Rust
Lớp TypeScript không được phép giữ bản sao của đồ thị mã nguồn (AST, Graph). Bạn phải code các tính năng sau hoàn toàn bằng Rust [cite: 2026-04-13-rust-ts-migration-plan-dh.md]:

* **File Scanner & Incremental Indexer (dh-indexer)**: Quét thư mục, băm (hash) 3 tầng (content/structure/public_api) để phát hiện thay đổi và chỉ re-index những file cần thiết [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-01-indexer-parser.md].
* **Parser đa ngôn ngữ (dh-parser)**: Tích hợp tree-sitter bản native của Rust để cắt AST và trích xuất Symbol (hàm, class, biến) siêu tốc [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-01-indexer-parser.md].
* **Graph Engine (dh-graph)**: Dựng đồ thị thống nhất chứa 4 loại liên kết: symbol, import, call (gọi hàm), và reference (tham chiếu) [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-03-graph-engine.md].
* **Lưu trữ SQLite (dh-storage)**: Rust trực tiếp ghi các metadata, symbols, và edges này xuống file SQLite cục bộ [cite: 2026-04-13-rust-ts-migration-plan-dh.md].

## 4. Dịch chuyển Vector Search & Retrieval xuống Rust
Không dùng Node.js để tính toán toán học hay khoảng cách vector nữa [cite: 2026-04-13-rust-ts-migration-plan-dh.md].

* **Hybrid Search Engine (dh-query)**: Xây dựng các API tìm kiếm tại Rust bao gồm: keyword (ripgrep), structural (dựa trên graph), semantic (vector), và hybrid ranking [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-02-bridge-jsonrpc.md].
* **Thuật toán ANN (Approximate Nearest Neighbor)**: Tích hợp trực tiếp thuật toán HNSW hoặc extension `sqlite-vss` vào lõi Rust để quét vector cực nhanh trên RAM/Disk [cite: deep-dive-02-bridge-jsonrpc.md].
* **Tạo Evidence Packet**: Triển khai hàm RPC `query.buildEvidence` bên Rust. Rust sẽ tự động tập hợp các file liên quan, symbol, đồ thị, rank độ ưu tiên và trả về một object `EvidencePacket` gọn gàng [cite: deep-dive-02-bridge-jsonrpc.md].

## 5. Tối ưu hóa tầng TypeScript (Orchestration Layer)
Sau khi trút bỏ được gánh nặng xử lý dữ liệu nặng, tầng TypeScript (`packages/opencode-app`) chỉ cần tập trung vào nghiệp vụ AI thuần túy [cite: 2026-04-13-rust-ts-migration-plan-dh.md]:

* **Sử dụng Coarse-grained APIs**: Agent TS không nên gọi lắt nhắt từng lệnh tìm symbol rồi tự ráp lại. Thay vào đó, gọi thẳng RPC `query.buildEvidence` truyền vào câu hỏi của user, nhận lại packet ngữ cảnh từ Rust và đưa vào Prompt LLM [cite: deep-dive-02-bridge-jsonrpc.md].
* **Multi-Agent Workflow**: Hoàn thiện luồng luân chuyển trạng thái (State Machine) giữa các Agent (Master Orchestrator, Product Lead, Solution Lead, Dev, Reviewer, QA) [cite: 2026-04-13-rust-ts-migration-plan-dh.md].
* **Quản lý LLM & MCP**: Giữ các Client gọi API của OpenAI, Anthropic và hệ thống MCP (Model Context Protocol) ở lại TypeScript để bắt kịp tốc độ cập nhật của hệ sinh thái [cite: 2026-04-13-rust-ts-migration-plan-dh.md].
* **Thực thi Tool an toàn**: Khi AI muốn chạy lệnh terminal, TS gọi `tool.execute` qua RPC. Rust sẽ là chốt chặn cuối cùng kiểm duyệt (bash-guard) và thực thi an toàn [cite: 2026-04-13-rust-ts-migration-plan-dh.md, deep-dive-02-bridge-jsonrpc.md].
