$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
. (Join-Path $PSScriptRoot 'backup-progress.ps1')
. (Join-Path $PSScriptRoot 'backup-functions.ps1')
$inputValues = [Console]::In.ReadToEnd() | ConvertFrom-Json
$backup = [IO.Path]::GetFullPath([string]$inputValues.BackupPath)
$stage = [IO.Path]::GetFullPath([string]$inputValues.StagePath)
$metadataPath = [IO.Path]::GetFullPath([string]$inputValues.FunctionMetadataPath)
foreach ($path in @($backup, $stage, $metadataPath)) { Assert-BackupPathWithoutLinks -Path $path }
$projectRef = 'ckbftoopuyophiebamwy'
$functions = @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath $metadataPath -Raw -Encoding UTF8) -Description 'updated function deployment list')
$oldFunctions = @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath (Join-Path $backup 'metadata/functions.json') -Raw -Encoding UTF8) -Description 'existing function deployment list')
$oldBySlug = @{}
foreach ($function in $oldFunctions) { $oldBySlug[[string]$function.slug] = $function }
foreach ($function in $functions) {
  $cached = Read-BackupFunctionCheckpoint -BackupPath $stage -ProjectRef $projectRef -Function $function
  if ($cached) { continue }
  $old = $oldBySlug[[string]$function.slug]
  if (-not $old -or (Get-BackupFunctionIdentity -Function $old) -ne (Get-BackupFunctionIdentity -Function $function)) { continue }
  $source = Join-Path $backup "functions/$($function.slug)/_bundle"
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { continue }
  Assert-BackupPathWithoutLinks -Path $source
  $reused = Join-Path (Get-BackupIncompleteDirectory -BackupPath $stage) ("reuse-$([guid]::NewGuid().ToString('N').Substring(0, 12))")
  Copy-Item -LiteralPath $source -Destination $reused -Recurse -Force -ErrorAction Stop
  Save-BackupFunctionCheckpoint -BackupPath $stage -ProjectRef $projectRef -Function $function -SourcePath $reused | Out-Null
}
$installed = Join-Path $stage 'functions'
if ($functions.Count -gt 0) {
  $tree = New-BackupFunctionTree -BackupPath $stage -ProjectRef $projectRef -Functions $functions -ConfigPath (Join-Path $stage 'config.toml')
  if (Test-Path -LiteralPath $installed) {
    Move-BackupFunctionDirectory -BackupPath $stage -Source $installed -Destination (Join-Path (Get-BackupIncompleteDirectory -BackupPath $stage) ("old-$([guid]::NewGuid().ToString('N').Substring(0, 12))"))
  }
  Move-BackupFunctionDirectory -BackupPath $stage -Source $tree.source_path -Destination $installed
  Copy-Item -LiteralPath $tree.layout_path -Destination (Join-Path $stage 'metadata/function-layout.json') -Force
}
elseif (Test-Path -LiteralPath $installed) {
  Move-BackupFunctionDirectory -BackupPath $stage -Source $installed -Destination (Join-Path (Get-BackupIncompleteDirectory -BackupPath $stage) ("old-$([guid]::NewGuid().ToString('N').Substring(0, 12))"))
  $layout = Join-Path $stage 'metadata/function-layout.json'
  if (Test-Path -LiteralPath $layout) { Remove-Item -LiteralPath $layout -Force }
}
Copy-Item -LiteralPath $metadataPath -Destination (Join-Path $stage 'metadata/functions.json') -Force
