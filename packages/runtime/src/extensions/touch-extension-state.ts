import type { ExtensionRuntimeState, ExtensionSpec } from "../../../opencode-sdk/src/index.js";
import { deriveExtensionFingerprint } from "./extension-fingerprint.js";
import { ExtensionRuntimeStateStoreFile, createEmptyStore } from "./extension-runtime-state-store.js";

export type TouchExtensionStateResult = {
  state: ExtensionRuntimeState;
  fingerprint: string;
  warning?: string;
};

export function touchExtensionState(input: {
  repoRoot: string;
  spec: ExtensionSpec;
}): TouchExtensionStateResult {
  const fingerprint = deriveExtensionFingerprint(input.spec);
  const storeFile = new ExtensionRuntimeStateStoreFile(input.repoRoot);

  const readResult = storeFile.read();
  if (!readResult.ok) {
    return {
      state: "first",
      fingerprint,
      warning: `Extension runtime-state read failed: ${readResult.reason}`,
    };
  }

  const store = readResult.store ?? createEmptyStore();
  const prior = store.records[input.spec.id];
  const state: ExtensionRuntimeState = !prior
    ? "first"
    : prior.fingerprint === fingerprint
      ? "same"
      : "updated";

  const nextStore = storeFile.upsertRecord({
    store,
    extensionId: input.spec.id,
    fingerprint,
  });
  const writeResult = storeFile.write(nextStore);

  if (!writeResult.ok) {
    return {
      state,
      fingerprint,
      warning: `Extension runtime-state write failed: ${writeResult.reason}`,
    };
  }

  return {
    state,
    fingerprint,
  };
}
