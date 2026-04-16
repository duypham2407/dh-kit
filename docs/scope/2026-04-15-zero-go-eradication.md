---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: ZERO-GO-ERADICATION
feature_slug: zero-go-eradication
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Zero Go Eradication

## Goal
- Remove remaining active Go code and confusing active Go traces from the repository so the supported product path is clearly Rust + TypeScript only.

## Target Users
- Operators who install, run, diagnose, upgrade, and uninstall OpenKit through the supported path.
- Maintainers who rely on current repository docs, runtime surfaces, release guidance, and workflow documentation.

## Problem Statement
- Prior work removed Go from the active supported operator, release, CI, and runtime path, but the repository still contains Go residue and Go-facing references that can mislead people into thinking Go is still supported.
- This work item is broader than the prior migration: it is a zero-Go repository/product surface cleanup, not only removal from the active path.
- The opportunity is to make the current supported path unambiguous while preserving the supported Rust + TypeScript product behavior.

## In Scope
- Remove active Go implementation residue that is no longer part of the supported product path.
- Remove or replace active docs, commands, metadata, examples, and guidance that imply Go is still a supported current path.
- Classify remaining Go-related material into one of three outcomes: remove, replace, or retain as archive-only history.
- Preserve current operator-visible install, run, doctor, upgrade, uninstall, and related supported lifecycle guidance.
- Preserve maintainer-visible guidance needed to understand and operate the supported Rust + TypeScript path.

## Out of Scope
- New product features unrelated to Go eradication.
- Broad refactors of Rust or TypeScript code not required for zero-Go clarity.
- Rewriting git history.
- Removing legitimate historical records solely because they mention Go, if they are clearly non-active and archival.
- Workflow or architecture redesign beyond what is needed to make the zero-Go product surface truthful.

## Main Flows
- As an operator, I can follow the active install and runtime guidance without seeing Go presented as part of the supported path.
- As a maintainer, I can inspect current docs and repository surfaces and understand that Rust + TypeScript is the only active supported path.
- As a maintainer, I can distinguish active documentation from historical archive material without confusion about Go support status.

## Business Rules
- “Xoá hết các dấu vết của Go” means removing Go from active supported repository and product surfaces that create current-state confusion.
- Not every historical mention of Go must be deleted; historical references may remain only when clearly archive-only and non-active.
- Any repository surface that can reasonably signal current Go support must be removed or replaced.
- Operator-visible supported workflows must continue to work without Go-related ambiguity.
- Maintainer-facing active guidance must describe the real supported Rust + TypeScript path and must not present Go as a current requirement.

## Acceptance Criteria Matrix
- **Given** an operator reads active install, run, doctor, upgrade, or uninstall guidance, **when** they follow the supported path, **then** Go is not presented as a required or supported part of that path.
- **Given** a maintainer inspects active repository guidance and runtime-facing documentation, **when** they review current supported architecture, **then** Rust + TypeScript is the only active supported path described.
- **Given** remaining Go-related repository material, **when** it is reviewed after this work, **then** each item is clearly either removed, replaced, or retained as archive-only history.
- **Given** archive-only Go references remain, **when** a maintainer encounters them, **then** they are clearly non-active and do not imply present support.
- **Given** current supported operator-visible behavior, **when** this work is complete, **then** that behavior is preserved unless an explicit approved deprecation is recorded.
- **Given** the repository after completion, **when** a reasonable operator or maintainer evaluates current active surfaces, **then** they are not left uncertain about whether Go is still supported.

## Edge Cases
- Some Go residue may not be code; it may live in docs, metadata, examples, naming, or maintainer guidance.
- Some Go references may be historical and safe to retain if clearly archived.
- Some confusion may come from indirect references rather than direct runtime dependency claims.

## Error And Failure Cases
- If active documentation says Go is gone but current active repository surfaces still imply Go support, the work fails acceptance.
- If Go material is retained in active locations without clear historical framing, the work fails acceptance.
- If operator-visible supported behavior is lost without explicit approval, the work fails acceptance.

## Open Questions
- Which remaining Go files or references still serve a legitimate archive or provenance purpose versus pure confusion residue?
- Are there any hidden maintainer or diagnostic workflows that still indirectly rely on Go-facing material?
- What is the minimum archive boundary that preserves history without leaking Go into active guidance?

## Success Signal
- Current active repository surfaces communicate one clear message: Go is not part of the active supported OpenKit path, and remaining Go traces no longer create future confusion.

## Handoff Notes For Solution Lead
- Treat this as a broader cleanup/removal feature than the prior migration work item.
- Preserve the supported Rust + TypeScript operator and maintainer path while eliminating active Go confusion.
- Distinguish remove vs replace vs archive-only decisions explicitly.
- Escalate any proposed behavior loss, deprecation, or archive-boundary ambiguity instead of assuming it is acceptable.
