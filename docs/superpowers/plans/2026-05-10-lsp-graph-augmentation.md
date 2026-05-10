# LSP Graph Augmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mockable LSP diagnostics/symbol boundary that augments DH retrieval without claiming Rust graph replacement.

**Architecture:** Define LSP client/report types, add a TypeScript/JavaScript server catalog, route operations through `LspService`, expose tool wrappers and `dh lsp diagnostics`, and merge optional live LSP evidence into retrieval reports.

**Tech Stack:** TypeScript ESM, Vitest, Node `fs/path`, existing CLI command pattern, existing retrieval result types.

---

## Task 1: LSP Catalog And Service

- [ ] Write failing `lsp-server-catalog` and `lsp-service` tests.
- [ ] Implement `lsp-client.ts`, `lsp-server-catalog.ts`, and `lsp-service.ts`.
- [ ] Run `npm test -- lsp`.
- [ ] Commit `feat: add lsp service boundary`.

## Task 2: LSP Tool Wrappers

- [ ] Write failing `lsp-tool` tests for diagnostics and unavailable operations.
- [ ] Implement `packages/opencode-app/src/tools/lsp-tool.ts`.
- [ ] Run `npm test -- lsp-tool lsp`.
- [ ] Commit `feat: add lsp tool wrappers`.

## Task 3: LSP CLI

- [ ] Write failing `apps/cli/src/commands/lsp.test.ts` and root help tests.
- [ ] Implement `apps/cli/src/commands/lsp.ts` and root registration.
- [ ] Run `npm test -- lsp root`.
- [ ] Commit `feat: add lsp diagnostics cli`.

## Task 4: Retrieval And Parity

- [ ] Write failing retrieval/parity tests for live LSP evidence as non-canonical augmentation.
- [ ] Update retrieval report shape and parity status.
- [ ] Run `npm test -- lsp lsp-tool run-retrieval root parity-report`.
- [ ] Run `npm run check`.
- [ ] Commit `docs: update lsp parity status`.
