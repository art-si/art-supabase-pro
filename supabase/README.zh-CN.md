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

如果数据库导出和函数下载已经完成，错误发生在函数目录整理或后续 Storage 阶段，可以从原目录继续：

```powershell
.\supabase\backup-supabase.ps1 -ResumeBackupPath 'D:\spa\art-supabase-pro\supabase\backups\YYYYMMDD-HHMMSS'
```

续跑会检查已有数据库文件，保留原导出和下载的函数，逐文件复制并校验函数源码，然后重新获取后续元数据、下载 Storage 并生成清单；Storage 阶段仍会重新下载各桶。它使用当前 CLI 的原项目关联，不需要重新输入数据库密码或启动 Docker。原始函数下载目录会保留在备份的 `supabase/functions/` 下。缺少数据库导出、函数下载或项目关联时应先处理错误；数据库阶段未完成的备份不支持此续跑入口。续跑不会重新生成数据库快照，因此应避免在续跑期间修改来源数据和 Storage。

## 在自己电脑先试：ZIP → 本地 Supabase

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

- **提示找不到 `supabase`**：先按官方文档安装 CLI，重新打开终端，再运行 `supabase --version`。
- **提示 Docker 未启动**：启动 Docker Desktop，等 `docker version` 成功后重试。
- **首次本地启动一直显示 Pulling**：CLI 正在下载本地 Supabase 服务镜像，下载量较大；等待镜像拉完。中断后可对同一未导入的本地目录加 `-Resume` 重试。
- **PowerShell 禁止执行脚本**：可以仅对本次进程使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\supabase\backup-supabase.ps1`；恢复时同理替换脚本名并附上参数。
- **目标被判定为非空**：换一个新建的空项目。脚本刻意不提供覆盖或合并模式。
- **本地端口已占用或首次拉取 Docker 镜像失败**：查看新建的 `local\supabase\config.toml`，必要时修改本地端口，然后用相同 `-BackupPath`、`-LocalRoot` 加 `-Resume` 继续。数据库已部分恢复时应换新的空目录。
- **下载链接过期**：联系所有者重新生成；已成功下载并通过 SHA-256 校验的本地副本无需再次下载。

命令和限制依据：[Supabase 官方备份与恢复指南](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、[本地开发](https://supabase.com/docs/guides/local-development)、[Storage 私有下载链接](https://supabase.com/docs/guides/storage/serving/downloads)、[CLI 数据库导出参考](https://supabase.com/docs/reference/cli/supabase-db-dump)、[CLI 函数下载参考](https://supabase.com/docs/reference/cli/supabase-functions-download)、[CLI Storage 拷贝参考](https://supabase.com/docs/reference/cli/supabase-storage-cp)。
