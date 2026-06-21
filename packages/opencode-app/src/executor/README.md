# executor/

Hook-enforcement modules for the lane workflows. **This directory is LIVE — it is wired into the
worker bundle, not dormant.**

These modules implement the policy-enforcement surface (tool usage, skill activation, MCP routing,
answer gating) that the original design assigned to "6 Go hooks". The Go core is gone; enforcement
now runs in the TypeScript worker, called from the lane workflows and backed by the Rust
`HookDispatcher` / SQLite audit log.

## Live path into the worker bundle

```
worker-main.ts (bundle entry, scripts/build-worker-bundle.sh)
  -> worker/worker-command-router.ts
    -> workflows/run-lane-command.ts
      -> workflows/delivery.ts  &  workflows/migration.ts   (import enforceMcpRoutingDetailed)
        -> executor/enforce-mcp-routing.ts
```

So `enforce-mcp-routing.ts` reaches the shipped bundle through the `delivery`/`migration` lanes.
Several modules here also import runtime values from `@dh/opencode-sdk`
(`../../../opencode-sdk/src/index.js`) — see that package's README.

## Module notes

- `enforce-mcp-routing.ts` — live; imported by `delivery.ts` and `migration.ts`.
- `enforce-tool-usage.ts`, `enforce-skill-activation.ts`, `answer-gating.ts` — enforcement helpers
  in the same surface.
- `hook-enforcer.ts` — the `HookEnforcer` class has **no external caller in the current tree**
  (only its own test). Retained intentionally: it sits in the live enforcement dir and imports SDK
  runtime values (`buildBridgeEnvelopeContext`, `writeHookDecision`). Treat as a known quantity, not
  silent dead weight; if pruning, verify no lane path has started using it first.
