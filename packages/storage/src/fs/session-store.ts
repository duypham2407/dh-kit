import fs from "node:fs/promises";
import path from "node:path";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { WorkflowState } from "../../../shared/src/types/stage.js";

export type PersistedSessionRecord = {
  session: SessionState;
  workflow: WorkflowState;
  envelopes: ExecutionEnvelopeState[];
};

export class SessionStore {
  constructor(private readonly repoRoot: string) {}

  async write(record: PersistedSessionRecord): Promise<void> {
    const filePath = this.getFilePath(record.session.sessionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  async read(sessionId: string): Promise<PersistedSessionRecord | undefined> {
    const filePath = this.getFilePath(sessionId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as PersistedSessionRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  private getFilePath(sessionId: string): string {
    return path.join(resolveDhPaths(this.repoRoot).dataHome, "sessions", `${sessionId}.json`);
  }
}
