import crypto from "node:crypto";
import fs from "node:fs";
import type { DeclarativePlugin, LoadedPluginRecord, PluginHookName, PluginLoadReport } from "./plugin-api.js";
import { PLUGIN_HOOK_NAMES } from "./plugin-api.js";
import { PluginConfigService } from "./plugin-config.js";
import { resolveRepoPath } from "../tools/tool-paths.js";

export function loadPlugins(repoRoot: string): PluginLoadReport {
  const config = new PluginConfigService(repoRoot).listPlugins();
  return {
    plugins: config.plugins.map((entry): LoadedPluginRecord => {
      if (!entry.enabled) {
        return {
          id: entry.id,
          path: entry.path,
          enabled: false,
          loaded: false,
          hooks: [],
          timeoutMs: entry.timeoutMs,
          error: "Plugin is disabled.",
        };
      }
      try {
        const resolved = resolveRepoPath(repoRoot, entry.path);
        const raw = fs.readFileSync(resolved.absolutePath, "utf8");
        const plugin = parsePlugin(raw, entry.id);
        return {
          id: entry.id,
          name: plugin.name,
          path: entry.path,
          enabled: true,
          loaded: true,
          hooks: Object.keys(plugin.hooks).filter(isPluginHookName),
          fingerprint: crypto.createHash("sha256").update(raw).digest("hex"),
          plugin,
          timeoutMs: entry.timeoutMs,
        };
      } catch (error) {
        return {
          id: entry.id,
          path: entry.path,
          enabled: true,
          loaded: false,
          hooks: [],
          timeoutMs: entry.timeoutMs,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  };
}

function parsePlugin(raw: string, expectedId: string): DeclarativePlugin {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse plugin '${expectedId}': ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Plugin '${expectedId}' must be a JSON object.`);
  }
  const plugin = parsed as DeclarativePlugin;
  if (plugin.id !== expectedId) {
    throw new Error(`Plugin file id '${plugin.id}' does not match registry id '${expectedId}'.`);
  }
  if (!plugin.hooks || typeof plugin.hooks !== "object") {
    throw new Error(`Plugin '${expectedId}' must declare hooks.`);
  }
  return plugin;
}

function isPluginHookName(value: string): value is PluginHookName {
  return (PLUGIN_HOOK_NAMES as readonly string[]).includes(value);
}
