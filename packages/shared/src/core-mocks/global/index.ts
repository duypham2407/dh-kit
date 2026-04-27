import * as os from "node:os";
import * as path from "node:path";
export const Global = {
  Path: {
    cache: path.join(os.homedir(), ".dh", "cache"),
  }
};
