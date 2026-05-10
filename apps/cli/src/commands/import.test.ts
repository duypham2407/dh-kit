import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runImportCommand } from "./import.js";

afterEach(() => vi.restoreAllMocks());

describe("runImportCommand", () => {
  it("reads an export file and prints imported counts", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dh-import-cli-")), "session.json");
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1 }));
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runImportCommand([file], "/repo", {
      parseSessionExportJson: () => ({ schemaVersion: 1 }) as never,
      importSessionDocument: () => ({
        sessionId: "session-1",
        imported: { runtimeEvents: 1, summaries: 0, checkpoints: 0, reverts: 0 },
      }),
    });

    expect(exitCode).toBe(0);
    expect(String(stdout.mock.calls[0]?.[0])).toContain("imported session: session-1");
  });
});
