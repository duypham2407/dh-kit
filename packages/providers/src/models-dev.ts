import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import type { Info } from "../../shared/src/types/model.js";

const source = process.env.DH_MODELS_URL || "https://models.dev";
const cacheDir = path.join(os.homedir(), ".dh", "cache");
const filepath = path.join(cacheDir, "models.json");
const ttl = 5 * 60 * 1000;

async function ensureCacheDir() {
  await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
}

async function statCache() {
  try {
    return await fs.stat(filepath);
  } catch {
    return null;
  }
}

function fresh(mtimeMs: number) {
  return Date.now() - mtimeMs < ttl;
}

const fetchApi = async () => {
  const result = await fetch(`${source}/api.json`, {
    headers: { "User-Agent": "DH-App/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  return { ok: result.ok, text: await result.text() };
};

function lazy<T>(fn: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  const wrapped = () => {
    if (!promise) promise = fn();
    return promise;
  };
  wrapped.reset = () => {
    promise = undefined;
  };
  return wrapped;
}

export const Data = lazy(async () => {
  if (process.env.DH_DISABLE_MODELS_FETCH) return {};
  
  await ensureCacheDir();
  const stat = await statCache();
  
  if (stat && fresh(stat.mtimeMs)) {
    try {
      const data = await fs.readFile(filepath, "utf8");
      return JSON.parse(data);
    } catch {}
  }

  // Try to load snapshot
  const snapshot = await import("./models-snapshot.js")
    .then((m) => m.snapshot as Record<string, unknown>)
    .catch(() => undefined);
    
  if (snapshot && (!stat || !fresh(stat.mtimeMs))) {
    // If we have a snapshot but no valid cache, we try fetch first
  }

  try {
    const result2 = await fetchApi();
    if (result2.ok) {
      await fs.writeFile(filepath, result2.text);
      return JSON.parse(result2.text);
    }
  } catch (e) {
    console.error("Failed to fetch models.dev", e);
  }

  // Fallback to cache if fetch fails
  try {
    const data = await fs.readFile(filepath, "utf8");
    return JSON.parse(data);
  } catch {}

  // Fallback to snapshot
  if (snapshot) return snapshot;

  return {};
});

export async function get(): Promise<Record<string, Info>> {
  const result = await Data();
  return result as Record<string, Info>;
}

export async function refresh(force = false) {
  if (!force) {
    const stat = await statCache();
    if (stat && fresh(stat.mtimeMs)) return Data.reset();
  }
  try {
    await ensureCacheDir();
    const result = await fetchApi();
    if (!result.ok) return;
    await fs.writeFile(filepath, result.text);
    Data.reset();
  } catch (e) {
    console.error("Failed to refresh models.dev", e);
  }
}

if (!process.env.DH_DISABLE_MODELS_FETCH) {
  void refresh();
  setInterval(async () => {
    await refresh();
  }, 60 * 1000 * 60).unref();
}
