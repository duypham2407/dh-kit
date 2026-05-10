# Plugin System MVP Design

## Goal

Milestone 9 adds a local-only plugin system with deterministic server-side hook behavior.

The MVP intentionally avoids remote/npm installs and dynamic marketplace behavior. Plugins are repo-local JSON modules that declare hook outcomes. This gives DH auditable hook ordering, timeout/error isolation, doctor/parity visibility, and a safe foundation before executable plugin APIs.

## Scope

In scope:

- Repo-local plugin registry under `.dh/plugins/plugins.json`.
- Plugin files referenced by repo-relative path only.
- `dh plugin list [--json]`.
- `dh plugin add --id <id> --path <path>`.
- Hook names: `event`, `chat.message`, `permission.ask`, `tool.execute.before`, `tool.execute.after`, `command.execute.before`, `experimental.chat.system.transform`, `experimental.chat.messages.transform`.
- Sequential hook execution in registry order.
- Timeout and error isolation.
- Plugin fingerprint/drift input records using existing extension fingerprint primitives where possible.
- Parity/root help updates.

Out of scope:

- Remote plugin install.
- npm package plugin loading.
- Arbitrary JS execution.
- TUI plugin hooks.
- Stable third-party API guarantee.

## Plugin File Format

Plugin files are JSON:

```json
{
  "id": "local-policy",
  "name": "Local Policy",
  "hooks": {
    "permission.ask": { "decision": "deny", "reason": "Local policy denied this permission." }
  }
}
```

Hook results are declarative and bounded. Future milestones can add executable JS/WASM plugins after the permission/runtime model is stable.

## Testing

- Config tests for add/list/path containment/duplicate refusal.
- Loader tests for malformed plugin files and fingerprint fields.
- Hook tests for deterministic order, timeout, and error isolation.
- CLI/root tests for list/add.
- Parity tests for local plugin MVP status.

Acceptance:

- `npm test -- plugin extension root parity-report`
- `npm run check`
