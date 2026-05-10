import fs from "node:fs";
import path from "node:path";
import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { RunDirectReport, RunFileAttachment } from "../../../shared/src/types/run.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { SessionEventStream } from "../../../runtime/src/session/session-event-stream.js";
import { SessionManager } from "../../../runtime/src/session/session-manager.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { AgentRuntime } from "../agent/agent-runtime.js";

type ResolvedRunSession = {
  session: SessionState;
  envelope: ExecutionEnvelopeState;
  continued: boolean;
  forkedFromSessionId?: string;
};

export async function runDirectCommand(input: {
  message: string;
  repoRoot: string;
  continueLatest?: boolean;
  sessionId?: string;
  fork?: boolean;
  model?: string;
  agentId?: string;
  variant?: string;
  files?: string[];
  title?: string;
  autoApprove?: boolean;
  provider?: ChatProvider;
}): Promise<RunDirectReport> {
  const agent = resolveRunAgent(input.repoRoot, input.agentId);
  const sessionManager = new SessionManager(input.repoRoot);
  const resolved = await resolveRunSession({
    repoRoot: input.repoRoot,
    sessionManager,
    agent,
    continueLatest: input.continueLatest,
    sessionId: input.sessionId,
    fork: input.fork,
  });
  const attachments = readTextAttachments(input.repoRoot, input.files ?? []);
  const filePaths = attachments.map((file) => file.path);
  const stream = new SessionEventStream({ repoRoot: input.repoRoot, sessionId: resolved.session.sessionId });

  stream.emit("session.created", {
    commandFamily: "run",
    continued: resolved.continued,
    forkedFromSessionId: resolved.forkedFromSessionId,
    title: input.title ?? input.message.slice(0, 80),
    files: filePaths,
    autoApprove: Boolean(input.autoApprove),
  });

  const model = input.model ?? `${resolved.envelope.resolvedModel.providerId}/${resolved.envelope.resolvedModel.modelId}`;
  let text = "";
  let finalStatus: RunDirectReport["finalStatus"] = "clean_success";
  let degradedReason: string | null = null;

  stream.emit("message.started", { role: "assistant", model });
  if (input.provider?.chatStream) {
    const response = await input.provider.chatStream({
      messages: [{ role: "user", content: buildPrompt(input.message, attachments) }],
      model,
    }, (chunk) => {
      text += chunk;
      stream.emit("text.delta", { text: chunk });
    });
    if (!text) {
      text = response.content;
      stream.emit("text.delta", { text });
    }
  } else if (input.provider) {
    const response = await input.provider.chat({
      messages: [{ role: "user", content: buildPrompt(input.message, attachments) }],
      model,
    });
    text = response.content;
    stream.emit("text.delta", { text });
  } else {
    finalStatus = "degraded_success";
    degradedReason = "No provider was available; returned deterministic offline run output.";
    text = `Offline run response for: ${input.message || "continued session"}`;
    stream.emit("runtime.degraded", { reason: degradedReason });
    stream.emit("text.delta", { text });
  }

  stream.emit("message.finished", { textLength: text.length });
  stream.emit("session.finished", { finalStatus });

  return {
    exitCode: 0,
    command: "run",
    sessionId: resolved.session.sessionId,
    model,
    agentId: agent.agentId,
    title: input.title,
    text,
    events: stream.events,
    files: attachments.map(({ path, byteLength }) => ({ path, byteLength })),
    runtimeAuthority: "typescript_worker",
    finalStatus,
    degradedReason,
  };
}

function resolveRunAgent(repoRoot: string, agentId: string | undefined): AgentRegistryEntry {
  return new AgentRuntime(repoRoot).resolveAgent(agentId);
}

async function resolveRunSession(input: {
  repoRoot: string;
  sessionManager: SessionManager;
  agent: AgentRegistryEntry;
  continueLatest?: boolean;
  sessionId?: string;
  fork?: boolean;
}): Promise<ResolvedRunSession> {
  if (input.fork && !input.sessionId) {
    throw new Error("--fork requires --session <id>.");
  }
  if (input.continueLatest && input.sessionId) {
    throw new Error("--continue cannot be combined with --session.");
  }
  if (input.continueLatest) {
    const latest = findLatestRunSessionId(input.repoRoot);
    if (!latest) {
      const created = await input.sessionManager.createSession("quick", input.agent, { runtimeAuthority: "rust_host" });
      return { session: created.session, envelope: created.envelope, continued: false };
    }
    return readRunSession(input.sessionManager, latest, true);
  }
  if (input.sessionId && !input.fork) {
    return readRunSession(input.sessionManager, input.sessionId, true);
  }
  if (input.sessionId && input.fork) {
    const source = await input.sessionManager.readSession(input.sessionId);
    if (!source) {
      throw new Error(`Run session '${input.sessionId}' could not be read.`);
    }
    const created = await input.sessionManager.createSession("quick", input.agent, { runtimeAuthority: "rust_host" });
    return {
      session: created.session,
      envelope: created.envelope,
      continued: false,
      forkedFromSessionId: input.sessionId,
    };
  }

  const created = await input.sessionManager.createSession("quick", input.agent, { runtimeAuthority: "rust_host" });
  return { session: created.session, envelope: created.envelope, continued: false };
}

async function readRunSession(
  sessionManager: SessionManager,
  sessionId: string,
  continued: boolean,
): Promise<ResolvedRunSession> {
  const read = await sessionManager.readSession(sessionId);
  if (!read) {
    throw new Error(`Run session '${sessionId}' could not be read.`);
  }
  const envelope = read.envelopes[read.envelopes.length - 1];
  if (!envelope) {
    throw new Error(`Run session '${sessionId}' has no execution envelope.`);
  }
  return { session: read.session, envelope, continued };
}

function findLatestRunSessionId(repoRoot: string): string | undefined {
  const events = new SessionRuntimeEventsRepo(repoRoot).listByEventType("session.created");
  const latest = events.find((event) => {
    const eventJson = event.eventJson;
    const payload = eventJson.payload && typeof eventJson.payload === "object"
      ? eventJson.payload as Record<string, unknown>
      : {};
    return eventJson.commandFamily === "run" || payload.commandFamily === "run";
  });
  return latest?.sessionId;
}

function buildPrompt(message: string, attachments: RunFileAttachment[]): string {
  const fileContext = attachments.map((file) => `File: ${file.path}\n${file.content}`).join("\n\n");
  return [fileContext, message].filter(Boolean).join("\n\n");
}

function readTextAttachments(repoRoot: string, files: string[]): RunFileAttachment[] {
  return files.map((file) => {
    const absolute = path.resolve(repoRoot, file);
    const relative = path.relative(repoRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`File attachment '${file}' is outside the repository.`);
    }
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) {
      throw new Error(`File attachment '${file}' is not a file.`);
    }
    const buffer = fs.readFileSync(absolute);
    const content = buffer.toString("utf8");
    if (content.includes("\uFFFD")) {
      throw new Error(`File attachment '${file}' is not valid UTF-8 text.`);
    }
    return { path: relative, content, byteLength: buffer.byteLength };
  });
}
