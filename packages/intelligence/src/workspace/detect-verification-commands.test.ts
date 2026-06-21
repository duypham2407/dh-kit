import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectVerificationCommands } from "./detect-verification-commands.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-detect-verify-"));
  repos.push(repo);
  return repo;
}

function write(repo: string, rel: string, content: string): void {
  fs.mkdirSync(path.join(repo, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), content, "utf8");
}

afterEach(() => {
  for (const repo of repos) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("detectVerificationCommands", () => {
  it("returns an empty list for an unrecognized repo", async () => {
    const repo = makeRepo();
    write(repo, "README.md", "# hi\n");

    expect(await detectVerificationCommands(repo)).toEqual([]);
  });

  it("derives node commands from package.json scripts only for scripts that exist", async () => {
    const repo = makeRepo();
    write(
      repo,
      "package.json",
      JSON.stringify({
        scripts: { typecheck: "tsc --noEmit", test: "vitest run", build: "tsup" },
      }),
    );

    const commands = await detectVerificationCommands(repo);
    const byKind = new Map(commands.map((c) => [c.kind, c.command]));

    expect(byKind.get("typecheck")).toBe("npm run typecheck");
    expect(byKind.get("build")).toBe("npm run build");
    expect(byKind.get("test")).toBe("npm test");
    // No lint script declared → no lint command fabricated.
    expect(byKind.has("lint")).toBe(false);
  });

  it("picks the package manager from the lockfile", async () => {
    const repo = makeRepo();
    write(repo, "package.json", JSON.stringify({ scripts: { test: "vitest run" } }));
    write(repo, "pnpm-lock.yaml", "lockfileVersion: 9\n");

    const [command] = await detectVerificationCommands(repo);
    expect(command?.command).toBe("pnpm test");
  });

  it("orders fast gates before the test suite", async () => {
    const repo = makeRepo();
    write(
      repo,
      "package.json",
      JSON.stringify({ scripts: { test: "vitest run", typecheck: "tsc --noEmit" } }),
    );

    const kinds = (await detectVerificationCommands(repo)).map((c) => c.kind);
    expect(kinds.indexOf("typecheck")).toBeLessThan(kinds.indexOf("test"));
  });

  it("detects rust commands from Cargo.toml", async () => {
    const repo = makeRepo();
    write(repo, "Cargo.toml", "[package]\nname = \"demo\"\n");

    const commands = await detectVerificationCommands(repo);
    expect(commands.map((c) => c.command)).toEqual(["cargo check", "cargo test"]);
  });

  it("detects go commands from go.mod", async () => {
    const repo = makeRepo();
    write(repo, "go.mod", "module demo\n\ngo 1.22\n");

    const commands = await detectVerificationCommands(repo);
    expect(commands.map((c) => c.command)).toContain("go test ./...");
  });

  it("emits a pytest command only with a real pytest signal", async () => {
    const withSignal = makeRepo();
    write(withSignal, "pyproject.toml", "[tool.pytest.ini_options]\n");
    expect((await detectVerificationCommands(withSignal)).map((c) => c.command)).toContain(
      "python -m pytest",
    );

    const withoutSignal = makeRepo();
    write(withoutSignal, "requirements.txt", "requests==2.0\n");
    expect(await detectVerificationCommands(withoutSignal)).toEqual([]);
  });
});
