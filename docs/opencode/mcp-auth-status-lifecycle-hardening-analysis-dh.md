# Phân tích: MCP Auth/Status Lifecycle Hardening (DH)

**Ngày:** 2026-04-12  
**Phạm vi:** Hardening tối thiểu vòng đời auth/status cho MCP trong DH, phục vụ routing/enforcement đã được harden trước đó.

---

## 1) Vì sao đây là bước tiếp theo hợp lý sau MCP routing hardening

MCP routing hardening đã hoàn thành phần “chọn đúng và fallback có lý do”. Bước tiếp theo hợp lý là làm cứng **nguồn tín hiệu auth/status** để quyết định routing đó bền vững hơn theo thời gian.

Lý do chính:
- Routing hiện đã biết xử lý `available | degraded | needs_auth | unavailable`.
- Nhưng nguồn auth/status trong DH còn mỏng, chủ yếu truyền vào theo input tạm thời.
- Nếu không harden vòng đời auth/status, decision quality sẽ phụ thuộc dữ liệu rời rạc, khó tái lập giữa các phiên.

Nói ngắn gọn: routing đã có “bộ não quyết định”, giờ cần tối thiểu “nhịp đời trạng thái” để bộ não đó dùng được ổn định.

---

## 2) Current DH state và lifecycle gap cụ thể

### Hiện trạng DH (factual)
- MCP routing hardening đã có contract decision, reason/rejection, fallback/degrade.
- File `packages/opencode-app/src/auth/mcp-auth-status.ts` đang rất mỏng:
  - chỉ build snapshot từ input,
  - chưa có lifecycle semantics rõ cho refresh/stale/transition,
  - chưa có policy nhất quán khi thiếu tín hiệu auth/status.
- Slice hiện tại **không** có mục tiêu parity full OAuth server/platform.

### Gap vòng đời chính xác
1. **Thiếu chuẩn transition tối thiểu** giữa trạng thái (`available`, `needs_auth`, `unavailable`, `degraded`) theo sự kiện runtime.
2. **Thiếu TTL/staleness policy**: snapshot cũ bao lâu thì còn tin được.
3. **Thiếu contract “unknown/missing signal handling”**: khi thiếu dữ liệu thì fallback kiểu gì cho an toàn.
4. **Thiếu chuẩn hoá theo server identity xuyên phiên** ở mức lifecycle (đã có key concept nhưng chưa có vòng đời rõ).
5. **Thiếu audit-friendly lifecycle reason** (vì sao status đổi, vì sao giữ nguyên, vì sao đánh needs_auth).

---

## 3) Ý tưởng upstream đáng mượn (chọn lọc)

Nguồn tham chiếu upstream:
- `mcp/auth.ts`
- `mcp/oauth-provider.ts`
- `mcp/oauth-callback.ts`

Ý tưởng đáng mượn cho DH (không copy wholesale):

### Từ `mcp/auth.ts`
- Gắn auth state theo **MCP + server URL/identity** để tránh dùng nhầm credential khi endpoint đổi.
- Có semantics token validity/expiry (ở DH có thể tối giản thành `authReady` + freshness).
- State persistence có guardrails (trong slice này chỉ cần chuẩn contract, chưa cần mở rộng platform).

### Từ `mcp/oauth-provider.ts`
- Tách rõ “MCP cần auth” và “MCP đã auth-ready”.
- Cho phép reasoning rõ: không usable vì `needs_auth` thay vì fail mơ hồ.

### Từ `mcp/oauth-callback.ts`
- Ý tưởng lifecycle theo event (pending -> success/fail/timeout), có timeout và state check.
- Trong DH slice này chỉ mượn tư duy transition + timeout semantics; chưa triển khai callback server.

---

## 4) Vì sao DH không nên port full upstream OAuth/MCP manager

Không nên port full vì:
- **Mismatch mục tiêu:** slice này chỉ hardening lifecycle auth/status cho routing, không phải xây platform OAuth/MCP đầy đủ.
- **Chi phí và rủi ro cao:** kéo thêm callback server, provider stack, full lifecycle manager sẽ vượt scope.
- **Giảm tốc delivery:** lợi ích ngắn hạn thấp so với effort.
- **Nguy cơ kiến trúc lệch DH:** DH hiện ưu tiên selective-port, không mirror subsystem upstream.

Kết luận: chỉ mượn semantics cốt lõi phục vụ routing correctness.

---

## 5) Narrow path khuyến nghị

Triển khai đường hẹp (narrow path) theo nguyên tắc “đủ dùng cho routing”:

1. **Định nghĩa lifecycle contract tối thiểu** cho auth/status snapshot:
   - status hiện tại,
   - thời điểm cập nhật,
   - freshness window,
   - transition reason ngắn gọn.
2. **Chuẩn hoá unknown/stale handling**:
   - stale hoặc missing signal -> không coi là available mạnh,
   - ưu tiên warning + fallback an toàn.
3. **Giữ server-bound identity** trong auth lookup.
4. **Không thêm interactive OAuth flow** trong slice này.
5. **Tăng khả năng audit** cho quyết định dựa trên lifecycle.

---

## 6) Mapping package/module (DH)

### Trọng tâm thay đổi
- `packages/opencode-app/src/auth/mcp-auth-status.ts`
  - mở rộng từ helper mỏng thành lifecycle status provider tối thiểu.

### Điểm tiêu thụ
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - dùng lifecycle freshness/transition để quyết định fallback/warning ổn định hơn.
- `packages/opencode-app/src/planner/choose-mcps.ts`
  - chỉ tiêu thụ signal cần thiết cho ranking/rejection (không gánh lifecycle đầy đủ).

### Contract liên quan
- `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - bổ sung type cho auth/status lifecycle metadata tối thiểu.

### Bề mặt Go/bridge (nếu cần)
- Không mở rộng lớn ở slice này; chỉ đảm bảo payload reasoning tương thích với output đã có.

---

## 7) Proposed phases

### Phase A — Contract hóa lifecycle tối thiểu
- Chốt type cho status + freshness + transition reason.
- Chốt policy khi thiếu/stale dữ liệu.

### Phase B — Harden provider `mcp-auth-status.ts`
- Tạo snapshot lifecycle nhất quán từ input.
- Chuẩn hoá server-bound keying và fallback semantics.

### Phase C — Integrate vào enforcer/planner ở mức tối thiểu
- Enforcer dùng freshness/status để quyết định fallback/warning.
- Planner chỉ dùng phần signal cần thiết, tránh over-coupling.

### Phase D — Validation và docs closure
- Kiểm chứng case: fresh available, stale status, needs_auth, unavailable, missing signal.
- Cập nhật docs/checklist để sẵn sàng bước implement code.

---

## 8) Risks / watchouts

- **Scope creep:** trượt sang full OAuth manager.
- **Overdesign lifecycle:** thêm quá nhiều trạng thái không phục vụ routing.
- **Semantic drift:** planner và enforcer diễn giải status khác nhau.
- **False confidence từ stale snapshot:** dữ liệu cũ nhưng vẫn được coi usable.
- **Audit thiếu ngữ cảnh:** khó truy ngược vì sao route bị degrade/blocked.

---

## 9) Guiding recommendation

DH nên làm **lifecycle hardening tối thiểu, hướng routing-first**:

1. Giữ scope nhỏ: chỉ auth/status lifecycle semantics cần cho routing correctness.
2. Chuẩn hoá freshness + missing-signal policy trước khi thêm năng lực OAuth nào khác.
3. Duy trì server-bound identity để tránh sai credential context.
4. Không theo đuổi parity full upstream trong slice này.

> Đây là bước đệm kỹ thuật cần thiết để lần triển khai code tiếp theo có thể thực hiện nhanh, ít rủi ro, và vẫn đúng định hướng selective-port của DH.
