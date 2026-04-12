# Checklist triển khai theo trạng thái: Minimal Extension Runtime State / Fingerprint Persistence (DH)

**Ngày tạo:** 2026-04-12  
**Nguồn đã phê duyệt:**
- `docs/opencode/minimal-extension-runtime-state-fingerprint-persistence-analysis-dh.md`
- `docs/scope/2026-04-12-minimal-extension-runtime-state-dh.md`
- `docs/solution/2026-04-12-minimal-extension-runtime-state-dh.md`

---

## 1) Mục tiêu và phạm vi

### Mục tiêu
- Triển khai lát cắt tối thiểu để `ExtensionRuntimeState` vận hành thực tế qua nhiều lần chạy bằng cơ chế fingerprint persistence.
- Phân loại đúng 3 trạng thái runtime: `first`, `same`, `updated`.

### Phạm vi thực thi (in-scope)
- Inventory baseline các điểm chạm quyết định extension hiện có.
- Chốt tập input fingerprint ổn định + contract bản ghi persisted tối thiểu.
- Triển khai store runtime-state dạng JSON (versioned, bounded).
- Triển khai touch/classify path: `first` / `same` / `updated`.
- Tích hợp additive vào executor/reporting (không đổi policy core).
- Đóng vòng validation + docs evidence.

### Ngoài phạm vi (out-of-scope)
- Không mở lại extension contract hardening (đã hoàn tất).
- Không làm plugin-platform parity.
- Không mở rộng thành metadata subsystem diện rộng.
- Không thêm lifecycle/platform behavior ngoài persistence tối thiểu cho runtime-state.

---

## 2) Hiện trạng vs trạng thái mục tiêu

| Hạng mục | Hiện trạng DH | Trạng thái mục tiêu |
|---|---|---|
| Contract hardening | Đã hoàn tất | Giữ nguyên, không reopen |
| `ExtensionRuntimeState` | Mới tồn tại ở type level | Có wiring runtime thật dựa trên persisted fingerprint |
| Persistence | Chưa có store tối thiểu cho fingerprint theo extension id | Có JSON store versioned, đọc/so sánh/ghi qua các lần chạy |
| Classification | Chưa phân loại runtime xuyên phiên | Phân loại chuẩn: `first`, `same`, `updated` |
| Executor integration | Chưa có touch path chính thức | Có tích hợp additive vào executor/report |
| Scope control | Có rủi ro trượt sang metadata/platform rộng | Giữ strict: chỉ runtime state/fingerprint persistence tối thiểu |

---

## 3) Definition of Done (DoD)

- [ ] [Not started] Có inventory baseline đầy đủ các touchpoint quyết định extension liên quan task này.
- [ ] [Not started] Chốt và ghi rõ tập fingerprint input ổn định (không chứa dữ liệu transient).
- [ ] [Not started] Chốt contract persisted record/store với version `v1`.
- [ ] [Not started] Có JSON runtime-state store đọc/ghi được trong flow thực tế.
- [ ] [Not started] Có API touch/classify trả đúng `first/same/updated`.
- [ ] [Not started] Tích hợp vào executor theo hướng additive, không đổi semantics planner/policy cốt lõi.
- [ ] [Not started] Bao phủ validation cho: `first`, `same`, `updated`, isolation đa extension id, failure degrade bounded.
- [ ] [Not started] Chạy `npm run check` và `npm run test` pass cho thay đổi liên quan.
- [ ] [Not started] Tài liệu/evidence được cập nhật, xác nhận không scope creep sang plugin parity/metadata subsystem rộng.

---

## 4) Status legend và giao thức cập nhật

### Status legend bắt buộc
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Giao thức cập nhật
1. Khi bắt đầu một item, đổi đúng item đó sang `[ ] [In progress]`.
2. Chỉ chuyển `[x] [Completed]` khi có evidence ngay dưới item (file thay đổi / test / command output).
3. Nếu bị chặn > 30 phút, đổi sang `[ ] [Blocked]` và ghi rõ blocker + owner + ETA + workaround.
4. Không mở phase kế tiếp nếu phase hiện tại còn item critical chưa xong (trừ khi dependency note cho phép).
5. Kết thúc mỗi session bắt buộc cập nhật `Progress Update` và `Resume quick-start`.

---

## 5) Phases / Workstreams + checklist chi tiết

## Phase 0 — Baseline inventory touchpoints quyết định extension

- [ ] [Not started] Lập bản đồ touchpoints hiện có ở:
  - `packages/opencode-app/src/registry/mcp-registry.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - `packages/runtime/src/session/` (persistence precedent)
- [ ] [Not started] Ghi rõ điểm chạm nào là nơi an toàn nhất để gọi touch runtime-state.
- [ ] [Not started] Liệt kê dữ liệu extension hiện có phục vụ fingerprint (id, contractVersion, entry, capabilities, priority, lanes, roles).
- [ ] [Not started] Xác nhận baseline reality trong notes: contract hardening đã hoàn tất; `ExtensionRuntimeState` mới ở type level.

## Phase 1 — Fingerprint input freeze + persisted record contract

- [ ] [Not started] Chốt whitelist fingerprint inputs ổn định (không bao gồm available/degraded/needs_auth, timestamp, warning).
- [ ] [Not started] Chốt quy tắc normalize deterministic (đặc biệt cho mảng capabilities/lanes/roles).
- [ ] [Not started] Chốt schema `PersistedExtensionRuntimeRecord` tối thiểu:
  - `version: "v1"`
  - `extensionId`
  - `fingerprint`
  - `lastSeenAt?`
  - `loadCount?`
- [ ] [Not started] Chốt schema `ExtensionRuntimeStateStore`:
  - `version: "v1"`
  - `records: Record<string, PersistedExtensionRuntimeRecord>`
- [ ] [Not started] Chốt quy tắc degrade khi store unreadable/malformed/unwritable (không làm gãy flow chính).

## Phase 2 — Implement JSON runtime-state store

- [ ] [Not started] Tạo module store runtime-state chuyên trách (runtime-owned).
- [ ] [Not started] Implement read path có guard schema/version.
- [ ] [Not started] Implement write path snapshot đầy đủ, tránh update rời rạc.
- [ ] [Not started] Implement xử lý missing file / empty store / malformed JSON theo hướng bounded warning.
- [ ] [Not started] Thêm unit tests cho read/write/version/malformed handling.

## Phase 3 — State classification / touch path (`first` / `same` / `updated`)

- [ ] [Not started] Tạo module fingerprint derivation từ dữ liệu extension đã freeze.
- [ ] [Not started] Tạo API touch thống nhất (derive -> read prior -> classify -> persist -> return result).
- [ ] [Not started] Logic classify bắt buộc:
  - Không có prior record -> `first`
  - Có prior và fingerprint giống -> `same`
  - Có prior và fingerprint khác -> `updated`
- [ ] [Not started] Bảo đảm isolation theo `extensionId` (không ghi đè chéo giữa extension).
- [ ] [Not started] Trả warning có cấu trúc khi persistence lỗi, không throw phá vỡ main path.
- [ ] [Not started] Thêm tests cho 3 trạng thái + multi-extension isolation + failure degrade.

## Phase 4 — Additive executor/report integration

- [ ] [Not started] Chèn touch runtime-state tại điểm enforcement ổn định trong executor.
- [ ] [Not started] Surface kết quả runtime-state ở dạng additive (warning/audit/report field), không đổi planner scoring.
- [ ] [Not started] Giữ backward compatibility với output hiện có của executor/caller.
- [ ] [Not started] Bổ sung/regression test cho executor integration.

## Phase 5 — Validation + docs closure

- [ ] [Not started] Chạy `npm run check` và lưu evidence.
- [ ] [Not started] Chạy `npm run test` và lưu evidence.
- [ ] [Not started] Đối chiếu AC trong scope/solution, đánh dấu pass/fail từng tiêu chí.
- [ ] [Not started] Cập nhật docs evidence: input freeze, store schema, classify behavior, failure handling.
- [ ] [Not started] Xác nhận rõ không có thay đổi ngoài phạm vi (không plugin parity, không metadata subsystem rộng).

---

## 6) Dependencies / sequencing notes

### Chuỗi bắt buộc
1. Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5

### Ràng buộc sequencing
- Không implement classify trước khi freeze fingerprint input và record contract.
- Không tích hợp executor trước khi touch/classify API ổn định và có test nền.
- Không claim hoàn tất nếu thiếu evidence cho một trong 3 trạng thái `first/same/updated`.
- Không dùng runtime-state làm policy branch driver trong milestone này.

### Dependency kỹ thuật cần theo dõi
- Runtime path/ownership của file store phải do runtime module quản lý, app không tự ghi file trực tiếp.
- Fingerprint normalization phải deterministic trước khi chạy regression tests.

---

## 7) Risks / watchouts

- [ ] [Not started] **Fingerprint drift do input không ổn định**.
  - Mitigation: chỉ dùng stable declared fields + normalize thứ tự mảng.
- [ ] [Not started] **Race/overwrite khi ghi JSON store**.
  - Mitigation: serialize write trong một helper duy nhất, snapshot write toàn store.
- [ ] [Not started] **Persistence lỗi làm hỏng core flow**.
  - Mitigation: bounded warning/fallback, không fail hard execution path.
- [ ] [Not started] **Scope creep sang metadata subsystem rộng hoặc plugin-platform parity**.
  - Mitigation: review gate theo out-of-scope list, reject mở rộng không thuộc task.
- [ ] [Not started] **Runtime-state vô tình tác động planner semantics**.
  - Mitigation: chỉ consume tại executor/report dạng additive.

---

## 8) Blocker register (khởi tạo)

- [ ] [Blocked] Chưa có blocker tại thời điểm khởi tạo checklist.
  - Owner: TBD
  - ETA: TBD
  - Workaround: TBD

---

## 9) Mẫu progress log (copy cho mỗi session)

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

#### Rủi ro mới phát sinh
- ...

#### Việc tiếp theo (1-3 mục ưu tiên)
1.
2.
3.
```

---

## 10) Resume quick-start (cho session kế tiếp)

1. Mở 3 tài liệu nguồn đã phê duyệt:
   - `docs/opencode/minimal-extension-runtime-state-fingerprint-persistence-analysis-dh.md`
   - `docs/scope/2026-04-12-minimal-extension-runtime-state-dh.md`
   - `docs/solution/2026-04-12-minimal-extension-runtime-state-dh.md`
2. Mở checklist này và tìm item đang `[ ] [In progress]` hoặc `[ ] [Blocked]`.
3. Xác nhận phase hiện tại đã thỏa dependencies trước khi sửa code.
4. Ưu tiên đóng item critical của phase đang mở trước khi mở phase kế tiếp.
5. Sau mỗi thay đổi: cập nhật status + evidence ngay tại item liên quan.
6. Trước khi kết thúc session: cập nhật `Progress Update` + 1-3 bước tiếp theo.

---

## 11) Snapshot khởi tạo trạng thái

- Trạng thái tổng thể task: `[ ] [In progress]`
- Phase đang active: `Phase 0 — Baseline inventory touchpoints quyết định extension`
- Ghi chú thực tế DH:
  - Extension contract hardening đã complete.
  - `ExtensionRuntimeState` hiện tồn tại ở type level, chưa có persisted runtime wiring.
  - Task này chỉ triển khai tối thiểu runtime-state/fingerprint persistence.
  - Không mở rộng sang plugin platform parity hoặc metadata subsystem diện rộng.
