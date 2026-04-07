# DH OpenCode Upstream Update Plan

Last reviewed against code: 2026-04-07

## Status

Active

## Goal

Muc tieu cua giai doan nay la dua `dh` ve mot baseline gan voi upstream OpenCode nhat co the, sau do moi ap dung cac thay doi DH theo chu dich va theo tung phase nho.

Tai lieu nay dong vai tro la execution plan cho huong di do. No khong thay the ADR fork hay cac tai lieu kien truc tong the, ma chot cach thuc cap nhat codebase trong giai doan hien tai:

1. keo baseline upstream ve day du
2. giu baseline do on dinh va build/test xanh
3. ap patch DH theo nhom thay doi ro rang
4. ghi lai provenance, patch delta, va ly do thay doi de lan sau van cap nhat upstream duoc

## Working Direction

Huong thuc thi hien tai la `upstream-first`:

- uu tien import day du source tu upstream OpenCode khi can thiet
- khong mang lai behavior cu cua DH chi vi no da ton tai truoc day
- chi patch tren baseline upstream khi do la yeu cau chu dich cua san pham `dh`
- moi patch DH nen nho, co ly do ro, va de truy vet

Noi ngan gon: `dh` van la fork so huu runtime rieng, nhung cach tien hoa codebase se la `upstream baseline first, DH patches second`.

## Current Snapshot

Tinh den hien tai:

- full upstream TUI da duoc import vao `packages/opencode-core/internal/tui/`
- full upstream LSP da duoc import vao `packages/opencode-core/internal/lsp/`
- cac stub cu da duoc xoa
- loi startup/config `agent coder not found` da duoc sua de fail-fast voi error ro rang hon
- build va test dang xanh

Day la moc hoan thanh cua phase baseline import cho TUI/LSP. Phan con lai la sap xep va ap cac patch DH theo tung nhom.

## Principles

1. Baseline upstream truoc, custom sau.
2. Moi patch DH phai co ly do san pham ro rang.
3. Khong tron lan patch dong bo upstream voi patch san pham DH trong cung mot thay doi lon neu co the tach ra.
4. Uu tien patch o lop behavior va integration, khong fork lai toan bo module neu chi can sua nho.
5. Neu mot behavior khac upstream, phai ghi lai trong `PATCHES.md` hoac tai lieu lien quan.
6. Moi phase phai ket thuc voi build/test xanh hoac ghi ro vi sao chua validate duoc.

## Phase Plan

### Phase 1: Baseline Inventory And Provenance Lock

Status: **Complete** (2026-04-07)

Muc tieu:

- chot ro phan nao da la upstream baseline
- chot ro phan nao la patch DH
- giam nham lan giua code import va code tu viet

Ket qua:

- ~25 packages upstream (module-path rewrite only), ~6 packages upstream+patch, ~6 packages dh-original
- FORK_ORIGIN.md va PATCHES.md da duoc cap nhat day du
- Provenance co the tra loi chinh xac cho moi file

### Phase 2: Upstream Runtime Parity

Status: **Complete** (2026-04-07)

Muc tieu:

- tiep tuc dua cac phan runtime con lai ve gan upstream hon

Ket qua:

- Khong con stub nao trong runtime
- Them bubblezone cho TUI mouse zone tracking (upstream parity)
- Cap nhat golang.org/x/image tu 2019 pre-release len v0.26.0 (upstream parity)
- cmd/schema/ duoc ghi nhan la intentional omission (developer tooling only)
- Baseline runtime co the mo ta la "upstream-derived and operational"

### Phase 3: DH Integration Layer Hardening

Muc tieu:

- giu cac hook va integration cua DH o dang mong, ro, va tach biet khoi baseline upstream nhat co the

Status: **Complete** (2026-04-07)

Ket qua kiem ke patch footprint:

| File | Total lines | DH patch lines | Severity |
|---|---|---|---|
| `app/app.go` | 186 | 1 | Minimal (1 constructor call) |
| `config/config.go` | 1039 | 1 | Minimal (1 error message) |
| `agent/agent.go` | 805 | 5 | Moderate (model override + pre-tool + pre-answer dispatch) |
| `agent/mcp-tools.go` | 274 | 3 | Minimal (MCP routing dispatch + intent) |
| `prompt/prompt.go` | 151 | 2 | Minimal (skill injection) |
| `provider/provider.go` | 258 | 2 | Minimal (model override) |
| `session/session.go` | 211 | 11 | Moderate (session state hook + cleanup) |

Tat ca cac patch deu la 1-line dispatch calls vao `dhhooks.On*()` hoac helper calls. Khong co patch nao heavy.

Test coverage da co day du: bridge integration tests, pre-tool/pre-answer policy tests, session hook injection tests, hook wiring smoke test, run-entry smoke tests.

Khong can refactor them. Patch footprint nho va tach biet tot.

### Phase 4: DH Product Surface Update

Muc tieu:

- sau khi baseline upstream on dinh, moi cap nhat product behavior cua `dh` theo yeu cau thuc te

Status: **In Progress** (2026-04-07)

Nhom thay doi da ap dung (branding/naming rebrand):

- config.go: defaultDataDirectory `.opencode` -> `.dh`, appName `opencode` -> `dh`, default context paths `OpenCode.md/opencode.md` -> `dh.md/DH.md`, env prefix `OPENCODE_*` -> `DH_*`, default theme `opencode` -> `dh`
- db/connect.go: DB filename `opencode.db` -> `dh.db`
- fileutil/fileutil.go: ignore map `.opencode` -> `.dh`
- custom_commands.go: home commands path `.opencode/commands` -> `.dh/commands`, XDG config path `opencode/commands` -> `dh/commands`
- TUI header: logo text `OpenCode` -> `DH`, repo URL updated
- TUI init dialog: memory file reference `OpenCode.md` -> `dh.md`
- TUI init command: memory file creation prompt updated to `dh.md`
- Theme registration: `opencode` -> `dh`, type renamed `OpenCodeTheme` -> `DHTheme`, file renamed `opencode.go` -> `dh.go`
- Theme manager: sort preference `opencode` -> `dh`
- Icons: `OpenCodeIcon` -> `DHIcon`
- LLM prompts (coder.go, task.go): identity `OpenCode` -> `DH`, memory file refs `OpenCode.md/opencode.md` -> `dh.md`, CLI help ref `opencode --help` -> `dh --help`
- Provider headers: OpenRouter `X-Title` `OpenCode` -> `DH` (HTTP-Referer kept as `opencode.ai` per decision)
- Copilot headers: `User-Agent` and `Editor-*` headers `OpenCode/1.0` -> `DH/1.0`
- Copilot error message: config file reference `opencode.json` -> `dh.json`
- MCP client info: `Name: "OpenCode"` -> `Name: "DH"`
- Bash tool: commit footer `opencode`/`noreply@opencode.ai` -> `DH`/`noreply@dh.ai`
- Fetch/Sourcegraph tools: `User-Agent` `opencode/1.0` -> `dh/1.0`
- Shell temp files: prefix `opencode-` -> `dh-`
- Panic log: filename prefix `opencode-panic-` -> `dh-panic-`
- Diff syntax theme: XML style name `opencode-theme` -> `dh-theme`
- Tests: `.opencode` dir refs -> `.dh`

Nhom thay doi con lai:

- lane/workflow UX (`quick`, `delivery`, `migration`)
- command surface (`ask`, `explain`, `trace`, `doctor`, `index`, `run`)
- config UX va onboarding
- release/install/update flows

Cong viec:

- xac dinh tung thay doi la "DH-specific requirement" thay vi phan ung tu lich su code cu
- ap patch nho theo tung nhom
- cap nhat docs user-facing sau moi nhom thay doi lon

Acceptance:

- moi thay doi product co the trich dan tu yeu cau ro rang cua ban
- khong co viec port lai behavior cu chi vi no tung ton tai trong DH

### Phase 5: Upstream Update Discipline

Muc tieu:

- bien viec cap nhat tu upstream thanh quy trinh lap lai duoc

Cong viec:

- xac dinh cach so sanh `packages/opencode-core/` voi upstream commit goc
- chot checklist cho moi lan import/upstream sync
- ghi lai conflict-prone areas va patch-owned areas

Acceptance:

- co checklist ro rang cho dot cap nhat upstream tiep theo
- giam rui ro vo tinh ghi de patch DH khi keo upstream ve

## Immediate Work Queue

Phase 1, 2, 3 da hoan thanh. Thu tu uu tien tiep:

1. Phase 4: ap cac thay doi product surface cua DH theo yeu cau cua ban
2. Phase 5: chuan hoa quy trinh update upstream cho lan sau

## Decision Rule For Future Changes

Khi phat sinh mot thay doi moi, luon hoi theo thu tu nay:

1. Day la baseline upstream hay patch DH?
2. Neu la baseline upstream, co the import/giu nguyen thay vi viet lai khong?
3. Neu la patch DH, day co phai yeu cau chu dich cua san pham khong?
4. Patch nay nen dat o hook/integration layer hay sua thang vao upstream-derived code?

## Near-Term Deliverables

- tai lieu plan nay
- cap nhat docs hien tai de phan anh huong `upstream-first`
- provenance note cho TUI/LSP import va config startup fix
- backlog phase tiep theo duoc thuc thi theo uu tien cua ban
