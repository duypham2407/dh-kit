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
- [ ] [Not started] `detect-projects` emit nhiều workspace khi marker roots hợp lệ.
- [ ] [Not started] Root candidates được canonicalize, dedupe, và xử lý nested-root theo policy freeze.
- [ ] [Not started] Downstream file readers không còn giả định `repoRoot + file.path`.
- [ ] [Not started] Diagnostics/reporting thể hiện coverage theo từng workspace.
- [ ] [Not started] Fallback single-root tiếp tục hoạt động ổn định.

---

## 3) Definition of Done (DoD)

- [ ] [Not started] Hoàn tất baseline inventory về các giả định single-root hiện có.
- [ ] [Not started] Freeze xong contract segmentation: marker set hỗ trợ + nested-root policy + dedupe policy.
- [ ] [Not started] `detect-projects` trả segmented `IndexedWorkspace[]` khi có marker roots hợp lệ.
- [ ] [Not started] Fallback single-root được giữ nguyên khi segmentation không áp dụng.
- [ ] [Not started] Các consumer chính đã chuyển sang workspaceRoot-aware path resolution.
- [ ] [Not started] Diagnostics/summary phản ánh được trạng thái partial/coverage theo workspace.
- [ ] [Not started] Validation pass theo command của repo (`npm run check`, `npm run test`) hoặc ghi rõ thiếu bằng chứng nếu có.
- [ ] [Not started] Tài liệu liên quan được cập nhật đúng phạm vi; không có thay đổi ngoài scope.

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

- [ ] [Not started] Liệt kê toàn bộ call-site/consumer còn giả định single-root path resolution.
  - Evidence kỳ vọng: danh sách file + dòng logic cần đổi.
- [ ] [Not started] Xác nhận semantics hiện tại của `IndexedFile.path` (workspace-relative) và `workspaceRoot`.
  - Evidence kỳ vọng: trích dẫn type + test hiện có.
- [ ] [Not started] Chụp baseline behavior của `detect-projects` trên repo mẫu có/không có marker.
  - Evidence kỳ vọng: output workspace count + marker info.
- [ ] [Not started] Xác nhận baseline diagnostics hiện có và điểm thiếu ở workspace-level reporting.

## Phase 1 — Contract freeze cho segmentation rules và marker hỗ trợ

- [ ] [Not started] Freeze marker set milestone-1: `package.json`, `go.mod`.
- [ ] [Not started] Freeze policy canonicalization + dedupe root.
- [ ] [Not started] Freeze nested-root policy: giữ leaf marker root, suppress ancestor marker root.
- [ ] [Not started] Freeze fallback rule: không có root hợp lệ => emit đúng 1 workspace `repoRoot`.
- [ ] [Not started] Freeze nguyên tắc tương thích: metadata mới chỉ additive/optional.
- [ ] [Not started] Thêm/cập nhật test specification cho các rule trên trước khi code rộng.

## Phase 2 — Marker discovery + canonical root dedupe + nested-root policy

- [ ] [Not started] Thêm discovery candidate roots theo traversal có guardrails/budget.
- [ ] [Not started] Canonicalize mọi candidate root và reject out-of-repo roots.
- [ ] [Not started] Loại duplicate/path-equivalent roots.
- [ ] [Not started] Áp nested-root policy đã freeze để tránh overlap/contradictory emission.
- [ ] [Not started] Đảm bảo logic root finalization được centralize (không rải path logic nhiều nơi).
- [ ] [Not started] Bổ sung test case nested markers, duplicates, out-of-root.

## Phase 3 — detect-projects segmented output

- [ ] [Not started] Emit nhiều `IndexedWorkspace` theo roots đã finalize.
- [ ] [Not started] Thu thập file theo từng workspace root, giữ semantics path workspace-relative.
- [ ] [Not started] Preserve fallback single-root behavior khi segmentation không đủ điều kiện.
- [ ] [Not started] Gắn metadata/diagnostics cần thiết theo từng workspace (additive/optional).
- [ ] [Not started] Cập nhật/đảm bảo test cho: multi-marker repo, single-root fallback, partial scan.

## Phase 4 — Downstream consumer alignment (workspaceRoot-aware path resolution)

- [ ] [Not started] Chuẩn hóa helper resolve absolute path từ `(workspaceRoot, file.path)`.
- [ ] [Not started] Cập nhật graph/symbol/import/call extraction consumers để dùng helper workspace-aware.
- [ ] [Not started] Cập nhật retrieval chunking/reader để bỏ giả định `repoRoot + file.path`.
- [ ] [Not started] Xác nhận graph delete safety vẫn đúng khi partial scan ở multi-workspace.
- [ ] [Not started] Thêm test regression cho path resolution đa workspace.

## Phase 5 — Diagnostics / validation / docs closure

- [ ] [Not started] Bổ sung summary workspace-level: workspace count, partial/stopReason theo workspace.
- [ ] [Not started] Xác minh reduced coverage signaling không gây hiểu nhầm whole-repo failure.
- [ ] [Not started] Chạy `npm run check` và `npm run test` cho slice thay đổi.
- [ ] [Not started] Đối chiếu từng AC trong scope/solution và đánh dấu pass/fail có evidence.
- [ ] [Not started] Cập nhật docs vận hành/checklist/handoff notes cho session sau.
- [ ] [Not started] Re-confirm: không mở rộng sang worktree/project subsystem parity.

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

- [ ] [Not started] **Nested marker ambiguity** gây double-index hoặc emit chồng lấn.
  - Mitigation: freeze + test leaf-root policy trước khi rollout.
- [ ] [Not started] **Hidden single-root assumptions** còn sót trong downstream readers.
  - Mitigation: grep/audit call-site + shared helper workspace-aware.
- [ ] [Not started] **Path identity drift** làm lệch graph/retrieval identity.
  - Mitigation: giữ `IndexedFile.path` workspace-relative nhất quán; không đổi semantics tùy tiện.
- [ ] [Not started] **Chi phí scan tăng** do multi-root collection.
  - Mitigation: giới hạn marker set milestone-1 + reuse discovery results.
- [ ] [Not started] **Scope creep** sang parity project/worktree.
  - Mitigation: mọi đề xuất ngoài scope phải chuyển deferred/backlog, không merge trong task này.

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
- [ ] [Not started] Triển khai kỹ thuật theo Phase 0.
