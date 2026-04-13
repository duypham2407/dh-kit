# Phân tích selective-port: hardening extension contract tối giản cho DH

Ngày: 2026-04-12  
Phạm vi upstream đã đối chiếu:

- `/Users/duypham/Code/opencode/packages/opencode/src/plugin/loader.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/plugin/meta.ts`
- thư mục plugin upstream: `packages/opencode/src/plugin/`

Phạm vi DH đã đối chiếu:

- `packages/opencode-sdk/src/types/`
- `packages/opencode-app/src/`

Trạng thái: tài liệu phân tích kiến trúc cho selective-port tiếp theo, **chưa bắt đầu implementation**.

---

## vì sao sau các nhánh vừa hoàn thành thì plugin/extension contracts tối giản là selective-port lớn tiếp theo hợp lý

Theo roadmap selective-port (mục D), DH đã đi qua các nhánh ưu tiên cao hơn về runtime hardening (tool/graph/MCP/session). Điểm nghẽn tiếp theo không còn là thiếu “platform mở rộng đầy đủ”, mà là thiếu một **hợp đồng extension nhỏ, deterministic và có guardrail** để mở rộng nội bộ mà không làm rò rỉ hành vi runtime.

Lý do đây là bước tiếp theo hợp lý:

1. **Đúng timing kiến trúc**: các lớp planner/executor/registry trong DH đã rõ hơn, nên có thể chốt điểm mở rộng ổn định thay vì mở rộng ad-hoc theo từng feature.
2. **Giảm drift giữa policy và implementation**: khi chưa có extension contract tối thiểu, các mở rộng mới dễ phân tán trong `opencode-app` mà thiếu shape thống nhất.
3. **Giữ deterministic runtime**: mục tiêu DH là enforcement có thể giải thích và kiểm chứng, nên cần contract giới hạn bề mặt extension từ đầu.
4. **Đủ nhỏ để làm theo slice**: có thể làm theo các phase nhỏ (schema + guard + validation path), không cần kéo cả plugin platform upstream.

Tóm lại: đây là “hardening bước kế” của kiến trúc hiện tại, không phải mở một subsystem mới kiểu ecosystem.

---

## upstream plugin system mạnh ở đâu

Từ `loader.ts` và `meta.ts`, các điểm mạnh đáng học là:

1. **Lifecycle loading tách pha rõ** (`resolve -> compatibility -> load`)
   - `resolve` có phân loại lỗi theo stage (`install`, `entry`, `compatibility`, `missing`).
   - Giúp quan sát lỗi tốt hơn thay vì fail chung chung.

2. **Định danh nguồn plugin minh bạch** (`file` vs `npm`)
   - Quyết định đường xử lý, check compatibility, metadata tracking theo source.

3. **Retry có điều kiện, không retry mù**
   - `loadExternal` có nhánh retry cho file plugins sau `wait()`, tránh race condition khi dependency chưa sẵn sàng.

4. **Metadata persistence có khóa ghi + fingerprint**
   - `meta.ts` lưu `first_time`, `last_time`, `time_changed`, `load_count`, `fingerprint`.
   - Có `Flock.withLock` để tránh corruption khi concurrent update.

5. **Khả năng quan sát thay đổi plugin theo trạng thái**
   - Trả về state `first | updated | same`, nền tảng tốt cho audit/telemetry.

Điểm cốt lõi: upstream mạnh ở tính vận hành và traceability của plugin runtime, không chỉ ở khả năng “load được plugin”.

---

## DH hiện đang ở đâu và vì sao chưa cần full plugin platform

### DH hiện có (factual)

- `packages/opencode-sdk/src/types/` đã có contract kiểu dữ liệu cho envelope/hook/protocol/session.
- `packages/opencode-app/src/` đã có các lớp thực thi theo policy (`planner`, `executor`, `registry`, `workflows`).
- Trong phạm vi hiện tại chưa có module plugin loader riêng, chưa có dynamic plugin discovery/install/runtime metadata store tương đương upstream plugin subsystem.

### Vì sao chưa cần full plugin platform

1. **Mục tiêu sản phẩm hiện tại là deterministic enforcement**, không phải plugin marketplace/distribution.
2. **Bài toán chính là extension points nội bộ ổn định**, không phải hỗ trợ dynamic third-party plugins.
3. **Chi phí vận hành cao nếu port nguyên platform**: dependency resolution, compatibility matrix, runtime isolation, lifecycle auth/trust.
4. **Rủi ro tăng bề mặt hành vi khó kiểm chứng**: trái với định hướng selective-port “nhỏ, đo được, rollback được”.

Kết luận phần này: DH cần “extension contract tối giản + guardrails”, chưa cần “plugin platform đầy đủ”.

---

## selective-port gì là đáng nhất từ upstream plugin ideas

Nên lấy theo ý tưởng (pattern), không lấy theo file-by-file:

1. **Contract pha xử lý extension có stage rõ ràng**
   - Đề xuất stage tối thiểu cho DH: `validate_spec`, `resolve_entry`, `compat_check`, `activate`.

2. **Reason-coded failure model**
   - Mỗi failure phải có mã lý do ổn định (ví dụ: `entry_missing`, `contract_version_mismatch`, `capability_denied`).

3. **Capability declaration tối giản**
   - Extension phải khai báo rõ capability được phép dùng; executor chỉ cho phép trong whitelist theo lane/role.

4. **Metadata fingerprint + change state**
   - Không cần full plugin-meta upstream, nhưng nên có fingerprint đơn giản để phát hiện extension thay đổi và quyết định reload/reject.

5. **Deterministic load ordering**
   - Nếu có nhiều extension, thứ tự áp dụng phải deterministic (ví dụ theo priority rồi id), tránh non-deterministic behavior giữa các phiên.

---

## những gì KHÔNG nên port wholesale

1. **Không port full dynamic plugin install/resolve framework** (đặc biệt nhánh npm/file installer đầy đủ).
2. **Không port toàn bộ metadata store/phần theme handling** nếu DH chưa có nhu cầu theme/plugin asset lifecycle.
3. **Không copy toàn bộ retry/orchestration machinery** khi chưa có runtime dependency graph phức tạp cho extension.
4. **Không mở rộng sang distribution ecosystem** (marketplace, plugin packaging, remote publish).
5. **Không thêm abstraction làm mờ trách nhiệm giữa planner/executor/hook-enforcer**.

Nguyên tắc: chỉ lấy phần giúp contract ổn định và enforceable trong DH hiện tại.

---

## mapping cụ thể sang DH packages/modules

## A. `packages/opencode-sdk/src/types/`

Nơi định nghĩa contract tĩnh cho extension tối giản:

- thêm type đề xuất:
  - `ExtensionContractVersion` (ví dụ: literal version)
  - `ExtensionCapability`
  - `ExtensionSpec` (id, version, entry, capabilities)
  - `ExtensionDecision` (allow/block/modify + reason codes)
  - `ExtensionRuntimeState` (`first|updated|same` dạng tối giản nếu cần)

Mục tiêu: chuẩn hóa “ngôn ngữ contract” giữa app layer và bridge/runtime hooks.

## B. `packages/opencode-app/src/registry/`

Mở rộng registry theo hướng extension policy tối giản:

- map extension id -> allowed lanes/roles/capabilities
- optional priority/order để đảm bảo deterministic execution

Mục tiêu: registry là nơi khai báo policy, không phải nơi chứa logic runtime phức tạp.

## C. `packages/opencode-app/src/planner/`

Planner chọn tập extension candidate từ context:

- input: lane, role, intent class
- output: danh sách candidate + reasons/rejected (shape giống hướng MCP đã làm)

Mục tiêu: có explainability trước khi vào executor.

## D. `packages/opencode-app/src/executor/`

Executor enforce contract:

- validate contract version
- check capability/lane guardrails
- apply deterministic ordering
- ghi reason khi block/modify

Mục tiêu: biến policy thành hành vi runtime nhất quán.

## E. `packages/opencode-app/src/workflows/`

Workflow chỉ consume decision đã chuẩn hóa:

- không nhúng logic extension-specific sâu vào từng workflow file
- giữ boundary: workflow orchestration dùng kết quả từ planner/executor

Mục tiêu: tránh lan tỏa logic extension theo kiểu thủ công.

---

## đề xuất phases cho task tiếp theo

## Phase 0 — Chốt contract tối thiểu (nhanh)

- Viết type contracts trong `opencode-sdk/src/types`.
- Chốt reason codes và versioning policy.
- Chưa thay đổi behavior lớn.

**Deliverable**: spec/type-level contract rõ ràng, dùng được cho planner/executor.

## Phase 1 — Registry + planner alignment

- Thêm metadata tối thiểu vào registry.
- Planner trả output có `reasons/rejected` thay vì list tên thuần.

**Deliverable**: selection explainable, deterministic ở mức planning.

## Phase 2 — Executor hardening

- Enforce capability/version guards.
- Áp dụng deterministic ordering.
- Block rõ ràng khi contract không hợp lệ.

**Deliverable**: runtime guardrails nhất quán.

## Phase 3 — Minimal metadata state (nếu cần)

- Thêm fingerprint + trạng thái `first/updated/same` ở mức tối giản.
- Chỉ thêm khi có nhu cầu thực tế về reload/change detection.

**Deliverable**: quan sát thay đổi extension mà không cần full plugin meta subsystem.

## Phase 4 — Verification & rollout

- Bổ sung test matrix theo lane/role/capability.
- Thêm evidence checklist cho các quyết định allow/block/modify.

**Deliverable**: hardening có thể kiểm chứng, sẵn sàng cho bước selective-port kế tiếp.

---

## 5 điều đáng lấy nhất từ upstream plugin area

1. **Phân tách lifecycle theo stage** để lỗi và hành vi dễ truy vết.
2. **Compatibility checks như một bước bắt buộc**, không phải best-effort.
3. **Failure classification có cấu trúc**, giúp debug và policy enforcement.
4. **Fingerprint-based change detection** để kiểm soát drift qua các lần load.
5. **Concurrency-safe metadata update (lock discipline)** như một nguyên tắc vận hành.

---

## kết luận / guiding recommendation

DH nên triển khai **minimal extension contract hardening** theo hướng architecture-first, không chạy theo parity của upstream plugin platform.

Khuyến nghị dẫn đường:

1. **Ưu tiên contract ổn định + reason codes + deterministic ordering** trước mọi tham vọng dynamic platform.
2. **Giữ mapping rõ theo package boundaries hiện có** (`opencode-sdk` cho types, `opencode-app` cho policy/planning/enforcement).
3. **Chỉ thêm metadata runtime ở mức tối thiểu** khi có nhu cầu quan sát thay đổi thực tế.
4. **Không mở rộng sang plugin ecosystem/distribution** trong pha này.
5. Dùng tài liệu này làm nền cho scope/solution/checklist implementation tiếp theo của nhánh selective-port D.
