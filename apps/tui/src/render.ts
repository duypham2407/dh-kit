import type { TuiState } from "./state.js";

export function renderTuiScreen(state: TuiState): string {
  const lines = [
    "DH TUI",
    `server: ${state.serverUrl}`,
    `status: ${state.status}`,
    `model: ${state.model}`,
    `agent: ${state.agentId}`,
    "",
    "sessions:",
  ];

  if (state.sessions.length === 0) {
    lines.push("  none");
  } else {
    for (const session of state.sessions) {
      const marker = session.id === state.currentSessionId ? "*" : " ";
      lines.push(`  ${marker} ${session.id} ${session.title ?? ""}`.trimEnd());
    }
  }

  lines.push("", "transcript:");
  if (state.transcript.length === 0) {
    lines.push("  empty");
  } else {
    for (const item of state.transcript) lines.push(`  ${item.role}: ${item.text}`);
  }

  if (state.permissionPrompt) {
    lines.push(
      "",
      `permission: ${state.permissionPrompt.tool}`,
      `reason: ${state.permissionPrompt.reason ?? "not provided"}`,
    );
  }

  lines.push("", "events:");
  if (state.eventLog.length === 0) {
    lines.push("  none");
  } else {
    for (const event of state.eventLog.slice(-8)) lines.push(`  ${event.label}`);
  }

  if (state.readOnlyReason) {
    lines.push("", `read-only: ${state.readOnlyReason}`);
  }

  lines.push("", `prompt: ${state.prompt}`);
  return lines.join("\n");
}
