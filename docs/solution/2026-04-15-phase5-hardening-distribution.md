---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: PHASE5-HARDENING-DISTRIBUTION
feature_slug: phase5-hardening-distribution
source_scope_package: docs/scope/2026-04-15-phase5-hardening-distribution.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Phase5 Hardening Distribution

## Chosen Approach
- Harden the existing operator lifecycle instead of broadening capability scope: improve lifecycle truthfulness across install, doctor/readiness, run, upgrade, and uninstall; tighten packaging/distribution readiness around the current release contract; and surface language support boundaries as `supported`, `limited`, or `fallback-only`.
- This is enough for Phase 5 because it improves operator trust for the current documented product path without drifting into broad platform or ecosystem parity work.

## Impacted Surfaces
- Diagnostics/readiness:
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `packages/runtime/src/diagnostics/capture-snapshot.test.ts`
  - `scripts/check-doctor-snapshot.mjs`
- Packaging/distribution lifecycle:
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/uninstall.sh`
  - `scripts/test-installers.sh`
  - `scripts/verify-release-artifacts.sh`
  - `scripts/package-release.sh`
  - `.github/workflows/release-and-smoke.yml`
  - `.github/workflows/nightly-smoke.yml`
- Language support boundary surfacing:
  - `packages/intelligence/src/parser/tree-sitter-init.ts`
  - `packages/intelligence/src/symbols/extract-symbols.ts`
- Documentation alignment:
  - `README.md`
  - `docs/operations/release-and-install.md`
  - `docs/homebrew.md`
  - `docs/troubleshooting.md`

## Boundaries And Components
- Keep Phase 5 inside the current global/release distribution model already documented in the repo.
- Do not add new workflow lanes, hosted distribution models, arbitrary target-project validation support, or broad platform parity claims.
- Treat diagnostics as a classification and inspectability improvement, not as a rewrite of the runtime health model.
- Treat language expansion as support-boundary surfacing first; no broad multi-language parity promise is approved for this phase.

## Interfaces And Data Contracts
- `doctor` output should explicitly classify healthy, degraded, unsupported, or misconfigured states rather than implying success from partial readiness.
- Machine-readable doctor snapshot may expand only as needed to support failure-class classification and CI/nightly regression checks.
- Language-facing surfaces should expose a truthful status model:
  - `supported`: real grammar-backed/runtime-backed path for the surfaced capability
  - `limited`: partial support exists but not all downstream capabilities are guaranteed
  - `fallback-only`: heuristics or degraded behavior only

## Risks And Trade-offs
- Existing doctor behavior already reports multiple signals; the risk is adding more output without making failure classes clearer.
- Packaging scripts already include checksum and rollback behavior in some paths; implementation must unify and clarify outcomes without contradicting that contract.
- Grammar presence alone does not justify full language support claims; downstream capability depth must control the reported support level.
- Documentation drift is a real risk because operator docs and maintainer reality must remain aligned.

## Recommended Path
- Choose one bounded hardening path: operator-visible lifecycle truthfulness.
- Deliver explicit diagnostics classification first, then packaging/distribution hardening, then language support boundary surfacing, then documentation alignment.

## Implementation Slices

### Slice 1: lifecycle diagnostics classification
- **Files**:
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `packages/runtime/src/diagnostics/capture-snapshot.test.ts`
  - `scripts/check-doctor-snapshot.mjs`
- **Goal**: make `doctor` and related readiness signals explicitly distinguish install/distribution problems, runtime/workspace readiness problems, capability/tooling degradation, and relevant unsupported or limited states.
- **Validation Command**:
  - `npm run check`
  - `npm test`
- **Details**:
  - Preserve the current product-path vs compatibility/runtime-path distinction.
  - Prefer a small number of explicit failure classes over broad new health sections.
  - Keep degraded and unsupported states visible in both human-readable and machine-readable outputs.
  - Reviewer focus: no false `OK` path when a required lifecycle dependency is degraded.

### Slice 2: packaging and lifecycle readiness hardening
- **Files**:
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/uninstall.sh`
  - `scripts/test-installers.sh`
  - `scripts/verify-release-artifacts.sh`
  - `scripts/package-release.sh`
  - `.github/workflows/release-and-smoke.yml`
  - `.github/workflows/nightly-smoke.yml`
  - `docs/operations/release-and-install.md`
- **Goal**: make install, upgrade, uninstall, artifact verification, and release smoke behavior feel like one supported lifecycle with inspectable outcomes.
- **Validation Command**:
  - `make release-all`
  - `scripts/verify-release-artifacts.sh dist/releases`
  - `scripts/test-installers.sh dist/releases`
  - `npm run check`
  - `npm test`
- **Details**:
  - Preserve checksum verification, backup/rollback behavior, and supported release artifact flow.
  - Tighten failure reporting so operators can distinguish bad artifact state, unsupported platform, and post-install runtime verification failure.
  - Keep CI/nightly validation aligned with the documented lifecycle rather than inventing a second readiness story.

### Slice 3: bounded language support boundary surfacing
- **Files**:
  - `packages/intelligence/src/parser/tree-sitter-init.ts`
  - `packages/intelligence/src/symbols/extract-symbols.ts`
  - `README.md`
  - `docs/troubleshooting.md`
- **Goal**: surface which language/file surfaces are `supported`, `limited`, or `fallback-only` using current runtime reality.
- **Validation Command**:
  - `npm run check`
  - `npm test`
- **Details**:
  - Do not promise broad new language parity in Phase 5.
  - Use current parser and fallback behavior as the truth source for boundary reporting.
  - If a surface falls back to heuristics, that limitation must be inspectable rather than implied.
  - Reviewer focus: support labels must reflect capability depth, not just grammar availability.

### Slice 4: operator and maintainer doc alignment
- **Files**:
  - `README.md`
  - `docs/operations/release-and-install.md`
  - `docs/homebrew.md`
  - `docs/troubleshooting.md`
- **Goal**: align operator-facing and maintainer-facing docs with the hardened lifecycle and explicit support boundaries.
- **Validation Command**:
  - no repo-native doc validation command exists; use targeted manual review against the scripts, workflows, and diagnostics output changed in Slices 1-3
- **Details**:
  - Keep Windows and unsupported-platform limitations explicit.
  - Keep product-path claims aligned with the current release/install contract.
  - Avoid vague quality claims such as “stable everywhere” or “full multi-language support”.

## Dependency Graph
- Critical path: `Slice 1 -> Slice 2 -> Slice 3 -> Slice 4`
- Rationale:
  - diagnostics classification defines the failure vocabulary
  - packaging hardening must use the same lifecycle truth model
  - language boundary surfacing should follow the same explicit support-label discipline
  - docs must reflect the final implemented behavior

## Parallelization Assessment

- parallel_mode: `none`
- why: diagnostics, packaging, language support boundaries, and docs all share one operator contract; allowing overlap increases the risk of contradictory lifecycle claims.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: verify that lifecycle diagnostics classification, packaging outcomes, and support-boundary wording all agree before QA begins.
- max_active_execution_tracks: `1`

## Validation Matrix
- Install/bootstrap ambiguity reduced
  - Validation: installer tests, release artifact verification, targeted review of install/upgrade failure messaging
- Product-path vs compatibility/runtime-path distinction preserved
  - Validation: doctor output review plus doctor snapshot regression checks
- Upgrade and uninstall treated as supported lifecycle steps
  - Validation: `scripts/test-installers.sh dist/releases`, workflow smoke coverage, runbook alignment review
- Degraded/unsupported states surfaced explicitly
  - Validation: `npm test`, targeted diagnostics tests, QA spot-check of degraded scenarios
- Language support boundaries truthful
  - Validation: targeted tests where added, plus manual QA review that labels match actual parser/fallback behavior

## Integration Checkpoint
- Before handoff to QA, confirm all of the following together:
  - `doctor` clearly classifies at least one degraded scenario in each class it claims to report
  - release/install scripts still pass the documented artifact verification and lifecycle path
  - upgrade and uninstall outcomes remain inspectable
  - language support labels in code and docs match actual runtime behavior

## Rollback Notes
- If diagnostics classification becomes noisy or contradictory, revert to the last truthful, simpler status model rather than shipping broader but ambiguous reporting.
- If packaging hardening introduces lifecycle regressions, preserve the pre-Phase-5 installer/upgrade semantics and narrow the change to messaging or verification only.
- If support-boundary reporting cannot be made truthful for a language surface, downgrade it to `limited` or `fallback-only` rather than expanding implementation scope.

## Reviewer Focus Points
- Preserve bounded scope: no broad stabilization or parity claims.
- Ensure no contradiction between scripts, workflows, doctor output, and docs.
- Ensure healthy/degraded/unsupported/misconfigured states are explicit.
- Ensure support boundaries reflect real capability depth.

## Non-Goals
- Broad “works everywhere” platform parity
- New workflow lanes or workflow-contract redesign
- Arbitrary app build/lint/test support for external projects
- Marketplace or hosted-service distribution models
- Windows installer parity beyond current repository reality
- Full multi-language capability parity
