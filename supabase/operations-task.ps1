[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Operation)
# Windows PowerShell 5.1 launched by Node inherits the caller's PSModulePath verbatim.
# A PowerShell 7 module directory before the Windows modules makes built-in commands
# such as ConvertTo-SecureString resolve to an incompatible module version.
if ($PSVersionTable.PSEdition -eq 'Desktop') {
  $windowsModulePaths = @($env:PSModulePath -split [IO.Path]::PathSeparator |
    Where-Object { $_ -match '[\\/]WindowsPowerShell[\\/]' })
  $systemModulePath = Join-Path $PSHOME 'Modules'
  if ($windowsModulePaths -notcontains $systemModulePath) {
    $windowsModulePaths += $systemModulePath
  }
  $env:PSModulePath = $windowsModulePaths -join [IO.Path]::PathSeparator
}
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:CI = 'true'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
Enable-SystemProxyForSupabaseCli
try {
  $inputValues = [Console]::In.ReadLine() | ConvertFrom-Json
  $parameters = @{}
  foreach ($property in $inputValues.PSObject.Properties) {
    if ($property.Name -in @('DbPassword', 'TargetDbPassword', 'DistributionSecretKey', 'Password')) {
      $parameters[$property.Name] = ConvertTo-SecureString ([string]$property.Value) -AsPlainText -Force
    } else { $parameters[$property.Name] = $property.Value }
  }
  if ($Operation -eq 'diagnose') {
    Write-Host '阶段：检查运行环境'
    & supabase --version
    if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI 不可用，请安装 CLI 后重试。' }
    Write-Host '阶段：检查 Docker'
    & docker version --format '{{.Server.Version}}'
    if ($LASTEXITCODE -ne 0) { throw 'Docker 未就绪，请启动 Docker Desktop 后重试。' }
    Write-Host '阶段：检查来源项目登录'
    Assert-SupabaseCliProjectAccess -ProjectRef 'ckbftoopuyophiebamwy' -NonInteractive
    Write-Host '环境检查通过。'
  } else {
    $scripts = @{
      syncFunctions='sync-supabase-functions.ps1'; backup='backup-supabase.ps1'; resumeBackup='backup-supabase.ps1'
      verify='restore-local-supabase.ps1'; package='package-supabase-backup.ps1'; download='download-supabase-backup.ps1'
      restoreLocal='restore-local-supabase.ps1'; resumeLocal='restore-local-supabase.ps1'; restoreRemote='restore-supabase.ps1'
      publish='publish-supabase-backup.ps1'; setLocalLogin='set-local-login.ps1'
    }
    if (-not $scripts.ContainsKey($Operation)) { throw '不支持的运维操作。' }
    if ($Operation -eq 'verify') {
      $parameters.VerifyBackupOnly = $true
      $parameters.LocalRoot = $PSScriptRoot
      if ($env:SUPABASE_OPS_REPORT_PATH) { $parameters.VerificationReportPath = $env:SUPABASE_OPS_REPORT_PATH }
    }
    if ($Operation -eq 'resumeLocal') { $parameters.Resume = $true }
    & (Join-Path $PSScriptRoot $scripts[$Operation]) @parameters
  }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
