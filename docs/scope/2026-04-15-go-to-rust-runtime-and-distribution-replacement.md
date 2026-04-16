---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: GO-TO-RUST-MIGRATION
feature_slug: go-to-rust-runtime-and-distribution-replacement
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Go To Rust Runtime And Distribution Replacement

## Goal
- Remove remaining active Go product/runtime surfaces and align the repository's supported architecture to Rust + TypeScript while preserving current operator-visible workflows and release lifecycle behavior.

## Target Users
- Operators who install, run, diagnose, upgrade, and uninstall OpenKit through the supported product path.
- Maintainers responsible for CI, release packaging, smoke verification, and architecture-facing documentation.

## Problem Statement
- The target architecture says the product should be Rust + TypeScript with no Go in the target app architecture, but the repository still contains active Go-backed runtime, CI, build, and release surfaces.
- This leaves the shipped and documented product path inconsistent with the intended architecture and keeps normal operator and maintainer workflows dependent on Go.
- The opportunity is to remove Go from active supported product paths without breaking the workflows operators and maintainers rely on today.

## In Scope
- Define and deliver a repository state where active supported product/runtime workflows no longer require Go.
- Replace remaining active Go-owned runtime behavior that is still required for the supported product path.
- Remove Go from active CI, build, release, smoke, install, and doctor paths where it is currently a required part of the supported lifecycle.
- Preserve operator-visible install, run, doctor, upgrade, uninstall, and release lifecycle behavior unless a change is explicitly approved.
- Update active operator and maintainer documentation so it accurately describes Rust + TypeScript as the supported architecture.

## Out of Scope
- Net-new operator features unrelated to Go removal.
- Broad UX redesign of CLI, TUI, workflow model, or release process beyond what is required to preserve current behavior after Go removal.
- Rewriting historical or archive-only materials that do not affect active runtime, CI, release, or operator understanding.
- Performance or platform-support promises beyond current documented behavior unless separately approved.
- Repository-wide cleanup of every historical mention of Go if the reference is not part of an active supported surface.

## Main Flows
- As an operator, I want to install and run the product through the documented path without needing Go, so that the supported architecture matches what the product claims to be.
- As an operator, I want doctor and readiness checks to validate the real supported runtime path, so that diagnostics remain trustworthy after Go removal.
- As a maintainer, I want CI, smoke, and release workflows to verify the Rust + TypeScript product path, so that releases no longer depend on retired Go surfaces.

## Business Rules
- “Convert all Go to Rust” means removing Go as an active required product/runtime dependency for supported workflows, not rewriting every historical file immediately.
- No operator-visible capability that exists today may be silently removed as part of Go replacement.
- Any unavoidable operator-visible behavior change must be explicitly documented and approved before the work is considered complete.
- Active documentation must describe the real supported architecture and must not instruct operators to use Go for the supported path unless clearly marked historical.
- The resulting supported product path must be consistent with the stated Rust + TypeScript target architecture and must not leave Go as a hidden required runtime dependency.

## Acceptance Criteria Matrix
- **Given** a maintainer inspects the active architecture and operator documentation, **when** they review the supported product path, **then** it is described as Rust + TypeScript without Go as an active target-app runtime dependency.
- **Given** the supported operator workflows, **when** an operator performs install, run, doctor, upgrade, or uninstall through documented paths, **then** those workflows remain available without requiring Go as part of the supported product path.
- **Given** the active release and smoke lifecycle, **when** maintainers inspect release automation and release documentation, **then** the lifecycle remains defined and usable without Go-based build or test stages being required for the supported product path.
- **Given** the active CI workflows, **when** maintainers inspect required validation steps, **then** Go-specific validation is not required for the active target architecture.
- **Given** doctor, readiness, and install/distribution messaging, **when** an operator checks product readiness, **then** missing Go binaries or Go runtime assets are not reported as normal supported-path requirements.
- **Given** operator-visible capabilities that exist before this change, **when** the replacement is complete, **then** each capability is either preserved, explicitly deprecated with approval, or recorded as a blocking known gap.
- **Given** active README and operations/release guidance, **when** a maintainer follows those materials, **then** they are not directed to use Go for the active supported product lifecycle unless the reference is explicitly historical or non-active.

## Edge Cases
- Some repository Go content may be historical, reference-only, or inactive; that material should not be treated as proof that parity work is required unless it affects an active supported surface.
- Some operator-visible workflows may depend on Go indirectly through packaging, embedded artifacts, or readiness checks rather than direct operator commands.
- The repository may appear Rust-aligned in docs while still retaining Go in a less visible active release or distribution path; such hidden dependencies must still count as in-scope.

## Error And Failure Cases
- If an active Go-dependent capability cannot yet be preserved through the Rust + TypeScript path, the work is not complete unless that gap is explicitly approved as a deprecation or accepted limitation.
- If release, smoke, or doctor behavior becomes less informative after Go removal, that counts as a regression even if the product still launches.
- If CI or docs imply Go is no longer required but active release or runtime behavior still depends on Go, the work fails acceptance.

## Open Questions
- What is the authoritative list of active Go-owned surfaces that still participate in product runtime, CI, packaging, release, or smoke behavior?
- Which current operator-visible behaviors are contractual and must be preserved exactly versus acceptable to restate with explicit approval?
- Are any Go-dependent surfaces already functionally superseded by Rust but still wired into CI, documentation, or release checks?
- Does any part of `packages/opencode-core/` remain an active supported surface that requires parity work, versus historical/reference-only material that can be retired?
- Is a transitional compatibility window required, or is the intended acceptance target a clean cutover with no active Go path?

## Success Signal
- Active architecture, operator, and maintainer documentation consistently describe a Rust + TypeScript supported path.
- Active CI and release surfaces no longer depend on Go as part of normal product verification.
- Operators can still follow a coherent supported lifecycle for install, run, doctor, upgrade, uninstall, and release-related workflows.
- Any remaining Go references are clearly historical, non-active, or intentionally deferred and do not block the supported product path.

## Handoff Notes For Solution Lead
- Treat this as a large cross-boundary replacement with strong parity expectations, not as repo-wide cleanup for its own sake.
- Preserve operator-visible workflows and release lifecycle behavior first; do not assume technical simplification is acceptable if it removes a visible capability.
- Distinguish active supported surfaces from historical residue before proposing slices.
- Call out any product-level behavior change, deprecation, or compatibility gap that needs explicit approval instead of burying it inside implementation planning.
