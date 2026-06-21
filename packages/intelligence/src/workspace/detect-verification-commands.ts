import fs from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic detection of the verification commands a target repository supports.
 *
 * This powers the tester agent: when a user runs a `dh` workflow inside their own repo
 * (a website, service, library, ...), the tester must run the repo's REAL verify commands
 * (typecheck/build/lint/test) and read real exit codes — never guess or hallucinate that
 * "tests passed". Detection is manifest-driven (package.json scripts, Cargo.toml, go.mod,
 * pyproject.toml); we only emit a command when its backing manifest/script actually exists.
 */

export type VerificationCommandKind = "typecheck" | "build" | "lint" | "test";

export type VerificationCommand = {
  /** Stable id, e.g. "node:test", "rust:test", "go:build". */
  id: string;
  kind: VerificationCommandKind;
  /** Shell command to run in the repo root, e.g. "npm test", "cargo test". */
  command: string;
  /** Where the command was derived from, e.g. "package.json#scripts.test". */
  source: string;
  /** Per-command timeout budget in milliseconds. */
  timeoutMs: number;
};

/** Run fast/cheap gates before the heavy test suite, so failures surface early. */
const KIND_ORDER: Record<VerificationCommandKind, number> = {
  typecheck: 0,
  build: 1,
  lint: 2,
  test: 3,
};

const TIMEOUT_BY_KIND: Record<VerificationCommandKind, number> = {
  typecheck: 120_000,
  build: 180_000,
  lint: 120_000,
  test: 300_000,
};

const MAX_COMMANDS = 6;

type NodePackageManager = "npm" | "pnpm" | "yarn" | "bun";

export async function detectVerificationCommands(repoRoot: string): Promise<VerificationCommand[]> {
  const commands: VerificationCommand[] = [];

  commands.push(...(await detectNodeCommands(repoRoot)));
  commands.push(...(await detectRustCommands(repoRoot)));
  commands.push(...(await detectGoCommands(repoRoot)));
  commands.push(...(await detectPythonCommands(repoRoot)));

  commands.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return commands.slice(0, MAX_COMMANDS);
}

async function detectNodeCommands(repoRoot: string): Promise<VerificationCommand[]> {
  const pkg = await readJsonFile<{ scripts?: Record<string, unknown> }>(path.join(repoRoot, "package.json"));
  if (!pkg) {
    return [];
  }

  const scripts = isRecord(pkg.scripts) ? pkg.scripts : {};
  const pm = await detectNodePackageManager(repoRoot);
  const commands: VerificationCommand[] = [];
  const seen = new Set<VerificationCommandKind>();

  // Map known script names to a verification kind. First match per kind wins.
  const scriptKindCandidates: Array<{ script: string; kind: VerificationCommandKind }> = [
    { script: "typecheck", kind: "typecheck" },
    { script: "type-check", kind: "typecheck" },
    { script: "check", kind: "typecheck" },
    { script: "tsc", kind: "typecheck" },
    { script: "build", kind: "build" },
    { script: "lint", kind: "lint" },
    { script: "test", kind: "test" },
  ];

  for (const candidate of scriptKindCandidates) {
    if (seen.has(candidate.kind)) {
      continue;
    }
    if (typeof scripts[candidate.script] !== "string") {
      continue;
    }
    seen.add(candidate.kind);
    commands.push({
      id: `node:${candidate.kind}`,
      kind: candidate.kind,
      command: nodeScriptCommand(pm, candidate.script),
      source: `package.json#scripts.${candidate.script}`,
      timeoutMs: TIMEOUT_BY_KIND[candidate.kind],
    });
  }

  return commands;
}

function nodeScriptCommand(pm: NodePackageManager, script: string): string {
  // `test` is a first-class lifecycle script across managers; others go through `run`.
  if (script === "test") {
    return `${pm} test`;
  }
  if (pm === "npm") {
    return `npm run ${script}`;
  }
  // pnpm/yarn/bun run scripts without the `run` keyword too, but `run` is universally valid.
  return `${pm} run ${script}`;
}

async function detectNodePackageManager(repoRoot: string): Promise<NodePackageManager> {
  if (await fileExists(path.join(repoRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await fileExists(path.join(repoRoot, "yarn.lock"))) {
    return "yarn";
  }
  if (await fileExists(path.join(repoRoot, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

async function detectRustCommands(repoRoot: string): Promise<VerificationCommand[]> {
  if (!(await fileExists(path.join(repoRoot, "Cargo.toml")))) {
    return [];
  }
  return [
    {
      id: "rust:typecheck",
      kind: "typecheck",
      command: "cargo check",
      source: "Cargo.toml",
      timeoutMs: TIMEOUT_BY_KIND.typecheck,
    },
    {
      id: "rust:test",
      kind: "test",
      command: "cargo test",
      source: "Cargo.toml",
      timeoutMs: TIMEOUT_BY_KIND.test,
    },
  ];
}

async function detectGoCommands(repoRoot: string): Promise<VerificationCommand[]> {
  if (!(await fileExists(path.join(repoRoot, "go.mod")))) {
    return [];
  }
  return [
    {
      id: "go:build",
      kind: "build",
      command: "go build ./...",
      source: "go.mod",
      timeoutMs: TIMEOUT_BY_KIND.build,
    },
    {
      id: "go:test",
      kind: "test",
      command: "go test ./...",
      source: "go.mod",
      timeoutMs: TIMEOUT_BY_KIND.test,
    },
  ];
}

async function detectPythonCommands(repoRoot: string): Promise<VerificationCommand[]> {
  const hasPyproject = await fileExists(path.join(repoRoot, "pyproject.toml"));
  const hasSetup = await fileExists(path.join(repoRoot, "setup.py"));
  const hasRequirements = await fileExists(path.join(repoRoot, "requirements.txt"));
  if (!hasPyproject && !hasSetup && !hasRequirements) {
    return [];
  }

  // Only emit a test command when there is a real signal that pytest is the runner —
  // a tests/ dir, a pytest config, or a pytest mention in pyproject/requirements.
  const pytestSignal = await hasPytestSignal(repoRoot, { hasPyproject, hasRequirements });
  if (!pytestSignal) {
    return [];
  }

  return [
    {
      id: "python:test",
      kind: "test",
      command: "python -m pytest",
      source: pytestSignal,
      timeoutMs: TIMEOUT_BY_KIND.test,
    },
  ];
}

async function hasPytestSignal(
  repoRoot: string,
  manifests: { hasPyproject: boolean; hasRequirements: boolean },
): Promise<string | null> {
  if (await fileExists(path.join(repoRoot, "pytest.ini"))) {
    return "pytest.ini";
  }
  if (await directoryExists(path.join(repoRoot, "tests"))) {
    return "tests/";
  }
  if (manifests.hasPyproject) {
    const text = await readTextFile(path.join(repoRoot, "pyproject.toml"));
    if (text && text.toLowerCase().includes("pytest")) {
      return "pyproject.toml#pytest";
    }
  }
  if (manifests.hasRequirements) {
    const text = await readTextFile(path.join(repoRoot, "requirements.txt"));
    if (text && text.toLowerCase().includes("pytest")) {
      return "requirements.txt#pytest";
    }
  }
  return null;
}

async function readJsonFile<T>(absolutePath: string): Promise<T | null> {
  const text = await readTextFile(absolutePath);
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readTextFile(absolutePath: string): Promise<string | null> {
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
