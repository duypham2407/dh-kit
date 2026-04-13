import fs from "node:fs";
import path from "node:path";
import { nowIso } from "../../../shared/src/utils/time.js";

export type PersistedExtensionRuntimeRecord = {
  version: "v1";
  extensionId: string;
  fingerprint: string;
  lastSeenAt?: string;
  loadCount?: number;
};

export type ExtensionRuntimeStateStore = {
  version: "v1";
  records: Record<string, PersistedExtensionRuntimeRecord>;
};

export type ReadStoreResult =
  | {
      ok: true;
      store: ExtensionRuntimeStateStore;
      warning?: string;
    }
  | {
      ok: false;
      reason: string;
    };

export type WriteStoreResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

const STORE_VERSION = "v1" as const;

export class ExtensionRuntimeStateStoreFile {
  constructor(private readonly repoRoot: string) {}

  read(): ReadStoreResult {
    const filePath = this.getFilePath();
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isStore(parsed)) {
        return {
          ok: false,
          reason: "Extension runtime-state store is malformed or has unsupported schema version.",
        };
      }
      return {
        ok: true,
        store: parsed,
      };
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === "ENOENT") {
        return {
          ok: true,
          store: createEmptyStore(),
        };
      }
      if (error instanceof SyntaxError) {
        return {
          ok: false,
          reason: "Extension runtime-state store JSON is malformed.",
        };
      }
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown extension runtime-state store read failure.",
      };
    }
  }

  write(store: ExtensionRuntimeStateStore): WriteStoreResult {
    if (!isStore(store)) {
      return {
        ok: false,
        reason: "Extension runtime-state store payload is invalid.",
      };
    }

    const filePath = this.getFilePath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown extension runtime-state store write failure.",
      };
    }
  }

  upsertRecord(input: {
    store: ExtensionRuntimeStateStore;
    extensionId: string;
    fingerprint: string;
  }): ExtensionRuntimeStateStore {
    const previous = input.store.records[input.extensionId];
    const nextLoadCount = (previous?.loadCount ?? 0) + 1;
    return {
      version: STORE_VERSION,
      records: {
        ...input.store.records,
        [input.extensionId]: {
          version: STORE_VERSION,
          extensionId: input.extensionId,
          fingerprint: input.fingerprint,
          lastSeenAt: nowIso(),
          loadCount: nextLoadCount,
        },
      },
    };
  }

  private getFilePath(): string {
    return path.join(this.repoRoot, ".dh", "runtime", "extension-runtime-state.json");
  }
}

export function createEmptyStore(): ExtensionRuntimeStateStore {
  return {
    version: STORE_VERSION,
    records: {},
  };
}

function isStore(input: unknown): input is ExtensionRuntimeStateStore {
  if (!input || typeof input !== "object") {
    return false;
  }
  const store = input as Partial<ExtensionRuntimeStateStore>;
  if (store.version !== STORE_VERSION) {
    return false;
  }
  if (!store.records || typeof store.records !== "object") {
    return false;
  }

  for (const [recordId, record] of Object.entries(store.records)) {
    if (!isRecord(recordId, record)) {
      return false;
    }
  }

  return true;
}

function isRecord(key: string, input: unknown): input is PersistedExtensionRuntimeRecord {
  if (!input || typeof input !== "object") {
    return false;
  }
  const record = input as Partial<PersistedExtensionRuntimeRecord>;
  if (record.version !== STORE_VERSION) {
    return false;
  }
  if (record.extensionId !== key) {
    return false;
  }
  if (typeof record.fingerprint !== "string" || record.fingerprint.length === 0) {
    return false;
  }
  if (record.lastSeenAt !== undefined && typeof record.lastSeenAt !== "string") {
    return false;
  }
  if (record.loadCount !== undefined && typeof record.loadCount !== "number") {
    return false;
  }
  return true;
}
