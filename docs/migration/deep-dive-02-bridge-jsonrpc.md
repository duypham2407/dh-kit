# Deep Dive 02 — Bridge JSON-RPC Protocol (Rust Core ↔ TypeScript Workflow)

**Date:** 2026-04-13  
**Author:** System Architect  
**Status:** Draft protocol spec for implementation  
**Context source:** `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`

---

## 0. Purpose / Mục tiêu tài liệu

Tài liệu này là **implementation-ready protocol spec** cho bridge giữa:

- **Rust core/runtime host**: code understanding engine, indexing, graph/query, file/tool/runtime services
- **TypeScript workflow worker**: agent orchestration, workflow/state, prompt building, LLM integration, answer formatting

Bridge này dùng **JSON-RPC 2.0 over stdio**. Mục tiêu là tạo một contract đủ rõ để:

1. team Rust implement server/dispatcher không phải đoán
2. team TS implement client SDK + typed wrappers không phải reverse-engineer
3. observability, degraded-mode, cancellation, streaming đều có behavior rõ ràng

> DH product principle: **Rust is the center of gravity for code understanding; TypeScript remains the center of gravity for orchestration and product behavior.**  
> Cái bridge này chính là “nervous system” nối 2 center đó với nhau.

---

## 1. Protocol Foundation

### 1.1 Process roles / vai trò tiến trình

Canonical topology của DH v1:

```text
User CLI
  → Rust main process starts
    → Rust spawns TS worker over stdio
      → TS acts as JSON-RPC client for request/response calls
      → Rust acts as JSON-RPC server for core services
      → both sides MAY send notifications
```

Role split:

- **Rust**: owns index, parser, graph, query, search backends, file access mediation, tool execution mediation, diagnostics
- **TS**: owns workflow orchestration, agent status, workflow state, LLM calls, answer streaming orchestration

### 1.2 JSON-RPC 2.0 compliance details

Bridge MUST comply with JSON-RPC 2.0 at envelope level:

- every request/response uses `"jsonrpc": "2.0"`
- request has `id`, notification has **no `id`**
- response has exactly one of `result` or `error`
- `id` MAY be `string` or `number`
- `null` id MUST NOT be used by clients for normal requests
- method names are case-sensitive
- notifications MUST NOT receive responses

Canonical envelopes:

```ts
export type RpcId = string | number;

export interface DhRpcRequest<P = unknown> {
  jsonrpc: '2.0';
  id: RpcId;
  method: string;
  params: P;
}

export interface DhRpcNotification<P = unknown> {
  jsonrpc: '2.0';
  method: string;
  params: P;
}

export interface DhRpcSuccess<R = unknown> {
  jsonrpc: '2.0';
  id: RpcId;
  result: R;
}

export interface DhRpcFailure {
  jsonrpc: '2.0';
  id: RpcId | null;
  error: DhRpcError;
}
```

### 1.3 Transport: stdio framing

#### Decision

**Canonical production framing = `Content-Length` style length-prefixed framing over stdio.**  
**NDJSON/newline-delimited JSON = debug/dev-only fallback, not default.**

#### Why length-prefixed framing is the default

Lý do chọn length-prefixed thay vì NDJSON làm canonical:

1. **safe with multiline payloads** — tool output, patch, snippets, stack traces, large JSON không cần escape thành one-line
2. **matches LSP/MCP mental model** — easier for maintainers already familiar with editor/runtime protocols
3. **clear separation from logs** — stdout is protocol only, stderr is logs only
4. **future-proof for streaming chunks** — chunk payload có thể mang raw-ish text without delimiter ambiguity

Canonical frame format:

```text
Content-Length: 231\r\n
Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n
\r\n
{"jsonrpc":"2.0","id":"q-1","method":"query.findSymbol","params":{"name":"AuthService"}}
```

#### NDJSON fallback

Allowed only when both peers negotiated:

```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "method": "initialize",
  "params": {
    "transport": { "supportedFraming": ["content-length", "ndjson"] }
  }
}
```

Production default remains `content-length` even if NDJSON is supported.

#### stdout / stderr rule

- **stdout**: protocol frames only
- **stderr**: human logs, debug traces, panic output, non-protocol diagnostics

If either side writes non-protocol text to stdout, that is a protocol violation.

### 1.4 Message ordering, concurrency, and correlation

#### Ordering rules

1. Requests MAY be sent concurrently.
2. Responses MAY arrive out-of-order.
3. Notifications MAY interleave with requests/responses.
4. Within a single stream/operation, `seq` MUST increase monotonically.
5. A request id MUST have at most one terminal response.

#### Correlation rules

- Request/response correlation uses JSON-RPC `id`
- Stream/progress correlation uses:
  - `requestId` = original JSON-RPC request id
  - `operationId` = server-generated long-running operation handle
- Notifications MUST include `operationId` when tied to a long-running request

#### Concurrency model

Rust server SHOULD support multiple in-flight requests using async tasks, but MUST bound concurrency using a semaphore or queue.

Recommended defaults:

- `maxConcurrentRequests = 32`
- `maxConcurrentIndexJobs = 2`
- `maxConcurrentToolExecutions = 4`
- `requestTimeoutMs` defaults by method family:
  - `query.*`: 30_000
  - `search.*`: 30_000
  - `file.*`: 15_000
  - `index.*`: 300_000
  - `tool.*`: caller-specified or 300_000
  - `runtime.*`: 10_000

### 1.5 Why JSON-RPC over gRPC for DH specifically

JSON-RPC được chọn cho **DH bridge nội bộ local-process** vì:

#### Fit tốt hơn cho DH runtime reality

1. **Child-process local IPC first**  
   DH bridge chạy giữa Rust host và TS worker trong cùng machine/session. gRPC optimized cho network service boundary hơn là stdio child process.

2. **Human-readable, log-friendly payloads**  
   Khi debug code understanding, ability to inspect raw request/response JSON là cực kỳ valuable.

3. **Dynamic method families**  
   DH có method namespaces như `query.*`, `search.*`, `file.*`, `tool.*`, `runtime.*`. JSON-RPC handle cái này naturally.

4. **Lower ceremony**  
   Không cần introduce Protobuf schema compilation, HTTP/2 transport stack, gRPC child-process adaptation, bidirectional stream plumbing chỉ để nối Rust↔TS trong local CLI.

5. **Payload nature is text-heavy**  
   DH payload chủ yếu là file paths, snippets, graph/evidence JSON, diagnostics text. Binary efficiency của gRPC không phải differentiator chính ở đây.

#### Why not gRPC *for this boundary*

gRPC vẫn có chỗ đứng nếu sau này DH tách ra thành remote daemon/service. Nhưng **bridge nội bộ Rust↔TS** currently benefits more from:

- simpler bootstrapping
- easier debugging
- better compatibility with stdio host model
- lower implementation friction across Rust + Node.js subprocess

Conclusion: **gRPC may exist at future network boundary; JSON-RPC remains the right process-local bridge for DH.**

---

## 2. Core Shared Types / Common Contract Vocabulary

Phần này define domain types được reuse bởi hầu hết methods.

### 2.1 TypeScript shared interfaces

```ts
export type LanguageId =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'python'
  | 'go'
  | 'rust'
  | 'json'
  | 'markdown'
  | 'unknown';

export type SymbolKind =
  | 'module'
  | 'namespace'
  | 'class'
  | 'interface'
  | 'struct'
  | 'enum'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'constant'
  | 'typeAlias'
  | 'field'
  | 'file';

/** Protocol line/column are 1-based. Column is UTF-16 code-unit based. */
export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  path: string;
  uri?: string;
  range: Range;
  language?: LanguageId;
  preview?: string;
}

export interface SymbolSummary {
  symbolId: string;
  name: string;
  kind: SymbolKind;
  language: LanguageId;
  filePath: string;
  range: Range;
  containerName?: string;
  signature?: string;
  exported?: boolean;
  score?: number;
}

export type SymbolSelector =
  | { by: 'id'; symbolId: string }
  | { by: 'name'; name: string; kind?: SymbolKind; filePath?: string }
  | { by: 'location'; filePath: string; line: number; column: number };

export type TargetSelector =
  | { kind: 'file'; filePath: string }
  | { kind: 'symbol'; symbol: SymbolSelector };

export interface SearchHit {
  path: string;
  language?: LanguageId;
  range?: Range;
  snippet: string;
  score?: number;
  scoreBreakdown?: {
    keyword?: number;
    structural?: number;
    semantic?: number;
  };
  reason?: string;
  symbol?: SymbolSummary;
}

export interface GraphEdge {
  kind: 'imports' | 'calls' | 'references' | 'extends' | 'contains' | 'implements';
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  metadata?: Record<string, unknown>;
}

export interface EvidencePacket {
  summary: string;
  relevantFiles: Array<{
    path: string;
    reason: string;
    relevanceScore: number;
    ranges: Range[];
    snippets: string[];
  }>;
  relevantSymbols: SymbolSummary[];
  relationships: GraphEdge[];
  confidence: {
    score: number;
    ambiguousSymbols: string[];
    missingData: string[];
    degraded: boolean;
  };
  timingMs: number;
}

export interface OperationRef {
  operationId: string;
  requestId?: RpcId;
}

export interface DiagnosticEntry {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  component?: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}
```

### 2.2 Rust shared structs sketch

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub path: String,
    pub uri: Option<String>,
    pub range: Range,
    pub language: Option<String>,
    pub preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "by", rename_all = "camelCase")]
pub enum SymbolSelector {
    Id { symbol_id: String },
    Name { name: String, kind: Option<String>, file_path: Option<String> },
    Location { file_path: String, line: u32, column: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TargetSelector {
    File { file_path: String },
    Symbol { symbol: SymbolSelector },
}
```

### 2.3 Naming conventions

#### Request/response methods

Format:

```text
<namespace>.<verbNoun>
```

Examples:

- `query.findSymbol`
- `search.semantic`
- `file.applyPatch`
- `runtime.diagnostics`

#### Notifications/events

Format:

```text
event.<domain>.<action>
```

Examples:

- `event.index.progress`
- `event.file.changed`
- `event.engine.degraded`
- `event.tool.outputChunk`
- `event.workflow.stateChanged`
- `event.agent.status`

Rule: **dot-separated namespace; final segment is action in lowerCamel.**

---

## 3. Startup Handshake, Versioning, and Capabilities

### 3.1 Required control-plane methods

Ngoài method catalog business/core, protocol có 3 reserved control-plane calls:

1. `initialize` — version/capability negotiation
2. `initialized` — client notification after successful init
3. `$/cancelRequest` — cancellation notification for any in-flight request

Optional future control-plane methods:

- `shutdown`
- `exit`

### 3.2 `initialize` request

TS worker sends first request after process spawn.

```ts
export interface InitializeParams {
  clientInfo: {
    name: 'dh-ts-worker';
    version: string;
  };
  protocol: {
    supportedVersions: string[]; // e.g. ['1.0', '1.1-draft']
    supportedFraming: Array<'content-length' | 'ndjson'>;
  };
  workspace: {
    rootPath: string;
    sessionId: string;
  };
  capabilities: {
    notifications: string[];
    streamResponses: boolean;
    cancellation: boolean;
    maxInFlightRequests?: number;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  framing: 'content-length' | 'ndjson';
  serverInfo: {
    name: 'dh-rust-core';
    version: string;
  };
  capabilities: {
    methods: string[];
    notifications: string[];
    degradedMode: boolean;
    parserLanguages: LanguageId[];
    searchModes: Array<'keyword' | 'structural' | 'semantic' | 'hybrid'>;
    maxPayloadBytes: number;
    maxConcurrentRequests: number;
  };
  warnings?: string[];
}
```

Example:

```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "method": "initialize",
  "params": {
    "clientInfo": { "name": "dh-ts-worker", "version": "0.1.0" },
    "protocol": {
      "supportedVersions": ["1.0"],
      "supportedFraming": ["content-length", "ndjson"]
    },
    "workspace": {
      "rootPath": "/home/duypham/Projects/dh-kit",
      "sessionId": "sess_01HXYZ"
    },
    "capabilities": {
      "notifications": [
        "event.workflow.stateChanged",
        "event.agent.status"
      ],
      "streamResponses": true,
      "cancellation": true,
      "maxInFlightRequests": 16
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "result": {
    "protocolVersion": "1.0",
    "framing": "content-length",
    "serverInfo": { "name": "dh-rust-core", "version": "0.1.0" },
    "capabilities": {
      "methods": [
        "query.findSymbol",
        "query.gotoDefinition",
        "query.findReferences",
        "index.workspace",
        "search.hybrid",
        "file.read",
        "tool.execute",
        "runtime.health"
      ],
      "notifications": [
        "event.index.progress",
        "event.file.changed",
        "event.engine.degraded",
        "event.tool.outputChunk"
      ],
      "degradedMode": false,
      "parserLanguages": ["typescript", "javascript", "tsx", "json", "markdown"],
      "searchModes": ["keyword", "structural", "semantic", "hybrid"],
      "maxPayloadBytes": 10485760,
      "maxConcurrentRequests": 32
    },
    "warnings": []
  }
}
```

### 3.3 `initialized` notification

After a successful handshake, TS sends:

```json
{
  "jsonrpc": "2.0",
  "method": "initialized",
  "params": {
    "sessionId": "sess_01HXYZ",
    "ready": true
  }
}
```

### 3.4 Compatibility rules

Backward compatibility policy:

1. **Additive changes are allowed in minor protocol versions**
   - add optional param fields
   - add optional result fields
   - add new notifications
   - add new methods

2. **Breaking changes require major protocol version bump**
   - rename/remove required field
   - change field semantics
   - change notification ordering guarantee
   - remove method or capability

3. **Unknown fields MUST be ignored**
4. **Unknown methods MUST return `METHOD_NOT_FOUND`**
5. **Unknown notifications SHOULD be ignored and MAY be logged to stderr**

---

## 4. Design Principles / Nguyên tắc thiết kế

### 4.1 Coarse-grained calls first

Bridge SHOULD prefer **meaningful coarse-grained APIs** over chatty micro-calls.

Good:

```json
{
  "method": "query.buildEvidence",
  "params": {
    "query": "how authentication works",
    "intent": "explain",
    "budget": { "maxFiles": 8, "maxSymbols": 20, "maxSnippets": 16 }
  }
}
```

Avoid if not necessary:

```text
query.findSymbol -> file.read -> query.findDependencies -> query.callHierarchy -> search.keyword
```

### 4.2 Typed contracts on both sides

- **TS side**: Zod validates inputs/outputs before exposing to agents
- **Rust side**: `serde` + typed handler params, no loose `serde_json::Value` business logic in core handlers

### 4.3 Observable and debuggable

- human-readable JSON payloads
- stable field names
- explicit `timingMs`, `reason`, `warnings`, `degraded` flags
- stderr logs never mixed into stdout protocol

### 4.4 Degraded mode is first-class

If index is stale, parser unavailable, semantic backend off, or tool registry partially unhealthy, Rust MUST:

- return explicit degraded signals
- expose fallback mode in result/error
- never silently pretend full fidelity

### 4.5 Optimistic concurrency for file mutation

`file.write` and `file.applyPatch` SHOULD use `expectedSha256` to avoid blind overwrite.

---

## 5. Method Catalog — Complete Specification

This section is normative.  
For each method below: method name, params schema, result schema, method-specific errors, and example request/response are provided.

### 5.1 `query.*`

#### 5.1.1 `query.findSymbol`

Find symbol by exact or fuzzy name.

**Params schema**

```ts
export interface QueryFindSymbolParams {
  name: string;
  kinds?: SymbolKind[];
  fuzzy?: boolean;
  pathHints?: string[];
  limit?: number;
  includeMembers?: boolean;
}
```

**Result schema**

```ts
export interface QueryFindSymbolResult {
  matches: SymbolSummary[];
  ambiguous: boolean;
  warnings?: string[];
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-find-1",
  "method": "query.findSymbol",
  "params": {
    "name": "AuthService",
    "kinds": ["class"],
    "fuzzy": false,
    "limit": 5,
    "includeMembers": true
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-find-1",
  "result": {
    "matches": [
      {
        "symbolId": "sym_authservice_1",
        "name": "AuthService",
        "kind": "class",
        "language": "typescript",
        "filePath": "src/auth/service.ts",
        "range": {
          "start": { "line": 15, "column": 1 },
          "end": { "line": 120, "column": 2 }
        },
        "signature": "class AuthService",
        "exported": true,
        "score": 1
      }
    ],
    "ambiguous": false,
    "timingMs": 12
  }
}
```

#### 5.1.2 `query.gotoDefinition`

Resolve definition target from a source location or selector.

**Params schema**

```ts
export interface QueryGotoDefinitionParams {
  target: SymbolSelector;
  includeImplementations?: boolean;
}
```

**Result schema**

```ts
export interface QueryGotoDefinitionResult {
  definitions: Location[];
  resolvedBy: 'symbolId' | 'name' | 'location';
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-goto-1",
  "method": "query.gotoDefinition",
  "params": {
    "target": {
      "by": "location",
      "filePath": "src/routes/login.ts",
      "line": 21,
      "column": 17
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-goto-1",
  "result": {
    "definitions": [
      {
        "path": "src/auth/service.ts",
        "range": {
          "start": { "line": 15, "column": 1 },
          "end": { "line": 120, "column": 2 }
        },
        "language": "typescript",
        "preview": "export class AuthService {"
      }
    ],
    "resolvedBy": "location",
    "timingMs": 8
  }
}
```

#### 5.1.3 `query.findReferences`

Find all references for a symbol.

**Params schema**

```ts
export interface QueryFindReferencesParams {
  symbol: SymbolSelector;
  includeDeclaration?: boolean;
  limit?: number;
}
```

**Result schema**

```ts
export interface QueryFindReferencesResult {
  symbol?: SymbolSummary;
  references: Array<Location & { referenceKind?: 'read' | 'write' | 'type' | 'call' }>;
  total: number;
  truncated: boolean;
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-ref-1",
  "method": "query.findReferences",
  "params": {
    "symbol": { "by": "id", "symbolId": "sym_authservice_1" },
    "includeDeclaration": false,
    "limit": 50
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-ref-1",
  "result": {
    "references": [
      {
        "path": "src/routes/login.ts",
        "range": {
          "start": { "line": 21, "column": 9 },
          "end": { "line": 21, "column": 20 }
        },
        "preview": "const auth = new AuthService();",
        "referenceKind": "type"
      }
    ],
    "total": 7,
    "truncated": false,
    "timingMs": 14
  }
}
```

#### 5.1.4 `query.findDependents`

Find reverse dependencies: ai đang phụ thuộc vào target này.

**Params schema**

```ts
export interface QueryFindDependentsParams {
  target: TargetSelector;
  maxDepth?: number;
  includeTransitive?: boolean;
  limit?: number;
}
```

**Result schema**

```ts
export interface QueryFindDependentsResult {
  nodes: Array<{
    target: TargetSelector;
    path?: string;
    symbol?: SymbolSummary;
    via: GraphEdge[];
    depth: number;
  }>;
  total: number;
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-dependents-1",
  "method": "query.findDependents",
  "params": {
    "target": { "kind": "file", "filePath": "src/auth/service.ts" },
    "includeTransitive": true,
    "maxDepth": 2,
    "limit": 20
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-dependents-1",
  "result": {
    "nodes": [
      {
        "target": { "kind": "file", "filePath": "src/routes/login.ts" },
        "path": "src/routes/login.ts",
        "via": [
          {
            "kind": "imports",
            "sourceId": "file_routes_login",
            "targetId": "file_auth_service",
            "sourceLabel": "src/routes/login.ts",
            "targetLabel": "src/auth/service.ts"
          }
        ],
        "depth": 1
      }
    ],
    "total": 3,
    "timingMs": 10
  }
}
```

#### 5.1.5 `query.findDependencies`

Find forward dependencies của target.

**Params schema**

```ts
export interface QueryFindDependenciesParams {
  target: TargetSelector;
  maxDepth?: number;
  includeTransitive?: boolean;
  limit?: number;
}
```

**Result schema**

```ts
export interface QueryFindDependenciesResult {
  nodes: Array<{
    target: TargetSelector;
    path?: string;
    symbol?: SymbolSummary;
    via: GraphEdge[];
    depth: number;
  }>;
  total: number;
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-deps-1",
  "method": "query.findDependencies",
  "params": {
    "target": { "kind": "file", "filePath": "src/auth/service.ts" },
    "includeTransitive": false,
    "maxDepth": 1
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-deps-1",
  "result": {
    "nodes": [
      {
        "target": { "kind": "file", "filePath": "src/db/client.ts" },
        "path": "src/db/client.ts",
        "via": [
          {
            "kind": "imports",
            "sourceId": "file_auth_service",
            "targetId": "file_db_client",
            "sourceLabel": "src/auth/service.ts",
            "targetLabel": "src/db/client.ts"
          }
        ],
        "depth": 1
      }
    ],
    "total": 2,
    "timingMs": 9
  }
}
```

#### 5.1.6 `query.callHierarchy`

Resolve incoming/outgoing call tree.

**Params schema**

```ts
export interface QueryCallHierarchyParams {
  symbol: SymbolSelector;
  direction?: 'incoming' | 'outgoing' | 'both';
  maxDepth?: number;
  maxNodes?: number;
}
```

**Result schema**

```ts
export interface QueryCallHierarchyResult {
  root: SymbolSummary;
  incoming?: Array<{ symbol: SymbolSummary; depth: number; viaRange?: Range }>;
  outgoing?: Array<{ symbol: SymbolSummary; depth: number; viaRange?: Range }>;
  truncated: boolean;
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-call-1",
  "method": "query.callHierarchy",
  "params": {
    "symbol": { "by": "name", "name": "login", "filePath": "src/auth/service.ts" },
    "direction": "both",
    "maxDepth": 2,
    "maxNodes": 20
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-call-1",
  "result": {
    "root": {
      "symbolId": "sym_auth_login",
      "name": "login",
      "kind": "method",
      "language": "typescript",
      "filePath": "src/auth/service.ts",
      "range": {
        "start": { "line": 22, "column": 3 },
        "end": { "line": 45, "column": 4 }
      },
      "containerName": "AuthService"
    },
    "incoming": [
      {
        "symbol": {
          "symbolId": "sym_handle_login",
          "name": "handleLogin",
          "kind": "function",
          "language": "typescript",
          "filePath": "src/routes/login.ts",
          "range": {
            "start": { "line": 10, "column": 1 },
            "end": { "line": 35, "column": 2 }
          }
        },
        "depth": 1
      }
    ],
    "outgoing": [
      {
        "symbol": {
          "symbolId": "sym_find_user",
          "name": "findUser",
          "kind": "function",
          "language": "typescript",
          "filePath": "src/db/user-repo.ts",
          "range": {
            "start": { "line": 8, "column": 1 },
            "end": { "line": 20, "column": 2 }
          }
        },
        "depth": 1
      }
    ],
    "truncated": false,
    "timingMs": 11
  }
}
```

#### 5.1.7 `query.traceFlow`

Trace path(s) from source target to destination target.

**Params schema**

```ts
export interface QueryTraceFlowParams {
  from: TargetSelector;
  to: TargetSelector;
  relationKinds?: Array<'imports' | 'calls' | 'references' | 'contains'>;
  strategy?: 'shortest' | 'allShortest' | 'boundedDfs';
  maxDepth?: number;
  maxPaths?: number;
}
```

**Result schema**

```ts
export interface QueryTraceFlowResult {
  paths: Array<{
    nodes: Array<{ label: string; target: TargetSelector }>;
    edges: GraphEdge[];
    length: number;
  }>;
  timingMs: number;
  warnings?: string[];
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-trace-1",
  "method": "query.traceFlow",
  "params": {
    "from": { "kind": "file", "filePath": "src/routes/login.ts" },
    "to": { "kind": "file", "filePath": "src/db/user-repo.ts" },
    "relationKinds": ["imports", "calls"],
    "strategy": "shortest",
    "maxDepth": 6,
    "maxPaths": 3
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-trace-1",
  "result": {
    "paths": [
      {
        "nodes": [
          { "label": "src/routes/login.ts", "target": { "kind": "file", "filePath": "src/routes/login.ts" } },
          { "label": "handleLogin", "target": { "kind": "symbol", "symbol": { "by": "id", "symbolId": "sym_handle_login" } } },
          { "label": "AuthService.login", "target": { "kind": "symbol", "symbol": { "by": "id", "symbolId": "sym_auth_login" } } },
          { "label": "findUser", "target": { "kind": "symbol", "symbol": { "by": "id", "symbolId": "sym_find_user" } } }
        ],
        "edges": [
          {
            "kind": "contains",
            "sourceId": "file_routes_login",
            "targetId": "sym_handle_login",
            "sourceLabel": "src/routes/login.ts",
            "targetLabel": "handleLogin"
          },
          {
            "kind": "calls",
            "sourceId": "sym_handle_login",
            "targetId": "sym_auth_login",
            "sourceLabel": "handleLogin",
            "targetLabel": "AuthService.login"
          },
          {
            "kind": "calls",
            "sourceId": "sym_auth_login",
            "targetId": "sym_find_user",
            "sourceLabel": "AuthService.login",
            "targetLabel": "findUser"
          }
        ],
        "length": 3
      }
    ],
    "timingMs": 16
  }
}
```

#### 5.1.8 `query.impactAnalysis`

Estimate change impact if target is modified/renamed/deleted.

**Params schema**

```ts
export interface QueryImpactAnalysisParams {
  target: TargetSelector;
  changeType: 'modify' | 'rename' | 'delete' | 'signature' | 'behavior';
  maxDepth?: number;
  includeTests?: boolean;
}
```

**Result schema**

```ts
export interface QueryImpactAnalysisResult {
  directImpact: SearchHit[];
  transitiveImpact: SearchHit[];
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `SYMBOL_NOT_FOUND`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-impact-1",
  "method": "query.impactAnalysis",
  "params": {
    "target": {
      "kind": "symbol",
      "symbol": { "by": "id", "symbolId": "sym_auth_login" }
    },
    "changeType": "signature",
    "maxDepth": 3,
    "includeTests": true
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-impact-1",
  "result": {
    "directImpact": [
      {
        "path": "src/routes/login.ts",
        "snippet": "await auth.login(email, password)",
        "reason": "direct call site"
      }
    ],
    "transitiveImpact": [
      {
        "path": "tests/auth/login.spec.ts",
        "snippet": "expect(login).toReturnToken()",
        "reason": "test exercises impacted path"
      }
    ],
    "riskLevel": "high",
    "reasons": [
      "3 direct call sites",
      "2 transitive dependents",
      "public exported method"
    ],
    "timingMs": 18
  }
}
```

#### 5.1.9 `query.buildEvidence`

Preferred coarse-grained API. Rust internally orchestrates symbol search, dependency tracing, snippet ranking, graph packaging.

**Params schema**

```ts
export interface QueryBuildEvidenceParams {
  query: string;
  intent: 'explain' | 'debug' | 'plan' | 'review' | 'migration';
  targets?: TargetSelector[];
  budget?: {
    maxFiles?: number;
    maxSymbols?: number;
    maxSnippets?: number;
  };
  freshness?: 'allowStale' | 'preferFresh' | 'requireFresh';
}
```

**Result schema**

```ts
export interface QueryBuildEvidenceResult {
  packet: EvidencePacket;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INDEX_NOT_READY`
- `TIMEOUT`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "q-evidence-1",
  "method": "query.buildEvidence",
  "params": {
    "query": "how authentication works end-to-end",
    "intent": "explain",
    "budget": {
      "maxFiles": 6,
      "maxSymbols": 12,
      "maxSnippets": 10
    },
    "freshness": "preferFresh"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "q-evidence-1",
  "result": {
    "packet": {
      "summary": "Authentication enters via login route, delegates to AuthService.login, then validates user via repository and token utilities.",
      "relevantFiles": [
        {
          "path": "src/routes/login.ts",
          "reason": "entry route",
          "relevanceScore": 0.98,
          "ranges": [
            {
              "start": { "line": 10, "column": 1 },
              "end": { "line": 35, "column": 2 }
            }
          ],
          "snippets": ["export async function handleLogin(req, res) {"]
        }
      ],
      "relevantSymbols": [
        {
          "symbolId": "sym_auth_login",
          "name": "login",
          "kind": "method",
          "language": "typescript",
          "filePath": "src/auth/service.ts",
          "range": {
            "start": { "line": 22, "column": 3 },
            "end": { "line": 45, "column": 4 }
          },
          "containerName": "AuthService"
        }
      ],
      "relationships": [
        {
          "kind": "calls",
          "sourceId": "sym_handle_login",
          "targetId": "sym_auth_login",
          "sourceLabel": "handleLogin",
          "targetLabel": "AuthService.login"
        }
      ],
      "confidence": {
        "score": 0.91,
        "ambiguousSymbols": [],
        "missingData": [],
        "degraded": false
      },
      "timingMs": 42
    }
  }
}
```

---

### 5.2 `index.*`

#### 5.2.1 `index.workspace`

Index an entire workspace. Long-running; MAY emit `event.index.progress` notifications while request is pending.

**Params schema**

```ts
export interface IndexWorkspaceParams {
  rootPath?: string;
  mode?: 'full' | 'incremental' | 'background';
  reason?: string;
  force?: boolean;
  streamProgress?: boolean;
}
```

**Result schema**

```ts
export interface IndexWorkspaceResult {
  operationId: string;
  status: 'completed' | 'completed_degraded';
  scannedFiles: number;
  indexedFiles: number;
  skippedFiles: number;
  invalidatedFiles: number;
  durationMs: number;
  warnings?: string[];
}
```

**Error codes**

- `INVALID_PARAMS`
- `TIMEOUT`
- `ENGINE_DEGRADED`
- `INVALID_STATE`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "idx-workspace-1",
  "method": "index.workspace",
  "params": {
    "rootPath": "/home/duypham/Projects/dh-kit",
    "mode": "incremental",
    "reason": "startup warm index",
    "streamProgress": true
  }
}
```

Progress notification example:

```json
{
  "jsonrpc": "2.0",
  "method": "event.index.progress",
  "params": {
    "requestId": "idx-workspace-1",
    "operationId": "op_index_001",
    "seq": 4,
    "phase": "parse",
    "filesDone": 150,
    "filesTotal": 500,
    "percent": 30
  }
}
```

Final response:

```json
{
  "jsonrpc": "2.0",
  "id": "idx-workspace-1",
  "result": {
    "operationId": "op_index_001",
    "status": "completed",
    "scannedFiles": 500,
    "indexedFiles": 87,
    "skippedFiles": 413,
    "invalidatedFiles": 12,
    "durationMs": 2289
  }
}
```

#### 5.2.2 `index.file`

Index or re-index a single file.

**Params schema**

```ts
export interface IndexFileParams {
  filePath: string;
  force?: boolean;
  reason?: string;
}
```

**Result schema**

```ts
export interface IndexFileResult {
  filePath: string;
  status: 'indexed' | 'skipped' | 'unsupported';
  symbolsExtracted?: number;
  edgesExtracted?: number;
  durationMs: number;
  warnings?: string[];
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "idx-file-1",
  "method": "index.file",
  "params": {
    "filePath": "src/auth/service.ts",
    "reason": "file watcher change"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "idx-file-1",
  "result": {
    "filePath": "src/auth/service.ts",
    "status": "indexed",
    "symbolsExtracted": 6,
    "edgesExtracted": 11,
    "durationMs": 21
  }
}
```

#### 5.2.3 `index.status`

Query current indexing state and coverage.

**Params schema**

```ts
export interface IndexStatusParams {
  operationId?: string;
  includeQueue?: boolean;
}
```

**Result schema**

```ts
export interface IndexStatusResult {
  ready: boolean;
  activeOperations: Array<{
    operationId: string;
    kind: 'workspace' | 'file';
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    progressPercent?: number;
  }>;
  coverage: {
    indexedFiles: number;
    knownFiles: number;
    percent: number;
    lastCompletedAt?: string;
  };
  queueDepth?: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "idx-status-1",
  "method": "index.status",
  "params": {
    "includeQueue": true
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "idx-status-1",
  "result": {
    "ready": true,
    "activeOperations": [],
    "coverage": {
      "indexedFiles": 500,
      "knownFiles": 500,
      "percent": 100,
      "lastCompletedAt": "2026-04-13T10:20:11Z"
    },
    "queueDepth": 0
  }
}
```

#### 5.2.4 `index.invalidate`

Invalidate cached index entries for one or more paths.

**Params schema**

```ts
export interface IndexInvalidateParams {
  paths: string[];
  transitive?: boolean;
  reason?: string;
}
```

**Result schema**

```ts
export interface IndexInvalidateResult {
  invalidatedPaths: string[];
  scheduledReindex: boolean;
  estimatedAffectedFiles?: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `ENGINE_DEGRADED`
- `INVALID_STATE`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "idx-invalidate-1",
  "method": "index.invalidate",
  "params": {
    "paths": ["src/auth/service.ts"],
    "transitive": true,
    "reason": "patch applied"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "idx-invalidate-1",
  "result": {
    "invalidatedPaths": ["src/auth/service.ts"],
    "scheduledReindex": true,
    "estimatedAffectedFiles": 4
  }
}
```

---

### 5.3 `search.*`

#### 5.3.1 `search.keyword`

Regex/text oriented search.

**Params schema**

```ts
export interface SearchKeywordParams {
  query: string;
  path?: string;
  globs?: string[];
  caseSensitive?: boolean;
  contextLines?: number;
  limit?: number;
}
```

**Result schema**

```ts
export interface SearchKeywordResult {
  hits: SearchHit[];
  total: number;
  truncated: boolean;
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `TIMEOUT`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "search-keyword-1",
  "method": "search.keyword",
  "params": {
    "query": "TODO|FIXME",
    "globs": ["**/*.ts"],
    "caseSensitive": false,
    "limit": 20
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "search-keyword-1",
  "result": {
    "hits": [
      {
        "path": "src/auth/service.ts",
        "snippet": "// TODO: rotate refresh token",
        "reason": "regex match"
      }
    ],
    "total": 3,
    "truncated": false,
    "timingMs": 7
  }
}
```

#### 5.3.2 `search.structural`

AST/structural search.

**Params schema**

```ts
export interface SearchStructuralParams {
  pattern: string;
  language: LanguageId;
  path?: string;
  strictness?: 'smart' | 'ast' | 'relaxed' | 'cst' | 'signature';
  limit?: number;
}
```

**Result schema**

```ts
export interface SearchStructuralResult {
  hits: SearchHit[];
  total: number;
  truncated: boolean;
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `CAPABILITY_UNSUPPORTED`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "search-struct-1",
  "method": "search.structural",
  "params": {
    "pattern": "console.log($A)",
    "language": "typescript",
    "path": "src",
    "strictness": "smart",
    "limit": 20
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "search-struct-1",
  "result": {
    "hits": [
      {
        "path": "src/debug/logger.ts",
        "snippet": "console.log(message)",
        "reason": "ast pattern match"
      }
    ],
    "total": 1,
    "truncated": false,
    "timingMs": 13
  }
}
```

#### 5.3.3 `search.semantic`

Embedding/vector-based semantic retrieval.

**Params schema**

```ts
export interface SearchSemanticParams {
  query: string;
  path?: string;
  topK?: number;
  minScore?: number;
}
```

**Result schema**

```ts
export interface SearchSemanticResult {
  hits: SearchHit[];
  model?: string;
  timingMs: number;
  degraded: boolean;
}
```

**Error codes**

- `INVALID_PARAMS`
- `CAPABILITY_UNSUPPORTED`
- `ENGINE_DEGRADED`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "search-sem-1",
  "method": "search.semantic",
  "params": {
    "query": "where is authentication token refreshed",
    "topK": 5,
    "minScore": 0.6
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "search-sem-1",
  "result": {
    "hits": [
      {
        "path": "src/auth/refresh.ts",
        "snippet": "export async function refreshAccessToken(refreshToken: string) {",
        "score": 0.92,
        "reason": "semantic similarity"
      }
    ],
    "model": "openai/text-embedding-3-small",
    "timingMs": 24,
    "degraded": false
  }
}
```

#### 5.3.4 `search.hybrid`

Combine keyword + structural + semantic ranking.

**Params schema**

```ts
export interface SearchHybridParams {
  query: string;
  path?: string;
  topK?: number;
  weights?: {
    keyword?: number;
    structural?: number;
    semantic?: number;
  };
  intent?: 'lookup' | 'explain' | 'debug';
}
```

**Result schema**

```ts
export interface SearchHybridResult {
  hits: SearchHit[];
  searchMode: 'keyword' | 'hybrid';
  timingMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `TIMEOUT`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "search-hybrid-1",
  "method": "search.hybrid",
  "params": {
    "query": "how does auth work",
    "topK": 8,
    "intent": "explain",
    "weights": {
      "keyword": 0.2,
      "structural": 0.3,
      "semantic": 0.5
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "search-hybrid-1",
  "result": {
    "hits": [
      {
        "path": "src/auth/service.ts",
        "snippet": "export class AuthService {",
        "score": 0.94,
        "scoreBreakdown": {
          "keyword": 0.6,
          "structural": 0.8,
          "semantic": 0.97
        },
        "reason": "hybrid rank"
      }
    ],
    "searchMode": "hybrid",
    "timingMs": 31
  }
}
```

---

### 5.4 `file.*`

#### 5.4.1 `file.read`

Read full file content.

**Params schema**

```ts
export interface FileReadParams {
  path: string;
  encoding?: 'utf-8';
  maxBytes?: number;
}
```

**Result schema**

```ts
export interface FileReadResult {
  path: string;
  content: string;
  sizeBytes: number;
  bytesReturned: number;
  truncated: boolean;
  sha256: string;
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `ACCESS_DENIED`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "file-read-1",
  "method": "file.read",
  "params": {
    "path": "src/auth/service.ts",
    "maxBytes": 65536
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "file-read-1",
  "result": {
    "path": "src/auth/service.ts",
    "content": "export class AuthService {\n  async login(...) { ... }\n}\n",
    "sizeBytes": 2430,
    "bytesReturned": 2430,
    "truncated": false,
    "sha256": "3d145be0e8f3c4..."
  }
}
```

#### 5.4.2 `file.readRange`

Read a line range only.

**Params schema**

```ts
export interface FileReadRangeParams {
  path: string;
  startLine: number;
  endLine: number;
}
```

**Result schema**

```ts
export interface FileReadRangeResult {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  sha256: string;
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `ACCESS_DENIED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "file-range-1",
  "method": "file.readRange",
  "params": {
    "path": "src/auth/service.ts",
    "startLine": 20,
    "endLine": 45
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "file-range-1",
  "result": {
    "path": "src/auth/service.ts",
    "startLine": 20,
    "endLine": 45,
    "content": "  async login(email: string, password: string) {\n    ...\n  }",
    "sha256": "3d145be0e8f3c4..."
  }
}
```

#### 5.4.3 `file.list`

List directory contents.

**Params schema**

```ts
export interface FileListParams {
  path: string;
  recursive?: boolean;
  depth?: number;
  includeHidden?: boolean;
  globs?: string[];
}
```

**Result schema**

```ts
export interface FileListResult {
  entries: Array<{
    path: string;
    type: 'file' | 'directory' | 'symlink';
    sizeBytes?: number;
  }>;
  total: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `ACCESS_DENIED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "file-list-1",
  "method": "file.list",
  "params": {
    "path": "src/auth",
    "recursive": false
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "file-list-1",
  "result": {
    "entries": [
      { "path": "src/auth/service.ts", "type": "file", "sizeBytes": 2430 },
      { "path": "src/auth/refresh.ts", "type": "file", "sizeBytes": 881 }
    ],
    "total": 2
  }
}
```

#### 5.4.4 `file.diff`

Compute diff between two file-like inputs.

**Params schema**

```ts
export type DiffInput =
  | { kind: 'file'; path: string }
  | { kind: 'content'; label: string; content: string };

export interface FileDiffParams {
  left: DiffInput;
  right: DiffInput;
  contextLines?: number;
  format?: 'unified';
}
```

**Result schema**

```ts
export interface FileDiffResult {
  format: 'unified';
  diff: string;
  changed: boolean;
  stats: {
    additions: number;
    deletions: number;
  };
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "file-diff-1",
  "method": "file.diff",
  "params": {
    "left": { "kind": "file", "path": "src/auth/service.ts" },
    "right": {
      "kind": "content",
      "label": "proposed",
      "content": "export class AuthService {\n  async login(email, password, ip) {}\n}\n"
    },
    "contextLines": 3,
    "format": "unified"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "file-diff-1",
  "result": {
    "format": "unified",
    "diff": "@@ -1,3 +1,3 @@\n-export class AuthService {\n-  async login(email, password) {}\n+export class AuthService {\n+  async login(email, password, ip) {}\n }",
    "changed": true,
    "stats": { "additions": 1, "deletions": 1 }
  }
}
```

#### 5.4.5 `file.write`

Write full file content with optimistic concurrency.

**Params schema**

```ts
export interface FileWriteParams {
  path: string;
  content: string;
  createIfMissing?: boolean;
  expectedSha256?: string;
}
```

**Result schema**

```ts
export interface FileWriteResult {
  path: string;
  sha256: string;
  bytesWritten: number;
  created: boolean;
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `ACCESS_DENIED`
- `CONFLICT`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "file-write-1",
  "method": "file.write",
  "params": {
    "path": "src/auth/service.ts",
    "content": "export class AuthService {\n  async login(email, password, ip) {}\n}\n",
    "expectedSha256": "3d145be0e8f3c4..."
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "file-write-1",
  "result": {
    "path": "src/auth/service.ts",
    "sha256": "9f00a1db2c19...",
    "bytesWritten": 71,
    "created": false
  }
}
```

#### 5.4.6 `file.applyPatch`

Apply a patch to a file. Supports `unified` or `apply_patch`-style patches.

**Params schema**

```ts
export interface FileApplyPatchParams {
  path: string;
  patch: string;
  patchFormat: 'unified' | 'apply_patch';
  expectedSha256?: string;
}
```

**Result schema**

```ts
export interface FileApplyPatchResult {
  path: string;
  sha256: string;
  hunksApplied: number;
  changed: boolean;
}
```

**Error codes**

- `INVALID_PARAMS`
- `FILE_NOT_FOUND`
- `ACCESS_DENIED`
- `PATCH_APPLY_FAILED`
- `CONFLICT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "file-patch-1",
  "method": "file.applyPatch",
  "params": {
    "path": "src/auth/service.ts",
    "patchFormat": "unified",
    "expectedSha256": "3d145be0e8f3c4...",
    "patch": "@@ -1,3 +1,3 @@\n-export class AuthService {\n-  async login(email, password) {}\n+export class AuthService {\n+  async login(email, password, ip) {}\n }"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "file-patch-1",
  "result": {
    "path": "src/auth/service.ts",
    "sha256": "9f00a1db2c19...",
    "hunksApplied": 1,
    "changed": true
  }
}
```

---

### 5.5 `tool.*`

#### 5.5.1 `tool.execute`

Execute a registered Rust-hosted tool. This is not “raw arbitrary shell by default”; it targets a **tool registry** with policy/safety applied by Rust.

**Params schema**

```ts
export interface ToolExecuteParams {
  toolName: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
  streamOutput?: boolean;
}
```

**Result schema**

```ts
export interface ToolExecuteResult {
  operationId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'completed_degraded';
  exitCode?: number;
  stdoutPreview?: string;
  stderrPreview?: string;
  durationMs: number;
}
```

**Error codes**

- `INVALID_PARAMS`
- `CAPABILITY_UNSUPPORTED`
- `TIMEOUT`
- `TOOL_EXECUTION_FAILED`
- `ENGINE_DEGRADED`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "tool-exec-1",
  "method": "tool.execute",
  "params": {
    "toolName": "bash",
    "args": { "command": "git status --short" },
    "timeoutMs": 10000,
    "streamOutput": true
  }
}
```

Streaming chunk notification:

```json
{
  "jsonrpc": "2.0",
  "method": "event.tool.outputChunk",
  "params": {
    "requestId": "tool-exec-1",
    "operationId": "op_tool_001",
    "seq": 1,
    "stream": "stdout",
    "chunk": " M src/auth/service.ts\n",
    "done": false
  }
}
```

Final response:

```json
{
  "jsonrpc": "2.0",
  "id": "tool-exec-1",
  "result": {
    "operationId": "op_tool_001",
    "status": "completed",
    "exitCode": 0,
    "stdoutPreview": " M src/auth/service.ts",
    "durationMs": 49
  }
}
```

#### 5.5.2 `tool.status`

Poll state of a long-running tool operation.

**Params schema**

```ts
export interface ToolStatusParams {
  operationId: string;
}
```

**Result schema**

```ts
export interface ToolStatusResult {
  operationId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
}
```

**Error codes**

- `INVALID_PARAMS`
- `INVALID_STATE`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "tool-status-1",
  "method": "tool.status",
  "params": {
    "operationId": "op_tool_001"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "tool-status-1",
  "result": {
    "operationId": "op_tool_001",
    "status": "completed",
    "exitCode": 0,
    "startedAt": "2026-04-13T10:21:01Z",
    "finishedAt": "2026-04-13T10:21:01Z"
  }
}
```

#### 5.5.3 `tool.cancel`

Cancel a running tool operation.

**Params schema**

```ts
export interface ToolCancelParams {
  operationId: string;
  reason?: string;
}
```

**Result schema**

```ts
export interface ToolCancelResult {
  operationId: string;
  accepted: boolean;
  previousStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}
```

**Error codes**

- `INVALID_PARAMS`
- `INVALID_STATE`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "tool-cancel-1",
  "method": "tool.cancel",
  "params": {
    "operationId": "op_tool_001",
    "reason": "workflow branch changed"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "tool-cancel-1",
  "result": {
    "operationId": "op_tool_001",
    "accepted": true,
    "previousStatus": "running"
  }
}
```

---

### 5.6 `runtime.*`

#### 5.6.1 `runtime.health`

Lightweight health check for Rust core.

**Params schema**

```ts
export interface RuntimeHealthParams {
  includeComponents?: boolean;
}
```

**Result schema**

```ts
export interface RuntimeHealthResult {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  components?: Record<string, 'ok' | 'degraded' | 'down'>;
  message?: string;
}
```

**Error codes**

- `ENGINE_DEGRADED`
- `INTERNAL_ERROR`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "rt-health-1",
  "method": "runtime.health",
  "params": {
    "includeComponents": true
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "rt-health-1",
  "result": {
    "status": "ok",
    "version": "0.1.0",
    "components": {
      "indexer": "ok",
      "parser": "ok",
      "graph": "ok",
      "semantic": "degraded"
    },
    "message": "Semantic embeddings unavailable; keyword/structural search still healthy"
  }
}
```

#### 5.6.2 `runtime.diagnostics`

Detailed diagnostics for debugging or degraded-mode decisions.

**Params schema**

```ts
export interface RuntimeDiagnosticsParams {
  includeCapabilities?: boolean;
  includeRecentErrors?: boolean;
}
```

**Result schema**

```ts
export interface RuntimeDiagnosticsResult {
  diagnostics: DiagnosticEntry[];
  capabilitySnapshot?: Record<string, unknown>;
  recentErrors?: Array<{
    at: string;
    code: string;
    message: string;
  }>;
}
```

**Error codes**

- `ENGINE_DEGRADED`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "rt-diag-1",
  "method": "runtime.diagnostics",
  "params": {
    "includeCapabilities": true,
    "includeRecentErrors": true
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "rt-diag-1",
  "result": {
    "diagnostics": [
      {
        "code": "EMBEDDING_DISABLED",
        "severity": "warning",
        "component": "semantic-search",
        "message": "Embedding indexing is disabled in runtime config",
        "suggestion": "Enable embedding.enabled to activate semantic search"
      }
    ],
    "capabilitySnapshot": {
      "parserLanguages": ["typescript", "javascript", "tsx"],
      "searchModes": ["keyword", "structural", "hybrid"]
    },
    "recentErrors": []
  }
}
```

#### 5.6.3 `runtime.config`

Read effective runtime config values that TS needs for behavior decisions.

**Params schema**

```ts
export interface RuntimeConfigParams {
  keys?: string[];
  includeSources?: boolean;
}
```

**Result schema**

```ts
export interface RuntimeConfigResult {
  values: Record<string, unknown>;
  sources?: Record<string, 'default' | 'workspace' | 'env' | 'session'>;
}
```

**Error codes**

- `INVALID_PARAMS`
- `TIMEOUT`

**Example**

```json
{
  "jsonrpc": "2.0",
  "id": "rt-config-1",
  "method": "runtime.config",
  "params": {
    "keys": ["embedding.enabled", "maxConcurrentRequests"],
    "includeSources": true
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "rt-config-1",
  "result": {
    "values": {
      "embedding.enabled": false,
      "maxConcurrentRequests": 32
    },
    "sources": {
      "embedding.enabled": "workspace",
      "maxConcurrentRequests": "default"
    }
  }
}
```

---

## 6. Event / Notification System

Notifications are one-way messages with no `id` and no response.

### 6.1 Common event envelope

```ts
export interface EventBase {
  requestId?: RpcId;
  operationId?: string;
  ts: string; // ISO timestamp
  seq?: number;
}
```

### 6.2 Rust → TS notifications

#### `event.index.progress`

Used during `index.workspace` or large `index.file` operations.

```ts
export interface EventIndexProgress extends EventBase {
  phase: 'scan' | 'parse' | 'graph' | 'embed' | 'persist';
  filesDone: number;
  filesTotal: number;
  percent: number;
}
```

#### `event.file.changed`

Used when Rust file watcher detects a change relevant to TS workflow.

```ts
export interface EventFileChanged extends EventBase {
  path: string;
  change: 'created' | 'modified' | 'deleted' | 'renamed';
  newPath?: string;
}
```

#### `event.engine.degraded`

Announces backend degradation so TS can downgrade strategy.

```ts
export interface EventEngineDegraded extends EventBase {
  component: 'indexer' | 'parser' | 'graph' | 'semantic' | 'tooling';
  severity: 'warning' | 'error';
  message: string;
  suggestion?: string;
}
```

#### `event.tool.outputChunk`

Streaming output for long-running tools.

```ts
export interface EventToolOutputChunk extends EventBase {
  stream: 'stdout' | 'stderr';
  chunk: string;
  done: boolean;
}
```

### 6.3 TS → Rust notifications

#### `event.workflow.stateChanged`

Used so Rust host/CLI can observe workflow progress, persist breadcrumb logs, or decide whether to keep worker warm.

```ts
export interface EventWorkflowStateChanged extends EventBase {
  mode: 'quick' | 'migration' | 'full';
  stage: string;
  owner: string;
  status: 'in_progress' | 'blocked' | 'done';
  summary?: string;
}
```

#### `event.agent.status`

Fine-grained status for currently active TS agent.

```ts
export interface EventAgentStatus extends EventBase {
  agentId: string;
  role: string;
  state: 'thinking' | 'planning' | 'waiting_tool' | 'calling_llm' | 'streaming' | 'done' | 'error';
  summary?: string;
}
```

### 6.4 Optional v1.1 extension for LLM passthrough

Because LLM lives in TS, nếu Rust CLI muốn render token stream live without embedding LLM client into Rust, TS MAY send:

#### `event.agent.outputChunk` *(optional extension)*

```ts
export interface EventAgentOutputChunk extends EventBase {
  channel: 'answer' | 'reasoning_summary';
  chunk: string;
  done: boolean;
}
```

Example:

```json
{
  "jsonrpc": "2.0",
  "method": "event.agent.outputChunk",
  "params": {
    "ts": "2026-04-13T10:24:00Z",
    "requestId": "ask-001",
    "seq": 7,
    "channel": "answer",
    "chunk": "Authentication starts at the login route...",
    "done": false
  }
}
```

---

## 7. Streaming Support / Long-running Operations

### 7.1 Canonical pattern: single final response + notification stream

JSON-RPC bản thân không support multiple `result` messages cho một request id. Vì vậy DH chọn pattern sau:

1. client sends normal request
2. server starts operation and MAY emit progress/output notifications
3. original request receives exactly one terminal response when operation completes

This is the **canonical** streaming model for DH.

#### Why this pattern

- keeps JSON-RPC compliance clean
- easier future/promise API on TS side
- no fake “chunked responses” violating JSON-RPC
- can still render live progress/output through notifications

### 7.2 Chunked response pattern vs notification stream pattern

#### Rejected as primary: fake chunked responses

Not recommended:

```text
response #1 partial
response #2 partial
response #3 final
```

Lý do: not valid JSON-RPC semantics.

#### Chosen: notification stream pattern

Recommended:

```text
request(id=42)
  → event.* seq=1
  → event.* seq=2
  → event.* seq=3
  → final response(id=42)
```

### 7.3 Operations that SHOULD stream

- `index.workspace`
- `tool.execute` when `streamOutput = true`
- future heavy `query.buildEvidence` when graph walk is expensive
- TS-originated LLM answer streaming via optional `event.agent.outputChunk`

### 7.4 Cancellation protocol

DH supports two cancellation paths:

#### A. Generic request cancellation — `$/cancelRequest`

This is reserved notification affecting any in-flight request.

```ts
export interface CancelRequestParams {
  id: RpcId;
  reason?: string;
}
```

Example:

```json
{
  "jsonrpc": "2.0",
  "method": "$/cancelRequest",
  "params": {
    "id": "idx-workspace-1",
    "reason": "user interrupted"
  }
}
```

Server behavior:

- SHOULD stop work if cancellation is still possible
- MUST eventually send terminal error response for the original request:

```json
{
  "jsonrpc": "2.0",
  "id": "idx-workspace-1",
  "error": {
    "code": -32015,
    "message": "Operation cancelled",
    "data": {
      "dhCode": "OPERATION_CANCELLED",
      "retryable": true,
      "suggestion": "Retry the request when ready"
    }
  }
}
```

#### B. Domain-specific cancellation — `tool.cancel`

For tool lifecycle management and post-hoc control via `operationId`.

### 7.5 Sequence guarantees in streams

For a given `operationId`:

- `seq` MUST start at `1`
- `seq` MUST increase by `1` per notification from same source
- receiver MAY detect gaps and mark stream as incomplete
- stream completion is implied by final response or explicit event with `done: true`

---

## 8. Error Handling Contract

### 8.1 Standard JSON-RPC codes

| Symbol | Code | Meaning |
|---|---:|---|
| `PARSE_ERROR` | -32700 | invalid JSON |
| `INVALID_REQUEST` | -32600 | malformed JSON-RPC envelope |
| `METHOD_NOT_FOUND` | -32601 | method unknown |
| `INVALID_PARAMS` | -32602 | params schema invalid |
| `INTERNAL_ERROR` | -32603 | unexpected server error |

### 8.2 DH-specific error codes

| Symbol | Code | Meaning |
|---|---:|---|
| `INDEX_NOT_READY` | -32010 | workspace index unavailable or insufficient |
| `SYMBOL_NOT_FOUND` | -32011 | requested symbol cannot be resolved |
| `FILE_NOT_FOUND` | -32012 | path missing |
| `TIMEOUT` | -32013 | operation exceeded deadline |
| `ENGINE_DEGRADED` | -32014 | backend partially unhealthy; result unavailable or low fidelity |
| `OPERATION_CANCELLED` | -32015 | request cancelled |
| `CAPABILITY_UNSUPPORTED` | -32016 | backend feature not enabled/supported |
| `PATCH_APPLY_FAILED` | -32017 | patch did not apply cleanly |
| `TOOL_EXECUTION_FAILED` | -32018 | tool ran but failed |
| `CONFLICT` | -32019 | optimistic concurrency / state conflict |
| `ACCESS_DENIED` | -32020 | file/tool access blocked by policy |
| `INVALID_STATE` | -32021 | operation invalid for current runtime state |

### 8.3 Error object structure

```ts
export interface DhRpcError {
  code: number;
  message: string;
  data?: {
    dhCode?: string;
    category?: 'parse' | 'validation' | 'index' | 'search' | 'file' | 'tool' | 'runtime';
    retryable?: boolean;
    degraded?: boolean;
    suggestion?: string;
    suggestions?: string[];
    details?: Record<string, unknown>;
  };
}
```

### 8.4 Actionable suggestion rule

Every DH-specific error SHOULD include a next-step suggestion that an agent or operator can act on.

Example:

```json
{
  "jsonrpc": "2.0",
  "id": "q-evidence-2",
  "error": {
    "code": -32010,
    "message": "Workspace index is not ready",
    "data": {
      "dhCode": "INDEX_NOT_READY",
      "category": "index",
      "retryable": true,
      "degraded": false,
      "suggestion": "Call index.workspace before query.buildEvidence",
      "suggestions": [
        "index.workspace { mode: 'incremental' }",
        "runtime.diagnostics"
      ],
      "details": {
        "indexedFiles": 12,
        "knownFiles": 500
      }
    }
  }
}
```

### 8.5 Degraded result vs degraded error

Rule:

- If the operation can still produce a useful partial answer, prefer **successful result with `degraded` signal**.
- If fidelity would be misleading or unsafe, return **error `ENGINE_DEGRADED`**.

Example degraded success:

```json
{
  "jsonrpc": "2.0",
  "id": "search-sem-2",
  "result": {
    "hits": [],
    "model": null,
    "timingMs": 3,
    "degraded": true
  }
}
```

Example degraded error:

```json
{
  "jsonrpc": "2.0",
  "id": "q-trace-2",
  "error": {
    "code": -32014,
    "message": "Call graph backend unavailable",
    "data": {
      "dhCode": "ENGINE_DEGRADED",
      "category": "runtime",
      "retryable": true,
      "degraded": true,
      "suggestion": "Rebuild index or fall back to query.findDependencies"
    }
  }
}
```

---

## 9. TypeScript Client SDK Sketch

TS agents MUST NOT manually construct raw method strings all over the codebase. They should use a typed SDK.

### 9.1 Method map

```ts
export interface BridgeMethodMap {
  'query.findSymbol': { params: QueryFindSymbolParams; result: QueryFindSymbolResult };
  'query.gotoDefinition': { params: QueryGotoDefinitionParams; result: QueryGotoDefinitionResult };
  'query.findReferences': { params: QueryFindReferencesParams; result: QueryFindReferencesResult };
  'query.findDependents': { params: QueryFindDependentsParams; result: QueryFindDependentsResult };
  'query.findDependencies': { params: QueryFindDependenciesParams; result: QueryFindDependenciesResult };
  'query.callHierarchy': { params: QueryCallHierarchyParams; result: QueryCallHierarchyResult };
  'query.traceFlow': { params: QueryTraceFlowParams; result: QueryTraceFlowResult };
  'query.impactAnalysis': { params: QueryImpactAnalysisParams; result: QueryImpactAnalysisResult };
  'query.buildEvidence': { params: QueryBuildEvidenceParams; result: QueryBuildEvidenceResult };
  'index.workspace': { params: IndexWorkspaceParams; result: IndexWorkspaceResult };
  'index.file': { params: IndexFileParams; result: IndexFileResult };
  'index.status': { params: IndexStatusParams; result: IndexStatusResult };
  'index.invalidate': { params: IndexInvalidateParams; result: IndexInvalidateResult };
  'search.keyword': { params: SearchKeywordParams; result: SearchKeywordResult };
  'search.structural': { params: SearchStructuralParams; result: SearchStructuralResult };
  'search.semantic': { params: SearchSemanticParams; result: SearchSemanticResult };
  'search.hybrid': { params: SearchHybridParams; result: SearchHybridResult };
  'file.read': { params: FileReadParams; result: FileReadResult };
  'file.readRange': { params: FileReadRangeParams; result: FileReadRangeResult };
  'file.list': { params: FileListParams; result: FileListResult };
  'file.diff': { params: FileDiffParams; result: FileDiffResult };
  'file.write': { params: FileWriteParams; result: FileWriteResult };
  'file.applyPatch': { params: FileApplyPatchParams; result: FileApplyPatchResult };
  'tool.execute': { params: ToolExecuteParams; result: ToolExecuteResult };
  'tool.status': { params: ToolStatusParams; result: ToolStatusResult };
  'tool.cancel': { params: ToolCancelParams; result: ToolCancelResult };
  'runtime.health': { params: RuntimeHealthParams; result: RuntimeHealthResult };
  'runtime.diagnostics': { params: RuntimeDiagnosticsParams; result: RuntimeDiagnosticsResult };
  'runtime.config': { params: RuntimeConfigParams; result: RuntimeConfigResult };
}
```

### 9.2 Zod-first validation

```ts
import { z } from 'zod';

const PositionSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});

const SymbolSummarySchema = z.object({
  symbolId: z.string(),
  name: z.string(),
  kind: z.string(),
  language: z.string(),
  filePath: z.string(),
  range: RangeSchema,
});

const QueryFindSymbolResultSchema = z.object({
  matches: z.array(SymbolSummarySchema),
  ambiguous: z.boolean(),
  warnings: z.array(z.string()).optional(),
  timingMs: z.number(),
});
```

### 9.3 Client transport + typed request API

```ts
type EventHandler<T> = (payload: T) => void;

export class DhBridgeClient {
  private nextId = 1;
  private pending = new Map<RpcId, { resolve: Function; reject: Function }>();

  async request<M extends keyof BridgeMethodMap>(
    method: M,
    params: BridgeMethodMap[M]['params'],
  ): Promise<BridgeMethodMap[M]['result']> {
    const id = `req-${this.nextId++}`;
    const message: DhRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(message);
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  cancel(id: RpcId, reason?: string): void {
    this.notify('$/cancelRequest', { id, reason });
  }

  private send(msg: DhRpcRequest | DhRpcNotification) {
    // encode Content-Length frame and write to child.stdin
  }

  handleIncoming(raw: string) {
    const parsed = JSON.parse(raw);
    // route response vs notification
  }
}
```

### 9.4 Friendly wrapper surface for agents

```ts
export class DhCoreApi {
  constructor(private readonly rpc: DhBridgeClient) {}

  query = {
    findSymbol: (params: QueryFindSymbolParams) =>
      this.rpc.request('query.findSymbol', params),
    gotoDefinition: (params: QueryGotoDefinitionParams) =>
      this.rpc.request('query.gotoDefinition', params),
    buildEvidence: (params: QueryBuildEvidenceParams) =>
      this.rpc.request('query.buildEvidence', params),
  };

  search = {
    hybrid: (params: SearchHybridParams) =>
      this.rpc.request('search.hybrid', params),
  };

  files = {
    read: (params: FileReadParams) => this.rpc.request('file.read', params),
    applyPatch: (params: FileApplyPatchParams) =>
      this.rpc.request('file.applyPatch', params),
  };

  tool = {
    execute: (params: ToolExecuteParams) => this.rpc.request('tool.execute', params),
    cancel: (params: ToolCancelParams) => this.rpc.request('tool.cancel', params),
  };
}
```

### 9.5 Recommended agent usage pattern

TS agents SHOULD use:

- `query.buildEvidence` for broad understanding tasks
- `query.findSymbol` / `gotoDefinition` / `findReferences` for targeted navigation
- `search.hybrid` for concept lookup
- `file.readRange` before `file.read` when scope is narrow

---

## 10. Rust Server Implementation Sketch

### 10.1 High-level architecture

```text
stdin frame reader
  → JSON decode
  → request/notification classifier
  → router dispatch
  → async handler task
  → writer queue
  → stdout frame writer
```

Important design rule: **stdout writing must be single-threaded**, even if handlers are concurrent.

### 10.2 Dispatcher/router pattern

```rust
use async_trait::async_trait;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

pub struct RpcContext {
    pub request_id: Option<Value>,
    pub state: Arc<AppState>,
    pub notifier: Arc<Notifier>,
}

#[async_trait]
pub trait RpcHandler: Send + Sync {
    async fn handle(&self, ctx: RpcContext, params: Value) -> RpcOutcome;
}

pub enum RpcOutcome {
    Response(Value),
    NoResponse,
}

pub struct Router {
    handlers: HashMap<&'static str, Arc<dyn RpcHandler>>,
}

impl Router {
    pub fn new() -> Self {
        Self { handlers: HashMap::new() }
    }

    pub fn register(mut self, method: &'static str, handler: Arc<dyn RpcHandler>) -> Self {
        self.handlers.insert(method, handler);
        self
    }

    pub async fn dispatch(&self, method: &str, ctx: RpcContext, params: Value) -> RpcOutcome {
        match self.handlers.get(method) {
            Some(handler) => handler.handle(ctx, params).await,
            None => RpcOutcome::Response(error_response(-32601, "Method not found", None)),
        }
    }
}
```

### 10.3 Handler registration

```rust
pub fn build_router(state: Arc<AppState>, notifier: Arc<Notifier>) -> Router {
    Router::new()
        .register("query.findSymbol", Arc::new(FindSymbolHandler::new()))
        .register("query.gotoDefinition", Arc::new(GotoDefinitionHandler::new()))
        .register("query.findReferences", Arc::new(FindReferencesHandler::new()))
        .register("query.findDependents", Arc::new(FindDependentsHandler::new()))
        .register("query.findDependencies", Arc::new(FindDependenciesHandler::new()))
        .register("query.callHierarchy", Arc::new(CallHierarchyHandler::new()))
        .register("query.traceFlow", Arc::new(TraceFlowHandler::new()))
        .register("query.impactAnalysis", Arc::new(ImpactAnalysisHandler::new()))
        .register("query.buildEvidence", Arc::new(BuildEvidenceHandler::new()))
        .register("index.workspace", Arc::new(IndexWorkspaceHandler::new()))
        .register("index.file", Arc::new(IndexFileHandler::new()))
        .register("index.status", Arc::new(IndexStatusHandler::new()))
        .register("index.invalidate", Arc::new(IndexInvalidateHandler::new()))
        .register("search.keyword", Arc::new(SearchKeywordHandler::new()))
        .register("search.structural", Arc::new(SearchStructuralHandler::new()))
        .register("search.semantic", Arc::new(SearchSemanticHandler::new()))
        .register("search.hybrid", Arc::new(SearchHybridHandler::new()))
        .register("file.read", Arc::new(FileReadHandler::new()))
        .register("file.readRange", Arc::new(FileReadRangeHandler::new()))
        .register("file.list", Arc::new(FileListHandler::new()))
        .register("file.diff", Arc::new(FileDiffHandler::new()))
        .register("file.write", Arc::new(FileWriteHandler::new()))
        .register("file.applyPatch", Arc::new(FileApplyPatchHandler::new()))
        .register("tool.execute", Arc::new(ToolExecuteHandler::new()))
        .register("tool.status", Arc::new(ToolStatusHandler::new()))
        .register("tool.cancel", Arc::new(ToolCancelHandler::new()))
        .register("runtime.health", Arc::new(RuntimeHealthHandler::new()))
        .register("runtime.diagnostics", Arc::new(RuntimeDiagnosticsHandler::new()))
        .register("runtime.config", Arc::new(RuntimeConfigHandler::new()))
        .register("initialize", Arc::new(InitializeHandler::new(state, notifier)))
}
```

### 10.4 Strongly typed param decoding per handler

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryFindSymbolParams {
    pub name: String,
    pub kinds: Option<Vec<String>>,
    pub fuzzy: Option<bool>,
    pub path_hints: Option<Vec<String>>,
    pub limit: Option<u32>,
    pub include_members: Option<bool>,
}

pub struct FindSymbolHandler;

#[async_trait]
impl RpcHandler for FindSymbolHandler {
    async fn handle(&self, ctx: RpcContext, params: Value) -> RpcOutcome {
        let params: QueryFindSymbolParams = match serde_json::from_value(params) {
            Ok(v) => v,
            Err(err) => return RpcOutcome::Response(invalid_params(err.to_string())),
        };

        let result = ctx.state.query_service.find_symbol(params).await;
        match result {
            Ok(res) => RpcOutcome::Response(success_response(ctx.request_id, serde_json::to_value(res).unwrap())),
            Err(err) => RpcOutcome::Response(map_domain_error(ctx.request_id, err)),
        }
    }
}
```

### 10.5 Concurrency model

Recommended Rust async architecture:

```rust
pub struct AppState {
    pub request_semaphore: tokio::sync::Semaphore,
    pub cancellation: dashmap::DashMap<String, tokio_util::sync::CancellationToken>,
    pub query_service: QueryService,
    pub index_service: IndexService,
    pub file_service: FileService,
    pub tool_service: ToolService,
    pub runtime_service: RuntimeService,
}
```

Request loop sketch:

```rust
loop {
    let frame = reader.next_frame().await?;
    let msg: IncomingMessage = serde_json::from_slice(&frame)?;

    match msg {
        IncomingMessage::Request(req) => {
            let permit = state.request_semaphore.acquire().await?;
            let state = state.clone();
            let router = router.clone();
            let writer = writer.clone();

            tokio::spawn(async move {
                let _permit = permit;
                let cancel = CancellationToken::new();
                state.cancellation.insert(req.id.to_string(), cancel.clone());

                let ctx = RpcContext {
                    request_id: Some(serde_json::to_value(&req.id).unwrap()),
                    state: state.clone(),
                    notifier: writer.notifier(),
                };

                let outcome = router.dispatch(&req.method, ctx, req.params).await;
                if let RpcOutcome::Response(resp) = outcome {
                    writer.send_json(resp).await.ok();
                }
                state.cancellation.remove(&req.id.to_string());
            });
        }
        IncomingMessage::Notification(note) => {
            handle_notification(note, state.clone(), writer.notifier()).await;
        }
        IncomingMessage::Response(_) => {
            // Rust server generally ignores responses unless future reverse request mode is enabled
        }
    }
}
```

### 10.6 Writer queue pattern

Because stdout frame boundaries must not interleave:

```rust
pub struct Writer {
    tx: tokio::sync::mpsc::Sender<Vec<u8>>,
}

impl Writer {
    pub async fn send_json(&self, value: serde_json::Value) -> anyhow::Result<()> {
        let payload = serde_json::to_vec(&value)?;
        let framed = frame_with_content_length(payload);
        self.tx.send(framed).await?;
        Ok(())
    }
}

pub async fn stdout_writer_loop(
    mut rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
    mut stdout: tokio::io::Stdout,
) -> anyhow::Result<()> {
    while let Some(frame) = rx.recv().await {
        stdout.write_all(&frame).await?;
        stdout.flush().await?;
    }
    Ok(())
}
```

### 10.7 Notification helper

```rust
#[derive(Clone)]
pub struct Notifier {
    writer: Arc<Writer>,
}

impl Notifier {
    pub async fn notify<T: Serialize>(&self, method: &str, params: &T) {
        let value = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let _ = self.writer.send_json(value).await;
    }
}
```

### 10.8 Cancellation mapping

`$/cancelRequest` handling sketch:

```rust
async fn handle_notification(note: Notification, state: Arc<AppState>, notifier: Arc<Notifier>) {
    if note.method == "$/cancelRequest" {
        if let Ok(params) = serde_json::from_value::<CancelRequestParams>(note.params) {
            if let Some(token) = state.cancellation.get(&params.id.to_string()) {
                token.cancel();
            }
        }
        return;
    }

    // handle event.workflow.stateChanged, event.agent.status, etc.
}
```

Every long-running handler SHOULD periodically check cancellation token.

---

## 11. Recommended Implementation Notes / Practical Rules

### 11.1 Path normalization

All file paths MUST be normalized relative to initialized workspace root unless explicitly absolute and still inside allowed workspace boundary.

### 11.2 Encoding and coordinate system

- payload text encoding: UTF-8
- protocol positions: line/column 1-based, column counted in UTF-16 code units
- Rust internals MAY use byte offsets but MUST convert before sending over bridge

### 11.3 Security / safety

- `file.*` write operations should be workspace-scoped by default
- `tool.execute` should route through allowlisted registry, not unrestricted shell unless policy says so
- logs and secrets must never be emitted on stdout outside JSON-RPC frames

### 11.4 Degraded fallback behavior matrix

| Condition | Rust behavior | TS behavior |
|---|---|---|
| index missing | return `INDEX_NOT_READY` for graph queries | trigger `index.workspace` or reduce scope |
| semantic disabled | return degraded search result or `CAPABILITY_UNSUPPORTED` | fall back to keyword/structural |
| parser missing for language | return `CAPABILITY_UNSUPPORTED` or degraded result | fall back to file/text mode |
| tool backend unhealthy | emit `event.engine.degraded` | avoid tool-heavy strategies |

### 11.5 Preferred TS call strategy

When agent asks broad question:

1. `runtime.health`
2. `index.status`
3. if ready → `query.buildEvidence`
4. optionally narrow with `query.gotoDefinition` / `findReferences`

When agent wants mutation:

1. `file.read` or `file.readRange`
2. `file.diff` or local transform planning
3. `file.write` or `file.applyPatch`
4. `index.invalidate`
5. optional `index.file`

---

## 12. Final Recommendation / Chốt thiết kế

For DH v1 bridge, the protocol should be:

1. **JSON-RPC 2.0 over stdio with Content-Length framing as canonical transport**
2. **single final response + notification stream** for long-running work
3. **coarse-grained evidence-oriented APIs** instead of chatty symbol-by-symbol orchestration
4. **typed contracts end-to-end** with Zod on TS and serde structs on Rust
5. **explicit degraded mode and actionable errors** so agents never hallucinate capability

This gives DH a bridge that is:

- simple enough to implement now
- observable enough to debug under migration pressure
- structured enough to support deep codebase understanding as the core product value
- evolvable enough to survive Rust engine growth without forcing a bridge redesign every month
