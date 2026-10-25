[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef = 'ckbftoopuyophiebamwy',
  [securestring]$DbPassword,
  [string]$BackupRoot,
  [string]$DbUrl,
  [string]$ResumeBackupPath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')

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

    $stderrContent = if (Test-Path $errorPath) { Get-Content -Raw $errorPath } else { $null }
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

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI is required. Install it first: https://supabase.com/docs/guides/local-development/cli/getting-started'
}
if (-not $ResumeBackupPath -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
  if (Test-Path (Join-Path $dockerBin 'docker.exe')) { $env:Path = "$dockerBin;$env:Path" }
}
if (-not $ResumeBackupPath -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required for supabase db dump. Install and start Docker Desktop, then rerun this script.'
}
if (-not $ResumeBackupPath -and -not (Test-DockerReady)) { throw 'Docker Desktop is installed but not running.' }
Enable-SystemProxyForSupabaseCli
Assert-SupabaseCliProjectAccess -ProjectRef $ProjectRef
$supabaseRoot = $PSScriptRoot
if (-not $BackupRoot) { $BackupRoot = Join-Path $supabaseRoot 'backups' }
$BackupRoot = [IO.Path]::GetFullPath($BackupRoot)
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = if ($ResumeBackupPath) { [IO.Path]::GetFullPath($ResumeBackupPath) } else { Join-Path $BackupRoot $timestamp }
if ($ResumeBackupPath) {
  if (Test-Path -LiteralPath (Join-Path $backupPath 'manifest.json')) { throw 'This backup already has a completion manifest; refusing to overwrite it.' }
  foreach ($name in @('roles.sql', 'schema.sql', 'data.sql', 'migration-history-schema.sql', 'migration-history-data.sql', 'managed-schema-snapshot.sql')) {
    $dump = Join-Path $backupPath "database/$name"
    if (-not (Test-Path -LiteralPath $dump -PathType Leaf) -or (Get-Item -LiteralPath $dump).Length -eq 0) {
      throw "Cannot resume: missing or incomplete database dump $name."
    }
    $endPattern = switch ($name) {
      'roles.sql' { '^RESET ALL;$' }
      'migration-history-schema.sql' { 'ADD CONSTRAINT .* PRIMARY KEY' }
      default { '^-- PostgreSQL database dump complete' }
    }
    if (-not ((Get-Content -LiteralPath $dump -Tail 12) -match $endPattern)) { throw "Cannot resume: incomplete database dump $name." }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $backupPath 'metadata/functions.json') -PathType Leaf)) { throw 'Cannot resume without saved Edge Function metadata.' }
  $timestamp = Split-Path -Leaf $backupPath
}
elseif (Test-Path -LiteralPath $backupPath) {
  throw "Backup directory already exists: $backupPath. Wait one second and retry; existing backup files will not be overwritten."
}
$plainPassword = if ($DbPassword) { Get-PlainText $DbPassword } else { $null }

Push-Location (Split-Path -Parent $supabaseRoot)
try {
  New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
  $databasePath = Join-Path $backupPath 'database'
  $storagePath = Join-Path $backupPath 'storage'
  $functionsPath = Join-Path $backupPath 'functions'
  $metadataPath = Join-Path $backupPath 'metadata'
  New-Item -ItemType Directory -Force -Path $databasePath, $storagePath, $metadataPath | Out-Null

  if (-not $ResumeBackupPath) {
    # Reuse an existing matching link. Calling `supabase link` on every backup is
    # unnecessary and requires the Management API to be reachable.
    $linkedProjectFile = Join-Path $supabaseRoot '.temp\linked-project.json'
    $linkedProjectRef = $null
    if (Test-Path $linkedProjectFile) {
      try { $linkedProjectRef = (Get-Content -Raw $linkedProjectFile | ConvertFrom-Json).ref } catch {}
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
    $dbTarget = if ($DbUrl) {
      @('--db-url', $DbUrl)
    }
    elseif (-not [string]::IsNullOrWhiteSpace($plainPassword)) {
      @('--linked', '--password', $plainPassword)
    }
    else {
      @('--linked')
    }
    # `db query --linked` uses the Management API and does not accept --password,
    # while dump commands do. Keep command-specific targets separate.
    $queryTarget = if ($DbUrl) { @('--db-url', $DbUrl) } else { @('--linked') }
    $connection = Get-LinkedDatabaseConnection -Password $plainPassword -SourceProjectRef $ProjectRef -DatabaseUrl $DbUrl

    Write-Host 'Exporting database roles, schema, and data...'
    Invoke-Supabase (@('db', 'dump') + $dbTarget + @('--role-only', '--file', (Join-Path $databasePath 'roles.sql')))
    Invoke-Supabase (@('db', 'dump') + $dbTarget + @('--keep-comments', '--file', (Join-Path $databasePath 'schema.sql')))
    # Match Supabase's logical restore guide: vector Storage tables may not exist
    # on a newly created target project.
    Invoke-Supabase (@('db', 'dump') + $dbTarget + @('--data-only', '--use-copy', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes', '--file', (Join-Path $databasePath 'data.sql')))
    Invoke-Supabase (@('db', 'dump') + $dbTarget + @('--schema', 'supabase_migrations', '--file', (Join-Path $databasePath 'migration-history-schema.sql')))
    Invoke-Supabase (@('db', 'dump') + $dbTarget + @('--schema', 'supabase_migrations', '--data-only', '--use-copy', '--file', (Join-Path $databasePath 'migration-history-data.sql')))
    # Standard schema dumps omit managed auth/storage schemas. Capture their complete
    # definitions as a recovery reference without requiring a shadow database. The
    # managed schemas are platform-owned and must not be replayed wholesale; restore
    # only reviewed project-specific policies/triggers from this snapshot.
    Invoke-Supabase (@('db', 'dump') + $dbTarget + @('--schema', 'auth,storage', '--keep-comments', '--file', (Join-Path $databasePath 'managed-schema-snapshot.sql')))

    Write-Host 'Capturing deployed Edge Function source and metadata...'
    $functionMetadataPath = Join-Path $metadataPath 'functions.json'
    Invoke-SupabaseJsonWithRetry `
      -Arguments @('functions', 'list', '--project-ref', $ProjectRef, '--output', 'json') `
      -OutputPath $functionMetadataPath | Out-Null
  }
  else {
    Write-Host "Resuming existing backup: $backupPath (database exports and function downloads are preserved)"
    $linkedRef = (Get-Content -LiteralPath (Join-Path $supabaseRoot '.temp/project-ref') -Raw).Trim()
    if ($linkedRef -ne $ProjectRef) { throw 'The linked CLI project does not match the source project.' }
    $poolerUrl = (Get-Content -LiteralPath (Join-Path $supabaseRoot '.temp/pooler-url') -Raw).Trim()
    $connection = Get-LinkedDatabaseConnection -Password '' -SourceProjectRef $ProjectRef -DatabaseUrl $poolerUrl
    $queryTarget = @('--linked')
    $functionMetadataPath = Join-Path $metadataPath 'functions.json'
  }
  $deployedFunctions = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath $functionMetadataPath -Raw) `
    -Description 'the deployed Edge Function list')

  # Download into this backup's own Supabase workdir so remote source never
  # overwrites reviewed or uncommitted files in the main repository.
  if ($deployedFunctions.Count -gt 0) {
    $downloadProjectRoot = Join-Path $backupPath 'supabase'
    if (-not $ResumeBackupPath) {
      New-Item -ItemType Directory -Path $downloadProjectRoot -Force | Out-Null
      Copy-Item -LiteralPath (Join-Path $supabaseRoot 'config.toml') -Destination (Join-Path $downloadProjectRoot 'config.toml') -Force
      Push-Location $backupPath
      try {
        Invoke-Supabase @('functions', 'download', '--project-ref', $ProjectRef, '--use-api')
      }
      finally {
        Pop-Location
      }
    }
    $downloadedFunctions = Join-Path $downloadProjectRoot 'functions'
    if (-not (Test-Path -LiteralPath $downloadedFunctions -PathType Container)) {
      throw 'The Supabase CLI did not download Edge Functions into the backup workdir.'
    }
    $backupPrefix = [IO.Path]::GetFullPath($backupPath).TrimEnd([char[]]'\\/') + [IO.Path]::DirectorySeparatorChar
    if (-not [IO.Path]::GetFullPath($downloadedFunctions).StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'The Edge Function download path is outside the backup directory.'
    }
    foreach ($function in $deployedFunctions) {
      if ($function.slug -notmatch '^[a-z0-9][a-z0-9_-]*$' -or
          -not (Test-Path -LiteralPath (Join-Path $downloadedFunctions $function.slug) -PathType Container)) {
        throw "Missing or invalid downloaded Edge Function: $($function.slug)"
      }
    }
    New-Item -ItemType Directory -Path $functionsPath -Force | Out-Null
    foreach ($sourceFile in (Get-ChildItem -LiteralPath $downloadedFunctions -File -Recurse)) {
      $relativePath = $sourceFile.FullName.Substring($downloadedFunctions.Length + 1)
      $targetFile = Join-Path $functionsPath $relativePath
      New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force | Out-Null
      Copy-Item -LiteralPath $sourceFile.FullName -Destination $targetFile -Force
      if ((Get-FileHash -LiteralPath $sourceFile.FullName).Hash -ne (Get-FileHash -LiteralPath $targetFile).Hash) {
        throw "Edge Function copy verification failed: $relativePath"
      }
    }
    # Keep the downloaded staging directory: Windows can lock it while CLI child
    # processes exit. It also preserves the original source if continuation fails.
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
    -Text (Get-Content -LiteralPath (Join-Path $metadataPath 'realtime-publication-tables.json') -Raw) `
    -Description 'the Realtime publication list')

  $storageCountSql = 'select bucket_id, count(*)::bigint as object_count from storage.objects group by bucket_id order by bucket_id'
  $storageCountResult = Invoke-SupabaseQuiet (@('db', 'query') + $queryTarget + @('--agent=no', '--output', 'json', $storageCountSql))
  if (-not $storageCountResult.Succeeded) { throw 'Unable to count Storage objects.' }
  $storageCountResult.Output |
    Set-Content -Path (Join-Path $metadataPath 'storage-object-counts.json') -Encoding utf8
  $storageCounts = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath (Join-Path $metadataPath 'storage-object-counts.json') -Raw) `
    -Description 'the Storage object counts')
  $expectedObjectCounts = @{}
  foreach ($row in $storageCounts) {
    if ($null -eq $row.bucket_id -or $row.object_count -notmatch '^\d+$') {
      throw 'Invalid Storage object count returned by the source project.'
    }
    $expectedObjectCounts[[string]$row.bucket_id] = [long]$row.object_count
  }

  $bucketText = Get-Content -Raw (Join-Path $metadataPath 'storage-buckets.json')
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

  $files = Get-ChildItem -Path $backupPath -File -Recurse | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName.Substring($backupPath.Length + 1)
      bytes = $_.Length
      sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
  }
  [pscustomobject]@{
    format_version = 1
    created_at = (Get-Date).ToUniversalTime().ToString('o')
    project_ref = $ProjectRef
    supabase_cli = (& supabase --version)
    includes = @('database roles', 'database schema', 'database data', 'migration history', 'managed auth/storage schema snapshot', 'RLS policies/grants/functions/triggers', 'Realtime publication tables', 'Storage bucket files', 'Storage bucket metadata', 'Edge Function source and JWT settings')
    limitations = @('The auth/storage schema snapshot is a recovery reference, not an automatic restore script. Review and extract only project-specific policies and triggers because Supabase owns the managed base schemas.', 'Edge Function secret values cannot be read back from Supabase; only their names are recorded. Re-enter their values on the target project.', 'Dashboard-only settings such as OAuth providers, SMTP, custom domains, and Auth URL configuration must be recreated separately.', 'If the source uses Vault or encrypted columns, transfer the encryption root key through the supported Supabase procedure before restoring data.', 'Custom LOGIN role passwords and Edge Function import maps or deno.json files must be restored separately.')
    files = $files
  } | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $backupPath 'manifest.json') -Encoding utf8

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
