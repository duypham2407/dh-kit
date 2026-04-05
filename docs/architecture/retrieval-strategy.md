# DH Retrieval Strategy

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này mô tả retrieval strategy cho `dh`. Mục tiêu là để mỗi query được xử lý bằng đúng tập tools, đúng trình tự mở rộng context, và tạo ra final answer dựa trên evidence rõ ràng.

Retrieval strategy là nơi quyết định chất lượng câu trả lời nhiều hơn bản thân model.

Current implementation note:

- Current codebase đã có retrieval core usable ở TypeScript: definition/reference search, graph expansion, normalized results, evidence packets, semantic retrieval pipeline và semantic mode wiring.
- Tài liệu này vẫn mô tả strategy mục tiêu; những phần như runtime-level enforcement và scale optimization vẫn còn là phần tiếp theo.

## Nguyên tắc nền

1. Không có một loại search nào đủ cho mọi query.
2. Query code understanding phải dùng hybrid retrieval.
3. Graph expansion chỉ nên chạy sau khi đã có seed results đủ tốt.
4. Context builder phải làm việc trên evidence packets, không phải raw files.
5. Tool usage phải được enforce bằng policy ở runtime; current implementation đã có policy TS-side và audit bridge, còn process-level Go enforcement vẫn pending.
6. Semantic retrieval mặc định luôn bật, nhưng phải có mode điều khiển chi phí.
7. Query không được phép hoàn tất nếu chưa thỏa policy tool enforcement và evidence gating.

## Các loại retrieval chính

Hệ thống nên có ít nhất 4 loại retrieval độc lập.

### 1. Keyword Search

Phù hợp với:

- exact match
- identifier match
- config keys
- known strings

Điểm mạnh:

- nhanh
- chính xác với tên cụ thể
- tốt cho bootstrap retrieval

Điểm yếu:

- yếu với query mơ hồ hoặc diễn đạt tự nhiên

### 2. Symbol or AST Search

Phù hợp với:

- where defined
- who references this
- tìm exported API
- tìm route handlers hoặc schema declarations

Điểm mạnh:

- ngữ nghĩa cấu trúc tốt hơn text search
- hỗ trợ definition và reference lookup chắc chắn hơn

Điểm yếu:

- phụ thuộc chất lượng parser và index

### 3. Semantic Search

Phù hợp với:

- query tự nhiên
- module explanation
- query mơ hồ
- truy vấn theo hành vi thay vì tên cụ thể

Điểm mạnh:

- tốt với natural language
- giúp nối user phrasing với code phrasing

Điểm yếu:

- không đủ tin cậy nếu dùng một mình
- có chi phí compute và storage cao hơn keyword hoặc symbol search

Chính sách của `dh`:

- semantic retrieval mặc định `always`
- embedding provider mặc định là OpenAI
- embedding model mặc định là `text-embedding-3-small`
- user có thể đổi semantic mode sang `auto` hoặc `off`
- không dùng local embedding backend mặc định

### 4. Graph Expansion

Phù hợp với:

- trace flow
- impact analysis
- caller/callee expansion
- dependency tracing

Điểm mạnh:

- tạo context nhiều bước theo cấu trúc thật của codebase

Điểm yếu:

- dễ kéo quá nhiều noise nếu seed result ban đầu yếu

## Intent classes

Orchestrator nên classify query vào một intent class trước khi chọn tools.

Các intent class đề xuất:

1. `find_definition`
2. `explain_module`
3. `trace_flow`
4. `impact_analysis`
5. `bug_investigation`
6. `broad_codebase_question`

## Tool profile theo intent

Lưu ý cho `dh`:

- `keyword + symbol + graph + semantic` là hybrid default
- semantic không thay thế các nguồn còn lại
- planner vẫn phải tối ưu cost bằng scope, caching và incremental indexing

### `find_definition`

Mục tiêu:

- tìm nơi một symbol hoặc hành vi được định nghĩa

Tool profile:

1. symbol search
2. keyword search fallback
3. semantic search

Graph expansion:

- thường không bắt buộc
- chỉ thêm nếu có nhiều candidate trùng tên

### `explain_module`

Mục tiêu:

- giải thích một module, service hoặc subsystem hoạt động thế nào

Tool profile:

1. keyword search
2. symbol search
3. semantic search
4. graph expansion ở mức nhẹ

Graph expansion:

- 1 hop imports hoặc callers là đủ trong đa số trường hợp

### `trace_flow`

Mục tiêu:

- hiểu đường đi của dữ liệu hoặc request qua nhiều file

Tool profile:

1. symbol search
2. keyword search
3. graph expansion bắt buộc
4. semantic search

Graph expansion:

- bắt buộc
- ưu tiên call graph trước, import graph sau

### `impact_analysis`

Mục tiêu:

- phân tích nếu sửa X thì ảnh hưởng gì

Tool profile:

1. symbol search
2. reference search
3. graph expansion bắt buộc
4. dependency search

### `bug_investigation`

Mục tiêu:

- điều tra nguyên nhân lỗi hoặc regression

Tool profile:

1. keyword search
2. symbol search
3. graph expansion
4. semantic search

Nếu có logs hoặc stack traces trong tương lai, chúng nên được đưa vào retrieval plan như một nguồn seed riêng.

### `broad_codebase_question`

Mục tiêu:

- trả lời câu hỏi kiểu `how auth works` hoặc `where permissions are enforced`

Tool profile:

1. keyword search
2. symbol search
3. semantic search
4. graph expansion tùy theo density của top results

## Query planning

Mỗi query nên được chuyển thành một retrieval plan rõ ràng.

Plan tối thiểu nên gồm:

- `intent`
- `seed terms`
- `selected tools`
- `graph expansion policy`
- `context budget`
- `retry policy`
- `cost tier`
- `semantic mode`

Ví dụ conceptual plan:

```ts
{
  intent: "trace_flow",
  seedTerms: ["auth", "login", "session"],
  selectedTools: ["symbolSearch", "keywordSearch", "graphExpand"],
  graphExpansion: {
    maxDepth: 2,
    includeCallers: true,
    includeCallees: true,
    includeImports: true,
  },
  contextBudget: 12000,
  retryPolicy: "widen-if-low-confidence",
  costTier: "low",
  semanticMode: "always"
}
```

## Semantic mode policy

`dh` hỗ trợ 3 semantic mode:

1. `always`
2. `auto`
3. `off`

Chính sách mặc định:

- config mặc định là `always`
- user có thể override qua command hoặc config

Ví dụ command surface:

```bash
dh ask "how auth works" --semantic=always
dh ask "how auth works" --semantic=auto
dh ask "how auth works" --semantic=off
dh config set semantic.mode always
dh config set semantic.mode auto
dh config set semantic.mode off
```

## Retrieval execution flow

Flow chuẩn:

```text
Classify intent
-> generate seed terms
-> run selected tools in parallel
-> normalize results
-> dedupe by symbol and file
-> rerank
-> graph expansion from top seeds
-> rerank again
-> build evidence packets
-> trim to budget
```

Điểm quan trọng:

1. chạy các tool độc lập song song
2. normalize output về một contract chung
3. rerank ít nhất hai lần: trước và sau graph expansion

## Result normalization

Mỗi tool sẽ trả về output khác nhau. Cần normalize về cùng một shape để merge.

Một normalized retrieval result nên có:

- `entity_type`
- `entity_id`
- `file_path`
- `symbol_name` nullable
- `line_range`
- `source_tool`
- `match_reason`
- `raw_score`
- `normalized_score`
- `metadata`

Điều này cho phép merge nhiều nguồn mà không mất dấu origin của kết quả.

## Reranking strategy

Reranking nên dựa trên nhiều signals cùng lúc.

Signals khuyến nghị:

1. semantic similarity
2. keyword match strength
3. symbol name match
4. graph distance từ seed
5. path heuristic
6. entity importance
7. exported or top-level bonus

Ví dụ công thức:

```ts
score =
  semanticScore * 0.35 +
  keywordScore * 0.20 +
  symbolMatchScore * 0.20 +
  graphDistanceScore * 0.15 +
  pathHeuristicScore * 0.10;
```

Path heuristic có thể cộng điểm cho các file như:

- `auth/`
- `service/`
- `controller/`
- `routes/`
- `config/`

Tuy nhiên heuristic chỉ nên là tín hiệu phụ.

## Graph expansion strategy

Graph expansion là bước khuếch đại context từ seed results. Đây là secret sauce quan trọng, nhưng cũng là nguồn noise lớn nếu dùng sai.

Quy tắc:

1. chỉ expand từ top seeds có confidence đủ cao
2. giới hạn depth
3. ưu tiên edge phù hợp với intent
4. rerank sau expansion

Theo intent:

- `trace_flow`: ưu tiên call edges
- `impact_analysis`: ưu tiên reference và dependency edges
- `explain_module`: ưu tiên import và containment edges

## Evidence packets

Kết quả cuối trước khi vào LLM nên là evidence packets, không phải raw retrieval results.

Shape khuyến nghị:

```ts
{
  filePath: "src/auth/service.ts",
  symbol: "login",
  lines: [20, 68],
  reason: "definition match + called by route handler",
  score: 0.89,
  sourceTools: ["symbolSearch", "graphExpand"],
  snippet: "..."
}
```

Evidence packet cần đủ nhỏ để nhét vào prompt, nhưng đủ giàu thông tin để model không phải đoán.

## Context building strategy

Context builder nên follow thứ tự ưu tiên này:

1. primary definition evidence
2. direct callers hoặc callees
3. related imports hoặc configuration
4. secondary supporting snippets

Nguyên tắc:

- ưu tiên ít nhưng đúng
- tránh nạp nguyên file lớn nếu chỉ cần một symbol
- giữ diversity vừa đủ: definition + usage + relation

## Tool enforcement policy — enforced via pre-tool-exec hook

Tool enforcement là runtime contract được enforce qua **pre-tool-exec hook** trong forked Go core. Không chỉ là prompt guidance.

Khi Go core chuẩn bị execute một tool, hook fires và gọi `enforceToolUsage(envelope, toolName, toolArgs)` trong dh TypeScript logic. Function này quyết định allow/block dựa trên intent và required tools policy.

Ví dụ policy:

```ts
const requiredToolsByIntent = {
  find_definition: ["symbolSearch"],
  explain_module: ["semanticSearch", "symbolSearch"],
  trace_flow: ["symbolSearch", "graphExpand"],
  impact_analysis: ["referenceSearch", "graphExpand"],
  bug_investigation: ["keywordSearch", "symbolSearch", "graphExpand"],
};
```

Validation rule:

1. xác minh các required tools đã chạy
2. xác minh có evidence đủ ngưỡng
3. nếu không đạt, retry hoặc degrade response

Trong `dh`, mức enforcement là `very hard`. Target state là enforce qua forked Go core hooks; current implementation đã có policy và gating ở TS-side trước:

- thiếu required tools thì không được finalize answer
- evidence score dưới ngưỡng thì không được trả lời confident
- orchestrator phải retry, degrade hoặc báo thiếu evidence

Degrade response có thể là:

- `insufficient evidence`
- `multiple ambiguous candidates`
- `need narrower scope`

## Retry strategy

Trong `dh`, retry nên tăng chi phí theo từng nấc thay vì bật mọi thứ mạnh hơn ngay lập tức.

Thứ tự ưu tiên:

1. keyword plus symbol
2. graph expansion nhẹ
3. graph expansion sâu hơn
4. semantic retrieval

Nếu semantic mode đang là `always`, bước 4 được hiểu là tăng semantic scope hoặc semantic weight chứ không chỉ bật semantic lần đầu.

Không phải query nào cũng trả kết quả tốt ngay lần đầu. Hệ thống nên có retry policy rõ.

Ví dụ:

### Low confidence retry

- nới seed terms
- bật semantic search nếu ban đầu chưa dùng
- tăng graph depth từ 1 lên 2

### Ambiguous symbol retry

- group candidates theo path
- ưu tiên exported symbols
- hỏi lại user nếu ambiguity vẫn cao

### Sparse result retry

- fallback sang keyword-heavy search
- giảm yêu cầu exact match

## Confidence and answer gating — enforced via pre-answer hook

Answer gating được enforce qua **pre-answer hook** trong forked Go core.

Khi LLM generates response, hook fires trước khi response được finalize. Hook gọi `validateAnswer(envelope, intent, toolsUsed, evidenceScore)` trong dh TypeScript logic.

Không phải query nào hệ thống cũng nên trả lời chắc chắn.

Các tín hiệu confidence:

1. số lượng evidence packets chất lượng cao
2. diversity của evidence sources
3. consistency giữa definition và usage edges
4. ambiguity level của top candidates

Nếu confidence thấp:

- trả lời thận trọng
- nêu rõ assumption
- hoặc từ chối kết luận mạnh

Vì output mặc định của `dh` cần ngắn gọn, phần thận trọng này nên được thể hiện súc tích nhưng vẫn có citations.

## Query examples

### Example 1: `how auth works`

Plan khuyến nghị:

1. semantic search cho `auth`, `login`, `session`, `token`
2. keyword search cho các identifier gần nghĩa
3. symbol search cho service, middleware, guards
4. graph expansion 1 hop
5. build context theo definition + usage

### Example 2: `where is permission enforced`

Plan khuyến nghị:

1. keyword search `permission`, `authorize`, `guard`, `policy`
2. symbol search
3. expand callers và imports từ top candidates
4. rerank theo route or middleware heuristics

### Example 3: `what breaks if I change payment service`

Plan khuyến nghị:

1. symbol search cho payment service
2. reference search
3. dependency expansion
4. call graph expansion
5. summarize impacted modules

## Những lỗi retrieval cần tránh

1. Dùng semantic search như nguồn duy nhất.
2. Expand graph trước khi có seed results tốt.
3. Không normalize kết quả từ các tools khác nhau.
4. Không rerank sau graph expansion.
5. Đưa raw files dài vào prompt thay vì evidence packets.
6. Không lưu query logs và tool usage.

## Chỉ số cần theo dõi

Để cải thiện retrieval quality, nên theo dõi:

1. top-k hit quality
2. evidence count per answer
3. confidence distribution
4. retry rate
5. tool coverage by intent
6. latency by tool

Đây là các chỉ số cần thiết để tune ranking và plan policy.

## Tài liệu liên quan

- `docs/architecture/system-overview.md`
- `docs/architecture/indexing-model.md`
- `docs/project-architecture.md`

## Kết luận

Retrieval strategy tốt là sự kết hợp của intent classification, hybrid search, graph expansion có kiểm soát, reranking đa tín hiệu và evidence-driven context building. Enforcement được đảm bảo qua 2 hooks trong forked Go core: pre-tool-exec (đảm bảo required tools chạy) và pre-answer (đảm bảo evidence đủ trước khi finalize). Nếu một trong các phần này thiếu, AI sẽ nhanh chóng quay về mode đoán thay vì hiểu codebase thật.
