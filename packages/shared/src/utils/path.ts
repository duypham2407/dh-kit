import path from "node:path";
import os from "node:os";

export type DhPaths = {
  configHome: string;
  dataHome: string;
  cacheHome: string;
  projectDhDir: string;
};

export function resolveDhPaths(repoRoot: string): DhPaths {
  const home = os.homedir();
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  const cacheHome = process.env.XDG_CACHE_HOME ?? path.join(home, ".cache");
  return {
    configHome: path.join(configHome, "dh"),
    dataHome: path.join(dataHome, "dh"),
    cacheHome: path.join(cacheHome, "dh"),
    projectDhDir: path.join(repoRoot, ".dh"),
  };
}
