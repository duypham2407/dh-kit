# DH Indexing Model

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này mô tả mô hình dữ liệu và indexing strategy cho `dh`. Mục tiêu là để AI có thể:

- tìm đúng symbol
- hiểu quan hệ giữa các module
- trace call flow qua nhiều file
- xây context chất lượng cao cho LLM

Indexing model là nền của toàn bộ retrieval pipeline. Nếu schema yếu hoặc thiếu quan hệ, quality của answer sẽ giảm mạnh dù model tốt.

Current implementation note:

- Current codebase đã có chunk persistence, embeddings persistence, AST-first symbol extraction, import extraction, call-site extraction, ANN-backed semantic path và index workflow runner tương ứng với roadmap hiện tại.
- File này vẫn mô tả indexing model đầy đủ ở mức kiến trúc; các phần còn lại nên được đọc như hướng mở rộng schema và tối ưu hóa chiều sâu index hơn là gap completion của current implementation.

## Nguyên tắc thiết kế

1. Index theo structure của code, không chỉ theo text.
2. Tách rõ file, symbol, chunk và edge.
3. Mọi entity cần có định danh ổn định và metadata đủ để incremental reindex.
4. Chunk phải bám theo symbol boundary khi có thể.
5. Mọi search result nên truy ngược được về file gốc và line range.
6. Embedding lifecycle phải hỗ trợ semantic retrieval mặc định luôn bật nhưng vẫn tiết kiệm chi phí.

## Các thực thể cốt lõi

Hệ thống nên index ít nhất 5 loại thực thể:

1. `files`
2. `symbols`
3. `chunks`
4. `edges`
5. `query_logs`

## 1. File Model

Mỗi file là đơn vị vật lý trên filesystem.

Các field khuyến nghị:

- `id`
- `workspace_id`
- `path`
- `language`
- `size_bytes`
- `content_hash`
- `updated_at`
- `indexed_at`
- `parse_status`
- `parse_error`

Vai trò:

- giúp phát hiện file thay đổi
- là node gốc để nối tới symbols và chunks
- hỗ trợ incremental indexing

## 2. Symbol Model

Symbol là đơn vị ngữ nghĩa quan trọng nhất cho code understanding.

Các loại symbol nên hỗ trợ:

- function
- class
- method
- interface
- type alias
- variable nếu là exported hoặc top-level quan trọng
- route handler
- config block
- schema block

Các field khuyến nghị:

- `id`
- `file_id`
- `workspace_id`
- `name`
- `qualified_name`
- `kind`
- `signature`
- `visibility`
- `is_exported`
- `parent_symbol_id`
- `start_line`
- `start_column`
- `end_line`
- `end_column`
- `symbol_hash`

Vai trò:

- hỗ trợ definition lookup
- hỗ trợ explain module theo symbol
- làm anchor cho chunking và graph expansion

## 3. Chunk Model

Chunk là đơn vị context để retrieval và LLM dùng trực tiếp.

Chunk không nên chỉ là text cắt theo token. Chunk nên được build theo structure thật.

Loại chunk nên hỗ trợ:

- `symbol_chunk`
- `block_chunk`
- `file_header_chunk`
- `config_chunk`
- `doc_chunk`

Các field khuyến nghị:

- `id`
- `workspace_id`
- `file_id`
- `symbol_id` nullable
- `chunk_type`
- `content`
- `content_hash`
- `start_line`
- `end_line`
- `token_estimate`
- `embedding_id` nullable
- `rank_features_json`

Vai trò:

- semantic retrieval
- answer context assembly
- ranking theo signal từ symbol và graph

## 4. Edge Model

Edge giúp hệ thống hiểu mối quan hệ trong codebase. Đây là phần tạo khác biệt lớn với text-only search.

Các edge chính:

- `import_edge`
- `export_edge`
- `call_edge`
- `reference_edge`
- `containment_edge`

Field khuyến nghị cho edge tổng quát:

- `id`
- `workspace_id`
- `edge_type`
- `from_node_type`
- `from_node_id`
- `to_node_type`
- `to_node_id`
- `source_file_id`
- `start_line`
- `end_line`
- `metadata_json`

Giải thích:

- `from_node_type` và `to_node_type` cho phép edge nối giữa file, symbol hoặc chunk
- `metadata_json` cho phép lưu chi tiết như import kind, alias, unresolved target

## 5. Embedding Model

Embedding phục vụ semantic retrieval. Đây là lớp bổ sung, không thay thế symbol hoặc graph, nhưng trong `dh` nó là capability mặc định luôn bật.

Field khuyến nghị:

- `id`
- `workspace_id`
- `chunk_id`
- `model_name`
- `vector_dim`
- `content_hash`
- `created_at`

Vector có thể được lưu trong vector store riêng hoặc lớp storage thích hợp tùy stack.

Chính sách mặc định của `dh`:

- provider: OpenAI
- model: `text-embedding-3-small`
- embedding chỉ cập nhật khi chunk đổi hoặc file đổi
- không re-embed toàn bộ repo ở query time

## 6. Query Log Model

Query log là nền để debug retrieval quality.

Field khuyến nghị:

- `id`
- `workspace_id`
- `query_text`
- `intent`
- `plan_json`
- `tools_used_json`
- `top_results_json`
- `latency_ms`
- `confidence`
- `answer_status`
- `created_at`

Vai trò:

- giải thích vì sao answer tốt hoặc kém
- tune scoring
- phân tích tool enforcement failures

## Quan hệ giữa các thực thể

Mô hình quan hệ cấp cao:

```text
Workspace
-> Files
-> Symbols
-> Chunks
-> Edges
-> Embeddings
-> Query Logs
```

Chi tiết hơn:

```text
File -> Symbol
File -> Chunk
Symbol -> Chunk
Symbol -> Symbol via call/reference
File -> File via import/export
Chunk -> Embedding
Query -> Top Chunks and Symbols
```

## Các index logic quan trọng

Ngoài database indexes, hệ thống cần các logical indexes sau.

### File Index

Cho phép:

- phát hiện file thay đổi
- lọc theo language hoặc path
- truy ngược từ symbol về file

### Symbol Index

Cho phép:

- tìm symbol theo tên
- tìm definition
- group theo kind hoặc module

### Chunk Index

Cho phép:

- semantic search
- chunk ranking
- context assembly theo line range

### Graph Index

Cho phép:

- tìm dependencies
- tìm dependents
- tìm callers và callees
- trace flow qua nhiều file

## Chunking strategy

Chunking là điểm ảnh hưởng trực tiếp tới context quality.

Quy tắc khuyến nghị:

1. Ưu tiên chunk theo symbol boundary.
2. Nếu symbol quá lớn, cắt tiếp theo block logic.
3. Giữ line range rõ ràng cho mỗi chunk.
4. Không chunk ngẫu nhiên theo fixed token nếu có thể tránh.
5. Với file config hoặc docs, dùng chunking strategy riêng.

Ví dụ:

- function nhỏ -> 1 chunk
- class lớn -> chunk theo method
- config file -> chunk theo section
- route file -> chunk theo route handler

## Qualified naming strategy

Để hạn chế ambiguity khi nhiều symbol trùng tên, nên có `qualified_name`.

Ví dụ:

- `src/auth/service.ts#login`
- `src/auth/service.ts#AuthService.login`
- `packages/core/config.ts#defaultConfig`

`qualified_name` giúp:

- definition lookup rõ hơn
- ranking ổn định hơn
- graph expansion ít nhầm hơn

## Incremental indexing

Hệ thống không nên full reindex toàn bộ repo mỗi lần có thay đổi.

Incremental indexing flow khuyến nghị:

1. detect changed files bằng hash hoặc file watcher
2. parse lại file thay đổi
3. xóa symbol, chunk, edge cũ của file đó
4. insert symbol, chunk, edge mới
5. refresh embeddings của chunk thay đổi
6. cập nhật timestamps và index run metadata

Điều kiện để incremental indexing đúng:

- `content_hash` tin cậy
- delete-and-rebuild theo file boundary
- module resolution ổn định

## Module resolution là phần bắt buộc

Import graph chỉ có giá trị nếu resolve import chính xác.

Indexing layer cần xử lý:

- relative imports
- alias imports
- package boundaries
- monorepo workspace packages
- unresolved imports

Ngay cả unresolved imports cũng nên được lưu lại để phục vụ diagnostics.

## Parse status và degraded mode

Không phải file nào cũng parse thành công. Hệ thống cần lưu parse status rõ ràng.

Ví dụ trạng thái:

- `parsed`
- `skipped`
- `unsupported_language`
- `parse_error`

Khi parse lỗi, hệ thống vẫn có thể fallback:

- index file metadata
- index text chunk tối thiểu
- đánh dấu evidence confidence thấp hơn

## Metadata phục vụ ranking

Chunk và symbol nên có thêm feature metadata để hỗ trợ ranking.

Ví dụ:

- exported hay không
- top-level hay nested
- nằm trong file có tên `route`, `service`, `controller`, `config`
- có test file liên quan không
- graph degree cao hay thấp

Các feature này không thay thế semantic score, nhưng rất hữu ích khi rerank.

## Storage recommendations

Khuyến nghị giai đoạn đầu:

1. SQLite cho metadata, symbols, chunks, edges, query logs.
2. Embeddings lưu trong lớp storage đơn giản, chưa cần tách service sớm.
3. Cache riêng cho parsed AST và embedding generation.

Đừng bắt đầu bằng external distributed storage nếu sản phẩm còn ở giai đoạn architecture-first.

## Tính đúng đắn quan trọng hơn tối ưu sớm

Ở phase đầu, ưu tiên:

1. symbol extraction đúng
2. module resolution đúng
3. edge building đúng
4. line ranges đúng

Tối ưu tốc độ chỉ nên làm sau khi retrieval quality đã đủ tốt.

## Các lỗi kiến trúc cần tránh

1. Chỉ index text chunks mà không có symbols.
2. Không lưu edges giữa symbols hoặc files.
3. Không giữ line range cho chunks.
4. Không có content hash cho incremental indexing.
5. Không lưu parse status và parse errors.
6. Gộp nhiều loại edge vào một mô hình mơ hồ không có metadata.

## Tài liệu liên quan

- `docs/architecture/system-overview.md`
- `docs/architecture/retrieval-strategy.md`
- `docs/project-architecture.md`

## Kết luận

Indexing model tốt là thứ biến codebase thành knowledge graph có thể truy vấn, thay vì chỉ là tập file văn bản. Muốn AI hiểu codebase sâu và chắc, file, symbol, chunk, edge và query log đều phải là first-class data models.
