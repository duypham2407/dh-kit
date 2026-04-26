import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
let tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-worker-bundle-"));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("worker bundle packaging", () => {
  it("builds a Rust-launchable worker bundle manifest with checksum and Node prerequisite truth", () => {
    const outDir = makeTempDir();
    const scriptPath = path.join(repoRoot, "scripts", "build-worker-bundle.sh");

    execFileSync("sh", [scriptPath, "--out-dir", outDir], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const workerPath = path.join(outDir, "worker.mjs");
    const manifestPath = path.join(outDir, "manifest.json");
    const workerBytes = fs.readFileSync(workerPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      workerVersion?: string;
      protocolVersion?: string;
      entryPath?: string;
      checksumSha256?: string;
      requiredNodeMajor?: number;
      supportedPlatforms?: string[];
    };

    expect(workerBytes.length).toBeGreaterThan(0);
    expect(manifest).toMatchObject({
      workerVersion: "0.1.0",
      protocolVersion: "1",
      entryPath: "worker.mjs",
      requiredNodeMajor: 22,
      supportedPlatforms: ["linux", "macos"],
    });
    expect(manifest.supportedPlatforms).not.toContain("windows");
    expect(manifest.checksumSha256).toBe(createHash("sha256").update(workerBytes).digest("hex"));
  });

  it("packages and installs the worker bundle next to the Rust host binary for release-directory installs", () => {
    const workerOutDir = makeTempDir();
    const sourceDir = makeTempDir();
    const releaseDir = makeTempDir();
    const installDir = makeTempDir();
    const binaryName = `dh-${releasePlatform()}-${releaseArch()}`;
    const binaryPath = path.join(sourceDir, binaryName);

    execFileSync("sh", [path.join(repoRoot, "scripts", "build-worker-bundle.sh"), "--out-dir", workerOutDir], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    fs.writeFileSync(binaryPath, "#!/usr/bin/env sh\nif [ \"$1\" = \"--version\" ]; then echo 'dh test'; exit 0; fi\necho 'fake dh';\n");
    fs.chmodSync(binaryPath, 0o755);

    execFileSync("sh", [path.join(repoRoot, "scripts", "package-release.sh"), sourceDir, releaseDir, "test"], {
      cwd: repoRoot,
      env: { ...process.env, DH_WORKER_BUNDLE_DIR: workerOutDir },
      stdio: "pipe",
    });
    execFileSync("sh", [path.join(repoRoot, "scripts", "install-from-release.sh"), releaseDir, installDir], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    expect(fs.existsSync(path.join(installDir, "dh"))).toBe(true);
    expect(fs.existsSync(path.join(releaseDir, "worker.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(releaseDir, "worker-manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "ts-worker", "worker.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "ts-worker", "manifest.json"))).toBe(true);
  });

  it("copies adjacent worker metadata on direct binary install when release sidecars are present", () => {
    const workerOutDir = makeTempDir();
    const releaseLikeDir = makeTempDir();
    const installDir = makeTempDir();
    const binaryPath = path.join(releaseLikeDir, "dh-test");

    execFileSync("sh", [path.join(repoRoot, "scripts", "build-worker-bundle.sh"), "--out-dir", workerOutDir], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    fs.mkdirSync(path.join(releaseLikeDir, "ts-worker"), { recursive: true });
    fs.copyFileSync(path.join(workerOutDir, "worker.mjs"), path.join(releaseLikeDir, "ts-worker", "worker.mjs"));
    fs.copyFileSync(path.join(workerOutDir, "manifest.json"), path.join(releaseLikeDir, "ts-worker", "manifest.json"));
    fs.writeFileSync(binaryPath, "#!/usr/bin/env sh\nif [ \"$1\" = \"--version\" ]; then echo 'dh test'; exit 0; fi\necho 'fake dh';\n");
    fs.chmodSync(binaryPath, 0o755);

    execFileSync("sh", [path.join(repoRoot, "scripts", "install.sh"), binaryPath, installDir], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    expect(fs.existsSync(path.join(installDir, "dh"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "ts-worker", "worker.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "ts-worker", "manifest.json"))).toBe(true);
  });
});

function releasePlatform(): string {
  if (process.platform === "darwin") {
    return "darwin";
  }
  if (process.platform === "linux") {
    return "linux";
  }
  return process.platform;
}

function releaseArch(): string {
  if (process.arch === "arm64") {
    return "arm64";
  }
  if (process.arch === "x64") {
    return "amd64";
  }
  return process.arch;
}
