# DH Runtime State Schema

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt schema runtime state cho `dh`, bao gồm:

- session state
- lane lock state
- workflow stage state
- work item state
- execution envelope state
- semantic config state
- tool and skill activation state
- hook state (6 runtime hooks trong forked Go core)

Mục tiêu là biến các contract kiến trúc thành state model rõ ràng, để forked runtime của `dh` có thể thực thi ổn định thay vì chỉ dựa vào prompt hoặc convention ngầm.

Current implementation note:

- Current codebase đã có SQLite bootstrap và các bảng/repositories chính cho sessions, workflow_state, work_items, execution_envelopes, audits, chunks và embeddings.
- File này vẫn là schema-level source of intent; một số domain đề cập ở đây có thể hiện đang được implement một phần hoặc được giản lược trong current runtime path.

## Nguyên tắc nền

1. Lane lock phải được lưu thành state thật, không chỉ giữ trong trí nhớ agent.
2. Session state là source of truth cho workflow mode hiện tại.
3. Work item state phải đủ để điều phối tuần tự và song song.
4. Execution envelope phải là object runtime rõ ràng cho mỗi role dispatch.
5. Semantic mode, skills và MCP activation phải là config/state quan sát được.
6. State phải đủ rõ để resume session mà không làm vỡ workflow contract.

## State Domains

`dh` nên có ít nhất 7 domain state chính ở target architecture:

1. `session_state`
2. `lane_state`
3. `workflow_state`
4. `work_items_state`
5. `execution_envelopes_state`
6. `semantic_state`
7. `tooling_state`
8. `agent_model_assignments_state`

## 1. Session State

Session state là root state của một phiên làm việc.

### Field khuyến nghị

- `session_id`
- `repo_root`
- `lane`
- `lane_locked`
- `current_stage`
- `status`
- `created_at`
- `updated_at`
- `active_work_item_ids`
- `semantic_mode`
- `tool_enforcement_level`

### Shape gợi ý

```ts
type WorkflowLane = "quick" | "delivery" | "migration";

type SessionStatus = "pending" | "in_progress" | "blocked" | "complete";

type SessionState = {
  sessionId: string;
  repoRoot: string;
  lane: WorkflowLane;
  laneLocked: true;
  currentStage: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  activeWorkItemIds: string[];
  semanticMode: "always" | "auto" | "off";
  toolEnforcementLevel: "very-hard";
};
```

## 2. Lane State

Lane state mô tả policy gắn với mode workflow hiện tại.

### Field khuyến nghị

- `lane`
- `locked`
- `entered_by_command`
- `allowed_stage_chain`
- `parallel_execution_allowed`
- `parallel_execution_phase`

### Shape gợi ý

```ts
type LaneState = {
  lane: WorkflowLane;
  locked: true;
  enteredByCommand: "/quick" | "/delivery" | "/migrate" | "dh quick" | "dh delivery" | "dh migrate";
  allowedStageChain: string[];
  parallelExecutionAllowed: boolean;
  parallelExecutionPhases: string[];
};
```

### Contract bắt buộc

1. `locked` phải luôn là `true` sau khi user vào lane.
2. Chỉ user command mới được thay `lane`.
3. Runtime không được mutate lane vì internal heuristic.

## 3. Workflow State

Workflow state mô tả tiến độ theo stage trong lane hiện tại.

### Field khuyến nghị

- `lane`
- `stage`
- `stage_status`
- `previous_stage`
- `next_stage`
- `gate_status`
- `blockers`

### Shape gợi ý

```ts
type StageStatus = "pending" | "in_progress" | "passed" | "failed" | "blocked";

type WorkflowState = {
  lane: WorkflowLane;
  stage: string;
  stageStatus: StageStatus;
  previousStage?: string;
  nextStage?: string;
  gateStatus: "pending" | "pass" | "fail";
  blockers: string[];
};
```

### Stage chains

`quick`:

- `quick_intake`
- `quick_plan`
- `quick_execute`
- `quick_verify`
- `quick_complete`

`delivery`:

- `delivery_intake`
- `delivery_analysis`
- `delivery_solution`
- `delivery_task_split`
- `delivery_execute`
- `delivery_review`
- `delivery_verify`
- `delivery_complete`

`migration`:

- `migration_intake`
- `migration_baseline`
- `migration_strategy`
- `migration_task_split`
- `migration_execute`
- `migration_review`
- `migration_verify`
- `migration_complete`

## 4. Work Items State

`delivery` và `migration` cần work items để điều phối execution.

### Field khuyến nghị

- `id`
- `session_id`
- `lane`
- `title`
- `description`
- `owner_role`
- `dependencies`
- `parallelizable`
- `status`
- `target_areas`
- `acceptance`
- `validation_plan`
- `review_status`
- `test_status`

### Shape gợi ý

```ts
type WorkItemStatus = "pending" | "in_progress" | "done" | "blocked";

type WorkItemState = {
  id: string;
  sessionId: string;
  lane: Exclude<WorkflowLane, "quick">;
  title: string;
  description: string;
  ownerRole: "implementer" | "reviewer" | "tester";
  dependencies: string[];
  parallelizable: boolean;
  status: WorkItemStatus;
  targetAreas: string[];
  acceptance: string[];
  validationPlan: string[];
  reviewStatus: "pending" | "pass" | "fail";
  testStatus: "pending" | "pass" | "fail" | "partial";
};
```

### Contract bắt buộc

1. Work item chỉ được chạy song song nếu `parallelizable = true`.
2. Nếu còn dependency chưa `done`, work item không được `in_progress`.
3. Review và test state phải tách khỏi implement status.

## 5. Execution Envelopes State

Mỗi lần dispatch một role, runtime nên tạo execution envelope rõ ràng.

### Field khuyến nghị

- `id`
- `session_id`
- `lane`
- `role`
- `stage`
- `work_item_id` nullable
- `active_skills`
- `active_mcps`
- `required_tools`
- `semantic_mode`
- `evidence_policy`
- `created_at`

### Shape gợi ý

```ts
type AgentRole =
  | "coordinator"
  | "analyst"
  | "architect"
  | "implementer"
  | "reviewer"
  | "tester";

type ExecutionEnvelopeState = {
  id: string;
  sessionId: string;
  lane: WorkflowLane;
  role: AgentRole;
  agentId: string;
  stage: string;
  workItemId?: string;
  resolvedModel: {
    providerId: string;
    modelId: string;
    variantId: string;
  };
  activeSkills: string[];
  activeMcps: string[];
  requiredTools: string[];
  semanticMode: "always" | "auto" | "off";
  evidencePolicy: "strict";
  createdAt: string;
};
```

### Contract bắt buộc

1. Envelope phải được tạo trước khi role bắt đầu.
2. Nếu thiếu required skill hoặc required MCP route theo policy, envelope chưa hợp lệ.
3. Handoff giữa roles phải tham chiếu được tới envelope trước đó.

## 6. Semantic State

Semantic state điều khiển embedding và semantic retrieval behavior.

### Field khuyến nghị

- `mode`
- `provider`
- `model`
- `last_indexed_at`
- `last_query_embedding_at` nullable
- `embedding_cache_status`

### Shape gợi ý

```ts
type SemanticState = {
  mode: "always" | "auto" | "off";
  provider: "openai";
  model: "text-embedding-3-small";
  lastIndexedAt?: string;
  lastQueryEmbeddingAt?: string;
  embeddingCacheStatus: "cold" | "warm" | "stale";
};
```

### Contract bắt buộc

1. Mặc định `mode = always`.
2. Mặc định `provider = openai`.
3. Mặc định `model = text-embedding-3-small`.
4. User có thể đổi `mode`, nhưng runtime phải lưu thay đổi này thành state thật.

## 7. Agent Model Assignments State

`dh` cần state riêng cho model assignment theo agent.

### Field khuyến nghị

- `agent_id`
- `provider_id`
- `model_id`
- `variant_id`
- `updated_at`

### Shape gợi ý

```ts
type AgentModelAssignmentState = {
  agentId: string;
  providerId: string;
  modelId: string;
  variantId: string;
  updatedAt: string;
};
```

### Contract bắt buộc

1. Assignment phải bám theo `agent identity`, không chỉ theo role.
2. Runtime dispatch phải resolve model từ assignment trước khi agent bắt đầu.
3. Interactive config flow `/config --agent` phải ghi vào state này.

## 8. Tooling State

Tooling state giúp runtime biết skill và MCP nào đang active trong session hoặc envelope.

### Field khuyến nghị

- `active_skills`
- `active_mcps`
- `required_tools`
- `tool_usage_log_ids`
- `skill_activation_log_ids`

### Shape gợi ý

```ts
type ToolingState = {
  activeSkills: string[];
  activeMcps: string[];
  requiredTools: string[];
  toolUsageLogIds: string[];
  skillActivationLogIds: string[];
};
```

## 9. Role Outputs State

Để resume workflow chắc chắn, output của từng role nên được lưu như state hoặc artifact record.

### Coordinator output state

```ts
type CoordinatorOutputState = {
  stage: string;
  nextRole: string | "complete";
  summary: string;
  handoffNotes: string[];
  blockers: string[];
};
```

### Analyst output state

```ts
type AnalystOutputState = {
  problemStatement: string;
  scope: string[];
  outOfScope: string[];
  assumptions: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  risks: string[];
};
```

### Architect output state

```ts
type ArchitectOutputState = {
  solutionSummary: string;
  targetAreas: string[];
  architecturalDecisions: string[];
  sequencing: string[];
  parallelizationRules: string[];
  validationPlan: string[];
  reviewerFocus: string[];
  migrationInvariants?: string[];
};
```

### Implementer output state

```ts
type ImplementerOutputState = {
  status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";
  changedAreas: string[];
  summary: string;
  concerns: string[];
  localVerification: string[];
  reviewNotes: string[];
};
```

### Reviewer output state

```ts
type ReviewerOutputState = {
  status: "PASS" | "PASS_WITH_NOTES" | "FAIL";
  findings: {
    severity: "high" | "medium" | "low";
    location: string;
    summary: string;
    rationale: string;
  }[];
  scopeCompliance: "pass" | "fail";
  qualityGate: "pass" | "fail";
  nextAction: "tester" | "implementer" | "coordinator";
};
```

### Tester output state

```ts
type TesterOutputState = {
  status: "PASS" | "FAIL" | "PARTIAL";
  executedChecks: string[];
  evidence: string[];
  unmetCriteria: string[];
  limitations: string[];
  nextAction: "complete" | "implementer" | "coordinator";
};
```

## 10. Tool Usage Audit State

Vì `dh` dùng `very-hard` tool enforcement, tool usage phải quan sát được.

### Field khuyến nghị

- `id`
- `session_id`
- `envelope_id`
- `role`
- `intent`
- `tool_name`
- `status`
- `timestamp`

### Shape gợi ý

```ts
type ToolUsageAudit = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  intent: string;
  toolName: string;
  status: "called" | "succeeded" | "failed" | "required_but_missing";
  timestamp: string;
};
```

## 11. Skill Activation Audit State

Skill activation cũng cần được lưu để resume và debug planner behavior.

### Shape gợi ý

```ts
type SkillActivationAudit = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  skillName: string;
  activationReason: string;
  timestamp: string;
};
```

## 12. MCP Route Audit State

Vì `dh` muốn dùng MCP nhuần nhuyễn thay vì để đó, MCP route cũng cần được log.

### Shape gợi ý

```ts
type McpRouteAudit = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  mcpName: string;
  routeReason: string;
  timestamp: string;
};
```

## Persistence Guidance

Với `dh`, state có thể được tách thành 3 lớp lưu trữ:

### 1. Session and workflow state

Nên lưu ở file JSON hoặc SQLite metadata tables.

### 2. Index and code intelligence state

Nên lưu ở SQLite và embedding store.

### 3. Audit state (including hook audit)

Nên lưu ở SQLite để dễ query và debug. Hook audit (tool usage audit, skill activation audit, MCP route audit) đặc biệt quan trọng vì chúng chứng minh hooks thực sự fire và enforce policy.

## Hook State

Vì `dh` sở hữu runtime qua fork, 6 hooks tạo ra state riêng cần được observe:

### Hook invocation log

```ts
type HookInvocationLog = {
  id: string;
  sessionId: string;
  envelopeId: string;
  hookName: "model_override" | "pre_tool_exec" | "pre_answer" | "skill_activation" | "mcp_routing" | "session_state";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decision: "allow" | "block" | "modify";
  reason: string;
  durationMs: number;
  timestamp: string;
};
```

Hook invocation logs giúp debug tại sao một tool bị block, tại sao model khác được chọn, hoặc tại sao answer bị gate.

## Resume Contract

Khi resume session, runtime phải khôi phục được ít nhất:

1. lane hiện tại
2. lane lock
3. current stage
4. active work items
5. semantic mode
6. execution envelope gần nhất
7. output của role gần nhất

Nếu thiếu một trong các mảnh này, runtime phải báo degraded resume thay vì đoán tiếp workflow.

## Minimal Schema Set For First Implementation

Nếu cần triển khai tối thiểu trước, nên ưu tiên các bảng hoặc records sau:

1. `sessions`
2. `workflow_state`
3. `work_items`
4. `execution_envelopes`
5. `agent_model_assignments`
6. `tool_usage_audit`
7. `skill_activation_audit`
8. `mcp_route_audit`
9. `role_outputs`
10. `hook_invocation_logs`

## Kết luận

Runtime state schema là phần biến kiến trúc `dh` thành hệ thống có thể resume, audit, enforce và debug. Vì `dh` sở hữu runtime qua fork, state schema phải bao gồm cả hook invocation logs — đây là bằng chứng duy nhất rằng enforcement thực sự xảy ra ở cấp runtime. Nếu lane lock, work items, envelopes, hooks và audits không được lưu thành state thật, toàn bộ orchestration sẽ dễ trượt về mode ngẫu hứng của model thay vì một runtime có kiểm soát.
