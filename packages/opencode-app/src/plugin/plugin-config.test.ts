import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginConfigService } from "./plugin-config.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-plugin-config-"));
  fs.mkdirSync(path.join(repo, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(repo, "plugins", "policy.json"), JSON.stringify({ id: "policy", hooks: {} }));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("PluginConfigService", () => {
  it("adds and lists repo-local plugin entries", () => {
    const repo = makeRepo();
    const service = new PluginConfigService(repo);

    const added = service.addPlugin({ id: "policy", path: "plugins/policy.json" });

    expect(added).toMatchObject({ id: "policy", path: "plugins/policy.json", enabled: true });
    expect(new PluginConfigService(repo).listPlugins().plugins).toEqual([added]);
  });

  it("refuses duplicate plugin ids", () => {
    const repo = makeRepo();
    const service = new PluginConfigService(repo);

    service.addPlugin({ id: "policy", path: "plugins/policy.json" });

    expect(() => service.addPlugin({ id: "policy", path: "plugins/policy.json" })).toThrow("Plugin 'policy' already exists.");
  });

  it("rejects plugin paths outside the repository", () => {
    const service = new PluginConfigService(makeRepo());

    expect(() => service.addPlugin({ id: "bad", path: "../bad.json" })).toThrow("outside the repository");
  });
});
