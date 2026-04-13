import { createId } from "../../../shared/src/utils/ids.js";

type RunEntry = {
  runId: string;
  sessionId: string;
  startedAt: string;
  metadata?: Record<string, unknown>;
  cancelRequestedAt?: string;
  cancelReason?: string;
};

const runRegistry = new Map<string, RunEntry>();

/**
 * Test-only helper to reset process-global run-state.
 */
export function __resetSessionRunStateForTests(): void {
  runRegistry.clear();
}

export class SessionBusyError extends Error {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' is currently busy.`);
    this.name = "SessionBusyError";
  }
}

export function assertNotBusy(sessionId: string): void {
  if (runRegistry.has(sessionId)) {
    throw new SessionBusyError(sessionId);
  }
}

export function markBusy(sessionId: string, metadata?: Record<string, unknown>): RunEntry {
  assertNotBusy(sessionId);
  const entry: RunEntry = {
    runId: createId("session-run"),
    sessionId,
    startedAt: new Date().toISOString(),
    metadata,
  };
  runRegistry.set(sessionId, entry);
  return entry;
}

export function markIdle(sessionId: string): void {
  runRegistry.delete(sessionId);
}

export function cancel(sessionId: string, reason?: string): boolean {
  const current = runRegistry.get(sessionId);
  if (!current) {
    return false;
  }
  current.cancelRequestedAt = new Date().toISOString();
  current.cancelReason = reason;
  runRegistry.set(sessionId, current);
  return true;
}

export function isCancelRequested(sessionId: string): boolean {
  return Boolean(runRegistry.get(sessionId)?.cancelRequestedAt);
}

export function getRunEntry(sessionId: string): {
  runId: string;
  sessionId: string;
  startedAt: string;
  metadata?: Record<string, unknown>;
  cancelRequestedAt?: string;
  cancelReason?: string;
} | undefined {
  return runRegistry.get(sessionId);
}

export async function withSessionRunGuard<T>(
  sessionId: string,
  fn: (ctx: { runId: string; isCancelRequested: () => boolean }) => Promise<T>,
  options?: {
    metadata?: Record<string, unknown>;
    onBusy?: (entry: RunEntry) => void | Promise<void>;
    onIdle?: (entry: RunEntry) => void | Promise<void>;
  },
): Promise<T> {
  const entry = markBusy(sessionId, options?.metadata);
  if (options?.onBusy) {
    await options.onBusy(entry);
  }
  try {
    return await fn({
      runId: entry.runId,
      isCancelRequested: () => isCancelRequested(sessionId),
    });
  } finally {
    markIdle(sessionId);
    if (options?.onIdle) {
      await options.onIdle(entry);
    }
  }
}
