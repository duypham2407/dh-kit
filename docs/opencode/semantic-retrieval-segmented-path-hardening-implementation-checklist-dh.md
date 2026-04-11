# Checklist triển khai theo trạng thái: Semantic Retrieval Segmented-Path Hardening (DH)

**Ngày tạo:** 2026-04-11  
**Nguồn phê duyệt:**
- `docs/opencode/semantic-retrieval-segmented-path-hardening-analysis-dh.md`
- `docs/scope/2026-04-11-semantic-retrieval-segmented-path-hardening-dh.md`
- `docs/solution/2026-04-11-semantic-retrieval-segmented-path-hardening-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Hardening **hẹp** semantic retrieval path semantics trong DH để `filePath` hội tụ về contract repo-relative canonical và evidence/snippet resolution đúng file.

### Phạm vi thực thi (in-scope)
- Chuẩn hóa contract path downstream cho semantic retrieval.
- Hardening write path ở semantic chunker cho dữ liệu mới.
- Normalize legacy/mixed chunk path ở read/retrieval path.
- Harden evidence builder theo contract path + observability cho unresolved path.
- Validation hội tụ semantic/non-semantic path semantics và evidence correctness.

### Ngoài phạm vi (out-of-scope)
- Không làm lại segmentation (segmentation đã hoàn tất).
- Không redesign retrieval planner/ranking/ANN/HNSW/graph retrieval.
- Không ép buộc full cache rebuild/re-embed/re-chunk toàn bộ.
- Không mở rộng sang subsystem path contract không liên quan semantic retrieval/evidence.

---

## 2) Hiện trạng vs trạng thái mục tiêu

### Hiện trạng DH (đã xác nhận)
- [x] [Completed] Segmentation marker-driven đã hoàn tất và là baseline.
- [ ] [Not started] Semantic chunk persistence cho dữ liệu mới chưa được khóa cứng theo canonical repo-relative ở mọi branch chunk.
- [ ] [Not started] Read/retrieval path chưa đảm bảo normalize đủ cho legacy/mixed semantic chunk path.
- [ ] [Not started] Evidence path correctness chưa có closure validation đầy đủ cho hội tụ semantic/non-semantic.

### Trạng thái mục tiêu của task này
- [ ] [Not started] `NormalizedRetrievalResult.filePath` hội tụ repo-relative canonical cho cả semantic và non-semantic.
- [ ] [Not started] Dữ liệu chunk mới ghi ra luôn theo canonical path contract.
- [ ] [Not started] Dữ liệu cũ mixed-path vẫn đọc an toàn qua normalization có giới hạn, deterministic.
- [ ] [Not started] Evidence builder nhận path đúng contract; unresolved path có tín hiệu quan sát (không silent).
- [ ] [Not started] Có bằng chứng validation kết thúc task đúng phạm vi hẹp path/evidence hardening.

---

## 3) Definition of Done (DoD)

- [ ] [Not started] Contract canonical repo-relative cho semantic retrieval downstream được freeze và áp dụng nhất quán.
  - Evidence kỳ vọng: comment/contract rõ tại types + điểm hội tụ query layer.
- [ ] [Not started] Chunk writer persist canonical path cho toàn bộ nhánh emit chunk (symbol/gap/tail/sliding-window).
  - Evidence kỳ vọng: `packages/retrieval/src/semantic/chunker.ts` + test liên quan.
- [ ] [Not started] Legacy/mixed semantic chunk path được normalize ở read/retrieval path trước khi xuống evidence consumer.
  - Evidence kỳ vọng: `packages/retrieval/src/semantic/semantic-search.ts`, `packages/retrieval/src/query/run-retrieval.ts` + test.
- [ ] [Not started] Evidence builder xử lý invalid/unresolved path có observability rõ ràng.
  - Evidence kỳ vọng: `packages/retrieval/src/query/build-evidence-packets.ts` + test/telemetry assertions.
- [ ] [Not started] Validation pass theo command thực tế của DH cho scope này.
  - Evidence kỳ vọng: `npm run check`, `npm run test`.
- [ ] [Not started] Không có thay đổi ngoài scope (không redesign retrieval, không reopen segmentation).

---

## 4) Status legend & giao thức cập nhật

### Status legend bắt buộc
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Giao thức cập nhật
1. Khi bắt đầu item: đổi sang `[ ] [In progress]`.
2. Chỉ đổi `[x] [Completed]` khi có evidence cụ thể ngay dưới item (file/test/log).
3. Nếu bị chặn > 30 phút hoặc phụ thuộc external owner: đổi `[ ] [Blocked]`, ghi blocker + owner + ETA.
4. Không mở phase kế tiếp nếu phase hiện tại còn item critical chưa xong (trừ khi có ghi chú dependency cho phép song song).
5. Kết thúc mỗi session: cập nhật **Progress Update** + **Resume quick-start**.

---

## 5) Phases / Workstreams và checklist chi tiết

## Phase 0 — Baseline inventory semantic path semantics hiện tại

- [ ] [Not started] Lập bản đồ end-to-end semantic path flow: chunk write -> semantic search -> run retrieval -> build evidence.
- [ ] [Not started] Chụp baseline semantics hiện tại của `filePath` tại từng điểm chuyển đổi dữ liệu.
- [ ] [Not started] Liệt kê các dạng path lịch sử cần hỗ trợ chuyển tiếp (repo-relative, absolute-in-repo, workspace-relative legacy, malformed).
- [ ] [Not started] Xác nhận nguồn helper canonical path dùng chung (tránh tạo normalization hệ thứ hai).
- [ ] [Not started] Chốt baseline risks trực tiếp cho evidence correctness để theo dõi trong log.

## Phase 1 — Contract freeze cho canonical repo-relative behavior

- [ ] [Not started] Freeze rule chính: từ `NormalizedRetrievalResult.filePath` trở đi là repo-relative canonical.
- [ ] [Not started] Freeze rule write-clean/read-safe: dữ liệu mới ghi chuẩn, dữ liệu cũ normalize khi và chỉ khi quy đổi an toàn.
- [ ] [Not started] Freeze rule observability: unresolved path phải có tín hiệu telemetry/diagnostic, không silent fallback.
- [ ] [Not started] Gắn contract comment tối thiểu vào shared types liên quan (`embedding.ts`, `evidence.ts`).
- [ ] [Not started] Đóng danh sách explicit out-of-scope để chặn scope creep trong implementation/review.

## Phase 2 — Chunk writer persistence hardening (new data)

- [ ] [Not started] Áp canonical repo-relative derivation 1 lần/IndexedFile trước khi emit chunks.
- [ ] [Not started] Dùng canonical path cho tất cả branch chunk emission (symbol/gap/tail/sliding-window).
- [ ] [Not started] Giữ nguyên behavior token/chunk boundaries; chỉ harden path semantics.
- [ ] [Not started] Bổ sung/điều chỉnh test đảm bảo chunk mới luôn persist canonical path.
- [ ] [Not started] Xác nhận guard khi không resolve được canonical path (skip/an toàn theo contract hiện hành).

## Phase 3 — Legacy/mixed chunk normalization tại read/retrieval time

- [ ] [Not started] Thiết kế deterministic normalization matrix:
  - repo-relative canonical -> passthrough
  - absolute path nằm trong repoRoot -> convert repo-relative
  - legacy workspace-relative có thể quy đổi chắc chắn -> convert
  - non-resolvable/malformed -> không tuyên bố đúng, phát observability
- [ ] [Not started] Cài normalization trước khi semantic result đi vào normalized retrieval contract.
- [ ] [Not started] Đảm bảo semantic + non-semantic hội tụ cùng semantics trước rerank/evidence stages.
- [ ] [Not started] Bổ sung test cho mixed historical data và edge cases normalization.
- [ ] [Not started] Xác nhận duplicate identity handling theo normalized `filePath` cuối cùng.

## Phase 4 — Evidence builder / retrieval convergence validation

- [ ] [Not started] Harden evidence path resolution: reject rõ ràng path invalid thay vì join mù.
- [ ] [Not started] Giữ vai trò evidence builder là consumer contract, không biến thành module normalize toàn diện.
- [ ] [Not started] Bổ sung tín hiệu telemetry/diagnostic cho unresolved path cases.
- [ ] [Not started] Viết/điều chỉnh test integration chứng minh semantic/non-semantic trả về cùng file identity.
- [ ] [Not started] Chạy case segmented-repo có cả dữ liệu mới và dữ liệu legacy để chứng minh evidence correctness.

## Phase 5 — Docs/validation closure

- [ ] [Not started] Chạy validation command của DH cho scope này:
  - `npm run check`
  - `npm run test`
- [ ] [Not started] Đối chiếu AC trong scope/solution và ghi pass/fail có evidence.
- [ ] [Not started] Cập nhật docs trạng thái checklist + progress log cuối cùng.
- [ ] [Not started] Xác nhận lần cuối: không có thay đổi ngoài path/evidence hardening.
- [ ] [Not started] Chuẩn bị handoff notes cho session/agent sau.

---

## 6) Dependencies / sequencing notes

### Chuỗi bắt buộc
1. Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5

### Ràng buộc phụ thuộc chính
- Không implement Phase 2 trước khi freeze contract ở Phase 1.
- Không đóng Phase 3 nếu chưa có matrix normalization deterministic và test tương ứng.
- Không đóng Phase 4 nếu chưa chứng minh hội tụ semantic/non-semantic path semantics ở integration.
- Không đóng task nếu validation Phase 5 chưa có evidence command thực tế.

### Việc có thể song song (có kiểm soát)
- Chuẩn bị test fixtures cho Phase 3 và Phase 4 sau khi Phase 1 đã freeze contract.
- Cập nhật checklist/progress log trong lúc implement, nhưng chỉ mark Completed khi evidence đã có.

---

## 7) Risks / watchouts

- [ ] [Not started] **Historical mixed-state drift**: dữ liệu chunk cũ path semantics trộn lẫn gây hành vi không nhất quán.
  - Mitigation: normalize read-time có rule deterministic + test matrix.
- [ ] [Not started] **Over-normalization**: rewrite sai path vốn đã hợp lệ.
  - Mitigation: chỉ convert theo rule chứng minh được; trường hợp không chắc chắn -> observability.
- [ ] [Not started] **Duplicate identity sau normalize**: cùng file xuất hiện dưới nhiều biểu diễn path cũ.
  - Mitigation: dedup/rerank dựa trên normalized `filePath` cuối.
- [ ] [Not started] **Silent evidence failure**: snippet unavailable không cho biết root cause path.
  - Mitigation: telemetry/diagnostic bắt buộc cho unresolved path.
- [ ] [Not started] **Scope creep**: trượt sang redesign retrieval hoặc reopen segmentation.
  - Mitigation: bám strict in-scope/out-of-scope và review gate theo solution package.

**Nguyên tắc:** mọi risk phát sinh phải có cập nhật trạng thái + mitigation trong Progress Log.

---

## 8) Progress log template (copy cho mỗi session)

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

#### Quyết định contract (nếu có)
- ...

#### Việc tiếp theo (1-3 mục ưu tiên)
1.
2.
3.
```

---

## 9) Resume quick-start (dành cho session mới)

1. Mở 3 tài liệu nguồn đã phê duyệt:
   - `docs/opencode/semantic-retrieval-segmented-path-hardening-analysis-dh.md`
   - `docs/scope/2026-04-11-semantic-retrieval-segmented-path-hardening-dh.md`
   - `docs/solution/2026-04-11-semantic-retrieval-segmented-path-hardening-dh.md`
2. Mở checklist này, tìm mục đang `[ ] [In progress]` hoặc `[ ] [Blocked]`.
3. Xác nhận phase hiện tại và dependency đã thỏa trước khi code.
4. Ưu tiên đóng item critical của phase hiện tại trước khi mở phase tiếp theo.
5. Sau mỗi thay đổi: cập nhật status + evidence ngay tại item tương ứng.
6. Trước khi kết thúc session: điền **Progress Update** + 1-3 bước tiếp theo.

---

## 10) Snapshot trạng thái khởi tạo

- [x] [Completed] Checklist được tạo dưới `docs/opencode/` với tên rõ ràng cho semantic retrieval segmented-path hardening.
- [x] [Completed] Đã liên kết đúng đủ 3 tài liệu nguồn phê duyệt.
- [x] [Completed] Đã khóa reality: segmentation complete; scope hiện tại chỉ là semantic path/evidence hardening.
- [ ] [Not started] Bắt đầu Phase 0 baseline inventory.
