# Phân tích follow-on: semantic retrieval segmented-path hardening cho DH

Ngày: 2026-04-11  
Phạm vi: follow-on **hẹp, kiến trúc và thực dụng** để chuẩn hóa ngữ nghĩa đường dẫn (path semantics) trong semantic retrieval sau khi marker-driven multi-workspace segmentation đã hoàn tất.

---

## 1) Vì sao đây là task follow-on hợp lý sau segmentation

Marker-driven segmentation đã hoàn thành mục tiêu chính: tách boundary theo workspace và cho phép pipeline retrieval/indexing xử lý theo không gian làm việc thực tế hơn.

Sau bước đó, một vấn đề còn lại là **nhất quán ngữ nghĩa path giữa các lớp**:

- lớp semantic chunk persistence hiện còn có điểm dùng `filePath: file.path`
- lớp evidence packet đang xây dựng snippet theo giả định `result.filePath` là repo-relative (`path.join(repoRoot, result.filePath)`)

Khi hệ thống đã segmented theo workspace, sự lệch ngữ nghĩa path này trở nên rõ hơn (workspace-relative vs repo-relative), nên đây là follow-on hợp lý ngay sau segmentation để tránh “boundary đúng nhưng path identity chưa đồng nhất”.

---

## 2) Current DH state and the exact gap

### Trạng thái hiện tại liên quan

1. `packages/retrieval/src/semantic/chunker.ts`
   - Tạo chunk từ `IndexedFile`.
   - Tại nhiều điểm push chunk input đang gán:
     - `filePath: file.path`
   - Đây là nguồn gốc path được persist vào chunk/embedding pipeline.

2. `packages/retrieval/src/semantic/semantic-search.ts`
   - `resolveChunks(...)` trả `SemanticSearchResult` với `filePath: chunk.filePath`.
   - `semanticResultsToNormalized(...)` map thẳng `filePath: r.filePath` sang `NormalizedRetrievalResult`.

3. `packages/retrieval/src/query/run-retrieval.ts`
   - Non-semantic path đã có chuẩn hóa repo-relative thông qua:
     - `resolveIndexedFileAbsolutePath(...)`
     - `toRepoRelativePath(...)`
     - map `filePathById`
   - Nhưng semantic path đi qua chunk persistence nên kế thừa trực tiếp `chunk.filePath`.

4. `packages/retrieval/src/query/build-evidence-packets.ts`
   - Build snippet bằng:
     - `const absolutePath = path.join(repoRoot, result.filePath)`
   - Hàm này **ngầm kỳ vọng** `result.filePath` là repo-relative và không chứa prefix workspace riêng lẻ/mơ hồ.

5. Shared types
   - `packages/shared/src/types/embedding.ts`: `ChunkInput.filePath: string`, `SemanticSearchResult.filePath: string`.
   - `packages/shared/src/types/evidence.ts`: `NormalizedRetrievalResult.filePath: string`, `EvidencePacket.filePath: string`.
   - Type hiện không encode rõ “path này thuộc semantics nào” (repo-relative hay workspace-relative).

### Exact gap

**Gap cốt lõi:** semantic chunk records có thể lưu path theo semantics chưa đồng bộ với evidence pipeline (workspace-relative hoặc biến thể khác), trong khi evidence builder xử lý như repo-relative tuyệt đối trong ngữ cảnh repo root.

---

## 3) Why the gap does not block previous closure but is still worth fixing

### Không block closure trước đó

- Mục tiêu closure trước: hoàn tất marker-driven segmentation (boundary và scan behavior), không phải chuẩn hóa toàn bộ path semantics của semantic retrieval.
- Ở nhiều repo/layout, `file.path` có thể tình cờ vẫn hoạt động với `path.join(repoRoot, ...)`, nên issue không phải blocker mức cao.
- QA đã ghi nhận đúng mức **low severity backlog**, nghĩa là chấp nhận release closure hiện tại.

### Vẫn đáng fix ngay follow-on

- Đây là lỗi “correctness drift” tiềm ẩn ở evidence quality: có thể làm snippet unavailable hoặc trỏ nhầm file khi path semantics lệch.
- Semantic results thường dùng cho câu trả lời explain/trace; evidence sai đường dẫn làm giảm độ tin cậy toàn tuyến.
- Sửa sớm giúp tránh lan rộng technical debt vào cache cũ (chunks/embeddings) khi dữ liệu ngày càng lớn.

---

## 4) Architecture options for fixing path semantics in semantic retrieval

### Option A — Chuẩn hóa tại nguồn (chunker emits repo-relative)

Ý tưởng:

- Trong `chunker.ts`, thay `filePath: file.path` bằng repo-relative path đã canonicalized (dựa trên `resolveIndexedFileAbsolutePath` + `toRepoRelativePath`).

Ưu điểm:

- Fix tận gốc dữ liệu persisted mới.
- Dòng semantic về sau tự đồng bộ với non-semantic retrieval.

Nhược điểm:

- Chunk cache cũ còn path semantics cũ, cần chiến lược tương thích/migration.

---

### Option B — Chuẩn hóa ở semantic result adapter (read-time normalization)

Ý tưởng:

- Giữ dữ liệu chunk như cũ.
- Tại `semantic-search.ts` hoặc `run-retrieval.ts`, normalize `chunk.filePath` sang repo-relative trước khi map sang `NormalizedRetrievalResult`.

Ưu điểm:

- Ít đụng pipeline persist.
- Tương thích tốt với dữ liệu cache hiện có.

Nhược điểm:

- Dữ liệu nguồn vẫn không sạch semantics.
- Cần duy trì normalize logic ở read path lâu dài.

---

### Option C — Hybrid (khuyến nghị)

Ý tưởng:

1. Viết chuẩn repo-relative ngay tại chunker cho dữ liệu mới.
2. Thêm normalize guard khi đọc semantic results để “đỡ” dữ liệu lịch sử.
3. Khi phát hiện path cũ không chuẩn, ghi telemetry/counter để quyết định thời điểm re-embed/re-chunk selective.

Ưu điểm:

- Vừa xử lý đúng kiến trúc lâu dài, vừa an toàn chuyển tiếp.
- Không yêu cầu migration cứng ngay lập tức.

Nhược điểm:

- Tăng nhẹ độ phức tạp trong 1-2 release chuyển tiếp.

---

## 5) Recommended path

Khuyến nghị chọn **Option C (Hybrid)** với nguyên tắc:

1. **Single semantic contract:** từ `NormalizedRetrievalResult.filePath` trở đi phải là repo-relative canonical.
2. **Write-clean, read-safe:** dữ liệu mới ghi chuẩn; dữ liệu cũ vẫn đọc được qua normalization guard.
3. **Không redesign retrieval:** chỉ harden path semantics và evidence correctness trong phạm vi semantic retrieval.

---

## 6) Mapping cụ thể sang DH packages/modules

### `packages/retrieval/src/semantic/chunker.ts`

- Bổ sung chuẩn hóa repo-relative trước khi tạo `ChunkInput`:
  - từ `IndexedFile` -> absolute (`resolveIndexedFileAbsolutePath`)
  - absolute -> repo-relative (`toRepoRelativePath`)
- Dùng path đã chuẩn hóa cho toàn bộ branch:
  - symbol chunk
  - gap chunk
  - tail chunk
  - sliding-window chunk
- Nếu không resolve được repo-relative path: skip file (nhất quán với logic guard hiện có).

### `packages/retrieval/src/semantic/semantic-search.ts`

- Trong `resolveChunks(...)` hoặc trước `semanticResultsToNormalized(...)`, thêm normalize guard:
  - nếu path đang tuyệt đối hoặc không nằm trong repo semantics mong muốn -> cố gắng quy đổi về repo-relative.
  - nếu không quy đổi được -> giữ nguyên nhưng đánh dấu metadata/telemetry để theo dõi lỗi data cũ.

### `packages/retrieval/src/query/run-retrieval.ts`

- Đảm bảo semantic results đi vào `rerankResults(...)` dùng cùng semantics với symbol/file path (repo-relative).
- Có thể thêm bước sanitize nhỏ sau `semanticResultsToNormalized(...)` để chặn drift ở boundary query layer.

### `packages/retrieval/src/query/build-evidence-packets.ts`

- Giữ contract chính: nhận repo-relative path.
- Harden nhẹ:
  - tránh join mù path bất hợp lệ.
  - fallback thông điệp rõ ràng khi path không resolve.
- Mục tiêu: không đổi vai trò module (vẫn là consumer contract), chỉ tăng resilience.

### Shared types liên quan

- `packages/shared/src/types/embedding.ts`
- `packages/shared/src/types/evidence.ts`

Đề xuất tối thiểu:

- Giữ `filePath: string` để tránh breaking change.
- Bổ sung comment contract (hoặc docs nội bộ): với retrieval/evidence pipeline, `filePath` chuẩn là repo-relative canonical.

---

## 7) Proposed phases for the task

### Phase 1 — Contract hardening cho dữ liệu mới

Phạm vi:

- cập nhật chunker để persist repo-relative canonical path
- thêm test đơn vị tại semantic chunking path

Exit criteria:

- chunk mới luôn có `filePath` repo-relative
- không regress chunk generation hiện tại

### Phase 2 — Backward-compatible read normalization

Phạm vi:

- thêm normalize guard ở semantic read path
- đảm bảo `NormalizedRetrievalResult` từ semantic đồng nhất với non-semantic

Exit criteria:

- evidence builder nhận path nhất quán dù dữ liệu chunk là mới hay cũ
- các trường hợp path cũ không chuẩn có telemetry/diagnostic quan sát được

### Phase 3 — Evidence correctness verification focused

Phạm vi:

- kiểm chứng end-to-end retrieval -> evidence packet với repo segmented
- xác nhận snippet resolve đúng file kỳ vọng

Exit criteria:

- không còn lỗi “Snippet unavailable” do lệch semantics path trong ca kiểm thử mục tiêu
- backlog item được đóng với bằng chứng rõ ràng

---

## 8) Risks/watchouts

1. **Data history mismatch**
   - chunk cache cũ có thể mang path semantics khác, gây hành vi mixed-state nếu không có normalize guard.

2. **Over-normalization**
   - normalize quá tay có thể làm mất thông tin path hợp lệ trong edge case; cần rule rõ ràng và deterministic.

3. **Duplicate identity after normalization**
   - cùng một file có thể xuất hiện dưới hai biểu diễn path khác nhau trong dữ liệu cũ; cần de-dup cẩn thận ở rerank/evidence.

4. **Silent fallback che lỗi**
   - nếu chỉ fallback `Snippet unavailable` mà không telemetry thì khó chứng minh đã xử lý xong backlog.

5. **Scope creep sang retrieval redesign**
   - task này không bao gồm thay planner, scoring, ANN strategy hay graph retrieval architecture.

---

## 9) Guiding recommendation

Đề xuất điều hành task follow-on này theo 4 nguyên tắc:

1. **Path semantics first:** chuẩn hóa repo-relative canonical là contract chung cho retrieval/evidence.
2. **Transitional safety:** triển khai hybrid để vừa sửa gốc cho dữ liệu mới vừa tương thích dữ liệu cũ.
3. **Narrow blast radius:** chỉ chạm semantic path semantics và evidence correctness; không mở rộng sang redesign retrieval.
4. **Evidence-driven closure:** đóng backlog khi có kiểm chứng thực tế rằng semantic results trong repo segmented tạo evidence packets đúng đường dẫn.

Với cách này, DH giữ được closure trước đó, đồng thời nâng độ tin cậy retrieval/evidence trong môi trường segmented mà không tăng rủi ro kiến trúc không cần thiết.
