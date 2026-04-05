# DH Model Routing And Agent Config

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt cách `dh` cấu hình model cho từng agent, bao gồm:

- agent model routing qua model selection override hook trong forked Go core
- provider, model, variant registry
- interactive config flow qua `/config --agent`
- persistence của agent model assignment
- quan hệ giữa `agent identity` và `role contract`

`dh` sở hữu toàn bộ model dispatch qua forked OpenCode runtime. Model selection override hook intercept mọi agent dispatch và resolve model từ dh's agent-model-assignment state.

Mục tiêu là để `dh` không dùng một model chung cho mọi agent, mà gán model phù hợp cho từng agent runtime thực sự — enforce ở cấp Go core hook, không chỉ config file.

Current implementation note:

- Hiện tại assignment persistence, model resolution, interactive config flow và runtime-level model override path đã có implementation tương ứng với trạng thái hoàn tất hiện tại của roadmap.
- Các phần trong tài liệu này nên được đọc như source of truth cho behavior và policy, không còn là mô tả của một target architecture chưa được wiring xong.

## Nguyên tắc nền

1. Config model phải theo `agent`, không theo key path kỹ thuật khó nhớ.
2. User không cần nhớ provider, model hay variant IDs trước khi cấu hình.
3. Runtime phải list được agent, provider, model và variant thật sự đang khả dụng.
4. `Agent identity` là bề mặt cấu hình cho user.
5. `Role contract` là bề mặt orchestration nội bộ.
6. Một agent phải có model assignment rõ ràng trước khi dispatch.

## Agent Identity vs Role Contract

`dh` cần tách 2 khái niệm:

### Agent identity

Đây là thứ user nhìn thấy khi config.

Ví dụ:

- `Quick Agent`
- `Coordinator`
- `Analyst`
- `Architect`
- `Implementer`
- `Reviewer`
- `Tester`
- `Fullstack Agent`
- `Code Reviewer`
- `QA Agent`

### Role contract

Đây là thứ runtime dùng để áp policy.

Ví dụ:

- `coordinator`
- `analyst`
- `architect`
- `implementer`
- `reviewer`
- `tester`

### Quy tắc

1. User config theo `agent identity`.
2. Runtime route policy theo `role contract`.
3. Một agent identity phải map rõ ràng về một role contract chính.

## Agent Registry

`dh` cần một agent registry mặc định để config UI và dispatch cùng đọc chung.

### Field khuyến nghị

- `agent_id`
- `display_name`
- `role`
- `lanes`
- `configurable`
- `default_provider`
- `default_model`
- `default_variant`

### Shape gợi ý

```ts
type AgentRegistryEntry = {
  agentId: string;
  displayName: string;
  role: "quick" | "coordinator" | "analyst" | "architect" | "implementer" | "reviewer" | "tester";
  lanes: Array<"quick" | "delivery" | "migration">;
  configurable: boolean;
  defaultProvider?: string;
  defaultModel?: string;
  defaultVariant?: string;
};
```

### Minimal default agents

Ít nhất nên có:

1. `Quick Agent`
2. `Coordinator`
3. `Analyst`
4. `Architect`
5. `Implementer`
6. `Reviewer`
7. `Tester`

Nếu runtime muốn giữ naming gần OpenCode hoặc historical naming, có thể thêm alias như:

1. `Fullstack Agent`
2. `Code Reviewer`
3. `QA Agent`

## Provider Registry

Provider registry phản ánh tất cả provider đang khả dụng trong runtime hiện tại.

### Field khuyến nghị

- `provider_id`
- `display_name`
- `enabled`
- `supports_variants`

### Shape gợi ý

```ts
type ProviderRegistryEntry = {
  providerId: string;
  displayName: string;
  enabled: boolean;
  supportsVariants: boolean;
};
```

### Nguồn dữ liệu

Target source of truth lâu dài là forked OpenCode runtime layer. Trong current codebase, registry vẫn đang được hardcode ở TypeScript/provider layer để unblock config flow và dispatch path trước khi Go/runtime path hoàn tất.

## Model Registry

Mỗi provider cần expose danh sách model khả dụng.

### Field khuyến nghị

- `provider_id`
- `model_id`
- `display_name`
- `available`
- `supports_variants`

### Shape gợi ý

```ts
type ModelRegistryEntry = {
  providerId: string;
  modelId: string;
  displayName: string;
  available: boolean;
  supportsVariants: boolean;
};
```

## Variant Registry

Mỗi model có thể có nhiều variant.

### Ví dụ variant

- `default`
- `high-reasoning`
- `balanced`
- `low-latency`
- `tool-use-optimized`

### Field khuyến nghị

- `provider_id`
- `model_id`
- `variant_id`
- `display_name`
- `available`

### Shape gợi ý

```ts
type VariantRegistryEntry = {
  providerId: string;
  modelId: string;
  variantId: string;
  displayName: string;
  available: boolean;
};
```

## Interactive Config Flow

`dh` cần một flow interactive để user cấu hình model cho agent mà không phải nhớ schema nội bộ.

Current command surface trong code hiện tại:

- `dh config --agent`
- `dh config --verify-agent [quick|delivery|migration]`
- `dh config --semantic [always|auto|off]`
- `dh config --embedding`
- `dh config --show`

Trong đó `--agent` vẫn là flow cấu hình trọng tâm cho per-agent model routing, còn các command còn lại mở rộng cho semantic mode, embedding config và config inspection.

## Command surface

Command chuẩn:

```text
/config --agent
```

Hoặc ở CLI shell mode tương đương:

```bash
dh config --agent
```

Semantics là interactive wizard.

## Flow chi tiết

### Step 1: List agents

Runtime list toàn bộ agent đang có.

Ví dụ:

```text
Select agent:
1. Quick Agent
2. Coordinator
3. Analyst
4. Architect
5. Implementer
6. Reviewer
7. Tester
```

### Step 2: List providers

Sau khi chọn agent, runtime list toàn bộ provider đang có.

Ví dụ:

```text
Select provider:
1. OpenAI
2. Anthropic
3. Google
4. OpenRouter
```

### Step 3: List models

Sau khi chọn provider, runtime list models của provider đó.

Ví dụ:

```text
Select model:
1. claude-opus
2. claude-sonnet
```

### Step 4: List variants

Sau khi chọn model, runtime list variants của model đó.

Ví dụ:

```text
Select variant:
1. default
2. high-reasoning
3. low-latency
```

### Step 5: Persist assignment

Runtime lưu assignment cho agent đó và hiển thị kết quả ngắn gọn.

Ví dụ:

```text
Updated Analyst -> Anthropic / claude-opus / high-reasoning
```

## Agent Model Assignment State

Sau khi config, `dh` phải lưu assignment thành state thật.

### Field khuyến nghị

- `agent_id`
- `provider_id`
- `model_id`
- `variant_id`
- `updated_at`

### Shape gợi ý

```ts
type AgentModelAssignment = {
  agentId: string;
  providerId: string;
  modelId: string;
  variantId: string;
  updatedAt: string;
};
```

### Agent model registry shape

```ts
type AgentModelRegistry = {
  assignments: AgentModelAssignment[];
};
```

## Runtime Dispatch Rule

Khi forked Go core dispatch một agent, model selection override hook gọi vào dh TypeScript logic để resolve model.

### Hook Flow

```text
Go core: about to dispatch agent
-> model_override hook fires
-> calls dh resolveAgentModel(agentID, role, lane)
-> dh reads agent_model_assignments state
-> returns (providerId, modelId, variantId)
-> Go core uses resolved model for LLM call
```

### Dispatch precedence

1. explicit session override nếu có
2. agent model assignment
3. agent default assignment
4. global fallback

### Contract bắt buộc

Nếu agent chưa có assignment và cũng không có default hợp lệ, dispatch không được tiếp tục âm thầm. Runtime phải báo thiếu config hoặc dùng fallback có thông báo rõ.

## Suggested Default Mapping

Từ nhu cầu hiện tại của `dh`, mapping gợi ý có thể là:

- `Analyst` -> `Anthropic / Claude Opus / high-reasoning`
- `Architect` -> `Anthropic / Claude Opus / high-reasoning`
- `Implementer` -> `OpenAI / GPT Codex / default`

Các agent còn lại nên cho phép config riêng bằng cùng flow, không hardcode cứng trong UI.

## Reviewer And Tester Policy

Kiến trúc chuẩn của `dh` vẫn giữ `Reviewer` và `Tester` là 2 agent hoặc 2 role riêng.

Lý do:

- `Reviewer` tập trung vào code correctness, scope compliance, bug/risk
- `Tester` tập trung vào verification evidence, runtime behavior, acceptance criteria

Tuy nhiên runtime có thể cho phép merge ở mode tối ưu chi phí, nhưng config model vẫn nên tách theo agent identity nếu 2 agent cùng tồn tại.

## Config UX Rules

Để command `/config --agent` thực sự usable, cần các rule sau:

1. chỉ list agent đang tồn tại và configurable
2. chỉ list provider đang enabled
3. chỉ list model đang available cho provider đã chọn
4. chỉ list variant đang available cho model đã chọn
5. nếu model không có variant, list `default`
6. sau khi save phải hiển thị assignment mới ngắn gọn

## Persistence Guidance

Agent model assignment về mặt kiến trúc có thể lưu trong:

- SQLite metadata table
- hoặc config file state nếu muốn đơn giản hơn

Current implementation đã dùng SQLite-backed assignment repo; config-file guidance nên được coi là historical fallback hơn là hướng mặc định.

## Relation To Execution Envelope

Execution envelope nên chứa resolved model info tại thời điểm dispatch.

### Gợi ý field bổ sung

```ts
type ResolvedModelSelection = {
  providerId: string;
  modelId: string;
  variantId: string;
};

type ExecutionEnvelope = {
  lane: "quick" | "delivery" | "migration";
  role: string;
  agentId: string;
  resolvedModel: ResolvedModelSelection;
  activeSkills: string[];
  activeMcps: string[];
  requiredTools: string[];
};
```

Điều này giúp audit và resume chính xác hơn.

## Audit Guidance

`dh` nên log ít nhất:

1. agent nào được dispatch
2. provider/model/variant nào được resolve
3. assignment có đến từ explicit override hay default registry

## Kết luận

Model routing của `dh` về target architecture được enforce ở cấp Go core hook — mọi agent dispatch đều đi qua model selection override hook. Ở current implementation, `dh config --agent` đã là command cấu hình trọng tâm để user chọn `agent -> provider -> model -> variant`, assignment được lưu thật và session/runtime TypeScript path đã dùng resolved model đó; phần Go hook enforcement end-to-end vẫn còn pending.
