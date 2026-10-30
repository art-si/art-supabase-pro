[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef = 'ckbftoopuyophiebamwy',
  [securestring]$DbPassword,
  [string]$BackupRoot,
  [string]$DbUrl,
  [string]$ResumeBackupPath,
  [string]$UpdateBackupPath,
  [switch]$PlanOnly,
  [switch]$ApplyUpdate,
  [string]$PlanId,
  [switch]$RecoverUpdate
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
. (Join-Path $PSScriptRoot 'backup-progress.ps1')
. (Join-Path $PSScriptRoot 'backup-functions.ps1')

if ($UpdateBackupPath) {
  if ($ResumeBackupPath -or $BackupRoot -or $DbUrl) { throw '更新已有备份不能同时指定新建、续跑目录或其他数据库连接。' }
  & (Join-Path $PSScriptRoot 'update-supabase-backup.ps1') -UpdateBackupPath $UpdateBackupPath -DbPassword $DbPassword `
    -PlanOnly:$PlanOnly -ApplyUpdate:$ApplyUpdate -PlanId $PlanId -RecoverUpdate:$RecoverUpdate -ProjectRef $ProjectRef
  return
}
if ($PlanOnly -or $ApplyUpdate -or $PlanId -or $RecoverUpdate) { throw '请同时填写 -UpdateBackupPath 原完整备份目录。' }

function Invoke-Supabase {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & supabase @Arguments
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw 'A Supabase CLI command failed. See the preceding command output.'
  }
}

function Get-LinkedDatabaseConnection {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Password,
    [Parameter(Mandatory = $true)][string]$SourceProjectRef,
    [string]$DatabaseUrl
  )

  if ($DatabaseUrl) {
    $uri = [uri]$DatabaseUrl
    if ($uri.Scheme -notin @('postgres', 'postgresql')) {
      throw 'The database URL must use postgres:// or postgresql://.'
    }
    $user = ([uri]::UnescapeDataString($uri.UserInfo) -split ':')[0]
    $urlProjectRef = if ($uri.Host -match '^db\.([a-z0-9]{20})\.supabase\.co$') {
      $Matches[1]
    }
    elseif ($user -match '^postgres\.([a-z0-9]{20})$') {
      $Matches[1]
    }
    else { $null }
    if ($urlProjectRef -ne $SourceProjectRef) {
      throw 'The database URL must belong to the source project ref; refusing to mix two projects in one backup.'
    }
    return @{
      Host = $uri.Host
      Port = $uri.Port
      User = $user
      Database = $uri.AbsolutePath.TrimStart('/')
    }
  }

  # The CLI resolves the correct pooler host for the project. Capture, never print,
  # its dry-run output because it contains the database password.
  $dryRunArguments = @('db', 'dump', '--linked')
  if (-not [string]::IsNullOrWhiteSpace($Password)) {
    $dryRunArguments += @('--password', $Password)
  }
  $dryRunArguments += @('--data-only', '--dry-run')
  $dryRun = Invoke-SupabaseQuiet $dryRunArguments
  if (-not $dryRun.Succeeded) { throw 'Unable to resolve the linked database connection.' }
  $text = $dryRun.Output
  $dbHost = [regex]::Match($text, 'export PGHOST="([^"]+)"').Groups[1].Value
  $port = [regex]::Match($text, 'export PGPORT="([^"]+)"').Groups[1].Value
  $user = [regex]::Match($text, 'export PGUSER="([^"]+)"').Groups[1].Value
  $database = [regex]::Match($text, 'export PGDATABASE="([^"]+)"').Groups[1].Value
  if ([string]::IsNullOrWhiteSpace($dbHost) -or $port -notmatch '^\d+$' -or
      [string]::IsNullOrWhiteSpace($user) -or [string]::IsNullOrWhiteSpace($database)) {
    throw 'Unable to parse the database connection returned by the Supabase CLI.'
  }
  return @{ Host = $dbHost; Port = $port; User = $user; Database = $database }
}

function Test-DockerReady {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & docker version --format '{{.Server.Version}}' *> $null
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  return ($exitCode -eq 0)
}

function Invoke-SupabaseJsonWithRetry {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [int]$Attempts = 3,
    [switch]$AllowFailure
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $errorPath = "$OutputPath.stderr.tmp"
    $previousPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $stdout = & supabase @Arguments 2> $errorPath
      $exitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -eq 0) {
      $stdout | Set-Content -Path $OutputPath -Encoding utf8
      Remove-Item -LiteralPath $errorPath -Force -ErrorAction SilentlyContinue
      return $true
    }

    $stderrContent = if (Test-Path $errorPath) { Get-Content -Raw -Encoding UTF8 $errorPath } else { $null }
    $lastError = if ([string]::IsNullOrWhiteSpace($stderrContent)) {
      "Supabase CLI exited with code $exitCode."
    }
    else { $stderrContent.Trim() }
    Remove-Item -LiteralPath $errorPath -Force -ErrorAction SilentlyContinue

    if ($attempt -lt $Attempts) {
      Write-Warning "Supabase API request failed (attempt $attempt/$Attempts). Retrying..."
      Start-Sleep -Seconds (3 * $attempt)
    }
  }

  if ($AllowFailure) {
    [pscustomobject]@{
      captured = $false
      error = $lastError
      note = 'Supabase does not expose Edge Function secret values. Re-enter all secret values manually during restore.'
    } | ConvertTo-Json -Depth 3 | Set-Content -Path $OutputPath -Encoding utf8
    Write-Warning "Optional Supabase metadata could not be captured after $Attempts attempts. The backup will continue."
    return $false
  }

  throw "Supabase API request failed after $Attempts attempts: $lastError"
}

function Get-StorageLocalPath {
  param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$ObjectName
  )

  $path = $Destination
  foreach ($segment in ($ObjectName -split '/')) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq '.' -or $segment -eq '..') {
      throw "Unsafe Storage object path: $ObjectName"
    }
    $path = Join-Path $path $segment
  }

  $root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
  $resolved = [IO.Path]::GetFullPath($path)
  if (-not $resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe Storage object path: $ObjectName"
  }

  return $resolved
}

function Invoke-StorageList {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$ServiceRoleKey,
    [Parameter(Mandatory = $true)][string]$BucketId,
    [string]$Prefix = '',
    [int]$Offset = 0,
    [int]$Limit = 1000
  )

  $encodedBucket = [uri]::EscapeDataString($BucketId)
  $headers = New-StorageAdminHeaders -Key $ServiceRoleKey
  $body = @{
    prefix = $Prefix
    limit = $Limit
    offset = $Offset
    sortBy = @{
      column = 'name'
      order = 'asc'
    }
  } | ConvertTo-Json -Depth 5

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return @(Invoke-RestMethod `
        -Method Post `
        -Uri "https://$ProjectRef.supabase.co/storage/v1/object/list/$encodedBucket" `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $body `
        -TimeoutSec 60)
    }
    catch {
      if ($attempt -eq 3) { throw }
      Write-Warning "Storage object listing failed for bucket '$BucketId' (attempt $attempt/3). Retrying..."
      Start-Sleep -Seconds (3 * $attempt)
    }
  }
}

function Invoke-StorageObjectDownload {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$ServiceRoleKey,
    [Parameter(Mandatory = $true)][string]$BucketId,
    [Parameter(Mandatory = $true)][string]$ObjectName,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  $encodedBucket = [uri]::EscapeDataString($BucketId)
  $encodedObject = ConvertTo-StorageApiPath $ObjectName
  $headers = New-StorageAdminHeaders -Key $ServiceRoleKey
  New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Invoke-WebRequest `
        -Uri "https://$ProjectRef.supabase.co/storage/v1/object/$encodedBucket/$encodedObject" `
        -Headers $headers `
        -OutFile $OutputPath `
        -UseBasicParsing `
        -TimeoutSec 180 | Out-Null
      return
    }
    catch {
      if ($attempt -eq 3) { throw }
      Write-Warning "Storage object download failed for '$ObjectName' (attempt $attempt/3). Retrying..."
      Start-Sleep -Seconds (3 * $attempt)
    }
  }
}

function Save-StorageBucketViaApi {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$ServiceRoleKey,
    [Parameter(Mandatory = $true)][string]$BucketId,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  $downloaded = New-Object System.Collections.Generic.List[object]

  function Save-StoragePrefix {
    param([string]$Prefix)

    $offset = 0
    $limit = 1000
    do {
      $items = @(Invoke-StorageList `
        -ProjectRef $ProjectRef `
        -ServiceRoleKey $ServiceRoleKey `
        -BucketId $BucketId `
        -Prefix $Prefix `
        -Offset $offset `
        -Limit $limit)

      foreach ($item in $items) {
        $name = [string]$item.name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }

        $objectName = if ([string]::IsNullOrWhiteSpace($Prefix)) { $name } else { "$Prefix/$name" }
        $isFolder = (-not $item.id) -and (-not $item.metadata)
        if ($isFolder) {
          Save-StoragePrefix $objectName
          continue
        }

        $localPath = Get-StorageLocalPath -Destination $Destination -ObjectName $objectName
        Invoke-StorageObjectDownload `
          -ProjectRef $ProjectRef `
          -ServiceRoleKey $ServiceRoleKey `
          -BucketId $BucketId `
          -ObjectName $objectName `
          -OutputPath $localPath
        $downloaded.Add([pscustomobject]@{
          bucket = $BucketId
          object = $objectName
          path = $localPath.Substring($Destination.Length).TrimStart('\')
          bytes = (Get-Item -LiteralPath $localPath).Length
        }) | Out-Null
      }

      $offset += $items.Count
    } while ($items.Count -eq $limit)
  }

  Save-StoragePrefix ''
  return @($downloaded)
}

function Save-StorageBucket {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$BucketId,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][ref]$ServiceRoleKeyRef
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null

  Push-Location $Destination
  try {
    $cliResult = Invoke-SupabaseQuiet @('storage', 'cp', "ss:///$BucketId", '.', '--recursive', '--experimental', '--jobs', '4', '--workdir', (Split-Path -Parent $PSScriptRoot))
  }
  finally {
    Pop-Location
  }

  if ($cliResult.Succeeded) {
    if ($cliResult.Output) { Write-Host $cliResult.Output }
    $files = @(Get-ChildItem -LiteralPath $Destination -File -Recurse | ForEach-Object {
      [pscustomobject]@{
        path = $_.FullName.Substring($Destination.Length).TrimStart([char[]]'\/')
        bytes = $_.Length
      }
    })
    return [pscustomobject]@{
      bucket = $BucketId
      method = 'supabase-cli'
      files = $files
    }
  }

  Write-Warning "Supabase CLI Storage copy failed for bucket '$BucketId'; falling back to the Storage API."
  if ($cliResult.Error) { Write-Warning $cliResult.Error }
  if ([string]::IsNullOrWhiteSpace([string]$ServiceRoleKeyRef.Value)) {
    $ServiceRoleKeyRef.Value = Get-SupabaseServiceRoleKey $ProjectRef
  }

  $files = Save-StorageBucketViaApi `
    -ProjectRef $ProjectRef `
    -ServiceRoleKey ([string]$ServiceRoleKeyRef.Value) `
    -BucketId $BucketId `
    -Destination $Destination

  return [pscustomobject]@{
    bucket = $BucketId
    method = 'storage-api'
    files = $files
  }
}

$supabaseRoot = $PSScriptRoot
if (-not $BackupRoot) { $BackupRoot = Join-Path $supabaseRoot 'backups' }
$BackupRoot = [IO.Path]::GetFullPath($BackupRoot)
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = if ($ResumeBackupPath) { [IO.Path]::GetFullPath($ResumeBackupPath) } else { Join-Path $BackupRoot $timestamp }
Assert-BackupPathWithoutLinks -Path $backupPath
if ($ResumeBackupPath) {
  Write-Host '阶段：校验续跑条件'
  if (Test-Path -LiteralPath (Join-Path $backupPath 'manifest.json')) { throw '此备份已生成完成清单，请选择校验备份完整性；不能继续覆盖。' }
  $progress = Read-BackupProgress -BackupPath $backupPath -ProjectRef $ProjectRef
  $timestamp = Split-Path -Leaf $backupPath
}
elseif (Test-Path -LiteralPath $backupPath) {
  throw "Backup directory already exists: $backupPath. Wait one second and retry; existing backup files will not be overwritten."
}
else { $progress = New-BackupProgress -ProjectRef $ProjectRef }
$dumpDefinitions = @(Get-BackupDumpDefinitions)
$pendingDumps = @($dumpDefinitions | Where-Object { -not (Test-RecordedBackupDump -BackupPath $backupPath -Definition $_ -Progress $progress) })
$needsDatabase = $pendingDumps.Count -gt 0
if ($needsDatabase -and -not $DbPassword -and -not $DbUrl) {
  if ($env:CI) { throw '数据库导出尚未完成，请填写来源数据库密码后续跑；已完成并校验的文件会保留。' }
  $DbPassword = Read-Host '来源数据库密码（只用于本次未完成的导出）' -AsSecureString
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI is required. Install it first: https://supabase.com/docs/guides/local-development/cli/getting-started'
}
if ($needsDatabase -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
  if (Test-Path (Join-Path $dockerBin 'docker.exe')) { $env:Path = "$dockerBin;$env:Path" }
}
if ($needsDatabase -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required for supabase db dump. Install and start Docker Desktop, then rerun this script.'
}
if ($needsDatabase -and -not (Test-DockerReady)) { throw 'Docker Desktop 尚未就绪，请启动后再续跑。' }
if ($needsDatabase) { Assert-NoRunningBackupDump -ProjectRef $ProjectRef }
Enable-SystemProxyForSupabaseCli
Assert-SupabaseCliProjectAccess -ProjectRef $ProjectRef
$plainPassword = if ($DbPassword) { Get-PlainText $DbPassword } else { $null }

Push-Location (Split-Path -Parent $supabaseRoot)
try {
  New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
  $databasePath = Join-Path $backupPath 'database'
  $storagePath = Join-Path $backupPath 'storage'
  $functionsPath = Join-Path $backupPath 'functions'
  $metadataPath = Join-Path $backupPath 'metadata'
  New-Item -ItemType Directory -Force -Path $databasePath, $storagePath, $metadataPath | Out-Null
  Write-Host "备份目录：$backupPath"

  if (-not $ResumeBackupPath) {
    # Reuse an existing matching link. Calling `supabase link` on every backup is
    # unnecessary and requires the Management API to be reachable.
    $linkedProjectFile = Join-Path $supabaseRoot '.temp\linked-project.json'
    $linkedProjectRef = $null
    if (Test-Path $linkedProjectFile) {
      try { $linkedProjectRef = (Get-Content -Raw -Encoding UTF8 $linkedProjectFile | ConvertFrom-Json).ref } catch {}
    }
    if ($linkedProjectRef -eq $ProjectRef) {
      Write-Host 'Reusing the existing source-project link...'
    }
    else {
      Write-Host 'Linking the source project...'
      $linkArguments = @('link', '--project-ref', $ProjectRef)
      if (-not [string]::IsNullOrWhiteSpace($plainPassword)) {
        $linkArguments += @('--password', $plainPassword)
      }
      Invoke-Supabase $linkArguments
    }
  }
  else {
    Write-Host "按阶段继续已有备份：$backupPath"
    $linkedRefFile = Join-Path $supabaseRoot '.temp/project-ref'
    if (-not (Test-Path -LiteralPath $linkedRefFile)) { throw '找不到来源项目关联，请先关联原 Supabase 项目后再续跑。' }
    $linkedRef = (Get-Content -LiteralPath $linkedRefFile -Raw -Encoding UTF8).Trim()
    if ($linkedRef -ne $ProjectRef) { throw 'The linked CLI project does not match the source project.' }
    Write-Warning '续跑会沿用已完成导出并重做失败阶段；各阶段并非同一事务快照。请避免更改来源结构，恢复前核对业务一致性。'
  }
  Save-BackupProgress -BackupPath $backupPath -Progress $progress
  $dbTarget = if ($DbUrl) { @('--db-url', $DbUrl) }
    elseif (-not [string]::IsNullOrWhiteSpace($plainPassword)) { @('--linked', '--password', $plainPassword) }
    else { @('--linked') }
  # Management API queries do not accept --password.
  $queryTarget = if ($DbUrl) { @('--db-url', $DbUrl) } else { @('--linked') }
  $connectionUrl = if (-not $needsDatabase -and -not $DbUrl) {
    (Get-Content -LiteralPath (Join-Path $supabaseRoot '.temp/pooler-url') -Raw -Encoding UTF8).Trim()
  } else { $DbUrl }
  $connection = Get-LinkedDatabaseConnection -Password $plainPassword -SourceProjectRef $ProjectRef -DatabaseUrl $connectionUrl
  foreach ($definition in $dumpDefinitions) {
    Invoke-BackupDatabaseDump -BackupPath $backupPath -Definition $definition -TargetArguments $dbTarget -Progress $progress
  }
  Write-Host '阶段：读取函数清单'
  $functionMetadataPath = Join-Path $metadataPath 'functions.json'
  Invoke-SupabaseJsonWithRetry `
    -Arguments @('functions', 'list', '--project-ref', $ProjectRef, '--output', 'json') `
    -OutputPath $functionMetadataPath | Out-Null
  $deployedFunctions = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath $functionMetadataPath -Raw -Encoding UTF8) `
    -Description 'the deployed Edge Function list')

  # Download into this backup's own Supabase workdir so remote source never
  # overwrites reviewed or uncommitted files in the main repository.
  if ($deployedFunctions.Count -gt 0) {
    $functionMetadataHash = Get-BackupFunctionSetHash -Functions $deployedFunctions
    Write-Host '阶段：校验函数源码进度'
    $functionProgress = Read-BackupFunctionProgress -BackupPath $backupPath -ProjectRef $ProjectRef -MetadataHash $functionMetadataHash
    # A legacy merged tree cannot prove which _shared files belonged to each
    # deployed function. Preserve it, but build isolated checkpoints once.
    if ($functionProgress -and -not (Get-BackupFunctionLayout -Root $backupPath)) { $functionProgress = $null }
    if (-not $functionProgress -and (Test-Path -LiteralPath (Join-Path $metadataPath 'functions-progress.json'))) {
      Write-Host '函数阶段需要补齐校验：仅补失败、变化或缺少独立缓存的函数；已校验 SQL 保留。'
    }
    if (-not $functionProgress) {
      $tree = New-BackupFunctionTree -BackupPath $backupPath -ProjectRef $ProjectRef -Functions $deployedFunctions -ConfigPath (Join-Path $supabaseRoot 'config.toml')
      Write-Host '阶段：复核函数部署版本'
      $checkPath = Join-Path (Get-BackupIncompleteDirectory -BackupPath $backupPath) ("functions-check-$([guid]::NewGuid()).json")
      Invoke-SupabaseJsonWithRetry -Arguments @('functions', 'list', '--project-ref', $ProjectRef, '--output', 'json') -OutputPath $checkPath | Out-Null
      $confirmedFunctions = @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath $checkPath -Raw -Encoding UTF8) -Description 'the verified Edge Function list')
      if ((Get-BackupFunctionSetHash -Functions $confirmedFunctions) -ne $functionMetadataHash) {
        throw '下载期间远端函数部署发生变化。已下载函数均保留；请从原备份目录继续，仅重新下载发生变化的函数。'
      }
      Copy-Item -LiteralPath $tree.layout_path -Destination (Join-Path $metadataPath 'function-layout.json') -Force -ErrorAction Stop
      $functionProgress = Save-BackupFunctionProgress -BackupPath $backupPath -ProjectRef $ProjectRef -SourcePath $tree.source_path -MetadataHash $functionMetadataHash
    }
    else { Write-Host '复用已下载并逐文件校验的函数源码。' }
    $freshFunctions = [string]$functionProgress.source_path
    if ([IO.Path]::GetFullPath($freshFunctions).TrimEnd([char[]]'\/') -ne [IO.Path]::GetFullPath($functionsPath).TrimEnd([char[]]'\/')) {
      Write-Host '阶段：安装已校验的函数源码'
      Assert-BackupPathWithoutLinks -Path $functionsPath
      $outsideSnapshot = Get-BackupIncompleteDirectory -BackupPath $backupPath
      if (Test-Path -LiteralPath $functionsPath) {
        Move-BackupFunctionDirectory -BackupPath $backupPath -Source $functionsPath -Destination (Join-Path $outsideSnapshot ("functions-old-$([guid]::NewGuid())"))
      }
      Move-BackupFunctionDirectory -BackupPath $backupPath -Source $freshFunctions -Destination $functionsPath
      if (-not (Test-BackupFunctionFiles -Root $functionsPath -Files @($functionProgress.files))) {
        throw '函数安装后的文件校验未通过，已保留源码，请核对原目录后续跑。'
      }
      $functionProgress = Save-BackupFunctionProgress -BackupPath $backupPath -ProjectRef $ProjectRef -SourcePath $functionsPath -MetadataHash $functionMetadataHash
    }
    # Keep failed/intermediate downloads outside the snapshot and its manifest.
  }
  elseif (Test-Path -LiteralPath $functionsPath) {
    Assert-BackupPathWithoutLinks -Path $functionsPath
    $outsideSnapshot = Get-BackupIncompleteDirectory -BackupPath $backupPath
    Move-BackupFunctionDirectory -BackupPath $backupPath -Source $functionsPath -Destination (Join-Path $outsideSnapshot ("functions-old-$([guid]::NewGuid())"))
  }
  if ($deployedFunctions.Count -eq 0) {
    $layoutPath = Join-Path $metadataPath 'function-layout.json'
    Assert-BackupPathWithoutLinks -Path $layoutPath
    if (Test-Path -LiteralPath $layoutPath -PathType Leaf) { Remove-Item -LiteralPath $layoutPath -Force -ErrorAction Stop }
  }
  Invoke-SupabaseJsonWithRetry `
    -Arguments @('secrets', 'list', '--project-ref', $ProjectRef, '--output', 'json') `
    -OutputPath (Join-Path $metadataPath 'edge-function-secret-names.json') `
    -AllowFailure | Out-Null
  $storageBucketSql = 'select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at from storage.buckets order by id'
  $storageBucketResult = Invoke-SupabaseQuiet (@('db', 'query') + $queryTarget + @('--agent=no', '--output', 'json', $storageBucketSql))
  if (-not $storageBucketResult.Succeeded) { throw 'Unable to list Storage buckets.' }
  $storageBucketResult.Output |
    Set-Content -Path (Join-Path $metadataPath 'storage-buckets.json') -Encoding utf8
  $realtimeSql = "select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by schemaname, tablename"
  $realtimeResult = Invoke-SupabaseQuiet (@('db', 'query') + $queryTarget + @('--agent=no', '--output', 'json', $realtimeSql))
  if (-not $realtimeResult.Succeeded) { throw 'Unable to list Realtime publication tables.' }
  $realtimeResult.Output |
    Set-Content -Path (Join-Path $metadataPath 'realtime-publication-tables.json') -Encoding utf8
  [void]@(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath (Join-Path $metadataPath 'realtime-publication-tables.json') -Raw -Encoding UTF8) `
    -Description 'the Realtime publication list')

  $storageCountSql = 'select bucket_id, count(*)::bigint as object_count from storage.objects group by bucket_id order by bucket_id'
  $storageCountResult = Invoke-SupabaseQuiet (@('db', 'query') + $queryTarget + @('--agent=no', '--output', 'json', $storageCountSql))
  if (-not $storageCountResult.Succeeded) { throw 'Unable to count Storage objects.' }
  $storageCountResult.Output |
    Set-Content -Path (Join-Path $metadataPath 'storage-object-counts.json') -Encoding utf8
  $storageCounts = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath (Join-Path $metadataPath 'storage-object-counts.json') -Raw -Encoding UTF8) `
    -Description 'the Storage object counts')
  $expectedObjectCounts = @{}
  foreach ($row in $storageCounts) {
    if ($null -eq $row.bucket_id -or $row.object_count -notmatch '^\d+$') {
      throw 'Invalid Storage object count returned by the source project.'
    }
    $expectedObjectCounts[[string]$row.bucket_id] = [long]$row.object_count
  }

  $bucketText = Get-Content -Raw -Encoding UTF8 (Join-Path $metadataPath 'storage-buckets.json')
  $buckets = @(ConvertFrom-SupabaseJsonArray -Text $bucketText -Description 'the Storage bucket list')
  $storageDownloadReport = New-Object System.Collections.Generic.List[object]
  $serviceRoleKey = $null
  foreach ($bucket in $buckets) {
    if ($bucket.id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
      throw "Storage bucket ID cannot be represented safely in a local backup path: $($bucket.id)"
    }
    $destination = Join-Path $storagePath $bucket.id
    Write-Host "Downloading Storage bucket '$($bucket.id)'..."
    $report = Save-StorageBucket `
      -ProjectRef $ProjectRef `
      -BucketId $bucket.id `
      -Destination $destination `
      -ServiceRoleKeyRef ([ref]$serviceRoleKey)
    $downloadedCount = @(Get-ChildItem -LiteralPath $destination -File -Recurse).Count
    $expectedCount = if ($expectedObjectCounts.ContainsKey([string]$bucket.id)) {
      $expectedObjectCounts[[string]$bucket.id]
    }
    else { 0 }
    if ($downloadedCount -ne $expectedCount) {
      throw "Storage bucket '$($bucket.id)' has $expectedCount objects but only $downloadedCount local files. The backup is incomplete."
    }
    $storageDownloadReport.Add($report) | Out-Null
  }
  $storageDownloadReport |
    ConvertTo-Json -Depth 8 |
    Set-Content -Path (Join-Path $metadataPath 'storage-download-report.json') -Encoding utf8
  $serviceRoleKey = $null

  $configSource = Join-Path $supabaseRoot 'config.toml'
  if (Test-Path $configSource) { Copy-Item $configSource (Join-Path $backupPath 'config.toml') -Force }
  $connection | ConvertTo-Json | Set-Content -Path (Join-Path $metadataPath 'database-connection.json') -Encoding utf8

  foreach ($definition in $dumpDefinitions) {
    if (-not (Test-RecordedBackupDump -BackupPath $backupPath -Definition $definition -Progress $progress)) {
      throw '最终校验发现数据库导出不完整，未生成完成清单，请保留目录后续跑。'
    }
  }
  $files = Get-ChildItem -LiteralPath $backupPath -File -Recurse -Force | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName.Substring($backupPath.Length + 1)
      bytes = $_.Length
      sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
  }
  $manifestStaging = Join-Path (Get-BackupIncompleteDirectory -BackupPath $backupPath) ("manifest-$([guid]::NewGuid()).json.tmp")
  [pscustomobject]@{
    format_version = 1
    created_at = (Get-Date).ToUniversalTime().ToString('o')
    project_ref = $ProjectRef
    consistency = @{
      method = 'independent-logical-exports'
      resumed = [bool]$progress.resumed
      started_at = $progress.created_at
      note = 'Database dumps, functions and Storage are captured in separate phases, not one shared transaction snapshot. Verify application consistency before relying on a restored environment.'
    }
    supabase_cli = (& supabase --version)
    includes = @('database roles', 'database schema', 'database data', 'migration history', 'managed auth/storage schema snapshot', 'RLS policies/grants/functions/triggers', 'Realtime publication tables', 'Storage bucket files', 'Storage bucket metadata', 'Edge Function source and JWT settings')
    limitations = @('The auth/storage schema snapshot is a recovery reference, not an automatic restore script. Review and extract only project-specific policies and triggers because Supabase owns the managed base schemas.', 'Edge Function secret values cannot be read back from Supabase; only their names are recorded. Re-enter their values on the target project.', 'Dashboard-only settings such as OAuth providers, SMTP, custom domains, and Auth URL configuration must be recreated separately.', 'If the source uses Vault or encrypted columns, transfer the encryption root key through the supported Supabase procedure before restoring data.', 'Custom LOGIN role passwords must be restored separately. Function import maps or deno.json omitted by the deployed bundle require the reviewed original source.')
    files = $files
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestStaging -Encoding utf8
  $completedManifest = Get-Content -LiteralPath $manifestStaging -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-BackupManifest -Root $backupPath -Manifest $completedManifest
  Move-Item -LiteralPath $manifestStaging -Destination (Join-Path $backupPath 'manifest.json')

  @"
# Supabase backup $timestamp

Package this snapshot for verified delivery with:

```powershell
.\supabase\package-supabase-backup.ps1 -BackupPath '$backupPath'
```

Restore into an isolated local Supabase stack with:

```powershell
.\supabase\restore-local-supabase.ps1 -BackupPath '$backupPath' -LocalRoot '<new-local-directory>'
```

Or restore to a new, empty remote Supabase project with:

```powershell
.\supabase\restore-supabase.ps1 -BackupPath '$backupPath' -TargetProjectRef '<new-project-ref>'
```

The remote restore prompts for the target database password. Local restore needs no source credentials. This backup contains application data and Storage files, so keep it outside Git and share only with authorized recipients. Review the limitations in manifest.json and supabase/README.zh-CN.md before importing.
"@ | Set-Content -Path (Join-Path $backupPath 'README.md') -Encoding utf8

  Write-Host "Backup completed: $backupPath" -ForegroundColor Green
}
finally {
  Pop-Location
  $plainPassword = $null
}
