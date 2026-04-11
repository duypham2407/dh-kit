# Lộ trình selective-port từ upstream OpenCode cho DH

Ngày cập nhật: 2026-04-11  
Trạng thái: Working reference (theo dõi liên tục)

---

## 1) Mục tiêu tài liệu

Tài liệu này gom lại **toàn bộ phân tích prior** về câu hỏi: _DH còn nên chọn lọc port/reuse gì từ upstream OpenCode_ để tạo một điểm tham chiếu duy nhất dưới `docs/opencode/`.

Mục tiêu là:
- tránh quyết định theo cảm tính hoặc theo “đủ bộ”;
- ưu tiên những phần tạo giá trị trực tiếp cho runtime của DH;
- giữ ranh giới rõ giữa “reuse chọn lọc” và “copy nguyên monorepo TS”.

---

## 2) Kết luận cấp cao (đã chốt)

1. **DH đã lấy phần lớn baseline Go core quan trọng từ upstream OpenCode.**
   - Hướng hiện tại là upstream-first cho baseline Go core, sau đó patch DH theo mục tiêu sản phẩm.
   - Hook surfaces trọng yếu (model/pre-tool/pre-answer/skill/MCP/session) đã có đường tích hợp.

2. **DH không nên mirror toàn bộ TS monorepo của upstream.**
   - Kiến trúc DH đã có package boundaries riêng (`opencode-app`, `runtime`, `storage`, `intelligence`, `retrieval`, `providers`, `opencode-sdk`).
   - Mirror toàn bộ TS upstream sẽ tăng maintenance cost, tạo trùng lớp, và gây lệch với runtime contract hiện tại của DH.

3. **Selective-port phải do giá trị DH dẫn dắt, không do tiêu chí “đủ tính năng upstream”.**
   - Chỉ port khi tạo leverage rõ cho quality/runtime enforcement/khả năng truy vấn code thực.
   - Không port các lớp framework/wiring chỉ vì upstream đang có.

4. **Tiêu chí quyết định có đáng port hay không (gating criteria).**
   - Tăng trực tiếp năng lực cốt lõi của DH (code understanding, enforcement, reliability, DX nội bộ).
   - Gắn được vào hook/contract hiện có, không phá architecture.
   - Có thể triển khai theo lát nhỏ (slice), đo được hiệu quả.
   - Không đòi hỏi kéo theo một subsystem lớn không cần thiết.
   - Tổng cost vận hành + đồng bộ dài hạn chấp nhận được.

---

## 3) Bản đồ selective-port A → E

## A. Session runtime ideas

### A.1 Upstream đang có gì
- Quản lý session/runtime state theo vòng đời phiên làm việc (khởi tạo, resume, cleanup).
- Các cơ chế session-context injection và state propagation vào runtime paths.
- Một số chế độ bridge/session mirror (SQLite decision log + filesystem/session mirror + delegated CLI path + IPC-prep stub trong bối cảnh DH bridge).

### A.2 Vì sao đáng/không đáng selective-port
- **Đáng port chọn lọc** khi giúp DH ổn định hơn ở resume/recovery, giảm state drift, và cải thiện traceability.
- **Không đáng port wholesale** vì DH đã có lane/stage/work-item semantics riêng; copy nguyên session stack sẽ đụng workflow contract của DH.

### A.3 Phần đáng lấy nhất
- Session resume/recovery guardrails có thể chứng minh được qua evidence.
- Chuẩn hóa session state snapshot + cleanup lifecycle để giảm session leak.
- Cơ chế fallback rõ ràng khi thiếu envelope/runtime context.

### A.4 Không nên port wholesale
- Toàn bộ orchestration semantics hoặc session manager upstream nếu trùng/đụng với `.opencode/workflow-state` + work-item model của DH.
- Mọi logic giả định task/lane semantics kiểu upstream generic thay vì mode-aware contract của DH.

### A.5 Điểm đến đề xuất trong DH
- `packages/opencode-core/internal/session/` (Go runtime wiring, lifecycle hooks)
- `packages/opencode-app/src/executor/` (policy-level session behavior)
- `packages/opencode-sdk/src/client/session-client.ts` + `packages/opencode-sdk/src/types/` (bridge contract)
- `.opencode/workflow-state.json` + `.opencode/work-items/` (state compatibility + runtime backing)

### A.6 Ưu tiên
- **P1** (sau khi graph/tool enforcement P0 hoàn tất)

---

## B. Tool contract / tool ergonomics

### B.1 Upstream đang có gì
- Mẫu contract tool tương đối chặt (schema đầu vào/đầu ra, lifecycle rõ).
- Kinh nghiệm ergonomics cho tool usage (gợi ý tool thay thế, giảm gọi lệnh OS thô).
- Enforcement pattern theo hook trước/sau tool, nhất là bash/tool guard.

### B.2 Vì sao đáng/không đáng selective-port
- **Rất đáng port chọn lọc** vì đây là nơi ảnh hưởng trực tiếp chất lượng câu trả lời và mức “deterministic” của agent runtime.
- **Không nên port nguyên xi** registry/factory/wiring JS nếu DH đã route qua Go runtime + dh-owned bridge.

### B.3 Phần đáng lấy nhất
- Bộ quy tắc tool substitution (OS command → dedicated tool).
- Bash guard có mức strict/advisory, có suggestion rõ ràng.
- Pre-answer evidence gating cho câu hỏi structural (tránh trả lời thiếu bằng chứng).
- Chuẩn hóa output shape để tool dễ compose trong workflow.

### B.4 Không nên port wholesale
- Toàn bộ `tool-registry`/`create-tools`/`hook factory` kiểu upstream khi DH đã có đường đăng ký và enforcement riêng.
- Các convenience wrappers trùng chức năng với tool intelligence đã tồn tại trong DH.

### B.5 Điểm đến đề xuất trong DH
- `packages/runtime/src/hooks/` (bash-guard, runtime enforcer)
- `packages/opencode-app/src/executor/` (hook-enforcer, pre-answer gating)
- `packages/opencode-core/internal/llm/agent/tools.go` + `packages/opencode-core/internal/llm/tools/` (Go tool registration/runtime)

### B.6 Ưu tiên
- **P0**

---

## C. MCP subsystem

### C.1 Upstream đang có gì
- MCP connection/dispatch layer và routing theo intent.
- Cơ chế ưu tiên/block MCP theo ngữ cảnh tác vụ.
- Mẫu tích hợp MCP vào execution flow thay vì dùng như tiện ích rời.

### C.2 Vì sao đáng/không đáng selective-port
- **Đáng port chọn lọc** cho policy/routing patterns vì DH cần điều phối MCP theo lane/objective.
- **Không nên port wholesale** phần connection stack nếu trùng với implementation đã có trong `opencode-core` và policy phía DH app.

### C.3 Phần đáng lấy nhất
- Intent-to-MCP routing policy có priority + blocklist rõ.
- Failover/fallback hành vi khi MCP không sẵn sàng.
- Auditability cho quyết định routing.

### C.4 Không nên port wholesale
- Sao chép nguyên cụm MCP client/subsystem nếu chỉ để đạt “parity danh sách”.
- Mọi thành phần khiến DH khóa cứng vào cách tổ chức MCP của upstream.

### C.5 Điểm đến đề xuất trong DH
- `packages/opencode-core/internal/llm/agent/mcp-tools.go` (runtime dispatch hook)
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts` (policy/routing quyết định)
- `packages/opencode-sdk/src/client/mcp-client.ts` + `types/hook-decision.ts` (bridge contract)

### C.6 Ưu tiên
- **P1**

---

## D. Plugin system

### D.1 Upstream đang có gì
- Cơ chế plugin/extension-oriented để mở rộng hành vi runtime ở môi trường generic.
- Các abstraction phục vụ dynamic extension loading/composition.

### D.2 Vì sao đáng/không đáng selective-port
- **Đáng cân nhắc mức hạn chế** nếu DH cần extension points nội bộ rõ ràng cho maintainability.
- **Không đáng port full plugin platform** ở giai đoạn này vì DH đang ưu tiên deterministic runtime qua hook contracts, không phải marketplace/plugin ecosystem.

### D.3 Phần đáng lấy nhất
- Ý tưởng extension contracts tối giản (stable interface + versioning + capability declaration).
- Cơ chế guard để extension không phá invariant runtime.

### D.4 Không nên port wholesale
- Dynamic plugin loading framework đầy đủ, dependency injection graph phức tạp, hoặc packaging/distribution plugin riêng.
- Mọi abstraction làm runtime khó truy vết hơn khi debug production behavior.

### D.5 Điểm đến đề xuất trong DH
- `packages/opencode-sdk/src/types/` (nếu cần chuẩn hóa extension contract tối giản)
- `packages/opencode-app/src/` (policy-driven extension points nội bộ)
- `docs/architecture/` (chốt boundary trước khi code)

### D.6 Ưu tiên
- **P2**

---

## E. Project / filesystem / shell / worktree utilities

### E.1 Upstream đang có gì
- Nhóm utility cho scan project/workspace, thao tác filesystem/worktree, shell execution helpers.
- Các helper phục vụ thao tác dự án diện rộng trong runtime/tooling path.

### E.2 Vì sao đáng/không đáng selective-port
- **Đáng port chọn lọc** những utility nâng độ an toàn, tính nhất quán, và tốc độ thao tác codebase.
- **Không nên port wholesale** do rủi ro chồng chéo với tooling nội tại DH, và dễ mở rộng bề mặt shell không kiểm soát.

### E.3 Phần đáng lấy nhất
- Workspace/project scan patterns phục vụ indexing pipeline.
- File/path normalization và guardrails cho thao tác trên source tree.
- Worktree-safe helpers (nếu giúp giảm sai lệch khi thao tác nhánh/tập tin lớn).

### E.4 Không nên port wholesale
- Shell utility wrappers trùng với command/runtime surface hiện có của DH.
- Toàn bộ bộ tiện ích “general-purpose” không gắn trực tiếp use-case của DH.

### E.5 Điểm đến đề xuất trong DH
- `packages/intelligence/src/graph/` (workspace scan/index utilities phục vụ graph/indexing)
- `packages/runtime/src/hooks/` (shell/tool guardrails)
- `packages/opencode-sdk/src/client/filesystem-client.ts` (filesystem/session mirror contracts)

### E.6 Ưu tiên
- **P1** (riêng phần shell guard liên quan enforcement có thể đi cùng B ở P0)

---

## 4) 5 selective-ports giá trị nhất tiếp theo

1. **AST import graph + graph DB backbone hoàn chỉnh (P0)**  
   Giá trị: mở khóa truy vấn dependency/dependent thật, giảm suy đoán.

2. **Bash/tool guard + tool substitution enforcement runtime-level (P0)**  
   Giá trị: chặn đường tắt OS command trên source code, ép dùng tool đúng lớp.

3. **Reference tracking + call hierarchy (P1)**  
   Giá trị: trả lời chính xác “ai gọi ai / symbol dùng ở đâu”.

4. **Pre-answer structural evidence gating (P1)**  
   Giá trị: giảm hallucination kiến trúc, tăng độ tin cậy câu trả lời kỹ thuật.

5. **MCP routing policy hardening (priority/block/fallback/audit) (P1)**  
   Giá trị: route đúng công cụ theo intent, giảm dao động chất lượng theo phiên.

---

## 5) Roadmap khuyến nghị (thứ tự làm)

### Bước 1 — Làm trước (P0)
- Tool contract/enforcement: bash guard + substitution rules + output contracts.
- Graph nền tảng: schema/repo/indexer/import AST extraction để có dependency truth.

### Bước 2 — Làm thứ hai (P1)
- Reference/call graph extraction.
- Pre-answer evidence gating cho nhóm câu hỏi structural.
- MCP routing policy hardening theo intent + fallback + audit.

### Bước 3 — Làm thứ ba (P2/P1 muộn)
- Session runtime refinements (resume/recovery/cleanup sâu hơn, nếu còn gap thực tế).
- Plugin/extension contracts tối giản (chỉ khi có nhu cầu mở rộng thực tế, không dựng platform trước).

---

## 6) Những gì **không** nên selective-port (và lý do)

1. **Toàn bộ TS monorepo/wiring framework của upstream**  
   Lý do: DH đã có package architecture riêng; copy nguyên sẽ tăng coupling + maintenance.

2. **Workflow kernel/hook factory/tool registry kiểu upstream (nguyên cụm)**  
   Lý do: DH runtime route qua Go hooks + dh bridge contracts; port nguyên cụm gây chồng lớp.

3. **Plugin platform đầy đủ (dynamic loading ecosystem)**  
   Lý do: chưa phải nhu cầu P0/P1, tăng độ phức tạp vận hành và khó deterministic.

4. **General shell/project utilities không gắn use-case DH**  
   Lý do: mở rộng bề mặt rủi ro nhưng giá trị thấp; chỉ lấy utility trực tiếp phục vụ indexing/enforcement.

5. **Các thành phần retrieval/embedding trùng pipeline DH hiện có**  
   Lý do: DH đã có retrieval/intelligence path riêng; chỉ lấy ý tưởng thuật toán khi thiếu rõ ràng.

---

## 7) Checklist quyết định trước mỗi đề xuất selective-port

- [ ] Thành phần này giải quyết pain-point thực của DH hiện tại?  
- [ ] Có thể tích hợp vào hook/contract/package hiện có mà không tạo lớp chồng?  
- [ ] Có metric/verification để chứng minh hiệu quả sau khi port?  
- [ ] Có thể triển khai theo slice nhỏ, rollback được?  
- [ ] Không kéo theo phụ thuộc lớn hoặc kiến trúc ngoại lai không cần thiết?  

Nếu trả lời “không” cho >= 2 câu hỏi trên, mặc định **không port**.

---

## 8) Tóm tắt hành động cho team

- Giữ nguyên nguyên tắc: **upstream baseline (Go core) đã đủ tốt, chỉ selective-port phần tạo leverage cao**.
- Tập trung nguồn lực vào 2 trục P0/P1: **tool enforcement + graph intelligence + evidence gating + MCP routing**.
- Tránh mục tiêu “parity đầy đủ với upstream TS”; mục tiêu đúng là **nâng chất lượng runtime DH theo use-case thực**.
