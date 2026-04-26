---
artifact_type: scope_package
version: 1
status: ready
feature_id: RUST-HOSTED-BUILD-EVIDENCE
feature_slug: rust-hosted-build-evidence
owner: ProductLead
approval_gate: product_to_solution
source_architecture: docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md
prior_feature: RUST-HOST-LIFECYCLE-AUTHORITY
---

# Scope Package: Rust-Hosted Build Evidence

## Goal

- Make canonical Rust-authored `query.buildEvidence` available on the Rust-hosted first-wave knowledge-command path established by `RUST-HOST-LIFECYCLE-AUTHORITY`.
- Let Rust-hosted `dh ask` broad-understanding requests use one Rust-owned aggregated evidence packet instead of staying limited to narrow search/definition/relationship reverse-RPC calls.
- Preserve the architecture boundary: Rust owns foundation/runtime/storage and code-understanding/query/evidence truth; TypeScript owns workflow/agents/prompt context/presentation inside the supervised worker.

## Why This Next

- `RUST-HOST-LIFECYCLE-AUTHORITY` made Rust the parent process and lifecycle authority for first-wave `ask`, `explain`, and `trace`; the next runtime value is to deepen what that Rust-hosted path can truthfully answer.
- The architecture source identifies `query.buildEvidence` as the coarse-grained bridge call that prevents chatty TS orchestration and keeps evidence construction in Rust.
- Existing completed evidence-builder work made Rust packet truth canonical on touched flows, but the new Rust-hosted worker reverse-RPC contract is still bounded to narrower query methods.
- This is a bounded runtime feature: it advances the Rust-hosted product path without Windows hardening, daemon mode, remote transport, or docs-only work.

## Target Users

- Operators using Rust-hosted `dh ask` to understand repository behavior from grounded evidence.
- The TypeScript worker/brain layer, which needs aggregated repository evidence for prompt/context assembly without owning structural truth.
- Reviewers and QA who need one inspectable evidence story across Rust host, TypeScript worker consumption, and final knowledge-command output.

## Problem Statement

The Rust-hosted first-wave knowledge-command path is now lifecycle-authoritative, but its worker-to-host evidence contract remains narrower than the architecture target for developer-grade code understanding. The architecture states that Rust should own `query.buildEvidence` and return coarse-grained evidence packets, while TypeScript should consume those packets for workflow and presentation. If the Rust-hosted path cannot request and surface canonical build-evidence packets, broad-understanding `ask` flows either remain unsupported or risk falling back to narrow/TS-composed evidence stories that undercut the Rust-owned truth model.

## In Scope

- Support a bounded Rust-hosted `query.buildEvidence` product path for first-wave knowledge-command execution.
- Make capability truth and worker-to-host method availability explicit for `query.buildEvidence`; it must appear as supported only when it is live end to end.
- Route Rust-hosted broad-understanding `dh ask` requests that are within the bounded support contract to Rust-authored build-evidence packet truth.
- Keep TypeScript worker responsibilities limited to request classification, parameter shaping within the approved contract, prompt/context consumption, presentation, and operator guidance.
- Preserve existing narrow Rust-hosted `ask`/`explain` query behavior where search, definition, or relationship methods are the truthful surface.
- Preserve the current bounded `trace` product truth unless build-evidence support is needed only to explain why trace remains unsupported; this feature does not make trace-flow execution broadly supported.
- Surface packet states and limitations for grounded, partial, insufficient, and unsupported outcomes on the touched Rust-hosted path.
- Keep index-readiness, stale/partial evidence, ambiguity, unsupported language/capability, and bounds/cutoff states explicit.
- Keep the feature local-only over JSON-RPC stdio and within Linux/macOS target-platform truth.
- Update touched operator wording only where needed to match runtime truth.

## Out of Scope

- Windows hardening or Windows support claims.
- Daemon mode, warm worker pools, persistent background service, socket control plane, TCP/HTTP/gRPC transport, or remote execution.
- Generic method passthrough from TypeScript to Rust or arbitrary bridge expansion beyond the named build-evidence path.
- Replacing every narrow query method with `query.buildEvidence`.
- Making `dh trace` a fully supported trace-flow executor, runtime tracer, debugger, telemetry trace surface, or universal path analyzer.
- New language onboarding, language parity expansion, compiler-grade analysis expansion, or universal repository understanding claims.
- TypeScript-authored canonical evidence packet construction on the Rust-hosted path.
- Retrieval redesign, ranking redesign, prompt-system redesign, or LLM provider behavior changes beyond consuming the Rust packet truth.
- Packaging or release-channel redesign except for validation needed to prove the Rust-hosted path remains runnable.
- Workflow lane/stage redesign, full workflow parity expansion, or workflow-state schema changes.

## User Stories

- As an operator, I want Rust-hosted `dh ask "how does X work?"` to use a canonical Rust evidence packet so that broad-understanding output is grounded in Rust-owned code understanding rather than TypeScript-composed fallback truth.
- As a TypeScript worker consumer, I want to request one bounded build-evidence packet from the Rust host so that prompt/context assembly can stay coarse-grained and not become a chatty sequence of narrow evidence calls.
- As a reviewer, I want the Rust-hosted capability advertisement and final command report to show whether build-evidence support is live, partial, insufficient, or unsupported so that support claims match runtime behavior.
- As QA, I want negative cases to be explicit so that missing index truth, unsupported languages, ambiguous targets, and out-of-scope methods cannot look like grounded evidence.

## Business Rules

1. Rust is the only authoritative source for canonical build-evidence packet truth on the Rust-hosted path.
2. TypeScript may not synthesize a stronger canonical evidence packet when Rust returns partial, insufficient, unsupported, or degraded packet truth.
3. `query.buildEvidence` must be advertised only when the Rust host and TypeScript worker can exercise it end to end on the supported path.
4. Broad-understanding `ask` routing must remain bounded; unsupported broad or unbounded asks must return explicit unsupported/insufficient output rather than hidden fallback support.
5. Existing narrow query surfaces remain valid when they are the more truthful contract for a request.
6. Worker-to-host method support must stay allowlisted and non-generic; adding `query.buildEvidence` must not open arbitrary method forwarding.
7. A grounded result requires inspectable Rust packet evidence with source/provenance and no hidden material gap.
8. A partial result must preserve useful evidence and visible gaps, bounds, or degraded reasons.
9. An insufficient result must state what proof is missing or why the current index/evidence cannot support a safe packet-level conclusion.
10. An unsupported result must state the unsupported request class, language/capability boundary, depth, or runtime-trace boundary.
11. Lifecycle authority remains separate from evidence truth: Rust owns both lifecycle and evidence on this path, but command result support can still be unsupported while lifecycle succeeds.
12. The feature must preserve Linux/macOS-only support truth and must not introduce Windows work or claims.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Inspectable Expectation |
| --- | --- | --- |
| AC-1 | **Given** the Rust-hosted first-wave worker protocol/capability truth is inspected, **when** `query.buildEvidence` is advertised as supported, **then** reviewers can prove the Rust host and TypeScript worker can exercise that method end to end. | Capability output, worker contract evidence, and tests agree; no spec-only advertisement exists. |
| AC-2 | **Given** a Rust-hosted broad-understanding `dh ask` request such as `how does auth work?`, **when** the request falls within the bounded support contract, **then** TypeScript requests a Rust-authored build-evidence packet and treats that packet as canonical evidence truth. | Rust-hosted smoke or integration evidence shows the final report traces to `query.buildEvidence` or equivalent named build-evidence truth. |
| AC-3 | **Given** a narrow ask/explain request is better served by existing search, definition, or relationship methods, **when** it runs on the Rust-hosted path, **then** the feature does not force it through build-evidence or weaken existing truthful behavior. | Regression tests or review evidence show existing first-wave narrow behavior remains compatible. |
| AC-4 | **Given** Rust returns a grounded build-evidence result, **when** the final Rust-hosted command output is inspected, **then** the output includes non-empty inspectable evidence and does not hide material packet gaps. | Output/report contains evidence provenance, packet state, and source/reason data sufficient for review. |
| AC-5 | **Given** Rust returns partial build-evidence because of ambiguity, unsupported edges, stale/partial index coverage, or configured bounds, **when** TypeScript presents the result, **then** useful evidence remains visible and limitations remain explicit. | Packet gaps/bounds/stop reasons survive worker consumption and final presentation. |
| AC-6 | **Given** the request is in scope but current evidence is too weak or missing, **when** build-evidence runs, **then** the final outcome is insufficient and explains the missing proof instead of fabricating stronger evidence. | Tests cover no-evidence or missing-index-style outcomes without TS packet synthesis. |
| AC-7 | **Given** the request asks for runtime tracing, universal subsystem understanding, unsupported language/capability depth, or another out-of-scope class, **when** the Rust-hosted path handles it, **then** the result is unsupported with explicit reason and no hidden fallback packet. | Unsupported cases remain distinct from partial and insufficient cases. |
| AC-8 | **Given** TypeScript receives build-evidence packet data from Rust, **when** it shapes prompt/context or final presentation, **then** it does not upgrade confidence, remove material gaps, or merge in legacy retrieval packet truth as authoritative. | Code review and tests can identify Rust packet truth as the single source for touched flows. |
| AC-9 | **Given** `query.buildEvidence` is added to the worker-to-host surface, **when** unsupported methods are attempted, **then** the host still refuses arbitrary or out-of-contract methods rather than forwarding them generically. | Negative method tests prove allowlist behavior remains bounded. |
| AC-10 | **Given** the Rust-hosted lifecycle envelope succeeds but the command result is unsupported/insufficient, **when** output is inspected, **then** lifecycle success is not confused with grounded evidence success. | Final reports keep lifecycle status and answer/evidence state separate. |
| AC-11 | **Given** touched docs/help/doctor/presenter wording mentions build-evidence support, **when** compared to live behavior, **then** it describes bounded Rust-hosted build-evidence truth and avoids universal reasoning, runtime trace, daemon, remote, or Windows claims. | Manual wording review or snapshots demonstrate bounded truth. |
| AC-12 | **Given** implementation is ready for review, **when** validation is run, **then** Rust tests, TypeScript checks/tests, and Rust-hosted knowledge-command smoke tests provide fresh evidence or any unavailable validation is explicitly reported. | Handoff evidence names actual commands and outcomes; no invented validation gates are claimed. |

## Edge Cases

- Broad-understanding request maps to multiple plausible symbols, files, or subsystems.
- Build-evidence reaches packet size, node, hop, snippet, or time bounds after collecting some useful evidence.
- The workspace index exists but is stale, partial, or degraded for the requested target.
- The request crosses supported and unsupported language/capability boundaries.
- The TypeScript worker has access to older retrieval packet utilities but Rust build-evidence returns weaker truth.
- Rust-host lifecycle succeeds while the command result remains unsupported or insufficient.
- `dh trace` still runs under Rust-host lifecycle authority but returns unsupported trace-flow result.

## Error And Failure Cases

- `query.buildEvidence` advertised but not callable end to end on the Rust-hosted path.
- Worker-to-host reverse-RPC accepts arbitrary methods after adding build-evidence.
- TypeScript synthesizes or upgrades canonical evidence after Rust returns partial/insufficient/unsupported.
- Final output labels broad-understanding evidence as grounded without non-empty inspectable Rust evidence.
- Missing/stale index, ambiguity, unsupported language, or bounds are hidden behind generic success wording.
- Lifecycle metadata and answer/evidence state are collapsed into one success/failure story.
- Touched wording implies Windows support, daemon/service mode, remote transport, runtime tracing, or universal reasoning.

## Validation Expectations

- Validate Rust bridge/query/host behavior with the repository's real Rust validation path, including workspace tests and targeted tests for build-evidence routing, capability advertisement, unsupported method refusal, and lifecycle-vs-answer-state separation.
- Validate TypeScript worker/bridge/workflow behavior with the repository's real TypeScript checks and tests, including injected or host-backed worker tests that do not spawn a second Rust process from the worker.
- Include Rust-hosted smoke evidence for at least one bounded broad-understanding `ask` request that exercises build-evidence and at least one negative/unsupported request.
- Preserve existing Rust-hosted `ask`, `explain`, and `trace` lifecycle smoke coverage from the prior feature.
- Run available static/security scan substitutes used by the repository when required by the downstream workflow; if a tool is unavailable, record the substitute and limitation explicitly.
- Do not claim application validation that was not actually run.

## Open Questions

- Which exact broad-understanding ask patterns are eligible for first-wave build-evidence routing versus remaining unsupported? Solution Lead must freeze this list before implementation.
- What minimum packet fields must appear in final operator output versus machine-readable JSON so that the packet remains inspectable without overloading text output?
- Should `query.buildEvidence` be available only to the Rust-hosted worker reverse-RPC contract in this feature, or also to the legacy TypeScript-host bridge advertisement if not already present? Any legacy-path work must be compatibility-only and must not become a second authority story.

## Success Signal

- Rust-hosted `dh ask` can answer bounded broad-understanding requests through canonical Rust build-evidence packet truth.
- TypeScript worker consumption and presentation preserve Rust packet state, evidence, gaps, bounds, and unsupported/insufficient distinctions.
- The worker-to-host bridge grows by one named bounded evidence method without becoming arbitrary method passthrough.
- Operators and reviewers can distinguish lifecycle success from evidence success and can see exactly where support boundaries remain.

## Handoff Notes For Solution Lead

- Preserve the approved Rust-host lifecycle boundary from `RUST-HOST-LIFECYCLE-AUTHORITY`: Rust stays parent/lifecycle authority; TypeScript stays worker-only on the supported path.
- Preserve the evidence ownership boundary from prior evidence-builder work: Rust owns packet truth; TypeScript consumes and presents it.
- Keep the first implementation slice small: one bounded build-evidence method and the minimum Rust-hosted ask routing needed to prove value.
- Do not use this feature to broaden trace-flow support, add languages, add Windows work, introduce daemon/remote transport, or replace every query method.
- Require explicit validation of both positive build-evidence flow and negative unsupported/refusal paths.
