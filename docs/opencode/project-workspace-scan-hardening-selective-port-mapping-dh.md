# Phân tích selective-port cho project/workspace scan hardening (DH)

Ngày: 2026-04-11  
Phạm vi tập trung: **task kế tiếp cho DH là hardening scan project/workspace**, không mở rộng sang port toàn bộ subsystem project/filesystem/shell/worktree.

## Bối cảnh đã đối chiếu

### Upstream đã inspect

- `/Users/duypham/Code/opencode/packages/opencode/src/project/project.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/project/bootstrap.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/project/vcs.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/filesystem/index.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/shell/shell.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/worktree/index.ts`

### DH đã inspect

- `packages/intelligence/src/workspace/detect-projects.ts`
- `packages/intelligence/src/graph/module-resolver.ts`
- `packages/runtime/src/hooks/bash-guard.ts`
- các caller trực tiếp của workspace scan:
  - `packages/intelligence/src/graph/graph-indexer.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
- kiểu dữ liệu hiện tại:
  - `packages/shared/src/types/indexing.ts`

---

## vì sao sau MCP thì project/workspace scan hardening là task tiếp theo hợp lý

Sau pha MCP routing hardening, điểm nghẽn tiếp theo của DH nằm ở **chất lượng dữ liệu đầu vào của intelligence pipeline**:

1. **detectProjects đang là “single choke-point”** cho indexing, retrieval, và index job runner. Nếu scan sai/thiếu/chậm, tất cả các lớp sau đều bị ảnh hưởng dây chuyền.
2. MCP hardening chủ yếu tối ưu “route tool nào”, còn scan hardening tối ưu “đưa đúng context code vào tool”. Hai việc nối tiếp logic nhau.
3. DH hiện chưa có lớp “filesystem/workspace guardrails” đủ mạnh (symlink policy, giới hạn scan, phân loại workspace rõ ràng), nên risk vận hành thực tế cao khi repo lớn.
4. Đây là task có **ROI cao nhưng phạm vi hẹp**: chủ yếu tăng độ tin cậy của `detect-projects.ts` và contract liên quan, không cần thay đổi kiến trúc lane/workflow lớn.

Kết luận: nếu MCP là hardening ở lớp quyết định công cụ, thì workspace scan hardening là hardening ở lớp dữ liệu nền. Là bước kế tiếp hợp lý và sát thực thi.

---

## upstream mạnh ở đâu trong project/filesystem/shell/worktree

Những điểm mạnh đáng học từ nhóm upstream này (theo góc scan hardening):

1. **Project identity + worktree awareness** (`project.ts`):
   - phân biệt `worktree`, `sandbox`, `project id`, có xử lý trường hợp không có git.
   - có canonicalization và “upward discovery” (`fs.up`) thay vì scan đệ quy thuần.

2. **Filesystem abstraction giàu primitive an toàn** (`filesystem/index.ts`):
   - có `existsSafe`, `isDir`, `isFile`, `readDirectoryEntries` kiểu hóa, `glob`, `up`, `globUp`.
   - có normalize path theo platform (đặc biệt Windows), có helper `contains/overlaps`.

3. **Runtime shell guard theo platform** (`shell/shell.ts`):
   - chọn shell fallback theo OS, kill process tree có kiểm soát, blacklist shell không phù hợp.
   - không trực tiếp là workspace scan, nhưng liên quan hardening ở biên execution.

4. **Worktree lifecycle rõ ràng** (`worktree/index.ts`):
   - canonical path trước thao tác xóa/reset, parse git worktree state, tránh thao tác nhầm root.
   - có guard “không reset primary workspace”.

5. **State/runtime model nhất quán** (`project.ts`, `vcs.ts`, `worktree/index.ts`):
   - service-based, có event/update và fallback rõ ràng khi môi trường thiếu git.

Điểm quan trọng: upstream mạnh nhờ **các invariant vận hành** (identity, canonical path, safety check), không phải vì quét toàn bộ cây file càng nhiều càng tốt.

---

## DH hiện đang ở đâu và còn mỏng ở đâu

### DH hiện có (factual)

1. `detect-projects.ts`:
   - scan đệ quy từ `repoRoot` bằng `fs.readdir`.
   - bỏ qua thư mục cố định: `.git`, `node_modules`, `.dh`, `dist`.
   - chỉ index extension trong map cứng (`.ts/.tsx/.js/.jsx/.json/.md/.go`).
   - hiện trả **1 workspace duy nhất** (`root = repoRoot`).

2. `graph-indexer.ts`, `run-retrieval.ts`, `index-job-runner.ts` đều dùng trực tiếp `detectProjects` làm input đầu vào.

3. `module-resolver.ts` chỉ xử lý relative specifier và extension/index fallback cơ bản, chưa có policy path normalization/phân vùng workspace.

4. `bash-guard.ts` có rule thay thế command tốt ở lớp command surface, nhưng không giải quyết scan correctness trong intelligence layer.

### Chỗ còn mỏng cần hardening

1. **Không có scan budget/control**: chưa có max-files, max-depth, max-size, timeout/cancel.
2. **Không có symlink policy rõ ràng**: nguy cơ loop hoặc scan vượt phạm vi repo qua symlink.
3. **Workspace typing hiện sai về mặt logic**:
   - `detectWorkspaceType` check `package.json`/`go.mod` nhưng các file này không nằm trong `INDEXABLE_EXTENSIONS`, nên gần như luôn `unknown`.
4. **Không có phân loại “ignored reason”/telemetry**: khó debug vì sao file không được index.
5. **Không có multi-workspace segmentation thực tế** (monorepo): currently gom tất cả vào một workspace.
6. **Chưa có canonical path normalization nhất quán** cho scan output và các consumer downstream.

---

## selective-port gì là đáng nhất lúc này

Tập trung selective-port theo nguyên tắc “ít nhưng đắt giá” cho **workspace scan hardening**:

1. **Upward marker discovery + workspace boundary primitives**
   - học từ `filesystem.up/findUp/globUp` của upstream.
   - mục tiêu: xác định boundary workspace thực tế trước khi quét sâu.

2. **Path canonicalization invariant**
   - học từ `normalizePath/resolve/contains/overlaps` và canonical flow ở worktree.
   - mục tiêu: chống duplicate path, giảm sai lệch theo platform, ngăn vượt root ngoài ý muốn.

3. **Typed directory entry + reasoned filtering**
   - học ý tưởng `readDirectoryEntries` typed và filter có lý do.
   - mục tiêu: scan output có metadata đủ cho diagnostics.

4. **Safety guardrails cho scan**
   - giới hạn depth/files/size và policy “ignore by default” cho thư mục rủi ro cao.
   - mục tiêu: predictable runtime trên repo lớn.

5. **Graceful degradation khi môi trường không đầy đủ**
   - tương tự upstream fallback khi không có git.
   - mục tiêu: detect-projects không fail cứng toàn bộ job chỉ vì một nhánh lỗi IO.

Lưu ý: đây là selective-port về **invariant & pattern**, không phải copy nguyên service stack Effect của upstream.

---

## những gì KHÔNG nên port wholesale

1. Không port nguyên `Project`/`Vcs`/`Worktree` service model dùng Effect Layer + InstanceState vào DH ở task này.
2. Không port lifecycle git worktree đầy đủ (create/remove/reset) vì không phục vụ trực tiếp mục tiêu hardening scan hiện tại.
3. Không port toàn bộ shell orchestration/kill tree logic cho intelligence scan task.
4. Không port các concern UI/event-bus của upstream (`GlobalBus`, project icon discovery, command event hooks).
5. Không mở rộng thành “project management subsystem” mới trong DH khi mục tiêu trước mắt chỉ là scan reliability.

---

## mapping cụ thể sang DH packages/modules

### 1) `packages/intelligence/src/workspace/detect-projects.ts` (trọng tâm)

Đề xuất nâng cấp theo hướng hardening:

- thêm `ScanOptions` (với default an toàn):
  - `maxFiles`, `maxDepth`, `maxFileSizeBytes`, `followSymlinks`, `includeExtensions`, `ignoreDirs`, `ignoreGlobs`.
- thêm `ScanDiagnostics`:
  - `filesVisited`, `filesIndexed`, `filesIgnored`, `dirsSkipped`, `errors`, `stopReason`.
- sửa logic `detectWorkspaceType`:
  - dùng marker scan riêng (check tồn tại `package.json`, `go.mod`, v.v.) thay vì phụ thuộc vào `files` đã lọc extension.
- thêm canonical path utility dùng chung trong scan.

### 2) `packages/shared/src/types/indexing.ts`

Mở rộng có kiểm soát:

- `IndexedWorkspace` thêm trường optional:
  - `diagnostics?`, `markers?`, `scanMeta?`.
- `IndexedFile` thêm optional:
  - `ignoredReason?`, `workspaceRoot?`.

Giữ backward compatibility bằng optional fields để không làm vỡ caller hiện hữu.

### 3) `packages/runtime/src/jobs/index-job-runner.ts`

- nhận và log `workspaces[].diagnostics` vào `IndexJobResult.diagnostics` tổng hợp.
- nếu scan dừng do budget (`stopReason`), ghi rõ trong summary để operator hiểu “partial index”.

### 4) `packages/intelligence/src/graph/graph-indexer.ts`

- consume canonicalized path từ scan output, hạn chế tự normalize theo nhiều kiểu.
- khi nhận partial scan, tránh diễn giải nhầm là “files deleted thật” (đặc biệt block xóa node nếu run bị budget-stop).

### 5) `packages/retrieval/src/query/run-retrieval.ts`

- xử lý tình huống workspace scan bị cắt ngưỡng: thêm metadata cảnh báo vào retrieval output để planner biết coverage không đầy đủ.

### 6) `packages/intelligence/src/graph/module-resolver.ts` (liên quan gián tiếp)

- đồng bộ path normalization với lớp workspace scan để giảm mismatch path key giữa resolver và indexer.

---

## đề xuất phases cho task tiếp theo

### Phase 1 — Scan contract hardening (nhỏ, bắt buộc)

Mục tiêu:

- thêm `ScanOptions` + `ScanDiagnostics`.
- sửa `detectWorkspaceType` theo marker thực.
- bổ sung canonical path handling và symlink policy mặc định `no-follow`.

Kết quả mong đợi:

- scan không âm thầm chạy vô hạn/ngoài phạm vi.
- loại workspace không còn lệch logic như hiện tại.

### Phase 2 — Consumer alignment (an toàn vận hành)

Mục tiêu:

- cập nhật `index-job-runner`, `graph-indexer`, `run-retrieval` để hiểu diagnostics/partial-scan.
- đảm bảo output summary phản ánh đúng coverage.

Kết quả mong đợi:

- tránh hành vi downstream sai do coi partial scan là full scan.

### Phase 3 — Monorepo-aware segmentation (chỉ khi cần)

Mục tiêu:

- tách nhiều workspace logic khi có marker rõ (vd packages/*).
- vẫn giữ backward compatibility với mode “single-root workspace”.

Kết quả mong đợi:

- cải thiện chất lượng index/retrieval trong repo đa package.

---

## 5 điều đáng lấy nhất từ upstream nhóm này

1. **Canonical path là invariant bắt buộc**, không phải tối ưu tùy chọn.
2. **Upward discovery (`up/findUp`) giúp xác định boundary đúng** trước khi scan sâu.
3. **Filesystem primitive typed + safe wrappers** làm runtime dễ harden và dễ debug.
4. **Graceful fallback khi thiếu git/IO lỗi cục bộ** giúp pipeline không fail toàn cục.
5. **Safety-first operations** (contains/overlaps checks, root protection) nên áp dụng cả cho scan path.

---

## kết luận / guiding recommendation

Khuyến nghị thực thi ngay cho DH:

1. **Chốt task kế tiếp là “project/workspace scan hardening” với phạm vi hẹp ở `detect-projects.ts` + consumer alignment**, không mở rộng sang full project/filesystem/worktree port.
2. **Selective-port theo invariant vận hành** từ upstream (canonical path, upward boundary, safe IO wrappers, graceful degradation), không port theo cấu trúc framework Effect.
3. **Ưu tiên tính đúng và tính quan sát được (diagnostics) trước hiệu năng nâng cao**; vì hiện tại nút thắt chính là độ tin cậy dữ liệu scan.
4. **Giữ tương thích ngược** bằng cách thêm trường optional và default behavior, để không phá workflow indexing/retrieval đang chạy.

Nếu cần một câu chốt: **DH nên “học cách upstream bảo vệ biên scan” thay vì “sao chép cả subsystem project/worktree”.**
