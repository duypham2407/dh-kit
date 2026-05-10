export type ProviderCredentialRecord =
  | {
      providerId: string;
      type: "api_key";
      apiKey: string;
      createdAt: string;
      updatedAt: string;
    }
  | {
      providerId: string;
      type: "api_key_env";
      apiKeyEnv: string;
      createdAt: string;
      updatedAt: string;
    };

export type ProviderCredentialPublicRecord = {
  providerId: string;
  type: ProviderCredentialRecord["type"];
  credentialStatus: "env" | "stored" | "config" | "none";
  credentialSource?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProviderCredentialResolution = {
  providerId: string;
  status: ProviderCredentialPublicRecord["credentialStatus"];
  source?: string;
  apiKey?: string;
};

export type ProviderRegistryEntry = {
  providerId: string;
  name: string;
  enabled: boolean;
  credentialStatus: ProviderCredentialPublicRecord["credentialStatus"];
  credentialSource?: string;
  modelCount: number;
  runtimeAvailable: boolean;
  unavailableReason?: "unsupported_sdk";
  npm?: string;
};

export type ProviderRegistryReport = {
  providers: ProviderRegistryEntry[];
};

export type ProviderLoginReport = {
  providerId: string;
  credentialStatus: "env" | "stored";
  credentialSource?: string;
};

export type ProviderLogoutReport = {
  providerId: string;
  removed: boolean;
};

export type ProviderVerifyReport = {
  providerId: string;
  modelId?: string;
  ok: boolean;
  reason?: "missing_credential" | "unsupported_sdk" | "auth_failed" | "request_failed";
  message: string;
};

export type ModelCatalogEntry = {
  providerId: string;
  modelId: string;
  name: string;
  available: boolean;
  status?: string;
  releaseDate?: string;
  limit?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  modalities?: Record<string, unknown>;
};

export type ModelCatalogReport = {
  refreshed: boolean;
  cache: {
    path: string;
    ageMs?: number;
  };
  models: ModelCatalogEntry[];
};
