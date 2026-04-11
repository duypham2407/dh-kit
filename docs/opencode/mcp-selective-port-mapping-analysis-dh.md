# Phân tích selective-port MCP từ upstream OpenCode sang DH

Ngày: 2026-04-11  
Phạm vi upstream đã phân tích:

- `/Users/duypham/Code/opencode/packages/opencode/src/mcp/auth.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/mcp/index.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/mcp/oauth-provider.ts`
- `/Users/duypham/Code/opencode/packages/opencode/src/mcp/oauth-callback.ts`

Phạm vi DH đã đối chiếu:

- `packages/opencode-app/src/registry/mcp-registry.ts`
- `packages/opencode-app/src/planner/choose-mcps.ts`
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
- `packages/opencode-core/internal/hooks/mcp_routing.go`

---

## vì sao MCP subsystem là task tiếp theo hợp lý

MCP là điểm giao giữa planner/executor và năng lực tool thực tế. Ở DH hiện tại, phần này đã có khung nhưng còn rất mỏng, nên đây là thời điểm hợp lý để nâng cấp trước khi viết scope/solution/checklist chi tiết:

1. **Đã có baseline routing** trong cả TS (`choose-mcps`) và Go hook (`mcp_routing.go`), tức là có chỗ để gắn thêm policy mà không cần đập kiến trúc.
2. **Rủi ro hiện tại nằm ở chất lượng chọn tool**, không phải ở thiếu tool list: DH đã có registry cơ bản nhưng chưa có lifecycle/health/auth-aware routing.
3. **Upstream MCP đã chứng minh pattern vận hành thực chiến** (status machine, fallback transport, OAuth flow), có thể port chọn lọc để giảm trial-and-error.
4. **Giá trị trực tiếp cho các lane** (quick/delivery/migration): routing tốt hơn giúp giảm sai tool, giảm noise, tăng khả năng tái lập execution.

---

## upstream MCP mạnh ở đâu

Từ 4 file upstream đã đọc, các điểm mạnh nổi bật là:

### 1) Trạng thái MCP rõ ràng, có semantics vận hành

`index.ts` dùng status union (`connected`, `disabled`, `failed`, `needs_auth`, `needs_client_registration`) thay vì boolean đơn giản. Điều này cho phép planner/executor quyết định dựa trên trạng thái thực.

### 2) Kết nối đa transport + fallback có kiểm soát

Remote MCP được thử theo thứ tự (`StreamableHTTP`, rồi `SSE`) với timeout và phân loại lỗi auth/non-auth. Đây là điểm mạnh về resilience.

### 3) OAuth flow tương đối đầy đủ

- `oauth-provider.ts`: hỗ trợ pre-registered client hoặc dynamic client registration.
- `auth.ts`: lưu token/client info/code verifier/oauth state vào file riêng, permission chặt (`0o600`), có check token hết hạn.
- `oauth-callback.ts`: callback server riêng, enforce `state` để chống CSRF, timeout pending auth.

### 4) Token/client info gắn với server URL

`getForUrl(mcpName, serverUrl)` giảm rủi ro dùng nhầm credential khi URL MCP thay đổi.

### 5) Runtime behavior giàu hơn routing tĩnh

`index.ts` có thêm tools/prompts/resources aggregation, watch tool-list-changed, connect/disconnect/add/re-auth, nên hệ thống có thể phản ứng runtime thay vì chỉ map theo từ khóa intent.

---

## DH hiện đang ở đâu và còn mỏng ở đâu

### DH hiện đang có (factual)

1. `mcp-registry.ts`: registry tĩnh gồm `mcpName`, `lanes`, `roles`, `triggerTags`, `priority`.
2. `choose-mcps.ts`: chọn MCP theo filter lane/role/tag + sort priority.
3. `enforce-mcp-routing.ts`: hiện chỉ passthrough `chooseMcps`.
4. `mcp_routing.go`: hook mặc định rất tối giản (intent = `browser` thì trả `chrome-devtools`, `playwright`; còn lại trả `augment_context_engine`).

### Những chỗ còn mỏng

1. **Chưa có MCP runtime status model** (connected/failed/needs_auth...).
2. **Chưa có auth-aware routing** (không biết MCP nào cần auth, token còn hạn hay không).
3. **Tag extraction còn keyword-based đơn giản**, thiếu context scoring và thiếu explainability lý do chọn.
4. **TS và Go chưa có contract routing chung rõ ràng** ngoài danh sách tên MCP.
5. **Không có degrade/fallback policy theo loại lỗi hoặc availability**.

---

## selective-port gì là đáng nhất từ upstream MCP

Đề xuất chỉ port các ý tưởng tạo leverage cao, không kéo cả subsystem:

1. **Status model cho MCP endpoint** (inspired từ `index.ts`).
2. **Auth metadata tối thiểu + trạng thái auth** (inspired từ `auth.ts`, `oauth-provider.ts`).
3. **Routing decision có lý do (`reason codes`)** thay vì chỉ trả list tên MCP.
4. **Fallback/degrade policy** khi MCP không available hoặc không đạt precondition.
5. **Server-bound credential keying concept** (không nhất thiết copy file format upstream).

---

## những gì KHÔNG nên port wholesale

1. **Không copy nguyên Effect/Layer/InstanceState stack** từ upstream TS vào DH.
2. **Không copy nguyên OAuth callback server implementation** nếu DH chưa cần full OAuth interactive flow ở pha đầu.
3. **Không mirror toàn bộ MCP client lifecycle manager** (connect/list/watch/prompts/resources) khi DH mới cần routing correctness.
4. **Không ràng buộc DH vào storage contract `mcp-auth.json` của upstream**; chỉ học ý tưởng keying + expiry semantics.
5. **Không nhập toàn bộ event bus semantics của upstream** chỉ để phục vụ routing phase đầu.

---

## mapping cụ thể sang DH packages/modules

## A. `packages/opencode-app/src/registry/mcp-registry.ts`

Mở rộng entry theo hướng policy-driven (không chỉ tags):

- giữ: `mcpName`, `lanes`, `roles`, `priority`, `triggerTags`
- thêm đề xuất:
  - `capabilities: string[]` (vd: `code_search`, `docs_lookup`, `browser_diag`)
  - `requiresAuth?: boolean`
  - `supportsInteractiveAuth?: boolean`
  - `degradeTo?: string[]` (fallback chain)
  - `healthClass?: "critical" | "standard" | "best_effort"`

Mục tiêu: cho planner đủ metadata để chọn thực dụng theo runtime condition.

## B. `packages/opencode-app/src/planner/choose-mcps.ts`

Nâng từ filter cứng sang scoring có ngữ cảnh:

- input thêm runtime context (status/auth availability/caller constraints)
- output từ `string[]` sang cấu trúc dạng:
  - `selected: string[]`
  - `reasons: Record<string, string[]>`
  - `rejected: Record<string, string[]>`

Giữ backward compatibility bằng adapter nếu cần (`map(selected)`).

## C. `packages/opencode-app/src/executor/enforce-mcp-routing.ts`

Từ passthrough thành enforcement thật:

- kiểm tra preconditions (auth required, status available)
- áp dụng degrade/fallback chain
- emit quyết định cuối cùng + lý do cho audit/debug

## D. `packages/opencode-core/internal/hooks/mcp_routing.go`

Đồng bộ contract với TS planner ở mức tối thiểu:

- nhận thêm ngữ cảnh routing (lane/role/intent class)
- trả về cả `allow` + `warnings` có lý do
- tránh logic hardcoded chỉ dựa `intent == browser`

## E. Module mới đề xuất (chọn lọc, nhỏ)

- `packages/opencode-app/src/registry/mcp-routing-policy.ts` (policy helpers)
- `packages/opencode-app/src/planner/mcp-routing-types.ts` (decision contracts)
- (optional pha sau) `packages/opencode-app/src/auth/mcp-auth-status.ts` (chỉ status abstraction, chưa cần full OAuth flow)

---

## đề xuất phases cho task MCP tiếp theo

## Phase 0 — Baseline contract hóa (nhỏ, nhanh)

- Chốt schema `McpRoutingDecision` và `ReasonCode`.
- Không đổi behavior lớn; chỉ thêm explainability.

## Phase 1 — Nâng chất lượng chọn MCP

- Mở rộng registry metadata (capabilities/preconditions/degrade).
- Nâng `chooseMcps` sang scoring + reasons/rejections.

## Phase 2 — Enforcement thực sự

- Triển khai precondition checks và fallback trong `enforce-mcp-routing.ts`.
- Đồng bộ hook Go để không lệch semantics với app layer.

## Phase 3 — Auth/status-aware routing (selective)

- Thêm status model tối thiểu: `available`, `degraded`, `needs_auth`, `unavailable`.
- Chỉ khi cần mới mở rộng sang interactive OAuth flow.

## Phase 4 — Hardening & telemetry

- Ghi audit về lý do route/fallback.
- Bổ sung test matrix cho lane x role x intent class.

---

## 5 điều đáng lấy nhất từ upstream MCP

1. **Status machine rõ ràng thay vì cờ boolean mơ hồ.**
2. **Credential gắn với server URL để tránh reuse sai bối cảnh.**
3. **Auth flow có state/timeout để giảm lỗi bảo mật và treo luồng.**
4. **Fallback transport/degrade strategy thay vì fail cứng ngay lần đầu.**
5. **Khả năng giải thích quyết định routing theo runtime signal, không chỉ keyword.**

---

## kết luận / guiding recommendation

DH nên theo chiến lược **selective-port theo năng lực**, không selective-port theo file-by-file mirror.

Khuyến nghị thực tế:

1. **Ưu tiên routing contract + explainability trước** (Phase 0-1).
2. **Đưa enforcement/fallback vào executor** để hành vi nhất quán runtime (Phase 2).
3. **Chỉ port auth/status ở mức cần thiết cho routing**, chưa cần sao chép full OAuth subsystem (Phase 3).
4. **Giữ ranh giới package hiện tại**: policy/planner/executor ở `opencode-app`, hook đồng bộ tối thiểu ở `opencode-core`.
5. Dùng tài liệu này làm nền cho scope/solution/checklist tiếp theo, với mục tiêu đo được: tăng độ đúng của MCP selection và giảm fallback thủ công.
