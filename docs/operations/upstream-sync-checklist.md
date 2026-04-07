# Upstream Sync Checklist

Use this checklist every time you pull changes from upstream `opencode-ai/opencode` into the DH fork at `packages/opencode-core/`.

## Baseline

- **Upstream repo:** `github.com/opencode-ai/opencode`
- **Current upstream commit:** `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
- **Module path rewrite:** `github.com/opencode-ai/opencode` -> `github.com/duypham93/dh/packages/opencode-core`
- **Last sync date:** 2026-04-07

## Pre-Sync

- [ ] Record current upstream commit in this file
- [ ] Run `go test ./... -count=1` and confirm green
- [ ] Run `go build ./...` and confirm clean
- [ ] Commit any pending work-in-progress

## Sync Process

### 1. Fetch upstream changes

```sh
# Add upstream remote if not present
git remote add upstream-opencode https://github.com/opencode-ai/opencode.git || true
git fetch upstream-opencode main
```

### 2. Identify changed upstream files

```sh
# Compare upstream commits
git log --oneline 73ee493..upstream-opencode/main -- internal/
```

### 3. Apply module-path rewrite to new/changed files

For any new or changed files from upstream:
- Replace `github.com/opencode-ai/opencode` with `github.com/duypham93/dh/packages/opencode-core` in all import paths
- Copy files into the corresponding location under `packages/opencode-core/`

### 4. Manual merge for conflict-prone files

The following 8 files contain DH patches and require manual merge:

| File | DH patches | Merge risk |
|---|---|---|
| `internal/app/app.go` | `NewServiceWithDB()` call (1 line) | Low |
| `internal/config/config.go` | `ensureDefaultAgents()` error return + branding defaults | Medium |
| `internal/llm/agent/agent.go` | dhhooks model override + error strings (16 lines) | Medium |
| `internal/llm/agent/mcp-tools.go` | dhhooks MCP routing + ordering + intent (~60 lines) | High |
| `internal/llm/prompt/prompt.go` | dhhooks skill activation injection (11 lines) | Low |
| `internal/llm/provider/provider.go` | dhhooks model override in factory (7 lines) | Low |
| `internal/session/session.go` | dhhooks session state + stateStore (~50 lines) | High |
| `internal/llm/tools/bash.go` | Commit template branding (4 lines) | Low |

**Merge strategy for each:**

1. Accept the upstream version first
2. Re-apply DH patches using the patch points documented in `PATCHES.md`
3. Verify the DH hook dispatch calls still compile and point to correct function signatures

### 5. Check for new upstream files

- If upstream adds new files under `internal/`, copy them with module-path rewrite
- If upstream adds new packages, check if DH needs to hook into them
- If upstream adds new tools, verify they don't conflict with DH-delegated TS commands

### 6. Check for upstream dependency changes

```sh
# Compare go.mod
diff packages/opencode-core/go.mod <upstream-go.mod>
```

- Add any new upstream dependencies
- Resolve version conflicts (prefer upstream versions unless DH has a specific pin)
- Run `go mod tidy`

### 7. Re-apply branding patches

If upstream touched any of these areas, re-apply the DH branding:

| Area | DH value | Upstream value |
|---|---|---|
| `config.go` defaultDataDirectory | `.dh` | `.opencode` |
| `config.go` appName | `dh` | `opencode` |
| `config.go` defaultContextPaths | `dh.md`, `DH.md` | `OpenCode.md`, `opencode.md` |
| `config.go` debug env var | `DH_DEV_DEBUG` | `OPENCODE_DEV_DEBUG` |
| `config.go` default theme | `dh` | `opencode` |
| `db/connect.go` DB filename | `dh.db` | `opencode.db` |
| `fileutil/fileutil.go` ignore map | `.dh` | `.opencode` |
| `custom_commands.go` paths | `.dh/commands` | `.opencode/commands` |
| `chat/chat.go` logo | `DH` | `OpenCode` |
| `icons.go` icon constant | `DHIcon` | `OpenCodeIcon` |
| `theme/dh.go` registration | `"dh"`, `DHTheme` | `"opencode"`, `OpenCodeTheme` |
| `theme/manager.go` sort | `"dh"` | `"opencode"` |
| `prompt/coder.go` identity | `DH` | `OpenCode` |
| `prompt/coder.go` memory file | `dh.md` | `OpenCode.md` |
| `prompt/task.go` identity | `DH` | `OpenCode` |
| `provider/provider.go` X-Title | `DH` | `OpenCode` |
| `provider/provider.go` Referer | `opencode.ai` (keep) | `opencode.ai` |
| `provider/copilot.go` headers | `DH/1.0` | `OpenCode/1.0` |
| `agent/mcp-tools.go` client name | `DH` | `OpenCode` |
| `tools/bash.go` commit footer | `DH`/`noreply@dh.ai` | `opencode`/`noreply@opencode.ai` |
| `tools/fetch.go` User-Agent | `dh/1.0` | `opencode/1.0` |
| `tools/sourcegraph.go` User-Agent | `dh/1.0` | `opencode/1.0` |
| `tools/shell/shell.go` temp prefix | `dh-` | `opencode-` |
| `logging/logger.go` panic prefix | `dh-panic-` | `opencode-panic-` |
| `diff/diff.go` theme name | `dh-theme` | `opencode-theme` |
| `tui/tui.go` init prompt | `dh.md` | `OpenCode.md` |
| `dialog/init.go` memory ref | `dh.md` | `OpenCode.md` |

## Post-Sync Verification

- [ ] `go build ./...` passes
- [ ] `go test ./... -count=1` passes
- [ ] Run `rg 'opencode|OpenCode' --type go internal/ | grep -v 'opencode-core'` — only `opencode.ai` Referer should remain
- [ ] Verify DH hook injection still works: `go test ./internal/dhhooks/ ./internal/hooks/ ./internal/session/ ./internal/llm/agent/ ./cmd/dh/ -count=1`
- [ ] Update `FORK_ORIGIN.md` with new upstream commit hash
- [ ] Update `PATCHES.md` if patch points changed
- [ ] Update the "Current upstream commit" field at the top of this file
- [ ] Commit with message: `chore: sync upstream opencode <new-commit-hash>`

## Patch-Owned Files (will NOT conflict with upstream)

These files are entirely DH-original. Upstream sync will not touch them:

| Package | Files |
|---|---|
| `internal/bridge/` | 7 files (bridge interface + SQLite reader + tests) |
| `internal/dhhooks/` | 2 files (central dispatch + tests) |
| `internal/hooks/` | 12 files (registry + hook types + bridge adapters + tests) |
| `internal/clibundle/` | 2 files (embedded TS CLI runner + test) |
| `internal/session/` | 5 dh-original files (`dh_state*.go` + injection test) |
| `internal/llm/agent/` | 12 dh-original files (`pre_*_policy*.go`, `pre_answer_context*.go`, `pre_answer_action*.go`, `mcp_intent_test.go`, `mcp_tools_order_test.go`) |
| `internal/config/` | 1 dh-original file (`config_defaults_test.go`) |
| `cmd/dh/` | 3 files (main + tests) |
| `pkg/types/` | 1 file |

Total: ~45 dh-original files that will never conflict with upstream.

## Decision Rules

When merging upstream changes:

1. **New upstream file** -> Copy with module-path rewrite. No further action unless DH needs to hook it.
2. **Changed pure-upstream file** -> Replace with new version + module-path rewrite.
3. **Changed conflict-prone file** -> Accept upstream first, then re-apply DH patches from `PATCHES.md`.
4. **Deleted upstream file** -> Remove from DH fork. Check if any DH-original files imported it.
5. **New upstream dependency** -> Add to `go.mod`. Run `go mod tidy`.
6. **Upstream renames** -> Follow the rename, update module-path rewrite, update any DH patches that reference the old name.
