# Parity Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-readable OpenCode parity contract to `dh doctor --json` so DH reports truthful supported, partial, planned, deferred, and out-of-scope surfaces before deeper runtime changes.

**Architecture:** Keep the first parity snapshot static and deterministic: shared TypeScript types define the contract, a runtime diagnostics module builds the report, and `runDoctor()` embeds it in both `diagnostics` and `snapshot`. This avoids pretending runtime discovery exists before Rust owns all surfaces, while giving later milestones a stable JSON shape to update.

**Tech Stack:** TypeScript ESM, Vitest, existing `packages/runtime/src/diagnostics/doctor.ts`, existing CLI `doctor --json`, docs under `docs/scope/` and `docs/solution/`.

---

## File Structure

- Create: `packages/shared/src/types/parity.ts`
  - Owns the public TypeScript contract for parity categories, statuses, entries, summary, and report shape.
- Create: `packages/runtime/src/diagnostics/parity-report.ts`
  - Owns the deterministic OpenCode-to-DH parity matrix and aggregation logic.
- Create: `packages/runtime/src/diagnostics/parity-report.test.ts`
  - Proves unsupported OpenCode surfaces are not reported as supported and validates summary aggregation.
- Modify: `packages/runtime/src/diagnostics/doctor.ts`
  - Imports the parity report, adds it to `DoctorReport.diagnostics`, `DoctorSnapshot`, plain-text summary, and recommended actions.
- Modify: `packages/runtime/src/diagnostics/doctor.test.ts`
  - Verifies `runDoctor()` includes the parity section and the text output is explicit about the boundary.
- Modify: `apps/cli/src/commands/doctor.test.ts`
  - Verifies `dh doctor --json` exposes the parity section through the CLI payload.
- Create: `docs/scope/2026-05-10-opencode-gap-parity-contract.md`
  - Product scope for the parity contract milestone.
- Create: `docs/solution/2026-05-10-opencode-gap-parity-contract.md`
  - Implementation notes and acceptance criteria for this slice.

## Contract Decisions

- Categories are fixed to:
  - `runtime`
  - `cli`
  - `session`
  - `provider`
  - `mcp`
  - `tool`
  - `agent`
  - `lsp`
  - `plugin`
  - `server`
  - `tui`
  - `github`
  - `packaging`
- Statuses are fixed to:
  - `supported`
  - `partial`
  - `planned`
  - `deferred`
  - `out_of_scope`
- `dh doctor --json` must expose parity at:
  - `payload.diagnostics.parity`
  - `payload.snapshot.parity`
- The first snapshot is intentionally conservative. `ask`, `explain`, `trace`, `index`, and `doctor` can be listed as DH-supported surfaces; OpenCode surfaces such as `run`, `serve`, `web`, `attach`, `session`, `providers`, `models`, `mcp`, `agent`, `plugin`, `stats`, `db`, `github`, `pr`, and `acp` must remain missing until implemented.
- The report's `recommendedNextMilestone` is `Milestone 1: Rust Runtime Authority For All Command Paths`.

## Task 1: Add Shared Parity Types

**Files:**
- Create: `packages/shared/src/types/parity.ts`

- [ ] **Step 1: Write the type file**

Create `packages/shared/src/types/parity.ts` with:

```ts
export const PARITY_CATEGORIES = [
  "runtime",
  "cli",
  "session",
  "provider",
  "mcp",
  "tool",
  "agent",
  "lsp",
  "plugin",
  "server",
  "tui",
  "github",
  "packaging",
] as const;

export type ParityCategory = typeof PARITY_CATEGORIES[number];

export const PARITY_STATUSES = [
  "supported",
  "partial",
  "planned",
  "deferred",
  "out_of_scope",
] as const;

export type ParityStatus = typeof PARITY_STATUSES[number];

export type ParityPriority = "P0" | "P1" | "P2" | "P3";

export type ParityFeature = {
  category: ParityCategory;
  surface: string;
  opencodeSurface: string[];
  dhSurface: string[];
  status: ParityStatus;
  priority: ParityPriority;
  missingCommandSurfaces: string[];
  missingRuntimeCapabilities: string[];
  nextMilestone: string;
  notes: string[];
};

export type ParitySummary = {
  total: number;
  byStatus: Record<ParityStatus, number>;
  byCategory: Record<ParityCategory, ParityStatus>;
  missingCommandSurfaces: string[];
  missingRuntimeCapabilities: string[];
  recommendedNextMilestone: string;
};

export type ParityReport = {
  source: "opencode-gap-roadmap";
  baseline: {
    dh: string;
    opencode: string;
  };
  categories: readonly ParityCategory[];
  statuses: readonly ParityStatus[];
  features: ParityFeature[];
  summary: ParitySummary;
};
```

- [ ] **Step 2: Run TypeScript check for the new file**

Run: `npm run check`

Expected before integration: TypeScript may pass because the file is standalone. If it fails, the failure should be a real syntax/type error in `parity.ts`; fix that before moving on.

## Task 2: Add Failing Parity Report Tests

**Files:**
- Create: `packages/runtime/src/diagnostics/parity-report.test.ts`
- Depends on: `packages/runtime/src/diagnostics/parity-report.ts`, which does not exist yet.

- [ ] **Step 1: Write failing tests**

Create `packages/runtime/src/diagnostics/parity-report.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildOpenCodeParityReport,
  OPENCODE_MISSING_COMMAND_SURFACES,
} from "./parity-report.js";
import { PARITY_CATEGORIES, PARITY_STATUSES } from "../../../shared/src/types/parity.js";

describe("buildOpenCodeParityReport", () => {
  it("reports every required parity category and status vocabulary", () => {
    const report = buildOpenCodeParityReport();

    expect(report.categories).toEqual(PARITY_CATEGORIES);
    expect(report.statuses).toEqual(PARITY_STATUSES);
    expect(Object.keys(report.summary.byCategory).sort()).toEqual([...PARITY_CATEGORIES].sort());
    expect(Object.keys(report.summary.byStatus).sort()).toEqual([...PARITY_STATUSES].sort());
  });

  it("does not claim missing OpenCode command surfaces are supported", () => {
    const report = buildOpenCodeParityReport();

    expect(report.summary.missingCommandSurfaces).toEqual(OPENCODE_MISSING_COMMAND_SURFACES);
    expect(report.summary.missingCommandSurfaces).toEqual(
      expect.arrayContaining([
        "run",
        "serve",
        "web",
        "attach",
        "session",
        "export",
        "import",
        "providers",
        "models",
        "mcp",
        "agent",
        "plugin",
        "stats",
        "db",
        "github",
        "pr",
        "acp",
      ]),
    );
    expect(report.summary.missingCommandSurfaces).not.toEqual(
      expect.arrayContaining(["ask", "explain", "trace", "index", "doctor"]),
    );
    expect(
      report.features.filter((feature) => feature.status === "supported").flatMap((feature) => feature.missingCommandSurfaces),
    ).toEqual([]);
  });

  it("recommends Rust runtime authority as the next milestone", () => {
    const report = buildOpenCodeParityReport();

    expect(report.summary.recommendedNextMilestone).toBe("Milestone 1: Rust Runtime Authority For All Command Paths");
    expect(report.summary.byStatus.partial).toBeGreaterThan(0);
    expect(report.summary.byStatus.planned).toBeGreaterThan(0);
    expect(report.summary.byStatus.deferred).toBeGreaterThan(0);
    expect(report.summary.byStatus.out_of_scope).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- parity-report`

Expected: FAIL with a module resolution error for `./parity-report.js` because the implementation has not been created.

## Task 3: Implement Deterministic Parity Report

**Files:**
- Create: `packages/runtime/src/diagnostics/parity-report.ts`
- Test: `packages/runtime/src/diagnostics/parity-report.test.ts`

- [ ] **Step 1: Add implementation**

Create `packages/runtime/src/diagnostics/parity-report.ts` with:

```ts
import {
  PARITY_CATEGORIES,
  PARITY_STATUSES,
  type ParityCategory,
  type ParityFeature,
  type ParityReport,
  type ParityStatus,
} from "../../../shared/src/types/parity.js";

export const OPENCODE_MISSING_COMMAND_SURFACES = [
  "run",
  "serve",
  "web",
  "attach",
  "session",
  "export",
  "import",
  "providers",
  "models",
  "mcp",
  "agent",
  "plugin",
  "stats",
  "db",
  "github",
  "pr",
  "acp",
] as const;

const RECOMMENDED_NEXT_MILESTONE = "Milestone 1: Rust Runtime Authority For All Command Paths";

const FEATURES: ParityFeature[] = [
  {
    category: "runtime",
    surface: "Runtime authority",
    opencodeSurface: ["server/session/tool runtime", "event stream", "permission decisions"],
    dhSurface: ["Rust-hosted ask/explain/trace lifecycle", "TypeScript worker compatibility path"],
    status: "partial",
    priority: "P0",
    missingCommandSurfaces: [],
    missingRuntimeCapabilities: ["single Rust lifecycle authority for lane, run, session, provider, MCP, and tool paths"],
    nextMilestone: RECOMMENDED_NEXT_MILESTONE,
    notes: ["Rust is authoritative for first-wave knowledge commands only."],
  },
  {
    category: "cli",
    surface: "CLI command surface",
    opencodeSurface: ["run", "serve", "web", "attach", "session", "export", "import", "providers", "models", "mcp", "agent", "plugin", "stats", "db", "github", "pr", "acp"],
    dhSurface: ["ask", "explain", "trace", "index", "doctor", "quick", "delivery", "migrate", "config", "semantic-cleanup", "operator-safe-maintenance"],
    status: "partial",
    priority: "P0",
    missingCommandSurfaces: [...OPENCODE_MISSING_COMMAND_SURFACES],
    missingRuntimeCapabilities: ["OpenCode-like direct interactive run loop", "headless server command surface", "session import/export UX"],
    nextMilestone: "Milestone 2: dh run Direct Interactive Loop",
    notes: ["Existing DH commands are useful but do not cover the OpenCode daily interactive surface."],
  },
  {
    category: "session",
    surface: "Session product lifecycle",
    opencodeSurface: ["session list", "session delete", "continue", "fork", "export", "import", "share", "stats"],
    dhSurface: ["session primitives", "workflow state", "SQLite repositories"],
    status: "partial",
    priority: "P0",
    missingCommandSurfaces: ["session", "export", "import", "stats"],
    missingRuntimeCapabilities: ["stable cross-command resume/fork contract", "session event stream", "product-level session commands"],
    nextMilestone: "Milestone 3: Session Product Parity",
    notes: ["Session storage exists, but product-level parity is not exposed."],
  },
  {
    category: "provider",
    surface: "Provider and model lifecycle",
    opencodeSurface: ["providers list/login/logout", "models", "models.dev refresh"],
    dhSurface: ["AI SDK provider registry", "legacy provider/model listing"],
    status: "partial",
    priority: "P0",
    missingCommandSurfaces: ["providers", "models"],
    missingRuntimeCapabilities: ["credential lifecycle", "provider verification", "model refresh"],
    nextMilestone: "Milestone 4: Provider And Model Lifecycle",
    notes: ["Provider adapters exist; operator auth and refresh UX remain incomplete."],
  },
  {
    category: "mcp",
    surface: "MCP lifecycle",
    opencodeSurface: ["mcp add", "mcp list", "mcp auth", "mcp logout", "mcp debug", "OAuth callback"],
    dhSurface: ["MCP routing", "MCP auth status", "audit surfaces"],
    status: "partial",
    priority: "P1",
    missingCommandSurfaces: ["mcp"],
    missingRuntimeCapabilities: ["first-class MCP management commands", "OAuth callback handling", "runtime MCP server lifecycle"],
    nextMilestone: "Milestone 5: MCP Lifecycle",
    notes: ["Routing and status hardening exist; command lifecycle parity remains open."],
  },
  {
    category: "tool",
    surface: "Tool runtime catalog",
    opencodeSurface: ["read", "write", "edit", "bash", "glob", "grep", "apply_patch", "task", "todo", "webfetch", "websearch", "lsp"],
    dhSurface: ["retrieval tools", "bridge tools", "audit/enforcement records"],
    status: "partial",
    priority: "P1",
    missingCommandSurfaces: [],
    missingRuntimeCapabilities: ["OpenCode-equivalent tool schemas", "permission prompts", "streaming tool output", "tool result envelopes"],
    nextMilestone: "Milestone 6: Tool Runtime And Permissions",
    notes: ["DH has enforcement primitives but not an OpenCode-equivalent runtime catalog."],
  },
  {
    category: "agent",
    surface: "Agent and subagent runtime",
    opencodeSurface: ["agent create", "agent list", "task subagent", "build/plan/general agents"],
    dhSurface: ["workflow lanes", "role registry", "team roles"],
    status: "partial",
    priority: "P1",
    missingCommandSurfaces: ["agent"],
    missingRuntimeCapabilities: ["runtime agent registry", "subagent task delegation", "agent selection in run loop"],
    nextMilestone: "Milestone 7: Agent/Subagent Runtime",
    notes: ["DH roles can map into agents, but the runtime agent surface is not exposed."],
  },
  {
    category: "lsp",
    surface: "LSP graph augmentation",
    opencodeSurface: ["diagnostics", "hover", "definition", "references", "workspace symbols", "call hierarchy"],
    dhSurface: ["Rust structural graph", "semantic retrieval"],
    status: "planned",
    priority: "P2",
    missingCommandSurfaces: [],
    missingRuntimeCapabilities: ["LSP client service", "diagnostics tool", "symbol operation tools"],
    nextMilestone: "Milestone 8: LSP Graph Augmentation",
    notes: ["Rust graph remains the base; LSP should augment it rather than replace it."],
  },
  {
    category: "plugin",
    surface: "Plugin ecosystem",
    opencodeSurface: ["server hooks", "TUI hooks", "command hooks", "tool hooks", "chat hooks", "session hooks"],
    dhSurface: ["extension-state fingerprint", "drift reporting", "minimal plugin contract docs"],
    status: "planned",
    priority: "P2",
    missingCommandSurfaces: ["plugin"],
    missingRuntimeCapabilities: ["server plugin API", "deterministic hook order", "bounded compatibility contract"],
    nextMilestone: "Milestone 9: Plugin MVP",
    notes: ["Existing extension observability is not a plugin ecosystem."],
  },
  {
    category: "server",
    surface: "Headless server and SDK",
    opencodeSurface: ["serve", "SDK client/server architecture"],
    dhSurface: [],
    status: "planned",
    priority: "P2",
    missingCommandSurfaces: ["serve"],
    missingRuntimeCapabilities: ["local HTTP/WebSocket server", "session/event/provider/MCP APIs", "SDK client"],
    nextMilestone: "Milestone 10: Server/SDK",
    notes: ["Server should build on the run/session/event contract after it is stable."],
  },
  {
    category: "tui",
    surface: "Terminal UI",
    opencodeSurface: ["OpenTUI interactive client", "attach"],
    dhSurface: [],
    status: "planned",
    priority: "P2",
    missingCommandSurfaces: ["attach"],
    missingRuntimeCapabilities: ["TUI client", "permission UI", "model/agent switch UI", "session attachment"],
    nextMilestone: "Milestone 11: TUI MVP",
    notes: ["TUI should attach to the same event stream as dh run and server."],
  },
  {
    category: "github",
    surface: "GitHub and PR automation",
    opencodeSurface: ["github", "pr import", "pr checkout"],
    dhSurface: [],
    status: "deferred",
    priority: "P3",
    missingCommandSurfaces: ["github", "pr"],
    missingRuntimeCapabilities: ["GitHub auth", "PR import/checkout workflow", "GitHub agent integration"],
    nextMilestone: "Milestone 12: GitHub/PR Automation",
    notes: ["This depends on session import/export and provider/tool runtime stability."],
  },
  {
    category: "packaging",
    surface: "Desktop/cloud console",
    opencodeSurface: ["desktop package", "console package", "cloud/provider account surfaces"],
    dhSurface: ["local CLI release assets"],
    status: "out_of_scope",
    priority: "P3",
    missingCommandSurfaces: [],
    missingRuntimeCapabilities: ["desktop app", "cloud console", "remote share service"],
    nextMilestone: "No milestone until local/server/TUI surfaces prove stable",
    notes: ["This is intentionally outside the first parity program."],
  },
];

export function buildOpenCodeParityReport(): ParityReport {
  return {
    source: "opencode-gap-roadmap",
    baseline: {
      dh: "v0.3.1-rc.7 / 506b0af",
      opencode: "dev / 903d81819",
    },
    categories: PARITY_CATEGORIES,
    statuses: PARITY_STATUSES,
    features: FEATURES.map((feature) => ({
      ...feature,
      opencodeSurface: [...feature.opencodeSurface],
      dhSurface: [...feature.dhSurface],
      missingCommandSurfaces: [...feature.missingCommandSurfaces],
      missingRuntimeCapabilities: [...feature.missingRuntimeCapabilities],
      notes: [...feature.notes],
    })),
    summary: buildSummary(FEATURES),
  };
}

function buildSummary(features: ParityFeature[]): ParityReport["summary"] {
  const byStatus = Object.fromEntries(PARITY_STATUSES.map((status) => [status, 0])) as Record<ParityStatus, number>;
  const byCategory = Object.fromEntries(PARITY_CATEGORIES.map((category) => [category, "planned"])) as Record<ParityCategory, ParityStatus>;
  const missingCommandSurfaces = new Set<string>();
  const missingRuntimeCapabilities = new Set<string>();

  for (const feature of features) {
    byStatus[feature.status] += 1;
    byCategory[feature.category] = feature.status;
    for (const command of feature.missingCommandSurfaces) missingCommandSurfaces.add(command);
    for (const capability of feature.missingRuntimeCapabilities) missingRuntimeCapabilities.add(capability);
  }

  return {
    total: features.length,
    byStatus,
    byCategory,
    missingCommandSurfaces: OPENCODE_MISSING_COMMAND_SURFACES.filter((command) => missingCommandSurfaces.has(command)),
    missingRuntimeCapabilities: Array.from(missingRuntimeCapabilities).sort(),
    recommendedNextMilestone: RECOMMENDED_NEXT_MILESTONE,
  };
}
```

- [ ] **Step 2: Run parity report tests to verify GREEN**

Run: `npm test -- parity-report`

Expected: PASS. The test output should show `packages/runtime/src/diagnostics/parity-report.test.ts` passing.

## Task 4: Add Failing Doctor Integration Tests

**Files:**
- Modify: `packages/runtime/src/diagnostics/doctor.test.ts`
- Modify: `apps/cli/src/commands/doctor.test.ts`

- [ ] **Step 1: Add runtime doctor test**

Append this test inside `describe("runDoctor", () => { ... })` in `packages/runtime/src/diagnostics/doctor.test.ts`:

```ts
  it("includes an OpenCode parity contract without claiming missing surfaces", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.summary).toContain("OpenCode parity:");
    expect(report.summary).toContain("recommended next milestone: Milestone 1: Rust Runtime Authority For All Command Paths");
    expect(report.diagnostics.parity.source).toBe("opencode-gap-roadmap");
    expect(report.snapshot.parity.summary.missingCommandSurfaces).toEqual(
      expect.arrayContaining(["run", "serve", "web", "attach", "session", "providers", "models", "mcp", "agent", "plugin"]),
    );
    expect(report.snapshot.parity.summary.missingCommandSurfaces).not.toEqual(
      expect.arrayContaining(["ask", "explain", "trace", "index", "doctor"]),
    );
    expect(report.actions).toEqual(
      expect.arrayContaining([
        "OpenCode parity is incomplete: implement Milestone 1: Rust Runtime Authority For All Command Paths before claiming run/session/provider/MCP parity.",
      ]),
    );
  });
```

- [ ] **Step 2: Add CLI doctor JSON test assertions**

In `apps/cli/src/commands/doctor.test.ts`, inside `it("prints machine-readable doctor output with --json", ...)`, add these assertions after the existing `runtimePingLifecycleSeam` checks:

```ts
    expect(payload.diagnostics.parity.source).toBe("opencode-gap-roadmap");
    expect(payload.diagnostics.parity.summary.recommendedNextMilestone).toBe("Milestone 1: Rust Runtime Authority For All Command Paths");
    expect(payload.snapshot.parity.summary.missingCommandSurfaces).toEqual(
      expect.arrayContaining(["run", "serve", "web", "attach", "session", "providers", "models", "mcp", "agent", "plugin"]),
    );
    expect(payload.snapshot.parity.summary.missingCommandSurfaces).not.toEqual(
      expect.arrayContaining(["ask", "explain", "trace", "index", "doctor"]),
    );
```

- [ ] **Step 3: Run doctor tests to verify RED**

Run: `npm test -- doctor`

Expected: FAIL because `diagnostics.parity` and `snapshot.parity` do not exist yet.

## Task 5: Integrate Parity Report Into Doctor

**Files:**
- Modify: `packages/runtime/src/diagnostics/doctor.ts`
- Test: `packages/runtime/src/diagnostics/doctor.test.ts`
- Test: `apps/cli/src/commands/doctor.test.ts`

- [ ] **Step 1: Import parity report and type**

In `packages/runtime/src/diagnostics/doctor.ts`, add:

```ts
import { buildOpenCodeParityReport } from "./parity-report.js";
import type { ParityReport } from "../../../shared/src/types/parity.js";
```

- [ ] **Step 2: Extend report types**

In `DoctorReport.diagnostics`, add:

```ts
    parity: ParityReport;
```

In `DoctorSnapshot`, add:

```ts
  parity: ParityReport;
```

- [ ] **Step 3: Build parity report in `runDoctor()`**

After `const qualityGateAvailability = getQualityGateAvailabilitySnapshot(repoRoot);`, add:

```ts
  const parityReport = buildOpenCodeParityReport();
```

- [ ] **Step 4: Add parity action**

After the quality-gate action block, add:

```ts
  if (parityReport.summary.byStatus.supported < parityReport.summary.total) {
    actions.push("OpenCode parity is incomplete: implement Milestone 1: Rust Runtime Authority For All Command Paths before claiming run/session/provider/MCP parity.");
  }
```

- [ ] **Step 5: Add text summary section**

In `summaryLines`, after the `Parser freshness (Rust engine status truth):` section and before `Lifecycle classification:`, add:

```ts
    "",
    "OpenCode parity:",
    `  source: ${parityReport.source}`,
    `  baseline: DH ${parityReport.baseline.dh}; OpenCode ${parityReport.baseline.opencode}`,
    `  features: total=${parityReport.summary.total}, supported=${parityReport.summary.byStatus.supported}, partial=${parityReport.summary.byStatus.partial}, planned=${parityReport.summary.byStatus.planned}, deferred=${parityReport.summary.byStatus.deferred}, out_of_scope=${parityReport.summary.byStatus.out_of_scope}`,
    `  missing commands: ${parityReport.summary.missingCommandSurfaces.join(", ")}`,
    `  recommended next milestone: ${parityReport.summary.recommendedNextMilestone}`,
    "  boundary: this is a conservative parity contract; unsupported OpenCode surfaces remain missing until implemented and verified",
```

- [ ] **Step 6: Add parity to returned diagnostics and snapshot**

In the returned `diagnostics` object, add:

```ts
      parity: parityReport,
```

In the returned `snapshot` object, add:

```ts
      parity: parityReport,
```

- [ ] **Step 7: Run doctor tests to verify GREEN**

Run: `npm test -- doctor`

Expected: PASS for doctor-related tests.

## Task 6: Add Scope And Solution Docs

**Files:**
- Create: `docs/scope/2026-05-10-opencode-gap-parity-contract.md`
- Create: `docs/solution/2026-05-10-opencode-gap-parity-contract.md`

- [ ] **Step 1: Create scope doc**

Create `docs/scope/2026-05-10-opencode-gap-parity-contract.md` with:

```md
# OpenCode Gap Parity Contract Scope

Date: 2026-05-10

## Goal

Expose a truthful, machine-readable OpenCode parity contract through `dh doctor --json`.

## In Scope

- Static parity categories and statuses.
- Conservative OpenCode-to-DH feature matrix.
- Missing OpenCode command surfaces in `diagnostics.parity.summary.missingCommandSurfaces`.
- Missing runtime capabilities in `diagnostics.parity.summary.missingRuntimeCapabilities`.
- Plain-text doctor summary showing the next milestone.
- Tests proving DH does not claim missing OpenCode surfaces as supported.

## Out Of Scope

- Implementing `dh run`.
- Implementing session commands.
- Implementing provider login/logout.
- Implementing MCP lifecycle commands.
- Implementing TUI, web, server, desktop, or GitHub automation.

## Acceptance

- `npm test -- parity-report`
- `npm test -- doctor`
- `npm run check`
- `dh doctor --json` includes `diagnostics.parity` and `snapshot.parity`.
```

- [ ] **Step 2: Create solution doc**

Create `docs/solution/2026-05-10-opencode-gap-parity-contract.md` with:

```md
# OpenCode Gap Parity Contract Solution

Date: 2026-05-10

## Approach

The first parity contract is deterministic and static. It does not probe OpenCode or infer runtime support from naming. Runtime discovery can replace parts of the matrix only after Rust owns the related lifecycle paths.

## Files

- `packages/shared/src/types/parity.ts` defines contract types.
- `packages/runtime/src/diagnostics/parity-report.ts` builds the report.
- `packages/runtime/src/diagnostics/parity-report.test.ts` verifies report truthfulness.
- `packages/runtime/src/diagnostics/doctor.ts` exposes the report.
- `packages/runtime/src/diagnostics/doctor.test.ts` and `apps/cli/src/commands/doctor.test.ts` verify runtime and CLI JSON payloads.

## JSON Shape

`dh doctor --json` exposes:

```json
{
  "diagnostics": {
    "parity": {
      "source": "opencode-gap-roadmap",
      "summary": {
        "recommendedNextMilestone": "Milestone 1: Rust Runtime Authority For All Command Paths"
      }
    }
  },
  "snapshot": {
    "parity": {
      "source": "opencode-gap-roadmap"
    }
  }
}
```

## Risk Control

- The report lists missing OpenCode command surfaces explicitly.
- Supported DH knowledge commands are not mixed into OpenCode missing command lists.
- Doctor text says the parity contract is conservative and bounded.
- Tests fail if missing OpenCode command surfaces disappear without implementation updates.
```

- [ ] **Step 3: Verify docs are present**

Run: `rg "OpenCode Gap Parity Contract" docs/scope/2026-05-10-opencode-gap-parity-contract.md docs/solution/2026-05-10-opencode-gap-parity-contract.md`

Expected: Both files contain the title.

## Task 7: Final Verification

**Files:**
- All files touched by this milestone.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- parity-report`

Expected: PASS.

- [ ] **Step 2: Run doctor tests**

Run: `npm test -- doctor`

Expected: PASS.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --manifest-path rust-engine/Cargo.toml`

Expected: PASS. If Rust tests fail for a pre-existing environment issue unrelated to this TypeScript/docs milestone, capture the failing command output in the final report and do not claim full verification.

- [ ] **Step 5: Inspect git diff**

Run: `git diff --stat`

Expected: Changes are limited to:

```text
apps/cli/src/commands/doctor.test.ts
docs/scope/2026-05-10-opencode-gap-parity-contract.md
docs/solution/2026-05-10-opencode-gap-parity-contract.md
docs/superpowers/plans/2026-05-10-parity-contract.md
packages/runtime/src/diagnostics/doctor.test.ts
packages/runtime/src/diagnostics/doctor.ts
packages/runtime/src/diagnostics/parity-report.test.ts
packages/runtime/src/diagnostics/parity-report.ts
packages/shared/src/types/parity.ts
```

## Self-Review

Spec coverage:

- Parity categories are covered in Task 1 and Task 3.
- Status vocabulary is covered in Task 1 and Task 3.
- `dh doctor --json` parity exposure is covered in Task 4 and Task 5.
- Tests proving unsupported surfaces are not claimed are covered in Task 2 and Task 4.
- Docs distinguishing DH differentiation from parity are covered in Task 6.

Placeholder scan:

- The placeholder scan found no prohibited markers, empty error-handling instructions, or cross-task shorthand.

Type consistency:

- The plan uses `ParityReport`, `ParityFeature`, `ParityCategory`, `ParityStatus`, `buildOpenCodeParityReport`, and `OPENCODE_MISSING_COMMAND_SURFACES` consistently across implementation and tests.
