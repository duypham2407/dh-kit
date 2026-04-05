import { SessionStore } from "../../../storage/src/fs/session-store.js";
import { enforceLaneLock } from "../../../opencode-app/src/lane/enforce-lane-lock.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";

export type ResumeSessionResult = {
  ok: boolean;
  reason: string;
};

export async function resumeSession(repoRoot: string, sessionId: string, requestedLane: WorkflowLane): Promise<ResumeSessionResult> {
  const store = new SessionStore(repoRoot);
  let record: Awaited<ReturnType<SessionStore["read"]>>;
  try {
    record = await store.read(sessionId);
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to read session '${sessionId}': ${(error as Error).message}`,
    };
  }
  if (!record) {
    return {
      ok: false,
      reason: `Session '${sessionId}' was not found.`,
    };
  }

  if (record.session?.lane !== "quick" && record.session?.lane !== "delivery" && record.session?.lane !== "migration") {
    return {
      ok: false,
      reason: `Session '${sessionId}' is corrupted: invalid lane value.`,
    };
  }

  try {
    enforceLaneLock(record.session.lane, requestedLane);
  } catch (error) {
    return {
      ok: false,
      reason: (error as Error).message,
    };
  }

  return {
    ok: true,
    reason: `Resumed session '${sessionId}' in lane '${requestedLane}'.`,
  };
}
