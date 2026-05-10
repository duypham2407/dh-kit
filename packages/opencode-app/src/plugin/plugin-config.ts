import fs from "node:fs";
import path from "node:path";
import type { PluginConfigEntry, PluginListReport } from "./plugin-api.js";
import { resolveRepoPath } from "../tools/tool-paths.js";

type PluginStore = {
  plugins: PluginConfigEntry[];
};

export class PluginConfigService {
  constructor(private readonly repoRoot: string) {}

  listPlugins(): PluginListReport {
    return { plugins: this.readStore().plugins.map((plugin) => ({ ...plugin })) };
  }

  addPlugin(input: { id: string; path: string; timeoutMs?: number }): PluginConfigEntry {
    validatePluginId(input.id);
    const resolved = resolveRepoPath(this.repoRoot, input.path);
    if (!fs.existsSync(resolved.absolutePath)) {
      throw new Error(`Plugin file '${input.path}' does not exist.`);
    }
    const store = this.readStore();
    if (store.plugins.some((plugin) => plugin.id === input.id)) {
      throw new Error(`Plugin '${input.id}' already exists.`);
    }
    const entry: PluginConfigEntry = {
      id: input.id,
      path: resolved.relativePath,
      enabled: true,
      timeoutMs: input.timeoutMs ?? 1000,
    };
    store.plugins.push(entry);
    this.writeStore(store);
    return { ...entry };
  }

  private storePath(): string {
    return path.join(this.repoRoot, ".dh", "plugins", "plugins.json");
  }

  private readStore(): PluginStore {
    const file = this.storePath();
    if (!fs.existsSync(file)) return { plugins: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`Could not parse plugin config at ${file}: ${(error as Error).message}`);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as PluginStore).plugins)) {
      throw new Error(`Plugin config at ${file} must contain a plugins array.`);
    }
    return { plugins: (parsed as PluginStore).plugins };
  }

  private writeStore(store: PluginStore): void {
    const file = this.storePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  }
}

function validatePluginId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("--id may only contain letters, numbers, dashes, and underscores.");
  }
}
