# Checklist triển khai: MCP Auth/Status Lifecycle Hardening (DH)

**Ngày tạo:** 2026-04-12  
**Nguồn chuẩn:**
- `docs/opencode/mcp-auth-status-lifecycle-hardening-analysis-dh.md`
- `docs/scope/2026-04-12-mcp-auth-status-lifecycle-hardening-dh.md`
- `docs/solution/2026-04-12-mcp-auth-status-lifecycle-hardening-dh.md`

---

## 1) Objective and scope

### Objective
Làm cứng tối thiểu vòng đời auth/status cho MCP trong DH để routing/enforcement hoạt động ổn định hơn theo thời gian và theo phiên.

### Scope
- Contract lifecycle tối thiểu cho auth/status.
- Harden `mcp-auth-status.ts`.
- Policy cho stale/missing signal.
- Integration tối thiểu vào planner/enforcer.
- Validation và docs closure.

### Out-of-scope nhắc lại
- Không full OAuth callback/provider platform.
- Không full MCP manager parity upstream.

---

## 2) Current vs target state

### Current
- MCP routing hardening đã complete.
- `mcp-auth-status.ts` còn thin, mới dừng ở build snapshot input.
- Chưa có lifecycle policy rõ cho stale/missing/transition.

### Target
- Có lifecycle semantics tối thiểu (freshness + transition hints) đủ cho routing.
- Có fail-safe policy khi signal thiếu/stale.
- Có boundaries rõ: lifecycle hardening only.

---

## 3) Definition of Done (DoD)

- [x] [Completed] Contract lifecycle tối thiểu được chốt và nhất quán với routing contract hiện có.
  - Evidence: `packages/opencode-app/src/planner/mcp-routing-types.ts` bổ sung metadata lifecycle + fail-safe options.
- [x] [Completed] `mcp-auth-status.ts` hỗ trợ lifecycle-aware snapshot (không chỉ pass-through).
  - Evidence: `packages/opencode-app/src/auth/mcp-auth-status.ts` thêm freshness, stale, transition reason, missing-signal handling.
- [x] [Completed] Có policy rõ cho `stale` và `missing signal`.
  - Evidence: default fail-safe được enforce ở `enforce-mcp-routing.ts`; planner giữ warning-mode mặc định và hỗ trợ `degrade_or_fallback`.
- [x] [Completed] Enforcer/planner tiêu thụ signal lifecycle ở mức cần thiết.
  - Evidence: `choose-mcps.ts` + `enforce-mcp-routing.ts` dùng `stale/signalMissing` không over-couple OAuth internals.
- [x] [Completed] Validation đủ 5 case trọng tâm (fresh/needs_auth/unavailable/stale/missing).
  - Evidence: test mới/được mở rộng tại `mcp-auth-status.test.ts`, `enforce-mcp-routing.test.ts`, `choose-mcps.test.ts`.
- [x] [Completed] Tài liệu phản ánh đúng giới hạn: không full OAuth/MCP parity.
  - Evidence: checklist này ghi rõ boundaries giữ nguyên; implementation không thêm callback/provider platform.

---

## 4) Status legend / update protocol

### Legend
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`
- `[ ] [Blocked]`

### Update protocol
1. Bắt đầu mục nào -> đổi sang `[ ] [In progress]`.
2. Xong mục nào -> đổi `[x] [Completed]` + ghi evidence ngay dưới mục.
3. Nếu blocked > 30 phút -> đổi `[ ] [Blocked]` + ghi blocker/owner/ETA.
4. Không đánh Completed nếu chưa có evidence.
5. Kết thúc mỗi session -> cập nhật Progress Log.

---

## 5) Phases / workstreams

### Phase 0 — Baseline & contract freeze
- [x] [Completed] Rà soát baseline auth/status path trong DH.
- [x] [Completed] Chốt lifecycle metadata tối thiểu cần thêm.
- [x] [Completed] Chốt policy stale/missing signal.

### Phase 1 — Provider hardening (`mcp-auth-status.ts`)
- [x] [Completed] Thiết kế snapshot lifecycle-aware.
- [x] [Completed] Chuẩn hóa server-bound identity trong lookup.
- [x] [Completed] Bổ sung transition/freshness hints tối thiểu.

### Phase 2 — Integration vào routing surfaces
- [x] [Completed] Enforcer dùng lifecycle policy fail-safe.
- [x] [Completed] Planner tiêu thụ signal mức tối thiểu khi cần.
- [x] [Completed] Bảo toàn behavior routing baseline đã harden.

### Phase 3 — Validation & closure
- [x] [Completed] Chạy validation matrix cho 5 case trọng tâm.
- [x] [Completed] Xác nhận reason/warning đủ truy vết.
- [x] [Completed] Cập nhật docs/handoff notes.

---

## 6) Detailed checklist items

### 6.1 Contract
- [x] [Completed] Có định nghĩa rõ field lifecycle metadata (timestamp/window/reason tối thiểu).
- [x] [Completed] Mapping rõ từ lifecycle signal -> routing semantics.
- [x] [Completed] Không thêm state/field nào không phục vụ routing.

### 6.2 Implementation focus (sẽ làm ở bước code sau)
- [x] [Completed] `mcp-auth-status.ts` không còn chỉ transform input thụ động.
- [x] [Completed] Có xử lý fallback an toàn khi thiếu statusByMcp.
- [x] [Completed] Có guardrails cho stale snapshot.

### 6.3 Integration
- [x] [Completed] Enforcer xử lý stale/missing theo fail-safe rule.
- [x] [Completed] Planner không over-couple vào lifecycle internals.
- [x] [Completed] Giữ tương thích với routing decision contract hiện hành.

### 6.4 Validation evidence
- [x] [Completed] Evidence cho `fresh available`.
- [x] [Completed] Evidence cho `needs_auth`.
- [x] [Completed] Evidence cho `unavailable`.
- [x] [Completed] Evidence cho `stale`.
- [x] [Completed] Evidence cho `missing signal`.

---

## 7) Dependencies / sequencing notes

1. Phải freeze contract trước khi sửa provider/integration.
2. Không chạy trước vào OAuth interactive flow.
3. Nếu có thay đổi semantics ở enforcer, phải kiểm tra không phá baseline routing hardening.
4. Validation phải bao gồm stale/missing, không chỉ happy path.

---

## 8) Risks / watchouts

- [x] [Completed] Scope creep sang full OAuth/MCP manager.
  - Mitigation: không thêm callback/provider flow; chỉ sửa lifecycle metadata + routing fail-safe.
- [x] [Completed] Overdesign lifecycle model.
  - Mitigation: giữ đúng 4 status cũ, chỉ thêm metadata tối thiểu phục vụ routing.
- [x] [Completed] Planner/enforcer diễn giải status khác nhau.
  - Mitigation: dùng chung `McpRuntimeRecord` fields và fail-safe options trong `mcp-routing-types.ts`.
- [x] [Completed] Stale signal bị coi như healthy.
  - Mitigation: enforcer default `degrade_or_fallback` khi stale.
- [x] [Completed] Thiếu audit reason cho fallback/degrade.
  - Mitigation: thêm reason codes `status_stale` và `missing_runtime_signal`.

---

## 9) Progress log template

```md
### Progress Update — YYYY-MM-DD HH:mm
- Session owner:
- Phase đang làm:
- Trạng thái tổng quan: [ ] [Not started] / [ ] [In progress] / [x] [Completed] / [ ] [Blocked]

#### Việc đã hoàn thành
- [x] [Completed] ...
- Evidence:
  - <file/test/log/link>

#### Việc đang làm
- [ ] [In progress] ...

#### Blockers
- [ ] [Blocked] <mô tả>
  - Owner:
  - ETA:
  - Workaround:

#### Việc tiếp theo (ưu tiên)
1.
2.
3.
```

---

## 10) Resume quick-start

1. Đọc 3 tài liệu nguồn (analysis/scope/solution).
2. Mở checklist này, tìm mục `[ ] [In progress]` hoặc `[ ] [Blocked]`.
3. Xác nhận phase hiện tại có thỏa dependency chưa.
4. Ưu tiên hoàn tất contract freeze trước mọi thay đổi code.
5. Sau mỗi thay đổi, cập nhật trạng thái + evidence ngay.
6. Trước khi kết thúc session, điền Progress Update.

---

### Progress Update — 2026-04-12 19:36
- Session owner: Fullstack Agent
- Phase đang làm: Phase 3 — Validation & closure
- Trạng thái tổng quan: [x] [Completed]

#### Việc đã hoàn thành
- [x] [Completed] Contract + implementation lifecycle metadata cho MCP auth/status.
- [x] [Completed] Harden provider `mcp-auth-status.ts` với freshness/stale/transition/missing-signal semantics.
- [x] [Completed] Tích hợp fail-safe stale/missing vào enforcer/planner theo solution-approved boundaries.
- [x] [Completed] Bổ sung tests cho 5 case trọng tâm và chạy validation thực tế.
- Evidence:
  - `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - `packages/opencode-app/src/auth/mcp-auth-status.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - `packages/opencode-app/src/auth/mcp-auth-status.test.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`
  - `packages/opencode-app/src/planner/choose-mcps.test.ts`
  - Validation logs: `npm run check`, `npm run test` (pass)

#### Việc đang làm
- [ ] [In progress] Chuẩn bị handoff summary + tool evidence cho Code Reviewer/QA.

#### Blockers
- [ ] [Blocked] `tool.rule-scan` (Semgrep quality scan) không khả dụng trong DH runtime/tool surface hiện tại.
  - Owner: Runtime tooling maintainers
  - ETA: Chưa có
  - Workaround: dùng typecheck + full test suite + manual evidence-capture

#### Việc tiếp theo (ưu tiên)
1. Bổ sung/enable `tool.rule-scan` trong runtime để đóng quality gate bắt buộc.
2. Chạy lại rule-scan trên file đã đổi khi tool khả dụng.
3. Handoff cho code-review/QA theo luồng full mode.
