# ADR: Optional worktree wrapper decision (No-Go) for operator-safe program

**Date:** 2026-04-13  
**Status:** Accepted

## Context

The operator-safe project/worktree program requires a formal decision on optional git worktree wrapper adoption after core lifecycle phases (contract, snapshot, temp lifecycle, bounded apply, reporting, maintenance) stabilize.

## Decision

**No-Go in this program wave.**

DH keeps internal temp workspace lifecycle as the default and sufficient isolation path for the current bounded operation catalog (`index_workspace`).

## Rationale

1. Core lifecycle now exists and is operational without requiring git worktree dependency.
2. No measured recurring isolation gap currently requires wrapper-level complexity.
3. Introducing wrapper now increases risk of scope drift toward VCS/worktree parity behaviors.

## Consequences

- The program closes successfully without wrapper implementation.
- Future wrapper reconsideration must pass explicit gate:
  - demonstrated recurring isolation gap,
  - reuse of existing preflight/snapshot/report/maintenance lifecycle,
  - strict optionality,
  - no branch lifecycle/platform expansion.
