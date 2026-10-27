# Supabase source of truth

## Operation reporting automation (2026-10-27)

See [operation reporting architecture](mes-operation-report-architecture.md) for first-operation
start control, SY06 preceding-operation backfill, SY05 finished receipts, immutable report
provenance, deferred warehouse/bin selection and the rollback regression. Database rules are
deployed; this does not publish the frontend.

## MES packing and finished receipt modes (2026-10-26)

New MES package numbers use `<work-order-no>-PK-<four-digit-minimum-sequence>` for manual,
automatic and split packing. Existing numbers and package IDs are retained. The tenant/package
unique constraint remains authoritative. A package's work order and tenant cannot change.

Finished receipts support two mutually exclusive modes, stored as `mes_work_order.finished_inbound_mode`:
`order` records the work order's summarized receipt without package inventory; `pack` binds each
inventory batch to its original package. The first actual receipt fixes the mode for later batches,
including after a return. Projects may remain null when the originating work order has no project.

The secure `wms_finished_pack_options_secure` reader uses the work order's publication state,
so historically published packages do not depend on an unused per-package confirmation flag.
It excludes received packages and packages reserved by another active receipt document, while
allowing a draft to reload its own references. Closed or void unposted receipts release their package
reservation. It repeats the ordinary/platform-all/platform-selected
tenant contract and checks the business view/select permissions.

The advisor's authenticated `SECURITY DEFINER` notice for this reader is intentional: anonymous
execution is revoked, private metric helpers are not executable by authenticated clients, and the
four tenant contexts are verified by the regression. Package reservations use the partial
`wms_production_material_line_pack_idx` index.

Package geometry is calculated from each board row's total area divided by its pieces, multiplied
by the pieces in that package. The canonical material conversion helper converts that area into
inventory and production units. Stock retains pieces, area and package identity; a package must
be received, picked, issued or transferred as a whole. Duplicate receipts and mixed receipt modes
are rejected again under database row locks.

`finished_inbound_area_sqm` stores cumulative net finished receipt area independently of
`completed_quantity` (production reporting) and `warehoused_quantity` (net receipt in production
units). Packages retain `inbound_quantity`, `inbound_area_sqm` and their first `inbound_at` timestamp.
Finished returns reverse net quantities/area while preserving receipt history and the fixed mode.
Received package production data and its referenced board specifications stay locked. Repacking
keeps those packages unchanged while allowing the unreceived remainder to be adjusted and
published for later receipt batches. The original packing-rule binding is retained.

Production document pushes enforce their own button permission and tenant before calling the
private stock-posting boundary; an ordinary authorized operator does not need an additional
general stock-operation permission. Direct stock operations retain their separate permission check.

The reviewed database changes were applied directly after verified recoverable backups under
`.artifacts/finished-inbound-backup` and rollback validation. No migration or runbook files were
created. `tests/integration/wms-finished-inbound-modes.sql` verifies summary and package batches,
ordinary/forged-header/platform-selected/platform-all behavior, create/edit, duplicate and partial
package rejection, area accounting, and finished returns without retaining test business data.

Verification on 2026-10-27: the four summary/package receipt browser cases passed at 1440 and
1280 pixels, including picking, quantity conversion, saving and mode locking. The BOM remaining
quantity picker and the packing number/retry/split/print browser regressions also passed. A fresh
server rerun additionally verified the widened package-number column without truncation at 1280
pixels and repeated the package receipt save/lock flow successfully. The
14 focused packing unit tests, main/MES/WMS type checks, WMS build and UI audit passed. The
broader root unit run retained three unrelated failures in public module assets and audit fixture
expectations; the reuse audit retained the existing TMS driver nullable-text finding. These are
not evidence of a fully passing repository release gate. Frontend publication is outside this change.

## System identity and runtime parameters (2026-10-09)

Platform authorization requires the server-managed `sys_user.system_protected` identity,
an enabled `platform_super` role in the platform tenant, an active account and no soft deletion.
The existing platform account was preserved without granting other accounts platform access.
Business writes cannot change its protection marker, Auth identifier, account identity, tenant,
email, super role or active state. The protection trigger covers all updates, including soft deletion.
`sync-user` resolves Auth targets from database rows and rejects protected identity changes before
calling Auth APIs. Account protection no longer depends on a personal email or a literal role code.
Static/demo route codes remain constants in `src/config/builtin-roles.ts`; business authorization
uses server capabilities.

`current_user_role_names()` returns only the authenticated account's real role names in assignment
order, independently of the header tenant so login bootstrap remains available. Anonymous execution
is revoked. Unknown role definitions display their actual codes instead of invented names.
`get_login_default_language()` intentionally allows anonymous reads of only the platform's enabled
`zh`/`en` login language. Saved user language preferences take priority; the website language is
the fallback when the parameter is disabled or unavailable.

The three `audit.*` parameters have no execution entry point. They are disabled, their original values
are retained, and both the editor and database reject enabling them until a consumer is implemented.
No audit history is deleted and no account lockout policy is introduced. Login no longer embeds a
default account or password; browser-managed saved credentials remain supported. Generated temporary
passwords use cryptographic randomness and at least 16 characters while respecting the configured
minimum length and complexity policy.

Field-permission writes record the authenticated operator instead of a preset personal email.
Permission-catalog seeds and tenant-root creation use `system` as their unattended fallback;
the existing audit triggers still record an authenticated operator when one is present. Existing
audit history is retained. All 40 affected function definitions and ACLs were backed up in
`.artifacts/identity-hardcoding-backup/audit-actors-before.json` before the rollback checks and update.

`supabase/tests/system_identity_policy_test.sql` provides rollback-only checks for platform-all,
platform-selected, ordinary-own, forged tenant headers, immutable protection and Auth binding,
role retention, disable/delete guards, real role names, language access and unsupported parameters.
Recoverable pre-change function definitions, trigger definition, platform user/parameter rows and
the deployed Edge Function source are stored locally in the Git-ignored
`.artifacts/identity-hardcoding-backup` directory. No migration or runbook artifacts were created.

中文的远端备份、只读分发、本地恢复与跨项目恢复操作说明见 [README.zh-CN.md](README.zh-CN.md)。

This is the only Supabase directory for project `ckbftoopuyophiebamwy`. Business subrepositories do not keep separate Supabase assets.

- `functions/` contains the reviewed, deployable Edge Function source. Deploy a reviewed change with `supabase functions deploy <name> --project-ref ckbftoopuyophiebamwy --use-api`.
- `migrations/` has no local migration SQL. Reviewed production SQL is applied directly through the project-scoped Supabase MCP after backup and validation.
- Database regression SQL lives in the workspace's `tests/integration/`, not `supabase/tests/`. `pnpm test:db` runs only the read-only `database-security-policy.sql` check. Other files can mutate transaction-local fixtures or depend on setup fragments; follow [the test execution boundaries](../tests/README.md) and never execute the directory as an unreviewed batch against production.
- `pnpm database:security:audit` checks source boundaries and the presence of live regression assertions locally. It does not replace `pnpm test:db` against the linked database.
- `backup-supabase.ps1` exports the remote project into one timestamped, Git-ignored backup directory. `package-supabase-backup.ps1` packages it for verified download, and `restore-local-supabase.ps1` restores it into an isolated local stack. `restore-supabase.ps1` imports it into a new remote project.

Database structure, data, and migration history are kept together inside the backup directory. Export does not create one SQL file per migration in the repository.

## Cron run-history retention (2026-10-21)

Project `ckbftoopuyophiebamwy` runs `cron.job_run_details` cleanup job 16 daily at 02:00 UTC
(10:00 Asia/Shanghai). It deletes only successful runs with `end_time` older than seven days;
failed runs remain available for diagnosis. The initial cleanup removed approximately 260,000
old successful runs, leaving 36,647 rows and all three failed runs at verification. The cleanup
job remained active after verification. Supabase performance advisors were run afterward;
their pre-existing findings are unrelated to this retention job.

Before the first cleanup, 260,244 eligible rows were copied and count-verified in the private
`app_private.cron_job_run_details_backup_20261021` table because the full backup script could not
run without Docker. This temporary recovery copy occupies about 42 MB. Review and remove it after
the desired recovery window; deleting rows does not immediately shrink the physical Cron table,
so check database size before considering an exclusive-lock table rewrite.

## Tenant read-scope boundary

The authenticated platform super's home tenant is the platform tenant. The header scope is a separate read context: an empty selection means all tenants; a concrete selection limits tenant-owned reads to that tenant. Ordinary users always read and write within their authenticated tenant, even if they forge the header. A permissive `canonical_platform_super_write` policy also grants SELECT, so every tenant-owned table with that policy needs a restrictive `canonical_tenant_read_scope` SELECT policy. Keep existing permissive grants for feature permissions and ownership; they combine with the restrictive scope.

The 2026-10-01 live audit found 42 tables whose platform-super `FOR ALL` policy bypassed a concrete selected tenant. After a verified backup and transactional rollback test, all 42 gained the restrictive guard; 28 existing permissive read grants were preserved. The read-only regression query in `tests/database_security_policy_test.sql` now checks this invariant for the full policy catalog. A four-context check on `mdm_project` returned 4 rows for platform-all, 2 for platform-selected, 2 for an authorized ordinary user, and the same 2 after that user supplied a forged cross-tenant header. No selected-scope cross-tenant rows remained.

AI order master-data creation remains available to ordinary users with `TmsOrderOpen:AiFill` and the matching `Add` permission. The `create_ai_order_master_data` RPC resolves their authenticated tenant at the database boundary. The target contract is that platform-all defaults a new root record to the authenticated administrator's platform tenant, while an explicit selected tenant overrides it. The live RPC still rejects platform-all until a fresh recoverable backup permits its update. Rollback-only live checks confirmed ordinary station, cargo, customer with default address, and separate customer-address creation without leaving test records.

VMS vehicle-document OCR analysis is available to users with `VehicleArchive:Ocr`. The form permits an ordinary user with `VehicleArchive:Add` to apply the result when creating a vehicle in their authenticated tenant; applying it to an existing archive remains platform-super-only. The OCR request uses the form's concrete tenant so platform-all does not broaden the image scope. As read on 2026-10-01, `vms_create_vehicle_archive_secure` still rejects `ai_artifact_id` for every non-super user, so ordinary AI-assisted vehicle creation is not yet usable end to end. After a verified recoverable backup, update that create RPC to enforce `VehicleArchive:Ocr` and `VehicleArchive:Add`, bind ordinary users and their OCR artifacts to their authenticated tenant, retain artifact ownership and feature checks, and default a platform-all root create to the authenticated platform tenant unless another tenant is explicitly chosen. Keep the platform-super check in `vms_update_vehicle_archive_secure`. The form payload regression test retains `aiArtifactId` so the database receives the marker for both create and edit.

TMS cargo's direct table writes also require their exact business buttons: `Add` or `Import` for INSERT, `Edit` for UPDATE, and `Delete` for DELETE. The platform-super write policy remains available for authorized cross-tenant maintenance. The regression query checks these permissions so a later permissive policy cannot silently reopen the direct endpoint.

TMS station writes resolve a concrete tenant for creation: the platform tenant by default in platform-all mode, or an explicitly selected tenant. The station save/import RPCs check their button permissions; direct station writes use button-aware RLS, and a toggle-only user may change only `enabled`. Station roles are maintained by the checked save RPC and a restricted trigger, while authenticated clients have no direct role-table DML grant. Ordinary users with `TmsOrderOpen:AiFill` and `TmsStation:Add` can create a station through the AI RPC; its primary role is synchronized automatically. Transactional live tests covered ordinary create/edit/import/toggle/delete, AI create, platform-all explicit creation, selected-tenant creation, and forged/cross-tenant rejection; test records were rolled back.

As read on 2026-10-02, `tms_create_contract_secure` and `tms_import_contracts_secure` always write to `current_user_tenant_id()` and do not accept an explicit target. The client defaults contract creation in platform-all to that home tenant and blocks a selected foreign tenant before calling either RPC, avoiding a silent write to the wrong tenant. `tms_list_carrier_options_secure` also bypasses the selected read scope for platform super. After a fresh recoverable backup, update these contract RPCs to resolve and authorize a concrete target tenant and scope carrier options to the selected or form tenant; then remove the temporary client block and verify home, selected, and forged cross-tenant contexts in rollback-only tests.

The FMS invoice and cash-voucher OCR source now binds each analysis to one authenticated tenant: platform-all defaults to the administrator's home tenant, a concrete target is sent with the Function request, and the Function validates every image against that tenant's project attachment path. Artifact review follows the saved artifact's tenant, and cash-voucher statement recommendations use that same tenant. These Function changes are source-only until a fresh recoverable backup and deployment verification are available. The live `save_tms_invoice_secure` RPC still validates linked statements against `current_user_tenant_id()` even when its underlying save derives a different tenant from the selected counterparty; this must be aligned before selected-tenant invoice creation with links is considered complete. The current carrier-option RPC omits the carrier tenant ID, so FMS invoice and cash-payment dialogs cannot safely infer a foreign parent tenant for attachments while the header remains on all tenants. Add the tenant ID to the authorized option response, then bind these child uploads to the selected parent and clear mismatched pending attachments when the parent changes. Verify platform-all/home, platform-selected, ordinary-own, forged-header, mixed-tenant image, and cross-tenant artifact review paths after deployment.

Station deletion is guarded separately because order station foreign keys use `ON DELETE SET NULL`: without a guard, deleting a station erases order routing references. The `get_tms_station_delete_dependency_details` RPC lists linked orders for `MasterDataDeleteGuard`, with order identifiers and navigation only when the actor has order-view permission. A `BEFORE DELETE` trigger rejects deletion while any order still references the station, including concurrent references added after the UI check. The 2026-10-01 audit found 6 referenced stations and 38 station-order pairs. Rollback-only checks confirmed ordinary own-tenant inspection and unreferenced deletion, rejection of referenced deletion and forged cross-tenant inspection, plus platform-all and platform-selected behavior; the checks left no deleted station or order records.

## AI project planner

The `ai-project-planner` Edge Function powers **System management → AI project planner**.
Application users still authenticate with Supabase JWT; model access is server-to-server through an
OpenAI-compatible provider. Configure `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` in Edge Function
Secrets. The key is never stored in a browser or database. `OPENAI_*` aliases remain supported for a
reversible provider switch.

Refresh the repository facts after meaningful code changes, then deploy the reviewed function:

```powershell
pnpm snapshot:ai
supabase functions deploy ai-project-planner --project-ref ckbftoopuyophiebamwy --use-api
```

For NVIDIA NIM, set `AI_BASE_URL=https://integrate.api.nvidia.com/v1` and choose an available model
ID from AI Configuration Center. A Codex or ChatGPT login session is not used as an application API
credential.

### Assistant model recovery (2026-10-24)

The business and Supabase assistants use `nvidia/nemotron-3.5-lightning-30b-a3b`
through the existing NVIDIA endpoint. The three `business_assistant` / `project_assistant`
configuration rows and the `AI_MODEL` environment default were updated after a successful
live provider benchmark. Feature configuration takes precedence over the environment;
ordinary tenants without an override inherit the platform configuration. Keep the deployed
`ai-runtime-config` and `ai-config-tenancy` helpers synchronized with the repository.

The retired primary model returned HTTP 410, followed by HTTP 401 from the alternate
OpenAI endpoint. Both assistants now share `ai-provider-request.ts`: fallback success is
preserved, while total failure reports the preferred provider's error with a stable code
and Chinese recovery guidance instead of masking it with the last fallback failure.

Live verification with an ordinary tenant confirmed successful business replies and a
`get_project_overview` tool call returning 739 tables. Configuration updates were validated
in a rollback-only transaction before applying. Recoverable configuration, environment-default,
and deployed-function snapshots are kept in the ignored `.artifacts/ai-repair/` folder;
they contain no model API keys. Provider fallback/error-classification tests cover HTTP
401, 403, 404, 410, 429, and 502, including recovery by a successful alternate endpoint.

## AI dispatch advisor

The `ai-dispatch-advisor` Edge Function powers the advisory panel in the TMS waybill dispatch
dialog. It ranks eligible vehicles and primary drivers with deterministic, auditable rules covering
current assignment conflicts, approved load capacity, route experience, punctuality, and license
validity. The function reads business data through the caller's JWT and RLS policies; it never writes
dispatch state. A dispatcher must explicitly adopt a recommendation and submit the existing dispatch
form.

Apply reviewed database SQL through the project-scoped Supabase MCP, then deploy the function before enabling the UI in a shared environment:

```powershell
supabase functions deploy ai-dispatch-advisor --project-ref ckbftoopuyophiebamwy --use-api
```

## AI transport anomaly advisor

The `ai-transport-anomaly-advisor` Edge Function powers the advisory drawer in the TMS in-transit
monitor. It evaluates arrival and departure deadlines, stale business records, missing transport
resources or schedule data, and order/waybill status mismatches. Reads use the caller's JWT and RLS
policies, while the result is recorded in `ai_run` for auditability.

The advisor is read-only: it does not update orders, waybills, schedules, or reminder state. Because
the current project has no continuous GPS telemetry source, it explicitly does not claim real route
deviation or physical vehicle stoppage.

Apply reviewed database SQL through the project-scoped Supabase MCP, then deploy the reviewed function before enabling the UI in a shared environment:

```powershell
supabase functions deploy ai-transport-anomaly-advisor --project-ref ckbftoopuyophiebamwy --use-api
```

## Finance collection retries

Finance repayment collection accepts an optional `p_idempotency_key` UUID in `record_fms_travel_repayment_collection_secure`. The current collection dialog generates one key per opened form and retains it after a failed response. The database serializes keyed requests, checks that repayment, amount, date, bank reference and remark still match, and returns the existing receipt without increasing the received amount. A new collection uses a new key. Existing five-argument callers retain their call contract; replay protection requires the key supplied by the current UI. Existing receipt rows remain unchanged.

The rollback regression in `tests/integration/fms-travel-repayment-idempotency.sql` uses the synthetic seed section of `fms-travel-loan-rejected-edit.sql` before its `SET LOCAL ROLE` test phase. It checks two partial/replay/final collection chains, conflicting requests, anonymous/ordinary/platform permission boundaries and tenant scope. The paid-loan and approved-repayment starting states are synthetic fixtures; the test does not send bank payments. Browser coverage is in `tests/e2e/expense-settlement-actions.spec.ts`, including a committed collection whose response is lost before a safe retry.

## Export and import a Supabase project

Install and sign in to the Supabase CLI, then start Docker Desktop. From the repository root, export the linked source project:

```powershell
.\supabase\backup-supabase.ps1
```

The script prompts for the source database password. Its result is `supabase/backups/<timestamp>/manifest.json` plus database dumps, Storage files, deployed Edge Functions, and project metadata. Keep this ignored directory in encrypted storage because it contains live data. It does not overwrite the repository's reviewed Function source.

To restore into a **new, empty** Supabase project:

```powershell
.\supabase\restore-supabase.ps1 -BackupPath '.\supabase\backups\YYYYMMDD-HHMMSS' -TargetProjectRef '<new-project-ref>'
```

The restore script verifies the manifest and file hashes, asks for the target database password and project ref confirmation, and refuses a project that already has application tables. It restores the database (including Auth users and migration history), Storage objects, Realtime publication membership, and deployed Edge Functions. The source repository's project link is not changed.

To check a backup without connecting to either project, add `-VerifyBackupOnly` to the restore command.

For recipient-only download access, the owner can package the verified backup and use `publish-supabase-backup.ps1` to upload it to a **private bucket in a separate distribution project**. The package removes source Auth password hashes, sessions, refresh tokens, MFA data, OAuth flow data, migration history rows, and the owner-only managed-schema snapshot; the original owner backup remains intact. Share only the short-lived signed URL and SHA-256. Recipients use `download-supabase-backup.ps1`, `restore-local-supabase.ps1`, and `set-local-login.ps1`; they need no source project token or database password. Review business data and Storage files for other secrets before distribution. See [README.zh-CN.md](README.zh-CN.md) for the full owner and recipient commands, including an offline test with `-ArchivePath`.

Supabase cannot export Edge Function secret **values** or dashboard-only Auth/OAuth, SMTP, domain, and similar settings; configure those on the new project. Changes made to managed `auth` and `storage` schemas require manual review of `database/managed-schema-snapshot.sql` before the target is equivalent. If the source uses Vault or encrypted columns, transfer its encryption root key through Supabase's supported procedure before restoring. Custom `LOGIN` role passwords, Function import maps, and `deno.json` must be supplied separately. See the [Supabase backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for those limits.

### 2026-10-24 报表缓存切换回归

- `use-report-query` 仅在当前路由属于该报表时响应查询参数变化，避免 KeepAlive 中旧报表跟随下钻发起请求；租户切换刷新逻辑保持独立。
- 新增 KeepAlive 浏览器回归：车辆 → 订单 → 司机仅请求目标报表，并保留日期和关键词；1 项通过，定向 ESLint、Prettier 和 UI audit 通过。类型检查仍在运行，尚未宣称通过。
- 实际系统已显示 2026-09 两名验收司机：营收合计 20,000，核算成本 52,790，核算毛利 -32,790；两行薪酬、保险、折旧和车辆/订单核算一致。已检查当前桌面布局，15 页完整视觉验收仍未完成。
- 首次加载偶发失败尚待继续采集实际导航证据，缓存回归通过不能替代该问题的最终验证。
- 后续类型检查 `vue-tsc --noEmit --pretty false` 已完成，退出码 0。
- 实际系统后续验收：司机2 → 订单 YD202610-004 → 车辆测A验收002 连续下钻均首次加载成功，无需点击查询重试；这是本次观察，不代表偶发问题已彻底排除。
- 运营 KPI 在 2026-09-01 至 2026-09-30、关键词“报表验收”下显示六项指标：装载率50%、空驶率15%、到货准点率100%、货损率1.5%、回单及时率50%、应收周转待核算；汇总5项已核算、1项达标、1项待核算，与两条验收业务来源一致。实际1920×975桌面检查：查询与按钮同排，六行表格与分页可见，无页面横向溢出；黄色预警规则仍未实现，未计为完成。
- 实际回单验收（2026-09、报表验收）：YD202610-003/004 应回收均为09-22 08:00，实际为09-17/09-24，分别及时/逾期；与 KPI 50% 一致。纸质回收保留“待核实归档”，未伪报扫描完成。
- 实际承运商验收同期间两行：华东准点100%、货损100、回单及时100%、综合80/B；华北准点0%、货损200、回单及时0%、综合10/D。桌面截图检查查询同排、两行及分页可见；右侧完整考核列仍需横向滚动检查。
- 已将回单、承运商、KPI通用说明改为实际业务说明，移除无入口页面的追溯承诺；回单/承运商采用对应业务图标。承运票数图取消小数刻度，实际浏览器确认0、1整数轴。定向格式及ESLint通过，文案变更UI audit通过；图表最终类型检查待统一回归。
- 车辆调度真实验收：测A验收001/002各一行，当前在途，绑定YD202610-009/010，额定20吨/40方，保险到期2026-12-31。该页是当前状态快照，已移除不参与筛选的日期条件并明确说明额定载量不是剩余载量；浏览器确认新布局。位置、预计回场和维修计划来源仍待补齐。
- 最新类型检查退出码0，调度页格式修复后ESLint及UI audit通过。完整报表浏览器回归在运行，最终结果见 .artifacts/tms-reports/full-latest.log；不把模拟接口测试等同实际业务全流程验收。
- 整组报表回归最终37通过、1失败；失败为调度页移除无效日期后测试仍强制查找日期框。已将断言改为调度页无日期、其他报表有日期，定向重跑1通过（14.8秒）；测试文件ESLint/Prettier通过。类型检查已退出0。真实司机运营页验收遇到浏览器会话失效，尚未取得两行证据，不能计为实际流程完成。
- 司机考勤验收补齐：通过现有 hr_save_attendance_record_secure，以普通测试账号创建 TMS-QA-DAY 班次和两名已关联员工的09-10日考勤，先事务回滚验证后提交；before-driver-attendance-seed.json保存空集前态。系统自动计算normal/480分钟、late/465分钟/迟到15分钟，提交后数据库和实际司机报表复核一致。未触发薪酬付款或封账。
- 实际发现出勤状态裸露normal/late，已改复用ArtDictDisplay及hrAttendanceStatus字典，支持期间多种状态；缺记录显示未登记。实际浏览器已显示正常/迟到。同步修正纸质回单汇总文案。司机页两条记录、筛选、明暗主题和专注模式定向回归1项通过（25.6秒）；最新类型与最终视觉仍待后续统一检查。
- 运营KPI红黄绿补齐：保持六项目标及公式，服务端默认黄色区间为装载80≤x<85、准点95≤x<98、回单90≤x<95、空驶10<x≤15、货损0.1<x≤0.2（百分比）、应收45<x≤60天。绿色达标，超黄色区间红色未达标，缺值灰色待核算；每行备注公开默认区间。
- 已备份before-kpi-warning.json，事务回滚验证后直接更新既有私有报表函数，无新增公开RPC。tms-report-empty-kpi.sql增加10%、10.33%、15%、15.33%及缺值边界并通过，所有临时里程变更回滚。安全advisors仍为既有5组INFO/WARN，无ERROR。
- 页面采用明确状态颜色映射，实际系统空驶15%显示黄色预警；KPI定向浏览器回归通过，类型检查进程42100尚在运行，后续需取最终结果。
- KPI/考勤最近类型检查42100已结束，退出0。
- 实际异常页只查到两条超期提示，无已登记异常；已有创建接口限定AI回单识别证据，不能冒充普通运输异常登记流程。运输异常登记、责任、理赔与结案仍是未完成需求。
- 异常页原通用签收/回单卡无对应数据，已改为异常记录、待核实提示、待办工单、已结案。服务端分页前统计，待办含未处理/处理中/已解决待结案，取消不算结案。before-exception-summary.json备份后事务验证、提交；真实页面显示2/2/0/0，保留两条延误提示。新增SQL回归覆盖提示不计工单和空集零计数；定向浏览器两条数据/明暗主题/专注模式通过。已登记/结案实业务尚未验收。

### 人工运输异常处理链路（实施中）

- 人工异常现已同步进入经营风险汇总，包含已结案历史；风险金额取已核实货损，估损单列，理赔登记不视为付款。相同订单的人工延误工单抑制重复系统提示。before-manual-risk-report.json备份后事务验证并部署，tms-report-manual-risk.sql确认两条结案人工事项、100元核损和无重复提示，部署后复验通过。既有货损费用事项仍按来源逐项列示，不将不同来源金额直接合计。

- 已将异常汇总及人工报表SQL回归改为仅在BEGIN/ROLLBACK内隔离两条命名验收工单，避免持久化结案数据破坏原始提示场景；人工联动回归退出0，汇总回归连接中待取结果。实际宽表已横向检查末端：固定订单号、估损100/待核算、货损100/0、理赔80/0与两个已结案状态均可见，分页保持完整。

- 真实浏览器已分别完成YD202610-009/010登记→开始处理→登记结果→确认结案。工单9c2f677d-300e-4de1-a500-7975c3d34ca8估损100、货损100、理赔80；b943b4e4-b121-40e8-8cdc-bbfab7fd88da估损NULL、货损0、理赔0。数据库复核均closed、各4条服务端历史，未触发付款。
- 实际台账汇总2条、待核实0、待办0、已结案2；1920×1020桌面截图中查询按钮同排、两行及分页完整可见。两条均未指定责任人，选人已由模拟接口回归覆盖，尚未做真实指定人员验收。既有依赖“2条系统提示”基线的SQL测试需改成事务隔离夹具，不能直接按旧前态重跑。

- 选单/选人/登记/处理/结案模拟接口回归通过（29.1秒，整次41.3秒）。实际浏览器发现订单详情未返回tenant_id导致登记窗口无法打开；已备份before-order-detail-tenant.json并修正既有详情RPC，补充父租户上下文，同时将旧平台超级管理员读绕过改为canonical租户范围谓词。
- tms-order-detail-tenant-context.sql覆盖普通用户伪造头仍读取自身租户、拒绝外租户、平台全部可读、平台选定拒绝其他租户，部署前后事务验证通过。安全advisors保持既有5组，无新增ERROR。实际浏览器重新验证YD202610-009登记窗口及跟进人字段已可加载，尚未提交真实异常。

- 提示行登记浏览器回归已通过（12.1秒，整次22.7秒），验证默认延误/在途与未知估损NULL。新增顶部登记入口复用ArtTableSingleSelect和tms_list_orders_secure分页选单，按发货客户/联系人搜索；不会读取全部订单或绕过订单权限。该顶部选单入口尚待浏览器验证，责任人选择仍待补齐。

- 前端已添加人工工单处理弹窗及提示行登记入口，使用ArtDialog/ArtForm和显式Add/Process/Close权限；仅人工工单执行人工状态转换，AI回单工单保持既有边界。金额留空不变成0，服务端校验预期状态。
- 浏览器模拟接口回归已执行开始处理→登记结果→确认结案，货损100且理赔NULL断言通过；已查看1440×900处理结果弹窗截图，字段与页脚完整可见。后续追加的提示行登记断言尚待运行；类型检查64425仍在运行。主动选择任意订单登记、责任人选择、两条持久化实际流程和完整视觉验收仍未完成。

- 人工工单已接入既有运营报表函数，来源明确标记 manual / receipt；同订单登记延误后不再重复显示系统延误提示，其他异常类型不会误吞延误提示。备份 before-manual-exception-report.json，核对线上定义未变更后事务验证并直接部署。
- tms-report-manual-exceptions.sql 在事务内验证登记后两条总记录、一条提示、一条待办；随后开始处理、核实货损100/理赔80、结案，验证台账金额与已结案/待办统计一致。部署前后均通过，测试数据全部回滚。前端操作与两条持久化实际流程仍未完成。

- 已新增独立 tms_order_exception，关联既有订单与租户复合键，区分延误/破损/丢货/扣货、提货/在途/签收节点；保留估损、核实货损、理赔登记、责任人、状态和服务端追加历史。未改变 AI 回单工单数据或权限，也不自动产生付款。
- tms_create_order_exception_secure / tms_transition_order_exception_secure 已部署；登记、处理、结案按钮权限挂在 TmsReportOrderExceptions 下，现有页面角色继承动作配置。普通用户通过受控RPC写，原始表仅授予SELECT；租户由父订单解析，处理锁行并校验预期状态，禁止跨租户与跳过状态。
- before-manual-exception.json记录新增对象空前态；先事务回滚验证后提交。tms-order-exception-lifecycle.sql覆盖完整4步历史、普通用户伪造头、外租户拒绝、平台全部父租户继承、选定范围拒绝、无权限拒绝、陈旧状态拒绝；测试均回滚。前端登记/处理表单、报表接入和两条实际流程仍未完成，不能按此后端部署宣布该功能完成。

### 2026-10-24 在途日报人工异常联动验收

- 在途日报已读取同租户人工运输工单。待处理/处理中工单或超期未签收显示“有异常”；只有已解决/已结案工单时显示“有历史异常”，原因保留工单状态与说明。结案不清除仍超期未签收的执行提示。回单工单沿用相同当前/历史区分。
- 修改前保存完整函数定义到忽略目录 before-transit-manual-exceptions.json；部署前后均通过 tms-report-transit-manual-exceptions.sql 的事务回滚验证（处理中、结案历史、结案但仍超期三种情况）。未新增授权或改变租户边界。
- ESLint、UI audit 通过；安全顾问仍为既有五组提示，无新增 ERROR。此前异常汇总 CLI 校验因临时登录角色认证失败而终止，已改用项目 MCP 执行同一事务测试并通过。

### 2026-10-24 维修来源归集候选（尚未部署）

- 已核对：运单费用现有 source_type/source_id 具有租户内唯一约束；当前来源只有 driver_report 与空值。维保记录无审批状态，不能将其金额直接叠加到已审核运单成本。
- 候选实现扩展 tms_save_waybill_cost_secure 的 maintenance_record_id 输入：只接收可读取金额的已完成维保、同租户同车辆、维修保养分类、与源记录一致金额；来源不可替换，重复来源拒绝，保留原费用审批与字段权限。原函数备份在忽略目录 before-maintenance-cost-source.json。
- tms-maintenance-cost-source.sql 已在候选函数所在 BEGIN/ROLLBACK 事务内验证两条草稿、重复拒绝、审批、单车成本分别增加600/900；所有测试修改回滚。该测试是待部署契约，目前线上函数仍未接收维修来源，不能作为线上已完成功能宣传。
- 发布前必须完成：来源删除保护（现有 vms_delete_vehicle_maintenance_secure 与前端 MasterDataDeleteGuard）、跨租户/金额隐藏/错车/错分类/编辑不可换源回归、前端维修来源选择与追溯、两条实际审批和视觉验收。无运单维修成本的期间核算仍单独待处理。
- 维修来源候选新增 tms-maintenance-cost-source-validation.sql，事务验证错车创建、错金额、未完工来源、编辑换源、编辑改成另一车辆五种输入均被拒绝；全部回滚。仍未部署。当前维修列表的单条删除仍为直接确认，批量流程也需一并迁移到 useRecordDeleteGuard / MasterDataDeleteGuard；现有删除RPC尚未检查运单费用来源引用，发布前必须补齐。
- 维修删除保护进展：前端单条/批量已复用 useRecordDeleteGuard，ESLint、UI audit、完整 vue-tsc 均通过（30396）。后端删除候选在锁定来源记录后检查同租户 vehicle_maintenance 来源费用；新引用读取候选验证逐条删除权限与租户，返回费用编号/审批状态，无费用查看权限时隐藏目标。两条来源在事务内验证草稿阻止删除、来源保留、引用详情返回正确，并继续完成审批归集；测试全回滚。后端候选尚未部署，前端 scoped reader 路由和权限/视觉验收待补。
- 维修删除保护已独立部署：vms_delete_vehicle_maintenance_secure 现在按 canonical read scope 校验选定租户，并在锁行后拒绝存在 vehicle_maintenance 来源费用的删除；vms_get_maintenance_delete_dependencies_secure 已部署，前端 scopedDeleteReaders 已接入，关联费用导航改为 FinanceWaybillCostDetail 的 id 参数且检查 View 权限。来源创建函数仍是未部署候选。
- vms-maintenance-delete-scope.sql 部署前后通过：普通用户本租户/伪造头、平台全部/指定本租户/指定外租户、无权限用户。相关引用元数据单测通过。顾问无 ERROR，authenticated SECURITY DEFINER 通用提示由1198增至1199，对应新增受权限/租户保护的引用读取RPC；anon数量未变。实际删除弹窗、导航和权限受限展示仍待浏览器验收。
- 维修来源选择器已新增独立 feature 组件，复用 ArtTableSingleSelect，支持维修单号分页搜索与完成时间格式化；API独立在FMS transport目录。对应候选RPC根据运单真实车辆/租户过滤，只返回已完工、金额和单号可读取、尚未归集的来源；事务验证600元来源可见、另一车辆900元来源不可见。候选RPC及创建函数均未部署，选择器尚未接入费用主表单，不能视为可用功能。后续需要完成双来源/权限/编辑回显验证再接入发布。
- 维修来源创建与分页选择接口已部署：fresh定义确认无并发变化后执行，部署后两来源审批/重复/删除保护回归及五项校验均通过。前端费用表单新增可选维修来源，选定自动带入金额并锁定金额，切换运单清除来源，已有费用不允许换源；现阶段仍待真实浏览器全流程与视觉验收。
- 本次 ESLint 通过；新增只读来源RPC使 authenticated SECURITY DEFINER 通用顾问计数增至1200，anon不变，无ERROR。类型检查已启动，未据此宣布完成。

### TMS 报表验收状态更新（2026-10-24）

- 维修来源已通过真实浏览器流程：YDFY202610-0017（600元）与YDFY202610-0018（900元）分别关联WX202610-0001/0002，经过财务主管、财务负责人两级审批。待审不计成本，审核后九月六个经营维度均为核算成本54290元、毛利-34290元；单车页面汇总与图表已核对。
- 费用详情新增按VehicleMaintenance:View与已注册详情路由控制的维修来源入口，实际跳转至对应600元维修单。格式、ESLint、UI audit与完整vue-tsc通过。选择来源后金额锁定，OCR入口隐藏，防止覆盖来源金额。
- 已归集维修记录的更新RPC锁定车辆、金额、起止时间和项目，允许补充备注及附件。部署前后tms-maintenance-source-immutability.sql事务验证通过；原函数备份保存在忽略的.artifacts目录。安全顾问无ERROR，authenticated SECURITY DEFINER计数1200、anon计数1，未因本次更新增加。
- 成本对账与汇总回归改从已审核来源费用独立计算预期成本，再加已知薪酬/保险/折旧测试基数，六维汇总、分页、图表及重复分类去重验证通过。事务全部回滚。
- 新增tms-report-kpi-contract.sql验证六项运营KPI的目标、实际值、完成率、预警与汇总计数。九月“报表验收”筛选五项可核算，应收周转因无匹配财务应收来源而待核算；另一个TEST-AR-WAYBILL测试群体的周转测试不可混作这一群体的完成证据。
- 仍未完成：运输月度预算/目标数据维护及差异分析、其余业务指标补齐、全部15页两条完整业务链与主题/窄屏/权限/异常状态视觉验收。上述局部验证不代表总体交付完成。
- 维修来源补充回归已通过：两笔已归集维修记录均拒绝换车；更新权限覆盖普通用户自身租户、伪造跨租户请求头、平台全部租户、平台指定租户、指定外租户拒绝及无编辑权限拒绝。`tms-maintenance-source-immutability.sql` 与 `tms-maintenance-source-update-scope.sql` 通过项目 MCP 执行，所有修改回滚，未改动两笔已审批业务数据。
- 月度预算仍在实施前核对：现有 `app_private.resolve_write_tenant_id` 要求平台管理员指定非平台业务租户，不能直接满足本功能的全部租户新建默认归属规则；不为此修改共享函数，以免影响其他业务。预算存储、接口、维护界面和实际两条数据流程尚未完成。

### 月度经营预算与目标（2026-10-24，后端已部署）

- 新增 `app_private.tms_monthly_metric` 作为16项月度指标的唯一元数据源，包含名称、分组、单位、目标方向与取值范围；新增 `public.tms_monthly_plan` 按租户、自然月、指标唯一保存预算、目标、备注和并发版本，复用现有创建/更新审计触发器。
- `tms_save_monthly_plan_secure` 要求 `TmsReportMonthlyOverview:MaintainBudget`，该按钮权限挂在月度总览菜单下；普通用户不能指定其他租户，平台全部视图默认创建到自身平台租户，也可明确目标租户，指定视图禁止写其他租户。未修改现有共享租户函数，也未自动给所有查看者授予预算维护权限。
- `tms_get_monthly_plans_secure` 按月返回指标定义和当前可读租户的计划。表启用RLS，普通客户端只有SELECT授权；写入必须通过受控RPC，匿名无RPC执行权限。全租户计划尚未直接合并为预算总额，避免缺预算租户被当零。
- `tests/integration/tms-monthly-plan-contract.sql` 部署前后通过，覆盖两项新建、修改、负毛利、非法比例/NaN/Infinity、陈旧版本、普通/伪造请求头/平台全部/平台指定租户及无权限写入。测试授权和数据全部回滚，当前计划表0行。部署前空对象及菜单前态保存在忽略目录 `.artifacts/tms-reports/before-monthly-plan.json`。
- 安全顾问无ERROR；私有指标表关闭直接授权并启用RLS，产生一项预期的无策略INFO（总数5）；受保护的两个公开RPC使authenticated SECURITY DEFINER提示计数1202，anon仍1。前端维护、实际值/预算差异、目标预警、两条真实操作及视觉验收未完成，不代表月度总览需求已交付。
- 前端新增独立monthly-plan API，验证RPC返回DTO；月度总览接入“预算与目标”权限入口和ArtDialog/ArtForm双列维护表单，编辑查询结束日所属月份、当前写入租户的指标，切换租户关闭弹窗。已在真实浏览器核对标星常用线路参考页；预算弹窗本身尚未视觉验收或提交两条实际数据。格式、ESLint与UI audit通过；完整类型检查首次内存不足，扩大内存后发现按钮类型错误，已修正并重跑，最终结果尚待确认。预算差异表和目标预警尚未接入。
- 后续完整类型检查10056已退出0。单人测试角色“管理员(承运商)”在已有月度总览权限下增加MaintainBudget，前态保存在before-monthly-plan-test-role.json。普通租户账号通过实际浏览器保存2026-10订单预算10/目标12、营业收入预算80000/目标100000；数据库核对两行revision=1且所属租户正确，订单预算重新打开回显10/12。
- 预算弹窗1920×1020浅色桌面视觉检查后，将两列数字控件扩展到各自列宽，实际截图确认对齐、按钮和内容完整；修正后格式、ESLint、UI audit通过。深色、窄屏、错误重试和预算比较仍待完成；两条预算数据不代表15页全部验收通过。
- 预算执行对比已接入独立只读弹窗，按截止日所在月读取不含关键词的实际值、同年累计与本租户预算；不将全部租户计划或月分摊薪酬误作完整预算/薪酬总额。当前接入订单数、运量、方量、营收、核算毛利/毛利率，其他指标明确待补来源。差异为实际减预算，未结束月份未达目标标记跟踪中；未编制/未设定/无法计算分别显示。
- 月度对比3项单测通过，覆盖未结束月份、空值、其他租户/全部租户、零预算与上限目标。实际浏览器核对十月订单8对预算10差异-2，营收70370.25对预算80000差异-9629.75，本年营收505964.99；已检查浅色桌面截图。完整类型检查92923退出0，ESLint及修正加载归属后的UI audit通过；截图后将目标状态固定右侧，末端滚动、深色/窄屏与该最终列位置仍需视觉复验。
- 月度装载率、空驶率、准点率已复用现有运营KPI计算：既有tms_management_report新增monthly-operations报表标识，沿用月度总览查看权限及原KPI数据/字段/租户边界，没有新增公开RPC。修改前备份before-monthly-operating-metrics.json，检查线上定义无并发变更后部署；tms-monthly-operating-metrics.sql在部署前后验证普通自身/伪造头、平台全部/指定及无权限拒绝，与operations-kpi返回完全一致。
- 前端按当月和本年分别请求比例指标，不对月百分比求和或简单平均；统计说明沿用源指标公式，去掉运营默认黄色阈值文案，以免与用户维护的月度目标混淆。真实浏览器核对十月准点率本月/全年均100，空驶率因来源不完整仍待核算。类型检查50341退出0，格式/ESLint、三项对比单测、UI audit通过；安全顾问数量未变、无ERROR。其他月度成本/资金/人力指标及完整视觉验收仍待补齐。
- 月度货损金额已接入：无关键词月度汇总复用tms_report_damage_costs，来源为本期订单关联已审核cargo_damage费用，按费用记录归集；缺金额权限保留NULL，未审核费用和人工异常估损/理赔登记不叠加。关键词报表不返回未过滤的货损汇总，避免混用范围。修改前备份before-monthly-damage-summary.json，并在部署前确认线上定义无并发变化。
- tms-monthly-damage-summary.sql部署前后通过，独立从费用/运单/订单联表对账，覆盖普通自身/伪造头、平台全部/指定租户及关键词范围。实际浏览器九月预算对比显示货损当月300、本年累计300，来源说明正确。格式、ESLint、三项单测、UI audit通过，安全顾问数量未变且无ERROR；完整类型检查92325已退出0。
- 薪酬来源核对：现有8名启用司机均关联员工，当前无重复员工关联；工资批次仅有2026-09已审核、2026-08已支付及2025-09已计算，2026-10无已审核工资。月度薪酬总额和司机人均营收尚未接入，不能将运单分摊额作为工资总额填入。
- 月度人力指标已部署：私有tms_monthly_people_metrics复用已审核/已支付工资来源，按租户和员工归集，范围为当前启用司机及本期有工资的司机；完整覆盖所有月份且均为可读取人民币工资时才返回应发总额。司机人均营收按已派车订单收入去重除以实际承运司机数，未派车订单不计，运单缺司机时待核算。既有公开报表仅在无关键词月度汇总调用，未新增公开RPC或授权。
- tms-monthly-people.sql部署前后通过：部分工资不当总额、两名完整工资17000、跨月缺工资、重复员工关联被已有唯一约束拒绝、普通伪造头、平台全部/选定租户、私有函数无authenticated直接执行权限。测试期间启停与员工关联修改全部回滚。修改前备份before-monthly-people.json。
- 真实九月页面显示工资覆盖2/7、总额待核算，人均营收9059.68元/人、4名承运司机，本年人均营收43832.46元/人；口径说明可读。格式、ESLint、三项预算对比单测与UI audit通过；安全顾问数量未变、无ERROR。完整类型检查96061最终结果待确认。

- 月度应收余额候选通过事务验证（尚未部署）：复用财务应收来源，按截止日涵盖以前月份，扣减已审核回款/核销，贷项抵减；只有金额可读且全部人民币才汇总，未知到期日使逾期指标待核算。两笔真实来源余额450+900=1350，改为上月单据后余额不变，年度截止日余额也不累加。
- 新增tms-monthly-receivable-balances.sql，候选函数事务验证涵盖月度公开报表接入、关键词范围不混用、平台全部/指定、普通伪造头、无财务权限、未知到期日、外币和私有函数执行权限；全部通过并回滚。候选尚未部署，前端资金指标仍待接入，不能据此宣布页面完成。
- 月度应收余额已部署并接入预算对比。部署前核对既有函数定义未变化，已有备份有效；部署后完整事务回归通过。前端本月和年度资金指标均使用同一截止日余额，年度列标注“本年累计 / 期末”，说明余额不累计。格式、ESLint、3项单测、UI audit通过，类型检查43304退出0；安全顾问计数不变，无ERROR。
- 实际浏览器对比弹窗加载失败，重试仍失败；普通用户JWT并SET LOCAL ROLE authenticated调用预算、全年月度及全年运营接口均正常。已改为复用友好错误归一化保留可操作失败信息，随后浏览器调试连接中断，尚未取得失败原因和成功视觉证据。此项验收未完成，下一轮先定位加载失败，不将数据库回归当作页面成功。最终错误文案改动需再做类型/UI检查。
- 后续新浏览器会话预算对比两次成功加载，普通当前租户资金余额均0，与数据库一致，未串入另一租户1350。已检查1920×1020浅色桌面截图及表格底部：应收/逾期、年度期末值、固定状态列和关闭按钮可见。先前间歇失败未复现但根因未确定，不能宣称根治；深色/窄屏仍未验收。错误归一化改动ESLint与UI audit通过，类型检查80433仍待结果。
- 深色主题下预算对比成功加载，1920×1020实际截图确认表头、行分隔、数字和关闭按钮可见。主题切换会重建当前页面，验收操作应等待页面完成后再开弹窗。恢复浅色过程中浏览器输入超时，下一轮需先核对当前主题并恢复；窄屏仍待验收。
- 完整类型检查80433退出0。新增预算对比浏览器回归：预算读取失败→重新加载→两项资金指标恢复，验证应收1350/逾期450在本月与年度期末各显示一次，不累计；定向测试1通过（7秒），测试文件格式/ESLint通过。该项使用模拟接口，不能代替真实财务业务流程；此前真实会话间歇失败仍未定位。
- 本轮整组39项报表浏览器回归进程41895正在执行，已进入后段，需收取最终退出结果后再报告通过。
- 整组报表浏览器回归41895最终退出0：39项全部通过（4.1分钟），另新增预算重试用例单独1项通过。覆盖模拟数据页面、筛选、主题和布局等既有断言；仍不替代15页每页两条真实业务全流程及最终视觉验收。
- 月度外包运力成本候选已完成来源核对：按本期订单关联的已审核carrier_freight费用归集，不用当前车辆所有权推断承运方式。九至十月8条已审核承运商运费共74000，候选事务对账通过。现有车辆全部self_operated，不能直接据此把所有运单费用都算作自营运营成本。
- 新增tms-monthly-outsourced-cost.sql，独立联表对账并覆盖普通/伪造头、平台全部/指定、关键词范围，候选事务测试通过且全部回滚。原函数备份before-monthly-outsourced.json。此候选尚未部署、前端尚未接入，后续补审批状态变更及字段权限回归后发布。
- 外包成本已部署并接入月度对比实际值/全年累计及口径说明。发布前核对函数未被并发修改，发布后tms-monthly-outsourced-cost.sql复验通过。审批回归使用现有保存→启动流程→审批接口：草稿123元不计入，审批完成后增加123元；全部事务回滚。直接将approved改draft被现有触发器拒绝，测试已修正为合法业务链路。
- 外包指标仍需实际浏览器数值复核与最终类型检查；无金额权限的专门覆盖仍待补充，不宣称全部验收完成。
- 外包成本金额权限专项回归已补齐并通过：普通测试用户保留月度报表权限，事务内分别设置运单费用金额字段hidden和masked，验证解析器实际生效且汇总outsourced_cost均为NULL，不能通过报表聚合绕过字段权限。连同前述来源对账、租户范围、草稿至审批流程一次执行通过；权限和新建费用全部回滚。前端最终类型检查已启动，实际页面外包金额仍待复核。
- 自营成本来源核对：九月当前普通租户保险3辆共1551.04，已入账折旧2辆共13500；不能将无折旧来源车辆视为零，也不能只按当月有运单车辆统计固定成本。新增tms-vehicle-standing-costs.sql，在事务内移出九月订单后验证既有保险/折旧来源完全不变，测试通过并回滚；自营成本汇总实现仍待完成。
- 自营成本私有汇总候选已在事务内验证：当前自营车辆按服务日期取范围，包含闲置车；本期订单已审核运行分类费用加期间保险、各月已入账折旧，排除另列工资和重复保险/折旧费用。未分类费用或固定成本来源缺失时不报完整总额。当前2/7辆完整；事务隔离两辆完整验收车辆后为15990（保险990+折旧13500+维修1500）。
- 新增tms-monthly-vehicle-costs.sql，候选下验证全车队不完整、两辆独立对账、普通伪造租户头及私有执行权限，通过且全部回滚。候选函数尚未部署；仍需平台全部/指定、金额权限、重复费用和闲置费用汇总测试，再接入前端。候选SQL保存在会话工具状态monthlyVehicleHelper，未创建迁移文件。
- 自营成本已部署并接入月度预算对比。before-monthly-vehicle-costs.json保存原函数及私有函数不存在前态，部署前公开报表接入事务验证返回7辆，部署后完整成本回归通过：平台全部/指定、普通伪造头、无来源权限、保险/折旧费用审批后不重复、无当月订单时固定成本14490保留。测试全部回滚，未新增公开RPC。安全顾问数量不变，无ERROR。
- 前端接入自营成本当月/年度值及来源完整车辆数；实际浏览器、字段隐藏专项与本次最终类型/格式检查仍待完成，不能按后端通过宣布页面验收完成。
- 实际浏览器九月预算对比复现明确错误“请求处理超时，请稍后重试”。普通用户全年月度查询EXPLAIN ANALYZE单次约2558毫秒、816356 shared hit blocks，提示费用/权限计算偏重；此前五请求并发可能加剧负载，但尚未证明唯一根因。前端已拆分为预算+当月、全年、两项KPI三个阶段，避免年度核算与KPI同批竞争；需浏览器复验及继续优化底层查询，不宣称已根治。
- 自营成本hidden/masked金额字段专项回归通过，整个成本回归均回滚；最新格式与UI audit通过。类型检查12407仍运行，且本次请求分批改动发生在启动之后，后续应重新确认最终检查范围。
- 分批请求实际复验成功：九月外包成本当月/年度均18500，与当前普通租户SQL一致；自营成本待核算、来源完整2/7显示正确。已看1920×1020浅色桌面截图。全年运营指标单次EXPLAIN ANALYZE约1185毫秒，全年财务约2558毫秒；分批减少竞争但尚未证明间歇超时彻底根治。
- 分批后预算失败重试定向浏览器回归1通过（17.2秒），ESLint通过；类型检查12407退出0，但其启动早于最后请求分批编辑。新增弹窗边界/关闭按钮在视口内断言并启动1024宽度回归，结果待取。
- 1024宽度预算对比回归56396退出0，1项通过（21.1秒）：重试恢复、余额不累计、弹窗左右边界及关闭按钮在视口内；测试文件ESLint通过。该布局断言不等同全部窄屏人工视觉验收。
- 司机运输周转量已部署：沿用有效运单安全载重及执行里程，按司机汇总载重×（回场表显−出车表显−空驶里程）；任一依据缺失返回NULL。两条验收数据950、1600吨公里。tms-driver-tonne-km.sql覆盖平台全部/指定、普通自身/伪造头及缺失里程，通过；既有车辆里程回归通过。原函数备份before-driver-tonne-km.json。前端新增行驶/重驶/吨公里列并说明全程载重假设。实际浅色桌面已确认两条数值、完整行和分页，专注模式隐藏概览/图表且Esc恢复；窄屏和深色本项尚未复验。UI audit通过721源文件、1522模块UI文件；类型检查9325待收取。
- 司机指标最终类型检查9325退出0。异常历史审查确认两条已结案验收工单各保留create/start/resolve/close四条记录，但前端结案后无历史入口。新增tms-exception-history-read.sql以SET LOCAL ROLE authenticated验证真实读取边界，当前失败：RLS调用can_execute_business_action时普通角色无执行权限；此前以postgres仅设置JWT的测试不能证明直接表读取可用。下一步通过受控读取接口提供历史详情，不能为修复而开放全部私有权限函数。该回归当前为待修复失败，不代表验收通过。
- 异常历史受控读取接口tms_get_order_exception_history_secure(uuid)已部署，保留页面权限与canonical租户范围；不开放私有函数执行权，匿名不可调用，不返回操作者UUID，名称仅关联同租户用户。before-exception-history-reader.json记录原接口不存在。以authenticated真实角色运行回归已通过：两条四步历史、普通伪造头、无权限拒绝、平台全部/指定及选定异租户拒绝。前端历史入口尚未接入。
- 2026-10-25 异常历史前端已接入ArtDrawer时间线和失败重试，真实页面发现页面权限不能作为ArtButtonTable按钮权限。已将入口改为TmsReportOrderExceptions:ViewHistory，并加入业务按钮目录；数据库菜单登记、验收角色授权及读取接口同步按钮权限尚未执行：MCP连续传输失败，curl hosted MCP返回000。不要认为该按钮已可供普通用户使用。类型检查30238退出0，ESLint30701退出0；模拟生命周期+历史重试回归94452运行中（无需登录的fixture使用--no-deps，首次默认setup因未提供测试账号而失败）。
- 2026-10-25 连接恢复后已注册TmsReportOrderExceptions:ViewHistory按钮，授权现有单用户验收角色ae3ce695，读取RPC同步校验该按钮权限。before-history-permission.json保存原函数及既有处理授权快照。真实authenticated角色回归通过平台全部/指定、普通伪造头、无页面权限和仅有页面无历史按钮权限；所有验证变更回滚。前端历史字段已适配responseHandle默认camelCase转换，生命周期+失败重试+四步历史+未知金额回归19652退出0（1项），最新ESLint通过。真实历史抽屉视觉验收仍待进行。
- 历史抽屉模拟回归69300、50480均2项通过（tablet-1024、desktop-dark-1440）。1024截图四步记录与金额可读，短时成功提示遮住标题，已补等待提示消失后截图。当前本地服务已恢复为75926，但真实浏览器会话过期停在登录页；真实两条历史视觉验收尚未完成。最新类型检查46125仍运行，应收取结果。
- 最新类型检查46125退出0。无遮挡截图回归47828两项通过；人工复核发现desktop-dark项目名未切换独立fixture主题，之前深色通过不能作为深色视觉证据。已按项目名显式传theme参数，27167深色1项通过；截图显示真实深色时间线。1024浅色截图标题、关闭按钮、四步文本完整可读。测试格式/ESLint通过。真实业务浏览器登录仍待恢复，不以模拟截图替代真实数据验收。
- 异常登记/流转写入规范整理：表单负责文本、可空金额和责任人整理，以及仅resolve携带金额的业务规则；API层只映射请求字段。责任人重置字段显式声明。现有生命周期、历史重试和主动登记回归28220通过，ESLint与UI audit通过；最新类型检查99182运行中。
- 异常登记窗口改为立即打开，onOpen加载订单所属租户及跟进人，ArtDialog承载loading，ArtAsyncState提供错误与重试；未就绪阻止提交，版本号防止旧请求覆盖新打开上下文。格式/ESLint和UI audit通过。上一轮类型检查99182退出0，早于本次加载交互改动，仍需最终类型复验。
- 2026-10-25 真实authenticated验收租户、2026-09至10月、关键词报表验收覆盖盘点：月度2、应收0、车辆2、线路2、司机2、订单8、客户2、风险6、KPI6、在途2、调度2、司机运营2、异常2、回单8、承运商2。结果数不是完整流程验收，尤其应收样例此前位于其他租户，当前租户缺两条。已用现有fms_create_transport_estimated_receivables_secure对验收运单001事务验证可生成暂估，全部回滚；下一步补收款法人/税率→提交审核→财务应收及回款闭环，不直接插入报表数据。最新类型检查67539退出0。

- 2026-10-25 新增 tms-transport-receivable-chain.sql：两笔验收运单通过现有业务RPC生成暂估、补法人及税率、提交审核、下推财务应收并审核。转换金额保持12000/8000；切换SET LOCAL ROLE authenticated及普通用户JWT，伪造外租户头后仍读到本租户两笔合计20000。项目MCP事务回归通过，全部回滚，尚未持久化案例，也未完成回款核销和真实页面验收。

- 2026-10-25 两条主验收租户应收案例已通过业务RPC持久化：AR-F-202610-007/008审核金额12000/8000，AR-RC-202610-003/004确认收款6000/4000，自动核销后剩余合计10000。先完成整链BEGIN/ROLLBACK验证，再备份before-transport-receipts.json并提交；提交后独立联表核实审核/确认状态。回归支持既有案例重复确认并核对普通用户报表余额。尚未完成实际浏览器视觉验收；本次顾问调用传输失败，不能声称检查通过。

- 2026-10-25 最新整组报表Playwright回归61389退出0，desktop-1440共40项通过（2.7分钟）。人工复核本轮dense-layout-1440/640截图：1440查询字段与按钮同排、图表180高、表格首屏约6行且分页完整；640查询换行、表格横向内容在区域内，页面采用纵向滚动。该组仍为模拟接口，不能替代真实业务数据视觉验收。浏览器库存确认本地真实会话仍在登录页；MCP连续传输失败，直连host返回401可达，当前未完成新增应收对月度资金/KPI的线上对账。

- 2026-10-25 应收联动验证补齐：主验收租户10月期末应收10000、年度期末应收10000（不累计），运营KPI周转7.75天，依据(期初0+期末10000)/2/本期应收20000×31。已追加至tms-transport-receivable-chain.sql，authenticated普通用户伪造外租户头验证通过。既有月度余额、其他租户周转、九月六项KPI三组回归均通过并回滚；安全顾问调用已恢复。真实页面登录/视觉验收仍未完成。

- 2026-10-25 油耗来源核对纠正：现有tms_waybill_cost具有quantity/unit_price，FMS运单费用ArtForm已有数量/用量输入，可复用；不存在独立fuel_liters字段并不等于没有数量入口。但费用及费用项目均无计量单位，抽查fuel三条quantity均NULL，不能将通用quantity直接作为升数。加油量也不能无条件视为期间耗油量；后续须明确升单位和满箱法/期初期末油量边界，接入已有费用审核、字段权限和有效里程，避免另造重复费用流程。本轮仅完成数据来源核对，百公里油耗功能尚未实现。

- 2026-10-25 油耗候选采用运单执行记录的出车余油、途中加油、回场余油（全部升），耗油=出车+加油−回场；与同运单表显差里程对应。沿用现有回场登记维护执行事实，费用quantity继续表示采购/费用数量，不重复造财务费用。BEGIN/ROLLBACK候选验证30升平衡、负耗油拒绝、NaN拒绝、缺加油记录保持NULL通过；字段与约束已回滚，未部署。候选SQL仅保存在会话executionFuelSchemaCandidate，无迁移文件。后续必须接入既有执行登记RPC/权限/读DTO/表单、避免重叠执行里程重复归集，再做两条真实业务与视觉验收；不能按候选测试宣布油耗功能完成。

- 2026-10-25 执行详情范围修复：线上复现平台super选定6675租户仍读取7529运单。tms_get_waybill_execution_context已改canonical tenant_in_current_read_scope，保留原始业务权限与字段脱敏，错误改中文42501；before-execution-context-scope.json备份原函数。候选事务回滚通过后fresh定义对比无并发变化再发布，部署后tms-execution-context-scope.sql通过平台全部/选定本租户/选定异租户拒绝、普通自身及伪造头一致。回场写函数及raw读取仍需继续审计，油耗字段尚未部署。

- 2026-10-25 raw执行上下文已核实authenticated/anon均无EXECUTE授权，不存在直接客户端绕过入口。回场写函数候选新增canonical范围前置检查，候选下tms-execution-completion-scope.sql验证super指定外租户拒绝且不写状态、普通用户伪造头仍可完成自身运单，通过并回滚；候选尚未部署。平台全部租户真实回场测试另外发现set_vehicle_mileage_creator_identity拒绝跨租户管理员创建里程，错误Vehicle mileage creator is missing or outside the record tenant，需修正创建人归属契约后完成全部范围验证，不能仅跳过此用例即宣布通过。原回场函数已备份before-completion-scope.json。

- 2026-10-25 平台回场失败根因确认：vehicle_mileage_record_creator_tenant_fk强制创建人与记录同租户，触发器也同样限制。候选改为创建人单ID外键，触发器仅允许当前认证平台super在canonical可见范围作为跨租户创建人，普通用户仍保持同租户及创建人不可变。候选与completion范围检查合并在BEGIN/ROLLBACK中，平台全部租户回场、空驶校验及返回值通过，全部回滚。tms-execution-platform-completion.sql为待部署契约；仍需新建记录操作者审计断言、普通伪造创建人/不可变/选定租户回归、依赖检查和备份后再发布，当前线上结构未变。

- 2026-10-25 创建人与回场范围修复已部署：备份before-mileage-creator-scope.json并fresh核对两函数未变，事务更新创建人ID外键、受canonical范围保护的实际操作者触发器、回场前置范围校验。部署后三组回归通过：vms-mileage-creator-identity（平台全部/指定、本租户真实操作者、外租户拒绝、普通伪造头/创建人、不可变）、tms-execution-platform-completion、tms-execution-completion-scope。所有测试数据回滚。线上允许授权平台管理员跨租户登记而不冒用业务租户员工；普通用户未获得跨租户权限。油耗字段与前端尚未接入。

- 2026-10-25 油耗回场接口候选已验证：三个可空升数字段接入既有completion函数、执行记录、事件审计payload和安全上下文record；旧六参数调用仍可省略新参数。负数/非有限值及负耗油提供中文23514校验，表约束兜底。tms-execution-fuel-roundtrip.sql在候选事务内普通用户回场100+30−100三字段返回一致，原空驶上限拒绝仍生效，全部回滚；未部署，前端未修改。完整候选保存在executionFuelCandidate会话状态，须补状态幂等、全部租户/指定租户、空值兼容、字段展示及报表聚合后再发布。

- 2026-10-25 油耗候选回归扩展通过：负升数、NaN、Infinity、回场余油超出可用油量均拒绝；成功回场后重复提交不同油量不会覆盖原值，也不会重复写完成事件；旧六参数请求仍成功且三项油量返回NULL。测试修正为同时清空回场字段以满足既有完整性约束，未关闭约束。所有测试仅在候选BEGIN/ROLLBACK内执行，线上仍未部署油耗字段。

- 2026-10-25 油量登记已部署：before-execution-fuel.json备份旧回场与raw上下文，核对回场无并发修改后事务增加三个numeric升数字段/约束，替换为九参数默认兼容RPC并显式撤销PUBLIC/anon、授权authenticated，执行事件与上下文返回油量。部署后油量往返/非法输入/幂等/旧调用及回场范围回归通过。前端types、API映射与回场ArtForm接入选填油量和中文平衡校验，ESLint、格式与UI audit通过，类型检查95695仍运行。报表聚合、两条持久化油量与真实/模拟视觉验收尚未完成。

- 2026-10-25 油量前端完整类型检查95695退出0。tms-empty-mileage浏览器回归73148退出0（1项）：空驶超限拒绝、100+30小于131余油拒绝且零提交、修正回场100后提交三个正确升数字段。格式/ESLint通过。已人工查看1440×900截图，油量字段和底部固定操作栏完整，照片/备注在弹窗内部滚动区；这是fixture浅色桌面证据，不能替代真实数据、深色或窄屏验收。

- 2026-10-25 单车油耗报表候选按已选订单范围的有效运单ID去重，读取完成执行记录，完整油量与正里程才返回consumed_fuel_liters/fuel_per_100km；不是采购油费换算。tms-report-fuel-consumption.sql候选事务验证两辆30/100×100=30与50/200×100=25，缺加油量返回NULL，通过且回滚。候选fuelReportCandidate未部署，尚需重复/重叠执行里程、租户和源权限回归以及前端列与口径说明。

- 2026-10-25 油耗候选补齐区间回归：同车1000–1100与1050–1250重叠时不聚合；改为相邻1000–1100和1100–1300时按(30+50)/(100+200)×100=26.67加权，非两个油耗率平均；缺油量仍NULL。完整候选事务验证通过，车辆归属/里程修改全部回滚。未部署报表候选，租户与来源权限专项仍待补齐。

- 2026-10-25 油耗报表已部署并接入单车页面：before-report-fuel.json备份，fresh定义一致后发布；数值/缺失/重叠/相邻加权回归及authenticated租户/来源权限回归部署前后通过。普通用户伪造外租户头仍读自身，super指定外租户无记录，撤销执行来源权限后两项油量指标NULL，测试权限与数据均回滚。新增耗油量和百公里油耗列、完整口径说明；格式/ESLint通过，实际两条油量案例与页面视觉验收仍未完成。

- 2026-10-25 两条油量真实案例已持久化：before-fuel-fixtures.json备份原执行记录；先回滚验证，再按已授权测试数据重置缺失回场标记，通过既有回场RPC补录油量并保留原回场日期、里程及照片，事件留下补录说明。测A验收001出车100+加油30−回场100=30升/100公里，测A验收002为100+50−100=50升/200公里；提交事务内报表分别断言30、25通过，提交后独立读取确认三项油量及完成记录。真实页面视觉验收仍待登录恢复。

- 2026-10-25 新增单车油耗展示E2E，35125三项通过（desktop-1440、tablet-1024、desktop-dark-1440）：30/50升、30/25 L/100km列值与查询后NULL→待核算正确。主题参数显式按项目名设置。人工复核1024浅色与1440深色截图，固定车牌、油耗表头/两行与分页可读，表格横向滚动不扩展页面。格式/ESLint通过；这些为模拟接口截图，真实登录会话页面验收仍待完成。

- 2026-10-25 司机投入产出缺项核对：现有fms_payroll_line以earning_items/deduction_items/employer_cost_items JSON对象保留薪酬项目。两条验收已审明细为基本6000+绩效2000/3000、测试扣减200/300、雇主社保1200/1300；当前不能把绩效映射提成、测试扣减映射违章或事故。现有tms_driver_payroll_rows通过secure JSON及FinancePayroll权限只输出总额，分类列尚未实现。后续应在既有薪酬项目中明确业务分类后聚合，保留缺分类待核算，不用总扣减伪造专项扣款。

- 2026-10-25 薪酬分类源入口发现确定性问题：payroll-line-dialog.vue提交固定earningItems={gross:总额}、deductionItems={deduction:总额}、employerCostItems={employerCost:总额}，编辑任何已有分类明细都会覆盖分类。API已支持Record<string,number>项目结构，故应修复现有编辑器按项目维护并自动汇总，而非新建平行薪酬模块或只在报表猜测分类。当前仅核实问题，尚未改动此编辑器；后续必须验证编辑保留未知既有项目、分类合计与总额一致、字段权限及两条薪酬流程。

- 2026-10-25 新增薪酬项目领域模型payroll-items.ts，保留既有名称、纯总额旧记录明确未分类、Decimal精确合计；阻止重复规范化名称、负值/非有限/缺金额、脱敏源和分类合计不一致。三项单测通过，含历史未知分类保留、修改不污染源对象及0.1+0.2。模型尚未接入payroll-line-dialog，原覆盖分类问题尚不能视为修复；下一步改编辑器按项目维护。

- 2026-10-25 薪酬原编辑器已接入项目模型：收入/扣款/企业承担三组ArtForm逐项维护、自动汇总只读金额、保留历史命名，保存不再固定gross/deduction覆盖分类。新增PayrollItemsEditor复用三组，添加/移除是未提交表单行并遵循FinancePayroll:Calculate。格式/ESLint通过，类型10710运行中，浏览器与真实薪酬流程仍待验证；司机报表分类尚未接入。

- 2026-10-25 薪酬分类后续验收：修复 ArtForm 更新事件类型，vue-tsc 42711 通过；编辑保留历史分类与重复项目拦截/修正流程浏览器通过。显式主题初始化后验证 1024 浅色、1440 深色及下方汇总/备注/固定保存按钮，截图为模拟接口验收，不能替代登录后的真实页面验收。
- 2026-10-25 司机薪酬分类已部署：tms_driver_payroll_rows 从安全 JSON 同名项目读取提成、违章扣款、事故扣款；任一来源月份缺分类则 NULL，明确零金额返回 0；提成和专项扣款均已含于原总额，不重复计入成本。备份 before-payroll-classifications.json；部署前后 tms-driver-payroll-classifications.sql 回滚通过，页面新增三列及口径说明，展示回归和 UI 审计通过。安全顾问无 ERROR，仍有原五类提示。
- 2026-10-25 新增 10 月工资验收批次 XZ202610-0004，普通授权用户经 save_fms_payroll_run_secure、save_fms_payroll_line_secure、act_fms_payroll_run_secure 完成两名司机明细及审核。应发 17000、扣减 500、企业成本 2500、实发 16500；提成 1800/2800，违章 100/0，事故 0/200。先事务回滚验证再提交，before-october-payroll-fixture.json 记录原无该月批次；9 月已审工资未改。tms-driver-payroll-workflow.sql 重复运行经安全列表 RPC 读取既有批次并验证报表，已通过；普通用户不能直接读取工资表，测试未放宽权限。
- 2026-10-25 tms-driver-payroll-permissions.sql 通过：authenticated 普通用户伪造外租户头仍读取自身两名司机分类，无角色用户被拒绝。真实 Chrome 应用再次确认停留登录页，未执行登录绕过。司机日常运营已有两条 9 月 10 日考勤事实（480/465 分钟，正常/迟到），尚未封账；出勤天数接入仍须区分事实、异常与核算口径。

- 2026-10-25 修复司机运营报表考勤来源权限：原 tms_operational_report_rows 直接聚合 hr_attendance_record，在移除 Hr:Attendance:View 后仍返回其他员工状态，回滚测试已复现。现沿用来源权限（平台超管、考勤查看或本人）并保留 canonical 租户约束；before-attendance-report-permission.json 备份，候选事务验证及部署后验证通过。tms-driver-attendance-source-permission.sql 覆盖普通自身/伪造范围、super 全部/本租户/外租户和撤销来源权限；授权状态正常/迟到保留，无权限状态 NULL。页面不可读取显示待核实，避免误称未登记。三种视口主题的模拟接口 E2E 通过，ESLint/UI audit 通过；真实应用登录后验收仍未完成。类型检查 47683 已通过。

- 2026-10-25 出勤天数已接入司机投产出：工作日期去重，实际工时大于零且该日异常均 clear 才计已核算出勤；待处理异常和记录日期数分列，不等同标准工日或完整封账月。before-driver-attendance-days.json 备份，tms-driver-attendance-days.sql 候选及部署后通过，覆盖正常1/异常0+待处理1、无记录NULL、撤销来源权限NULL；浏览器桌面/平板列值与缺失态通过。共享报表42项全部通过（98115），vue-tsc 15990通过，reuse audit 2207源文件通过。月度人力旧缺月断言改为先验证9—10月34000，再在回滚事务内临时置10月草稿验证缺月NULL；工资分摊、月度人力、去重headline均通过。
- 2026-10-25 真实报表覆盖审计（9月1日—10月31日、主租户、authenticated平台选定范围）：月总览2、应收2、单车5、线路4、司机投产出4、订单14、客户4、风险8、KPI6、在途7、调度7、司机运营7、异常2、回单14、承运商3。证据 real-report-row-audit.json 仅证明每页可读取至少两行，不证明字段齐全或全流程/视觉验收。仍有工资/保险/折旧来源覆盖不足导致核算NULL、催收和统一风险分级缺项、异常责任人样例为空；不得据此标记目标完成。

- 2026-10-25 责任人异常案例已持久化：942b3ca3-bf8d-414d-8794-76d6061d062e、bffeb4cc-37fe-4331-9055-4d2daff2bcdc，前缀[责任人流程验收20261025]，同租户跟进人，经普通授权用户create/start/resolve/close接口闭环；货损及理赔均0，每条4步历史，报表返回跟进人。原两条结案工单未改。before-responsible-exception-fixtures.json备份前置不存在证据；先回滚验证再提交，提交后独立确认2/2有效。tms-exception-responsible-workflow.sql验证两条指定跟进人闭环及外租户跟进人拒绝。旧人工风险测试改为检查原指定两条ID，未放宽数量；两个无工单场景测试在回滚事务内同时隔离新旧验收前缀，断言不变，人工风险/异常摘要/人工异常/历史读取均通过，最后确认持久化案例仍2条完整。

- 2026-10-25 应收默认账龄风险已部署并在应收跟踪/经营风险汇总共用：未逾期至29天低、30—89天中、90天起高；无未结余额和贷项低，缺日期或金额权限不评级。前端明确这是跟进优先级而非坏账概率，其他风险类型仍未配置统一分级；催收记录仍未接入。before-receivable-risk-grade.json及before-risk-receivable-grade.json保存原函数。tms-receivable-risk-grade.sql候选及部署后回滚通过，覆盖0/29/30/89/90、缺日期及贷项，跨两报表分级一致。tms-receivable-risk-field-permission.sql以临时仅报表角色、authenticated执行，金额隐藏时amount/days/risk_level均NULL，风险表不生成应收逾期项；伪造外租户头亦通过，角色变更全部回滚。浅色/深色两页展示回归通过，未评级明确显示；ESLint/UI audit通过，真实登录视觉验收仍待完成。

- 2026-10-25 催收后端候选新增 tms-receivable-collection-workflow.sql，候选 BEGIN/ROLLBACK 验证两笔财务应收写入与历史读取、继承父单租户、未来联系/倒置跟进日期拒绝、平台指定异租户读写拒绝、本租户可读、无权限用户读写拒绝、原始表不暴露及历史不可覆盖/删除均通过。测试全部回滚；催收表、接口和按钮尚未部署，普通授权用户正向流程与前端录入/历史尚待完成。

- 2026-10-25 催收普通用户权限候选回归通过：tms-receivable-collection-permissions.sql 在回滚事务中注册两个按钮并授予验收角色，普通自身及伪造外租户头可登记/查看；撤销登记后保留查看，删除按钮定义仍拒绝写入。核实 can_execute_business_action 存在按钮未注册即兼容放行，因此本候选改为 can_access_business_menu 加显式 has_permission（平台超管除外），不改全局兼容函数。原两单/平台范围/历史不可覆盖回归再次通过。按钮目录源码加入 AddCollection/ViewCollection，历史抽屉组件已编写但尚未接页面；格式、ESLint、UI audit 通过，尚无浏览器视觉证据。所有数据库变更仍回滚未部署。

- 2026-10-25 应收页面接入登记催收/查看历史两个独立权限入口，新增 ArtDialog+ArtForm 登记实际联系时间、方式、沟通结果和下次跟进，保存刷新表格。浏览器模拟接口测试75960三项通过（1440浅色、1024、1440深色），覆盖保存、历史503错误及重新加载；首次失败系测试错误匹配重试，实际共享组件按钮为重新加载，修正后通过。人工查看深色历史截图标题、时间、记录与操作人可读。默认4GB类型进程43501因OOM失败，8GB重跑42792退出0；ESLint及UI audit通过。催收后端和按钮仍未部署，表格摘要collection_record尚未接数据，真实两条案例和实际登录视觉验收未完成。

- 2026-10-25 催收后端及按钮已部署：before-receivable-collections.json 保存原报表函数及表/接口/按钮不存在证据，部署前fresh定义一致并验证备份可读。事务创建仅RPC访问的追加式催收历史表、显式按钮及金额权限检查、父单租户继承、两个安全RPC、最近联系摘要和两个按钮，给原验收角色授予两项权限。提交后工作流、普通用户权限、截止日摘要三组回滚测试全部通过。摘要按上海日期截止日显示最近联系，隐藏金额或无历史权限时NULL；抽屉为全部历史。尚未持久化两条催收验收记录，真实页面视觉验收未完成。

- 2026-10-25 两笔催收真实数据库验收记录已持久化：AR-F-202610-007/008分别模拟电话核对6000、现场沟通核对4000，约定10月28/29日跟进，统一前缀[催收流程验收20261025]。before-collection-fixtures.json备份原两单均无历史；普通授权用户通过新增RPC登记，安全历史与报表摘要均断言一致，先ROLLBACK验证再COMMIT。记录明确标记模拟，不代表实际对外联系。提交后独立查询确认父单租户和实际操作人；页面真实登录视觉验收仍未完成。

- 2026-10-25 客户策略来源核查：当前 mdm_customer/tms_customer 只有通用remark，没有strategy/improvement字段；跨src/modules源码搜索也未找到现成维护入口，不能把通用备注直接改名充当策略。现有mdm_receipt_condition具有due_days，可为账期字段提供明确来源；tms_contract当前没有结构化账期字段。后续需在客户经营复盘边界维护策略/改善措施，再接客户报表，保留主数据备注含义。整组44项浏览器回归83245仍运行，尚未宣称通过。
- 整组报表浏览器回归83245已退出0，desktop-1440共44项通过（3.1分钟），包含催收保存/重试与15页筛选等；接口为模拟数据，仍不替代真实登录验收。

- 2026-10-25 应收约定账期天数已接入现有收款条件due_days，不由到期日期反推；缺条件返回NULL，前端显示未约定，与逾期天数独立列示。before-receivable-payment-terms.json备份原函数，fresh一致后部署。tms-receivable-payment-terms.sql在回滚事务临时设置45天/无条件两个样例，普通用户伪造租户头仍读取自身正确结果，部署前后通过。未改持久化收款条件或应收事实；客户聚合账期和策略仍需后续处理。

- 2026-10-25 客户账期聚合候选：复用期间财务应收的payment_term_days，统一值显示天数，完整多值显示范围，缺失显示未约定/部分未约定，无单据显示无期间应收。tms-customer-payment-terms.sql在候选事务内验证45天及部分未约定通过；客户/条件修改全部回滚，候选尚未部署，仍需多值、无单据和authenticated角色验证及页面接入。

- 2026-10-25 客户账期聚合已部署并接客户毛利表列。before-customer-payment-terms.json备份完整公共报表函数，fresh定义一致后提交。扩展回归覆盖45天、45—60天多种账期、部分未约定、未约定、无期间应收；多账期读取切换authenticated普通角色且伪造外租户头，部署前后通过，所有来源修改回滚。ESLint通过；该新增列尚待浏览器展示验收，客户策略/改善措施仍未实现。

- 2026-10-25 客户账期列浏览器回归60023三项通过（1440浅色、1024、1440深色），验证多种账期/部分未约定，以及查询后45天/无期间应收。人工查看1024截图：客户固定列、账期完整文本、同排查询按钮和分页均可读，横向滚动限制在表格内。ESLint与UI audit通过；这是模拟接口视觉证据，真实登录验收仍未完成。

- 2026-10-25 客户经营复盘开始实现：再次核对公开表及源码无现有策略维护能力。新增customer-operating-review.ts API边界，按客户及查询起止期间读取/保存策略和改善措施，expectedUpdatedAt用于后续并发覆盖保护；返回DTO逐字段验证，使用共享文本规范化。格式和ESLint通过。当前仅API契约，两个RPC尚不存在、没有UI调用；后续须实现租户/按钮权限、并发校验、数据表、报表联动及两条真实案例，不能视为功能完成。

- 2026-10-25 客户经营复盘候选工作流验证通过：新增 tms-customer-operating-review.sql，候选建表和两个安全RPC均仅在BEGIN/ROLLBACK中执行。authenticated普通用户伪造外租户头仍按自身客户范围，对两名客户完成新增、修改、读回；旧版本及重复创建被拒绝，跨期间不串数据，倒置日期/空白策略拒绝，撤销EditReview后保留读取但不能写入，原始表写权限未开放。全部测试数据和DDL回滚，线上仍未部署；尚需平台全部/选定范围及异租户专项、审计字段规范、报表联动、维护窗口和实际视觉验收。候选保存在会话customerReviewCandidate，不生成迁移文件。

- 2026-10-25 客户经营复盘租户专项通过：新增tms-customer-review-scope.sql，authenticated平台全部范围新增/修改、选定本租户读写、选定外租户读取/新增/修改拒绝、无业务角色拒绝均在候选事务验证。独立断言父客户租户及实际平台操作者正确；候选补入项目标准create/update审计字段和既有触发器后，两组回归再次通过，全部回滚未部署。新增operating-review-dialog.vue沿用ArtDialog/ArtForm，加载错误可重试、请求版本保护、保存失败保留输入；格式、ESLint和UI audit通过。该窗口尚未挂接客户页，尚无浏览器验收，后端和按钮仍待部署，不能视为客户策略功能已交付。

- 2026-10-25 客户经营复盘已部署并接入客户毛利页：before-customer-operating-review.json保存原33429字符报表函数及新增表/按钮不存在证据，fresh定义一致后事务部署表、标准审计触发器、安全读写RPC、EditReview按钮和既有验收角色授权。报表按客户及查询起止日期精确关联策略/改善措施，页面新增两列和独立权限操作。部署后普通用户工作流、平台范围、报表联动三组回滚测试通过。安全顾问无ERROR，仍有既有五类提示。类型检查49570发现按钮错误导入已修正，84858随后退出0（早于最后按钮运行时状态修正）。
- 客户复盘浏览器首次42102三项失败，定位加载重试成功后ArtDialog确认禁用选项未动态恢复；改用setOptions更新confirmDisabled后38864三项通过（1440浅色、1024、1440深色），覆盖加载失败重试、新增保存及再次编辑。人工查看1024截图，客户/期间、两个文本区和底部操作完整可读。格式/ESLint/UI audit通过。这仍是模拟接口视觉证据；两条持久化复盘案例、保存失败/并发冲突的前端恢复和真实登录页面验收仍需补齐，整体目标未完成。

- 2026-10-25 两名实际验收客户的经营复盘已持久化：华东a9fc0001…0001、华北…0002，期间2026-09-01至10-31，记录d489a48c-dc6f-4b86-afb4-92797fdcb1c5与dd9698aa-f503-4b6a-bc07-9e08d6c6fd29。before-customer-review-fixtures.json确认原无记录；普通授权用户经保存RPC新增再修改，读回及报表一致，先ROLLBACK验证再COMMIT。独立查询确认父客户租户及实际actor_id正确；create_by为unknown源于SQL验收JWT未携带email，现有通用创建触发器以JWT email取值，未改通用审计规则。tms-customer-review-fixtures.sql以authenticated普通用户及伪造头再次读回两条并核对报表通过。
- 客户复盘补齐保存错误内联反馈：保留填写，明确提供“放弃本次填写并重新加载”，不会自动覆盖草稿。扩展E2E模拟40001冲突，断言输入保留、主动加载最新内容、携带最新版本保存；67006在1440浅色、1024、1440深色三项通过。格式/ESLint/UI audit通过。真实登录页面验收与最后全量类型复验仍未完成。

- 2026-10-25 非应收经营风险分级候选：保留应收账龄口径，对人民币且金额可见的事项按不足1000低、1000至不足10000中、10000起高，单列默认金额分级依据；人工工单仅已解决/已结案后使用核实金额，待处理默认零值不得评级，未知/非人民币不评级。新增tms-risk-amount-grade.sql通过真实异常创建→处理→解决→结案RPC验证0/999.99/1000/9999.99/10000边界及未核实工单不评级，authenticated普通用户伪造外租户头仍在自身范围。候选仅BEGIN/ROLLBACK执行，未部署；尚须事故/违章字段脱敏及其他币种回归、页面分级依据、备份发布与视觉验收。

- 2026-10-25 非应收风险分级补违章字段权限专项：主验收租户当前有两条违章、零条期间事故。首次使用原普通验收账号失败，核对发现其为记录创建人，现有field_access_map允许本人记录金额，不能拿菜单最小权限推断逐记录隐藏。改用同租户且不拥有记录的9850…账号，回滚事务临时仅授予经营风险报表；两条违章风险金额/等级均NULL且依据不足，伪造外租户头结果一致。tms-risk-violation-mask.sql通过，角色变更已回滚。风险分级候选仍未部署，事故案例和页面展示仍待完成。

- 2026-10-25 事故风险候选新增tms-risk-accident-flow.sql。首次平台全部范围创建真实车辆事故RPC失败，已定位app_private.set_vehicle_accident_creator_identity强制创建人与事故同租户，与平台跨租户操作契约冲突；未放宽规则或把该失败算通过，后续需单独修复并验收。改为本租户普通授权用户验证两条1500/12000事故新增→标记已处理→经营风险报表，以及同租户非创建人仅报表权限下金额/分级隐藏，普通伪造头一致；候选及数据全部回滚，风险分级仍未部署。测试首次CASE表达式解析问题已加括号修正。

- 2026-10-25 车辆事故创建人跨租户修复已部署：原creator_tenant复合外键和触发器强制同租户，导致平台全部范围创建事故失败。before-accident-creator-scope.json备份原触发器与约束，fresh定义一致、无孤儿创建人后改为操作者ID外键；认证操作者必须处于canonical可写范围，普通同租户、平台可按车辆父记录租户创建，自动记录真实操作者；创建人及所属租户不可修改，保留原无认证后台同租户导入规则。候选下平台真实事故新增/标记处理/报表及脱敏流程通过；vms-accident-creator-identity.sql覆盖平台全部/指定、自身/伪造创建人/外租户拒绝/创建人不可变，部署前后通过。所有验收事故均回滚；风险金额分级候选仍未部署。

- 2026-10-25 非应收风险默认金额分级已部署：before-risk-amount-grade.json备份31150字符旧运营报表函数，fresh一致后发布。应收账龄回归候选通过；发布后金额边界/人工未核实不评级、违章非本人金额隐藏、两条事故新增处理与脱敏三组回滚测试通过。页面增加分级依据并说明默认金额阈值仅作金额维度参考，不代表事故安全严重程度或人工综合评估。18221浏览器三项通过（1440浅色、1024、1440深色），等级、依据不足及未评级显示正确，横向滚动不扩展页面；人工查看1024截图。格式/ESLint/UI audit通过，安全顾问无ERROR仍有五类既有提示。尚未创建持久化事故案例，真实登录页面验收及全量最终检查未完成。

- 2026-10-25 两条事故案例已持久化：ac9499e3-296f-4629-a109-e6ba362f4e12、6b01effc-f7d0-42b1-97f2-6e1a4f56c406，前缀[事故流程验收20261025]，分别关联验收车辆/司机001和002，模拟公司承担1500/12000。before-accident-fixtures.json保存原无案例证据；普通授权用户经既有事故创建/修改RPC从未处理到已处理，风险报表中/高及司机运营事故数断言通过，先回滚再提交，提交后独立核对实际创建人、租户、车辆司机及处理状态。记录明确标注模拟，不代表真实事故。事故脱敏回归改为严格核对本次创建的两个ID，避免持久化案例影响全表数量，修改后再次通过。真实登录页面流程与视觉验收仍未完成。
- 2026-10-25 报表最终检查阶段（尚未完成业务验收）：vue-tsc 会话65813退出0；reuse:audit通过2214个前端文件，ui:audit通过725个主仓库及1531个模块UI文件。desktop-1440整组48项回归16671为47通过、1项浏览器context关闭超时；该项为空态/延迟/失败重试/专注模式，保持原断言单独复跑5227通过。15页两条模拟记录、筛选、明暗主题和专注模式均在整组通过；人工核对最新monthly-overview-light截图，查询同排、图表压缩及表格分页可见。以上为模拟接口证据，不替代真实登录业务流程。实际Chrome标签重新出现在工具清单，但获取标签仍超时；真实页面验收未完成。重新读取标星记录确认常用线路、单据类型等参考；违章表仍只有driver_name且原页面只读，无driver_id及维护入口，司机违章归属仍是未解决项。
- 2026-10-25 违章来源读取范围修复：核查司机关联时发现vms_list_vehicle_violations_secure以is_platform_super OR条件绕过指定租户。新增vms-violation-read-scope.sql先在旧函数复现指定外租户泄漏，再以canonical tenant_in_current_read_scope替换该条件，候选事务验证通过。before-violation-read-scope.json保存完整原函数，fresh定义一致后直接部署；部署后authenticated角色验证平台全部/指定本租户可读两条、指定外租户列表与导出均为空，普通自身及伪造头仍限自身通过。未改业务记录、字段权限或写权限。司机ID关联及真实页面最终验收仍未完成。
- 2026-10-25 违章司机关联候选验证：确认tms_driver为mdm_driver视图，复用mdm_driver(tenant_id,id)唯一键；候选增加可空driver_id复合外键和期间索引，保留driver_name历史内容。vms_link_violation_driver_secure按实际记录租户、VehicleViolation:LinkDriver按钮及driverIdentity编辑权限校验，update_time防止旧版本覆盖；司机必须同租户且启用。安全JSON在hidden/masked时同时移除driver_id。新增vms-violation-driver-link.sql在候选事务对两条现有验收违章关联、保留历史姓名、旧版本拒绝、无效司机拒绝、字段脱敏和撤销按钮权限拒绝验证通过；全部DDL/关联/临时授权已回滚，候选仅保存在会话violationLinkCandidate。尚未部署、未增加页面入口或报表汇总，也未完成平台全部/指定及跨租户关联专项。
- 2026-10-25 违章司机关联候选补租户专项：vms-violation-driver-scope.sql以authenticated平台账号验证全部/指定本租户可按既有记录关联、实际外租户司机拒绝、指定其他租户不得修改该记录，以及无角色账号拒绝；候选DDL和修改全部回滚，未部署。VMS provider增加typed关联API与driverId DTO，沿用responseHandle，尚无页面调用；不视为已上线。后续仍需页面选择、司机报表统计、持久化两例及浏览器验收。
- 2026-10-25 违章司机关联后端已部署：before-violation-driver-link.json备份原安全JSON函数及列/按钮不存在状态，fresh一致后增加driver_id同租户外键、期间索引、关联RPC和LinkDriver按钮及验收角色授权。DTO新增linked_driver_name，权限隐藏/脱敏时不输出司机ID；部署前后关联/冲突/字段权限及平台租户专项均通过。VMS车辆违章页增加原登记姓名、已关联司机与纯图标操作，使用已有VmsDriverSelect及小型ArtDialog，保留历史姓名，失败保留选择。格式、ESLint、UI audit通过；类型检查55825仍运行。未持久化两条关联，司机报表仍待接入，真实页面及窗口视觉验收未完成。会话violationLinkCandidate为已部署定义，不得重复执行ADD COLUMN。
- 2026-10-25 司机违章汇总已部署：before-driver-violation-report.json备份运营报表函数，fresh一致后将司机台账violation由固定NULL改为司机ID+发生日期统计；按租户检查来源完整性，期间存在未关联或身份字段不可读时返回NULL而非假零，页面口径同步说明。tms-driver-violation-source.sql通过实际关联RPC验证两名司机各1条、空期间0、撤销关联后待核实、仅报表权限用户不得从数量反推隐藏司机身份，候选及部署后均通过且回滚。随后备份before-violation-link-fixtures.json，两条既有模拟违章0001/0002通过普通用户RPC分别关联同后缀司机；先回滚验证再提交，独立核对同租户及历史姓名保留。会话violationLinkSeed已提交，不要重跑。VMS关联页类型检查55825退出0，司机页文案格式/ESLint通过；浏览器选择/保存流程和视觉验收仍未完成。
- 2026-10-25 真实浏览器违章关联验收：旧标签Debugger unattached后使用同Chrome新标签909849874恢复连接，无需重新登录。实际车辆违章读取两条数据；第一条打开选择器、确认原司机并保存成功；第二条清空关联已写入DB，但窗口确认加载未及时结束，刷新后明确显示未关联（原因仍待查，不算无异常通过）。随后重新选择验收司机2、确认保存，窗口自动关闭，列表两条关联正确。司机选择器可读取7条本租户选项，原登记姓名保留。原尺寸和1024覆盖下窗口标签、选择框、说明及页脚可见，viewport已reset。截图.artifacts/tms-reports/live-violation-linked.png；第二次保存顺利，不代表已排除前次响应挂起。完整15页真实流程及剩余验收仍未完成。

### 2026-10-25 报表页签改造后的完成度复核

以下清单区分当前已取证项和最后仍需核验项；下方按时间记录的“未完成”描述是当时状态，后续修复记录优先，不应反复创建已存在的来源或测试数据。

| 页面 / 范围 | 已有验收证据 | 最终状态 / 剩余核验 |
| --- | --- | --- |
| 月度经营总览 | 两月收入、年度汇总、两项预算读取与原值保存、图表切换 | 已取证；纳入当前完整回归 |
| 应收账款跟踪 | 两笔应收及部分核销、催收业务记录；第一笔历史复核 | 已补验第二笔真实催收历史：4000元、10月29日跟进，抽屉内容完整 |
| 单车盈亏 | 两车订单双向下钻、九月完整成本、十月缺来源 | 已取证；保留完整与缺失两种场景 |
| 线路盈亏 | 两线路三单下钻，箭头关键词服务端修复及租户回归 | 已取证；旧空图缺陷已解决 |
| 司机投产出 | 两司机工资、订单与车辆联动 | 已取证；纳入当前完整回归 |
| 订单毛利 | 两单详情、两单九月完整核算、表格和图表金额一致 | 已取证；不是所有期间均完整核算 |
| 客户毛利 | 两客户复盘来源及业务实现 | 已真实保存本期两客户复盘并重新打开确认回显，弹窗视觉通过 |
| 经营风险 | 事故、违章、人工异常来源与权限回归 | 已实测两条人工风险关联订单下钻；事故违章当前仅展示来源，不能声称支持其详情跳转 |
| 运营 KPI | 六项指标及缺来源处理，真实页面六行可见 | 已取证；缺来源不按零值处理 |
| 订单在途 | 两单车辆司机关联、异常历史标识、详情下钻 | 已取证 |
| 车辆调度 | 两笔计划真实保存、任务冲突回归、位置来源回归 | 已取证；位置模拟样例只在事务内验证 |
| 司机日常运营 | 九月执行、考勤、里程、签收与回单来源 | 已实测九月两司机，100/200km、各1签收及1回单，考勤正常/迟到 |
| 订单异常 | 两工单双方处理四节点及真实历史抽屉 | 已取证 |
| 回单跟踪 | 两笔缺失原因和跟进真实保存、并发与重试 | 已取证；未篡改回单回收事实 |
| 外包运力考核 | 两承运商分数、等级、数量与图表一致 | 已取证 |
| 视觉及代码门禁 | 15页定向回归、真实页签截图、类型与审计阶段记录 | 当前完整回归会话42400待结果；全库体积及FMS权限门禁仍未通过 |

这张清单是剩余工作导航，不是整体完成声明。自动模拟接口回归不能替代上表明确列出的真实业务核验。

- 月度预算真实复核：Chrome默认9月1日至10月25显示9月208838.70、10月70370.25，共279208.95，年累计505964.99；表格切换图表后两月数值一致。打开预算维护，分别读取并原值保存十月订单预算10/目标12、收入预算80000/目标100000，两次窗口正常关闭；预算执行对比显示实际订单8/差异-2/年累计26、收入70370.25/差异-9629.75，说明明确整月预算对月初至截止日。实际截图检查预算双列数值、说明区和页脚、两月横向图表，未发现遮挡。未更改原预算数值，也未把缺成本依据的待核算结果改为零。
- 最新构建归因：会话6750退出0，构建4分46秒，输出`.artifacts/tms-reports/build-audit`，未重写docs。新bundle:check仍5项超限（普通大分包1.11MiB、普通总量26.82MiB、JS总量48.70MiB、gzip14.26MiB、首屏1.64MiB）。新visualizer定位assets/DNO2ze5N.js内最大模块为@cloudbase/js-sdk约916144 rendered bytes，其次Supabase Auth、bson、CloudBase wx SDK及streams；包含src/api/auth.ts，属于认证/后端客户端依赖聚合。此证据定位大分包来源，不证明全部总量超限都由它造成；未修改并行认证工作或提高阈值。分包树保存忽略目录large-chunk-tree.json。
- 运营KPI/在途真实复核：KPI默认10月19—25显示6项、已核算4、达标3、待核算2；表格显示装载率40.01%未达标、到货准点率100%、货损率0%、应收周转1.75天，空驶及回单缺来源为待核算，截图六行、口径列及分页均可见。这里仅验证展示与缺失处理，不将所选期间缺来源宣称已补齐。在途日报查询10月1—25及“报表验收”返回009/010两单，分别关联001/002车辆和司机、10吨20方、运输中、待回收；异常原因同时保留系统超时及已结案人工工单，并明确标注历史状态。009点击进入实际详情，对应VMS-QA-YD7、司机1/车辆001、运输中正确。
- 运营真实页面补验：外包运力考核查询2026-09-01至10-25返回3家，两家验收承运商各4票，华东80分/B、华北10分/D，第三家缺回单依据保持待核算；表格/图表切换保留期间，图表分别呈现承运4/4/7票、签收完成3/3/3票。修复该页静态“前6家”副标题为实际图表对象数，实际浏览器确认“本期3家”，ESLint通过。异常台账同期间4条已结案工单，分别打开009/010两笔原始验收工单的处理历史，均有登记、开始处理、登记结果、确认结案四节点，第一笔货损100/理赔80，第二笔0/0；真实截图检查抽屉时间线、金额及关闭按钮可见，无溢出。此次复核历史结果，不冒称重新创建和结案。
- 线路关键词缺陷已修复：备份当前33752字符RPC到before-route-keyword.json并核对fresh一致，给5处财务/车辆费用/执行统计关键词匹配补入同一“起点 → 终点”组合，保留原关键词及权限范围。新增tms-report-route-keyword.sql，部署前候选回滚、部署后回滚均验证两条线路分别3单，列表/趋势均3项，营收36000/24000，普通伪造租户头及平台指定外租户不泄漏。未修改业务数据。实际Chrome重新查询上海→北京后图表显示005/007/009三项及36000汇总，原空图问题消失；不是沿用旧缓存作证据。
- 线路下钻发现未解决缺陷：实际Chrome点击“上海 → 北京”后，短暂可见缓存订单005/007/009，切换图表并再次查询后为空。当前RPC financial关键词拼接只有起终点空格分隔，没有“ → ”格式，不能匹配页面传入的完整线路；因此早期缓存行不能作成功证据。需修复服务端统一关键词匹配并回归列表/汇总/图表，线路链路未验收通过。另5个盈亏图表副标题已改为chart.labels.length动态对象数，修复筛选1条仍写6个对象；ESLint及UI audit通过，真实页面已呈现动态数量。
- 真实车辆/司机双向追溯验收：Chrome从订单005点击车辆001，查询自动带入车牌及2026-10-01至25日期，汇总3票/营收36000/已归集成本27000/毛利9000；点击车牌返回005/007/009三单。再由005下钻司机1，汇总一致且工资8000、雇主承担1200可见。筛选司机2后汇总3票/24000/28500/-4500，点击司机返回006/008/010三单，再点击车辆002，汇总一致。车辆002表格/图表切换保留车牌及期间，实际截图检查查询单排、内容独占、分页与横向滚动条可见。仅证明这两组订单—车辆—司机联动，不等于所有报表流程通过；10月折旧、里程等来源不足仍明确待核算。
- 订单验收字典数据修复：确认系统配送方式为pickup/station/door，8笔固定前缀测试订单原delivery无对应字典。`before-order-fixture-labels.json`备份并解析确认8行，事务回滚验证后仅按8个明确ID、原值及租户匹配更新为door；create_by改为“报表验收模拟导入”，没有冒充真实员工。提交后独立查询8行一致。实际Chrome重新打开YD202610-005，字典加载后截图确认“送货上门”和“报表验收模拟导入”中文显示。未改金额、状态或业务关联。
- 真实订单下钻补验：当前登录 Chrome 从订单毛利分析分别筛选 YD202610-005、YD202610-006，列表各返回1条，营收12000/8000、已归集成本9000/9500、已归集毛利3000/-1500；点击订单号进入各自真实详情，对应基础运费及运费合计一致，第一笔关联运单VMS-QA-YD3、验收司机1和车辆001。核算来源不足仍显示待核算，未用零填充。下钻发现两条测试订单数据库 create_by='unknown'、delivery_method='delivery'，详情直接呈现原值；需核对有效字典并清理测试数据，不能将该链路视为最终视觉验收通过。
- 7 个有图表的经营/运营报表使用“表格明细 / 图表分析”页签，共用筛选，默认表格；15 页浏览器回归覆盖浅色 1440、深色 1024、图表切换与专注模式。相关测试位于 `tests/e2e/tms-management-reports.spec.ts`，截图保存在忽略目录 `.artifacts/tms-reports/pages`。这些接口模拟测试不替代真实业务流程验收。
- 本轮再次以 authenticated 普通验收账号、空租户请求头查询实际 `tms_management_report`，期间 2026-09-01 至 2026-10-31：月总览 2、应收 2、车辆 5、线路 4、司机投产出 4、订单 14、客户 4、风险 12、KPI 6、在途 7、调度 7、司机运营 7、异常 4、回单 14、承运商 3 行。所有报表至少两行；行数不证明每个字段及流程已完成。
- 当前数据库函数仍将调度 `location / expected_return / maintenance_plan` 和回单 `missing_reason` 固定为 NULL。数据库及源码核查未发现预计回场、维修计划、回单缺失原因的结构化维护字段；实际回场时间和通用异常摘要不能冒充这些字段。该部分尚未完成，后续需补明确的业务维护来源及权限闭环。
- `pnpm build` 本轮退出 0（Vite 构建及文件查看器资源同步完成），日志 `.artifacts/tms-reports/final-build.log`。`pnpm bundle:check` 退出 1：普通分包 1.11 MiB > 900 KiB、普通 JS 总量 26.81 MiB > 26 MiB、全部 JS 48.69 MiB > 48 MiB、gzip JS 14.26 MiB > 14 MiB、首屏 JS 1.64 MiB > 1.50 MiB。尚未归因，不能宣称发布门禁全部通过；不调整阈值掩盖问题。
- 完整目标仍未完成：需要补上述来源闭环、逐页真实业务流程验收及发布体积问题归因。不得用本节行数和模拟 UI 检查代替最终验收。
- 2026-10-25 调度最近上报位置已接入：before-dispatch-location.json 保存修改前完整函数，校验可读且 fresh 定义一致后部署。复用运输事件，以同租户车辆/运单关联，排除取消运单、未来时间、空地址及无有效经纬度的事件，按发生时间/ID取最近一条；要求 TmsTransportEvent:View，缺来源权限时地址与时间均为空。页面明确标记最近上报位置及上报时间，不将线路文本或历史位置冒充实时定位。tms-dispatch-location-source.sql 的两个临时位置样例、未来/纯线路排除、普通自身/伪造头、平台全部/指定及仅报表权限检查通过；测试全部回滚，未持久化模拟位置。页面浅色1440/深色1024、筛选与专注模式浏览器回归通过；新列成功值和空值均覆盖，人工检查截图。格式、ESLint、UI audit通过；数据库 advisors 无 ERROR，仍有既有 INFO/WARN。预计回场、维修计划、回单缺失原因及真实录入闭环仍未完成。
- 2026-10-25 回单缺失原因闭环已部署：新增仅安全RPC访问的 app_private.tms_receipt_followup，按订单保存缺失原因、跟进措施、操作人和更新时间；同租户复合外键、父订单锁、expectedUpdatedAt并发保护。明确按钮 TmsReportReceiptTracking:EditFollowup 已注册并授予既有验收角色；普通用户按认证租户、平台按全部/指定范围检查。before-receipt-followup.json备份原报表函数与表不存在状态，fresh一致后部署；tms-receipt-followup-workflow.sql部署前后验证两笔登记与报表回显、空原因拒绝、旧版本拒绝、普通伪造头、平台全部/指定及无按钮拒绝，全部测试回滚。没有改变签收、回收或归档状态。
- 回单真实页面两例：YD202610-005/006已用当前登录浏览器分别登记“原件随车未交回”“客户签章待补齐”及模拟跟进措施，前缀[回单跟进验收20261025]；保存前备份两单均无记录，保存后窗口关闭、列表回显，独立数据库确认两条落库且父单租户一致、receipt_collected_at仍为空。未进行真实对外联系。ArtDialog/ArtForm沿用经营复盘样式，操作列纯图标。真实浏览器检查桌面窗口，自动回归覆盖1440浅色/1024/1440深色及加载失败重试、保存冲突保留填写、重新加载和再次保存，共3项通过；人工检查对应截图无窗口溢出。vue-tsc、ESLint、UI audit、reuse audit通过。数据库advisors无ERROR，既有INFO/WARN仍在。预计回场、维修计划、整体真实流程最终验收及发布体积超限仍待完成。
- 补充权限审计：首次发现月度预算按钮已有数据库菜单但本地catalog漏登记，已按实际菜单补入TmsReportMonthlyOverview:MaintainBudget。再次审计TMS相关检查通过，整库命令仍因FMS并行工作中的FinanceEstimatedPayable:Accrual/AccrualDelete/AccrualExecute缺页面显式引用而失败；未改FMS或弱化门禁，不能声称permissions:audit整体通过。
- 2026-10-25 调度计划来源闭环已部署并验收两例：私有表 `app_private.tms_vehicle_dispatch_plan` 经 get/save 安全 RPC 维护预计回场、预约维修时间与事项，按钮 `TmsReportVehicleDispatch:EditPlan` 已登记。保存校验当前任务及记录版本，旧任务的预计回场不沿用；预约计划不代替实际维修记录。`before-dispatch-plan.json` 保存发布前函数，`tms-dispatch-plan-workflow.sql` 覆盖两例保存/回显、旧版本与任务变化拒绝、维修字段配对、平台全部/指定及普通伪造头和按钮权限，部署前后事务回滚验证通过。
- 两台验收车辆通过真实登录页面保存计划，前缀 `[调度计划验收20261025]`；独立数据库复查确认车辆001绑定当前运单7、车辆002绑定当前运单8，车辆与运单租户均一致。北京时间预计回场分别为10月26日18:00、10月27日16:00，预约维修分别为10月27日09:00、10月28日10:00。未修改实际回场或维修事实。浏览器任务冲突、保留填写、重新加载和再次保存回归在1440浅色、1024、1440深色三项通过；修正了测试对公共错误归一化文案的预期，未弱化冲突断言。人工检查1024截图，双列日期、说明与页脚在窗口内；ESLint、类型检查和UI/reuse审计通过。完整15页真实流程总验收及发布体积超限仍未完成。

- 完整核算场景复核：真实 Chrome 查询订单毛利分析，期间2026-09-01至09-30、关键词报表验收，返回003/004两单；汇总收入20000、去重核算成本54290、毛利-34290。切换图表后筛选保持，截图可见两组收入12000/8000与成本23730/30560，标签及图例无遮挡。九月完整来源与十月缺来源分别作为成功及待核算场景保留，不通过新增虚假费用抹平缺失。当前启动全文件浏览器回归，会话42400，日志current-regression.log；结果尚待收集，不能记作通过。

- 最终补验：AR-F-202610-008催收历史真实抽屉显示现场沟通（测试）、未回款4000元、下次10月29日、登记人子成物流，截图无遮挡。客户毛利本期2026-10-01至25的华东/华北复盘原为空，分别通过真实页面保存[复盘验收20261025]策略及措施；保存后列表更新，再分别打开确认两字段完整回显，华北弹窗截图标题、输入区、帮助文案及页脚可见。属于授权测试数据，不代表实际对外沟通，也未修改订单金额或成本状态。

- 风险及司机台账补验：真实风险列表10月有8事项，两条人工延误分别点击009/010进入正确订单，第二条关联VMS-QA-YD8、司机2、车辆002、上海至广州、运费8000。事故及违章无订单关联不伪造；现有页面仅订单号支持下钻。司机台账9月1日至30日关键词报表验收返回两司机与员工编号、车辆和执行运单，出车9月10日08时、回场9月13日08时，里程100/200km，各签收1及回单1、考勤正常/迟到；截图核对两行、筛选、分页均正常。提货完成数为0，未把签收自动当作已登记提货。

- 图表数据量补漏：移除financialComparison前6项、月总览最近6月及承运商前6项的前端截断，保持4项一页。将现有排名分屏回归扩为9项，验证1–4、5–8、9–9及末页禁用。复用旧开发服务时仍读到缓存6项导致失败；使用独立41739新服务后同测试通过（39.1秒），没有重启原完整回归。Prettier/ESLint及UI audit通过。后端旧函数快照仍含趋势limit12，需进一步核对当前服务定义并决定显式排行榜范围或完整分页，不能宣称无限量图表已经完成。原完整回归42400仍运行；这次前端变更需要结合新服务验证结果判断，不以旧服务缓存作完成证据。

- 后端趋势范围已修复：当前函数确认limit12，before-trend-scope.json备份34024字符并解析验证；仅删除排序结果limit12，保留全部基础权限和租户条件。新增tms-report-trend-scope.sql，候选BEGIN/ROLLBACK及部署后回归通过：普通本租户/伪造头、平台全部/指定范围下trend数量等于筛选总量，普通样例大于12项，表格limit2保持、offset改变不影响trend。部署前fresh函数与备份一致。首次后验遇Transport closed，重新执行只读事务断言成功；未重复部署。完整浏览器回归42400仍运行。

- 真实全量图表验收：Chrome订单毛利筛选2026-09-01至10-25，汇总14单/279208.95元，图表标题14个对象；逐页确认1–4、5–8、9–12、13–14，末页下一页禁用。截图末页YD202610-002为360.25、YD202609-002为130，标签可读，查询与图表在内容区内。统一全量坐标轴保留跨页比例，小值不被扩大冒充大额。数据库安全advisors解析为INFO1/WARN4，无ERROR。

- 最新类型检查92079退出1，原因是Node默认约4GB堆内存耗尽，并非已确认的TypeScript错误。仓库package.json已有typecheck命令使用8192MB；当前完整浏览器回归仍占用资源，待其完成后使用pnpm typecheck复核，不能将本次失败记为类型通过。

- 完整回归42400结束：299通过、7失败（31.7分钟），需逐项归因而非宣称全绿。图表分页相关失败涉及运行中旧服务缓存，已有独立新服务9项通过。移动fixture缺viewport导致预算窗口按980px布局，补为与正式index一致后预算测试通过；真实390px同时暴露图表被压缩，报表workspace在640px以下采用自然高度、表格内容最小560px、图表最小360px。独立新服务两项移动回归29825通过（32.2秒），ESLint及Stylelint49160通过。其余移动穿透/六维金额失败仍待分析。已启动仓库8GB typecheck，结果待收取。

- 剩余移动失败归因：穿透测试修改日期后弹层拦截链接点击，补Escape关闭再下钻；六维分摊测试横向滚动停在保险列却断言右侧折旧列位于390px视口，补目标列scrollIntoViewIfNeeded，保留金额与视口断言。修复前独立复现两失败，修复后会话43899运行中；格式/ESLint55919通过。人工查看最新report-ranking-paged.png：390px图表末页完整、金额与分页可读，无原高度塌缩。8GB类型检查95971仍运行，尚无终态。

- 移动端穿透及六维分摊定向复测43899退出0，两项通过（2.2分钟）；日期弹层关闭后真实点击与目标列滚入视口的断言保留。当前启动六种viewport的9项图表分页复测62460，等待结果。最新全库permissions:audit仍因FinanceEstimatedPayable的Accrual/AccrualDelete/AccrualExecute显式页面授权引用缺失而失败，TMS并非该失败项；未改并行FMS或绕过门禁。8GB typecheck95971仍活跃，不能作已通过声明。

- 最新门禁结果：六种viewport的9项分页复测62460退出0，6项通过（2分钟）；仓库8GB typecheck95971退出0；最新UI audit通过723主仓及1537模块UI文件。原306项中的7个失败均已有对应修复/新服务定向通过证据（分页6视口、预算移动、穿透移动、六维分摊移动），不冒称原306项全部通过。共享移动高度修改后启动15页mobile-390布局回归32768，结果待收取。全库FMS授权引用和发布体积超限仍为独立未解决事项。

- 覆盖范围纠正：15页通用用例内部固定setViewportSize1440/1024，故之前以mobile-390项目名执行该用例不能作为真实手机布局证据。已按项目保留390×844并分别保存-mobile截图，桌面双主题尺寸不变；保留图表高度、专注模式、筛选、溢出及控制台断言。正确宽度的新回归15138运行于独立41740，旧32768仅作桌面双主题回归，不作手机通过证明。此前独立图表/预算/穿透/分摊移动用例不受这处覆盖影响。

- 真390px通用回归发现专注模式沿用桌面>400px表体阈值不成立：月总览实拍中筛选、操作、两行数据、分页和退出均可见，表体146px。移动断言改为>120px（两条可读行）并新增分页与退出控件必须位于视口，桌面>400px保持；这是按实际844px布局校正断言，不把遮挡视为通过。尚待新一轮确认。

- 最终人工视觉抽检：已检查真实390px月总览深色专注模式、应收浅色整页截图，查询、两条明细、分页及退出控件可见；七页页签与十五独立业务页结构扫描未见VmsReport或旧VMS目录引用。最新测试文件ESLint通过。真390px回归7971已进入第10页，无已记录错误，仍需终态。

### 本轮 TMS 报表验收结论

15页真实390×844回归7971退出0，15通过（2.3分钟）；桌面双主题复核32768退出0，15通过（2.9分钟）。六视口分页6通过、移动预算/长口径2通过、移动穿透/六维分摊2通过；原306项299通过的7个失败已有逐项修复与定向复测证据，不将原命令标成全绿。全项目typecheck、最新UI audit、修改文件ESLint/Stylelint通过。

业务范围：TMS下8经营决策及7运营分析，各页至少两条实际数据（KPI为六指标），真实录入/保存/历史/下钻链路证据见上表和对应记录；保留九月完整核算与十月缺来源场景。7个图表页面默认表格、独立图表页签、共享筛选、4项分页，前端6项和后端12项截断已移除，真实14项末页验收通过。长口径有界弹窗、图标操作、数字加载状态沿用项目组件。

本报表交付验收完成；不包含发布或修改并行FMS/认证工作。全库permissions:audit的FMS三项引用缺失及既有构建体积超限仍未解决，不宣称全库发布门禁通过。未提交或推送代码。
