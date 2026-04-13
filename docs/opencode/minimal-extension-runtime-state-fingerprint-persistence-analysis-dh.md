# Phân tích follow-on: minimal extension runtime-state / fingerprint persistence (DH)

**Ngày:** 2026-04-12  
**Mục tiêu tài liệu:** định nghĩa hướng triển khai nhỏ, thực dụng cho runtime state `first | updated | same` và fingerprint persistence sau khi đã hoàn tất hardening extension contract tối giản.

**Nguồn neo (anchor):**
- `packages/opencode-sdk/src/types/extension-contract.ts`
- `docs/opencode/minimal-plugin-extension-contract-hardening-implementation-checklist-dh.md`
- upstream tham chiếu ý tưởng: `/Users/duypham/Code/opencode/packages/opencode/src/plugin/meta.ts`

---

## 1) vì sao đây là follow-on hợp lý sau extension contract hardening

Sau slice hardening vừa hoàn tất, DH đã có:
- contract tối giản ở SDK boundary;
- vocabulary thống nhất cho planner/executor;
- guardrails deterministic và reason codes.

Trong checklist đóng task trước đó, phần runtime fingerprint/state được **defer có chủ đích**. Vì vậy follow-on hợp lý nhất là lấp đúng khoảng trống đã defer, không mở rộng phạm vi mới.

Nói ngắn gọn: contract đã “freeze shape”, bước kế tiếp tự nhiên là bổ sung “runtime memory tối thiểu” để biết extension ở trạng thái `first`, `same`, hay `updated` giữa các lần chạy.

---

## 2) current DH state and the exact deferred gap

### Trạng thái hiện tại (factual)

- `packages/opencode-sdk/src/types/extension-contract.ts` đã định nghĩa:
  - `ExtensionRuntimeState = "first" | "updated" | "same"`.
- Slice hardening trước đã **không bật wiring runtime/persistence** cho state này.
- Checklist implementation ghi rõ defer/blocked cho phần:
  - triển khai runtime fingerprint/state thật sự;
  - test hành vi first/same/updated tương ứng.

### Khoảng trống defer chính xác

Khoảng trống không nằm ở type, mà nằm ở execution path:
1. chưa có lớp tính fingerprint tối thiểu từ dữ liệu extension đang load;
2. chưa có store bền vững để so fingerprint giữa các phiên;
3. chưa có mapping runtime từ fingerprint diff -> `first | same | updated`;
4. chưa có điểm consume ổn định trong app layer để tận dụng state (ví dụ log/audit nhẹ).

---

## 3) upstream idea worth borrowing from plugin meta

Từ `plugin/meta.ts`, phần đáng mượn cho DH (ở mức ý tưởng):

1. **State transition rõ ràng**: `first`, `same`, `updated` dựa trên fingerprint hiện tại so với bản trước.
2. **Fingerprint là khóa quyết định**: một chuỗi xác định đủ để phát hiện thay đổi thực chất.
3. **Persistence đơn giản dạng JSON store**: đủ cho use-case nhận diện thay đổi theo thời gian.
4. **Thông tin thời điểm/tần suất (tùy chọn)**: `last_time`, `load_count` hữu ích cho quan sát vận hành, nhưng không bắt buộc ở pha tối thiểu.

Điểm cốt lõi cần mượn: cơ chế “touch -> compare -> classify state -> persist”.

---

## 4) why DH should not port the whole upstream metadata subsystem

DH không nên port nguyên subsystem upstream vì:

1. **Sai mục tiêu pha này**: yêu cầu hiện tại chỉ là runtime-state/fingerprint tối thiểu, không phải plugin lifecycle đầy đủ.
2. **Tránh scope creep**: các phần như theme metadata, source-specific enrichment, hoặc metadata API rộng sẽ đẩy task vượt phạm vi follow-on.
3. **Giảm rủi ro coupling**: port nguyên subsystem sẽ kéo thêm dependency và abstraction không cần thiết cho kiến trúc DH hiện tại.
4. **Giữ rollback đơn giản**: slice nhỏ, ít điểm chạm thì dễ kiểm chứng và hoàn nguyên.

Nguyên tắc: borrow pattern, không copy subsystem.

---

## 5) architecture options for a minimal runtime-state slice

### Option A — In-memory only (không persistence)
- Ưu: làm nhanh nhất.
- Nhược: không theo dõi được qua phiên chạy; không giải quyết deferred gap chính.
- Kết luận: **không phù hợp** cho mục tiêu “persistence”.

### Option B — JSON store tối thiểu theo extension id (khuyến nghị)
- Ý tưởng:
  - tính fingerprint từ tập field tối thiểu của `ExtensionSpec`/resolved target;
  - đọc store JSON cục bộ;
  - so fingerprint cũ/mới để suy ra `first/same/updated`;
  - ghi lại fingerprint mới (và tùy chọn `last_time`, `load_count`).
- Ưu: đơn giản, đủ bền vững, dễ test.
- Nhược: cần xử lý ghi đồng thời an toàn ở mức tối thiểu.

### Option C — Dùng DB/graph runtime hiện có
- Ưu: có thể đồng bộ với hạ tầng runtime sâu hơn.
- Nhược: over-engineering cho bài toán nhỏ; tăng độ phức tạp migration/ops.
- Kết luận: **chưa phù hợp** ở follow-on này.

---

## 6) recommended path

Chọn **Option B** với phạm vi chặt:

1. Triển khai một `extension-state-store` dạng JSON file mỏng.
2. Lưu tối thiểu: `id`, `fingerprint`, `last_time` (tùy chọn), `load_count` (tùy chọn).
3. Cung cấp API nội bộ duy nhất kiểu `touchExtensionState(...) -> { state, fingerprint }`.
4. Không thêm API quản trị metadata tổng quát.
5. Không thêm logic plugin source (`file`/`npm`) phức tạp nếu chưa cần; fingerprint ưu tiên dữ liệu đã có ở DH runtime.

---

## 7) mapping cụ thể sang DH packages/modules

### `packages/opencode-sdk/src/types/extension-contract.ts`
- Giữ nguyên `ExtensionRuntimeState` ở boundary (đã có).
- Nếu cần, chỉ bổ sung type nhỏ cho payload trả về runtime-state (không đổi semantics).

### `packages/opencode-app/src/registry/`
- Không biến registry thành persistence manager.
- Chỉ cung cấp input ổn định để tính fingerprint (id, entry, capabilities, lanes, roles, priority, contractVersion).

### `packages/opencode-app/src/planner/`
- Không thay đổi logic chọn chính ở pha đầu.
- Có thể đính kèm runtime-state vào output quan sát (optional) nếu đã có data từ executor/runtime touch.

### `packages/opencode-app/src/executor/`
- Điểm chạm chính để gọi `touchExtensionState` sau khi contract hợp lệ và trước/sau activation theo thiết kế cụ thể.
- Ghi nhận `state` vào decision/log ở mức nhẹ, không mở branching mới.

### `packages/runtime/` (nếu phù hợp bề mặt hiện có)
- Đặt file store và helper I/O runtime-safe tại đây nếu repo đang gom runtime persistence ở package này.
- Nếu không phù hợp, đặt trong `packages/opencode-app/src/.../state` với boundary rõ.

### `docs/opencode/`
- Cập nhật checklist follow-on riêng cho runtime-state slice để tracking evidence.

---

## 8) proposed phases for the task

### Phase 0 — Chốt scope và fingerprint inputs
- Chốt tập field tạo fingerprint (không mở rộng ngoài minimal contract/runtime cần thiết).
- Chốt vị trí store file và trách nhiệm module.

### Phase 1 — Implement store + transition logic tối thiểu
- Thêm module read/compare/write JSON.
- Implement hàm classify `first/same/updated`.

### Phase 2 — Executor wiring
- Gọi touch tại điểm runtime ổn định.
- Đảm bảo lỗi store không phá vỡ luồng chính (fallback an toàn, có warning phù hợp).

### Phase 3 — Tests tối thiểu đúng gap defer
- Case 1: chưa có record -> `first`.
- Case 2: fingerprint không đổi -> `same`.
- Case 3: fingerprint đổi -> `updated`.
- Case 4: nhiều extension id độc lập, không nhiễu trạng thái.

### Phase 4 — Docs + evidence closure
- Cập nhật checklist follow-on + evidence thực thi.
- Xác nhận không có thay đổi vượt phạm vi plugin-platform parity.

---

## 9) risks/watchouts

1. **Fingerprint drift do chọn field không ổn định**  
   -> Mitigation: dùng field contract ổn định, tránh dữ liệu tạm thời.

2. **Race condition khi ghi file state**  
   -> Mitigation: lock discipline hoặc write-serialize tối thiểu theo runtime path.

3. **State logic làm nhiễu planner/executor semantics**  
   -> Mitigation: runtime-state chỉ bổ sung observability, không thay đổi policy quyết định cốt lõi ở pha đầu.

4. **Scope creep sang metadata subsystem đầy đủ**  
   -> Mitigation: giới hạn store schema tối thiểu; loại trừ theme/source-specific subsystem.

5. **Khó migration nếu schema store thay đổi sớm**  
   -> Mitigation: version nhẹ cho store format ngay từ đầu (ví dụ `v1`).

---

## 10) guiding recommendation

Khuyến nghị thực thi follow-on này như một **runtime-state slice cực nhỏ và kiểm chứng được**:

- giữ nguyên boundary `ExtensionRuntimeState = 'first' | 'updated' | 'same'` đã freeze;
- chỉ thêm persistence đủ để hiện thực hóa state transition qua phiên chạy;
- wiring vào executor theo cách không thay đổi semantics policy hiện có;
- đóng bằng test đúng 3 trạng thái + docs evidence;
- tuyệt đối không mở rộng sang plugin platform parity hay metadata subsystem đầy đủ.

Đây là bước nối tự nhiên, rủi ro thấp, và tăng giá trị vận hành thực tế ngay sau contract hardening.
