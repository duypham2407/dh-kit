import fs from "node:fs";
import path from "node:path";
import type { ProviderCredentialPublicRecord, ProviderCredentialRecord } from "../../../shared/src/types/provider.js";
import { nowIso } from "../../../shared/src/utils/time.js";

type ProviderAuthFile = {
  version: 1;
  providers: Record<string, ProviderCredentialRecord>;
};

export class ProviderAuthStore {
  constructor(private readonly repoRoot: string) {}

  getPath(): string {
    return path.join(this.repoRoot, ".dh", "auth", "providers.json");
  }

  list(): ProviderCredentialRecord[] {
    return Object.values(this.readFile().providers);
  }

  get(providerId: string): ProviderCredentialRecord | undefined {
    return this.readFile().providers[providerId];
  }

  getPublic(providerId: string): ProviderCredentialPublicRecord | undefined {
    const record = this.get(providerId);
    return record ? toPublicRecord(record) : undefined;
  }

  listPublic(): ProviderCredentialPublicRecord[] {
    return this.list().map(toPublicRecord);
  }

  save(input: { providerId: string; type: "api_key"; apiKey: string } | { providerId: string; type: "api_key_env"; apiKeyEnv: string }): ProviderCredentialRecord {
    const file = this.readFile();
    const previous = file.providers[input.providerId];
    const timestamp = nowIso();
    const record: ProviderCredentialRecord = input.type === "api_key"
      ? {
          providerId: input.providerId,
          type: "api_key",
          apiKey: input.apiKey,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
      : {
          providerId: input.providerId,
          type: "api_key_env",
          apiKeyEnv: input.apiKeyEnv,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };

    file.providers[input.providerId] = record;
    this.writeFile(file);
    return record;
  }

  delete(providerId: string): boolean {
    const file = this.readFile();
    if (!file.providers[providerId]) return false;
    delete file.providers[providerId];
    this.writeFile(file);
    return true;
  }

  private readFile(): ProviderAuthFile {
    const filepath = this.getPath();
    if (!fs.existsSync(filepath)) return { version: 1, providers: {} };
    return JSON.parse(fs.readFileSync(filepath, "utf8")) as ProviderAuthFile;
  }

  private writeFile(file: ProviderAuthFile): void {
    const filepath = this.getPath();
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(filepath, 0o600);
    } catch {
      // Some platforms ignore chmod; the file remains under ignored local state.
    }
  }
}

function toPublicRecord(record: ProviderCredentialRecord): ProviderCredentialPublicRecord {
  return record.type === "api_key"
    ? {
        providerId: record.providerId,
        type: record.type,
        credentialStatus: "stored",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    : {
        providerId: record.providerId,
        type: record.type,
        credentialStatus: "env",
        credentialSource: record.apiKeyEnv,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
}
