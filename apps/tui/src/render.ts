import type { TuiState } from "./state.js";

export function renderTuiScreen(state: TuiState): string {
  const lines = [
    "DH TUI",
    `server: ${state.serverUrl}`,
    `status: ${state.status}`,
    state.finalStatus ? `final: ${state.finalStatus}` : undefined,
    state.runtimeDegradedReason ? `degraded: ${state.runtimeDegradedReason}` : undefined,
    `model: ${state.model}`,
    `agent: ${state.agentId}`,
    "",
    "sessions:",
  ].filter((line): line is string => typeof line === "string");

  if (state.sessions.length === 0) {
    lines.push("  none");
  } else {
    for (const session of state.sessions) {
      const marker = session.id === state.currentSessionId ? "*" : " ";
      lines.push(`  ${marker} ${session.id} ${session.title ?? ""}`.trimEnd());
    }
  }

  if (state.models.length > 0) {
    lines.push("", "model options:");
    for (const model of state.models.slice(0, 8)) {
      const marker = model.id === state.model ? "*" : " ";
      lines.push(`  ${marker} ${model.id} ${model.name}`.trimEnd());
    }
  }

  if (state.agents.length > 0) {
    lines.push("", "agent options:");
    for (const agent of state.agents.slice(0, 8)) {
      const marker = agent.id === state.agentId ? "*" : " ";
      lines.push(`  ${marker} ${agent.id} ${agent.displayName}`.trimEnd());
    }
  }

  lines.push("", "transcript:");
  if (state.transcript.length === 0) {
    lines.push("  empty");
  } else {
    for (const item of state.transcript) lines.push(`  ${item.role}: ${item.text}`);
  }

  lines.push("", "context:");
  if (state.contextItems.length === 0) {
    lines.push("  none");
  } else {
    for (const item of state.contextItems.slice(-8)) lines.push(`  ${item.label} - ${item.reason}`);
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
