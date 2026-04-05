# Privacy And Local Data

`dh` được thiết kế theo hướng local-first.

## Dữ liệu local nằm ở đâu?

Khi bạn dùng `dh`, project sẽ tạo local runtime state trong `.dh/`.

Ví dụ các loại dữ liệu local:

- SQLite database
- workflow/session state
- chunk cache
- ANN/HNSW semantic cache
- telemetry logs
- debug dump

## `dh` có gửi code của tôi ra ngoài không?

Mặc định:

- phần lớn runtime state là local
- indexing, chunking, graph, SQLite persistence đều là local

Khi bạn bật semantic retrieval bằng provider thật và set `OPENAI_API_KEY`, một số nội dung cần embed có thể được gửi tới embedding provider theo config hiện tại.

## Telemetry có gửi ra ngoài không?

Hiện tại telemetry của project được ghi local vào `.dh/telemetry/events.jsonl`.

Không có cơ chế gửi telemetry này tới external service trong current implementation.

## API key được lưu ở đâu?

Khuyến nghị là set API key qua environment variable, ví dụ:

```sh
export OPENAI_API_KEY="sk-..."
```

Không nên commit key vào repo hoặc lưu vào file demo/example.

## Làm sao để xóa local state?

Bạn có thể xóa `.dh/` trong project nếu muốn reset local runtime state của project đó.

Lưu ý: thao tác này sẽ xóa index, DB và cache local của `dh` cho project hiện tại.
