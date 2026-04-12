# Scope Package: Minimal Extension Runtime State / Fingerprint Persistence (DH)

Date: 2026-04-12
Owner: DH runtime / orchestration team
Execution driver:
- `docs/opencode/minimal-extension-runtime-state-fingerprint-persistence-analysis-dh.md`

---

DH has completed minimal extension contract hardening, including a stable boundary for extension runtime state vocabulary. The remaining gap is that `ExtensionRuntimeState` exists only at the type level today and is not backed by persisted runtime fingerprint comparison across runs. This scope defines a follow-on slice for **minimal runtime state / fingerprint persistence only** so DH can classify an extension as `first`, `same`, or `updated` between runs. It does **not** add plugin-platform parity, broad metadata management, or a larger extension lifecycle subsystem.

## Problem Statement

- DH now has a hardened minimal extension contract boundary.
- `ExtensionRuntimeState = "first" | "updated" | "same"` already exists in type definitions, but DH does not yet persist the data needed to classify those states at runtime.
- Because no persisted fingerprint comparison exists today:
  - DH cannot distinguish first load from unchanged reloads across sessions.
  - DH cannot detect that an extension materially changed between runs.
  - Any downstream runtime observability tied to extension state remains unavailable or speculative.
- The problem to solve is **adding the smallest persistent runtime memory needed to classify extension state across runs**, without widening DH into a full plugin metadata platform.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Contract hardening | Complete | Remains unchanged and is treated as the baseline |
| Runtime state boundary | `ExtensionRuntimeState` exists at type level only | Runtime state is computed from persisted fingerprint comparison |
| Fingerprint persistence | No minimal persistent store for extension fingerprints | One bounded persistence mechanism stores and retrieves prior fingerprints |
| State classification | `first/same/updated` is not wired into the execution path | Runtime can classify `first`, `same`, or `updated` for an extension load |
| Cross-run behavior | No durable comparison between runs | Current load can compare against the previous recorded fingerprint |
| Metadata ambition | No broad metadata subsystem | Still no broad metadata subsystem; only minimal state/fingerprint data |
| Platform ambition | No plugin-platform parity | Still no plugin-platform parity or lifecycle expansion |

## In Scope

1. **Minimal fingerprint persistence**
   - Define the minimum persisted data needed to compare the current extension fingerprint with the previously recorded one.
   - Keep the stored data limited to what is required for runtime state classification.

2. **Runtime state classification**
   - Define the behavior for classifying extension loads as `first`, `same`, or `updated`.
   - Ensure the classification is based on persisted prior state rather than in-memory-only execution context.

3. **Stable fingerprint input expectations**
   - Define which extension data may be used to derive a minimal fingerprint.
   - Require those inputs to be stable enough that classification is not driven by transient runtime values.

4. **Bounded execution-path consumption**
   - Define where runtime state may be consumed in a lightweight way after classification.
   - Keep runtime state additive for observability or audit-style output rather than a new policy branch driver.

5. **Minimal verification coverage expectations**
   - Require verification for the three core states and for state isolation across multiple extension identities.

6. **Execution sequencing expectations**
   - Define the required order so scope remains narrow: fingerprint inputs and persistence boundary first, then classification wiring, then verification/documentation.

## Out of Scope

- Any new extension contract hardening work beyond what is already complete.
- Full plugin-platform parity with upstream.
- A broad metadata subsystem, metadata APIs, or metadata management surface beyond minimal runtime state persistence.
- Theme/source-specific metadata enrichment, package-source handling, or lifecycle parity.
- Dynamic plugin discovery, installation, publishing, distribution, or marketplace behavior.
- Runtime branching changes that make `first/same/updated` a broad new policy engine.
- Database adoption or deeper persistence infrastructure if a minimal bounded persistence approach is sufficient.
- General extension analytics beyond the minimum needed to persist and classify runtime state.

## Business Rules and Scope Boundaries

1. **Contract hardening is already complete** and is not reopened by this task.
2. **`ExtensionRuntimeState` currently exists only at the type level**; this task is specifically to make that state meaningful at runtime.
3. **The only required persisted behavior is minimal fingerprint comparison across runs**.
4. **State classification must stay limited to `first`, `same`, and `updated`**; this task does not add new runtime-state categories.
5. **Fingerprint inputs must be stable** and must not rely on transient execution-only values that would cause false updates.
6. **Persistence must stay minimal**; only data needed to classify and optionally timestamp/count loads belongs in scope.
7. **Runtime state is additive, not a new platform layer**; it should not turn this follow-on into a broad extension metadata subsystem.
8. **Failure handling must not break the core extension flow**; if persistence cannot be read or written, DH must degrade in a bounded, explicit way rather than expanding failure impact.

## User Stories

- As a DH maintainer, I want extension runtime state persisted across runs, so that the existing `ExtensionRuntimeState` boundary reflects real runtime behavior instead of type-only intent.
- As a DH runtime operator, I want an extension load classified as `first`, `same`, or `updated`, so that I can tell whether an extension is new, unchanged, or materially changed.
- As a downstream Solution Lead or implementer, I want this slice kept minimal, so that fingerprint persistence lands without expanding into plugin-platform parity or a large metadata subsystem.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | The approved solution treats this task as minimal runtime state / fingerprint persistence only | No approved implementation path requires plugin-platform parity, broad metadata APIs, or metadata subsystem expansion |
| AC-2 | The solution defines one bounded persisted state record for extension fingerprint comparison | The approved solution identifies a minimal persisted record sufficient to compare current and previous extension fingerprints |
| AC-3 | The solution defines runtime classification for all three existing states | The approved solution specifies how `first`, `same`, and `updated` are determined from persisted comparison results |
| AC-4 | The solution keeps fingerprint inputs stable and inspectable | The approved solution names the allowed fingerprint inputs and excludes transient runtime-only data |
| AC-5 | Runtime state works across runs rather than only within one process | The approved solution depends on persisted prior state rather than in-memory-only classification |
| AC-6 | Runtime state consumption remains bounded and additive | The approved solution uses state for lightweight runtime observability/logging/audit-style output and does not require new broad policy branching |
| AC-7 | Verification covers the core deferred gap | The approved solution includes verification for: no prior record -> `first`; unchanged fingerprint -> `same`; changed fingerprint -> `updated` |
| AC-8 | Verification covers multi-extension isolation | The approved solution includes a case showing separate extension identities do not overwrite or corrupt each other's state |
| AC-9 | Persistence failure handling is explicitly bounded | The approved solution defines how read/write failures are surfaced without redefining the whole extension execution contract |
| AC-10 | The task remains aligned with DH reality | The scope and solution state that contract hardening is complete, `ExtensionRuntimeState` exists only at type level today, and no broad metadata subsystem is added |

## Edge / Failure Cases

- No prior persisted fingerprint exists for an extension identity.
- A prior fingerprint exists and the current fingerprint matches exactly.
- A prior fingerprint exists and the current fingerprint differs.
- Multiple extension identities are processed across runs and must not share or overwrite state incorrectly.
- Fingerprint input selection includes unstable data and would cause false `updated` classification unless explicitly excluded.
- The persistence record cannot be read, is missing, or is malformed.
- The persistence record cannot be written after classification.
- Runtime state is available, but no downstream consumer should assume a broader metadata subsystem exists.

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Fingerprint drift from unstable inputs | False `updated` results would reduce trust in runtime state | Limit fingerprint inputs to stable contract/runtime fields only |
| Scope creep into a metadata subsystem | Would turn a small persistence slice into a larger architecture effort | Hold planning and review against the out-of-scope list |
| Persistence handling introduces runtime fragility | State recording must not become a new failure amplifier | Require bounded fallback behavior for read/write failures |
| State starts driving broader policy branches | Would change DH execution semantics more than this follow-on intends | Keep runtime state additive and observational in this slice |
| Store schema changes too early | Frequent schema churn would complicate follow-on work | Keep the persisted schema minimal and explicitly versionable if needed |

### Assumptions

1. `docs/opencode/minimal-extension-runtime-state-fingerprint-persistence-analysis-dh.md` is the authoritative analysis input for this scope.
2. Extension contract hardening is already complete and should be treated as a fixed upstream dependency for this task.
3. `ExtensionRuntimeState` already exists in the SDK/type boundary but is not yet backed by persisted runtime behavior.
4. DH needs only minimal runtime state / fingerprint persistence in this follow-on, not plugin-platform parity or broad metadata management.
5. A bounded local persistence mechanism is sufficient for the current DH need.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Scope freeze and fingerprint input definition**
   - Confirm this task is limited to minimal runtime state / fingerprint persistence.
   - Confirm the stable fingerprint inputs and the minimum persisted record shape.

2. **Phase 1 — Persistence boundary and state transition definition**
   - Define how the runtime reads prior state, compares fingerprints, classifies `first/same/updated`, and records the new state.
   - Define bounded failure behavior for unreadable or unwritable state.

3. **Phase 2 — Execution-path wiring**
   - Wire runtime state classification into the existing extension execution path at a stable point.
   - Keep the result additive and lightweight.

4. **Phase 3 — Verification and documentation closure**
   - Verify the three state transitions and multi-extension isolation.
   - Record follow-on evidence and confirm no expansion into platform parity or broad metadata scope.

### Hard sequencing rules
- Do not reopen minimal extension contract hardening work as part of this follow-on.
- Do not start by designing a broad extension metadata subsystem.
- Do not require database-level or platform-level persistence if a bounded minimal store satisfies the scope.
- Do not make runtime state a new broad planner/executor policy engine in this slice.
- Do not add new parity goals with upstream plugin systems.

## Handoff Notes for Solution Lead

- Preserve DH reality: contract hardening is complete; the remaining gap is that `ExtensionRuntimeState` is type-only today.
- Keep the design narrow: minimal persisted fingerprint comparison, runtime classification to `first/same/updated`, bounded failure behavior, and lightweight runtime consumption.
- Treat the main acceptance hotspots as: stable fingerprint inputs, true cross-run persistence, correct three-state classification, multi-extension isolation, and strict rejection of metadata/platform scope creep.
- If broader metadata management, plugin lifecycle expansion, or platform parity is later needed, treat that as a separate scope package rather than extending this follow-on.
