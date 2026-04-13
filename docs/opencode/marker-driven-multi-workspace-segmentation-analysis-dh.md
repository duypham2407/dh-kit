# Phân tích follow-on: marker-driven multi-workspace segmentation cho DH

Ngày: 2026-04-11  
Phạm vi: follow-on **hẹp và thực dụng** sau khi hoàn tất project/workspace scan hardening; tập trung vào **marker-driven segmentation** (phân đoạn workspace theo marker), **không** mở rộng thành subsystem project/worktree đầy đủ.

---

## 1) Vì sao đây là follow-on hợp lý sau scan hardening

Sau đợt hardening scan, DH đã có nền tảng tốt hơn ở lớp phát hiện file/workspace:

- contract scan rõ hơn (options, diagnostics, stop reason)
- path handling/canonicalization chặt hơn
- guardrails tốt hơn cho phạm vi scan

Tuy nhiên, behavior hiện tại vẫn cố ý giữ mô hình **single-root workspace**: toàn bộ repo được trả về như một workspace duy nhất. Điều này đúng với mục tiêu hardening vừa rồi (ổn định và an toàn trước), nhưng để cải thiện chất lượng indexing/retrieval ở repo đa package thì bước tiếp theo hợp lý là:

- tách boundary workspace theo marker thực tế (ví dụ `package.json`, `go.mod`)
- giữ tương thích ngược với mô hình cũ

Nói ngắn gọn: hardening giải quyết câu hỏi “scan có an toàn và đo đạc được không?”, còn follow-on này giải quyết “scan đã phân vùng đúng thực thể làm việc chưa?”.

---

## 2) Current DH state after scan hardening

Dựa trên mã hiện tại:

- `packages/intelligence/src/workspace/detect-projects.ts`
  - đã có `ScanOptions` (`maxFiles`, `maxDepth`, `maxFileSizeBytes`, `followSymlinks`, `includeExtensions`, `ignoreDirs`)
  - đã có `WorkspaceScanDiagnostics` + `scanMeta.partial`
  - đã detect marker root-level (`package.json`, `go.mod`) và suy ra workspace type
  - **vẫn trả về 1 workspace duy nhất** với `root = repoRoot`

- `packages/intelligence/src/workspace/scan-paths.ts`
  - đã có primitive normalize/canonicalize path và kiểm tra within-workspace

- `packages/shared/src/types/indexing.ts`
  - `IndexedWorkspace` đã có trường optional `diagnostics`, `markers`, `scanMeta`
  - `IndexedFile` đã có `workspaceRoot?`, `ignoredReason?`

- downstream callers
  - `packages/intelligence/src/graph/graph-indexer.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - đã biết khái niệm partial scan và stop reason ở mức tổng quan

Kết luận trạng thái: phần “hardening contract scan/path/diagnostics” đã có, nhưng “segmentation theo nhiều workspace” chưa được kích hoạt trong detection pipeline.

---

## 3) Problem to solve with multi-workspace segmentation

Khi giữ single-root trong repo nhiều package/module, có 4 vấn đề thực dụng:

1. **Độ chính xác ngữ cảnh giảm**
   - retrieval/indexing coi toàn repo là một không gian phẳng, khó phản ánh biên package thực tế.

2. **Chi phí xử lý và nhiễu tăng**
   - pipeline semantic/chunk dễ nhận quá nhiều file ngoài phạm vi truy vấn của một workspace cụ thể.

3. **Diagnostics khó diễn giải theo thực thể**
   - dừng scan/partial hiện gộp theo root, khó biết package nào là điểm nghẽn chính.

4. **Khó mở rộng policy theo workspace**
   - các điều chỉnh scan (budget/ignore/extensions) chưa thể tinh chỉnh theo từng phân đoạn.

Mục tiêu follow-on vì vậy không phải “đại tu project model”, mà là thêm lớp phân đoạn đủ dùng để downstream có thể làm việc theo boundaries thực.

---

## 4) What a narrow first milestone should and should not do

### Nên làm (should)

1. Thêm cơ chế tìm candidate workspace roots theo marker (marker-driven).
2. Sinh danh sách nhiều `IndexedWorkspace` khi có marker hợp lệ.
3. Tránh overlap/duplicate workspace roots bằng canonical path + rule chọn root.
4. Giữ fallback rõ ràng: nếu không có marker phù hợp, vẫn trả 1 root workspace như hiện tại.
5. Giữ tương thích downstream: không phá contract hiện tại của `detectProjects`.

### Không nên làm (should not)

1. Không triển khai subsystem worktree/project lifecycle (create/reset/remove worktree).
2. Không đưa vào git-aware orchestration sâu hoặc state machine mới.
3. Không mở rộng sang parity đầy đủ với upstream filesystem/project stack.
4. Không đổi semantics các lane/workflow runtime.
5. Không tối ưu quá sớm bằng policy đa tầng phức tạp (per-workspace budgets khác nhau) trong milestone đầu.

---

## 5) Architecture options and recommended path

### Option A — Marker discovery nông (top-level only)

- Chỉ scan một tầng gần root (ví dụ `packages/*`) để tìm marker.
- Ưu điểm: đơn giản, nhanh.
- Nhược: dễ miss workspace hợp lệ nằm sâu hoặc không theo layout cố định.

### Option B — Marker discovery có kiểm soát theo budget (khuyến nghị)

- Dùng scan traversal hiện có để phát hiện marker tại thư mục bất kỳ, nhưng bị ràng buộc bởi budget/depth hiện tại.
- Sau khi tìm marker candidates:
  - canonicalize path
  - loại root lồng nhau không cần thiết theo rule ưu tiên (ví dụ giữ root “gần nhất với marker policy”)
  - chạy collect-files theo từng workspace root
- Ưu điểm: thực tế hơn cho nhiều cấu trúc repo, tái dùng hardening đã có.
- Nhược: cần thêm logic de-dup/overlap.

### Option C — Config-driven segmentation (explicit manifest)

- Đọc file cấu hình workspace explicit (nếu có) rồi scan theo danh sách đó.
- Ưu điểm: deterministic cao.
- Nhược: tăng gánh cấu hình, chưa phù hợp milestone đầu khi chưa có chuẩn manifest chính thức.

### Đề xuất

Chọn **Option B** cho milestone đầu vì cân bằng tốt giữa tính thực dụng, độ bao phủ và chi phí thay đổi. Option C có thể để phase sau khi cần deterministic enterprise path.

---

## 6) Mapping cụ thể sang DH packages/modules

### `packages/intelligence/src/workspace/detect-projects.ts`

Đây là điểm thay đổi chính:

1. Bổ sung bước `discoverWorkspaceRootsByMarkers(repoRoot, options)`:
   - quét thư mục theo guardrails hiện có
   - nhận diện marker tại directory-level (`package.json`, `go.mod`, có thể mở rộng sau)
   - trả danh sách roots đã canonicalize

2. Bổ sung bước `finalizeWorkspaceRoots(...)`:
   - loại duplicate
   - xử lý nested roots theo policy milestone 1 (ví dụ: ưu tiên root sâu hơn khi có marker trực tiếp; hoặc chỉ giữ root nông nếu cần đơn giản)
   - đảm bảo mọi root đều nằm trong `repoRoot`

3. Với mỗi workspace root, gọi `collectFiles(root, root, options)` để tạo `IndexedWorkspace` riêng.

4. Fallback:
   - nếu không tìm được marker root hợp lệ, giữ behavior cũ: 1 workspace = `repoRoot`.

### `packages/intelligence/src/workspace/scan-paths.ts`

- Có thể bổ sung helper nhỏ phục vụ overlap check, ví dụ:
  - `isSameOrParentPath(a, b)`
  - `isPathOverlap(a, b)` (nếu cần)
- Mục tiêu: rule xử lý nested workspace nhất quán, không tự viết path logic rải rác.

### `packages/shared/src/types/indexing.ts`

- Giữ backward-compatible; chỉ thêm optional metadata nếu thật sự cần cho milestone:
  - ví dụ `workspaceId?` hoặc `segmentationMeta?` (optional)
- Không đổi cấu trúc bắt buộc làm vỡ consumer.

### `packages/intelligence/src/graph/graph-indexer.ts`

- Chủ yếu hưởng lợi từ `workspace.files` đã phân đoạn.
- Cần đảm bảo key path/node không xung đột khi cùng filename ở workspace khác nhau (đang dựa path tương đối; theo dõi rủi ro collision nếu semantics path thay đổi).

### `packages/retrieval/src/query/run-retrieval.ts`

- Dùng `workspaces` segmented để giảm nhiễu tìm kiếm và hỗ trợ metadata coverage theo workspace.
- Không cần đổi planner lớn ở milestone đầu; ưu tiên hiển thị scan coverage rõ hơn khi có nhiều workspace.

### `packages/runtime/src/jobs/index-job-runner.ts`

- Tổng hợp diagnostics theo multi-workspace:
  - tổng số workspace
  - workspace nào partial/stopReason
- Giữ summary hiện tại, chỉ tăng độ minh bạch theo workspace-level.

---

## 7) Proposed phases for the future task

### Phase 1 — Marker discovery + segmented workspace output (narrow milestone)

Mục tiêu:

- thêm discovery roots theo marker dưới guardrails hiện có
- output nhiều `IndexedWorkspace` khi đủ điều kiện
- fallback an toàn về single-root

Tiêu chí hoàn thành:

- repo đơn giản không marker con: behavior tương đương hiện tại
- repo đa marker: trả nhiều workspace không duplicate/out-of-root

### Phase 2 — Consumer alignment và diagnostics theo workspace

Mục tiêu:

- graph indexer/retrieval/index-job-runner phản ánh được segmented coverage
- summary/diagnostics không còn “gộp mù” toàn repo

Tiêu chí hoàn thành:

- báo cáo rõ workspace nào partial, workspace nào complete
- không regress luồng indexing/retrieval hiện có

### Phase 3 — Policy refinement (nếu cần)

Mục tiêu:

- tinh chỉnh nested-marker policy và marker priority
- cân nhắc config-driven override nhẹ (không bắt buộc)

Tiêu chí hoàn thành:

- hành vi segmentation ổn định trên vài layout monorepo phổ biến
- không mở rộng ngoài scope marker-driven segmentation

---

## 8) Key risks / watchouts

1. **Nested marker ambiguity**
   - root cha và root con cùng có marker; nếu policy không rõ sẽ tạo double-index hoặc bỏ sót.

2. **Path collision/identity drift**
   - nếu cách tính file identity/path thay đổi mà không nhất quán, có thể gây xóa/chèn node sai ở graph.

3. **Scan cost tăng do nhiều roots**
   - segmentation có thể khiến traversal lặp; cần tái sử dụng discovery result hoặc giới hạn hợp lý.

4. **Coverage interpretation sai ở downstream**
   - partial ở một workspace không đồng nghĩa toàn repo unusable; cần summary đúng cấp.

5. **Scope creep**
   - dễ trượt sang “project/worktree subsystem parity”; cần giữ lane hẹp theo mục tiêu follow-on.

---

## 9) Guiding recommendation

Khuyến nghị thực thi follow-on theo nguyên tắc:

1. **Ưu tiên Option B (marker discovery có budget) trong milestone đầu**.  
2. **Giữ tương thích ngược tuyệt đối** với single-root behavior khi không có marker segmentation hợp lệ.  
3. **Tập trung vào boundary correctness + diagnostics clarity**, không mở rộng thành subsystem quản trị project/worktree.  
4. **Đánh giá thành công bằng chất lượng phân vùng và minh bạch coverage**, không phải số lượng tính năng mới.  

Nếu bám đúng các nguyên tắc trên, DH sẽ có bước tiến thực dụng từ scan hardening sang multi-workspace segmentation mà vẫn giữ rủi ro thay đổi ở mức thấp và kiểm soát được.
