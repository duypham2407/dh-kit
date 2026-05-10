import type { LoadedPluginRecord, PluginHookDecision, PluginHookName } from "./plugin-api.js";

export type PluginHookExecutionResult = {
  pluginId: string;
  decision?: PluginHookDecision["decision"];
  reason?: string;
  payload?: Record<string, unknown>;
  error?: string;
  durationMs: number;
};

export type PluginHookExecutionReport = {
  hookName: PluginHookName;
  results: PluginHookExecutionResult[];
};

export async function executePluginHook(input: {
  plugins: LoadedPluginRecord[];
  hookName: PluginHookName;
  payload: Record<string, unknown>;
}): Promise<PluginHookExecutionReport> {
  const results: PluginHookExecutionResult[] = [];
  for (const plugin of input.plugins) {
    if (!plugin.loaded || !plugin.plugin) continue;
    const hook = plugin.plugin.hooks[input.hookName] as (PluginHookDecision & { delayMs?: number; throwMessage?: string }) | undefined;
    if (!hook) continue;
    const startedAt = Date.now();
    try {
      const decision = await withTimeout(runDeclarativeHook(hook), plugin.timeoutMs, plugin.id);
      results.push({
        pluginId: plugin.id,
        decision: decision.decision,
        reason: decision.reason,
        payload: decision.payload,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
    }
  }
  return { hookName: input.hookName, results };
}

async function runDeclarativeHook(
  hook: PluginHookDecision & { delayMs?: number; throwMessage?: string },
): Promise<PluginHookDecision> {
  if (hook.delayMs) await delay(hook.delayMs);
  if (hook.throwMessage) throw new Error(hook.throwMessage);
  return {
    decision: hook.decision,
    reason: hook.reason,
    payload: hook.payload,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, pluginId: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Plugin '${pluginId}' hook timed out after ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
