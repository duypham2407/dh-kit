import fs from "node:fs/promises";
import path from "node:path";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";
import type { AgentModelAssignment } from "../../../shared/src/types/model.js";

type ConfigFileShape = {
  semanticMode?: "always" | "auto" | "off";
  agentModelAssignments?: AgentModelAssignment[];
};

export class ConfigStore {
  constructor(private readonly repoRoot: string) {}

  async read(): Promise<ConfigFileShape> {
    const filePath = this.getFilePath();
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as ConfigFileShape;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async write(nextValue: ConfigFileShape): Promise<void> {
    const filePath = this.getFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(nextValue, null, 2)}\n`, "utf8");
  }

  getFilePath(): string {
    return path.join(resolveDhPaths(this.repoRoot).configHome, "config.json");
  }
}
