# DH Skills And MCP Integration

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt cách `dh` tích hợp mặc định giữa:

- skills trong `ref/skills/`
- MCPs mặc định

Mục tiêu không phải chỉ khai báo chúng tồn tại, mà là biến chúng thành một phần bắt buộc của orchestration runtime — enforce qua skill activation hook và MCP routing hook trong forked Go core — để `dh`:

- chọn đúng skill theo lane, role và task type
- chọn đúng MCP theo intent và phase
- ưu tiên code intelligence tools trước `grep`, `find`, `cat` kiểu cũ
- dùng skills và MCP như first-class execution policy

Current implementation note:

- Current codebase đã có skill/MCP registries, policy selection và audit logging trong workflow/TS-side path.
- Enforcement đầy đủ qua Go runtime hooks vẫn là target state; tài liệu này nên được đọc như policy source of truth hơn là mô tả runtime wiring đã hoàn tất.

## Nguyên tắc nền

1. Skill không phải tài liệu tham khảo thụ động. Skill là SOP có thể được auto-attach theo ngữ cảnh.
2. MCP không phải fallback hiếm khi dùng. MCP là execution surface chính cho search, code intelligence, browser, docs và web.
3. `dh` phải chọn `skill + MCP set` theo lane, role và intent trước khi agent bắt đầu làm việc.
4. Nếu task đòi hỏi code understanding, `grep/find` không được là lựa chọn mặc định đầu tiên.
5. Tool enforcement của `dh` phải bao gồm cả `skill activation policy` và `MCP routing policy`.

## Default Skill Registry

`dh` mặc định bundle và kích hoạt logic cho các skill trong `ref/skills/` sau:

1. `using-skills`
2. `codebase-exploration`
3. `systematic-debugging`
4. `verification-before-completion`
5. `writing-solution`
6. `writing-scope`
7. `subagent-driven-development`
8. `code-review`
9. `test-driven-development`
10. `brainstorming`
11. `refactoring`
12. `deep-research`
13. `browser-automation`
14. `dev-browser`
15. `frontend-ui-ux`
16. `find-skills`
17. `vercel-composition-patterns`
18. `vercel-react-best-practices`
19. `vercel-react-native-skills`

## Default MCP Registry

`dh` mặc định tích hợp và ưu tiên các MCP/tool surface sau:

1. `augment_context_engine`
2. `chrome-devtools`
3. `context7`
4. `grep_app`
5. `websearch`
6. `playwright`

## Vai trò của từng MCP

### `augment_context_engine`

Vai trò mặc định:

- semantic code context search trên workspace hiện tại
- tìm đoạn code liên quan theo behavior thay vì exact string
- bootstrap exploration khi chưa biết symbol cụ thể

Khi nên dùng trước:

- `how X works`
- `where logic Y is enforced`
- `find behavior related to ...`

### `grep_app`

Vai trò mặc định:

- tìm real-world code examples trên GitHub public
- tham khảo pattern implementation khi cần thiết kế hoặc migrate
- giúp architect, migration lane và debugging lane so sánh usage patterns

Khi nên dùng trước:

- framework/library usage chưa chắc tay
- cần đối chiếu pattern ngoài codebase hiện tại
- migration cần xem cách ecosystem đang làm

### `context7`

Vai trò mặc định:

- tra cứu docs chính thức, snippets và API reference
- dùng khi task có library/framework cụ thể
- giảm hallucination về API usage

Khi nên dùng trước:

- user hỏi về library/framework
- architect cần xác nhận API đúng
- migration cần kiểm tra breaking changes hoặc setup mới

### `websearch`

Vai trò mặc định:

- tìm thông tin web ngoài docs chính thức
- research release notes, migration notes, blog kỹ thuật, issue patterns

Khi nên dùng trước:

- cần release/migration intelligence
- docs chính thức chưa đủ
- bug pattern liên quan ecosystem

### `chrome-devtools`

Vai trò mặc định:

- kiểm tra behavior frontend trong browser thật
- dùng cho diagnostics, network, console, lighthouse, performance, DOM state

Khi nên dùng trước:

- review UI behavior
- verify browser runtime issue
- điều tra console/network/perf problem

### `playwright`

Vai trò mặc định:

- browser automation có kịch bản thao tác
- smoke test và interaction flows
- thao tác web cần điều khiển nhiều bước

Khi nên dùng trước:

- cần click/fill/navigate tự động
- cần chạy flow có nhiều bước UI
- cần upload, form interactions, scripted verification

## Skill Activation Policy — Enforced Via Hook

`dh` không đợi agent tự nhớ skill. Target runtime sẽ enforce skill activation qua **skill activation hook** trong forked Go core.

Khi Go core khởi tạo agent, hook fires và gọi `resolveSkills(envelope)` trong dh TypeScript logic. Function này trả về danh sách active skills dựa trên lane/role/intent policy.

## Always-on skill

Mọi session đều phải có:

1. `using-skills`

Lý do:

- đây là meta-skill buộc agent nhớ rằng skill là SOP bắt buộc, không phải tùy hứng

## Intent-driven skills

### Code exploration

Khi intent là:

- explain module
- trace flow
- impact analysis
- broad codebase question

Phải attach:

1. `codebase-exploration`

### Debugging

Khi intent là bug investigation, failure analysis, unexpected behavior:

Phải attach:

1. `systematic-debugging`

### Pre-completion and verification

Trước khi kết luận task hoàn tất, verify pass, hoặc chuyển gate:

Phải attach:

1. `verification-before-completion`

### Solution design

Khi lane là `delivery` hoặc `migration` và role là `Architect`:

Phải attach:

1. `writing-solution`

### Scope writing

Khi cần chuẩn hóa yêu cầu hoặc scope package:

Phải attach:

1. `writing-scope`

### Multi-agent execution

Khi lane là `delivery` hoặc `migration` và execution được tách thành work items:

Phải attach:

1. `subagent-driven-development`

### Review

Khi role là reviewer hoặc đang chạy review gate:

Phải attach:

1. `code-review`

### Refactor

Khi task là cleanup, rename, decomposition, simplification:

Phải attach:

1. `refactoring`

### TDD

Khi lane là `delivery` và task là implementation logic có test path phù hợp:

Phải attach:

1. `test-driven-development`

### Frontend or React

Khi task dính React/Next/frontend UI:

Phải attach theo domain:

1. `frontend-ui-ux`
2. `vercel-react-best-practices`
3. `vercel-composition-patterns` nếu task là component API/composition
4. `browser-automation` hoặc `dev-browser` nếu cần browser interaction

### React Native

Khi task dính React Native hoặc Expo:

Phải attach:

1. `vercel-react-native-skills`

### Research

Khi task là research sâu hoặc migration research:

Phải attach:

1. `deep-research`

### Capability discovery

Khi user hỏi skill/capability mới:

Phải attach:

1. `find-skills`

## Lane Skill Matrix

## `quick`

Always attach:

1. `using-skills`

Conditional attach:

1. `codebase-exploration`
2. `systematic-debugging`
3. `verification-before-completion`
4. `refactoring`
5. `frontend-ui-ux`
6. `vercel-react-best-practices`
7. `vercel-composition-patterns`
8. `vercel-react-native-skills`

## `delivery`

Always attach:

1. `using-skills`
2. `verification-before-completion`

Role-driven attach:

1. `Analyst` -> `codebase-exploration`, `brainstorming` khi cần
2. `Architect` -> `writing-solution`, `codebase-exploration`, `deep-research` khi cần
3. `Implementer` -> `subagent-driven-development`, `test-driven-development` nếu phù hợp, `refactoring` khi cần
4. `Reviewer` -> `code-review`
5. `Tester` -> `verification-before-completion`, `browser-automation` hoặc `dev-browser` nếu có browser path

## `migration`

Always attach:

1. `using-skills`
2. `verification-before-completion`

Role-driven attach:

1. `Analyst` -> `codebase-exploration`, `deep-research`
2. `Architect` -> `writing-solution`, `deep-research`
3. `Implementer` -> `subagent-driven-development`, `refactoring`
4. `Reviewer` -> `code-review`
5. `Tester` -> `verification-before-completion`, `browser-automation` hoặc `dev-browser` nếu relevant

Migration không ép TDD giả tạo. Nó ưu tiên baseline, compatibility và regression evidence.

## MCP Routing Policy — Enforced Via Hook

`dh` có mục tiêu enforce MCP routing qua **MCP routing hook** trong forked Go core.

Khi Go core cần connect tới MCP server, hook fires và gọi `routeMcps(envelope, intent)` trong dh TypeScript logic. Function này trả về MCP priority list và blocked list dựa trên task type.

## Code understanding route

Khi query là code understanding trong repo hiện tại:

Ưu tiên:

1. `augment_context_engine`
2. intelligence layer nội bộ của `dh`
3. structural retrieval nội bộ
4. built-in grep/glob/read chỉ là fallback

### Ý nghĩa

`augment_context_engine` là lớp semantic code search bổ trợ cho symbol/graph retrieval nội bộ, không phải công cụ đứng ngoài pipeline.

## Library and framework route

Khi task liên quan API/library/framework:

Ưu tiên:

1. `context7`
2. `grep_app`
3. `websearch`

### Ý nghĩa

- `context7` cho docs chính thức và snippets
- `grep_app` cho production examples
- `websearch` cho release notes, issue patterns, migration articles

## Browser route

Khi task liên quan browser runtime, UI verification, interaction hoặc performance:

Ưu tiên:

1. `chrome-devtools`
2. `playwright`

### Rule phân chia

- `chrome-devtools` cho inspect, network, console, perf, DOM state
- `playwright` cho scripted flow, form actions, upload, multi-step interactions

## Research route

Khi task là deep research hoặc migration research:

Ưu tiên:

1. `context7`
2. `websearch`
3. `grep_app`

## Tool And MCP Enforcement — Via Forked Runtime Hooks

Trong `dh`, enforcement không chỉ áp dụng cho retrieval tools nội bộ mà còn áp dụng cho skill và MCP selection. Target state là mọi thứ đi qua hooks trong forked Go core; current implementation đã có workflow/TS-side policy và audit trước.

### Enforcement chain

```text
1. Skill activation hook -> validates active skills match policy
2. MCP routing hook -> validates MCP priority/blocking match task type
3. Pre-tool-exec hook -> validates tool is required/allowed for intent
4. Pre-answer hook -> validates evidence from tool usage is sufficient
```

### Điều này có nghĩa

1. Nếu task cần codebase exploration mà không attach `codebase-exploration`, planner chưa hoàn tất.
2. Nếu task là framework/library work mà không route qua `context7` khi phù hợp, planner chưa hoàn tất.
3. Nếu task là debugging mà không attach `systematic-debugging`, execution chưa được phép bắt đầu.
4. Nếu task chuẩn bị hoàn tất mà không attach `verification-before-completion`, workflow chưa được đóng.

## Session Bootstrap Policy

Khi một session mới bắt đầu, `dh` nên bootstrap tối thiểu:

1. load `using-skills`
2. load lane config
3. load semantic mode config
4. xác nhận MCP registry khả dụng
5. xác nhận repo target và workspace context

## Suggested Runtime Bootstrap Shape

```ts
type SessionBootstrap = {
  lane: "quick" | "delivery" | "migration";
  alwaysOnSkills: ["using-skills"];
  defaultMcps: [
    "augment_context_engine",
    "chrome-devtools",
    "context7",
    "grep_app",
    "websearch",
    "playwright"
  ];
  semanticMode: "always" | "auto" | "off";
};
```

## Planner Integration

Planner của `dh` không chỉ tạo retrieval plan. Nó phải tạo một `execution envelope` gồm:

1. lane
2. role
3. active skills
4. active MCP routes
5. required tools
6. evidence policy

### Gợi ý shape

```ts
type ExecutionEnvelope = {
  lane: "quick" | "delivery" | "migration";
  role: "coordinator" | "analyst" | "architect" | "implementer" | "reviewer" | "tester";
  activeSkills: string[];
  activeMcps: string[];
  requiredTools: string[];
  semanticMode: "always" | "auto" | "off";
  evidencePolicy: "strict";
};
```

## Minimal Default Mapping

Nếu cần một mapping ngắn gọn để implement trước, `dh` nên dùng mặc định như sau:

### Mọi lane

- always-on skill: `using-skills`
- always-available MCPs:
  - `augment_context_engine`
  - `context7`
  - `grep_app`
  - `websearch`
  - `chrome-devtools`
  - `playwright`

### Mọi task code understanding

- skill: `codebase-exploration`
- MCP ưu tiên: `augment_context_engine`

### Mọi task debugging

- skill: `systematic-debugging`
- MCP route: `augment_context_engine` + `chrome-devtools` nếu có browser behavior

### Mọi task hoàn tất workflow

- skill: `verification-before-completion`

### Mọi task framework/library specific

- MCP ưu tiên: `context7`
- MCP bổ sung: `grep_app`, `websearch`

## Kết luận

Để `dh` kết hợp nhuần nhuyễn giữa skills và MCP, chúng được enforce qua 2 hooks trong forked Go core (skill activation hook và MCP routing hook). Nếu chỉ liệt kê skill và MCP trong docs mà không có hook enforcement ở runtime level, chúng sẽ nhanh chóng bị bỏ quên và hệ thống sẽ quay về kiểu làm việc cảm tính bằng default tools.
