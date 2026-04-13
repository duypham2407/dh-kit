import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ExtensionRuntimeStateStoreFile,
  createEmptyStore,
  type ExtensionRuntimeStateStore,
} from "./extension-runtime-state-store.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-extension-runtime-state-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function statePath(repo: string): string {
  return path.join(repo, ".dh", "runtime", "extension-runtime-state.json");
}

afterEach(() => {
  for (const repo of repos) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("ExtensionRuntimeStateStoreFile", () => {
  it("returns empty store when file does not exist", () => {
    const repo = makeRepo();
    const store = new ExtensionRuntimeStateStoreFile(repo);

    const result = store.read();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.store).toEqual(createEmptyStore());
  });

  it("writes and reads v1 store", () => {
    const repo = makeRepo();
    const store = new ExtensionRuntimeStateStoreFile(repo);
    const input: ExtensionRuntimeStateStore = {
      version: "v1",
      records: {
        augment_context_engine: {
          version: "v1",
          extensionId: "augment_context_engine",
          fingerprint: "abc123",
          loadCount: 1,
        },
      },
    };

    const writeResult = store.write(input);
    expect(writeResult.ok).toBe(true);

    const readResult = store.read();
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      return;
    }
    expect(readResult.store).toEqual(input);
  });

  it("rejects malformed JSON store", () => {
    const repo = makeRepo();
    fs.mkdirSync(path.dirname(statePath(repo)), { recursive: true });
    fs.writeFileSync(statePath(repo), "{bad-json", "utf8");
    const store = new ExtensionRuntimeStateStoreFile(repo);

    const result = store.read();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("malformed");
  });

  it("rejects invalid schema version", () => {
    const repo = makeRepo();
    fs.mkdirSync(path.dirname(statePath(repo)), { recursive: true });
    fs.writeFileSync(
      statePath(repo),
      `${JSON.stringify({ version: "v0", records: {} }, null, 2)}\n`,
      "utf8",
    );
    const store = new ExtensionRuntimeStateStoreFile(repo);

    const result = store.read();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("unsupported schema version");
  });
});
