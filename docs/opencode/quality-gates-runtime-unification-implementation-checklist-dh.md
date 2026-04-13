# Implementation Checklist: Quality Gates Runtime Unification (DH)

**Date:** 2026-04-13  
**Scope:** `docs/scope/2026-04-13-quality-gates-runtime-unification-dh.md`  
**Solution:** `docs/solution/2026-04-13-quality-gates-runtime-unification-dh.md`

## Status Legend
- `[ ] [Not started]`
- `[ ] [In progress]`
- `[x] [Completed]`

## Phase Checklist

### Phase 0 — Contract and boundaries
- [x] [Completed] Add bounded quality-gates runtime contract v1.
- [x] [Completed] Lock fixed gate catalog of 6 gates.
- [x] [Completed] Keep scope additive with no lane topology change.

### Phase 1 — Availability modeling
- [x] [Completed] Add availability vocabulary (`available|unavailable|not_configured`).
- [x] [Completed] Model `rule_scan` availability honestly.
- [x] [Completed] Model `security_scan` availability honestly.

### Phase 2 — Result normalization
- [x] [Completed] Normalize structural evidence result into contract result shape.
- [x] [Completed] Normalize browser verification result into contract result shape.

### Phase 3 — Workflow aggregation
- [x] [Completed] Integrate gate aggregate in quick workflow.
- [x] [Completed] Integrate gate aggregate in delivery workflow.
- [x] [Completed] Integrate gate aggregate in migration workflow.

### Phase 4 — Doctor verification health
- [x] [Completed] Add verification health section in doctor summary.
- [x] [Completed] Add verification health fields in doctor snapshot.

### Phase 5 — Audit/diagnostics integration
- [x] [Completed] Add quality-gate audit persistence surface.
- [x] [Completed] Aggregate quality-gate data in audit query service.
- [x] [Completed] Keep diagnostics integration additive and compatible.

### Phase 6 — Validation and closure
- [x] [Completed] Add/update tests for runtime contract + integrations.
- [x] [Completed] Run `npm run check`.
- [x] [Completed] Run `npm test`.

## Evidence Notes
- Unified contract: `packages/runtime/src/workflow/quality-gates-runtime.ts`
- Workflow integration: quick/delivery/migration workflow modules
- Doctor integration: `packages/runtime/src/diagnostics/doctor.ts`
- Audit integration: quality-gate repo + audit-query-service updates

## Remediation Update — 2026-04-13
- [x] [Completed] Review finding #1: quality gate records now participate in filtered listing and recentWindow aggregation.
- [x] [Completed] Review finding #2: browser verification now reports truthful non-pass state when required evidence is missing.
- [x] [Completed] Minor #3: rule_scan availability now checks host semgrep CLI; reason text clarified for in-process bridge boundaries.
- [x] [Completed] Minor #4: `QualityGateAuditRepo` now supports `list(filter: AuditQueryFilter)` like other audit repos.
