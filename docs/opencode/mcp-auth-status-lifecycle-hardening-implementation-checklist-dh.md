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

- [ ] [Not started] Contract lifecycle tối thiểu được chốt và nhất quán với routing contract hiện có.
- [ ] [Not started] `mcp-auth-status.ts` hỗ trợ lifecycle-aware snapshot (không chỉ pass-through).
- [ ] [Not started] Có policy rõ cho `stale` và `missing signal`.
- [ ] [Not started] Enforcer/planner tiêu thụ signal lifecycle ở mức cần thiết.
- [ ] [Not started] Validation đủ 5 case trọng tâm (fresh/needs_auth/unavailable/stale/missing).
- [ ] [Not started] Tài liệu phản ánh đúng giới hạn: không full OAuth/MCP parity.

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
- [ ] [Not started] Rà soát baseline auth/status path trong DH.
- [ ] [Not started] Chốt lifecycle metadata tối thiểu cần thêm.
- [ ] [Not started] Chốt policy stale/missing signal.

### Phase 1 — Provider hardening (`mcp-auth-status.ts`)
- [ ] [Not started] Thiết kế snapshot lifecycle-aware.
- [ ] [Not started] Chuẩn hóa server-bound identity trong lookup.
- [ ] [Not started] Bổ sung transition/freshness hints tối thiểu.

### Phase 2 — Integration vào routing surfaces
- [ ] [Not started] Enforcer dùng lifecycle policy fail-safe.
- [ ] [Not started] Planner tiêu thụ signal mức tối thiểu khi cần.
- [ ] [Not started] Bảo toàn behavior routing baseline đã harden.

### Phase 3 — Validation & closure
- [ ] [Not started] Chạy validation matrix cho 5 case trọng tâm.
- [ ] [Not started] Xác nhận reason/warning đủ truy vết.
- [ ] [Not started] Cập nhật docs/handoff notes.

---

## 6) Detailed checklist items

### 6.1 Contract
- [ ] [Not started] Có định nghĩa rõ field lifecycle metadata (timestamp/window/reason tối thiểu).
- [ ] [Not started] Mapping rõ từ lifecycle signal -> routing semantics.
- [ ] [Not started] Không thêm state/field nào không phục vụ routing.

### 6.2 Implementation focus (sẽ làm ở bước code sau)
- [ ] [Not started] `mcp-auth-status.ts` không còn chỉ transform input thụ động.
- [ ] [Not started] Có xử lý fallback an toàn khi thiếu statusByMcp.
- [ ] [Not started] Có guardrails cho stale snapshot.

### 6.3 Integration
- [ ] [Not started] Enforcer xử lý stale/missing theo fail-safe rule.
- [ ] [Not started] Planner không over-couple vào lifecycle internals.
- [ ] [Not started] Giữ tương thích với routing decision contract hiện hành.

### 6.4 Validation evidence
- [ ] [Not started] Evidence cho `fresh available`.
- [ ] [Not started] Evidence cho `needs_auth`.
- [ ] [Not started] Evidence cho `unavailable`.
- [ ] [Not started] Evidence cho `stale`.
- [ ] [Not started] Evidence cho `missing signal`.

---

## 7) Dependencies / sequencing notes

1. Phải freeze contract trước khi sửa provider/integration.
2. Không chạy trước vào OAuth interactive flow.
3. Nếu có thay đổi semantics ở enforcer, phải kiểm tra không phá baseline routing hardening.
4. Validation phải bao gồm stale/missing, không chỉ happy path.

---

## 8) Risks / watchouts

- [ ] [Not started] Scope creep sang full OAuth/MCP manager.
- [ ] [Not started] Overdesign lifecycle model.
- [ ] [Not started] Planner/enforcer diễn giải status khác nhau.
- [ ] [Not started] Stale signal bị coi như healthy.
- [ ] [Not started] Thiếu audit reason cho fallback/degrade.

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
