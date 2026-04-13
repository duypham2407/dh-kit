# Solution Package: Quality Gates Runtime Unification (DH)

**Date:** 2026-04-13  
**Approved scope:** `docs/scope/2026-04-13-quality-gates-runtime-unification-dh.md`

## Solution Intent

Deliver an additive **quality-gates runtime contract v1** that normalizes gate availability/result semantics and connects existing workflow, doctor, and diagnostics/audit surfaces.

## Phase Plan

### Phase 0 — Contract and boundaries
- Add shared runtime contract module for quality gates.
- Enforce fixed catalog of 6 gates and normalized vocab.
- Keep solution additive and in-process.

### Phase 1 — Availability modeling
- Model gate availability with `available | unavailable | not_configured`.
- Detect config presence for `rule_scan` and `security_scan`.
- Report honest unavailability where execution bridges do not exist.

### Phase 2 — Result normalization
- Normalize structural evidence output to unified gate result shape.
- Normalize browser verification output to unified gate result shape.

### Phase 3 — Workflow aggregation
- Aggregate contract-based gate reports in:
  - quick workflow
  - delivery workflow
  - migration workflow
- Include gate aggregate payload in pre-answer hook outputs.

### Phase 4 — Doctor verification health
- Add verification health section to doctor summary + snapshot.
- Surface contract version and availability counts.

### Phase 5 — Audit/diagnostics integration
- Persist quality-gate audit records in existing local sqlite surfaces.
- Extend audit query aggregation to include quality-gate stream.
- Keep diagnostics additive and backward-compatible.

### Phase 6 — Validation and closure
- Add/update unit and integration tests.
- Run `npm run check` and `npm test`.
- Update checklist with completion evidence.

## Implementation Surfaces

- `packages/runtime/src/workflow/quality-gates-runtime.ts`
- `packages/runtime/src/hooks/runtime-enforcer.ts`
- `packages/runtime/src/workflow/workflow-audit-service.ts`
- `packages/runtime/src/diagnostics/doctor.ts`
- `packages/runtime/src/diagnostics/audit-query-service.ts`
- `packages/opencode-app/src/workflows/quick.ts`
- `packages/opencode-app/src/workflows/delivery.ts`
- `packages/opencode-app/src/workflows/migration.ts`
- `packages/opencode-app/src/browser/verification.ts` (normalization consumer surface)

## Guardrails

- No CI or remote execution features.
- No dashboarding/alerting rollout.
- No gate plugin registry.
- No full Semgrep/security platform expansion.
- No lane topology or stage model changes.
