---
artifact_type: scope_package
version: 1
status: ready_for_solution
feature_id: POSIX-TARGET-PLATFORM-CLARITY
feature_slug: posix-target-platform-clarity
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Posix Target Platform Clarity

## Goal

- Make the OpenKit/DH supported platform target explicit as **Linux and macOS** wherever product, operator, release, and install wording describes platform support.
- Remove ambiguity that Windows parity, Windows install hardening, or Windows-specific release assets are near-term product commitments.
- Preserve the current product/runtime behavior; this feature is documentation and inspectability only.

## Target Users

- Operators installing or upgrading OpenKit/DH.
- Maintainers writing product, release, install, operator, or runtime-facing documentation.
- Delivery agents deciding whether platform-related work belongs in Linux/macOS support scope or should be rejected as Windows expansion.

## Problem Statement

The product currently serves Linux and macOS, while prior Windows-specific hardening work was blocked/cancelled because Windows is not a target platform. Any product/operator-facing wording that implies generic cross-platform parity or near-term Windows support can send maintainers and operators toward unnecessary Windows installer, upgrade, PowerShell, or asset work. The repository needs a clear, inspectable product truth that Linux and macOS are the supported target platforms and Windows support work remains out of scope unless a future product decision explicitly changes that target.

## In Scope

- Update product-facing documentation wording that describes supported platforms, install expectations, upgrade expectations, release readiness, operator guidance, or compatibility posture.
- Update operator/runtime-facing documentation where platform support language affects how users install, launch, diagnose, or maintain the product.
- Update release/install wording so supported-platform claims name Linux and macOS directly instead of using ambiguous generic cross-platform language.
- Add or update lightweight inspectability checks only if needed to prevent platform truth drift in docs, metadata, or release/install wording.
- Preserve the historical fact that previous Windows-specific hardening was blocked/cancelled because it is unnecessary for the current product target.
- Keep wording factual about current target platforms without promising future platform expansion.

## Out of Scope

- Adding Windows support.
- Adding Windows unsupported-install hardening, graceful Windows blocking, or Windows-specific remediation behavior.
- Adding or changing PowerShell installers.
- Adding Windows release assets, packaging, CI jobs, or validation paths.
- Implementing generic cross-platform parity expansion.
- Changing runtime behavior, installer behavior, dependency behavior, workflow-state behavior, or platform detection logic solely for Windows.
- Reopening, replacing, or completing the cancelled Windows-specific hardening work item.

## Main Flows

- As an operator, I want install and upgrade wording to state that Linux and macOS are supported, so that I do not assume Windows is a supported or near-term target.
- As a maintainer, I want docs and release wording to use one consistent supported-platform truth, so that future work does not accidentally reintroduce Windows parity expectations.
- As a delivery agent, I want scope boundaries to distinguish platform-clarity docs from platform-support implementation, so that I do not create Windows hardening tasks under this feature.

## Business Rules

- Supported target platforms must be stated as **Linux and macOS** where platform support is discussed.
- Windows must not be described as a supported target platform for the current product.
- Windows must not be described as a near-term parity target, planned install target, or release-readiness requirement.
- If Windows is mentioned, the wording must clarify that Windows is not currently targeted or that Windows-specific hardening is out of scope for this product target.
- Product path wording must remain aligned with the current operator commands: `npm install -g @duypham93/openkit`, `openkit run`, `openkit doctor`, `openkit upgrade`, and `openkit uninstall`.
- Compatibility/runtime wording must preserve the path split between global install/product surfaces and repository-local compatibility/runtime surfaces; this feature must not collapse those concepts.
- Lightweight tests/checks, if added, must inspect wording or metadata truth only; they must not require Windows execution or introduce Windows support behavior.

## Operator / Runtime Truth Rules

- Operator-facing install, upgrade, doctor, run, uninstall, and release guidance must treat Linux and macOS as the supported operating systems.
- Runtime-facing documentation may describe compatibility surfaces, workflow state, and global-install paths, but must not imply those surfaces provide Windows support.
- Release/install wording may use “supported platforms” only when the same section or sentence identifies Linux and macOS.
- Generic terms such as “cross-platform,” “all platforms,” or “platform independent” must not be used for operator install/release support unless constrained to the Linux/macOS target.
- Any mention of the prior Windows hardening item must identify it as blocked/cancelled due to being unnecessary, not as deferred required work.

## Acceptance Criteria Matrix

| ID | Acceptance expectation | Inspectable evidence |
|---|---|---|
| AC-1 | Product/operator-facing docs that mention supported platforms explicitly identify Linux and macOS as the current target platforms. | Documentation review or text search shows platform-support sections name Linux and macOS. |
| AC-2 | Release/install wording does not imply Windows parity, Windows readiness, or generic all-platform support. | Release/install docs are reviewed for “Windows,” “cross-platform,” “all platforms,” and similar wording; any retained wording is constrained to Linux/macOS or out-of-scope status. |
| AC-3 | The cancelled Windows-specific hardening context is represented accurately when referenced. | Any reference says Windows-specific hardening was blocked/cancelled because Windows is not a target platform. |
| AC-4 | No implementation work for Windows support or unsupported-install hardening is introduced. | Changed files do not add Windows installer/runtime code, PowerShell assets, Windows packaging, Windows CI, or platform-detection behavior for support hardening. |
| AC-5 | Operator/runtime truth stays aligned with the current path model. | Updated wording preserves global product path vs repository-local compatibility/runtime surface distinctions. |
| AC-6 | If lightweight checks are added, they verify documentation/metadata wording only and can run without a Windows host. | Check definitions, if present, operate on repository text/metadata and have no Windows execution dependency. |
| AC-7 | The final solution handoff can list all touched product/operator/release/install surfaces and explain how each now reflects Linux/macOS support. | Solution package includes a surface-by-surface validation list. |

## Edge Cases

- Existing wording may use “cross-platform” to mean OpenCode/OpenKit runtime portability in a generic sense; Solution Lead must decide whether to replace it, constrain it, or leave it only if it cannot be interpreted as install/support parity.
- Windows may appear in historical/archive context; historical references may remain if clearly marked as history and not current support intent.
- Documentation may mention Node.js, npm, OpenCode, or POSIX shell assumptions; these must not be rewritten into broader OS guarantees.
- Linux distribution-specific support is not being defined here; the acceptance target is Linux/macOS clarity, not distro certification.
- macOS architecture-specific claims, package manager claims, or shell-specific claims should not be invented unless already documented elsewhere.

## Error And Failure Cases

- If required docs are missing or there is no release/install surface to update, the implementation should document that absence rather than invent new surfaces.
- If current repository wording conflicts with the Linux/macOS-only product target, the conflicting wording should be corrected or explicitly marked historical/out of scope.
- If an existing automated check would require Windows availability, it must not be added under this feature.
- If maintainers find a true product requirement for Windows support during implementation, that must be escalated as a new product decision, not handled inside this feature.

## Open Questions

- None blocking Solution Lead planning. The user has explicitly stated Linux and macOS are the supported product targets and Windows is not a target platform.

## Success Signal

- A maintainer or operator reading current product/operator/release/install documentation can determine that Linux and macOS are supported targets and that Windows support/hardening is not part of current product scope.
- A delivery agent can inspect changed docs and any lightweight checks without rediscovering platform intent or reopening Windows hardening work.

## Handoff Notes For Solution Lead

- Preserve the scope boundary: this is a wording/inspectability feature, not a platform-support feature.
- Identify current product, operator, release, install, and runtime-facing docs before proposing edits; do not update historical/archive material unless current docs depend on it or it creates active ambiguity.
- Prefer narrow wording changes over broad documentation restructuring.
- If adding checks, keep them lightweight and repository-text based; do not introduce a new platform support test matrix.
- Solution package should include validation steps for platform wording drift and confirm no Windows implementation surfaces are added.
