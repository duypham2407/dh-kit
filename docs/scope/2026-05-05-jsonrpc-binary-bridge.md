---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: FEATURE-JSONRPC-BINARY-BRIDGE
feature_slug: jsonrpc-binary-bridge
owner: ProductLead
approval_gate: product_to_solution
source_doc: docs/improve/feature-01-2-toi-uu-json-rpc.md
---

# Scope Package: JSON-RPC Binary Bridge

## Goal

- Reduce Rust/TypeScript bridge overhead for large code-intelligence payloads by introducing a negotiated binary transport/codec option while preserving the current local bridge product behavior.
- Keep the operator-visible bridge contract stable: the same supported query/session capabilities should work, with faster and more efficient payload exchange for large embeddings, AST-like data, and evidence packets.

## Target Users

- OpenKit operators and maintainers running Rust-backed code-intelligence workflows through the TypeScript orchestration layer.
- Downstream Solution Lead, Fullstack, Code Review, and QA roles that need a clear behavior boundary for protocol modernization.
- Future feature teams that need to pass large vector or syntax/graph payloads across the Host/Worker boundary without JSON becoming the bottleneck.

## Problem Statement

- The current bridge surface uses `dh-jsonrpc-stdio-client.ts` and `worker-jsonrpc-stdio.ts` with JSON-RPC 2.0 envelopes framed by `Content-Length` over stdio.
- This is a good initial protocol because it is simple, inspectable, and already supports startup, request, timeout, and structured failure semantics.
- It becomes expensive when payloads contain large vector embeddings such as `float32[1536]`, large AST/syntax trees, or bulky evidence packets because both sides must serialize and parse text JSON.
- The user-requested improvement is to upgrade communication between Rust and TypeScript to a binary representation such as MessagePack or Protobuf/gRPC so Host/Worker exchange can become materially faster, with the source doc targeting a 5-10x bridge-speed improvement for large payloads.
- Product scope is protocol modernization and observable performance improvement, not a broad rewrite of code-intelligence behavior.

## Current Repository Signals Inspected

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` writes JSON request bodies with `JSON.stringify`, sends `Content-Length` text frames over child stdin, and parses JSON responses from stdout.
- `packages/opencode-app/src/worker/worker-jsonrpc-stdio.ts` mirrors the same `Content-Length` + JSON parse/stringify peer behavior for worker-side requests, notifications, and responses.
- `docs/migration/deep-dive-02-bridge-jsonrpc.md` defines the existing local-process Rust core <-> TypeScript workflow bridge, JSON-RPC 2.0 semantics, stdio framing, stdout/stderr separation, concurrency, and failure expectations.
- The earlier scope package `docs/scope/2026-04-14-phase2-jsonrpc-bridge-basic-agent-e2e.md` established that bridge success/failure states must remain operator-visible and inspectable.

## In Scope

- Define product-visible behavior for a binary bridge mode between the Rust host/core side and the TypeScript worker/orchestration side.
- Require protocol negotiation so both peers can agree on binary support and fall back safely when binary mode is unavailable or disabled.
- Preserve existing supported bridge methods, request/response correlation, timeout behavior, startup failure reporting, request failure reporting, and stdout/stderr separation.
- Support large payload classes that motivate this feature: vector embeddings, large AST/syntax trees, graph/evidence packets, and other structured code-intelligence results that are costly as text JSON.
- Require measurable bridge-level performance evidence comparing JSON mode against binary mode on representative large payloads.
- Require maintainers to be able to identify which transport/codec mode was used for a run through logs, diagnostics, metrics, or documented test evidence.
- Document compatibility expectations for existing local development flows and tests.

## Out of Scope

- Changing code-intelligence answers, ranking, indexing behavior, parser coverage, graph semantics, or agent orchestration behavior.
- Adding new user-facing query methods solely because binary transport exists.
- Replacing the local Host/Worker topology with a remote service architecture.
- Production packaging overhaul, installer hardening, release-channel work, or deployment automation.
- Removing the JSON bridge immediately unless the Solution Lead proves no compatibility or rollout risk; JSON compatibility/fallback remains the product default expectation for this increment.
- Solving all future streaming, cancellation, batching, or multi-client protocol ambitions beyond what is required for binary payload exchange.
- Committing to a specific implementation technology at product scope; MessagePack, Protobuf over stdio, or gRPC are acceptable candidates for Solution Lead evaluation.

## Main Flows

### Flow 1 - Binary-capable peers negotiate binary mode

- Operator invokes an existing supported Rust-backed bridge workflow.
- During initialization, both peers advertise compatible binary bridge capability.
- The bridge uses the selected binary mode for eligible request/response payloads.
- The workflow returns the same product-level result shape as JSON mode.
- Evidence shows binary mode was used.

### Flow 2 - Binary unavailable falls back safely

- Operator invokes the same supported workflow where one peer lacks binary capability or binary mode is disabled.
- The bridge continues through the existing JSON-compatible mode instead of failing solely due to missing binary support.
- The workflow reports normal success or existing structured failure semantics.
- Evidence shows fallback mode was used.

### Flow 3 - Large payload performance path is exercised

- A representative large payload crosses the Host/Worker boundary, such as embedding-sized float arrays or large AST/evidence-like structures.
- Binary mode avoids text JSON serialization/deserialization for the eligible payload.
- The run produces performance evidence that can be compared with JSON mode.

### Flow 4 - Binary protocol error is surfaced honestly

- If binary negotiation succeeds but a binary frame/payload cannot be decoded, the bridge reports a structured protocol/request failure.
- The failure does not hang indefinitely, does not corrupt subsequent requests silently, and does not report success with missing data.
- Recovery behavior is explicit: either fail the affected request/session or fall back only when safe and documented.

## Business Rules

- The bridge remains a local Host/Worker boundary for this feature.
- JSON-RPC-level semantics remain the product contract unless Solution Lead proposes and documents an equivalent envelope contract that preserves correlation, errors, and request lifecycle behavior.
- Binary mode must be negotiated or explicitly configured; a peer must not silently send binary frames to a JSON-only peer.
- Existing supported workflows should remain behaviorally equivalent in result shape and failure categories.
- Performance claims must be based on repository-verifiable benchmark/test evidence, not assumed from codec choice.
- Binary mode should target the payload bottleneck; maintainers should not broaden this into unrelated engine or agent optimization work.
- Operators and QA must be able to determine whether a run used JSON mode, binary mode, or fallback mode.

## Acceptance Criteria Matrix

- **AC1 - Capability negotiation exists:** When bridge initialization occurs, peers can advertise supported protocol/codec modes and select a mutually supported mode without breaking JSON-only compatibility.
- **AC2 - Binary mode preserves behavior:** When binary mode is selected for an existing supported workflow, the operator-visible result shape, method semantics, request correlation, and structured error categories remain equivalent to the JSON path.
- **AC3 - JSON fallback is safe:** When binary mode is unavailable, unsupported, or disabled before use, the bridge falls back to the current JSON-compatible path and reports the selected mode clearly.
- **AC4 - Large payload path is covered:** Representative large payloads for embeddings and AST/evidence-like structures can cross the bridge in binary mode without JSON text serialization as the primary payload representation.
- **AC5 - Performance evidence is captured:** Benchmarks or automated tests compare JSON mode and binary mode for representative large payloads and show a material bridge-level improvement, with the source-doc target of 5-10x treated as the aspirational success signal.
- **AC6 - Failure handling remains explicit:** Decode errors, unsupported codec errors, malformed frames, startup failures, timeouts, and request failures are surfaced as structured failures and do not hang or masquerade as success.
- **AC7 - Mode observability exists:** Reviewers and QA can inspect logs, diagnostics, test output, or metrics to confirm whether JSON, binary, or fallback mode was used.
- **AC8 - Compatibility scope is respected:** Delivery does not remove current supported JSON behavior, expand unrelated query capability, or change code-intelligence answers outside transport effects.
- **AC9 - Documentation is updated:** Protocol/bridge docs describe the selected binary strategy, negotiation behavior, fallback behavior, operator-visible evidence, and known limitations.

## Edge Cases

- One peer advertises binary support but does not support the selected codec version.
- Binary frame length is invalid, truncated, larger than allowed, or cannot be decoded.
- A request contains mixed small metadata and large binary-eligible payload fields.
- Concurrent requests complete out of order while binary payloads are in flight.
- Binary mode succeeds for small payloads but regresses or exceeds memory limits on large payloads.
- Fallback occurs after negotiation failure versus after partial binary use; these cases need different safety behavior.
- Existing tests or developer tools depend on human-readable JSON frames for debugging.

## Error And Failure Cases

- Bridge startup failure.
- Binary capability negotiation failure.
- Unsupported codec, codec version, or schema version.
- Malformed binary frame or payload decode failure.
- Payload exceeds configured size or memory limits.
- Request timeout while encoding, transmitting, decoding, or processing a binary payload.
- Behavior mismatch between JSON and binary result shape.
- Ambiguous fallback where operator/QA cannot tell which mode was used.

## Open Questions

- Which binary strategy best fits DH's local bridge constraints: MessagePack with JSON-RPC-like envelopes, Protobuf over existing stdio framing, or gRPC with a larger topology change?
- Which payloads should be binary-encoded first: all envelopes, selected large `params/result` fields, typed arrays only, or a separate binary attachment mechanism?
- What is the minimum benchmark fixture that represents real embeddings and AST/evidence payloads without requiring external services?
- What compatibility window should JSON fallback have before binary can become the default?
- What size limits, codec versioning, and schema evolution rules are required to prevent unsafe large-payload behavior?
- Should binary mode be default-on after negotiation, behind a config flag, or limited to benchmark/experimental mode for the first release?

## Success Signal

- Existing bridge-backed workflows continue to succeed with the same product behavior.
- Binary-capable peers negotiate and use a binary mode for large payload exchange.
- JSON-only or disabled-binary scenarios continue to work through fallback.
- Repository-verifiable evidence shows materially lower bridge serialization/deserialization overhead for representative large payloads, aiming for the 5-10x improvement noted in the source doc.
- Review and QA can clearly see selected mode, fallback behavior, and structured failures.

## Handoff Notes For Solution Lead

- Choose and justify the binary protocol/codec using the current local stdio bridge, existing JSON-RPC semantics, and compatibility requirements as constraints.
- Prefer the smallest design that removes the large-payload JSON bottleneck while preserving current request lifecycle behavior.
- Define benchmark fixtures and validation commands before implementation so performance claims are testable.
- Specify negotiation, fallback, codec/schema versioning, payload size limits, and observability in the solution package.
- Treat the 5-10x target as an aspirational benchmark for large payload bridge overhead, not a license to change user-visible code-intelligence behavior.
