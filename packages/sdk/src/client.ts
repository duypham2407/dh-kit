import type { RunDirectInput, RunDirectReport } from "../../shared/src/types/run.js";

export type DhClientOptions = {
  baseUrl: string;
  password?: string;
};

export class DhClient {
  private readonly baseUrl: string;

  constructor(private readonly options: DhClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  async health(): Promise<{ ok: boolean; product: string }> {
    return await this.request("GET", "/health");
  }

  async run(input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }): Promise<RunDirectReport> {
    return await this.request("POST", "/command/run", input);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.options.password) headers.authorization = `Bearer ${this.options.password}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json() as unknown;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `DH server request failed with ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }
}
