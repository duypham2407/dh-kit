# Server SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local headless HTTP server and SDK client for DH.

**Architecture:** Use Node `http` without new dependencies, expose JSON routes, keep localhost default, require password for non-localhost binds, and add a fetch-based SDK client.

**Tech Stack:** TypeScript ESM, Vitest, Node `http`, existing runtime/session/provider/MCP services.

---

## Task 1: Server Core And Routes

- [ ] Write failing server route tests.
- [ ] Implement `packages/server/src/server.ts` and route modules.
- [ ] Run `npm test -- server`.
- [ ] Commit `feat: add local headless server`.

## Task 2: SDK Client

- [ ] Write failing SDK tests.
- [ ] Implement `packages/sdk/src/client.ts`.
- [ ] Run `npm test -- sdk server`.
- [ ] Commit `feat: add server sdk client`.

## Task 3: Serve CLI And Parity

- [ ] Write failing serve CLI/root/parity tests.
- [ ] Implement `apps/cli/src/commands/serve.ts` and root registration.
- [ ] Run `npm test -- serve root parity-report`.
- [ ] Run `npm test -- server sdk serve root parity-report`.
- [ ] Run `npm run check`.
- [ ] Commit `docs: update server sdk parity status`.
