# Plugin MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-only declarative plugins with deterministic hook execution and CLI lifecycle.

**Architecture:** Store plugin registry in `.dh/plugins/plugins.json`, load repo-local JSON plugin files, execute hook declarations sequentially with timeout/error isolation, and expose `dh plugin list/add`.

**Tech Stack:** TypeScript ESM, Vitest, Node `fs/path`, existing extension fingerprint helpers.

---

## Task 1: Plugin Config And Loader

- [ ] Write failing `plugin-config` and `plugin-loader` tests.
- [ ] Implement plugin types/config/loader.
- [ ] Run `npm test -- plugin-config plugin-loader`.
- [ ] Commit `feat: add local plugin loader`.

## Task 2: Plugin Hooks

- [ ] Write failing `plugin-hooks` tests for deterministic order, timeout, and error isolation.
- [ ] Implement hook execution.
- [ ] Run `npm test -- plugin-hooks`.
- [ ] Commit `feat: add plugin hook execution`.

## Task 3: Plugin CLI

- [ ] Write failing `plugin` CLI/root tests.
- [ ] Implement `apps/cli/src/commands/plugin.ts` and root registration.
- [ ] Run `npm test -- plugin root`.
- [ ] Commit `feat: add plugin cli`.

## Task 4: Parity And Verification

- [ ] Update parity report/root status.
- [ ] Run `npm test -- plugin extension root parity-report`.
- [ ] Run `npm run check`.
- [ ] Commit `docs: update plugin parity status`.
