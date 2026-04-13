# DH Current-State Snapshot (2026-04-13)

## Mục đích
Tài liệu này là ảnh chụp nhanh trạng thái **hiện tại** của DH sau chuỗi work gần đây, để các session sau có thể nắm bối cảnh kỹ thuật trước khi mở slice mới.

---

## 1) DH hiện tại là gì

DH hiện là một **local-first AI coding assistant** chạy qua CLI, tập trung vào:

- hiểu codebase bằng `ask`, `explain`, `trace`
- index và retrieval đa nguồn (semantic + structural)
- workflow theo 3 lane: `quick`, `delivery`, `migration`
- vận hành/kiểm tra runtime bằng `doctor`

Ở cấp implementation, repo đã có đầy đủ package runtime/app/retrieval/intelligence/storage để chạy end-to-end theo hướng kiến trúc đã chốt.

---

## 2) Những gì đã đạt được ở core runtime

### Core runtime đã usable và có hardening gần đây
- Runtime state và persistence nền đã có (sessions/workflow/audit/chunks/embeddings theo bề mặt hiện tại).
- Luồng retrieval + execution + diagnostics đã có wiring thực tế ở TypeScript-side.
- Chuỗi slice gần đây đã hoàn tất các mảng hardening quan trọng:
  - MCP auth/status lifecycle hardening
  - extension runtime-state fingerprint persistence
  - observability audit query layer
  - extension-state drift reporting
  - operator-safe project/worktree program (kèm quyết định **No-Go** cho việc drift sang full VCS/worktree parity)

### Gate và chất lượng vận hành
- Typecheck/test path đang hoạt động và được dùng xuyên suốt các slice.
- Checklist/program-level closure cho operator-safe layer đã được đánh dấu hoàn tất với boundary rõ ràng (bounded, explainable, có cleanup/reporting).

---

## 3) TS-side architecture hiện tại

Kiến trúc TS hiện tại đã tách lớp tương đối rõ:

- `packages/opencode-app`: planner/executor/workflows/policy orchestration
- `packages/runtime`: session/runtime services, diagnostics, extension/runtime state surfaces
- `packages/retrieval`: retrieval core, normalize/rank/evidence packets
- `packages/intelligence`: parse/symbol/graph extraction path
- `packages/storage`: SQLite repositories cho state/index/audit
- `packages/shared`: shared contracts/types

Trạng thái thực tế: TS-side hiện là nơi triển khai phần lớn enforcement/policy/observability path đang chạy được; đây là nền đã đủ để tiếp tục mở rộng theo slice mà không phải “khởi tạo từ đầu”.

---

## 4) Code understanding / graph / retrieval maturity

Maturity hiện tại ở mức **đủ dùng thực chiến nội bộ**:

- Có indexing path với symbol/chunk/embedding và edge-based signals.
- Có retrieval hybrid (keyword + symbol/AST + semantic + graph expansion theo intent).
- Có semantic mode wiring và retrieval evidence normalization.
- Có cải tiến gần đây về segmentation/path hardening và historical semantic chunk cleanup.

Giới hạn hiện tại: một số phần trong tài liệu kiến trúc vẫn mô tả target-state mở rộng (độ sâu graph, tối ưu scale, enforcement ở process-level), nên không nên hiểu nhầm là đã đạt full production parity ở mọi quy mô codebase.

---

## 5) Session / runtime / MCP / extension maturity

### Session & runtime
- Session/workflow state model đã có nền rõ ràng để resume và theo dõi stage.
- Runtime diagnostics đã có `debug-dump` và surfaces phục vụ inspect.

### MCP
- MCP routing path đã được hardening thêm lifecycle auth/status semantics.
- Enforcer/planner đã có fail-soft/fail-safe handling trong phạm vi đã phê duyệt.

### Extension
- Đã có extension fingerprint + persistence + touch classification (`first/same/updated`).
- Đã có drift reporting additive cho diagnostics/execution boundary (observability-first, không biến thành policy gate).

---

## 6) Observability / operator safety maturity

Đây là vùng tăng trưởng rõ nhất sau chương trình gần đây:

- Có audit query layer phục vụ truy vấn quan sát runtime.
- Có drift reporting cho extension state, giúp operator nhìn biến động có cấu trúc.
- Có operator-safe project/worktree operation layer theo hướng bounded:
  - preflight/prepare/apply/report/cleanup có contract
  - snapshot + restore-light/rollback-light trong giới hạn hỗ trợ
  - temp workspace lifecycle + maintenance utilities
- Có tuyên bố boundary chống scope creep: **không** trở thành full VCS/worktree platform.

---

## 7) DH chưa phải là gì / chưa nên over-claim

1. Chưa phải “full git/worktree platform parity” (đã chốt No-Go ở mức chương trình).
2. Chưa phải hệ thống có mọi runtime guard ở process-level Go core; một phần enforcement vẫn TS-side theo trạng thái hiện tại.
3. Chưa nên over-claim rằng mọi capability trong các tài liệu kiến trúc target-state đã hoàn tất ở mức scale/production rộng.

---

## 8) Ba khoảng trống còn đáng chú ý

1. **Quality gate tooling còn thiếu đồng nhất**: một số slice ghi nhận `tool.rule-scan` chưa khả dụng trong bề mặt runtime hiện tại.
2. **Enforcement depth chưa đồng đều giữa các lớp**: TS-side mạnh, nhưng process-level/runtime-level enforcement toàn diện vẫn còn dư địa.
3. **Scale calibration còn cần thêm evidence dài hạn**: retrieval/graph/observability đã usable, nhưng cần thêm benchmark vận hành ở codebase lớn và dữ liệu telemetry dài hạn.

---

## 9) Ba hướng tiếp theo đáng cân nhắc

1. **Bịt lỗ hổng quality gates**: đưa rule-scan/security-scan vào đường chạy chuẩn để giảm phụ thuộc vào manual evidence.
2. **Chuẩn hoá enforcement đa lớp**: tiếp tục dịch các policy quan trọng từ TS-side xuống runtime hook/process boundary nơi phù hợp.
3. **Tăng độ tin cậy vận hành theo dữ liệu thật**: mở rộng benchmark + telemetry review định kỳ cho retrieval quality, drift signals, và operator-safe outcomes.

---

## Kết luận ngắn

DH hiện đã vượt qua giai đoạn “chỉ có kiến trúc trên giấy”: runtime/retrieval/session/observability đã có nền chạy được và đã qua một chương trình hardening đáng kể. Trạng thái phù hợp để tiếp tục mở các slice nâng chất lượng và độ chắc chắn, miễn là giữ kỷ luật boundary và không over-claim ngoài phạm vi đã kiểm chứng.
