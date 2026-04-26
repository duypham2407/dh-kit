---
artifact_type: scope_package
version: 1
status: draft
feature_id: PROVIDER-WORKFLOW-THREADING
feature_slug: provider-workflow-threading
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Provider Workflow Threading

## Goal

Make provider use consistent across DH workflow, CLI, and team-role entrypoints so workflow execution resolves the same model as today, creates or accepts one bounded `ChatProvider`, applies the shared retrying-provider abstraction at the workflow boundary, and remains testable through injected providers without adding vendors or redesigning model policy.

## Target Users

- DH operators running lane/workflow commands from the CLI or OpenCode-facing workflow surfaces.
- Maintainers extending workflow/team-role behavior who need provider usage to be inspectable and mockable.
- QA/reviewer roles verifying provider retry and model-resolution behavior without making real vendor calls.

## Problem Statement

The session-runtime selective-port plan identified a product-facing reliability gap: provider calls existed, but workflow entrypoints were not consistently threaded through the provider/retrying-provider abstraction. Repository reality now includes `ChatProvider`, `createChatProvider`, a retrying provider, and workflow/team-role surfaces that accept provider injection in several places. This feature closes any remaining gap where workflow or CLI/team entrypoints bypass those abstractions, duplicate provider construction, or require real provider calls for verification. The value is predictable workflow behavior: existing model resolution is preserved, transient provider failures are handled consistently, and entrypoints can be tested with injected mock/flaky providers.

## Operator / Runtime Truth Rules

- Product path remains the supported operator surface: globally installed `openkit` / DH CLI entrypoints should continue to resolve models and run workflows as they do today.
- In-session workflow path remains lane-based and mode-aware; provider threading must not change lane selection, stage sequence, approval gates, workflow-state schema semantics, or task-board rules.
- Compatibility/runtime inspection paths must remain factual and additive; do not edit workflow state directly for this feature.
- Provider creation must remain based on the existing resolved model selection and current factory behavior. Missing API keys may continue to fall back to the existing mock behavior if that is current factory behavior.
- Injected providers are a first-class test seam. When an entrypoint receives an explicit provider, the workflow must use that provider through the same retry boundary rather than creating an unrelated provider.
- Runtime retry evidence should remain inspectable where the current runtime has an audit/event surface, but this scope does not require a new observability subsystem.

## In Scope

- Inventory current workflow, CLI, and team-role entrypoints that initiate or transit provider-backed chat calls.
- Ensure workflow entrypoints use the existing model-resolution output to create a base `ChatProvider` through `createChatProvider` when no provider is injected.
- Ensure workflow entrypoints wrap provider use with the existing retrying-provider abstraction at a bounded workflow boundary, instead of duplicating retry logic in individual roles.
- Ensure lane workflows and team roles that call chat behavior accept and pass provider injection consistently enough for quick, delivery/full, and migration paths to be testable.
- Close bypasses where an entrypoint or role constructs a provider directly, calls provider/vendor code directly, or silently ignores an injected provider.
- Add or update tests that prove provider injection, retry wrapping, and model-resolution preservation through at least the real workflow entrypoints that can execute provider-backed roles.
- Keep existing operator behavior unchanged except for consistent retry handling and improved testability.
- Document any discovered entrypoint that is intentionally stateless or not provider-backed, with the reason it remains out of this feature.

## Out of Scope

- Adding new provider vendors, model families, model policies, routing policies, or provider selection rules.
- Redesigning `ChatProvider`, `createChatProvider`, provider error types, or retry-policy semantics beyond what is required to thread existing abstractions.
- Broad session-runtime rewrites, transcript/compaction/revert work, or workflow-state schema redesign.
- Rust bridge changes unless Solution Lead discovers a concrete current blocker that prevents existing provider threading from working.
- Replacing current CLI/operator command behavior or renaming workflow lanes/stages.
- Introducing real-network integration requirements for tests; mock/flaky provider injection is sufficient for acceptance.
- Duplicating retry behavior inside team-role modules when the shared retrying provider can handle it at the workflow boundary.

## Main Flows

- As a DH operator, I want lane/workflow commands to use the model already resolved for the session, so that provider behavior remains consistent with today’s model configuration.
- As a maintainer, I want workflow entrypoints to accept an injected provider, so that provider-backed workflows can be tested without API keys or network calls.
- As a QA/reviewer, I want transient provider errors to pass through one shared retry wrapper, so that retry behavior is observable and consistent across quick, delivery/full, and migration execution paths.
- As a future workflow-role author, I want team roles to receive provider dependencies rather than constructing vendors directly, so that role behavior stays composable and bounded.

## Business Rules

1. Existing model resolution remains authoritative for default provider creation.
2. When a caller injects a provider, workflow execution must use that provider as the base provider instead of calling vendor factories for a different provider.
3. Provider retry must be centralized through the existing retrying-provider abstraction at a workflow/entrypoint boundary.
4. Team roles that need chat behavior must receive provider dependencies from their caller; they must not independently choose vendors or resolve models.
5. Provider threading must cover all active lane workflow paths that currently execute provider-backed team roles: quick, delivery/full, and migration.
6. Stateless/non-workflow commands only need changes if they currently call provider-backed chat behavior and bypass the shared provider path.
7. No acceptance criterion may require a real OpenAI, Anthropic, or other external API call.
8. Provider failures must preserve existing failure semantics except for retrying errors already classified as retryable by the shared retry policy.
9. Audit/runtime evidence should record retry attempts where an audit/event hook already exists; missing optional audit sinks must not break provider execution.

## Acceptance Criteria Matrix

| ID | Acceptance criterion | Inspectable expectation |
|---|---|---|
| AC-1 | Given a workflow/lane entrypoint runs without an injected provider, when it reaches provider-backed team-role execution, then it creates the base provider from the already resolved model selection and does not introduce a second model-resolution path. | Code inspection identifies one default provider creation path from resolved model selection; tests or fixtures verify report/envelope model output is unchanged. |
| AC-2 | Given a workflow/lane entrypoint receives an injected provider, when quick workflow execution reaches a provider-backed role, then the injected provider is called and default provider creation is not required for that path. | A test injects a mock/flaky provider into quick execution and asserts calls occur through the injected provider. |
| AC-3 | Given delivery/full workflow execution receives an injected provider, when coordinator/analyst/architect/implementer/reviewer/tester roles run, then provider-backed roles receive the same injected/retry-wrapped provider from the workflow boundary. | Tests or targeted assertions cover delivery/full role flow; code inspection shows provider is passed through role calls instead of recreated in roles. |
| AC-4 | Given migration workflow execution receives an injected provider, when migration coordinator/architect/implementer/reviewer/tester roles run, then provider-backed roles receive the same injected/retry-wrapped provider from the workflow boundary. | Tests or targeted assertions cover migration role flow; code inspection shows no migration-specific provider bypass. |
| AC-5 | Given a transient provider error classified retryable by existing retry policy, when it occurs during a workflow provider call, then the retrying-provider abstraction retries according to current retry rules before surfacing failure. | A test uses a flaky injected provider and asserts call count is greater than one and the workflow succeeds or surfaces the expected final error. |
| AC-6 | Given a non-retryable provider error, when it occurs during a workflow provider call, then workflow execution does not mask it as success and does not retry beyond existing retry-policy rules. | A test or retry-provider test asserts non-retryable failure behavior and no hidden success path. |
| AC-7 | Given provider retry occurs and an audit/event sink is available, when retry attempts or give-up events happen, then evidence is recorded through the existing audit/runtime event surface without adding a new observability subsystem. | Runtime event/audit assertions or inspectable code path show retry attempt/give-up callbacks use existing audit/event facilities. |
| AC-8 | Given any active CLI/workflow/team entrypoint currently calls provider/vendor code directly, when the feature is complete, then that entrypoint either uses the shared provider threading path or is explicitly documented as intentionally out of scope because it is stateless/non-provider-backed. | Entry-point inventory in solution/implementation notes lists checked surfaces and any intentional exclusions. |
| AC-9 | Given existing workflow commands and model configuration, when provider threading is added, then command names, lane behavior, stage order, and model selection output remain unchanged. | Regression tests or code review confirm no lane/stage/model policy changes; no new workflow-state enums or provider vendors appear. |
| AC-10 | Given the repository has existing check/test commands for DH runtime code, when implementation is ready for review, then provider-threading tests run through the real available validation path and do not claim nonexistent lint/build gates. | Verification evidence uses actual repository commands available at implementation time; any unavailable validation is called out explicitly. |

## Inspectable Acceptance Expectations

- Solution Lead must begin with a current-state inventory rather than assuming the present provider threading is complete.
- Implementation evidence should include direct references to the entrypoints inspected, especially workflow lane entrypoints, CLI-facing command runners, and team-role modules.
- Tests should prefer injected mock/flaky providers and should not require provider API keys.
- Reviewer should be able to answer: “Where is the base provider created?”, “Where is retry applied?”, “How is an injected provider preserved?”, and “Which entrypoints were intentionally not changed?”
- QA should verify behavior by assertions and runtime/audit evidence, not by visual or subjective inspection alone.

## Edge Cases

- Resume paths: resuming an existing session must use the resumed execution envelope’s resolved model unless an explicit provider injection is supplied by the caller.
- Missing API keys: default provider factory fallback behavior must remain whatever `createChatProvider` currently implements; this feature must not turn missing keys into a new failure mode.
- Mixed lane behavior: quick, delivery/full, and migration may call different role sets, but provider dependency flow must be consistent for each active provider-backed role in those paths.
- Optional audit sinks: retry wrapping must still function when no audit callback is supplied.
- Provider identity: retry wrapping may decorate provider identity, but tests and logs should still make the base provider traceable enough for debugging.
- Stateless knowledge-style commands: if a command does not participate in lane/session workflows, it should not be silently converted into a session-backed workflow as part of this scope.

## Error And Failure Cases

- If provider creation from resolved model selection fails, the workflow should surface a structured failure consistent with current error handling rather than selecting a different vendor.
- If an injected provider throws a retryable error until retry budget is exhausted, workflow execution should report failure and, where supported, record retry give-up evidence.
- If an injected provider throws a non-retryable error, workflow execution should fail without repeated retries beyond policy.
- If inventory finds a hard provider bypass in an entrypoint with unclear product behavior, Solution Lead must preserve the bypass as an open blocker instead of redesigning the entrypoint ad hoc.
- If Rust bridge or lower-level CLI integration is discovered to block provider threading, treat it as a Solution Lead open question before implementation rather than expanding scope automatically.

## Open Questions

- Which current CLI command files are actively provider-backed versus only workflow launchers, and do any still bypass `runLaneWorkflow`/shared workflow threading?
- Are there any remaining team-role modules or tests that instantiate provider factories directly for production behavior rather than as isolated provider tests?
- Is retry audit evidence already sufficient in the existing runtime event surface, or does implementation need a narrow assertion-only hook to make retry evidence testable?

## Success Signal

- All active provider-backed workflow/CLI/team entrypoints either use the shared provider creation/injection/retry path or are explicitly documented as intentionally out of scope.
- Quick, delivery/full, and migration workflow paths can be tested with injected mock/flaky providers and show retry behavior without real API calls.
- Existing lane behavior, model resolution, command names, and provider/vendor set remain unchanged.

## Handoff Notes For Solution Lead

- Treat this as a consistency and testability feature, not a provider architecture redesign.
- Start by inventorying current provider-related code paths (`ChatProvider`, `createChatProvider`, retrying provider, workflow runners, CLI command runners, and team roles) and freeze the actual bypass list before designing slices.
- Preserve current model-resolution authority and provider factory fallback behavior.
- Keep the retry boundary centralized; avoid role-by-role retry duplication.
- If no concrete Rust bridge blocker is found, leave Rust bridge surfaces untouched.
