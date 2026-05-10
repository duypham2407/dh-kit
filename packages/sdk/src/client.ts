import type { RunDirectInput, RunDirectReport, RunEvent } from "../../shared/src/types/run.js";

export type DhClientOptions = {
  baseUrl: string;
  password?: string;
};

export type DhSessionSummary = {
  id: string;
  title?: string;
};

export type DhSessionsResponse = {
  sessions: DhSessionSummary[];
};

export class DhClient {
  private readonly baseUrl: string;

  constructor(private readonly options: DhClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  async health(): Promise<{ ok: boolean; product: string }> {
    return await this.request("GET", "/health");
  }

  async sessions(): Promise<DhSessionsResponse> {
    return await this.request("GET", "/sessions");
  }

  async run(input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }): Promise<RunDirectReport> {
    return await this.request("POST", "/command/run", input);
  }

  async *runStream(input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }): AsyncGenerator<RunEvent> {
    const response = await fetch(`${this.baseUrl}/command/run/stream`, {
      method: "POST",
      headers: this.buildHeaders(input),
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    if (!response.body) throw new Error("DH server response did not include a stream body.");

    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as RunEvent;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer) as RunEvent;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.buildHeaders(body),
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

  private buildHeaders(body?: unknown): Record<string, string> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.options.password) headers.authorization = `Bearer ${this.options.password}`;
    return headers;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const payload = JSON.parse(raw) as unknown;
    if (payload && typeof payload === "object" && "error" in payload) {
      return String((payload as { error: unknown }).error);
    }
  } catch {
    // Fall through to status message.
  }
  return `DH server request failed with ${response.status}`;
}
