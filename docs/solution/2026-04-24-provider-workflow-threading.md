---
artifact_type: solution_package
version: 1
status: draft
feature_id: PROVIDER-WORKFLOW-THREADING
feature_slug: provider-workflow-threading
source_scope_package: docs/scope/2026-04-24-provider-workflow-threading.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Provider Workflow Threading

**Date:** 2026-04-24
**Approved scope:** `docs/scope/2026-04-24-provider-workflow-threading.md`
**Related prior solution:** `docs/solution/2026-04-11-session-runtime-selective-port-dh.md`

## Recommended Path

Tighten the existing provider-threading implementation rather than redesigning providers: keep `runLaneWorkflow()` as the only production provider factory boundary for lane workflows, always derive default provider creation from the session execution envelope's `resolvedModel`, decorate that base provider once with `createRetryingChatProvider()`, and pass the decorated provider into quick, delivery/full, and migration workflow/team-role calls.

This is enough because repository reality already has the main abstractions and partial threading in place:

- `ChatProvider` and provider errors: `packages/providers/src/chat/types.ts`
- default factory: `packages/providers/src/chat/create-chat-provider.ts`
- retry wrapper: `packages/runtime/src/reliability/retrying-chat-provider.ts`
- lane workflow entrypoint: `packages/opencode-app/src/workflows/run-lane-command.ts`
- lane workflows: `packages/opencode-app/src/workflows/{quick,delivery,migration}.ts`
- team roles that accept `provider?: ChatProvider`: `packages/opencode-app/src/team/{coordinator,analyst,architect,implementer,reviewer,tester}.ts`

The implementation should close gaps by making the ownership rules explicit in code/tests, adding coverage for all active lane paths, and documenting intentional non-provider surfaces. It must not add vendors, change model policy, rewrite the session runtime, or change lane/stage semantics.

## Current-State Inventory

### Active provider-backed lane path

| Surface | Current finding | Solution consequence |
|---|---|---|
| `packages/opencode-app/src/workflows/run-lane-command.ts` | Accepts `provider?: ChatProvider`; reads or creates session; selects the execution envelope; creates `baseProvider = input.provider ?? createChatProvider(envelope.resolvedModel)`; wraps with `createRetryingChatProvider`; passes provider into quick/delivery/migration. | Keep this as the production workflow provider boundary. Strengthen tests around default creation, injection preservation, retry audit, and resume behavior. |
| `packages/opencode-app/src/workflows/quick.ts` | Accepts optional provider and passes it to `runCoordinator`. | Keep simple; add a quick injection test that asserts injected provider is called and default factory is not needed. |
| `packages/opencode-app/src/workflows/delivery.ts` | Accepts optional provider and passes it to coordinator, analyst, architect, implementer, reviewer, tester. | Keep central pass-through; add delivery-path injected-provider assertions for all provider-backed roles that execute in current workflow. |
| `packages/opencode-app/src/workflows/migration.ts` | Accepts optional provider and passes it to coordinator, architect, implementer, reviewer, tester. | Keep central pass-through; add migration-path injected-provider assertions for all provider-backed roles that execute in current workflow. |
| `packages/opencode-app/src/team/*.ts` | Team role functions accept provider and fall back to deterministic local output when provider is absent or parsing fails. No direct `createChatProvider` calls found in active team modules. | Roles should remain consumers only. Do not move factory or retry logic into roles. |
| `packages/runtime/src/reliability/retrying-chat-provider.ts` | Wraps a base provider, retries retryable errors via `retry-policy`, and supports optional retry/give-up audit callbacks. | Keep retry centralized here. Use workflow boundary audit hooks rather than duplicating retry handling in roles. |

### Known non-lane / intentionally out-of-scope surfaces

| Surface | Reason it remains out of this feature unless implementation finds a concrete bypass |
|---|---|
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` | Knowledge commands use a Rust/JSON-RPC knowledge bridge, not `ChatProvider` chat calls. Do not convert `ask`/`explain`/`trace` into session-backed chat workflows in this feature. |
| `packages/retrieval/src/semantic/*` | Uses `EmbeddingProvider`, not `ChatProvider`; outside chat-provider workflow threading. |
| `packages/providers/src/chat/{openai-chat,anthropic-chat,mock-chat,create-chat-provider}.ts` | Provider package owns provider construction and provider-specific error metadata. Do not alter vendor set or model policy except for narrow test seams if needed. |
| `packages/providers/src/registry/provider-registry.ts` | Provider registry surface is not the lane workflow factory boundary. Do not route lane workflows through a new registry unless a current code blocker is proven. |

Implementation must re-run this inventory before editing. Any newly discovered production `createChatProvider()` call outside provider tests and `runLaneWorkflow()` must either be removed in favor of injected provider flow or documented as an intentional non-workflow provider boundary.

## Impacted Surfaces

### Exact files likely to inspect/edit

| File | Inspect | Likely edit | Purpose |
|---|---:|---:|---|
| `packages/opencode-app/src/workflows/run-lane-command.ts` | yes | maybe | Confirm it remains the sole lane workflow provider factory/wrapper boundary; add a small injectable factory seam only if tests cannot assert default factory behavior otherwise. |
| `packages/opencode-app/src/workflows/run-lane-command.test.ts` | yes | yes | Add/strengthen tests for injected provider preservation, retry wrapping, retry audit evidence, default factory behavior, and resume model preservation. |
| `packages/opencode-app/src/workflows/quick.ts` | yes | maybe | Preserve provider pass-through to `runCoordinator`; avoid adding factory/retry here. |
| `packages/opencode-app/src/workflows/delivery.ts` | yes | maybe | Preserve provider pass-through to all delivery roles; only edit if a role misses provider propagation. |
| `packages/opencode-app/src/workflows/migration.ts` | yes | maybe | Preserve provider pass-through to all migration roles; only edit if a role misses provider propagation. |
| `packages/opencode-app/src/workflows/workflows.test.ts` | yes | yes | Add direct workflow tests with counting providers for quick, delivery, and migration role paths. |
| `packages/opencode-app/src/team/coordinator.ts` | yes | no unless gap found | Team role provider consumer; must not construct providers. |
| `packages/opencode-app/src/team/analyst.ts` | yes | no unless gap found | Team role provider consumer; must not construct providers. |
| `packages/opencode-app/src/team/architect.ts` | yes | no unless gap found | Team role provider consumer; must not construct providers. |
| `packages/opencode-app/src/team/implementer.ts` | yes | no unless gap found | Team role provider consumer; must not construct providers. |
| `packages/opencode-app/src/team/reviewer.ts` | yes | no unless gap found | Team role provider consumer; must not construct providers. |
| `packages/opencode-app/src/team/tester.ts` | yes | no unless gap found | Team role provider consumer; must not construct providers. |
| `packages/opencode-app/src/team/team.test.ts` | yes | maybe | Keep role-level tests focused on injected providers and fallback parsing behavior. |
| `packages/runtime/src/reliability/retrying-chat-provider.ts` | yes | maybe | Confirm non-retryable/give-up behavior and provider identity expectations; avoid policy redesign. |
| `packages/runtime/src/reliability/retrying-chat-provider.test.ts` | yes | yes | Add/confirm retryable, non-retryable, and audit callback behavior. |
| `packages/runtime/src/reliability/retry-policy.ts` | yes | no unless bug found | Preserve existing retry classification; no policy expansion unless current tests expose mismatch. |
| `packages/providers/src/chat/create-chat-provider.ts` | yes | no | Existing model-selection factory; no vendor/model changes. |
| `packages/providers/src/chat/chat.test.ts` | yes | maybe | Keep factory/model fallback tests; add only if default behavior is insufficiently covered. |
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` | yes | no | Document/verify it is bridge-backed, not chat-provider backed. |

### Boundaries and ownership

| Owner | Responsibilities | Must not do |
|---|---|---|
| `packages/opencode-app/src/workflows/run-lane-command.ts` | Production lane workflow provider boundary: choose base provider from injection or `createChatProvider(envelope.resolvedModel)`, wrap once with `createRetryingChatProvider`, wire audit callbacks, pass wrapped provider to lane workflow. | Must not select a new model, add vendors, duplicate retry logic, or ignore `input.provider`. |
| `packages/opencode-app/src/workflows/{quick,delivery,migration}.ts` | Receive already-prepared provider and pass it to provider-backed team roles. | Must not call `createChatProvider()` or `createRetryingChatProvider()`. |
| `packages/opencode-app/src/team/*.ts` | Consume `ChatProvider` through `provider.chat()` when supplied; deterministic fallback remains allowed when provider absent or invalid response is caught. | Must not construct providers, resolve models, or implement retries. |
| `packages/runtime/src/reliability/*` | Own retry classification and retrying provider behavior. | Must not know lane/stage semantics or construct vendor providers. |
| `packages/providers/src/chat/*` | Own provider implementations, factory behavior, structured provider error metadata. | Must not know workflow stages or test-specific workflow injection. |

## Provider Factory vs Injected Provider Ownership Rules

1. **Default production creation:** `runLaneWorkflow()` may create a base provider only when no explicit `input.provider` is supplied.
2. **Model authority:** default creation must use `envelope.resolvedModel` from the created or resumed session. Do not add a second model-resolution path, override, or provider-selection rule.
3. **Injection authority:** when `input.provider` exists, it is the base provider. The workflow must not call `createChatProvider()` for that execution path.
4. **Retry boundary:** both injected and default base providers are decorated once at the lane workflow boundary using `createRetryingChatProvider()`.
5. **Downstream contract:** lane workflows and team roles receive the decorated provider. They never receive a factory and never select vendors/models independently.
6. **Provider identity:** `createRetryingChatProvider()` may expose decorated identity as `${base.providerId}:retry`; audit events should record the base `providerId` as currently implemented so failures remain traceable.

## Production vs Test Responsibilities

### Production

- Keep default behavior unchanged: session creation/resume decides the execution envelope; `envelope.resolvedModel` drives `createChatProvider()`; missing API key fallback remains whatever `createChatProvider()` currently implements.
- Keep lane/stage/report behavior unchanged: no new lane names, no stage-order changes, no workflow-state schema changes.
- Record retry attempt/give-up events through existing `WorkflowAuditService.recordRuntimeEvent()` hooks when available.
- Continue deterministic role fallback behavior where it currently exists. Do not broaden this feature into strict provider-failure semantics unless required to preserve existing behavior.

### Tests

- Use injected mock/flaky `ChatProvider` objects; never require real OpenAI, Anthropic, or other external API calls.
- Assert injected provider preservation by observing call counts and/or provider IDs, not by reaching into vendor internals.
- Assert default provider behavior by using the existing factory/model output path or a narrow test seam; do not add a production-only fake model resolver.
- Add tests that cover quick, delivery/full, and migration active provider-backed paths.
- Add retry tests for retryable success-after-retry, retry exhaustion/give-up, and non-retryable no-retry behavior.

## Retrying-Provider Behavior Expectations

- `createRetryingChatProvider(base, options)` remains the only shared chat retry adapter.
- Retryable errors are exactly those classified by `retry-policy.ts`; this feature must not invent new retry policy semantics unless a current bug is found and covered.
- Retry attempts call `audit.onRetryAttempt` with base provider ID, attempt number, delay, and error message before sleeping.
- Exhausted retryable errors and non-retryable errors surface to the caller after `onRetryGiveUp` when configured.
- Optional audit sinks must be non-required: absence of audit callbacks must not break provider execution.
- Team roles must not implement retry loops. They should simply call `provider.chat()` and preserve existing fallback handling.

## Risks And Trade-offs

| Risk | Why it matters | Mitigation |
|---|---|---|
| Existing team roles catch provider errors and fallback, which may hide final retry failure from lane-level report output. | AC-6 requires failures not be masked as success; current fallback behavior is existing behavior and may conflict with stronger failure semantics. | Preserve current behavior unless scope owner approves changing role failure semantics. At minimum, assert retry wrapper call counts and retry audit/give-up evidence. If implementation finds final provider errors are silently swallowed, document as a remaining behavior-preservation limitation rather than redesigning roles. |
| Tests accidentally validate fallback behavior instead of provider threading. | A malformed mock JSON can make provider calls happen but still fallback, hiding role coverage gaps. | Use role-specific valid JSON fixtures for counting-provider tests where output shape matters. |
| Default factory assertions become brittle if achieved by module mocking ESM imports. | Vitest ESM mocks can make tests hard to maintain. | Prefer observable model/report behavior and injected-provider no-factory tests. Add a narrow optional `providerFactory` test seam to `runLaneWorkflow()` only if needed, keeping production default identical. |
| Provider wrapping could occur more than once if downstream workflows also wrap. | Double retry changes attempt counts and audit evidence. | Keep wrapper only in `run-lane-command.ts`; add code review focus to reject retry wrappers in lane workflows/team roles. |
| Knowledge commands are mistaken for provider bypasses. | Scope excludes stateless/non-chat bridge surfaces. | Document `run-knowledge-command.ts` as intentionally out of scope unless a real `ChatProvider` direct call is found. |

## Implementation Slices

### Slice 1: Inventory freeze and ownership guardrails

- **Goal:** Establish the exact current provider surfaces before changing behavior.
- **Inspect/edit files:**
  - inspect all files listed in **Impacted Surfaces**;
  - edit tests/docs only unless a new bypass is found.
- **Actions:**
  1. Search for production `createChatProvider`, `createRetryingChatProvider`, and direct vendor-provider calls.
  2. Confirm `runLaneWorkflow()` is the only active lane workflow production factory/wrapper boundary.
  3. Confirm `runKnowledgeCommand()` and retrieval embedding surfaces are not `ChatProvider` bypasses.
  4. Record any newly discovered bypass in implementation notes or fix it in Slice 2/3 if in scope.
- **Validation hook:** code inspection plus `npm run check` after any type-visible changes.

### Slice 2: Harden lane workflow provider boundary

- **Goal:** Make factory/injection/retry ownership explicit and testable at `runLaneWorkflow()`.
- **Inspect/edit files:**
  - `packages/opencode-app/src/workflows/run-lane-command.ts`
  - `packages/opencode-app/src/workflows/run-lane-command.test.ts`
  - `packages/runtime/src/reliability/retrying-chat-provider.test.ts`
- **Actions:**
  1. Preserve `baseProvider = input.provider ?? createChatProvider(envelope.resolvedModel)` semantics.
  2. Preserve single retry wrapping after base provider selection.
  3. Add/strengthen test proving an injected quick provider is called and the workflow succeeds without vendor credentials.
  4. Add/strengthen test proving transient retryable error is retried through the wrapper and audit evidence is emitted through runtime events if the current audit repo exposes it.
  5. Add/strengthen non-retryable or retry-give-up behavior tests in retrying-provider unit tests.
  6. Add resume-path assertion that resumed execution uses the resumed envelope model for default provider creation unless an injected provider is supplied. If direct factory interception is too invasive, assert report model preservation and document the limitation.
- **Validation hook:** `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts` and `npm run test -- packages/runtime/src/reliability/retrying-chat-provider.test.ts`.

### Slice 3: Cover quick, delivery/full, and migration provider propagation

- **Goal:** Prove active provider-backed team roles receive the same prepared provider through all lane workflows.
- **Inspect/edit files:**
  - `packages/opencode-app/src/workflows/quick.ts`
  - `packages/opencode-app/src/workflows/delivery.ts`
  - `packages/opencode-app/src/workflows/migration.ts`
  - `packages/opencode-app/src/workflows/workflows.test.ts`
  - `packages/opencode-app/src/team/{coordinator,analyst,architect,implementer,reviewer,tester}.ts`
- **Actions:**
  1. Add a counting/fixture provider to workflow tests that returns valid JSON for each role prompt shape.
  2. Quick test: assert coordinator call goes through injected provider.
  3. Delivery/full test: assert provider calls cover coordinator, analyst, architect, implementer, reviewer, and tester for the current execution plan.
  4. Migration test: assert provider calls cover coordinator, architect, implementer, reviewer, and tester for the current execution plan.
  5. If any role is not executed because the workflow plan has no work items, adjust fixture provider to return one valid work item; do not change production planning semantics just for the test.
  6. Keep role modules as provider consumers only; no factory/retry imports in role files.
- **Validation hook:** `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts`.

### Slice 4: Bypass documentation, regression validation, and reviewer handoff

- **Goal:** Close acceptance by making remaining bypasses/exclusions explicit and running repository-real validation.
- **Inspect/edit files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/retrieval/src/semantic/semantic-search.ts`
  - `packages/retrieval/src/semantic/embedding-pipeline.ts`
  - relevant implementation notes or test descriptions if no separate doc is created
- **Actions:**
  1. Confirm no active CLI/workflow/team entrypoint that performs `ChatProvider` chat bypasses `runLaneWorkflow()` provider threading.
  2. Document intentional exclusions in implementation notes/test names: knowledge bridge and embedding provider surfaces are not chat-provider workflow bypasses.
  3. Run full repository validation commands that actually exist.
  4. Prepare reviewer notes answering: where is base provider created, where is retry applied, how injected provider is preserved, and which surfaces remain intentionally out of scope.
- **Validation hook:** `npm run check` and `npm run test`.

## Dependency Graph

- **Sequential:** Slice 1 -> Slice 2 -> Slice 3 -> Slice 4.
- **Internal safe split only after Slice 1:** retrying-provider unit-test hardening can happen alongside lane workflow test hardening because the files are distinct, but they rejoin before Slice 3 propagation assertions.
- **Critical path:** inventory freeze -> `runLaneWorkflow()` boundary assertions -> lane propagation tests -> full validation and bypass documentation.

## Parallelization Assessment

- parallel_mode: `limited`
- why: the implementation touches a small shared workflow/provider surface, so the provider boundary must be decided sequentially before lane propagation tests. Limited parallel work is safe only for independent test files after inventory confirms no production design changes are needed.
- safe_parallel_zones:
  - `packages/runtime/src/reliability/`
  - `packages/opencode-app/src/workflows/`
  - `packages/opencode-app/src/team/`
- sequential_constraints:
  - `TASK-INVENTORY -> TASK-LANE-BOUNDARY -> TASK-LANE-PROPAGATION -> TASK-VALIDATION`
- integration_checkpoint: after Slice 3, before final validation, prove one injected/flaky provider path exercises retry through `runLaneWorkflow()` and all three lane workflows can use an injected provider without real vendor credentials.
- max_active_execution_tracks: 2

Notes:

- Parallel work must not edit `run-lane-command.ts` concurrently with workflow propagation tests unless the team agrees on the provider boundary first.
- Do not parallelize changes that alter team-role fallback semantics; such changes would require Product Lead clarification because current behavior intentionally falls back on provider absence or parse/provider errors.

## Validation Matrix

| Acceptance target | Validation path | Honest success signal |
|---|---|---|
| AC-1 default provider creation preserves resolved model | `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts` plus `npm run check` | Report/envelope model remains the resolved model; any optional factory seam proves `createChatProvider(envelope.resolvedModel)` is the default path. |
| AC-2 quick injected provider | `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts` and/or `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts` | Counting/flaky injected provider receives quick coordinator call; no real API credentials required. |
| AC-3 delivery/full injected provider propagation | `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts` | Counting fixture provider is called by delivery coordinator, analyst, architect, implementer, reviewer, and tester path. |
| AC-4 migration injected provider propagation | `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts` | Counting fixture provider is called by migration coordinator, architect, implementer, reviewer, and tester path. |
| AC-5 retryable transient retry | `npm run test -- packages/runtime/src/reliability/retrying-chat-provider.test.ts` and `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts` | Flaky provider call count is greater than one and final success/error behavior follows retry policy. |
| AC-6 non-retryable failure behavior | `npm run test -- packages/runtime/src/reliability/retrying-chat-provider.test.ts` | Non-retryable provider error is not retried by wrapper and is thrown by wrapper. If team-role fallback catches it in workflow tests, document that as preserved role behavior. |
| AC-7 retry audit evidence | `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts` if runtime event repo assertions are available; otherwise retry-wrapper audit callback unit test | Retry attempt/give-up callbacks are invoked and, for lane workflow, existing audit/runtime event surface records retry evidence. |
| AC-8 bypass inventory | code inspection plus implementation notes/test names | All active chat-provider entrypoints either flow through `runLaneWorkflow()` or are listed as intentional non-chat/non-provider surfaces. |
| AC-9 lane/stage/model behavior unchanged | `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts`, `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts`, `npm run check` | Existing lane reports, stage behavior, and model report fields remain stable; no new enums/vendors appear. |
| AC-10 repository-real validation | `npm run check`; `npm run test`; targeted Vitest commands above | Validation uses actual scripts from `package.json`: `check`, `test`, `test:watch`. No lint/build gate is claimed. |

Repository-real commands available now:

- `npm run check`
- `npm run test`
- `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts`
- `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts`
- `npm run test -- packages/runtime/src/reliability/retrying-chat-provider.test.ts`
- `npm run test -- packages/providers/src/chat/chat.test.ts`

No repository lint or build script is defined in `package.json`; do not claim lint/build validation for this work.

## Integration Checkpoint

Before Fullstack marks implementation ready for review, verify all of the following in one integrated pass:

1. `runLaneWorkflow()` still owns the only production lane workflow base-provider creation path.
2. Default creation uses the selected execution envelope's `resolvedModel`; resume path uses the resumed envelope unless an explicit provider is injected.
3. Injected provider is preserved as the base provider and then retry-wrapped; default factory is not required for injected-provider tests.
4. Quick, delivery/full, and migration workflows all receive/pass the same prepared provider into their active provider-backed team roles.
5. Retryable transient provider failure retries through `createRetryingChatProvider()` and records retry evidence where the existing audit/runtime event path is available.
6. Non-retryable errors are not retried by the wrapper. Any workflow-level fallback behavior from team-role catches is called out as preserved current behavior, not hidden retry success.
7. `runKnowledgeCommand()` and embedding-provider surfaces are explicitly documented as not chat-provider lane workflow bypasses.
8. `npm run check` and `npm run test` have been run, or any failure is reported with exact failing command and scope.

## Rollback Notes

- Expected implementation should be mostly tests plus narrow workflow-boundary corrections. Rollback is code-level revert of changed files; no schema migration or workflow-state mutation is expected.
- Do not edit `.opencode` workflow state for this feature.
- Do not alter provider vendor configuration, model resolution, lane enums, stage enums, or task-board semantics.

## Reviewer Focus Points

### Fullstack Agent must preserve

- `runLaneWorkflow()` as the workflow provider creation/wrapping boundary.
- injected provider authority over default factory creation.
- default model authority from `envelope.resolvedModel`.
- single retry wrapper at workflow boundary.
- no real API calls in tests.

### Code Reviewer must preserve

- no `createChatProvider()` or vendor construction added to lane workflows/team roles;
- no duplicated retry loops in team roles;
- no vendor additions or model-policy changes;
- no lane/stage/workflow-state semantic changes;
- bypass inventory is complete and honest.

### QA Agent must preserve

- proof of quick, delivery/full, and migration injected-provider coverage;
- proof of retryable and non-retryable retry-wrapper behavior;
- evidence from actual repository commands only;
- explicit limitation if preserved team-role fallback masks surfaced provider errors at workflow-report level.
