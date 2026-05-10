export const PLUGIN_HOOK_NAMES = [
  "event",
  "chat.message",
  "permission.ask",
  "tool.execute.before",
  "tool.execute.after",
  "command.execute.before",
  "experimental.chat.system.transform",
  "experimental.chat.messages.transform",
] as const;

export type PluginHookName = typeof PLUGIN_HOOK_NAMES[number];

export type PluginHookDecision = {
  decision: "allow" | "deny" | "modify" | "observe";
  reason?: string;
  payload?: Record<string, unknown>;
};

export type DeclarativePlugin = {
  id: string;
  name?: string;
  hooks: Partial<Record<PluginHookName, PluginHookDecision>>;
};

export type PluginConfigEntry = {
  id: string;
  path: string;
  enabled: boolean;
  timeoutMs: number;
};

export type PluginListReport = {
  plugins: PluginConfigEntry[];
};

export type LoadedPluginRecord = {
  id: string;
  name?: string;
  path: string;
  enabled: boolean;
  loaded: boolean;
  hooks: PluginHookName[];
  fingerprint?: string;
  plugin?: DeclarativePlugin;
  error?: string;
  timeoutMs: number;
};

export type PluginLoadReport = {
  plugins: LoadedPluginRecord[];
};
