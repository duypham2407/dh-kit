# DH Agent Contracts

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt contract cho các agent role trong `dh`, bao gồm:

- nhiệm vụ của từng role
- input contract
- output contract
- pass/fail rules
- handoff expectations
- skill và MCP activation mặc định theo role

Mục tiêu là để `dh` không chỉ có workflow topology trên giấy, mà còn có ranh giới vận hành rõ giữa các agent trong từng lane — enforce qua forked runtime hooks.

Current implementation note:

- Current codebase đã có role contracts/types, role stubs, workflow runners, persisted execution envelopes và role outputs ở TypeScript/runtime path.
- Tài liệu này vẫn mô tả contract mục tiêu đầy đủ; một số role behaviors hiện mới ở mức basic orchestration chứ chưa đạt topology depth cuối cùng.

## Nguyên tắc chung

1. Mỗi role có một trách nhiệm chính, không được tràn vai vô tội vạ.
2. Mỗi role phải nhận input có cấu trúc và trả output có cấu trúc.
3. Handoff chỉ hợp lệ khi output đủ điều kiện cho role tiếp theo.
4. Mọi role làm code understanding đều phải chịu `very-hard` tool enforcement.
5. Skill activation và MCP routing là một phần của role contract.
6. Output cho user có thể ngắn, nhưng output nội bộ giữa roles phải đủ rõ để tiếp sức cho bước sau.

## Role Set

`dh` dùng 6 role chuẩn:

1. `Coordinator`
2. `Analyst`
3. `Architect`
4. `Implementer`
5. `Reviewer`
6. `Tester`

## Execution Envelope

Mỗi role nên được khởi chạy với một execution envelope thống nhất.

```ts
type AgentRole =
  | "coordinator"
  | "analyst"
  | "architect"
  | "implementer"
  | "reviewer"
  | "tester";

type ExecutionEnvelope = {
  lane: "quick" | "delivery" | "migration";
  role: AgentRole;
  agentId: string;
  sessionId: string;
  repoRoot: string;
  semanticMode: "always" | "auto" | "off";
  resolvedModel: {
    providerId: string;
    modelId: string;
    variantId: string;
  };
  activeSkills: string[];
  activeMcps: string[];
  requiredTools: string[];
  workItemId?: string;
  stage: string;
  evidencePolicy: "strict";
};
```

Mọi role contract bên dưới đều giả định envelope này đã có sẵn.

Model selection theo agent về target architecture được enforce qua model selection override hook trong forked Go core. Current implementation đã resolve model trong TS/runtime path; chi tiết tại `docs/architecture/model-routing-and-agent-config.md` và `docs/architecture/opencode-integration-decision.md`.

## `Coordinator`

### Mục tiêu

Giữ nhịp workflow, giữ đúng lane, phân phối công việc và đảm bảo gates không bị bỏ qua.

### Trách nhiệm

- xác nhận lane hiện tại
- enforce lane lock
- chọn stage hiện tại và stage kế tiếp
- điều phối handoff giữa roles
- xác định khi nào được phép tách task song song
- giữ workflow bám đúng objective user

### Không làm

- không tự thay Analyst phân tích yêu cầu sâu
- không tự thay Architect thiết kế giải pháp chi tiết
- không tự code thay Implementer trừ khi lane là `quick`

### Input contract

Coordinator nhận:

- user goal hoặc lane command
- session state
- lane lock state
- repo target
- output của role trước nếu có

### Output contract

Coordinator phải trả một record có cấu trúc như sau:

```ts
type CoordinatorOutput = {
  lane: "quick" | "delivery" | "migration";
  stage: string;
  nextRole: AgentRole | "complete";
  summary: string;
  handoffNotes: string[];
  workItems?: WorkItem[];
  blockers?: string[];
};
```

### Pass condition

- lane đúng và không vi phạm lane lock
- next stage rõ
- next role rõ
- handoff notes đủ để vai sau làm việc

### Fail condition

- mơ hồ về lane
- chuyển stage khi gate trước chưa pass
- giao task song song khi chưa có decomposition rõ

### Default skills

- `using-skills`
- `verification-before-completion` khi chuẩn bị đóng gate hoặc workflow

### Default MCP emphasis

- không ưu tiên MCP research nặng, trừ khi cần để xác nhận route
- có thể dùng `context7` hoặc `websearch` nếu cần xác nhận external dependency risk ở mức điều phối

## `Analyst`

### Mục tiêu

Biến yêu cầu user thành bài toán rõ ràng với scope, assumptions, constraints và acceptance criteria.

### Trách nhiệm

- phân tích yêu cầu
- làm rõ ambiguity
- xác định phạm vi
- nêu assumptions và constraints
- xác định acceptance criteria
- xác định risk sơ bộ

### Input contract

Analyst nhận:

- user request gốc
- repo context
- lane hiện tại
- session context từ Coordinator

### Output contract

```ts
type AnalystOutput = {
  problemStatement: string;
  scope: string[];
  outOfScope: string[];
  assumptions: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  risks: string[];
  recommendedNextRole: "architect" | "coordinator";
};
```

### Pass condition

- bài toán rõ
- acceptance criteria đủ cụ thể
- assumptions và constraints đã ghi nhận

### Fail condition

- chỉ lặp lại yêu cầu user mà không làm rõ bài toán
- acceptance quá mơ hồ để architect thiết kế

### Default skills

- `using-skills`
- `codebase-exploration`
- `brainstorming` khi bài toán còn mơ hồ

### Default MCP emphasis

- `augment_context_engine` cho codebase understanding
- `context7`, `websearch`, `grep_app` khi bài toán phụ thuộc framework/tooling ngoài codebase

## `Architect`

### Mục tiêu

Thiết kế giải pháp kỹ thuật có thể thực thi, review và verify được.

### Trách nhiệm

- chọn hướng giải pháp
- xác định file/module/symbol bị ảnh hưởng
- chia work items
- xác định task nào song song được
- xác định validation plan
- đặc biệt với `migration`, phải bảo vệ invariants về UI/UX và core logic

### Input contract

Architect nhận:

- `AnalystOutput`
- repo/codebase evidence
- lane hiện tại
- risk notes nếu có

### Output contract

```ts
type ArchitectOutput = {
  solutionSummary: string;
  targetAreas: string[];
  architecturalDecisions: string[];
  workItems: WorkItem[];
  sequencing: string[];
  parallelizationRules: string[];
  validationPlan: string[];
  reviewerFocus: string[];
  migrationInvariants?: string[];
};
```

### Pass condition

- solution rõ và executable
- work items đủ tách bạch
- sequencing và parallelization rules rõ
- validation plan thực tế

### Fail condition

- giải pháp mang tính essay, không executable
- task split mơ hồ
- không nêu validation plan thật

### Default skills

- `using-skills`
- `codebase-exploration`
- `writing-solution`
- `deep-research` khi cần external research

### Default MCP emphasis

- `augment_context_engine`
- `context7`
- `grep_app`
- `websearch`

## `Implementer`

### Mục tiêu

Thực hiện work item bằng thay đổi tối thiểu đúng scope, dùng đầy đủ intelligence stack và validation model phù hợp lane.

### Trách nhiệm

- đọc work item và scope liên quan
- dùng retrieval/intelligence để hiểu đúng code
- thực hiện code changes
- tự kiểm tra ở mức work item
- chuẩn bị change summary đủ cho review

### Input contract

Implementer nhận:

- `ArchitectOutput`
- `WorkItem`
- target files hoặc target areas
- validation plan của work item

### Output contract

```ts
type ImplementerOutput = {
  status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";
  workItemId: string;
  changedAreas: string[];
  summary: string;
  concerns: string[];
  localVerification: string[];
  reviewNotes: string[];
};
```

### Pass condition

- đúng scope
- không vượt ra ngoài work item vô cớ
- đã có local verification hoặc nêu rõ limitation

### Fail condition

- đoán context khi thiếu thông tin
- thay đổi lan rộng ngoài work item mà không escalation
- báo done mà không có verification note

### Default skills

- `using-skills`
- `subagent-driven-development` khi lane là `delivery` hoặc `migration`
- `test-driven-development` khi lane là `delivery` và repo có test path phù hợp
- `refactoring` khi work item là restructure/cleanup

### Default MCP emphasis

- `augment_context_engine`
- `context7` khi thay đổi có library/framework dependency
- `chrome-devtools` hoặc `playwright` nếu work item có browser behavior

## `Reviewer`

### Mục tiêu

Tìm bug, risk, regression và lệch scope trước khi task hoặc workflow được coi là an toàn.

### Trách nhiệm

- review correctness
- review scope compliance
- review quality/risk
- nêu findings có mức độ ưu tiên

### Input contract

Reviewer nhận:

- `ImplementerOutput`
- changed areas
- work item context
- architect reviewer focus

### Output contract

```ts
type ReviewFinding = {
  severity: "high" | "medium" | "low";
  location: string;
  summary: string;
  rationale: string;
};

type ReviewerOutput = {
  status: "PASS" | "PASS_WITH_NOTES" | "FAIL";
  findings: ReviewFinding[];
  scopeCompliance: "pass" | "fail";
  qualityGate: "pass" | "fail";
  nextAction: "tester" | "implementer" | "coordinator";
};
```

### Pass condition

- không còn finding blocker
- scope compliance pass
- quality gate pass

### Fail condition

- có blocker chưa xử lý
- thay đổi lệch solution
- không đủ evidence để review chắc chắn

### Default skills

- `using-skills`
- `code-review`
- `verification-before-completion`

### Default MCP emphasis

- `augment_context_engine`
- `context7` khi review liên quan API/library correctness

## `Tester`

### Mục tiêu

Xác minh behavior và acceptance criteria bằng evidence mới.

### Trách nhiệm

- chạy verification path thật
- so acceptance criteria với evidence
- báo rõ pass/fail và limitation
- trong `migration`, tập trung vào preserved behavior và compatibility

### Input contract

Tester nhận:

- output từ Reviewer
- acceptance criteria
- validation plan
- runtime verification path

### Output contract

```ts
type TesterOutput = {
  status: "PASS" | "FAIL" | "PARTIAL";
  executedChecks: string[];
  evidence: string[];
  unmetCriteria: string[];
  limitations: string[];
  nextAction: "complete" | "implementer" | "coordinator";
};
```

### Pass condition

- acceptance criteria đã được đối chiếu với evidence phù hợp
- limitation đã được nêu rõ nếu tooling thiếu

### Fail condition

- nói pass mà không có evidence mới
- không phân biệt rõ fail do code hay do thiếu tooling

### Default skills

- `using-skills`
- `verification-before-completion`
- `browser-automation` hoặc `dev-browser` khi có browser path

### Default MCP emphasis

- `chrome-devtools`
- `playwright`
- `websearch` khi cần xác nhận behavior kỳ vọng do external platform changes

## `Quick Agent`

Trong lane `quick`, `dh` không tách thành nhiều role runtime riêng. Tuy nhiên, `Quick Agent` về mặt contract phải thực hiện gộp các bước:

- coordinator lite
- analyst lite
- architect lite
- implementer
- reviewer lite
- tester lite

### Contract của `Quick Agent`

`Quick Agent` vẫn phải:

1. xác nhận lane lock
2. phân tích task
3. lên plan gọn
4. thực thi
5. verify
6. báo kết quả ngắn gọn

### Quick output contract

```ts
type QuickOutput = {
  summary: string;
  changedAreas?: string[];
  evidence: string[];
  risks: string[];
  status: "PASS" | "FAIL" | "PARTIAL";
};
```

## Handoff Contract Summary

### Coordinator -> Analyst

Phải có:

- lane
- session state
- user objective
- repo target

### Analyst -> Architect

Phải có:

- problem statement
- scope
- assumptions
- constraints
- acceptance criteria

### Architect -> Implementer

Phải có:

- solution summary
- work item
- target areas
- sequencing notes
- validation plan

### Implementer -> Reviewer

Phải có:

- changed areas
- summary
- concerns
- local verification notes

### Reviewer -> Tester

Phải có:

- findings
- gate status
- reviewer focus and residual risks

## Status Language Contract

Để orchestration ổn định, `dh` nên chuẩn hóa status strings.

### Implementer

- `DONE`
- `DONE_WITH_CONCERNS`
- `NEEDS_CONTEXT`
- `BLOCKED`

### Reviewer

- `PASS`
- `PASS_WITH_NOTES`
- `FAIL`

### Tester

- `PASS`
- `PARTIAL`
- `FAIL`

### Workflow

- `pending`
- `in_progress`
- `blocked`
- `complete`

## Escalation Rules

### Escalate back to `Coordinator` when

1. lane conflict xuất hiện
2. work item bị block vì scope hoặc dependency
3. nhiều task tưởng độc lập nhưng bắt đầu đạp chân nhau
4. role hiện tại không đủ context để quyết định tiếp

### Escalate back to `Architect` when

1. solution không còn phù hợp thực tế codebase
2. implementer phát hiện task split sai
3. reviewer phát hiện design flaw thay vì local bug

### Escalate back to `Analyst` when

1. acceptance criteria không đủ rõ
2. user intent mâu thuẫn với scope đang thực thi

## Skills And MCP As Contract, Not Hint — Enforced Via Hooks

Nếu role yêu cầu skill hoặc MCP theo policy mà planner không attach, role đó chưa được coi là khởi tạo hợp lệ.

Enforcement đi qua 2 hooks trong forked Go core:

1. **Skill activation hook**: kiểm tra active skills phù hợp lane/role/intent trước khi agent bắt đầu
2. **MCP routing hook**: kiểm tra MCP priority và blocking phù hợp task type

Điều này có nghĩa:

- role contract bao gồm cả execution envelope
- execution envelope bao gồm active skills và active MCPs
- planner phải tạo envelope đúng trước khi dispatch role
- hooks validate envelope tại Go core level — không phải chỉ ở TypeScript

## Kết luận

Agent contracts là phần biến lane topology của `dh` thành một hệ thống thật có thể vận hành. Nếu không có input/output contract, status contract và escalation rules rõ ràng, orchestration sẽ sớm biến thành chuỗi prompt mơ hồ thay vì một workflow engine có kỷ luật. Với forked runtime, contracts được enforce ở cấp Go hooks — không có đường tắt.
