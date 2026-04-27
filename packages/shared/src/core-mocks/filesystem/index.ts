import * as fs from "node:fs/promises";
export const AppFileSystem = {
  readJson: (path: string) => fs.readFile(path, "utf-8").then(JSON.parse),
  write: (path: string, content: string) => fs.writeFile(path, content),
};
