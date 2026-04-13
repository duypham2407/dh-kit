# Phân tích follow-on: Telemetry-driven Historical Semantic Chunk Cleanup (DH)

**Ngày tạo:** 2026-04-12  
**Bối cảnh tham chiếu:**
- `docs/opencode/semantic-retrieval-segmented-path-hardening-implementation-checklist-dh.md`
- `packages/retrieval/src/semantic/telemetry-collector.ts`
- `packages/storage/src/sqlite/repositories/chunks-repo.ts`
- `packages/storage/src/sqlite/repositories/embeddings-repo.ts`

---

## 1) Vì sao đây là task follow-on thực dụng ngay sau semantic hardening

Sau khi **segmented-path hardening** đã hoàn tất, hệ thống DH đã đạt trạng thái:
- dữ liệu semantic mới đi theo contract path chuẩn (repo-relative canonical),
- retrieval/read-path có normalize an toàn cho dữ liệu cũ,
- evidence có telemetry cho ca unresolved.

Điểm còn lại mang tính vận hành thực tế là: **dữ liệu chunk lịch sử** trong DB có thể vẫn chứa path semantics trộn lẫn (legacy workspace-relative, absolute path trong repo, hoặc path không còn resolve được). Điều này không còn gây lỗi chức năng ngay lập tức do đã có read-time normalization, nhưng tiếp tục tạo:
- chi phí normalize lặp lại ở runtime,
- tín hiệu telemetry unresolved kéo dài,
- nhiễu cho quan sát chất lượng dữ liệu semantic.

Vì vậy follow-on hợp lý nhất lúc này không phải redesign retrieval, mà là **cleanup/remediation dữ liệu lịch sử dựa trên telemetry** để giảm nợ vận hành.

---

## 2) Current DH state và phần còn lại trong historical data

### Trạng thái hiện tại (đã đóng ở hardening)
- Write path semantic mới đã chuẩn hóa path.
- Read/retrieval path vẫn chịu trách nhiệm normalize dữ liệu mixed-path cũ.
- Telemetry đã có các tín hiệu unresolved path:
  - `semantic_path_unresolved`
  - `evidence_path_unresolved`
  (được tổng hợp qua `summarizeTelemetry()` trong `telemetry-collector.ts`).

### Phần còn lại cần xử lý
Trong historical DB (bảng `chunks`, liên đới `embeddings`):
- `chunks.file_path` có thể còn lệch contract canonical.
- Một phần row có thể không resolve chắc chắn sang canonical path hiện tại (file đã đổi vị trí, bị xóa, hoặc mapping cũ không còn đủ dữ kiện).
- Một số dữ liệu có thể dẫn đến orphan/low-value embeddings khi chunk history không còn hữu dụng.

Nói ngắn gọn: hệ thống đã “đọc an toàn”, nhưng dữ liệu nền vẫn “chưa sạch”.

---

## 3) Vì sao gap này không chặn closure nhưng vẫn đáng xử lý

### Không chặn closure
- Hardening hiện tại đã đảm bảo behavior retrieval/evidence đúng contract ở runtime.
- Các ca dữ liệu cũ lỗi/không rõ ràng đã có observability thay vì silent failure.

### Vẫn nên xử lý
- Giảm chi phí normalize + fallback lặp lại trong mỗi truy vấn semantic.
- Giảm nhiễu telemetry unresolved để metric phản ánh đúng vấn đề mới thay vì “nợ lịch sử”.
- Tăng tính nhất quán dữ liệu storage, giúp debug và vận hành dễ hơn.
- Tạo nền sạch hơn trước các nâng cấp semantic tiếp theo.

---

## 4) Architecture options cho cleanup/remediation

> Mục tiêu chung của mọi option: xử lý dữ liệu lịch sử bằng trigger/evidence từ telemetry, **không thay đổi kiến trúc retrieval hiện tại**.

### Option A — Read-time only (không đụng DB lịch sử)
**Mô tả:** tiếp tục giữ normalize tại read path, chỉ theo dõi telemetry.

**Ưu điểm:**
- rủi ro thấp nhất,
- không cần migration job.

**Nhược điểm:**
- unresolved telemetry tồn tại dài hạn,
- runtime overhead không giảm,
- nợ dữ liệu không được xử lý gốc.

**Đánh giá:** phù hợp tạm thời, không phải điểm dừng tốt cho follow-on thực dụng.

---

### Option B — One-shot DB remediation theo telemetry snapshot
**Mô tả:** chạy job cleanup một lần, dùng telemetry snapshot để xác định phạm vi path có vấn đề, sau đó:
- canonicalize được thì update `chunks.file_path`,
- không canonicalize được thì đánh dấu thống kê và để nguyên (hoặc đưa vào danh sách cần xử lý tay).

**Ưu điểm:**
- giảm nhanh nợ lịch sử,
- có kết quả đo được ngay sau 1 vòng.

**Nhược điểm:**
- không tự duy trì nếu sau này có thêm dữ liệu legacy nhập lại,
- rủi ro thao tác DB tập trung nếu không có dry-run/reporting tốt.

**Đánh giá:** khả thi cao cho follow-on gần nhất.

---

### Option C — Incremental remediation loop (telemetry-driven, lặp nhỏ)
**Mô tả:** bổ sung cơ chế remediation theo đợt nhỏ:
1. đọc telemetry unresolved theo khoảng thời gian,
2. lấy candidate rows trong `chunks`,
3. chạy canonicalization có guard,
4. ghi báo cáo và chỉ apply khi đạt điều kiện an toàn.

**Ưu điểm:**
- an toàn hơn one-shot lớn,
- phù hợp vận hành lâu dài,
- dễ rollback theo batch.

**Nhược điểm:**
- cần thêm orchestrator/CLI nội bộ,
- tốn thời gian triển khai hơn Option B.

**Đánh giá:** tốt về dài hạn; có thể bắt đầu bằng Option B rồi tiến hóa.

---

## 5) Recommended path

**Khuyến nghị thực dụng:** đi theo **B trước, C sau (nếu cần)**.

- **B (giai đoạn đầu):** triển khai cleanup job có `dry-run` + `apply`, dựa trên telemetry và kiểm tra path thực tế trong repoRoot.
- **C (nâng cấp sau):** nếu unresolved tiếp tục phát sinh đáng kể, nâng lên incremental loop theo lịch.

Lý do chọn:
- giữ phạm vi hẹp đúng yêu cầu follow-on,
- tạo cải thiện đo được nhanh,
- không can thiệp planner/ranking/retrieval architecture.

---

## 6) Mapping cụ thể sang DH packages/modules

### `packages/retrieval/src/semantic/telemetry-collector.ts`
Vai trò trong task này:
- nguồn evidence để chọn phạm vi remediation,
- nguồn metric trước/sau cleanup (`unresolvedPaths.semantic`, `unresolvedPaths.evidence`).

Hướng dùng thực tế:
- lấy baseline telemetry summary trước cleanup,
- chốt cửa sổ đo (ví dụ N ngày gần nhất),
- đối chiếu sau cleanup để xác nhận giảm unresolved.

### `packages/storage/src/sqlite/repositories/chunks-repo.ts`
Vai trò trong task này:
- bề mặt chính để truy cập/sửa dữ liệu lịch sử `chunks.file_path`.

Nhu cầu follow-on (dạng bổ sung có kiểm soát):
- API đọc candidate rows phục vụ cleanup,
- API update path theo `chunkId` (batch-safe),
- API thống kê theo nhóm path state (canonical / convertible / unresolved).

### `packages/storage/src/sqlite/repositories/embeddings-repo.ts`
Vai trò trong task này:
- giữ nhất quán dữ liệu embedding liên quan chunk lịch sử.

Nhu cầu follow-on:
- giữ khả năng dọn orphan (`deleteOrphaned`) như bước hậu kiểm,
- không cần redesign schema embedding; chỉ cần đảm bảo cleanup chunk không tạo nợ mới.

### `docs/opencode/semantic-retrieval-segmented-path-hardening-implementation-checklist-dh.md`
Vai trò:
- baseline xác nhận hardening đã complete,
- điểm nối để ghi rõ follow-on này là cleanup/remediation dữ liệu lịch sử, không reopen task cũ.

---

## 7) Proposed phases cho task

### Phase 0 — Baseline & scope freeze
- Chụp telemetry baseline hiện tại (semantic/evidence unresolved).
- Freeze phạm vi: chỉ cleanup historical semantic chunk data.
- Chốt tiêu chí thành công định lượng (ví dụ giảm unresolved theo tỷ lệ X hoặc đạt ngưỡng Y).

### Phase 1 — Candidate discovery
- Truy xuất danh sách chunk lịch sử có khả năng path mixed-state.
- Phân loại candidate:
  1) canonical sẵn,
  2) convert được deterministic,
  3) unresolved/không đủ dữ kiện.

### Phase 2 — Remediation implementation (dry-run trước)
- Tạo cleanup command/job với hai mode:
  - `dry-run`: chỉ báo cáo tác động,
  - `apply`: áp dụng update path cho nhóm convert được.
- Báo cáo bắt buộc:
  - số row scan,
  - số row convert,
  - số row unresolved,
  - mẫu path representative.

### Phase 3 — Apply + integrity checks
- Chạy apply trên phạm vi đã duyệt.
- Chạy hậu kiểm:
  - tính nhất quán chunk records,
  - orphan embeddings cleanup nếu phát sinh,
  - không tăng tỷ lệ unresolved mới.

### Phase 4 — Telemetry verification & closure
- So sánh trước/sau cleanup bằng telemetry summary.
- Ghi kết luận ngắn: phần nào đã giảm, phần nào còn tồn tại và vì sao.
- Chốt backlog nếu còn unresolved cần xử lý tay.

---

## 8) Risks / watchouts

1. **Over-remediation**: convert path sai khi thiếu ngữ cảnh.  
   → Chỉ apply khi rule deterministic; còn lại để unresolved có telemetry.

2. **DB mutation risk**: cập nhật hàng loạt khó rollback.  
   → Bắt buộc dry-run, batch nhỏ, snapshot/backup trước apply.

3. **False confidence từ telemetry ngắn hạn**: số unresolved giảm tạm thời do traffic thấp.  
   → Đo theo cửa sổ đủ dài và có so sánh tỷ lệ theo query volume.

4. **Scope creep sang retrieval redesign**: thêm logic ngoài cleanup data.  
   → Giữ nguyên retrieval pipeline; chỉ thêm tooling remediation và kiểm chứng dữ liệu.

5. **Embeddings integrity drift**: chunk cleanup tạo trạng thái không đồng bộ phụ trợ.  
   → Bổ sung hậu kiểm embeddings/orphan như bước bắt buộc sau apply.

---

## 9) Guiding recommendation

**Khuyến nghị dẫn đường:**

1. Xem đây là **data hygiene follow-on** sau hardening, không phải project redesign.
2. Ưu tiên triển khai một cleanup flow nhỏ, có telemetry baseline, có dry-run/apply rõ ràng.
3. Chỉ sửa những gì chứng minh được deterministic; phần còn lại giữ observable để tránh sửa sai.
4. Đặt thành công theo metric vận hành (giảm unresolved path, giảm nhiễu telemetry), không theo thay đổi lớn kiến trúc.
5. Sau khi hoàn thành vòng đầu, chỉ nâng lên incremental loop khi telemetry thực tế cho thấy còn lợi ích rõ ràng.

---

## Tóm tắt phạm vi (anti-scope-creep)

- **In-scope:** cleanup/remediation dữ liệu chunk semantic lịch sử dựa trên telemetry và kiểm chứng storage-level.
- **Out-of-scope:** thiết kế lại retrieval, thay đổi segmentation, đổi chiến lược ranking/planning, hoặc migration kiến trúc lớn.
