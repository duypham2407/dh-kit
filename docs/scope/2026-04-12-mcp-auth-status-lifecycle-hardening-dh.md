# Scope Package: MCP Auth/Status Lifecycle Hardening (DH)

**Ngày:** 2026-04-12  
**Owner:** DH app/runtime team  
**Liên kết phân tích:** `docs/opencode/mcp-auth-status-lifecycle-hardening-analysis-dh.md`

---

## 1) Problem statement

Sau khi MCP routing hardening đã hoàn thành, DH vẫn còn điểm yếu ở lớp auth/status lifecycle: nguồn tín hiệu status hiện mỏng, thiếu freshness/transition semantics, khiến quyết định routing dễ phụ thuộc dữ liệu rời rạc theo phiên.

Mục tiêu scope này là làm cứng tối thiểu vòng đời auth/status để đảm bảo routing/enforcement ổn định hơn, **không** mở rộng thành full OAuth/MCP platform.

---

## 2) Current vs target state

| Hạng mục | Current (DH) | Target (scope này) |
|---|---|---|
| MCP routing | Đã harden (reasons/rejections/fallback) | Giữ nguyên nền hiện tại |
| `mcp-auth-status.ts` | Mỏng, chủ yếu build snapshot input | Có lifecycle semantics tối thiểu (freshness + transition hints) |
| Status handling | Có vocabulary cơ bản | Có policy rõ cho stale/missing signal |
| Auth readiness | Có cờ theo snapshot | Chuẩn hóa server-bound lifecycle handling |
| OAuth platform parity | Chưa có và không cần trong slice | Vẫn không làm parity |

---

## 3) In-scope

1. Chuẩn hóa contract lifecycle auth/status tối thiểu cho DH.
2. Làm cứng `mcp-auth-status.ts` để cung cấp snapshot nhất quán hơn cho routing.
3. Định nghĩa policy khi status/auth signal bị thiếu hoặc stale.
4. Giữ semantics gắn MCP với server identity ở mức lifecycle-safe.
5. Kết nối tối thiểu vào planner/enforcer nơi cần tiêu thụ signal.
6. Cập nhật tài liệu phục vụ bước implement code sau này.

---

## 4) Out-of-scope

- Full OAuth callback server.
- Full MCP lifecycle manager parity upstream.
- Interactive auth flow end-to-end.
- Refactor lớn ngoài phạm vi auth/status lifecycle cho routing.
- Mở rộng nền tảng auth thành subsystem độc lập.

---

## 5) Acceptance criteria

1. Có tài liệu contract lifecycle auth/status tối thiểu, rõ và nhất quán với DH reality.
2. Có mô tả rõ policy cho `stale` và `missing signal` để routing không ra quyết định mù.
3. Có hướng mapping cụ thể vào `mcp-auth-status.ts` và các điểm tiêu thụ liên quan.
4. Có giới hạn tương thích rõ: lifecycle hardening only, không full OAuth/MCP parity.
5. Có kế hoạch phase và validation strategy đủ để bước implement code thực thi trực tiếp.

---

## 6) Risks / assumptions

### Risks
- Scope creep sang OAuth platform đầy đủ.
- Overdesign status machine vượt nhu cầu routing.
- Drift semantics giữa planner và enforcer nếu contract không chốt rõ.

### Assumptions
- MCP routing hardening hiện tại đã hoàn thành và là baseline ổn định.
- `mcp-auth-status.ts` hiện còn thin và là điểm vào phù hợp cho slice này.
- Nhu cầu hiện tại là hardening lifecycle tối thiểu cho DH, không parity upstream.

---

## 7) Sequencing expectations

1. Chốt contract lifecycle tối thiểu trước.
2. Làm cứng provider `mcp-auth-status.ts` theo contract đã chốt.
3. Gắn vào enforcer/planner ở mức tiêu thụ cần thiết.
4. Chốt validation matrix cho stale/missing/needs_auth/unavailable.
5. Hoàn tất docs/checklist để sẵn sàng bước implementation code kế tiếp.

**Quy tắc:** Không bắt đầu từ full OAuth flow; mọi thay đổi phải chứng minh phục vụ trực tiếp routing correctness.
