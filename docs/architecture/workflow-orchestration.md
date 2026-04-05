# DH Workflow Orchestration

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt kiến trúc orchestration cho `dh`, tập trung vào:

- lane model
- lane lock contract
- role topology
- handoff rules
- parallel execution rules
- gating rules giữa các giai đoạn

Đây là tài liệu mô tả cách `dh` vận hành như một AI software factory sở hữu toàn bộ runtime qua fork OpenCode, không chỉ là một công cụ search codebase.

Current implementation note:

- Current codebase đã có lane resolution, lane lock session bootstrap, workflow runners, handoff manager, gate evaluator, dependency-aware planning, execution sequencing và runtime-level enforcement path tương ứng với roadmap hiện tại.
- Các phần trong tài liệu này nên được đọc như hợp đồng orchestration hiện tại cùng với không gian tối ưu hóa tiếp theo, không còn là gap completion của roadmap.

## Nguyên tắc nền

1. Lane là runtime contract, không phải gợi ý mềm.
2. Role boundaries phải rõ dù một runtime có thể dùng cùng một model backend.
3. Analysis và solution design phải đi trước execution.
4. Parallel execution chỉ được phép khi có task decomposition rõ ràng.
5. Tool enforcement và evidence gating áp dụng trong mọi lane.
6. Chỉ user mới được đổi lane.

## Workflow Modes

`dh` có 3 workflow mode chính:

1. `quick`
2. `delivery`
3. `migration`

Mỗi mode là một lane runtime riêng, có topology, policy và mức ceremony khác nhau. Current implementation đã phản ánh model này ở mức roadmap-complete; phần còn lại là tuning và mở rộng theo dữ liệu vận hành thực tế.

## Lane Lock Contract

Khi user vào một lane, session bị khóa vào lane đó cho đến khi user chủ động chọn lane khác.

Ví dụ:

- `/quick` -> session lane = `quick`
- `/delivery` -> session lane = `delivery`
- `/migrate` -> session lane = `migration`

### Quy tắc bắt buộc

1. Orchestrator không được tự ý chuyển lane.
2. Coordinator không được override lane lock.
3. Retry, escalation, failure loops phải ở trong lane hiện tại nếu chưa có chỉ thị mới từ user.
4. Session state phải lưu lane hiện tại như một phần của runtime context.

### Ý nghĩa thực tế

Nếu user chọn `/quick`, hệ thống không được tự suy diễn rằng task này nên chuyển sang `delivery` hay `migration`. Nó chỉ được:

- cảnh báo nếu có rủi ro
- tiếp tục xử lý trong `quick`
- hoặc chờ user đổi lane

Rule này áp dụng tương tự cho mọi lane.

## Runtime State Model

Mỗi session nên có tối thiểu các field sau:

- `session_id`
- `lane`
- `lane_locked`
- `workflow_stage`
- `semantic_mode`
- `repo_root`
- `active_work_item_id` nullable
- `tool_enforcement_level`
- `created_at`
- `updated_at`

### Gợi ý state shape

```ts
type WorkflowLane = "quick" | "delivery" | "migration";

type SessionState = {
  sessionId: string;
  lane: WorkflowLane;
  laneLocked: true;
  workflowStage: string;
  semanticMode: "always" | "auto" | "off";
  repoRoot: string;
  activeWorkItemId?: string;
  toolEnforcementLevel: "very-hard";
  createdAt: string;
  updatedAt: string;
};
```

Schema runtime đầy đủ được chốt trong `docs/architecture/runtime-state-schema.md`.

## Role Topology

`dh` dùng các role chuẩn sau:

1. `Coordinator`
2. `Analyst`
3. `Architect`
4. `Implementer`
5. `Reviewer`
6. `Tester`

Chi tiết contract cho từng role nằm ở `docs/architecture/agent-contracts.md`.

### `Coordinator`

Trách nhiệm:

- giữ lane contract
- giữ nhịp workflow
- điều phối handoff
- theo dõi gating rules
- chia work items cho execution phase

Không làm:

- không tự viết solution nghiệp vụ thay Analyst hoặc Architect
- không can thiệp implementation chi tiết nếu không cần để điều phối

### `Analyst`

Trách nhiệm:

- phân tích yêu cầu user
- làm rõ phạm vi
- xác định assumptions và constraints
- nêu acceptance criteria

### `Architect`

Trách nhiệm:

- đề xuất giải pháp kỹ thuật
- tách task để execution không giẫm chân nhau
- xác định validation strategy
- chỉ ra dependencies, sequencing và risk

### `Implementer`

Trách nhiệm:

- thực hiện code changes theo work item
- tuân thủ boundaries do Architect xác định
- dùng đầy đủ intelligence stack và retrieval rules

### `Reviewer`

Trách nhiệm:

- kiểm tra correctness
- tìm bug, regression, risk
- đánh giá thay đổi có đi đúng giải pháp không

### `Tester`

Trách nhiệm:

- xác minh kết quả runtime
- kiểm tra acceptance criteria
- tổng hợp kết quả verification

## Lane Topology

## `quick`

`quick` có topology đơn giản:

```text
Quick Agent
```

### Quy tắc của `quick`

1. Chỉ có 1 workflow owner agent.
2. Agent này vẫn dùng đầy đủ retrieval, graph, semantic và tool enforcement.
3. Không có multi-role handoff chính thức.
4. Không được tự ý chuyển sang `delivery` hoặc `migration`.

`quick` tối ưu cho task thường ngày, nhưng không bị giảm năng lực đọc hiểu codebase.

## `delivery`

`delivery` có topology chuẩn:

```text
Coordinator
-> Analyst
-> Architect
-> Implementers
-> Reviewers
-> Testers
```

### Quy tắc của `delivery`

1. `Analyst` chỉ bắt đầu sau khi `Coordinator` đã xác nhận lane và bài toán.
2. `Architect` chỉ bắt đầu sau khi output phân tích đủ rõ.
3. `Implementers` chỉ bắt đầu sau khi solution và task decomposition đã rõ.
4. `Reviewers` và `Testers` có thể vào song song theo từng work item nếu việc chia task đủ tốt.
5. Chỉ được đóng workflow khi các gate cuối đã pass.

## `migration`

`migration` có topology giống `delivery`:

```text
Coordinator
-> Analyst
-> Architect
-> Implementers
-> Reviewers
-> Testers
```

### Quy tắc của `migration`

Ngoài các rule của `delivery`, còn có thêm:

1. Mục tiêu ưu tiên là preserve behavior.
2. UI/UX và core logic phải giữ nguyên trừ khi user yêu cầu khác.
3. Risk analysis phải nhấn mạnh compatibility, dependency impact và regression surface.
4. Validation phải xoay quanh equivalence và upgrade safety.

## Stage Model

## `quick` stage chain

Gợi ý stage model:

1. `quick_intake`
2. `quick_plan`
3. `quick_execute`
4. `quick_verify`
5. `quick_complete`

### Ý nghĩa

- `quick_intake`: hiểu yêu cầu và xác nhận lane
- `quick_plan`: chốt objective, acceptance, validation path
- `quick_execute`: thực hiện task
- `quick_verify`: kiểm tra kết quả
- `quick_complete`: tổng hợp output ngắn gọn

## `delivery` stage chain

Gợi ý stage model:

1. `delivery_intake`
2. `delivery_analysis`
3. `delivery_solution`
4. `delivery_task_split`
5. `delivery_execute`
6. `delivery_review`
7. `delivery_verify`
8. `delivery_complete`

## `migration` stage chain

Gợi ý stage model:

1. `migration_intake`
2. `migration_baseline`
3. `migration_strategy`
4. `migration_task_split`
5. `migration_execute`
6. `migration_review`
7. `migration_verify`
8. `migration_complete`

## Handoff Rules

Handoff chỉ hợp lệ khi output của stage trước đủ điều kiện cho stage sau.

### `Coordinator -> Analyst`

Đầu vào bắt buộc:

- lane đã khóa
- repo target rõ
- user intent rõ ở mức đủ để phân tích

### `Analyst -> Architect`

Đầu vào bắt buộc:

- bài toán đã được diễn giải rõ
- constraints và assumptions đã được ghi nhận
- acceptance criteria đủ rõ

### `Architect -> Implementers`

Đầu vào bắt buộc:

- solution direction đã chốt
- task decomposition đã rõ
- dependencies giữa tasks đã rõ
- task nào chạy song song được đã được đánh dấu

### `Implementers -> Reviewers`

Đầu vào bắt buộc:

- work item hoàn tất theo scope
- citations hoặc change summary đủ để review
- validation cục bộ của implementer đã xong hoặc đã nêu rõ thiếu gì

### `Reviewers -> Testers`

Đầu vào bắt buộc:

- review findings đã được xử lý hoặc chấp nhận rõ ràng
- review gate không còn blocker

## Parallel Execution Rules

Parallel execution chỉ áp dụng ở execution phase và verification phase, không áp dụng cho analysis hoặc solution design.

### Cho phép song song khi

1. tasks có file boundaries hoặc module boundaries rõ
2. không có dependency trực tiếp giữa tasks
3. Architect đã xác định sequencing rõ ràng
4. Coordinator đã cấp work items riêng biệt

### Không cho phép song song khi

1. nhiều task sửa cùng một symbol hoặc cùng một module boundary quan trọng
2. solution chưa chốt xong
3. acceptance criteria còn mơ hồ
4. migration sequencing còn chưa rõ

### Ý nghĩa thực tế

`dh` không song song hóa vì tiện. Nó chỉ song song khi decomposition đủ tốt để tránh đạp chân nhau.

## Work Item Model

Trong `delivery` và `migration`, execution nên được chia thành `work items`.

Mỗi work item nên có:

- `id`
- `title`
- `description`
- `owner_role`
- `dependencies`
- `parallelizable`
- `status`
- `acceptance`
- `validation_plan`

### Gợi ý shape

```ts
type WorkItem = {
  id: string;
  title: string;
  description: string;
  ownerRole: "implementer" | "reviewer" | "tester";
  dependencies: string[];
  parallelizable: boolean;
  status: "pending" | "in_progress" | "done" | "blocked";
  acceptance: string[];
  validationPlan: string[];
};
```

## Tool Enforcement Across Lanes

Mức tool enforcement của `dh` là `very hard` trong mọi lane.

### Điều này có nghĩa

1. Query không được finalize nếu thiếu required tools theo intent.
2. Query không được finalize nếu evidence score dưới ngưỡng.
3. Agent không được trả lời kiểu đoán cho các câu hỏi code understanding.
4. Retry phải diễn ra trong lane hiện tại.

### Theo lane

`quick`:

- enforcement áp dụng cho 1 agent owner

`delivery` và `migration`:

- enforcement áp dụng ở từng role khi role đó cần code understanding
- coordinator còn phải enforce gating giữa các stage

## Gate Model

## Gate 1: Intake Gate

Điều kiện:

- lane rõ
- repo rõ
- objective rõ ở mức đủ để tiếp tục

## Gate 2: Analysis Gate

Điều kiện:

- requirements đã rõ
- assumptions đã được nêu
- acceptance criteria đủ dùng

## Gate 3: Solution Gate

Điều kiện:

- giải pháp kỹ thuật rõ
- decomposition rõ
- sequencing rõ
- validation path rõ

## Gate 4: Review Gate

Điều kiện:

- findings blocker đã được xử lý
- không còn risk nghiêm trọng chưa được nêu

## Gate 5: Verification Gate

Điều kiện:

- validation đã chạy hoặc thiếu tooling đã được nêu rõ
- output cuối phù hợp acceptance criteria

## Failure and Retry Loops

`dh` cần loop trong lane hiện tại thay vì tự nhảy lane.

### Trong `quick`

- nếu retrieval yếu -> retry retrieval plan
- nếu implementation fail -> fix và verify lại
- nếu verification fail -> quay lại execute

### Trong `delivery`

- nếu analysis chưa rõ -> quay lại analysis
- nếu solution chưa ổn -> quay lại architect
- nếu review fail -> quay lại implementers
- nếu verify fail -> quay lại execution hoặc review tùy nguyên nhân

### Trong `migration`

- nếu baseline chưa đủ -> quay lại baseline
- nếu strategy chưa an toàn -> quay lại strategy
- nếu regression xuất hiện -> quay lại execute hoặc solution tùy mức độ

## Forked OpenCode Runtime Integration

`dh` sở hữu toàn bộ runtime qua fork OpenCode (Go core + TypeScript SDK). Không còn ranh giới "OpenCode chịu trách nhiệm X, dh chịu trách nhiệm Y". Thay vào đó, toàn bộ là dh, với 6 hook points cho phép dh application layer kiểm soát mọi quyết định runtime.

### Forked Go core chịu trách nhiệm

- process orchestration
- model dispatch (overridden bởi model selection hook)
- tool execution surface (gated bởi pre-tool-exec hook)
- LLM streaming (gated bởi pre-answer hook)
- session environment (injected bởi session state hook)
- MCP connections (routed bởi MCP routing hook)
- skill context (managed bởi skill activation hook)

### dh application layer chịu trách nhiệm (gọi qua hooks)

- lane model và lane lock policy
- role topology
- handoff rules
- tool enforcement policy
- retrieval planning policy
- context and evidence policy
- skill activation policy
- MCP routing policy
- model selection per agent identity
- answer gating và confidence validation

Đây là điểm kiểm soát sâu nhất — mọi quyết định đi qua hook thật trong Go core, không phải qua config injection hay IPC.

Chi tiết quyết định fork: `docs/architecture/opencode-integration-decision.md`.

## CLI Surface For Workflow

`dh` nên hỗ trợ hybrid command surface.

### Lane entry commands

```bash
dh quick "<task>"
dh delivery "<goal>"
dh migrate "<upgrade goal>"
```

Các command này có tác dụng:

1. set lane
2. lock session vào lane đó
3. khởi tạo stage chain tương ứng

### Infra and knowledge commands

```bash
dh ask "how auth works"
dh explain login
dh trace payment.checkout
dh index
dh doctor
dh config set semantic.mode auto
```

Các command này phục vụ knowledge flow và runtime operations. Khi chạy trong session đang khóa lane, chúng phải tuân theo lane hiện tại.

## Kết luận

Kiến trúc orchestration của `dh` dựa trên 4 trụ cột:

1. lane lock không được vi phạm
2. role topology rõ và có handoff chuẩn
3. analysis và solution đi trước execution
4. parallel execution chỉ xảy ra khi decomposition đủ tốt

Nếu thiếu một trong các phần này, `dh` sẽ chỉ còn là chat tool có nhiều prompt, thay vì một AI software factory thật sự có kỷ luật vận hành.
