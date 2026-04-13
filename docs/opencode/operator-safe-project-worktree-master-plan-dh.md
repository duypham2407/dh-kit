# Master Plan: Chương trình operator-safe project/worktree cho DH

**Ngày:** 2026-04-13  
**Phạm vi:** định hướng chương trình cấp kiến trúc cho khu vực project/worktree theo hướng operator-safe trong DH  
**Tính chất:** tài liệu master reference thống nhất, không phải checklist triển khai hẹp và không phải đề xuất parity đầy đủ với nền tảng VCS/worktree upstream

---

## 1) Mục tiêu chương trình

Mục tiêu của chương trình này là đưa DH từ trạng thái đã có một số lát cắt an toàn rời rạc sang một **năng lực vận hành project/worktree có guardrail, có tính giải thích, có giới hạn thực thi, và có khả năng phục hồi đủ dùng cho operator**, nhưng vẫn giữ ranh giới rõ ràng:

- DH phải an toàn hơn khi xác định, chuẩn bị, thao tác, và báo cáo trên các project/workspace/worktree-boundary.
- DH phải có một **execution envelope** nhất quán cho các thao tác nhạy cảm, thay vì mỗi callsite tự ghép path checks, diagnostics, và fallback riêng.
- DH phải ưu tiên **bounded safety** hơn là feature breadth: làm đúng và giải thích được trước, không chạy theo đủ mọi lifecycle như một nền tảng VCS/worktree chuyên dụng.
- DH phải tạo được nền để operator có thể:
  - preflight trước thao tác,
  - chụp snapshot trạng thái nhỏ gọn,
  - chạy trên temporary workspace khi cần,
  - apply có giới hạn,
  - rollback-light khi thao tác thất bại ở mức bounded,
  - nhận execution report đủ rõ để điều tra và audit.

Nói ngắn gọn: nếu DH trưởng thành nghiêm túc ở khu vực này, đích đến không phải là “git worktree platform hoàn chỉnh”, mà là **operator-safe workspace operation layer** đủ mạnh cho nhu cầu thực tế của DH.

---

## 2) Current state / assets already completed

DH không bắt đầu từ số 0. Một số nền tảng quan trọng đã hoàn tất và phải được xem là tài sản chương trình, không phải việc phải làm lại:

### 2.1 Scan và boundary foundation đã có

- **Project/workspace scan hardening** đã hoàn tất.
- Canonical path handling, guardrails scan, diagnostics, partial-scan awareness đã có.
- DH đã có nền để xác định boundary workspace an toàn hơn và minh bạch hơn so với trước.

### 2.2 Marker-driven segmentation đã có

- **Marker-driven multi-workspace segmentation** đã hoàn tất.
- DH không còn bị khóa hoàn toàn ở mô hình single-root mù; workspace boundaries đã có thể được phân đoạn dựa trên marker thực tế.
- Downstream consumers quan trọng đã bắt đầu hiểu `workspaceRoot` và coverage theo workspace.

### 2.3 Operator-safe utility preflight slice đã có

- **Operator-safe utility preflight slice** đã hoàn tất.
- Đã có contract bounded cho `check` / `dry_run` / `execute` ở mức hẹp.
- Đã có result envelope kiểu `allowed / warnings / blockingReasons / recommendedAction`.
- Đã có reason-code và preflight checks tối thiểu cho path, boundary, marker/VCS capability, idempotency guard.

### 2.4 Tài sản module hiện tại có thể tái sử dụng

Các surface hiện có là điểm tựa cho chương trình tiếp theo:

- `packages/intelligence/src/workspace/detect-projects.ts`
- `packages/intelligence/src/workspace/scan-paths.ts`
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
- `packages/shared/src/types/operator-worktree.ts`
- `packages/runtime/src/jobs/index-job-runner.ts`
- `packages/runtime/src/diagnostics/debug-dump.ts`

Kết luận current state: DH đã làm xong phần **discover / segment / preflight** ở mức nền. Phần còn thiếu là biến những mảnh đó thành **một chương trình vận hành hoàn chỉnh hơn cho operator-safe project/worktree**.

---

## 3) Problem statement và vì sao các follow-on rời rạc là không đủ

Hiện DH đã có các lát cắt đúng hướng, nhưng chúng vẫn thiên về “guardrails cục bộ” hơn là một mô hình vận hành end-to-end.

Nếu tiếp tục đi theo nhiều follow-on nhỏ và rời rạc, DH sẽ gặp các vấn đề sau:

1. **Thiếu execution model thống nhất**  
   Preflight có thể đúng, nhưng sau preflight thì thao tác nào được phép chạy, chạy ở đâu, áp bounded change thế nào, và báo cáo ra sao vẫn chưa có một khung chung.

2. **Thiếu recovery story tối thiểu**  
   Một utility chỉ biết `allowed` hay `blocked` là chưa đủ khi bắt đầu có các thao tác có side effect nhẹ. Operator cần ít nhất snapshot nhỏ gọn, undo surface hạn chế, hoặc rollback-light ở mức an toàn.

3. **Thiếu audit/reporting cấp thao tác**  
   Diagnostics hiện thiên về runtime/index/debug. Khi DH bắt đầu mature khu vực project/worktree, cần một execution report hướng thao tác: đầu vào gì, preflight gì, snapshot gì, apply gì, cảnh báo gì, operator cần làm gì tiếp.

4. **Dễ tái sinh logic phân tán ở callsite**  
   Nếu không có chương trình thống nhất, các nhóm tính năng về sau sẽ tự thêm helper riêng cho temp area, patch apply, cleanup, report. Kết quả là drift contract và behavior không nhất quán.

5. **Dễ trượt sang hai cực xấu**  
   - Hoặc DH quá mỏng: chỉ dừng ở check/advisory, không giải quyết thao tác thực tế.
   - Hoặc DH quá rộng: trượt sang làm clone của full VCS/worktree platform.

Vì vậy, DH cần một **master plan cấp chương trình** để chốt một đích đến vừa đủ: không manh mún, nhưng cũng không bành trướng.

---

## 4) Architectural target state

Target state đề xuất cho DH là một **Operator-safe Project/Workspace Operation Layer** gồm 5 lớp rõ ràng.

### 4.1 Lớp 1 — Discovery & boundary truth

Đây là lớp đã có nền tốt nhất và phải tiếp tục là nguồn sự thật cho:

- canonical path,
- workspace boundary,
- marker-driven segmentation,
- workspace coverage và partial-scan state.

Nguyên tắc: không tạo một nguồn sự thật thứ hai cho project/workspace identity ở runtime layer nếu intelligence layer đã xác định được.

### 4.2 Lớp 2 — Safety contract & intent normalization

Mọi thao tác project/worktree nhạy cảm đi qua một contract thống nhất:

- operation intent là gì,
- mode là gì (`check`, `dry_run`, `execute` hoặc mode tương đương trong tương lai),
- điều kiện block/warn là gì,
- context thao tác là workspace nào,
- operator action tiếp theo nên là gì.

Lớp này là nơi biến “logic kiểm tra” thành “quyết định vận hành có giải thích được”.

### 4.3 Lớp 3 — Bounded execution envelope

Đây là lớp DH còn thiếu nhiều nhất. Nó không phải full orchestration platform, mà là lớp quản lý thao tác bounded:

- snapshot tối thiểu trước khi apply,
- chuẩn bị temporary workspace hoặc staging area khi cần,
- bounded apply chỉ trên surfaces cho phép,
- cleanup sau thao tác,
- capture metadata phục vụ rollback-light và reporting.

### 4.4 Lớp 4 — Recovery & execution reporting

Sau khi có bounded execution, DH cần:

- rollback-light có giới hạn,
- execution report chuẩn,
- maintenance utilities để dọn temp areas, prune stale artifacts, và điều tra failure gần nhất.

Lớp này giúp DH không chỉ “chặn trước thao tác” mà còn “đóng vòng đời thao tác” theo cách vận hành được.

### 4.5 Lớp 5 — Optional worktree wrapper

Nếu sau này có nhu cầu, DH có thể thêm một **worktree wrapper tùy chọn** để tận dụng git worktree như một cơ chế isolation, nhưng wrapper này phải:

- là optional surface,
- bị ràng buộc bởi preflight và boundary rules của DH,
- không kéo DH thành full git lifecycle platform,
- không trở thành dependency bắt buộc cho luồng chuẩn.

### 4.6 Hình thái đích của toàn hệ

Khi chương trình hoàn tất, một thao tác operator-safe lý tưởng trong DH sẽ đi theo luồng:

1. resolve target và workspace boundary,
2. preflight + policy decision,
3. snapshot nhỏ gọn nếu thao tác có side effect,
4. chuẩn bị temp workspace nếu cần,
5. bounded apply trên phạm vi được phép,
6. capture execution report,
7. rollback-light hoặc cleanup nếu fail,
8. expose maintenance/debug surfaces để operator điều tra.

---

## 5) Design principles / boundaries

### 5.1 Design principles

1. **Preflight-first, execution-second**  
   Không cho phép execution logic đi trước boundary truth và safety decision.

2. **Explainability by default**  
   Mọi block/warn/apply quan trọng phải có reason code và operator-facing summary.

3. **Bounded side effects**  
   DH chỉ được thao tác trên các surfaces đã được contract cho phép; ưu tiên deny-by-default với action chưa được mô tả rõ.

4. **Reuse existing workspace truth**  
   Segmentation, canonical path, workspaceRoot, partial scan phải được tái sử dụng, không tái dựng theo cách khác ở runtime.

5. **Recovery is lightweight, not magical**  
   Rollback-light chỉ hỗ trợ trong những trường hợp bounded và có snapshot metadata phù hợp; không hứa hẹn transaction toàn hệ.

6. **Operator-safe, không phải VCS-feature-rich**  
   Giá trị của DH nằm ở guardrail, diagnostics, bounded apply, maintenance; không nằm ở việc cạnh tranh với git CLI hay nền tảng worktree đầy đủ.

7. **Optional isolation, không ép buộc isolation**  
   Temp workspace hoặc optional worktree wrapper chỉ dùng khi giá trị an toàn đủ lớn; luồng mặc định không nên phụ thuộc vào chúng nếu không cần.

### 5.2 Boundaries cứng

- DH **không** nên trở thành full VCS/worktree platform parity clone.
- DH **không** nên quản lý branch lifecycle diện rộng.
- DH **không** nên xây sandbox/worktree orchestration sâu kiểu general-purpose platform.
- DH **không** nên tạo thêm một project model song song với nền detect/segment hiện có.
- DH **không** nên hứa rollback hoàn hảo cho mọi loại thao tác filesystem/VCS.

---

## 6) Capability map

Dưới đây là capability map thống nhất cho chương trình. Đây không phải backlog vi mô, mà là bản đồ năng lực mà DH cần hình thành theo một kiến trúc coherent.

| Capability | Mục tiêu | Trạng thái hiện tại | Mức trưởng thành mục tiêu | Ghi chú kiến trúc |
|---|---|---|---|---|
| **Preflight** | Xác nhận boundary, capability, mode semantics, reason codes | Đã có slice nền | Harden và chuẩn hóa thành gateway bắt buộc cho operation nhạy cảm | Không chỉ advisory; phải là entrypoint chuẩn cho mọi bounded operation mới |
| **Snapshot** | Chụp trạng thái tối thiểu trước thao tác có side effect | Chưa có như capability riêng | Tạo snapshot metadata nhỏ gọn, ưu tiên file-set / manifest / patch-style footprint | Không làm full backup system |
| **Temp workspace** | Tạo vùng thao tác tạm hoặc staging area an toàn | Chưa có chương trình hóa | Có temp area lifecycle bounded, cleanup rõ, TTL/stale handling | Không bắt buộc phải là git worktree |
| **Bounded apply** | Áp thay đổi trong phạm vi được phép, có policy rõ | Chưa có envelope riêng | Có apply policy theo surface, conflict rules, dry-run/apply parity | Tránh callsite tự apply patch/file ops tùy hứng |
| **Rollback-light** | Hoàn tác bounded khi thao tác fail hoặc operator muốn revert bước gần nhất | Chưa có | Rollback trong phạm vi snapshot/apply metadata hỗ trợ được | Không hứa “undo mọi thứ” |
| **Execution report** | Báo cáo thống nhất về preflight, apply, warning, outcome, cleanup | Diagnostics rời rạc đã có | Có operation report chuẩn cho debug/audit/operator action | Khác với debug dump tổng quát |
| **Maintenance utilities** | Dọn temp areas, liệt kê stale snapshots, inspect execution history gần | Chưa có bundle riêng | Có utility set nhỏ gọn cho vận hành định kỳ | Quan trọng khi side effects tăng lên |
| **Optional worktree wrapper** | Dùng git worktree như cơ chế isolation khi thật sự cần | Chưa có | Optional adapter có guardrail, không parity clone | Là capability phụ trợ, không phải lõi |

### 6.1 Ý nghĩa capability map

Capability map này cho thấy chương trình phải đi từ một utility preflight đã có sang một **operation lifecycle có đầu-cuối**. Nếu thiếu snapshot, bounded apply, execution report, maintenance utilities và rollback-light, thì DH vẫn chỉ dừng ở mức “check trước khi làm”, chưa đạt mức “operator-safe program” thực sự.

---

## 7) Recommended ownership by package/module

Để tránh drift trách nhiệm, chương trình nên được chia ownership theo module rõ ràng.

### 7.1 `packages/intelligence`

**Vai trò:** nguồn sự thật về discovery, segmentation, boundary, canonical path.

#### Ownership khuyến nghị
- Giữ ownership cho:
  - workspace discovery,
  - marker-driven segmentation,
  - canonical path / workspace-relative path helpers,
  - workspace coverage metadata.

#### Không nên ôm
- snapshot lifecycle,
- apply orchestration,
- rollback execution,
- maintenance operations.

### 7.2 `packages/shared`

**Vai trò:** contract và type system dùng chung cho operator-safe operation layer.

#### Ownership khuyến nghị
- `operator-worktree.ts` tiếp tục là seed cho operation contracts.
- Mở rộng sang các nhóm type như:
  - snapshot manifest/result,
  - bounded apply request/result,
  - rollback-light result,
  - execution report schema,
  - maintenance action summary.

Nguyên tắc: shared types phải phản ánh contract ổn định, không chứa runtime logic.

### 7.3 `packages/runtime/src/workspace`

**Vai trò:** trung tâm của operator-safe execution layer.

#### Ownership khuyến nghị

Từ module hiện có `operator-safe-project-worktree-utils.ts`, nên tiến tới nhóm module có cấu trúc rõ hơn:

- `operator-safe-project-worktree-utils.ts`
  - giữ vai trò intent normalization và preflight gateway.
- `operator-safe-project-worktree-snapshot.ts`
  - snapshot manifest và capture metadata trước apply.
- `operator-safe-temp-workspace.ts`
  - temp area provisioning, lifecycle, cleanup, stale detection.
- `operator-safe-bounded-apply.ts`
  - dry-run/apply logic trên phạm vi đã allow.
- `operator-safe-rollback-light.ts`
  - rollback theo snapshot/apply metadata ở mức bounded.
- `operator-safe-execution-report.ts`
  - chuẩn hóa outcome reporting cho operator.
- `operator-safe-maintenance-utils.ts`
  - utilities phục vụ cleanup, inspect, prune.
- `optional-worktree-wrapper.ts`
  - adapter tùy chọn cho git worktree nếu cần trong tương lai.

Không nhất thiết phải tạo đủ module ngay lập tức, nhưng chương trình nên hướng đến ranh giới module như trên để tránh nhồi tất cả vào một utility file.

### 7.4 `packages/runtime/src/diagnostics`

**Vai trò:** hiển thị và truy xuất thông tin vận hành.

#### Ownership khuyến nghị
- Consume execution reports và summary trạng thái operator-safe.
- Không là nơi phát sinh business logic apply/rollback.
- `debug-dump.ts` nên chỉ phản ánh summary và pointer tới execution report, không trở thành data lake thao tác.

### 7.5 `packages/runtime/src/jobs`

**Vai trò:** callsite integration.

#### Ownership khuyến nghị
- Chỉ nên gọi vào operator-safe gateway và consume result.
- Không tự dựng preflight/apply/rollback phụ ở từng job runner.

---

## 8) Phased roadmap của một chương trình coherent

Roadmap dưới đây vẫn có phase, nhưng là các phase của **một chương trình thống nhất**, không phải nhiều task rời rạc không ăn khớp.

### Phase A — Consolidate operator-safe foundation

**Mục tiêu:** nâng preflight slice hiện có thành nền tảng hợp đồng thống nhất cho mọi future operation.

#### Kết quả cần đạt
- Freeze vocabulary cấp chương trình cho operation intent, risk class, result envelope, reason codes, warning codes.
- Chuẩn hóa cách nối từ workspace truth -> operation context.
- Tách rõ advisory-only checks và execution-gating checks.
- Chốt rõ loại operation nào DH hỗ trợ trong operator-safe layer và loại nào không hỗ trợ.

#### Tại sao phase này cần trước
Nếu không freeze contract từ đầu, các phase snapshot/apply/report về sau sẽ drift ngay từ mô hình dữ liệu và semantics mode.

### Phase B — Introduce bounded execution envelope

**Mục tiêu:** thêm lõi thực thi bounded, đủ để DH làm thao tác có side effect nhẹ một cách an toàn hơn.

#### Kết quả cần đạt
- Snapshot capability tối thiểu trước apply.
- Temp workspace hoặc staging area abstraction có lifecycle rõ.
- Bounded apply policy với parity giữa `dry_run` và `execute` trong cùng một contract.
- Result metadata đủ để debug và rollback-light.

#### Đây là phase trung tâm của chương trình
Nếu Phase B không làm tốt, toàn chương trình sẽ vẫn chỉ là “preflight system”, chưa phải operation layer.

### Phase C — Add rollback-light và execution reporting

**Mục tiêu:** đóng vòng đời thao tác sau khi side effect bắt đầu xuất hiện.

#### Kết quả cần đạt
- Rollback-light cho các bounded apply có snapshot tương thích.
- Execution report schema thống nhất, consumable bởi diagnostics và operator surfaces.
- Chuẩn hóa failure classes: preflight failure, prepare failure, apply failure, cleanup failure, rollback-degraded.

#### Giá trị chương trình
Phase này tạo khác biệt giữa “tool có check” và “system vận hành được”.

### Phase D — Maintenance utilities và hygiene

**Mục tiêu:** tránh rác vận hành và giảm độ mong manh theo thời gian.

#### Kết quả cần đạt
- List / inspect / prune temp workspaces.
- Inspect snapshot metadata gần nhất.
- Dọn stale execution artifacts theo policy rõ.
- Hướng dẫn operator xử lý trạng thái dang dở sau failure.

#### Vì sao không nên bỏ qua
Không có maintenance layer, temp/snapshot/report artifacts sẽ nhanh chóng trở thành nguồn nợ vận hành.

### Phase E — Optional worktree wrapper (chỉ khi justified)

**Mục tiêu:** tận dụng git worktree như adapter isolation cho một số flow cụ thể, nhưng không đổi bản chất chương trình.

#### Kết quả cần đạt
- Wrapper chỉ được bật khi repo/context đủ điều kiện.
- Wrapper dùng lại preflight, snapshot, reporting chung.
- Không thêm branch/worktree lifecycle platform rộng.

#### Điều kiện mới nên làm
- Chỉ sau khi Phase A-D đã ổn định.
- Chỉ khi temp workspace thường là chưa đủ cho một số use case có giá trị rõ ràng.

---

## 9) Dependencies và sequencing

### 9.1 Chuỗi phụ thuộc logic

1. **Discovery / segmentation truth** phải ổn định trước.  
2. **Safety contract** phải được freeze trước khi thêm execution envelope.  
3. **Snapshot + bounded apply** phải tồn tại trước khi rollback-light có ý nghĩa.  
4. **Execution report schema** phải ổn định trước khi đẩy mạnh diagnostics/maintenance.  
5. **Maintenance utilities** nên xây trên artifacts thật, không nên thiết kế trước quá xa thực tế.  
6. **Optional worktree wrapper** chỉ nên đến sau khi core lifecycle nội bộ đã chín.

### 9.2 Sequencing khuyến nghị

- Không nên nhảy thẳng vào worktree wrapper trước khi có snapshot/apply/report chung.
- Không nên làm rollback-light trước khi biết apply ghi lại metadata gì.
- Không nên mở rộng operation catalog trước khi risk classification và bounded apply rules được freeze.
- Không nên để jobs/commands tự bypass operator-safe gateway.

### 9.3 Dependency lên current assets

Chương trình phải reuse trực tiếp các tài sản đã hoàn tất:

- scan hardening làm discovery foundation,
- multi-workspace segmentation làm boundary truth,
- utility preflight slice làm safety gateway seed.

---

## 10) Risks / tradeoffs

### 10.1 Rủi ro lớn nhất: scope creep thành VCS/worktree platform

Đây là rủi ro số một. Khi bắt đầu nói đến temp workspace, rollback, worktree wrapper, DH rất dễ trượt sang quản lý branch, reset, cleanup sâu, conflict resolution rộng.

**Mitigation:** mọi phase phải đo bằng tiêu chí operator-safe bounded operations, không đo bằng số lượng lifecycle VCS hỗ trợ.

### 10.2 Rủi ro quá mỏng: chỉ có preflight mà không có execution story

Ngược lại, nếu quá sợ scope creep, DH có thể dừng mãi ở advisory checks.

**Mitigation:** Phase B phải được xem là lõi bắt buộc của chương trình, không phải phụ lục.

### 10.3 Rủi ro contract drift giữa types, runtime và diagnostics

Khi thêm snapshot, apply, rollback, report, nếu mỗi lớp dùng naming và semantics khác nhau thì operator-safe layer sẽ khó dùng.

**Mitigation:** package shared phải sở hữu schema trung tâm; diagnostics chỉ consume, không phát minh contract riêng.

### 10.4 Rủi ro maintenance debt

Temp areas, snapshots, report artifacts nếu không có cleanup policy sẽ làm xấu môi trường theo thời gian.

**Mitigation:** maintenance utilities không phải nice-to-have; phải là phase chính thức của chương trình.

### 10.5 Tradeoff giữa safety và ergonomics

Guardrail quá chặt có thể làm operator khó làm việc; guardrail quá lỏng thì mất ý nghĩa an toàn.

**Mitigation:** dùng risk-tiering và mode semantics rõ; ưu tiên explainability để operator biết vì sao bị chặn và làm gì tiếp theo.

### 10.6 Tradeoff giữa temp workspace nội bộ và optional git worktree

Temp workspace nội bộ đơn giản hơn nhưng có thể kém mạnh ở một số trường hợp isolation. Git worktree mạnh hơn nhưng kéo theo phức tạp VCS lớn hơn.

**Mitigation:** temp workspace nội bộ là mặc định; worktree wrapper chỉ là option về sau nếu thật sự justified.

---

## 11) Definition of Done cho toàn bộ chương trình

Chương trình được xem là hoàn tất khi DH đạt được toàn bộ các điều kiện sau ở mức hệ thống:

1. **Một operation model thống nhất** đã tồn tại cho project/worktree-safe actions, từ preflight tới report.  
2. **Workspace/boundary truth** được tái sử dụng nhất quán từ scan hardening và segmentation, không có nguồn sự thật song song.  
3. **Snapshot capability** đủ dùng đã tồn tại cho các thao tác bounded có side effect.  
4. **Temp workspace hoặc staging abstraction** đã có lifecycle rõ và cleanup path rõ.  
5. **Bounded apply** có policy rõ về surfaces được phép, dry-run parity, và failure handling.  
6. **Rollback-light** tồn tại cho các trường hợp được support và tuyên bố rõ giới hạn support.  
7. **Execution report** chuẩn hóa được preflight/apply/outcome/warnings/cleanup/recommended next action.  
8. **Maintenance utilities** có thể liệt kê, inspect, và dọn artifacts của operator-safe layer.  
9. **Optional worktree wrapper**, nếu có, chỉ là adapter mỏng dùng lại lifecycle chung; nếu chưa có, chương trình vẫn hoàn tất mà không bị coi là thiếu.  
10. **Documentation và vận hành** phản ánh đúng rằng DH là operator-safe layer bounded, không phải full VCS/worktree platform.

Điều kiện quan trọng nhất: operator phải có thể hiểu một thao tác đã được kiểm tra như thế nào, áp gì, để lại artifact gì, và có thể phục hồi/dọn dẹp trong phạm vi nào.

---

## 12) Những gì explicit out of scope

Để khóa scope cho đúng bản chất DH, các hạng mục sau explicit out of scope của chương trình này:

- Full parity với upstream `project / vcs / worktree` subsystem.
- Branch management platform.
- Full git porcelain replacement trong DH.
- Multi-branch orchestration, merge/rebase/reset phức tạp.
- General-purpose sandbox orchestration platform.
- Transactional rollback cho mọi loại thay đổi filesystem/VCS.
- UI/workbench lớn cho project/worktree management.
- Bất kỳ hướng nào biến DH thành một sản phẩm quản trị repo/worktree độc lập thay vì một runtime/operator-safe layer.

---

## 13) Recommended first implementation wave bên trong chương trình lớn này

Wave đầu tiên nên là **Phase A + phần lõi của Phase B**, tức là:

### 13.1 Tên wave khuyến nghị

**Operator-safe Execution Envelope Foundation**

### 13.2 Mục tiêu của wave đầu

Không mở thêm quá nhiều capability một lúc, nhưng phải vượt qua mức “preflight-only”. Wave đầu nên tập trung vào:

1. **Hợp nhất contract chương trình**  
   Nâng contract hiện tại trong `operator-worktree.ts` từ utility slice thành vocabulary dùng cho execution envelope.

2. **Thêm snapshot manifest tối thiểu**  
   Chỉ cần đủ để ghi lại context và surfaces chuẩn bị bị tác động; chưa cần backup/full clone.

3. **Thêm temp workspace abstraction nội bộ**  
   Ưu tiên temp area/staging area đơn giản, có cleanup policy rõ, chưa cần git worktree.

4. **Thêm bounded apply skeleton**  
   Bắt đầu bằng các apply case hẹp và policy-driven, dùng lại preflight gateway hiện có.

5. **Thêm execution report schema**  
   Mỗi thao tác bounded phải trả về report chuẩn, không chỉ diagnostics rời rạc.

### 13.3 Vì sao wave này là điểm vào đúng

- Nó tạo bước nhảy kiến trúc thật sự từ “check utility” sang “operation envelope”.
- Nó vẫn tôn trọng ranh giới không-parity-clone.
- Nó tạo dữ liệu thật để phase rollback-light và maintenance utilities bám vào.
- Nó giữ chi phí thay đổi thấp hơn nhiều so với nhảy thẳng vào optional worktree wrapper.

### 13.4 Surface/module ưu tiên cho wave đầu

- `packages/shared/src/types/operator-worktree.ts` hoặc nhóm type liên quan kế tiếp
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
- module mới cho snapshot / temp workspace / bounded apply / execution report trong `packages/runtime/src/workspace/`
- tích hợp hẹp vào `packages/runtime/src/jobs/` và `packages/runtime/src/diagnostics/`

### 13.5 Kết quả mong đợi của wave đầu

Sau wave đầu, DH phải đạt được trạng thái:

- operator-safe flow không còn dừng ở preflight,
- đã có chuẩn bị trước apply,
- đã có bounded execution metadata,
- đã có execution report,
- vẫn chưa phải và không cần trở thành full worktree/VCS platform.

---

## 14) Kết luận định hướng

Chương trình đúng cho DH không phải là chia operator-safe project/worktree thành vô số follow-on nhỏ thiếu trục kiến trúc, cũng không phải lao sang clone cả subsystem project/vcs/worktree upstream.

Đích đến đúng là:

- giữ nền discovery/segmentation đã làm,
- nâng preflight thành safety gateway chuẩn,
- xây bounded execution envelope,
- thêm snapshot, temp workspace, bounded apply, rollback-light, execution report, maintenance utilities,
- và chỉ cân nhắc optional worktree wrapper ở cuối, như một adapter, không phải lõi hệ thống.

Nếu DH đi theo chương trình này, khu vực operator-safe project/worktree sẽ trưởng thành theo một đường coherent, thực dụng, và đúng bản chất sản phẩm: **an toàn cho operator, có thể giải thích, có thể vận hành, nhưng không biến thành một nền tảng VCS/worktree parity clone**.
