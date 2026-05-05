---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: FEATURE-JSONRPC-BINARY-BRIDGE
feature_slug: jsonrpc-binary-bridge
source_scope_package: docs/scope/2026-05-05-jsonrpc-binary-bridge.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: JSON-RPC Binary Bridge

## Chosen Approach

- Preserve the local stdio topology and JSON-RPC 2.0 request lifecycle; add a negotiated `msgpack-rpc-v1` codec mode over the existing `Content-Length` frame boundary.
- Use MessagePack for the complete JSON-RPC envelope after negotiation, not gRPC or Protobuf, because current method families are dynamic, both sides already use serde/unknown-value envelopes, and gRPC would introduce an unnecessary remote-service topology change.
- Keep JSON as the bootstrap and fallback codec. The first `dh.initialize` request and response stay JSON so JSON-only peers remain compatible; binary mode starts only after both peers agree on codec support.
- Prefer full-envelope MessagePack for this increment. It removes JSON text stringify/parse from large `params` and `result` without adding a separate attachment protocol, while keeping request ids, errors, notifications, and out-of-order responses unchanged.
- Add explicit bridge-mode observability (`json`, `msgpack-rpc-v1`, `json-fallback`) through initialize capabilities, stderr diagnostics, and benchmark/test evidence.

## Recommended Path

- Implement MessagePack over the existing stdio bridge in five slices: contract tests first, TS codec abstraction, Rust codec negotiation, end-to-end interop, then benchmark/docs/scan evidence.
- Keep JSON bootstrap and fallback mandatory for compatibility and rollback; do not remove the current JSON path in this feature.
- Treat final JSON/MessagePack interop and performance evidence as sequential gate work even if TS and Rust codec internals are implemented separately after the contract tests land.

## Dependencies

- TypeScript runtime dependency: add a small MessagePack codec package such as `@msgpack/msgpack` to root `package.json` after confirming ESM compatibility with the current app test environment.
- Rust dependency: add `rmp-serde` to `rust-engine/Cargo.toml` workspace dependencies and to `rust-engine/crates/dh-engine/Cargo.toml`.
- Environment/config: add an optional bridge mode override such as `DH_BRIDGE_CODEC=json|msgpack|auto` for tests, fallback checks, and emergency rollback; default should be `auto`.

## Impacted Surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`: host-side TS client framing, encode/decode, initialization negotiation, selected-mode diagnostics, errors, and tests for fallback.
- `packages/opencode-app/src/worker/worker-jsonrpc-stdio.ts`: generic TS peer codec support if this peer remains in use for worker-host protocol tests or future bidirectional use.
- `rust-engine/crates/dh-engine/src/bridge.rs`: Rust server read/write framing, JSON bootstrap, MessagePack encode/decode after negotiation, initialize capability fields, size limits, and structured protocol errors.
- `rust-engine/Cargo.toml` and `rust-engine/crates/dh-engine/Cargo.toml`: MessagePack serde dependency wiring.
- Existing and new tests near `rust-engine/crates/dh-engine/src/bridge.rs` and TS bridge tests under `packages/opencode-app/src/**`: negotiation, fallback, malformed frames, behavior parity, and binary large payload path.
- New benchmark fixture(s), preferably `rust-engine/crates/dh-engine/src/bridge_benchmark.rs` or an adjacent test/bench module plus a TS-side benchmark test if the bridge client owns measurable encode/decode timing.
- `docs/migration/deep-dive-02-bridge-jsonrpc.md`: update protocol docs with codec negotiation, fallback, frame headers, error behavior, and known limitations.

## Interfaces And Data Contracts

- Add optional `transport` fields to `dh.initialize.params`:
  - `supportedCodecs: ["json-rpc-v1", "msgpack-rpc-v1"]`
  - `preferredCodec: "msgpack-rpc-v1" | "json-rpc-v1"`
  - `maxFrameBytes?: number`
  - `binaryBridge?: { enabled: boolean; minPayloadBytes?: number }`
- Add optional `transport` fields to `dh.initialize.result`:
  - `selectedCodec: "json-rpc-v1" | "msgpack-rpc-v1"`
  - `selectedMode: "json" | "msgpack-rpc-v1" | "json-fallback"`
  - `fallbackReason?: string`
  - `maxFrameBytes: number`
  - `codecVersion: 1`
- Frame format remains `Content-Length: <bytes>\r\n...\r\n\r\n<body>`. JSON frames may include `Content-Type: application/vscode-jsonrpc; charset=utf-8`; MessagePack frames should include `Content-Type: application/x-msgpack; bridge=dh-jsonrpc; version=1` when practical, but readers must not rely only on the header after negotiation.
- JSON bootstrap sequence: client sends JSON `dh.initialize`; server returns JSON initialize result selecting codec; both sides switch codec for subsequent frames only when `selectedCodec === "msgpack-rpc-v1"`.
- Fallback rule: fallback is allowed before binary use when capability/env negotiation selects JSON; after MessagePack is active, malformed binary, decode failures, truncated frames, and size violations must fail the affected request/session explicitly rather than silently downgrading a partially used stream.
- Error contract: map codec errors into existing structured categories where possible (`INVALID_REQUEST`, `BRIDGE_UNREACHABLE`, `BRIDGE_TIMEOUT`, `REQUEST_FAILED`) and include machine-readable `data.code` values such as `BRIDGE_CODEC_UNSUPPORTED`, `BRIDGE_CODEC_DECODE_FAILED`, `BRIDGE_FRAME_TOO_LARGE`, and `BRIDGE_CODEC_NEGOTIATION_FAILED`.

## Risks And Trade-offs

- MessagePack preserves dynamic JSON-like shapes but does not provide Protobuf schema guarantees; use existing TS/Rust parsing and tests for behavior parity.
- Full-envelope binary makes debugging less human-readable; mitigate with selected-mode logs, JSON fallback override, and docs rather than duplicating all payloads into logs.
- Numeric and typed-array fidelity must be checked. MessagePack can encode arrays compactly, but current serde/JS value paths may still represent embedding vectors as number arrays unless future typed-array payloads are introduced.
- Size limits are required before optimizing large payloads; otherwise binary mode can make oversized allocations fail less visibly.
- Benchmark results may not hit the aspirational 5-10x target for every AST/evidence shape; acceptance should require material bridge-level improvement on representative large fixtures and honest reporting.

## Implementation Slices

### [ ] Slice 1: Codec contract, fixtures, and failing parity tests
- **Files**: `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `packages/opencode-app/src/worker/worker-jsonrpc-stdio.ts`, `rust-engine/crates/dh-engine/src/bridge.rs`, new or existing TS/Rust test files adjacent to these modules.
- **Goal**: Establish TDD coverage for negotiation, fallback, large-payload parity, and explicit protocol failure before production codec changes.
- **Validation Command**: `npm test -- --runInBand` if supported by Vitest filters, otherwise `npm test`; plus `cargo test -p dh-engine bridge` from `rust-engine`.
- **Details**:
  - Add fixtures for an embedding-like `float32[1536]` number array, a large AST/evidence-like nested object, and concurrent out-of-order responses.
  - Tests must first prove current JSON behavior remains supported and then fail for missing `transport.selectedCodec`, fallback observability, and MessagePack decode path.
  - Include malformed/truncated/oversized frame tests that expect structured errors and no indefinite pending requests.

### [ ] Slice 2: Shared TS bridge codec abstraction
- **Files**: `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `packages/opencode-app/src/worker/worker-jsonrpc-stdio.ts`, `package.json`.
- **Goal**: Replace inline `JSON.stringify`/`JSON.parse` frame bodies with a small codec abstraction while preserving current JSON default behavior.
- **Validation Command**: `npm test` and `npm run check`.
- **Details**:
  - Add `BridgeCodec` style encode/decode helpers for `json-rpc-v1` and `msgpack-rpc-v1`, with maximum frame byte checks and clear protocol errors.
  - Keep `Content-Length` parsing unchanged except for optional `Content-Type` capture; body handling must use bytes instead of unconditional UTF-8 conversion in binary mode.
  - Add selected-mode tracking to the client snapshot so QA can observe negotiated `json`, `msgpack`, or fallback mode.

### [ ] Slice 3: Rust MessagePack codec and negotiation
- **Files**: `rust-engine/Cargo.toml`, `rust-engine/crates/dh-engine/Cargo.toml`, `rust-engine/crates/dh-engine/src/bridge.rs`.
- **Goal**: Teach the Rust bridge server to advertise MessagePack support, select a mutually supported codec, and switch response/request decode after JSON bootstrap.
- **Validation Command**: `cargo test -p dh-engine bridge` from `rust-engine`.
- **Details**:
  - Add `rmp-serde` encode/decode helpers over existing `serde_json::Value`/typed response values to minimize router churn.
  - The first `dh.initialize` stays JSON; server chooses `msgpack-rpc-v1` only when client supports it, env/config allows it, and codec version matches.
  - After switching, `read_rpc_request` and `write_rpc_response` must operate on byte buffers and respect `maxFrameBytes` before allocation.
  - Preserve stdout protocol-only behavior and stderr diagnostics.

### [ ] Slice 4: End-to-end binary bridge integration and fallback behavior
- **Files**: `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `rust-engine/crates/dh-engine/src/bridge.rs`, relevant TS integration tests, relevant Rust bridge tests.
- **Goal**: Prove TS client and Rust server interoperate in JSON fallback and MessagePack modes with existing supported workflows.
- **Validation Command**: `npm test`, `npm run check`, and `cargo test -p dh-engine` from `rust-engine`.
- **Details**:
  - Exercise `dh.initialize`, `runtime.ping`, `query.search`, and `query.buildEvidence` in JSON and MessagePack modes.
  - Verify request ids, structured errors, startup timeout behavior, request timeout behavior, and concurrent response correlation remain unchanged.
  - Verify `DH_BRIDGE_CODEC=json` forces JSON fallback and `DH_BRIDGE_CODEC=msgpack` fails explicitly if the peer cannot support binary.

### [ ] Slice 5: Benchmarks, observability, docs, and scans
- **Files**: benchmark files under `rust-engine/crates/dh-engine/` or test fixtures under `packages/opencode-app/src/`, `docs/migration/deep-dive-02-bridge-jsonrpc.md`, `docs/solution/2026-05-05-jsonrpc-binary-bridge.md` if implementation discoveries require plan updates.
- **Goal**: Capture repository-verifiable performance evidence and document operator/reviewer behavior.
- **Validation Command**: `npm test`, `npm run check`, `cargo test -p dh-engine`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings` if clippy is available, plus the new benchmark command documented by the implementer.
- **Details**:
  - Benchmark JSON vs MessagePack encode/decode and framed round-trip for embedding and AST/evidence fixtures with payload bytes, encode ms, decode ms, and selected codec in output.
  - Run OpenKit `rule-scan` and `security-scan` on changed targets if available after implementation because binary decoding and frame limits are security-sensitive.
  - Update protocol docs with selected approach, negotiation matrix, fallback matrix, size limits, observability, and known limitations.

## Dependency Graph

- Sequential critical path: `Slice 1 -> Slice 2 -> Slice 3 -> Slice 4 -> Slice 5`.
- Slice 2 and Slice 3 may be implemented by separate agents only after Slice 1 lands and only if they do not edit the same test files; integration in Slice 4 must be sequential.
- Slice 5 documentation may start after the contract from Slices 2-3 stabilizes, but benchmark claims must wait for Slice 4 interop.
- Critical path: contract tests, codec abstractions, Rust negotiation, interop, then evidence/docs.

## Parallelization Assessment

- parallel_mode: `limited`
- why: TS codec and Rust codec work are separable after shared failing tests define the contract, but the bridge is a cross-boundary protocol and final interop must be serialized.
- safe_parallel_zones: [`packages/opencode-app/src/bridge/`, `packages/opencode-app/src/worker/`, `rust-engine/crates/dh-engine/`, `docs/migration/`]
- sequential_constraints: [`Slice 1 -> Slice 2`, `Slice 1 -> Slice 3`, `Slice 2 -> Slice 4`, `Slice 3 -> Slice 4`, `Slice 4 -> Slice 5`]
- integration_checkpoint: Slice 4 must run JSON and MessagePack modes against the same TS/Rust pair before docs or performance claims are considered complete.
- max_active_execution_tracks: 2

## Validation Matrix

- **AC1 negotiation**: unit tests for initialize request/result fields, env override matrix, and selected codec; `npm test`, `cargo test -p dh-engine bridge`.
- **AC2 behavior parity**: JSON vs MessagePack tests for `runtime.ping`, `query.search`, and `query.buildEvidence`; compare result shape, ids, and error mapping.
- **AC3 fallback**: tests for JSON-only peer, disabled binary, and unsupported codec; assert selected mode/fallback reason is observable.
- **AC4 large payload**: embedding and AST/evidence fixtures cross encode/decode in MessagePack without UTF-8 JSON body conversion after negotiation.
- **AC5 performance evidence**: benchmark output compares JSON and MessagePack bytes/timing for representative fixtures; report whether 5-10x is met or only material improvement is observed.
- **AC6 failures**: malformed header, truncated body, invalid MessagePack, oversized frame, timeout, and post-switch decode failure tests assert structured failure and no hang.
- **AC7 observability**: initialize snapshot/log/test output includes selected codec and fallback reason.
- **AC8 compatibility**: full test/typecheck suite plus forced JSON mode proves existing JSON behavior remains.
- **AC9 documentation**: `docs/migration/deep-dive-02-bridge-jsonrpc.md` updated and reviewed against this solution package.

## Integration Checkpoint

- Before handoff from Fullstack to Code Review, capture fresh evidence for: `npm test`, `npm run check`, `cargo test -p dh-engine`, forced JSON mode smoke, forced MessagePack mode smoke, fallback mode smoke, and the new benchmark command.
- If any command is unavailable or too slow in the local environment, implementation must record the exact missing command or failure reason instead of substituting an unrelated success signal.

## Rollback Notes

- `DH_BRIDGE_CODEC=json` must force the existing JSON-compatible path without removing MessagePack code.
- If MessagePack negotiation fails before binary frames are used, fall back to JSON with a visible fallback reason.
- If MessagePack fails after activation, fail the current bridge session/request explicitly; do not silently downgrade a stream whose frame boundaries may already be binary.
- Keep JSON tests as permanent compatibility coverage until a future approved scope removes fallback.

## Reviewer Focus Points

- Verify no JSON-only workflow regresses and no product behavior changes outside transport effects.
- Inspect frame length and max payload enforcement before allocation on both TS and Rust sides.
- Inspect MessagePack decode error handling for structured failures, pending-request cleanup, and no stdout log pollution.
- Confirm selected mode is visible to operators/QA and benchmark output supports any speedup claims.
- Confirm new dependencies are minimal, maintained enough for local bridge use, and do not introduce remote-service assumptions.
