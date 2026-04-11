# Checklist triển khai theo trạng thái: Project / Workspace Scan Hardening (DH)

**Ngày tạo:** 2026-04-11  
**Nguồn phê duyệt:**
- `docs/opencode/project-workspace-scan-hardening-selective-port-mapping-dh.md`
- `docs/scope/2026-04-11-project-workspace-scan-hardening-dh.md`
- `docs/solution/2026-04-11-project-workspace-scan-hardening-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Hardening luồng scan project/workspace trong DH để đầu vào cho indexing/retrieval/job-runner **an toàn hơn, nhất quán path hơn, và quan sát được (diagnostics)**.

### Phạm vi thực thi (in-scope)
- Hardening ở lớp scan/path:
  - `packages/intelligence/src/workspace/detect-projects.ts`
  - `packages/intelligence/src/graph/module-resolver.ts` (alignment path normalization)
  - consumer alignment cho:
    - `packages/intelligence/src/graph/graph-indexer.ts`
    - `packages/retrieval/src/query/run-retrieval.ts`
    - `packages/runtime/src/jobs/index-job-runner.ts`
  - type/contracts liên quan trong `packages/shared/src/types/indexing.ts`

### Ngoài phạm vi (out-of-scope)
- Không mở rộng thành full parity upstream `Project/Vcs/Worktree`.
- Không mở rộng broad worktree/shell/plugin.
- Không làm lại toàn bộ subsystem project management.

---

## 2) Hiện trạng vs trạng thái mục tiêu

### Hiện trạng (DH hiện tại)
- `detect-projects.ts` còn mỏng: scan đệ quy cơ bản, ignore cơ bản, 1 workspace root.
- `module-resolver.ts` còn mỏng: normalize/resolve path chưa đóng vai trò contract thống nhất với scan.
- Consumer downstream có nguy cơ xem scan output như full coverage.

### Trạng thái mục tiêu của task này
- Có contract scan rõ ràng: options + diagnostics + stop reason.
- Có invariant canonical path dùng thống nhất giữa scan/resolver/indexer.
- Có phân biệt full scan vs partial scan ở downstream.
- Có đóng task bằng validation + docs closure, không vượt scope.

---

## 3) Definition of Done (DoD)

- [x] [Completed] Contract scan diagnostics + canonical path rules được freeze và áp dụng nhất quán.
  - Evidence: `packages/shared/src/types/indexing.ts`, `packages/intelligence/src/workspace/scan-paths.ts`
- [x] [Completed] `detect-projects` hardening xong: budget controls, symlink policy, marker-based workspace typing, diagnostics.
  - Evidence: `packages/intelligence/src/workspace/detect-projects.ts`, `packages/intelligence/src/workspace/detect-projects.test.ts`
- [x] [Completed] `module-resolver` align path normalization với contract scan.
  - Evidence: `packages/intelligence/src/graph/module-resolver.ts`, `packages/intelligence/src/graph/module-resolver.test.ts`
- [x] [Completed] `graph-indexer` xử lý partial-scan an toàn (không false deletion do budget-stop).
  - Evidence: `packages/intelligence/src/graph/graph-indexer.ts`, `packages/intelligence/src/graph/graph-indexer.test.ts`
- [x] [Completed] `run-retrieval` phản ánh reduced coverage khi scan partial.
  - Evidence: `packages/retrieval/src/query/run-retrieval.ts`, `packages/retrieval/src/query/run-retrieval.test.ts`
- [x] [Completed] `index-job-runner` tổng hợp và hiển thị scan diagnostics rõ ràng.
  - Evidence: `packages/runtime/src/jobs/index-job-runner.ts`, `packages/runtime/src/jobs/index-job-runner.test.ts`
- [x] [Completed] Validation có evidence cho các case chính (happy path + partial/budget/marker/symlink/path).
  - Evidence: `npm run check`, `npm run test`, focused test `vitest run packages/intelligence/src/workspace/detect-projects.test.ts`
- [x] [Completed] Docs liên quan được cập nhật đúng phạm vi scan/path hardening.
  - Evidence: checklist status + progress log update in this file
- [x] [Completed] Không có thay đổi ngoài scope (worktree/shell/plugin broadening vẫn deferred).
  - Evidence: only scan/path and listed consumers were changed

---

## 4) Status legend & giao thức cập nhật

### Status legend bắt buộc
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Giao thức cập nhật
1. Khi bắt đầu item: đổi sang `[ ] [In progress]`.
2. Chỉ đổi sang `[x] [Completed]` khi có evidence (test/log/file diff) ngay dưới item.
3. Nếu bị chặn > 30 phút hoặc phụ thuộc người khác: đổi sang `[ ] [Blocked]`, thêm blocker + owner + ETA.
4. Không mở phase mới khi phase trước còn item critical chưa hoàn tất (trừ khi ghi rõ dependency cho phép song song).
5. Cuối mỗi session: cập nhật **Progress Log** + **Resume quick-start**.

---

## 5) Phases / Workstreams và checklist chi tiết

## Phase 0 — Baseline inventory scan/indexing path hiện tại

- [x] [Completed] Chốt baseline file map cho scan flow (detect -> indexer -> retrieval -> job runner).
- [x] [Completed] Chụp baseline behavior thực tế với repo mẫu nhỏ (đếm file scanned/indexed, workspace type hiện tại).
- [x] [Completed] Xác định các điểm mỏng hiện tại trong `detect-projects.ts` (budget/symlink/marker/diagnostics/path).
- [x] [Completed] Xác định điểm lệch normalization giữa `detect-projects`, `module-resolver`, `graph-indexer`.
- [x] [Completed] Chốt baseline assumptions cần giữ tương thích ngược (single-root workspace, shape dữ liệu hiện có).

## Phase 1 — Contract freeze cho scan diagnostics & canonical path rules

- [x] [Completed] Freeze vocabulary `ScanOptions` (maxFiles/maxDepth/maxFileSize/followSymlinks/ignore...).
- [x] [Completed] Freeze vocabulary `ScanDiagnostics` (visited/indexed/ignored/skipped/errors/stopReason).
- [x] [Completed] Freeze canonical path rules (relative-to-workspace, slash normalization, reject out-of-root).
- [x] [Completed] Freeze rule phân biệt `complete scan` vs `partial scan` để downstream dùng chung.
- [x] [Completed] Freeze compatibility rule: field mở rộng là additive/optional.

## Phase 2 — detect-projects hardening (trọng tâm)

- [x] [Completed] Thêm scan budget controls với default an toàn.
- [x] [Completed] Thêm symlink policy explicit (mặc định safe-by-default, không recurse bừa).
- [x] [Completed] Tách marker detection khỏi danh sách indexed files để workspace typing đúng thực tế.
- [x] [Completed] Áp canonical path invariant tại scan output.
- [x] [Completed] Bổ sung diagnostics chi tiết + stop reason khi partial/budget stop.
- [x] [Completed] Đảm bảo graceful degradation khi lỗi IO cục bộ (không fail cứng toàn bộ scan nếu không cần).
- [x] [Completed] Giữ behavior single-root workspace cho slice đầu (segmentation nâng cao để sau).

## Phase 3 — Module resolver / path normalization alignment

- [x] [Completed] Đồng bộ normalize logic trong `module-resolver.ts` theo canonical rule đã freeze.
- [x] [Completed] Loại bỏ hoặc giảm normalization cục bộ lệch chuẩn giữa resolver và scan.
- [x] [Completed] Xác nhận key path giữa resolver/indexer tương thích (tránh duplicate/miss do format path khác nhau).
- [x] [Completed] Bổ sung/điều chỉnh test cho các case relative specifier + extension/index fallback theo path chuẩn mới.

## Phase 4 — Downstream consumer alignment (graph-indexer / retrieval / index-job-runner)

- [x] [Completed] `graph-indexer`: xử lý partial-scan an toàn, không coi file thiếu trong scan partial là deleted chắc chắn.
- [x] [Completed] `run-retrieval`: thêm reduced-coverage signal/metadata khi scan partial.
- [x] [Completed] `index-job-runner`: tổng hợp scan diagnostics + stop reason vào output/operator summary.
- [x] [Completed] Đồng bộ cách đọc canonical path ở cả 3 consumer (không normalize mỗi nơi một kiểu).
- [x] [Completed] Cập nhật test tích hợp cho các flow có budget stop / marker mismatch / path normalization.

## Phase 5 — Validation & docs closure

- [x] [Completed] Chạy full validation command của repo cho thay đổi liên quan.
- [x] [Completed] Chạy/viết test cho matrix tối thiểu:
  - happy path full-scan
  - budget-stop partial-scan
  - symlink safe-default
  - marker-based workspace typing
  - canonical path consistency scan/resolver/indexer
- [x] [Completed] Đối chiếu từng AC trong scope/solution và đánh dấu pass/fail có evidence.
- [x] [Completed] Cập nhật docs vận hành/implementation note đúng với implementation thực tế.
- [x] [Completed] Xác nhận lại không có mở rộng ngoài phạm vi scan/path hardening.

## Phase 6 — Deferred guard (xác nhận hạng mục trì hoãn)

- [x] [Completed] Ghi rõ các mục deferred: worktree lifecycle, shell orchestration, plugin broadening.
- [x] [Completed] Nếu phát sinh đề xuất ngoài scope, chuyển vào backlog/deferred list thay vì implement trong task này.
- [x] [Completed] Chốt handoff note cho session sau: đã xong / còn lại / blocker / deferred.

---

## 6) Dependencies / ghi chú thứ tự thực hiện

### Chuỗi bắt buộc
1. Phase 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6

### Ràng buộc phụ thuộc quan trọng
- Không implement consumer alignment trước khi contract scan/path ở Phase 1 được freeze.
- Không finalize resolver alignment trước khi detect-projects phát canonical output ổn định.
- Không đóng task nếu chưa chứng minh được downstream hiểu partial-scan.
- Không thực hiện hạng mục worktree/shell/plugin trong task này.

### Việc có thể song song (sau khi freeze contract)
- Viết test cho Phase 2 và chuẩn bị test fixtures cho Phase 4.
- Cập nhật docs khung checklist trong lúc coding, nhưng chỉ đánh Completed sau khi validation pass.

---

## 7) Risks / watchouts

- [x] [Completed] **Scope creep** sang full upstream parity (project/worktree/shell/plugin).
  - Mitigation: only scan/path + listed consumer files changed.
- [x] [Completed] **False deletion risk** ở graph-indexer khi scan partial.
  - Mitigation: delete pass gated by `scanMeta.partial === false` + test added.
- [x] [Completed] **Path drift** giữa detect-projects / module-resolver / graph-indexer.
  - Mitigation: shared helper `scan-paths.ts` used by scan/resolver/indexer/import-edge extraction.
- [x] [Completed] **Over-tight budget** làm scan quá an toàn nhưng thiếu coverage thực dụng.
  - Mitigation: defaults are conservative and overridable via `ScanOptions`.
- [x] [Completed] **Marker heuristic quá hẹp hoặc lệch** gây workspace typing sai.
  - Mitigation: explicit marker checks (`package.json`, `go.mod`) with additive marker metadata.
- [x] [Completed] **Thiếu auditability** nếu diagnostics không đủ để truy nguyên lý do skip/stop.
  - Mitigation: workspace diagnostics + scanMeta + job/retrieval surfacing.

**Nguyên tắc xử lý rủi ro:** mọi rủi ro khi xảy ra phải có cập nhật trạng thái + mitigation cụ thể trong Progress Log.

---

## 8) Progress log template (copy cho mỗi phiên)

```md
### Progress Update — YYYY-MM-DD HH:mm
- Session owner:
- Phase đang làm:
- Trạng thái tổng quan: [ ] [Not started] / [ ] [In progress] / [x] [Completed] / [ ] [Blocked]

#### Việc đã hoàn thành
- [x] [Completed] ...
- Evidence:
  - <file/test/log>

#### Việc đang làm
- [ ] [In progress] ...

#### Blockers
- [ ] [Blocked] <mô tả blocker>
  - Owner xử lý:
  - ETA:
  - Workaround tạm thời:

#### Quyết định / thay đổi contract (nếu có)
- ...

#### Việc tiếp theo (1-3 mục ưu tiên)
1.
2.
3.
```

---

## 9) Resume quick-start (dành cho session mới)

1. Mở 3 tài liệu nguồn đã phê duyệt:
   - `docs/opencode/project-workspace-scan-hardening-selective-port-mapping-dh.md`
   - `docs/scope/2026-04-11-project-workspace-scan-hardening-dh.md`
   - `docs/solution/2026-04-11-project-workspace-scan-hardening-dh.md`
2. Mở checklist này, tìm mục đang `[ ] [In progress]` hoặc `[ ] [Blocked]`.
3. Xác nhận phase hiện tại và dependencies đã thỏa.
4. Ưu tiên hoàn tất item dở dang của phase hiện tại trước khi mở phase mới.
5. Sau mỗi thay đổi, cập nhật status + evidence ngay bên dưới item tương ứng.
6. Trước khi kết thúc session, điền **Progress Update** và ghi rõ bước tiếp theo.

---

## 10) Snapshot trạng thái khởi tạo (initial)

- [x] [Completed] Checklist đã được tạo đúng dưới `docs/opencode/`.
- [x] [Completed] Đã liên kết đúng 3 tài liệu nguồn phê duyệt.
- [x] [Completed] Phase 0 bắt đầu thực thi.
- [x] [Completed] Các phase tiếp theo.

---

### Progress Update — 2026-04-11 17:52
- Session owner: Fullstack Agent
- Phase đang làm: Phase 0 -> Phase 6
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Hardened scan contract, diagnostics, marker-based typing, canonical paths, and safe defaults.
  - Evidence:
    - `packages/intelligence/src/workspace/detect-projects.ts`
    - `packages/intelligence/src/workspace/scan-paths.ts`
    - `packages/shared/src/types/indexing.ts`
- [x] [Completed] Aligned downstream consumers for partial scan handling.
  - Evidence:
    - `packages/intelligence/src/graph/graph-indexer.ts`
    - `packages/retrieval/src/query/run-retrieval.ts`
    - `packages/runtime/src/jobs/index-job-runner.ts`
- [x] [Completed] Added/updated tests for path normalization and partial scan safety.
  - Evidence:
    - `packages/intelligence/src/workspace/detect-projects.test.ts`
    - `packages/intelligence/src/graph/graph-indexer.test.ts`
    - `packages/intelligence/src/graph/module-resolver.test.ts`
    - `packages/retrieval/src/query/run-retrieval.test.ts`
    - `packages/runtime/src/jobs/index-job-runner.test.ts`
- [x] [Completed] Validation executed successfully.
  - Evidence:
    - `npm run check` (pass)
    - `npm run test` (pass)

#### Việc đang làm
- [x] [Completed] None

#### Blockers
- [x] [Completed] None

#### Quyết định / thay đổi contract (nếu có)
- Canonical path contract moved to shared helper `scan-paths.ts` and used by scanner + resolver + graph/import flows.
- Partial scan is now first-class through `diagnostics.stopReason` and `scanMeta.partial`.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. If approved later: evaluate marker-driven multi-workspace segmentation as a separate slice.
2. Keep scan diagnostics vocabulary stable across future consumers.
3. Preserve deferred boundaries (no worktree/shell/plugin broadening in this slice).

### Progress Update — 2026-04-11 18:05
- Session owner: Fullstack Agent
- Phase đang làm: Review fix follow-up
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Resolved important mismatch: removed un-emitted `symlink_skipped` stop reason from contract.
  - Evidence:
    - `packages/shared/src/types/indexing.ts`
    - `packages/intelligence/src/workspace/detect-projects.ts`
    - `packages/intelligence/src/workspace/detect-projects.test.ts`
- [x] [Completed] Clarified size-stop semantics by renaming stop reason to `max_file_size_scan_stopped`.
  - Evidence:
    - `packages/shared/src/types/indexing.ts`
    - `packages/intelligence/src/workspace/detect-projects.ts`
    - `packages/intelligence/src/workspace/detect-projects.test.ts`
- [x] [Completed] Deduplicated retrieval stop reasons.
  - Evidence:
    - `packages/retrieval/src/query/run-retrieval.ts`
- [x] [Completed] Removed local graph-indexer normalize alias and used shared helper directly.
  - Evidence:
    - `packages/intelligence/src/graph/graph-indexer.ts`
- [x] [Completed] Clarified index-job diagnostics semantics (`filesIndexed` vs `filesRefreshed`) with inline contract comments.
  - Evidence:
    - `packages/runtime/src/jobs/index-job-runner.ts`
- [x] [Completed] Re-ran targeted validation for fixes.
  - Evidence:
    - `npm run check` (pass)
    - `npm run test -- packages/intelligence/src/workspace/detect-projects.test.ts packages/retrieval/src/query/run-retrieval.test.ts packages/intelligence/src/graph/graph-indexer.test.ts packages/runtime/src/jobs/index-job-runner.test.ts` (pass)

#### Việc đang làm
- [x] [Completed] None

#### Blockers
- [x] [Completed] None

#### Quyết định / thay đổi contract (nếu có)
- Stop-reason vocabulary narrowed for coherence: removed `symlink_skipped`, renamed file-size stop to explicit scan-stop wording.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. Keep stop-reason vocabulary stable unless future scope explicitly revisits scan policy.
2. Preserve deferred items (multi-workspace/worktree/shell remain out of scope).
3. Optionally run full suite again before final closure if requested.
