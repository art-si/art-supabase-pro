[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
$projectRef = 'ckbftoopuyophiebamwy'
Write-Host '阶段：检查来源项目登录'
Assert-SupabaseCliProjectAccess -ProjectRef $projectRef -NonInteractive
Write-Host '阶段：读取函数清单'
$result = Invoke-SupabaseQuietWithRetry @('functions', 'list', '--project-ref', $projectRef, '--output', 'json', '--agent=no')
if (-not $result.Succeeded) { throw '读取函数清单失败，请检查 CLI 登录和网络连接。' }
$functions = @(ConvertFrom-SupabaseJsonArray -Text $result.Output -Description 'Edge Functions')
$snapshot = Join-Path $PSScriptRoot ('backups/functions-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path (Join-Path $snapshot 'supabase') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'config.toml') -Destination (Join-Path $snapshot 'supabase/config.toml')
$done = 0
Push-Location $snapshot
try {
  foreach ($function in $functions) {
    $slug = [string]$function.slug
    if ($slug -notmatch '^[a-z0-9][a-z0-9_-]*$') { throw '函数名称无效，已停止同步。' }
    Write-Host "阶段：逐个下载函数 · $($done + 1)/$($functions.Count) · $slug"
    & supabase functions download $slug --project-ref $projectRef --use-api --agent=no
    if ($LASTEXITCODE -ne 0) { throw "函数 $slug 下载失败，已保留本次快照。" }
    if (-not (Test-Path -LiteralPath (Join-Path $snapshot "supabase/functions/$slug") -PathType Container)) { throw "函数 $slug 源码缺失。" }
    $done++
  }
  Write-Host '阶段：校验源码快照'
  $functions | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $snapshot 'functions.json') -Encoding utf8
  Write-Host "源码快照：$snapshot"
} finally { Pop-Location }
