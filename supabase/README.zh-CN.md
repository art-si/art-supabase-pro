# Supabase 备份、只读分发与恢复

这组 PowerShell 脚本生成一次**快照**，可恢复到本机 Supabase，也可恢复到另一个全新云项目：

```text
原远端项目 ckbftoopuyophiebamwy
        ↓ backup-supabase.ps1
本机 supabase/backups/<时间戳>/
        ├─ package-supabase-backup.ps1 → ZIP → 私有短期下载链接 → 别人的本机 Supabase
        └─ restore-supabase.ps1 → 另一个全新、空白的 Supabase 远端项目
```

接收者只拿到一个限时下载链接和用于核对文件的 SHA-256，不需要原项目账号、Access Token、数据库密码或 `service_role` key。链接本身只允许下载那份 ZIP，不授予原项目 API 权限。接收者一旦下载，便拥有快照中业务数据和文件的本地副本，请只分享给确实可以查看这些数据的人。脚本不持续同步；原项目有更新时，所有者需要重新备份和发新链接。

分享用 ZIP 默认清除 Auth 密码哈希、会话、刷新令牌、MFA、OAuth 流程和一次性令牌；保留用户 ID、邮箱等本地业务关联所需字段。分享包还去掉了迁移历史内容和仅供所有者审查的托管 schema 快照。原始备份目录不变，仍只由所有者保管。业务表和 Storage 文件可能另含客户数据或自行存放的第三方凭据，所有者需检查这些内容后再分享；不能把“完整生产数据快照”当作绝对无风险的只读凭证。接收者还需取得与快照匹配的应用仓库代码及业务子模块，才能运行前端。云端 Edge Function Secret 的值、OAuth/SMTP 等 Dashboard 配置和加密根密钥不会自动导出，相关能力仍需单独配置。

截图里的 Access Token `No access` 意味着不给 API 资源权限，无法完成完整备份。即使选择 `Read-only`，也不能单独替代数据库连接、私有 Storage 和完整 Auth/Function 导出所需的所有者操作。**不要把原项目的 PAT 或数据库密码发给接收者。**

## 数据中心 → Supabase 运维台

运维台把本目录的脚本连接到本机执行端，提供环境检查、逐函数源码同步、完整备份与续跑、备份校验、ZIP/分片制作、下载/本机 ZIP/分片解压、本地恢复与续跑、新空白云项目恢复、短期分发链接和本地登录密码设置。

1. 在仓库根目录运行 `pnpm supabase:ops`，保持这个终端开启。该入口会沿用项目已有的 Windows 代理配置；本机需安装 Node.js、PowerShell、curl、Supabase CLI，备份和恢复还需要运行中的 Docker Desktop。
2. 在菜单中打开运维台，默认就是“创建完整备份”。首次点击“连接并查看任务”只恢复状态；确认当前没有执行中任务后，输入数据库密码再执行。不需要配对码，也不需要先点“环境检查”。页面上的高亮启动命令可点击复制。
3. “环境与连接检查”只用于可选排障。CLI 登录异常时在本机终端完成 `supabase login --agent=no`，再从页面重试；后台任务不会停在不可见的交互式输入框上。
4. 选择操作、填写参数，观察阶段、运行时间、最后输出时间和日志。30 秒无新输出会提示等待原因；取消会停止任务进程树，部分备份或恢复可能需要校验后续跑。页面关闭不代表任务取消。

执行端只监听 `127.0.0.1`，检查允许的站点来源、当前 Supabase 登录身份、平台超级管理员能力和具体按钮权限。身份随显式 Bearer 令牌传递，不使用跨站自动携带的 Cookie；浏览器预检与来源白名单继续生效。普通用户的 AI 助手访问不受影响。只读轮询授权最多缓存 30 秒，发起和取消操作均重新验证权限。没有任意命令执行、任意脚本选择或绕过认证入口。重复运行启动命令会显示现有执行端连接信息，不中断任务，也不再抛出正常重复启动的错误堆栈；旧版执行端需先在原窗口退出后重启一次。

默认允许 `http://localhost:3006`、`http://127.0.0.1:3006` 和 `https://art-si.github.io`。其他应用部署地址需通过 `SUPABASE_OPS_ALLOWED_ORIGINS` 配置完整来源（逗号分隔，包含协议与端口）；可用 `SUPABASE_OPS_PORT` 更改端口，或用 `SUPABASE_OPS_POWERSHELL` 指定 PowerShell 可执行文件。HTTPS 页面访问本机时，浏览器可能要求本地网络权限；允许后重新连接即可。

历史保存在 Git 忽略的 `.artifacts/supabase-operations/`，密码和输入令牌不写入历史，输出会脱敏。生成的短期分发链接作为受保护的任务产物保存在本机历史中，请保护该目录。每次读取仅返回所选任务的完整日志；单任务最多保留最近 1000 条输出，历史列表显示最近 50 项。任务串行执行，达到两小时上限会停止；执行端异常退出的任务在重启后标为“已中断，待核对”，不会自动重跑。

页面按项目和当前用户仅保存端口及任务状态摘要，不缓存密码、完整参数、日志或签名链接。已连接过的页面刷新后自动恢复连接；离线时显示“状态待确认”，按钮只恢复查看。发现本项目残留的 Docker 数据库导出时，会显示实际阶段并阻止重复启动；导出容器仍在运行不代表整个备份流程仍可自动完成。

日志区使用项目已有的 Monaco Editor，提供语法着色、搜索、复制、换行与跟随输出。上翻会暂停跟随；切换任务恢复到对应日志。普通 CLI stderr 进度按 INFO 显示，明确错误保留 ERROR。

顶部“使用说明”和参数区“本功能怎么用”打开同一份可搜索的 12 项操作指南，包含用途、填写内容、步骤、产物与中断边界。右侧专注模式可扩大任务和日志区域，Esc 退出；普通工作区滚动使用 `ElScrollbar`。绿色呼吸点表示最近一次核对仍在运行，失败用红色，断线或状态未确认用黄色；没有新输出不等于完成。

中断任务会每 5 秒重新核对 Docker；空闲连接每 30 秒核对一次，重新进入页面也会刷新。确认旧导出结束后，页面提供重新备份和续跑的表单入口，不自动启动任务。若旧导出仍在运行，可继续等待；具备取消权限者也可点击“停止旧导出”并明确确认，执行端只停止重新核对后属于本项目的遗留 `pg_dump` 容器，不接受页面传入容器 ID。该操作保留已有文件，但未完成的数据库导出不能续传。

### 运维功能核查与使用条件

所有 12 项目录的字段已与真实 PowerShell 参数签名核对；入口分发、身份与权限、参数校验、脱敏和进程状态使用隔离测试验证。云写入类操作未对生产项目试跑。

| 功能 | 必要条件与边界 |
| --- | --- |
| 环境与连接检查 | CLI、Docker、来源项目登录；只读排障，不是备份前置按钮 |
| 同步远端函数源码 | 有效 CLI 登录；逐个下载到独立快照，保留仓库源码 |
| 创建完整备份 | 数据库密码、运行中的 Docker、项目访问权；结束必须生成完整 manifest |
| 继续未完成的备份 | 原备份目录及来源/阶段记录；完整 SQL 经 SHA-256 和结束标记校验后跳过，失败或缺失 SQL 重新导出；数据库阶段未完成时须再次输入来源密码、启动 Docker |
| 校验备份完整性 | 完整备份目录；只校验清单和文件，不启动恢复 |
| 制作分发包 | 先通过完整性校验；生成分享包、校验值及可选分片 |
| 下载与解压分发包 | HTTPS、本机 ZIP、分片三选一；前两项必须 SHA-256，目标目录必须全新 |
| 恢复到本地环境 | 完整备份及全新本地目录，Docker 可用；首次拉取镜像可能较慢 |
| 继续本地恢复 | 同一备份和原本地目录；遵守脚本恢复标记，数据库部分导入不能伪装为安全重放 |
| 恢复到新云项目 | 另一全新空白项目、目标密码、两次相同目标 ID、平台权限与范围确认 |
| 发布短期下载链接 | 分享 ZIP、独立分发项目、私有桶及有效 Secret Key；拒绝原项目和未清理 Auth 的包 |
| 设置本地登录密码 | 由本地恢复脚本创建的环境、已恢复账号、至少 8 位密码；只操作本机 Auth |

新云项目恢复保留脚本对“不同来源、目标项目为空”的检查，并要求再次输入目标 ID；发布仅允许独立分发项目。原始 PowerShell 命令仍可继续使用。`start-local-backup.ps1` 是分发 ZIP 内的启动器，运维台的“恢复到本地环境”与“继续本地恢复”复用其核心恢复脚本；`transfer-common.ps1` 是共用实现，不是独立任务。

## 首次准备

1. 安装 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) 和 Docker Desktop，启动 Docker Desktop。在 PowerShell 中确认 `supabase --version`、`supabase db query --help`、`docker version` 均可运行。本仓库脚本使用的 CLI 参数已用 2.106.0 核对。脚本通过 Docker 使用 `psql`，无需另外安装 PostgreSQL 客户端。
2. **备份所有者**运行备份脚本即可：已有有效登录时直接继续；未登录、令牌失效或账号没有来源项目权限时，脚本启动 CLI 浏览器登录，完成验证后自动继续。网络请求失败会提示检查网络/代理，取消登录或仍无权限时会停止，不会伪造成功备份。登录令牌留在所有者电脑上。接收者恢复到本地时运行 `restore-local-supabase.ps1`，不需要来源项目登录。
3. 准备原项目的**数据库密码**。它不是 Supabase 登录密码，也不是 API key；在 Supabase Dashboard 的 Database Settings 中管理。
4. 从仓库根目录 `D:\spa\art-supabase-pro` 运行以下命令。不要把密码直接写进命令或保存到仓库里；脚本会交互式提示输入。

## 第一步：原远端 → 本地备份

```powershell
Set-Location 'D:\spa\art-supabase-pro'
.\supabase\backup-supabase.ps1
```

输入**原项目**的数据库密码。默认来源是 `ckbftoopuyophiebamwy`。成功后，终端会显示类似 `supabase/backups/20260930-123456` 的绝对路径；记下这个路径。

备份目录由脚本按时间戳新建，不覆盖旧目录。里面有：

| 路径 | 内容 |
| --- | --- |
| `manifest.json` | 来源、时间、文件大小和 SHA-256 校验值 |
| `database/` | 数据库角色、结构、数据、迁移历史，以及 `auth`/`storage` 托管结构参考快照 |
| `storage/` | 各 bucket 的文件内容 |
| `functions/` | 从原远端下载的已部署 Edge Function 源码；没有已部署函数时可以不存在 |
| `metadata/` | bucket、Realtime、函数和 Secret 名称等元数据 |
| `config.toml` | 本仓库的 Supabase CLI 配置副本 |

`supabase/backups/` 已被 Git 忽略。备份包含用户和业务数据，应放在受控、加密的存储中，不要提交或公开。若导出中途报错，**不要使用**那个没有完整 `manifest.json` 的目录。

中途失败后，可以从记录了来源和阶段进度的原备份目录继续；尚未完成的数据库阶段会提示重新输入来源密码：

```powershell
.\supabase\backup-supabase.ps1 -ResumeBackupPath 'D:\spa\art-supabase-pro\supabase\backups\YYYYMMDD-HHMMSS'
```

续跑读取 `metadata/backup-progress.json` 中的来源项目、完成文件大小和 SHA-256，并校验 SQL 结束标记。已经完整且未变化的文件直接跳过；缺失或未完成的 SQL 重新导出。数据库阶段尚未完成时，在运维台重新输入来源数据库密码，或为脚本提供 `-DbPassword`；只有六份 SQL 都已完整时，后续阶段才不需要数据库密码或 Docker。密码只用于本次运行，不写入进度记录。

失败 SQL 与临时下载保留在原备份目录旁的同名 `.incomplete` 目录，验证完整后才安装到正式目录。函数每下载成功一个，就保存部署身份（项目、名称、ID、版本、源码包哈希）及文件哈希；续跑只重下失败、版本变化或本地校验失败的函数。函数清单顺序变化不会导致全部重下。EOF、超时等暂时网络故障最多自动尝试三次；认证等错误直接停止，已完成的函数仍保留。结束前再次核对远端部署版本，期间有部署变化时不生成完成清单。

新下载的每个函数及其 `_shared` 依赖放在独立的 `functions/<名称>/_bundle/` 内，`metadata/function-layout.json` 记录恢复入口；不同部署版本的共享文件不会互相覆盖。打包、本地 Docker 和新云项目恢复脚本共同读取这个布局。旧版已完成的平铺备份仍可读取；旧版未完成备份续跑时，需要补建一次独立函数缓存，不能把旧的合并目录拆成未经证明的逐函数缓存。已有 SQL 保留，旧函数也会保留到新包全部校验完成。

安装与旧版本归档均采用逐文件复制、大小和 SHA-256 校验；归档全部成功后才清理旧文件，并保留 `functions` 根目录，绕开 Windows 目录重命名失败。复制失败时来源不删，旧版本也保存在外部暂存，防止已删除文件混入新清单。Storage 继续下载，所有数据库文件在最终生成清单前再次校验，完成清单通过原子移动写入。

这属于按文件与阶段续跑，不能从半份 `data.sql` 的字节中间接写。各 SQL、函数和 Storage 并非同一事务时间点；尽量避免期间修改来源结构和数据，恢复后还需核对业务一致性。没有可核对来源/阶段记录的旧目录不得自行混合续跑。当前 2026-10-29 15:51 的失败备份已按本机可信任务记录补回来源和两份完整导出的校验值，保留了原失败文件。

2026-10-30 对原目录 `20261029-155141` 的实际修复已验证：先确认没有运行中的运维任务，再从已校验的暂存阶段归档旧目录并安装 81 个源码文件，逐文件哈希一致；六份 SQL 的阶段哈希、大小和结束标记均通过。此时尚未生成 `manifest.json`，仍需从同一目录继续后续步骤；不能将这次安装修复视为整份备份已经完成。自动回归覆盖逐函数下载失败后的复用、瞬时重试、版本变化和篡改检查，恢复配置及分享 ZIP 测试使用临时模拟数据，没有执行真实云恢复。

## 校验结果怎么看

“校验备份完整性”会显示文件核对进度，完成后提供检查项、数据库/函数/Storage/元数据分类数量和大小、问题文件的相对路径，以及可下载的 JSON 报告。报告保存在备份目录外，不会改变备份清单；执行端保存报告到任务历史，刷新后仍可查看。旧版历史任务没有逐项报告，需要沿用原目录重新校验。

检查内容包括清单路径安全、必备文件、逐文件大小与 SHA-256、未登记文件、SQL 完成标志、元数据解析、函数布局和已有 Storage 数量记录。原始备份与已清理 Auth 凭据的分发包均可校验。未提供数量记录等不能检查的内容会标为“未执行”，不会当作已经通过。

文件完整性通过不等于恢复演练成功：此操作不连接远端、不启动 Docker、不导入 SQL，也不能确认备份包含远端此后的变更。跨阶段业务一致性、目标环境兼容性和实际业务可用性仍须在独立环境恢复后检查。

2026-10-30 对完成后的 `20261029-155141` 进行了只读复核：643/643 个文件、462282974 字节通过，未发现问题；分类为数据库 6、函数源码 209、Storage 文件 417、元数据 10、配置 1。文件哈希、SQL 结束标志、函数布局和 Storage 数量均通过。报告和浏览器验证分别保存到 Git 忽略的 `.artifacts/supabase-operations/`，没有执行真实恢复。

## 后续本地 Docker 增量交付（需求与边界，尚未实现）

交付目标是：所有者先生成本地包，再发送给已经恢复过完整基线的 Docker 使用者；使用者只查看来源业务数据，不自行修改。当前“继续未完成的备份”只完成同一版本，不能用来获取已完成 SQL 之后新增或修改的数据。

后续更新应遵守以下约定，不能按文件存在就跳过：

- 首次基线必须包含完整清单并校验通过；更新包记录来源项目、基线哈希、前一包哈希和严格递增的版本，接收方按顺序应用。
- 未变化的表、函数、Storage 对象跳过；变化和删除必须有明确清单。要准确识别数据变化，需要可靠变更记录，或在来源端计算内容指纹；仅凭行数、`updated_at` 或统计计数不足以判断未变化。
- 最小可行交付粒度为变化的表与文件。无稳定主键的变化表需要完整替换该表数据；行级增量需要额外的主键和变更记录能力，不能无条件承诺。
- 新增表和可兼容结构变更可形成更新计划；删列、改类型和复杂约束应阻止自动应用并明确提示。不能每次对已有环境重走空库恢复流程。
- 更新包还应声明所需应用与 schema 版本；接收方应用代码或 Docker 镜像版本不足时先提示升级，避免数据库已更新而页面仍使用旧字段。
- 接收方核对基线版本，在本地校验并应用更新；失败不推进版本。保留本地 Auth 密码和会话，不把来源凭据送入更新包。

这部分还需要独立的增量导出、打包和本地应用功能；当前没有提供可执行的跨版本更新入口。先完成现有基线，不应把断点续跑当成已经具备后续增量交付。

## 在自己电脑先试：ZIP → 本地 Supabase

交付包保存在 GitHub Release，不占用 Gitee 仓库的 Git 文件容量，也不依赖 Git LFS。克隆仓库后运行以下命令，脚本会下载 ZIP、使用仓库中的 SHA-256 校验并解压：

```powershell
$sha = ((Get-Content '.\supabase\art-supabase-local.zip.sha256' -Raw).Trim() -split '\s+')[0]
.\supabase\download-supabase-backup.ps1 `
  -SignedUrl 'https://github.com/art-si/art-supabase-pro/releases/download/supabase-local-20261027/art-supabase-local.zip' `
  -ExpectedSha256 $sha `
  -Destination '.\supabase-local-package'
.\supabase-local-package\start.ps1
```

`Destination` 必须是尚不存在的目录。ZIP 校验失败时，download 会停止，不运行恢复脚本。仓库中的 SHA-256 与指定 Release 对应；更新包时需要同步更新二者。

交付 ZIP 自带 `start.ps1` 和 `tools/`，解压后可直接运行 `powershell -File .\start.ps1`。打包时可用 `-CliRuntimePath '<CLI二进制目录>'` 一并放入官方 Windows x64 `supabase.exe` 与 `supabase-go.exe`；接收者只需启动 Docker Desktop。未随包携带 CLI 且本机版本低于 2.122.0 时，入口会下载固定版本并校验 SHA-256，不需要原项目登录。Linux/macOS 接收者需使用未捆绑 Windows CLI 的包，先安装 Supabase CLI 2.122.0 以上版本与 PowerShell，再运行 `pwsh ./start.ps1`。本地栈默认创建在解压目录旁边；首次启动需要下载 Docker 镜像。恢复脚本依据服务版本元数据匹配来源数据库、Auth 和 Storage 版本。

分享包保留业务表、用户 ID、附件、函数源码和本地恢复必需元数据，移除源 Auth 凭据、Vault 数据、生产定时任务及待发送 HTTP 队列、加密根密钥和所有者诊断文件。若包含经审核的 `database/managed-project-objects.sql`，恢复时还会导入应用在 Auth/Storage 表上的自定义策略与触发器；不会重建平台托管的基础 schema。函数 JWT 开关以远端导出元数据为准。源项目凭据不会成为接收者的登录方式；接收者需在本地设置用户密码和第三方服务密钥。原始完整备份仍只保存在所有者的备份目录。

把下方时间戳换成备份实际路径。运行打包脚本，它先校验清单和每个文件，清除分享包中的 Auth 凭据，再生成新的 ZIP、清单和 SHA-256。原始备份目录不会被改写：

```powershell
$backup = 'D:\spa\art-supabase-pro\supabase\backups\YYYYMMDD-HHMMSS'
.\supabase\package-supabase-backup.ps1 -BackupPath $backup
$zip = "$backup.zip"
$sha = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
```

在**新的空目录**中模拟接收者下载、校验和解压。`-ArchivePath` 是本机试跑专用；接收者实际收到链接后使用下面的 `-SignedUrl`：

```powershell
New-Item -ItemType Directory -Path 'D:\supabase-transfer-test' -Force | Out-Null
.\supabase\download-supabase-backup.ps1 `
  -ArchivePath $zip -ExpectedSha256 $sha `
  -Destination 'D:\supabase-transfer-test\backup'
.\supabase\restore-local-supabase.ps1 `
  -BackupPath 'D:\supabase-transfer-test\backup' `
  -LocalRoot 'D:\supabase-transfer-test\local'
```

恢复脚本创建独立的本机 Supabase 项目，检查目标为空，再导入数据库、已去除源凭据的 Auth 用户、Storage 文件、Realtime 发布关系和已下载的函数源码。它不会执行 `supabase link` 或连接原云项目。`D:\supabase-transfer-test\local` 必须是不存在的新目录；默认使用 `54321` 等 Supabase 本地端口，若已被占用，请修改新建的 `local\supabase\config.toml` 中的端口后加 `-Resume` 重新运行。若数据库导入或 Storage 导入中途失败，应检查报错并在新的空目录重新恢复，不要把快照合并到已有数据里。

恢复成功后查看本地地址和公开 key：

```powershell
Set-Location 'D:\supabase-transfer-test\local'
supabase status
```

由于分享包没有原项目的密码哈希，先选一个快照中已有的用户邮箱，为**本地**账号设置新密码（脚本会交互式输入，不写到命令历史；只访问本机 API）：

```powershell
Set-Location 'D:\spa\art-supabase-pro'
.\supabase\set-local-login.ps1 `
  -LocalRoot 'D:\supabase-transfer-test\local' `
  -Email '已有用户的邮箱@example.com'
```

在前端仓库根目录创建 Git 忽略的 `.env.local`，填入 `supabase status` 显示的本地 **API URL** 和 **anon key**（不要使用 `service_role` key），再启动前端：

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=将本地_supabase_status_显示的_anon_key_填到这里
```

```powershell
Set-Location 'D:\spa\art-supabase-pro'
pnpm install
pnpm dev
```

前端默认是 `http://127.0.0.1:3006`。本地配置已把 Auth 的站点/回调地址改到这个端口。旧云项目的登录态不能用于本地，请用上一步的新密码登录；依赖外部 OAuth、邮件、AI 供应商或 Edge Function Secret 的功能，还需在本地单独配置。需要单独调试函数时，在本地项目目录运行 `supabase functions serve`。

## 给别人：只提供限时下载链接

所有者可以把 ZIP 上传到**与原项目不同**的 Supabase 分发项目。在分发项目 Dashboard 创建名为 `project-transfer-backups` 的 **private Storage bucket**，确保全局和 bucket 的单文件大小限制都能容纳 ZIP；Supabase Free 项目的上限是 50 MB。分发项目的 secret / `service_role` key 只在所有者电脑输入，绝不发送给接收者：

```powershell
Set-Location 'D:\spa\art-supabase-pro'
.\supabase\publish-supabase-backup.ps1 `
  -ArchivePath $zip `
  -DistributionProjectRef '<分发项目的20位ref>' `
  -ExpiresInSeconds 3600
```

脚本拒绝原项目 ref、公开 bucket，以及未经分享用脚本清除 Auth 凭据的原始备份。上传后打印 `Signed URL` 与 `SHA256`。把这两项私下发给接收者。**链接就是下载凭证**，有效期内任何拿到链接的人都能下载；过期后应重新生成链接。接收者不需要 Supabase 云账号或数据库密码：

```powershell
Set-Location 'D:\spa\art-supabase-pro'
$url = '<所有者发来的 Signed URL>'
$sha = '<所有者发来的 SHA256>'
New-Item -ItemType Directory -Path 'D:\supabase-transfer' -Force | Out-Null
.\supabase\download-supabase-backup.ps1 `
  -SignedUrl $url -ExpectedSha256 $sha `
  -Destination 'D:\supabase-transfer\backup'
.\supabase\restore-local-supabase.ps1 `
  -BackupPath 'D:\supabase-transfer\backup' `
  -LocalRoot 'D:\supabase-transfer\local'
```

接收者随后按上一节的 `supabase status`、`set-local-login.ps1`、`.env.local` 和 `pnpm dev` 步骤启动应用。若 ZIP 超出分发项目的 Storage 大小限制，可由所有者使用其他支持**私有、限时 HTTPS 下载链接**的文件存储服务，再把该链接及同一个 SHA-256 发给接收者；下载脚本不限定链接来自 Supabase。

## 恢复到另一个远端项目（所有者可选）

若还要恢复到另一云项目，先在 Dashboard 创建**全新、空白**的目标项目，记录其 project ref 和数据库密码。不要把生产项目或已有业务数据的项目当作目标。

### 先校验本地备份

把下面的时间戳和目标 project ref 换成实际值：

```powershell
.\supabase\restore-supabase.ps1 `
  -BackupPath '.\supabase\backups\20260930-123456' `
  -TargetProjectRef 'abcdefghijklmnopqrst' `
  -VerifyBackupOnly
```

这一步只核对清单、文件完整性和函数目录，不连接或修改任何远端。看到 `Backup verified` 才继续。`TargetProjectRef` 在校验时仅用于检查目标不是备份的来源。

### 本地备份 → 另一个远端

```powershell
.\supabase\restore-supabase.ps1 `
  -BackupPath '.\supabase\backups\20260930-123456' `
  -TargetProjectRef 'abcdefghijklmnopqrst'
```

输入**目标项目**的数据库密码，再按提示完整输入目标 project ref 确认。脚本会先拒绝来源相同、已有 `public` 表、Auth 用户、Storage 数据或已部署函数的目标，然后导入数据库、Realtime 发布关系、Storage 文件和已部署的 Edge Functions。恢复使用临时工作目录，不会把本仓库当前的 Supabase 链接改为目标项目。

这一步会写入目标项目。数据库导入在一个事务中执行；如果后续 Storage 或函数部署失败，目标可能只完成了一部分。此时应检查错误，并在**新的空项目**上重试完整恢复，不要把同一份备份当作可安全合并到已有项目的增量包。

## 恢复后还要做什么

- 在目标项目重新填写 Edge Function Secrets 的**值**；`metadata/edge-function-secret-names.json` 只有名称，没有值。重新配置 Auth/OAuth、SMTP、邮件模板、站点 URL、回调地址、自定义域名及其他 Dashboard 专属设置。
- 查看 `database/managed-schema-snapshot.sql`，人工核对原项目对 `auth`、`storage` 托管结构做过的自定义策略、触发器等变更；脚本不会自动重放整个托管 schema。如果使用 Vault 或列加密，先按 [Supabase 官方迁移指南](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) 迁移加密根密钥。自定义 `LOGIN` 角色密码也要单独设置。
- 原项目的函数 import map、`deno.json` 等额外文件可能无法从已部署函数中完整还原。需要时从受控的源代码另行部署。脚本恢复的是**备份时远端已部署**的函数，并不会把此后对仓库 `supabase/functions/` 的本地修改自动发布到目标。
- 检查目标的 API 暴露配置、Storage 文件类型与缓存设置、Realtime、Auth 登录，以及关键业务表数量和租户权限。Storage 的 API 回退上传会使用 `application/octet-stream`，所以特殊 MIME 类型和缓存策略需要复核。
- 要让前端连接新项目，另行更新前端环境中的 Supabase URL 和公开 key；不要把 `service_role` 或 `sb_secret_` key 放进前端。

## 常见问题

- **运维台提示无法连接本机执行端**：在仓库终端运行页面上可点击复制的 `pnpm supabase:ops`，保持启动窗口开启，核对页面端口与启动信息一致。无需配对码，也不必先运行环境检查。连接成功后直接填写数据库密码即可备份。
- **浏览器阻止本机网络访问**：点击地址栏左侧的站点设置，将“本地网络访问”或“回环网络”改为允许，再回到运维台重新连接。执行端正常启动也不能绕过浏览器权限；页面会区分明确拒绝权限、响应超时和一般连接失败。参见 [Chrome 本机网络访问说明](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)。
- **运维台提示 `ConvertTo-SecureString` 无法加载模块**：从 PowerShell 7 启动的 Node 会继承模块搜索路径，可能让 Windows PowerShell 5.1 误加载新版安全模块。任务入口已按运行版本隔离模块目录；更新脚本后重新填写数据库密码并发起任务即可，现有执行端无需重启。
- **提示找不到 `supabase`**：先按官方文档安装 CLI，重新打开终端，再运行 `supabase --version`。
- **提示 Docker 未启动**：启动 Docker Desktop，等 `docker version` 成功后重试。
- **首次本地启动一直显示 Pulling**：CLI 正在下载本地 Supabase 服务镜像，下载量较大；等待镜像拉完。中断后可对同一未导入的本地目录加 `-Resume` 重试。
- **PowerShell 禁止执行脚本**：可以仅对本次进程使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\supabase\backup-supabase.ps1`；恢复时同理替换脚本名并附上参数。
- **目标被判定为非空**：换一个新建的空项目。脚本刻意不提供覆盖或合并模式。
- **本地端口已占用或首次拉取 Docker 镜像失败**：查看新建的 `local\supabase\config.toml`，必要时修改本地端口，然后用相同 `-BackupPath`、`-LocalRoot` 加 `-Resume` 继续。数据库已部分恢复时应换新的空目录。
- **下载链接过期**：联系所有者重新生成；已成功下载并通过 SHA-256 校验的本地副本无需再次下载。

命令和限制依据：[Supabase 官方备份与恢复指南](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、[本地开发](https://supabase.com/docs/guides/local-development)、[Storage 私有下载链接](https://supabase.com/docs/guides/storage/serving/downloads)、[CLI 数据库导出参考](https://supabase.com/docs/reference/cli/supabase-db-dump)、[CLI 函数下载参考](https://supabase.com/docs/reference/cli/supabase-functions-download)、[CLI Storage 拷贝参考](https://supabase.com/docs/reference/cli/supabase-storage-cp)。
