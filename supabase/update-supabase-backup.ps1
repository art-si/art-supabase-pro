[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$UpdateBackupPath,
  [securestring]$DbPassword,
  [switch]$PlanOnly,
  [switch]$ApplyUpdate,
  [string]$PlanId,
  [switch]$RecoverUpdate,
  [string]$ProjectRef = 'ckbftoopuyophiebamwy'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
$encoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $encoding
[Console]::OutputEncoding = $encoding
$OutputEncoding = $encoding
if ($ProjectRef -ne 'ckbftoopuyophiebamwy') { throw '更新命令仅允许本仓库关联的来源项目。' }
if (-not $RecoverUpdate -and $PlanOnly -eq $ApplyUpdate) { throw '请选择 -PlanOnly 检查，或 -ApplyUpdate 更新。' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装项目要求的 Node.js 和依赖。' }
if (-not $RecoverUpdate) {
  if (-not $DbPassword) {
    if ($env:CI) { throw '检查远端变化需要来源数据库密码；密码只用于本次只读比较和导出。' }
    $DbPassword = Read-Host '来源数据库密码（只读比较与导出）' -AsSecureString
  }
  Enable-SystemProxyForSupabaseCli
  Assert-SupabaseCliProjectAccess -ProjectRef $ProjectRef -NonInteractive:([bool]$env:CI)
  $linkedPath = Join-Path $PSScriptRoot '.temp/project-ref'
  if (-not (Test-Path -LiteralPath $linkedPath -PathType Leaf) -or
      (Get-Content -LiteralPath $linkedPath -Raw -Encoding UTF8).Trim() -ne $ProjectRef) {
    throw 'Supabase CLI 关联的来源项目不匹配，请先关联本仓库项目。'
  }
}
$plainPassword = if ($DbPassword) { Get-PlainText $DbPassword } else { '' }
try {
  $payload = @{ UpdateBackupPath = [IO.Path]::GetFullPath($UpdateBackupPath); DbPassword = $plainPassword;
    PlanOnly = [bool]$PlanOnly; ApplyUpdate = [bool]$ApplyUpdate; RecoverUpdate = [bool]$RecoverUpdate }
  if ($PlanId) { $payload.PlanId = $PlanId }
  $worker = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/backup-update.ts'
  # The password stays on stdin; never place it in process arguments or files.
  $payload | ConvertTo-Json -Compress | & node --import tsx $worker
  if ($LASTEXITCODE -ne 0) { throw '已有备份更新未完成，请查看更新报告；原完整版本保留或可按更新记录恢复。' }
}
finally {
  $plainPassword = $null
  if ($payload) { $payload.DbPassword = '' }
}
