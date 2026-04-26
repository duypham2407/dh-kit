# QA Report: Provider Workflow Threading

## Overall Status

PASS.

Functional QA passed for `PROVIDER-WORKFLOW-THREADING`. The only QA-stage blocker reported by the QA Agent was artifact creation failure caused by the active edit permission policy (`edit ** deny`). This report materializes the QA Agent's completed verification result so the workflow can close with inspectable evidence.

## Test Evidence

- `npm run check` — PASS
- `npm run test` — PASS
- `npm run test -- "packages/opencode-app/src/workflows/run-lane-command.test.ts"` — PASS
- `npm run test -- "packages/opencode-app/src/workflows/workflows.test.ts"` — PASS
- `npm run test -- "packages/runtime/src/reliability/retrying-chat-provider.test.ts"` — PASS
- `semgrep --config p/ci "packages/opencode-app/src/workflows/run-lane-command.test.ts" "packages/opencode-app/src/workflows/workflows.test.ts" "packages/runtime/src/reliability/retrying-chat-provider.test.ts"` — PASS
- `semgrep --config p/security-audit "packages/opencode-app/src/workflows/run-lane-command.test.ts" "packages/opencode-app/src/workflows/workflows.test.ts" "packages/runtime/src/reliability/retrying-chat-provider.test.ts"` — PASS

QA verified:

- `runLaneWorkflow()` remains the provider factory/retry boundary through `input.provider ?? createChatProvider(envelope.resolvedModel)` followed by `createRetryingChatProvider(...)`.
- Injected provider preservation is covered in quick workflow tests, workflow propagation tests, and retry-wrapper tests.
- Test providers are mock/flaky in-process providers, with no real vendor API calls.
- Quick, delivery/full, and migration provider propagation are covered by `packages/opencode-app/src/workflows/workflows.test.ts`.
- Retryable, non-retryable, retry audit, and give-up callback behavior are covered by `packages/runtime/src/reliability/retrying-chat-provider.test.ts` and lane runtime event assertions.
- Manual cross-surface verification found no production provider redesign, new vendor/model policy, session runtime rewrite, Rust bridge change, or lane/stage semantic change in the verified surfaces.
- Intentional bypasses/preserved behavior are accounted for: knowledge/embedding surfaces remain out of chat-provider lane workflow scope, and team-role fallback behavior remains preserved rather than redesigned.

Tool evidence notes:

- `tool.rule-scan` unavailable; bounded substitute `semgrep p/ci` reported 0 findings on the 3 touched files.
- `tool.security-scan` unavailable; bounded substitute `semgrep p/security-audit` reported 0 findings on the 3 touched files.
- `syntax-outline` was attempted by QA but unavailable due path-resolution errors; QA substituted bounded direct reads/manual structural verification.

## Issues

No product, architecture, or implementation issues remain open for the feature.

Administrative QA artifact issue resolved:

- `QA-ARTIFACT-001` — QA artifact could not be created by the QA Agent due edit permission denial. This report records the QA Agent's completed verification result and resolves the closeout artifact gap.

## Recommendation

Proceed to `qa_to_done`.
