import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginConfigService } from "./plugin-config.js";
import { loadPlugins } from "./plugin-loader.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-plugin-loader-"));
  fs.mkdirSync(path.join(repo, "plugins"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("loadPlugins", () => {
  it("loads declarative plugin JSON with a fingerprint", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "plugins", "policy.json"), JSON.stringify({
      id: "policy",
      name: "Policy",
      hooks: {
        "permission.ask": { decision: "deny", reason: "no" },
      },
    }));
    new PluginConfigService(repo).addPlugin({ id: "policy", path: "plugins/policy.json" });

    const report = loadPlugins(repo);

    expect(report.plugins[0]).toMatchObject({
      id: "policy",
      name: "Policy",
      loaded: true,
      hooks: ["permission.ask"],
    });
    expect(report.plugins[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("isolates malformed plugin files as load failures", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "plugins", "bad.json"), "{");
    new PluginConfigService(repo).addPlugin({ id: "bad", path: "plugins/bad.json" });

    const report = loadPlugins(repo);

    expect(report.plugins[0]).toMatchObject({
      id: "bad",
      loaded: false,
      error: expect.stringContaining("Could not parse plugin"),
    });
  });
});
