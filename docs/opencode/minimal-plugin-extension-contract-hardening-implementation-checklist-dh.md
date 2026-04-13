# Checklist triển khai theo trạng thái: Minimal Plugin / Extension Contract Hardening (DH)

**Ngày tạo:** 2026-04-12  
**Nguồn phê duyệt:**
- `docs/opencode/minimal-plugin-extension-contract-hardening-analysis-dh.md`
- `docs/scope/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`
- `docs/solution/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Thiết lập **hợp đồng extension tối giản, deterministic, dùng nội bộ** cho DH để tránh drift giữa registry/planner/executor/workflow.

### Phạm vi thực thi (in-scope)
- Baseline inventory các extension point ngầm định hiện có.
- Freeze contract metadata extension + decision reason codes.
- Đồng bộ SDK type surface và app registry/planner/executor theo cùng một vocabulary.
- Hardening guardrail planner/executor cho version/capability/lane/role + deterministic ordering.
- Metadata runtime (fingerprint/state) chỉ làm ở mức tối thiểu và **chỉ khi có lý do rõ ràng**.
- Đóng vòng validation + docs theo tài liệu scope/solution đã duyệt.

### Ngoài phạm vi (out-of-scope)
- Không làm plugin platform parity.
- Không làm packaging/distribution/marketplace/external ecosystem.
- Không làm dynamic install/discovery/plugin loader subsystem đầy đủ.
- Không thay đổi lane semantics hiện có (`quick`, `delivery`, `migration`).

---

## 2) Hiện trạng vs trạng thái mục tiêu

| Hạng mục | Hiện trạng DH | Trạng thái mục tiêu |
|---|---|---|
| Contract layer | Chưa có lớp contract extension tối giản chính thức | Có 1 contract tối giản thống nhất, deterministic, dùng nội bộ |
| Metadata | Metadata extension đang phân tán theo từng surface | Metadata tối thiểu được chuẩn hóa, dùng chung |
| Reason model | Lý do allow/block có thể khác nhau theo module | Reason code ổn định, chuẩn hóa liên lớp |
| Ordering | Chưa có contract-level deterministic ordering rõ ràng cho multi-extension | Có rule ordering cố định, inspectable |
| Planner/Executor | Có tách lớp nhưng chưa có vocabulary extension chung đầy đủ | Cùng dùng 1 vocabulary contract tại SDK boundary |
| Runtime state | Chưa có contract fingerprint/state tối giản | Optional fingerprint/state chỉ bật khi có nhu cầu xác thực rõ |
| Ambition | Dễ trượt sang kỳ vọng plugin platform | Giữ chặt hardening contract nội bộ, không mở rộng ecosystem |

---

## 3) Definition of Done (DoD)

- [x] [Completed] Contract extension tối giản được freeze tại SDK boundary (identity/version/entry/capabilities/decision/reason).
- [x] [Completed] Registry/planner/executor dùng chung vocabulary; không tạo schema song song.
- [x] [Completed] Deterministic ordering được enforce và có test chứng minh độc lập input order.
- [x] [Completed] Guardrail version/capability/lane/role được enforce với reason code ổn định.
- [x] [Completed] Workflow consume normalized decision, không thêm extension-specific branching sâu.
- [x] [Completed] Fingerprint/state (nếu có) ở mức tối thiểu, có lý do và evidence rõ; nếu không cần thì ghi rõ defer.
- [x] [Completed] Validation chạy bằng command thực tế của DH (`npm run check`, `npm run test`) và có evidence.
- [x] [Completed] Không có thay đổi ngoài scope (không plugin platform parity, không external ecosystem).

---

## 4) Status legend & giao thức cập nhật

### Status legend bắt buộc
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Giao thức cập nhật
1. Bắt đầu item nào thì đổi item đó sang `[ ] [In progress]`.
2. Chỉ đánh `[x] [Completed]` khi có evidence ngay dưới item (file/test/log).
3. Nếu bị chặn > 30 phút: chuyển `[ ] [Blocked]`, ghi blocker + owner + ETA + workaround.
4. Không mở phase kế tiếp nếu phase hiện tại còn item critical chưa xong (trừ khi dependency note cho phép).
5. Kết thúc mỗi session phải cập nhật **Progress Update** và **Resume quick-start**.

---

## 5) Phases / Workstreams và checklist chi tiết

## Phase 0 — Baseline inventory extension points ngầm định

- [x] [Completed] Lập bản đồ extension-like seams hiện tại trong:
  - `packages/opencode-sdk/src/types/`
  - `packages/opencode-app/src/registry/`
  - `packages/opencode-app/src/planner/`
  - `packages/opencode-app/src/executor/`
  - `packages/opencode-app/src/workflows/`
- [x] [Completed] Liệt kê metadata shape đang tồn tại, điểm trùng lặp, điểm thiếu chuẩn hóa.
- [x] [Completed] Liệt kê decision/reason hiện tại (nếu có) và khoảng trống cần freeze.
- [x] [Completed] Xác định deterministic ordering behavior hiện có và điểm non-deterministic.
- [x] [Completed] Chốt baseline thực tế: DH **chưa có** formal minimal extension contract layer.

## Phase 1 — Contract freeze: extension metadata + decision reason codes

- [x] [Completed] Freeze contract version policy (ví dụ `v1`) và nguyên tắc compatibility.
- [x] [Completed] Freeze `ExtensionSpec` tối thiểu: `id`, `contractVersion`, `entry`, `capabilities`, `priority`, `lanes`, `roles`.
- [x] [Completed] Freeze decision shape: `allow | block | modify` + `reasonCodes[]` ổn định.
- [x] [Completed] Freeze reason code baseline tối thiểu:
  - `entry_missing`
  - `contract_version_mismatch`
  - `capability_denied`
  - `lane_mismatch`
  - `role_mismatch`
  - `compat_check_failed`
  - `deprioritized`
  - `blocked_by_precondition`
- [x] [Completed] Ghi rõ boundary: contract này chỉ cho deterministic internal extension contracts, không phải plugin platform.

## Phase 2 — SDK type surface + registry alignment

- [x] [Completed] Tạo/chuẩn hóa type contract tại SDK (`packages/opencode-sdk/src/types/`) làm source-of-truth.
- [x] [Completed] Re-export type qua `packages/opencode-sdk/src/index.ts` để app layer dùng thống nhất.
- [x] [Completed] Đồng bộ registry metadata theo contract mới (không thêm lifecycle/loader concerns).
- [x] [Completed] Đảm bảo registry giữ vai trò policy metadata declarative, không biến thành runtime manager.
- [x] [Completed] Thêm/điều chỉnh test type-level/registry alignment cho compatibility rollout.

## Phase 3 — Planner/Executor guardrail alignment

- [x] [Completed] Planner trả candidate + rejected có reason code chuẩn hóa.
- [x] [Completed] Planner dùng input deterministic cho ordering (priority + stable tiebreaker id).
- [x] [Completed] Executor enforce contract version + entry presence trước activation.
- [x] [Completed] Executor enforce capability/lane/role guardrail trước final decision.
- [x] [Completed] Executor normalize kết quả cuối theo decision model (`allow/block/modify`).
- [x] [Completed] Bổ sung test cho đường dẫn:
  - version mismatch
  - entry missing
  - capability denied
  - deterministic ordering multi-extension

## Phase 4 — Optional minimal fingerprint/state support (chỉ khi justified)

- [x] [Completed] Quyết định có cần fingerprint/state không dựa trên nhu cầu verification/audit thực tế.
- [x] [Completed] Nếu **không cần**: ghi rõ defer + lý do + tác động.
- [ ] [Blocked] Nếu **cần**: thêm contract tối thiểu `first|updated|same` và mapping reason code liên quan.
- [x] [Completed] Đảm bảo phần state mới không mở rộng thành metadata persistence subsystem đầy đủ.
- [ ] [Blocked] Bổ sung test đúng phạm vi tối thiểu cho first/same/updated behavior.

## Phase 5 — Validation + docs closure

- [x] [Completed] Chạy `npm run check` và lưu evidence pass/fail.
- [x] [Completed] Chạy `npm run test` và lưu evidence pass/fail.
- [x] [Completed] Đối chiếu AC trong scope/solution và đánh dấu pass/fail từng tiêu chí.
- [x] [Completed] Rà soát lần cuối scope boundary để chặn scope creep.
- [x] [Completed] Cập nhật checklist + progress log + resume notes cho session kế tiếp.

---

## 6) Dependencies / sequencing notes

### Chuỗi bắt buộc
1. Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5

### Nhánh có điều kiện
- Phase 4 chỉ chạy sau Phase 3 và chỉ khi có justification rõ.

### Ràng buộc sequencing quan trọng
- Không bắt đầu hardening executor trước khi contract freeze hoàn tất ở Phase 1.
- Không để planner/executor tự định nghĩa reason schema riêng ngoài SDK contract.
- Không biến metadata optional thành điều kiện bắt buộc để đóng core contract hardening.
- Không merge thay đổi workflow nếu chưa đảm bảo workflow chỉ consume normalized decisions.

---

## 7) Risks / watchouts

- [x] [Completed] **Scope creep sang plugin platform parity**.
  - Mitigation: kiểm tra mọi PR theo out-of-scope list; reject các hạng mục loader/discovery/distribution.
- [x] [Completed] **Vocabulary drift giữa SDK và app layer**.
  - Mitigation: SDK là source-of-truth; app chỉ dùng/import, không copy type song song.
- [x] [Completed] **Reason code không ổn định theo thời gian**.
  - Mitigation: freeze reason set; thay đổi reason code phải có migration note và review gate.
- [x] [Completed] **Ordering không deterministic khi tie**.
  - Mitigation: bắt buộc tiebreaker theo extension id + test regression.
- [x] [Completed] **Workflow-local logic phình to**.
  - Mitigation: workflow chỉ consume kết quả planner/executor, không re-check policy sâu.
- [x] [Completed] **Optional fingerprint/state bị mở rộng quá mức**.
  - Mitigation: chỉ cho phép first/same/updated tối thiểu hoặc defer hoàn toàn.

---

## 8) Mẫu progress log (copy cho mỗi session)

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

#### Rủi ro mới phát sinh (nếu có)
- ...

#### Việc tiếp theo (1-3 mục ưu tiên)
1.
2.
3.
```

---

## 9) Resume quick-start (cho session mới)

1. Mở 3 tài liệu nguồn đã duyệt:
   - `docs/opencode/minimal-plugin-extension-contract-hardening-analysis-dh.md`
   - `docs/scope/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`
   - `docs/solution/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`
2. Mở checklist này và tìm mục đang `[ ] [In progress]` hoặc `[ ] [Blocked]`.
3. Xác nhận phase hiện tại đã thỏa dependencies trước khi code.
4. Ưu tiên đóng item critical của phase đang mở trước khi mở phase kế tiếp.
5. Mỗi thay đổi phải cập nhật status + evidence ngay tại item liên quan.
6. Trước khi kết thúc session: cập nhật Progress Update + 1-3 bước tiếp theo.

---

## 10) Snapshot khởi tạo trạng thái

- Trạng thái tổng thể task: `[x] [Completed]`
- Phase đang active: `Phase 5 — Validation + docs closure (closed)`
- Ghi chú khởi tạo:
  - DH hiện chưa có formal minimal extension contract layer.
  - Mục tiêu task này là deterministic internal extension contracts only.
  - Không mở rộng plugin platform parity / packaging / marketplace / external ecosystem.

---

### Progress Update — 2026-04-12 15:00
- Session owner: Fullstack Agent
- Phase đang làm: Phase 0 -> Phase 5
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Tạo shared minimal extension contract tại SDK boundary.
- Evidence:
  - `packages/opencode-sdk/src/types/extension-contract.ts`
  - `packages/opencode-sdk/src/index.ts`
  - `packages/opencode-sdk/src/types/hook-decision.ts`

- [x] [Completed] Đồng bộ registry/planner/executor dùng chung vocabulary + deterministic ordering.
- Evidence:
  - `packages/opencode-app/src/registry/mcp-registry.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`

- [x] [Completed] Enforce guardrails version/capability/lane/role với reason codes ổn định.
- Evidence:
  - `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - `packages/opencode-app/src/planner/choose-mcps.test.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`

- [x] [Completed] Workflow consume normalized decision payload downstream.
- Evidence:
  - `packages/opencode-app/src/workflows/delivery.ts`
  - `packages/opencode-app/src/workflows/migration.ts`
  - `packages/runtime/src/session/session-bootstrap-log.ts`
  - `packages/opencode-app/src/workflows/workflows.test.ts`

- [x] [Completed] Validation hoàn tất trên tooling thực tế của repo.
- Evidence:
  - `npm run check` (pass)
  - `npm run test` (pass)

#### Việc đang làm
- Không có.

#### Blockers
- [ ] [Blocked] Không triển khai runtime fingerprint/state (`first|updated|same`) trong slice này.
  - Owner xử lý: Fullstack Agent
  - ETA: defer sang scope riêng nếu cần audit drift runtime
  - Workaround tạm thời: giữ contract type `ExtensionRuntimeState` ở SDK để future rollout additive, chưa bật persistence/runtime wiring

#### Quyết định contract (nếu có)
- Freeze `ExtensionContractVersion = "v1"`.
- Freeze decision model `allow | block | modify` và reason codes ổn định.
- Fallback chỉ áp dụng khi thỏa contract/version/capability guardrails; không inject full plugin lifecycle.

#### Rủi ro mới phát sinh (nếu có)
- Không phát sinh rủi ro vượt scope.

#### Việc tiếp theo (1-3 mục ưu tiên)
1. Nếu cần audit drift runtime: mở scope riêng cho fingerprint persistence tối thiểu.
2. QA review các reason-code assertions theo checklist AC.
3. Theo dõi extension vocabulary drift khi thêm MCP/extension mới.

### Progress Update — 2026-04-12 15:20
- Session owner: Fullstack Agent
- Phase đang làm: Follow-up fix pass
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Bổ sung coverage bắt buộc cho `entry_missing` ở planner và executor tests.
- Evidence:
  - `packages/opencode-app/src/planner/choose-mcps.test.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`
  - `npm run test` (pass: 291 tests)

- [x] [Completed] Re-export `ExtensionLane` và `ExtensionRole` tại SDK index.
- Evidence:
  - `packages/opencode-sdk/src/index.ts`

- [x] [Completed] Bổ sung chú thích strictness cho `ExtensionSpec` required fields.
- Evidence:
  - `packages/opencode-sdk/src/types/extension-contract.ts`
