---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: PHASE2-JSONRPC-BRIDGE
feature_slug: phase2-jsonrpc-bridge-basic-agent-e2e
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Phase2 Jsonrpc Bridge Basic Agent E2e

## Goal

- Turn the completed Rust code-intelligence foundation into a minimally usable repo capability by enabling a local JSON-RPC bridge and one basic end-to-end agent workflow that proves the TypeScript/runtime side can call the Rust engine and surface a real result.

## Target Users

- OpenKit operators and maintainers validating the new Rust-backed capability inside this repository.
- Solution Lead, Code Reviewer, and QA as downstream consumers of a clear, inspectable phase boundary.

## Problem Statement

- Phase 1 proved Rust-side parser, indexer, storage, and parity foundations, but the repo still lacks the bridge that makes those capabilities usable from the existing TypeScript/orchestration side.
- Without a bridge-backed end-to-end path, the Rust engine remains a migration artifact rather than an operator-usable product surface.
- This phase creates the smallest full-delivery increment that proves the Rust engine can be invoked through a local JSON-RPC bridge and return a structured result through an existing repo-visible runtime path.

## In Scope

- Define the product-visible behavior of a local JSON-RPC bridge between the TypeScript/orchestration side and the Rust engine.
- Enable one minimal basic agent end-to-end workflow that uses that bridge for a bounded code-intelligence request.
- Support a repo-local operator flow where a request reaches the Rust engine and returns a structured response.
- Make bridge success and failure states inspectable enough for review and QA.
- Document the supported operator-visible outcome for this phase.

## Out of Scope

- Full workflow parity between old and new engine paths.
- Broad agent capability expansion or multi-step agent orchestration parity.
- Production packaging, installer hardening, release-channel expansion, or Windows runtime parity.
- Language expansion beyond the current Phase 1 TS/JS-family foundation.
- Full JSON-RPC method coverage for future engine capabilities.
- Go retirement, old-path deletion, or repo-wide migration to the new bridge.
- Background daemon management, remote execution, or multi-client lifecycle hardening.

## Main Flows

### Flow 1 — Basic bridge-backed request succeeds

- Operator invokes the documented Phase 2 runtime path.
- The TypeScript/orchestration side reaches the Rust engine through the JSON-RPC bridge.
- One bounded code-intelligence request completes.
- A structured, non-empty result is surfaced through an existing repo-visible runtime path.

### Flow 2 — Bridge unavailable or startup fails

- Operator invokes the same documented flow.
- If the bridge cannot start or cannot be reached, the operator receives a clear failure outcome.
- The failure is not reported as success and does not leave the flow hanging indefinitely.

### Flow 3 — Request-handling failure is surfaced honestly

- If the bridge is running but the request cannot be completed, the operator receives an explicit structured failure.
- The surfaced outcome is specific enough to distinguish startup failure from request-handling failure.

## Business Rules

- The bridge is local to the repository/runtime context for this phase; no external hosted service is introduced.
- The bridge must use structured request/response behavior, not ad hoc text parsing.
- The phase only needs the minimum method surface required to prove one basic end-to-end workflow.
- Success requires an operator-visible end-to-end proof, not only lower-level bridge or engine internals.
- Failure reporting must be explicit enough for review and QA to classify issues accurately.
- The phase must preserve current lane semantics and must not broaden into packaging or parity work that belongs to later phases.

## Acceptance Criteria Matrix

- **AC1 — Minimal bridge exists:** When the documented Phase 2 flow is invoked, the TypeScript/orchestration side can reach the Rust engine through a JSON-RPC bridge using structured request/response semantics.
- **AC2 — One basic end-to-end flow succeeds:** When the bridge is available and the operator runs the documented minimal workflow, one bounded code-intelligence request completes and returns a structured, non-empty result through an existing repo-visible runtime path.
- **AC3 — Success is inspectable:** When the happy-path flow succeeds, available evidence shows that the request crossed the bridge and returned from the Rust-backed path rather than a mocked or bypassed shortcut.
- **AC4 — Startup failure is explicit:** If the bridge cannot start or cannot be reached, the documented flow reports a clear failure outcome, does not hang indefinitely, and does not report partial or empty output as success.
- **AC5 — Request failure is explicit:** If the bridge starts but the request cannot be completed, the operator receives a structured failure that distinguishes request-handling failure from startup failure.
- **AC6 — Scope remains minimal:** Review of the delivered phase shows a bounded bridge and one basic end-to-end workflow only; it does not claim full workflow parity, production packaging parity, or broad agent capability parity.
- **AC7 — Operator guidance exists:** Maintainers and reviewers can identify the supported workflow, expected success signal, and failure categories for this phase without rediscovering intent from code alone.

## Edge Cases

- Bridge starts successfully but the requested minimal workflow returns no usable result.
- Bridge is available but returns an unsupported or invalid request outcome for the bounded Phase 2 flow.
- Operator-visible output is present but does not clearly distinguish success from structured failure.
- The minimal workflow succeeds at the transport layer but fails to produce evidence that the Rust-backed path was actually used.

## Error And Failure Cases

- Bridge startup failure.
- Bridge unavailable or unreachable.
- Request accepted but not handled successfully.
- Unsupported or invalid bounded request within the Phase 2 path.
- Ambiguous empty or partial output that must be treated as failure rather than success.

## Open Questions

- Which existing repo-visible runtime entry path is the smallest truthful host for the basic end-to-end demonstration?
- What is the minimum JSON-RPC method surface needed to prove value without broadening into future protocol scope?
- What operator-visible evidence format best proves that the Rust-backed path was actually exercised?
- What minimum timeout and failure semantics are required to prevent ambiguous hangs in this phase?
- Is a compatibility shim needed so the TypeScript side can consume the Rust-backed response without broad refactoring?

## Success Signal

- The repo has a defined local JSON-RPC bridge behavior.
- One minimal agent-backed end-to-end code-intelligence workflow succeeds through that bridge.
- Success and failure states are operator-visible and inspectable.
- The phase remains bounded and does not expand into full parity, packaging hardening, or unrelated runtime work.

## Handoff Notes For Solution Lead

- Preserve the minimal Phase 2 boundary: one local bridge and one basic end-to-end workflow only.
- Choose the smallest real repo-visible entry path that can truthfully demonstrate the Rust-backed flow.
- Keep acceptance inspectable: downstream review and QA must be able to tell whether the bridge started, whether a request crossed it, and whether the Rust-backed path produced the surfaced result.
- Do not broaden into production packaging, broad agent parity, language expansion, or repo-wide migration.
- Resolve the open questions above in the solution package, especially entry-path choice, minimal method surface, evidence shape, and failure semantics.
