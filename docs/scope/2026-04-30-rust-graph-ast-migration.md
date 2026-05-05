---
artifact_type: scope_package
version: 2
status: approval_ready
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
owner: ProductLead
approval_gate: product_to_solution
handoff_status: pass
source_refs:
  - docs/PLAN-rust-migration.md
  - docs/improve/feature-01-1-chuyen-dich-rust.md
---

# Scope Package: Rust Graph/AST Migration

## Tóm tắt scope

Di chuyển quyền sở hữu production Graph/AST extraction và graph query từ TypeScript sang Rust để loại bỏ rủi ro nghẽn event loop trong Node.js/Bun khi xử lý codebase lớn, đồng thời giữ hành vi code-intelligence có thể kiểm chứng qua corpus DH/OpenKit hiện tại. Scope yêu cầu Rust sở hữu production path từ parse/extract/link/storage/hydration/query, TypeScript chỉ còn vai trò điều phối/adapter gọi Rust và render kết quả; các gate bắt buộc gồm cross-root support, RPC capability expansion, Rust-owned golden fixtures, critical query fixtures, production consumer audit, tests/performance evidence, documented deltas, QA pass và xóa TS graph code ngay sau gate.

> Advisory caveat: Work item này có bản chất migration/modernization, nhưng người dùng đã explicit lock `/delivery`; vì vậy scope này đi theo Full Delivery và không tự đổi lane.

## Goal

Đưa production Graph/AST ownership của DH/OpenKit sang Rust-only path theo plan đã được duyệt, với acceptance rõ cho cross-root monorepo resolution, worker/client RPC expansion, consumer migration, Rust golden-fixture/query-fixture gates, tests/performance evidence, QA pass và cleanup TS graph code ngay sau delete gate.

## Nguồn tham chiếu

- Plan đã được user approve: `docs/PLAN-rust-migration.md`
- Đề xuất gốc: `docs/improve/feature-01-1-chuyen-dich-rust.md`
- Workflow state hiện tại: work item `rust-graph-ast-migration`, mode `full`, `lane_source = user_explicit`, stage `full_product`

## Tuyên bố vấn đề

Trong production path hiện tại theo plan, TypeScript vẫn chịu trách nhiệm trích xuất AST/Graph ở các phần như import/call extraction và graph storage, khiến project lớn có nguy cơ block event loop của Node.js/Bun và làm code-intelligence kém ổn định. Người dùng cần một migration có kiểm soát để Rust trở thành owner duy nhất của production Graph/AST facts và query traversal, bao gồm monorepo cross-root resolution, nhưng không được giữ fallback TS dài hạn sau khi QA đã pass.

## Mục tiêu

- Chuyển production Graph/AST extraction, linking, storage write, hydration và query traversal sang Rust-owned path.
- Đảm bảo TypeScript chỉ còn điều phối request, gọi Rust bridge/RPC hoặc compatibility adapter tạm thời nội bộ gọi Rust, rồi render kết quả cuối cùng.
- Đảm bảo monorepo cross-root import/dependency/call/reference handling là yêu cầu phase đầu, không phải nice-to-have.
- Đưa `query.callHierarchy` và `query.entryPoints` vào worker/client protocol, capability advertisement và test coverage trước delete gate.
- Dùng DH/OpenKit repo hiện tại làm official acceptance corpus phase đầu, kèm report limitation nếu corpus nhỏ hơn ngưỡng benchmark lớn.
- Xóa TS graph code/GraphRepo ngay sau QA pass và delete gate; lỗi sau deletion xử lý bằng fix-forward hoặc revert có chủ đích.

## Người dùng mục tiêu

- Maintainers của DH/OpenKit cần code-intelligence không block event loop khi indexing/querying Graph/AST.
- OpenKit/DH operators dùng các query như definition, usage/dependencies/dependents, call hierarchy, entry points và build evidence.
- Maintainers của runtime/retrieval/opencode-app cần consumer API ổn định trong lúc production ownership chuyển sang Rust.
- QA/Reviewer cần gate rõ ràng để biết khi nào được xóa TS graph code mà không giữ compatibility window dài.

## User Decisions Đã Khóa

1. **Cross-root full support ngay**: monorepo cross-root import/dependency resolution là acceptance requirement phase đầu; mọi unresolved cross-root edge phải được triage, không được mặc định là out of scope.
2. **DH/OpenKit repo là official corpus**: dùng repo DH/OpenKit hiện tại làm official acceptance corpus phase đầu; nếu file count thấp hơn ngưỡng lớn như 3,000 files thì ghi limitation trong benchmark report nhưng không đổi corpus chính thức.
3. **Mở rộng RPC worker/client ngay**: `query.callHierarchy` và `query.entryPoints` phải có trong worker/client protocol, capability advertisement và tests trước delete gate; direct/internal handler chưa advertise không đủ.
4. **Delete TS graph code sau QA pass**: sau QA pass và delete gate, xóa `packages/intelligence/src/graph/` và `GraphRepo` ngay; không giữ compatibility window dài, lỗi sau đó xử lý fix-forward trong Rust/adapter hoặc revert có chủ đích.
5. **RGA-07 gate revision được user approve**: legacy TS aggregate count parity không còn là hard delete gate vì TS baseline không model-equivalent với Rust graph; delete gate thay bằng Rust-owned golden fixtures, production consumer audit, critical query fixtures, tests/performance evidence và documented deltas. Đây là thay đổi scope/gate có user approval, không phải silent exception hoặc bỏ qua validation.

## Phạm vi thực hiện

- Baseline capture trước cutover trên DH/OpenKit corpus: files, symbols, imports, cross-root imports, call edges/call sites, references khi có, workspace/package roots, index/query latency, payload size và event-loop delay.
- Rust-owned production path cho Graph/AST facts: parse, extract symbols/imports/calls/references, resolve/link cross-file/cross-root relationships, persist graph facts, hydrate graph projection và answer graph queries.
- Cross-root monorepo support ngay phase đầu: workspace roots, package roots, aliases/exports, package subpaths và unresolved/ambiguous root cases phải có report triage.
- Compatibility adapter TypeScript chỉ được giữ trong cutover nếu adapter gọi Rust và không tự duyệt AST/dựng graph/ghi graph facts bằng TS.
- Consumer migration/audit cho production consumers liên quan tới runtime indexing, retrieval, OpenCode app bridge/client, storage graph repo/schema và legacy intelligence graph tests.
- RPC capability expansion cho `query.callHierarchy` và `query.entryPoints`, bao gồm advertised capability state, worker/client routing và test/error-shape coverage.
- Rust-owned golden fixtures, critical query fixtures, documented deltas, performance, payload và event-loop gates theo plan đã được revise; legacy TS aggregate count parity chỉ còn là diagnostic/context metric nếu hữu ích, không phải hard delete gate.
- Rollback checkpoint trước deletion; sau deletion không duy trì runtime fallback sang TS graph extraction.
- Delete cleanup sau QA pass: TS graph directory, `GraphRepo`, tests liên quan và legacy graph schema references nếu DB migration path an toàn; nếu schema cần tombstone thì phải read-only/no-write và không giữ GraphRepo.

## In Scope

- Baseline capture trên DH/OpenKit corpus chính thức.
- Rust-owned production Graph/AST parse/extract/link/storage/hydration/query path.
- Cross-root monorepo resolver/linker support ngay phase đầu.
- Worker/client RPC expansion cho `query.callHierarchy` và `query.entryPoints`.
- Consumer migration/audit cho runtime, retrieval, OpenCode app bridge/client, TS graph tests và storage graph surfaces.
- Rust golden-fixture coverage, critical query fixture coverage, production consumer audit, tests/performance/payload/event-loop evidence, rollback checkpoint, QA pass và immediate TS graph cleanup gates.
- Validation-surface labeling và unavailable-path reporting cho app-native commands nếu thiếu.

## Ngoài phạm vi / Non-goals

- Không mở rộng sang MessagePack/Feature 01-2 trong scope này; chỉ mở decision tiếp nếu payload gates chứng minh JSON-RPC là bottleneck.
- Không thêm `traceFlow`, `impactAnalysis`, `semanticSearch` hoặc query class khác ngoài các contract hiện tại và `query.callHierarchy`/`query.entryPoints`.
- Không yêu cầu 100% exact parity count hoặc aggregate TS-vs-Rust parity thresholds cho mọi graph fact nếu TS baseline vốn thiếu hoặc khác semantics; sau user-approved RGA-07 gate revision, TS aggregate parity là diagnostic/context metric khi hữu ích, không phải hard delete gate hoặc lý do giữ TS extraction fallback.
- Không giữ long-running compatibility window hoặc production TS Graph/AST fallback sau QA pass.
- Không buộc toàn bộ logic vào một crate cụ thể; scope yêu cầu Rust ownership end-to-end, còn Solution Lead quyết định phân bổ kỹ thuật qua các Rust layers phù hợp.
- Không thay đổi lane, gate, hoặc workflow runtime enum của OpenKit trong scope này.

## Out of Scope

- MessagePack/Feature 01-2 implementation, trừ follow-up decision nếu JSON-RPC payload gate fail.
- `traceFlow`, `impactAnalysis`, `semanticSearch` hoặc query classes ngoài approved scope.
- Long-running TS Graph/AST production fallback sau QA pass.
- Đổi lane/workflow enum/gate model của OpenKit.
- Ép toàn bộ logic vào một crate duy nhất; scope khóa Rust ownership end-to-end, không khóa low-level crate layout.

## Quy tắc business / product

- **Production ownership rule**: steady state phải có 100% production Graph/AST ownership ở Rust; TypeScript không còn production path tự chạy AST/graph extraction, graph indexing hoặc graph fact writes.
- **Coverage rule**: Rust fixture/query coverage hoặc supported parity metrics dưới threshold phải được triage và xử lý hoặc có user-approved exception; không được dùng “95% coverage” để giữ 5% production traffic qua TS, và legacy TS aggregate parity được quản bởi revised delete-gate rule bên dưới.
- **Revised delete-gate rule**: theo user-approved RGA-07 gate change, legacy TS aggregate count parity không còn là hard delete gate; replacement gate phải chứng minh Rust golden-fixture acceptance, production consumer audit, critical query fixtures, tests/performance evidence và documented deltas trước deletion.
- **Corpus rule**: DH/OpenKit repo hiện tại là corpus chính thức phase đầu; nếu corpus chưa đủ lớn, report ghi limitation/risk thay vì đổi corpus.
- **Cross-root rule**: cross-root support là in-scope; mọi cross-root miss phải có trạng thái resolved/ambiguous/external/unsupported/bug/accepted delta hoặc lý do tương đương, không có bucket “không xét”.
- **RPC rule**: capability chỉ được xem là sẵn sàng khi worker protocol, TS client/host bridge và advertised capability cùng nhìn thấy `query.callHierarchy`/`query.entryPoints` với trạng thái thật.
- **Consumer rule**: trước deletion phải có consumer audit mới; production imports hoặc writes còn trỏ vào TS graph code/GraphRepo là blocker.
- **Storage rule**: Rust storage/facts là source-of-truth sau cutover; legacy TS graph tables nếu còn tồn tại chỉ được read-only/tombstoned và không có production writes.
- **Rollback rule**: rollback/feature flag chỉ phục vụ checkpoint trước deletion; sau QA pass/deletion, recovery là fix-forward trong Rust/adapter hoặc revert có chủ đích.
- **Validation surface rule**: OpenKit runtime/scan/workflow evidence không được báo cáo như target-project app build/lint/test evidence; app-native validation chỉ hợp lệ khi project thực sự định nghĩa command đó.
- **No silent exception rule**: mọi delta giữa legacy TS baseline và Rust graph phải được phân loại trong evidence/report; thay đổi gate này không cho phép claim validation đã pass nếu fixtures, audits, tests, performance hoặc QA evidence chưa chạy.

## User Stories

- **Là một DH/OpenKit maintainer**, tôi muốn Graph/AST indexing và graph queries chạy qua production logic do Rust sở hữu, để code-intelligence không block JS event loop.
- **Là một OpenKit operator**, tôi muốn monorepo imports/calls qua nhiều root được resolve hoặc triage rõ ràng, để graph answers xuyên package đáng tin cậy.
- **Là một maintainer của bridge/client consumer**, tôi muốn `query.callHierarchy` và `query.entryPoints` được advertise và route qua worker/client protocol được hỗ trợ, để clients có thể phụ thuộc vào capability công khai thay vì private/direct handler assumptions.
- **Là một reviewer/QA owner**, tôi muốn có Rust golden fixtures, critical query fixtures, performance/test evidence, consumer-audit và delete gates khách quan, để việc xóa TS graph code là quyết định có kiểm soát thay vì cleanup rủi ro.

## Ma trận acceptance criteria

## Acceptance Criteria Matrix

| ID | Acceptance criterion |
| --- | --- |
| AC-01 | **Given** implementation bắt đầu, **when** baseline được capture, **then** DH/OpenKit repo hiện tại được dùng làm official corpus và report ghi file count, root/package counts, graph fact counts, query/index latency, payload size và event-loop delay; nếu file count thấp hơn large-corpus target thì report ghi limitation mà không đổi corpus. |
| AC-02 | **Given** production Graph/AST work chạy sau cutover, **when** indexing/querying được thực thi, **then** Rust sở hữu parse/extract/link/storage/hydration/query traversal và TypeScript không chạy production AST/graph extraction, `GraphIndexer`, hoặc `GraphRepo` graph fact writes. |
| AC-03 | **Given** một cross-root import/dependency/call/reference tồn tại trong DH/OpenKit corpus, **when** Rust resolver/linker xử lý workspace, **then** edge đó được resolve hoặc triage với lý do rõ ràng và không còn untriaged cross-root miss trước delete gate. |
| AC-04 | **Given** user hoặc client yêu cầu dependencies/dependents/definition/usage/call hierarchy/entry points, **when** graph đã hydrated/current, **then** supported queries trả về Rust-composed graph results trong latency/payload budgets đã chấp nhận hoặc expose documented degraded/cold/stale state. |
| AC-05 | **Given** worker/client capabilities được kiểm tra, **when** `query.callHierarchy` và `query.entryPoints` available hoặc intentionally degraded, **then** worker protocol, TS client/host bridge capability advertisement và tests đều expose cùng supported method names và error shapes; direct handler presence alone không được chấp nhận. |
| AC-06 | **Given** consumer audit chạy trước deletion, **when** production imports/writes được kiểm tra, **then** runtime, retrieval, OpenCode app bridge/client và storage consumers không còn phụ thuộc TS graph extractors hoặc GraphRepo writes; tests/fixtures còn lại được port, delete hoặc phân loại rõ là non-production. |
| AC-07 | **Given** RGA-07 delete gate được đánh giá sau user-approved gate revision, **when** legacy TS aggregate counts không khớp Rust facts vì TS baseline không model-equivalent, **then** aggregate TS-vs-Rust count parity không còn là hard delete gate và không được dùng để chặn deletion nếu replacement gate evidence trong AC-12/AC-13 pass; mọi delta liên quan vẫn phải được documented/classified trước deletion. |
| AC-08 | **Given** performance gates chạy, **when** Rust index/link/hydrate/query path được so với TS baseline, **then** Rust đạt timing, memory, payload và Node event-loop delay thresholds đã chấp nhận hoặc ghi blocker/user-approved exception; event-loop blocking từ synchronous TS AST/graph traversal không được phép trong production path. |
| AC-09 | **Given** rollback checkpoint được thực hiện trước deletion, **when** feature flag/compat path được rehearse, **then** recovery chỉ được chứng minh cho pre-deletion window; sau QA pass/delete, implementation không còn hứa runtime fallback sang TS graph extraction. |
| AC-10 | **Given** QA đã pass và mọi delete gate đạt, **when** cleanup chạy, **then** TS graph code và GraphRepo bị xóa ngay, legacy graph schema được xóa hoặc tombstone read-only/no-write, và issue phát sinh sau đó được xử lý bằng Rust/adapter fix-forward hoặc intentional revert. |
| AC-11 | **Given** validation evidence được báo cáo, **when** handoff tới code review hoặc QA, **then** evidence được gắn nhãn surface (`runtime_tooling`, `compatibility_runtime`, `target_project_app`, `documentation`, v.v.) và app-native commands còn thiếu được báo cáo unavailable thay vì bị thay bằng OpenKit runtime checks. |
| AC-12 | **Given** Rust-owned golden fixture gate chạy trước deletion, **when** approved JS-like file fixtures và critical fixtures được đánh giá, **then** fixture expected outputs do Rust graph contract sở hữu phải pass hoặc có documented/user-approved delta; prior RGA-07G-R notes về 100% JS-like coverage và critical fixtures chỉ là prior evidence, không tự động là final QA pass nếu chưa được refresh trong gate hiện tại. |
| AC-13 | **Given** production consumer audit và critical query fixtures chạy trước deletion, **when** runtime, retrieval, OpenCode app bridge/client, storage consumers và critical queries (`dependencies`, `dependents`, `definition`, `usage`, `callHierarchy`, `entryPoints`) được kiểm tra, **then** không còn production dependency vào TS graph extractors/GraphRepo writes, query fixtures pass bằng Rust-composed results hoặc documented degraded/error shape, tests/perf evidence được lưu, và unresolved blockers được route về implementation/solution trước cleanup. |

## BDD Acceptance Hotspots

### Rust ownership và không fallback TS

- **Given** hệ thống ở post-cutover production mode
- **When** workspace index hoặc graph query được yêu cầu
- **Then** Graph/AST facts được tạo và query bởi logic do Rust sở hữu
- **And** TypeScript code không traverse AST, build graph edges hoặc write graph facts như production fallback.

### Cross-root monorepo resolution

- **Given** DH/OpenKit corpus có imports qua nhiều workspace/package roots
- **When** resolver/linker đánh giá workspace
- **Then** mỗi cross-root edge được resolve hoặc ghi nhận với triage reason
- **And** query results có thể traverse valid cross-root edges qua package boundaries.

### RPC capability expansion

- **Given** TS client kiểm tra worker/host capabilities
- **When** migration yêu cầu `query.callHierarchy` và `query.entryPoints`
- **Then** cả hai method được advertise và route qua supported worker/client protocol
- **And** unsupported language/scope responses dùng documented error shapes thay vì fallback sang TS graph traversal.

### Delete gate

- **Given** Rust-owned golden fixture gate, critical query fixtures, production consumer audit, documented deltas, tests/performance evidence, rollback checkpoint, code review và QA đã hoàn tất
- **When** QA pass migration và delete gate được đánh giá theo user-approved RGA-07 revision
- **Then** TS graph code và GraphRepo bị xóa ngay
- **And** legacy TS aggregate count parity không được dùng làm hard blocker thay cho replacement evidence
- **And** không còn long compatibility window sau pass.

## Edge cases / Failure cases

- DH/OpenKit corpus nhỏ hơn ngưỡng large-corpus đề xuất: tiếp tục dùng làm official corpus, ghi benchmark limitation/risk và không âm thầm thay corpus khác.
- Cross-root import ở trạng thái unresolved, ambiguous, external, unsafe hoặc outside allowed roots: phân loại với reason/severity rõ; untriaged cross-root miss block deletion.
- Package alias/export config thiếu hoặc conflict: báo cáo như resolver triage, không xem là implicit out-of-scope.
- Rust parser/resolver/linker capability chỉ partial hoặc no-op tại thời điểm implement: xem là implementation gap cần hoàn thiện, không xem là accepted parity.
- Legacy TS aggregate counts khác Rust graph vì model không tương đương: không block deletion theo RGA-07 revised gate nếu Rust golden fixtures, critical query fixtures, production consumer audit, tests/performance evidence, QA và documented deltas pass; không được xóa nếu những replacement gates chưa được refresh/chứng minh.
- `query.callHierarchy`/`query.entryPoints` chỉ tồn tại như direct/internal handler nhưng chưa có worker/client advertisement: delete gate fail cho tới khi có public protocol support.
- Consumer audit phát hiện production TS graph imports hoặc GraphRepo writes muộn: block deletion cho tới khi consumers chuyển sang Rust path/adapter.
- Performance gate miss, payload vượt default budget hoặc event-loop delay vẫn cao: phân loại blocker; payload bottleneck có thể kích hoạt decision follow-up cho Feature 01-2 nhưng không tự mở rộng scope này.
- Legacy DB schema cleanup chưa an toàn ngay: chỉ cho phép schema read-only/tombstone có tài liệu nếu production writes và GraphRepo đã biến mất.
- Bug xuất hiện sau deletion: fix-forward trong Rust/adapter hoặc intentional revert; không tái tạo TS extraction fallback dài hạn.
- App-native JS/TS test command không khả dụng tại thời điểm implement: báo cáo validation surface unavailable; không claim pass cho command đoán như `npm test`/`pnpm test`.

## Risks / Assumptions

- Assumption: `docs/PLAN-rust-migration.md` tiếp tục là nguồn approved cho thresholds và phases, nhưng RGA-07 user-approved gate revision trong scope package này thay thế legacy TS aggregate parity làm hard delete gate.
- Assumption: Observations hiện tại trong plan có thể drift trước khi implement; consumer audit và capability checks phải refresh ở thời điểm implementation.
- Assumption: Rust crates/layers đã có partial capabilities, nhưng acceptance phụ thuộc verified behavior, không phụ thuộc file presence hoặc stub APIs.
- Risk: Cross-root resolver complexity có thể tạo nhiều ambiguous/unresolved cases hơn dự kiến; deletion phải chờ triage, không cần perfect unbounded semantics nhưng không được có untriaged miss.
- Risk: JSON-RPC payload size có thể trở thành bottleneck mới; scope này đo và report, còn MessagePack là decision riêng.
- Risk: Legacy schema deletion có thể cần migration/tombstone cẩn thận; steady state vẫn cấm GraphRepo và TS production writes.
- Risk: Target-project app-native validation commands có thể absent hoặc chưa được document; evidence phải trung thực về validation-surface limits.

## Kỳ vọng validation

- Product artifact validation cho scope package này chỉ ở mức documentation: đọc approved plan/reference docs, viết scope artifact và đọc lại để kiểm tra completeness.
- Không yêu cầu và không chạy build, lint, cargo test, JS/TS test, benchmark hoặc app runtime command trong bước Product Lead scope creation.
- Implementation validation kỳ vọng ở các stage sau:
  - baseline và benchmark report trên DH/OpenKit corpus;
  - Rust-owned golden fixture report và critical query fixture report;
  - documented delta report cho legacy TS baseline vs Rust graph, dùng TS aggregate parity làm diagnostic/context metric thay vì hard delete gate;
  - cross-root resolver/linker triage report;
  - RPC worker/client protocol và capability evidence cho `query.callHierarchy` và `query.entryPoints`;
  - production consumer audit trước deletion;
  - tests, performance, payload và event-loop evidence với validation-surface labels;
  - rollback checkpoint trước deletion;
  - code review và QA evidence trước delete cleanup, bao gồm xác nhận replacement gates đã chạy hoặc blocker đã route;
  - explicit unavailable-path notes cho app-native commands không tồn tại tại thời điểm validation.

## Tín hiệu thành công

- Production Graph/AST ownership là Rust-only và TypeScript không còn thực hiện production extraction, graph indexing hoặc graph fact writes.
- Cross-root graph behavior trên DH/OpenKit corpus được resolve hoặc triage đầy đủ, không còn untriaged miss trước deletion.
- `query.callHierarchy` và `query.entryPoints` được support qua advertised worker/client protocol, không phải private/direct-only handlers.
- Rust golden-fixture, critical query fixture, production consumer audit, documented delta, performance, event-loop và payload reports được capture và đạt revised gate hoặc có user-approved exceptions.
- QA pass và TS graph code/GraphRepo bị xóa ngay sau đó.

## Handoff Notes cho Solution Lead

- Giữ nguyên chính xác năm quyết định user đã khóa; không mở lại trừ khi user đổi scope rõ ràng.
- Chuyển scope này thành solution package với sequencing, task breakdown, validation commands thật sự available trong repo, rollback checkpoint, delete gate và evidence plan.
- Không đưa implementation design sâu vào Product Lead scope trừ khi cần để thỏa acceptance gates; technical ownership boundaries do Solution Lead artifact quyết định.
- Xem Rust golden fixtures, critical query fixtures, production consumer audit, documented deltas, cross-root triage, RPC advertisement và delete timing là high-risk acceptance hotspots.
- Nếu validation tooling thiếu hoặc stale, document unavailable surface thay vì invent commands.
