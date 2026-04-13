# Scope Package: Quality Gates Runtime Unification (DH)

**Date:** 2026-04-13  
**Owner:** DH runtime / workflow team

## Problem Statement

Quality-gate semantics are fragmented across workflow, browser verification, diagnostics, and audit surfaces. We need one bounded runtime contract to unify gate vocabulary and evidence reporting without expanding into CI, remote execution, dashboards, plugin registry work, or lane topology redesign.

## In Scope

1. Introduce **bounded quality-gates runtime contract v1**.
2. Lock a **fixed catalog of 6 gates**:
   - `rule_scan`
   - `security_scan`
   - `workflow_gate`
   - `local_verification`
   - `structural_evidence`
   - `browser_verification`
3. Standardize gate availability vocabulary:
   - `available`
   - `unavailable`
   - `not_configured`
4. Standardize gate result vocabulary:
   - `pass`
   - `fail`
   - `not_run`
5. Integrate unified gate reporting with:
   - workflow aggregation in quick/delivery/migration
   - doctor verification health
   - audit/diagnostics surfaces
6. Honest surfacing for `rule_scan` and `security_scan` when `unavailable`/`not_configured`.

## Out of Scope

- CI platform or remote execution integration
- dashboarding/alerting system work
- plugin gate registry or dynamic gate registration
- full Semgrep/security ecosystem rollout
- lane/stage topology changes

## Acceptance Criteria

1. Contract v1 exists with fixed 6-gate catalog and normalized vocabularies.
2. Workflow lanes publish unified quality-gate aggregate outputs.
3. Doctor includes verification health snapshot from the unified contract.
4. Audit/diagnostics surfaces expose unified gate data using existing foundations.
5. `rule_scan` and `security_scan` report `unavailable`/`not_configured` honestly (no fake execution).
6. Changes remain additive and bounded to existing runtime surfaces.
