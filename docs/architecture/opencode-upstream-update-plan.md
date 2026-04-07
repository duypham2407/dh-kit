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

Muc tieu:

- chot ro phan nao da la upstream baseline
- chot ro phan nao la patch DH
- giam nham lan giua code import va code tu viet

Cong viec:

- kiem ke cac khu vuc fork trong `packages/opencode-core/`
- cap nhat `FORK_ORIGIN.md` va `PATCHES.md` neu thieu provenance cua TUI/LSP import
- danh dau cac khu vuc van con la DH-specific adaptation

Acceptance:

- co tai lieu ro de tra loi: file nao la upstream-derived, file nao la DH patch
- patch delta hien tai co the giai thich duoc

### Phase 2: Upstream Runtime Parity

Muc tieu:

- tiep tuc dua cac phan runtime con lai ve gan upstream hon neu hien van la stub, adaptation manh, hoac chua dong bo

Pham vi uu tien:

- TUI
- LSP
- session/message/runtime paths lien quan den upstream UX
- command wiring va behavior khac biet lon voi upstream

Cong viec:

- ra soat cac module runtime con su khac biet lon so voi upstream
- quyet dinh module nao can import them, module nao giu nguyen adaptation hien tai
- chi sua nhung cho can de baseline van build/test xanh trong repo DH

Acceptance:

- khong con stub quan trong o cac runtime surface chinh
- baseline runtime co the duoc mo ta la "upstream-derived and operational"

### Phase 3: DH Integration Layer Hardening

Muc tieu:

- giu cac hook va integration cua DH o dang mong, ro, va tach biet khoi baseline upstream nhat co the

Pham vi:

- 6 hook points cua DH
- TS bridge va SQLite decision path
- config/provider defaults
- workflow state injection

Cong viec:

- giam patch footprint trong core path neu co the dua vao adapter/hook layer
- bo sung test cho cac path startup, provider resolution, hook wiring, session state
- ghi ro patch contracts de de update upstream ve sau

Acceptance:

- cac patch DH trong runtime deu co diem vao ro rang
- hook wiring co test hoac smoke evidence

### Phase 4: DH Product Surface Update

Muc tieu:

- sau khi baseline upstream on dinh, moi cap nhat product behavior cua `dh` theo yeu cau thuc te

Nhom thay doi du kien:

- branding va naming (`dh` vs OpenCode surface)
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

Thu tu uu tien de thi cong tiep:

1. tai lieu hoa chien luoc `upstream-first` de cac docs hien tai khong mau thuan nhau
2. khoa provenance cho TUI/LSP import vua xong
3. ra soat runtime areas con khac upstream dang ke
4. sau do moi vao nhom thay doi DH do ban uu tien

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
