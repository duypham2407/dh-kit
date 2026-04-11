# Checklist triển khai theo trạng thái: Marker-Driven Multi-Workspace Segmentation (DH)

**Ngày tạo:** 2026-04-11  
**Task đã phê duyệt:**
- `docs/opencode/marker-driven-multi-workspace-segmentation-analysis-dh.md`
- `docs/scope/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md`
- `docs/solution/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Triển khai **marker-driven segmentation** để `detect-projects` có thể trả về nhiều workspace hợp lệ trong DH.
- Giữ tương thích ngược: khi không đủ điều kiện segmentation thì vẫn fallback single-root như hiện tại.

### Phạm vi (in-scope)
- Marker discovery có kiểm soát theo budget/guardrails đã có.
- Chuẩn hóa/khử trùng lặp root (canonical root dedupe).
- Áp policy root lồng nhau (nested-root) rõ ràng cho milestone này.
- Phát segmented output từ `detect-projects`.
- Căn chỉnh downstream consumers để resolve file path dựa trên `workspaceRoot`.
- Đóng task bằng diagnostics + validation + docs.

### Ngoài phạm vi (out-of-scope)
- Không mở rộng thành subsystem project/worktree đầy đủ.
- Không triển khai lifecycle worktree/project (create/remove/reset/switch).
- Không redesign rộng retrieval/graph/runtime ngoài nhu cầu tiêu thụ segmented output.

---

## 2) Hiện trạng DH vs trạng thái mục tiêu

### Hiện trạng (đã xác nhận)
- [x] [Completed] Scan hardening đã hoàn tất (guardrails, diagnostics, path handling).
- [x] [Completed] `detect-projects` hiện vẫn mặc định behavior single-root.
- [x] [Completed] Task này chỉ là marker-driven segmentation hẹp.
- [x] [Completed] Worktree/project subsystem parity vẫn deferred.

### Trạng thái mục tiêu
- [x] [Completed] `detect-projects` emit nhiều workspace khi marker roots hợp lệ.
- [x] [Completed] Root candidates được canonicalize, dedupe, và xử lý nested-root theo policy freeze.
- [x] [Completed] Downstream file readers không còn giả định `repoRoot + file.path`.
- [x] [Completed] Diagnostics/reporting thể hiện coverage theo từng workspace.
- [x] [Completed] Fallback single-root tiếp tục hoạt động ổn định.

---

## 3) Definition of Done (DoD)

- [x] [Completed] Hoàn tất baseline inventory về các giả định single-root hiện có.
- [x] [Completed] Freeze xong contract segmentation: marker set hỗ trợ + nested-root policy + dedupe policy.
- [x] [Completed] `detect-projects` trả segmented `IndexedWorkspace[]` khi có marker roots hợp lệ.
- [x] [Completed] Fallback single-root được giữ nguyên khi segmentation không áp dụng.
- [x] [Completed] Các consumer chính đã chuyển sang workspaceRoot-aware path resolution.
- [x] [Completed] Diagnostics/summary phản ánh được trạng thái partial/coverage theo workspace.
- [x] [Completed] Validation pass theo command của repo (`npm run check`, `npm run test`) hoặc ghi rõ thiếu bằng chứng nếu có.
- [x] [Completed] Tài liệu liên quan được cập nhật đúng phạm vi; không có thay đổi ngoài scope.

---

## 4) Status legend / giao thức cập nhật

### Status legend bắt buộc
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Giao thức cập nhật
1. Khi bắt đầu làm một mục, đổi trạng thái mục đó thành `[ ] [In progress]`.
2. Chỉ đổi sang `[x] [Completed]` khi có evidence ngay dưới mục (file/test/log).
3. Nếu kẹt > 30 phút hoặc phụ thuộc bên ngoài, chuyển `[ ] [Blocked]` + ghi blocker/owner/ETA.
4. Không mở phase mới khi phase hiện tại còn mục critical chưa xong (trừ khi dependency note cho phép).
5. Cuối mỗi session bắt buộc cập nhật phần **Progress log** và **Resume quick-start**.

---

## 5) Phases / Workstreams + checklist chi tiết

## Phase 0 — Baseline inventory các giả định single-root hiện tại

- [x] [Completed] Liệt kê toàn bộ call-site/consumer còn giả định single-root path resolution.
  - Evidence kỳ vọng: danh sách file + dòng logic cần đổi.
  - Evidence thực tế: grep `path.join(repoRoot, file.path)` + các file đã cập nhật ở packages/intelligence/* và packages/retrieval/*.
- [x] [Completed] Xác nhận semantics hiện tại của `IndexedFile.path` (workspace-relative) và `workspaceRoot`.
  - Evidence kỳ vọng: trích dẫn type + test hiện có.
  - Evidence thực tế: `packages/shared/src/types/indexing.ts`, test fallback/segmentation tại `packages/intelligence/src/workspace/detect-projects.test.ts`.
- [x] [Completed] Chụp baseline behavior của `detect-projects` trên repo mẫu có/không có marker.
  - Evidence kỳ vọng: output workspace count + marker info.
  - Evidence thực tế: test `falls back to single-root...` và `emits segmented workspaces...` trong `detect-projects.test.ts`.
- [x] [Completed] Xác nhận baseline diagnostics hiện có và điểm thiếu ở workspace-level reporting.
  - Evidence thực tế: cập nhật `packages/runtime/src/jobs/index-job-runner.ts` + `index-job-runner.test.ts`.

## Phase 1 — Contract freeze cho segmentation rules và marker hỗ trợ

- [x] [Completed] Freeze marker set milestone-1: `package.json`, `go.mod`.
- [x] [Completed] Freeze policy canonicalization + dedupe root.
- [x] [Completed] Freeze nested-root policy: giữ leaf marker root, suppress ancestor marker root.
- [x] [Completed] Freeze fallback rule: không có root hợp lệ => emit đúng 1 workspace `repoRoot`.
- [x] [Completed] Freeze nguyên tắc tương thích: metadata mới chỉ additive/optional.
- [x] [Completed] Thêm/cập nhật test specification cho các rule trên trước khi code rộng.
  - Evidence: `packages/intelligence/src/workspace/detect-projects.ts`, `packages/intelligence/src/workspace/detect-projects.test.ts`.

## Phase 2 — Marker discovery + canonical root dedupe + nested-root policy

- [x] [Completed] Thêm discovery candidate roots theo traversal có guardrails/budget.
- [x] [Completed] Canonicalize mọi candidate root và reject out-of-repo roots.
- [x] [Completed] Loại duplicate/path-equivalent roots.
- [x] [Completed] Áp nested-root policy đã freeze để tránh overlap/contradictory emission.
- [x] [Completed] Đảm bảo logic root finalization được centralize (không rải path logic nhiều nơi).
- [x] [Completed] Bổ sung test case nested markers, duplicates, out-of-root.
  - Evidence: `discoverWorkspaceRootsByMarkers`, `finalizeWorkspaceRoots` + test `emits segmented workspaces...`.

## Phase 3 — detect-projects segmented output

- [x] [Completed] Emit nhiều `IndexedWorkspace` theo roots đã finalize.
- [x] [Completed] Thu thập file theo từng workspace root, giữ semantics path workspace-relative.
- [x] [Completed] Preserve fallback single-root behavior khi segmentation không đủ điều kiện.
- [x] [Completed] Gắn metadata/diagnostics cần thiết theo từng workspace (additive/optional).
- [x] [Completed] Cập nhật/đảm bảo test cho: multi-marker repo, single-root fallback, partial scan.
  - Evidence: `packages/intelligence/src/workspace/detect-projects.ts`, `packages/intelligence/src/workspace/detect-projects.test.ts`.

## Phase 4 — Downstream consumer alignment (workspaceRoot-aware path resolution)

- [x] [Completed] Chuẩn hóa helper resolve absolute path từ `(workspaceRoot, file.path)`.
- [x] [Completed] Cập nhật graph/symbol/import/call extraction consumers để dùng helper workspace-aware.
- [x] [Completed] Cập nhật retrieval chunking/reader để bỏ giả định `repoRoot + file.path`.
- [x] [Completed] Xác nhận graph delete safety vẫn đúng khi partial scan ở multi-workspace.
- [x] [Completed] Thêm test regression cho path resolution đa workspace.
  - Evidence: `scan-paths.ts`, `graph-indexer.ts`, `extract-import-edges.ts`, `extract-call-edges.ts`, `extract-call-sites.ts`, `ast-symbol-extractor.ts`, `extract-symbols.ts`, `chunker.ts`, tests `graph-indexer.test.ts`, `extract-import-edges.test.ts`.

## Phase 5 — Diagnostics / validation / docs closure

- [x] [Completed] Bổ sung summary workspace-level: workspace count, partial/stopReason theo workspace.
- [x] [Completed] Xác minh reduced coverage signaling không gây hiểu nhầm whole-repo failure.
- [x] [Completed] Chạy `npm run check` và `npm run test` cho slice thay đổi.
- [x] [Completed] Đối chiếu từng AC trong scope/solution và đánh dấu pass/fail có evidence.
- [x] [Completed] Cập nhật docs vận hành/checklist/handoff notes cho session sau.
- [x] [Completed] Re-confirm: không mở rộng sang worktree/project subsystem parity.
  - Evidence: `index-job-runner.ts`, `index-job-runner.test.ts`, `run-retrieval.ts` (reducedCoverage preserved), test + check command output.

---

## 6) Dependencies / sequencing notes

### Chuỗi bắt buộc
1. Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5

### Ràng buộc phụ thuộc quan trọng
- Không code segmentation khi contract freeze (Phase 1) chưa chốt.
- Không align consumers (Phase 4) trước khi segmented emission (Phase 3) ổn định.
- Không đóng task nếu chưa chứng minh được cả 2 chiều: segmented success + single-root fallback.
- Không kéo thêm scope parity/lifecycle vào giữa chuỗi này.

### Việc có thể làm song song (sau Phase 1)
- Chuẩn bị test fixtures cho nested markers và multi-workspace repo mẫu.
- Soạn khung diagnostics/reporting cho Phase 5 trong lúc Phase 3/4 đang chạy.

---

## 7) Risks / watchouts

- [x] [Completed] **Nested marker ambiguity** gây double-index hoặc emit chồng lấn.
  - Mitigation: freeze + test leaf-root policy trước khi rollout.
  - Evidence: leaf-root finalization + segmented tests.
- [x] [Completed] **Hidden single-root assumptions** còn sót trong downstream readers.
  - Mitigation: grep/audit call-site + shared helper workspace-aware.
  - Evidence: workspace-aware helper adoption across all listed consumers.
- [x] [Completed] **Path identity drift** làm lệch graph/retrieval identity.
  - Mitigation: giữ `IndexedFile.path` workspace-relative nhất quán; không đổi semantics tùy tiện.
  - Evidence: `stableFileId(workspaceRoot, relativePath)` + repo-relative graph path normalization.
- [x] [Completed] **Chi phí scan tăng** do multi-root collection.
  - Mitigation: giới hạn marker set milestone-1 + reuse discovery results.
  - Evidence: marker set giữ ở `package.json` và `go.mod`.
- [x] [Completed] **Scope creep** sang parity project/worktree.
  - Mitigation: mọi đề xuất ngoài scope phải chuyển deferred/backlog, không merge trong task này.
  - Evidence: không có thay đổi lifecycle/worktree/project subsystem.

---

## 8) Progress log template

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

## 9) Resume quick-start (cho session mới)

1. Đọc lại 3 tài liệu nguồn đã phê duyệt:
   - `docs/opencode/marker-driven-multi-workspace-segmentation-analysis-dh.md`
   - `docs/scope/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md`
   - `docs/solution/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md`
2. Mở checklist này và tìm các mục đang `[ ] [In progress]` hoặc `[ ] [Blocked]`.
3. Xác nhận phase hiện tại + dependency đã thỏa trước khi sửa code.
4. Ưu tiên hoàn tất mục critical của phase hiện tại trước khi mở phase mới.
5. Sau mỗi thay đổi, cập nhật trạng thái và evidence ngay dưới checklist item.
6. Trước khi kết thúc session, điền Progress Update và ghi rõ 1-3 bước kế tiếp.

---

## 10) Snapshot trạng thái khởi tạo

- [x] [Completed] Checklist đã được tạo đúng thư mục `docs/opencode/`.
- [x] [Completed] Checklist đã bám đúng phạm vi hẹp marker-driven segmentation cho DH.
- [x] [Completed] Đã phản ánh thực tế hiện tại: scan hardening complete, detect-projects single-root default, parity deferred.
- [x] [Completed] Triển khai kỹ thuật theo Phase 0.

### Progress Update — 2026-04-11 19:08
- Session owner: Fullstack Agent
- Phase đang làm: Phase 0 -> Phase 5 (full checklist execution)
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Marker-driven segmentation với canonical root dedupe + leaf nested-root policy + single-root fallback.
- [x] [Completed] Downstream readers chuyển sang workspaceRoot-aware absolute path resolution.
- [x] [Completed] Giữ semantics path workspace-relative + partial-scan safety.
- [x] [Completed] Bổ sung/cập nhật test regression cho segmentation + consumer alignment.
- [x] [Completed] Cập nhật diagnostics workspace-level và xác nhận check/test pass.

#### Việc đang làm
- [ ] [In progress] Không còn.

#### Blockers
- [ ] [Blocked] Không có blocker mở.

#### Quyết định / thay đổi contract (nếu có)
- Milestone marker set giữ nguyên: `package.json`, `go.mod`.
- Nested marker policy: giữ leaf root, suppress ancestor root.
- Absolute file resolution phải dùng `(workspaceRoot, file.path)`.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. Chuyển sang code-review/QA theo quy trình migration lane nếu cần.
2. Theo dõi phản hồi về nested marker policy trên repo thực tế lớn hơn.
3. Nếu cần phase sau: bàn riêng về project/worktree parity (deferred, ngoài scope task này).

### Progress Update — 2026-04-11 19:29
- Session owner: Fullstack Agent
- Phase đang làm: follow-up fix sau code review (retrieval evidence path resolution)
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Sửa finding quan trọng: chuẩn hóa `NormalizedRetrievalResult.filePath` về repo-relative trong `run-retrieval.ts` bằng workspaceRoot-aware resolution.
- [x] [Completed] Đồng bộ graph expansion để match theo repo-relative path thay vì workspace-relative path mơ hồ.
- [x] [Completed] Thêm regression tests cho segmented retrieval filePath + evidence packet read-path.
- [x] [Completed] Chạy lại validation: `npm run check`, `npm run test`.

#### Việc đang làm
- [ ] [In progress] Không còn.

#### Blockers
- [ ] [Blocked] Không có blocker.

#### Quyết định / thay đổi contract (nếu có)
- Retrieval output contract thực tế được chốt: `result.filePath` mang repo-relative path để consumers (bao gồm evidence builder) đọc file ổn định trong multi-workspace.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. Chuyển lại cho code review/QA closure.
2. Theo dõi thêm các consumer ngoài retrieval nếu có nơi nào vẫn giả định workspace-relative trong kết quả hiển thị.
