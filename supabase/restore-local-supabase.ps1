[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })][string]$BackupPath,
  [Parameter(Mandatory = $true)][string]$LocalRoot,
  [switch]$VerifyBackupOnly,
  [switch]$Resume
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')

$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$manifestPath = Join-Path $BackupPath 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'The backup is incomplete: manifest.json is missing.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $BackupPath -Manifest $manifest
if ($VerifyBackupOnly) {
  Write-Host "Backup verified: $BackupPath" -ForegroundColor Green
  return
}

$LocalRoot = [IO.Path]::GetFullPath($LocalRoot)
$backupPrefix = $BackupPath.TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
if ($LocalRoot.StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The local Supabase destination must be outside the verified backup directory.'
}
$markerPath = Join-Path $LocalRoot 'transfer-origin.json'
if ($Resume) {
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw 'Cannot resume: the local destination has no transfer-origin.json marker.'
  }
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($marker.manifest_sha256 -ne (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash) {
    throw 'Cannot resume: this backup differs from the one used to create the local stack.'
  }
}
elseif (Test-Path -LiteralPath $LocalRoot) {
  throw "Local destination already exists; choose a fresh directory: $LocalRoot"
}
$localParent = Split-Path -Parent $LocalRoot
if (-not (Test-Path -LiteralPath $localParent -PathType Container)) {
  throw "Local destination parent directory does not exist: $localParent"
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI is required to start the local stack.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
  if (Test-Path (Join-Path $dockerBin 'docker.exe')) { $env:Path = "$dockerBin;$env:Path" }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required to restore a local Supabase stack.'
}
$previousPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  & docker version --format '{{.Server.Version}}' *> $null
  $dockerReady = ($LASTEXITCODE -eq 0)
}
finally { $ErrorActionPreference = $previousPreference }
if (-not $dockerReady) { throw 'Docker Desktop is installed but not running.' }

$supabaseRoot = Join-Path $LocalRoot 'supabase'
if (-not $Resume) {
  New-Item -ItemType Directory -Path $supabaseRoot -Force | Out-Null
  $configText = Get-Content -LiteralPath (Join-Path $BackupPath 'config.toml') -Raw
  $localProjectId = "art-supabase-local-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  if ($configText -notmatch '(?m)^project_id\s*=\s*"[^"]+"') {
    throw 'The backed-up config.toml has no project_id.'
  }
  $configText = $configText -replace '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$localProjectId`""
  # The platform frontend runs on port 3006 in this repository.
  $configText = $configText -replace '(?m)^site_url\s*=\s*"[^"]+"', 'site_url = "http://127.0.0.1:3006"'
  $configText = $configText -replace '(?m)^additional_redirect_urls\s*=\s*\[[^\r\n]*\]', 'additional_redirect_urls = ["http://127.0.0.1:3006", "http://localhost:3006"]'
  $deployedFunctions = @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath (Join-Path $BackupPath 'metadata/functions.json') -Raw) -Description 'the function deployment settings')
  $configText = Set-BackupFunctionJwtConfig -Config $configText -Functions $deployedFunctions
  $serviceMetadataPath = Join-Path $BackupPath 'metadata/service-versions.json'
  if (Test-Path -LiteralPath $serviceMetadataPath) {
    $services = @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath $serviceMetadataPath -Raw) -Description 'the source service versions')
    $versionFiles = @{'supabase/postgres'='postgres-version';'supabase/gotrue'='gotrue-version';'supabase/storage-api'='storage-version'}
    $versionRoot = Join-Path $supabaseRoot '.temp'
    New-Item -ItemType Directory -Path $versionRoot -Force | Out-Null
    foreach ($service in $services) {
      if (-not $versionFiles.ContainsKey([string]$service.name) -or -not $service.remote) { continue }
      if ($service.remote -notmatch '^v?\d+(\.\d+){1,3}$') { throw 'Invalid source service version.' }
      [IO.File]::WriteAllText((Join-Path $versionRoot $versionFiles[[string]$service.name]), [string]$service.remote, [Text.UTF8Encoding]::new($false))
    }
  }
  [IO.File]::WriteAllText(
    (Join-Path $supabaseRoot 'config.toml'),
    $configText,
    [Text.UTF8Encoding]::new($false))
  # The backup is the seed. This avoids reading the source repository's seed.sql.
  [IO.File]::WriteAllText((Join-Path $supabaseRoot 'seed.sql'), '', [Text.UTF8Encoding]::new($false))
  $functionSource = Join-Path $BackupPath 'functions'
  if (Test-Path -LiteralPath $functionSource -PathType Container) {
    Copy-Item -LiteralPath $functionSource -Destination (Join-Path $supabaseRoot 'functions') -Recurse
  }
  [pscustomobject]@{
    manifest_sha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
    source_project_ref = [string]$manifest.project_ref
  } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
}

function Invoke-LocalSupabase {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & supabase @Arguments
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previous }
  if ($exitCode -ne 0) { throw "Local Supabase command failed: $($Arguments -join ' ')" }
}

function Get-LocalStatus {
  $result = Invoke-SupabaseQuiet @('status', '--output', 'json')
  if (-not $result.Succeeded) { throw "Unable to read local Supabase status. $($result.Error)" }
  try { $status = $result.Output | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Unable to parse local Supabase status JSON.' }
  if (-not $status.DB_URL -or -not $status.API_URL -or -not $status.SERVICE_ROLE_KEY) {
    throw 'Local Supabase status is missing DB_URL, API_URL, or SERVICE_ROLE_KEY.'
  }
  $dbUri = [uri]$status.DB_URL
  $apiUri = [uri]$status.API_URL
  if ($dbUri.Host -notin @('127.0.0.1', 'localhost', '::1') -or
      $apiUri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
    throw 'The reported database or API URL is not local; refusing to restore.'
  }
  return $status
}

function Invoke-LocalPsql {
  param(
    [Parameter(Mandatory = $true)][uri]$DbUri,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$CaptureOutput
  )
  $userInfo = [uri]::UnescapeDataString($DbUri.UserInfo)
  $parts = $userInfo -split ':', 2
  if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) {
    throw 'The local DB_URL has no database credentials.'
  }
  $connection = "host=host.docker.internal port=$($DbUri.Port) dbname=$($DbUri.AbsolutePath.TrimStart('/')) user=$($parts[0]) sslmode=disable"
  $previousPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
  $previous = $ErrorActionPreference
  try {
    $env:PGPASSWORD = $parts[1]
    $ErrorActionPreference = 'Continue'
    $output = & docker run --rm --add-host host.docker.internal:host-gateway `
      -v "${BackupPath}:/backup:ro" -e PGPASSWORD --entrypoint psql $postgresClientImage `
      -X $connection @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previous
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $previousPassword, 'Process')
  }
  if ($CaptureOutput) {
    if ($exitCode -ne 0) { throw 'Local database query failed.' }
    return (($output | Out-String).Trim())
  }
  foreach ($line in @($output)) { Write-Host $line }
  if ($exitCode -ne 0) { throw 'Local database restore failed; Storage files were not imported.' }
}

function Invoke-LocalPsqlRestore {
  param(
    [Parameter(Mandatory = $true)][uri]$DbUri,
    [switch]$MigrationSchemaExists
  )
  # NOT VALID checks can intentionally coexist with historical invalid rows.
  # COPY still enforces them, so restore them after the data in this same
  # transaction, preserving their definitions and NOT VALID state.
  $deferChecks = @'
CREATE TEMP TABLE art_backup_deferred_checks AS
SELECT n.nspname AS schema_name, t.relname AS table_name, c.conname,
       pg_get_constraintdef(c.oid) AS definition,
       obj_description(c.oid, 'pg_constraint') AS description
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'c' AND NOT c.convalidated
  AND t.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user);
DO $restore$ DECLARE item record; BEGIN
  FOR item IN SELECT * FROM pg_temp.art_backup_deferred_checks LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', item.schema_name, item.table_name, item.conname);
  END LOOP;
END $restore$;
'@
  $restoreChecks = @'
DO $restore$ DECLARE item record; BEGIN
  FOR item IN SELECT * FROM pg_temp.art_backup_deferred_checks LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', item.schema_name, item.table_name, item.conname, item.definition);
    IF item.description IS NOT NULL THEN
      EXECUTE format('COMMENT ON CONSTRAINT %I ON %I.%I IS %L', item.conname, item.schema_name, item.table_name, item.description);
    END IF;
  END LOOP;
END $restore$;
DROP TABLE pg_temp.art_backup_deferred_checks;
'@
  $arguments = @(
    '--single-transaction', '--variable', 'ON_ERROR_STOP=1',
    '--file', '/backup/database/roles.sql',
    '--file', '/backup/database/schema.sql',
    '--command', $deferChecks,
    '--command', 'SET session_replication_role = replica',
    '--file', '/backup/database/data.sql')
  if (Test-Path -LiteralPath (Join-Path $BackupPath 'database/recovery-snapshot-data.sql')) {
    $arguments += @('--file', '/backup/database/recovery-snapshot-data.sql')
  }
  $arguments += @('--command', $restoreChecks)
  if (Test-Path -LiteralPath (Join-Path $BackupPath 'database/managed-project-objects.sql')) {
    $arguments += @('--file', '/backup/database/managed-project-objects.sql')
  }
  if (-not $MigrationSchemaExists) {
    $arguments += @('--file', '/backup/database/migration-history-schema.sql')
  }
  $arguments += @('--file', '/backup/database/migration-history-data.sql')
  Invoke-LocalPsql -DbUri $DbUri -Arguments $arguments
}

function Invoke-LocalPsqlQuery {
  param(
    [Parameter(Mandatory = $true)][uri]$DbUri,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  return Invoke-LocalPsql -DbUri $DbUri -Arguments @('-At', '-F', "`t", '--variable', 'ON_ERROR_STOP=1', '--command', $Sql) -CaptureOutput
}

Push-Location $LocalRoot
try {
  $existingStatus = Invoke-SupabaseQuiet @('status', '--output', 'json')
  if (-not $existingStatus.Succeeded) {
    Write-Host 'Starting the isolated local Supabase project...'
    Invoke-LocalSupabase @('start')
  }
  $status = Get-LocalStatus
  $dbUri = [uri]$status.DB_URL
  # Reuse the database image already started by the CLI instead of pulling a
  # separate PostgreSQL client image (which can fail on restricted networks).
  $localConfig = Get-Content -LiteralPath (Join-Path $supabaseRoot 'config.toml') -Raw
  if ($localConfig -notmatch '(?m)^project_id\s*=\s*"([A-Za-z0-9_-]+)"') {
    throw 'Unable to identify the local database container.'
  }
  $postgresClientImage = (& docker inspect --format '{{.Config.Image}}' "supabase_db_$($Matches[1])" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $postgresClientImage -notmatch '^[A-Za-z0-9][A-Za-z0-9./_:@-]+$') {
    throw 'Unable to identify the running local database image.'
  }
  $countText = Invoke-LocalPsqlQuery -DbUri $dbUri -Sql "select (select count(*) from pg_tables where schemaname = 'public') + (select count(*) from auth.users) + (select count(*) from storage.buckets) + (select count(*) from storage.objects)"
  $targetCount = [long]0
  if (-not [long]::TryParse($countText, [ref]$targetCount)) {
    throw 'Unable to verify that the local target is empty.'
  }
  if ($targetCount -ne 0) {
    throw 'The local target already has application tables, Auth users, or Storage data; refusing to merge.'
  }
  $migrationSchemaExists = (Invoke-LocalPsqlQuery -DbUri $dbUri -Sql "select case when to_regclass('supabase_migrations.schema_migrations') is null then 0 else 1 end") -eq '1'
  if ($migrationSchemaExists) {
    $migrationCountText = Invoke-LocalPsqlQuery -DbUri $dbUri -Sql 'select count(*) from supabase_migrations.schema_migrations'
    $migrationCount = [long]0
    if (-not [long]::TryParse($migrationCountText, [ref]$migrationCount) -or $migrationCount -ne 0) {
      throw 'The local target already has migration history; refusing to merge.'
    }
  }

  Write-Host 'Restoring database roles, schema, data, and migration history to the local stack...'
  Invoke-LocalPsqlRestore -DbUri $dbUri -MigrationSchemaExists:$migrationSchemaExists

  $realtimePath = Join-Path $BackupPath 'metadata/realtime-publication-tables.json'
  $realtimeTables = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath $realtimePath -Raw) `
    -Description 'the backed-up Realtime publication list')
  $existingTableText = Invoke-LocalPsqlQuery -DbUri $dbUri -Sql "select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime'"
  $existingNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($line in @($existingTableText -split "`r?`n" | Where-Object { $_ })) {
    $columns = $line -split "`t", 2
    if ($columns.Count -ne 2) { throw 'Unable to parse local Realtime publication tables.' }
    [void]$existingNames.Add("$($columns[0]).$($columns[1])")
  }
  foreach ($table in $realtimeTables) {
    if ($table.schemaname -notmatch '^[A-Za-z_][A-Za-z0-9_$]*$' -or
        $table.tablename -notmatch '^[A-Za-z_][A-Za-z0-9_$]*$') {
      throw 'Invalid Realtime table identifier in the backup metadata.'
    }
    if ($existingNames.Contains("$($table.schemaname).$($table.tablename)")) { continue }
    Invoke-LocalPsqlQuery -DbUri $dbUri -Sql "alter publication supabase_realtime add table `"$($table.schemaname)`".`"$($table.tablename)`"" | Out-Null
  }

  $storageRoot = Join-Path $BackupPath 'storage'
  $storageMetadata = @{}
  $inventoryPath = Join-Path $BackupPath 'metadata/storage-object-inventory.json'
  if (Test-Path -LiteralPath $inventoryPath) {
    foreach ($object in @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath $inventoryPath -Raw) -Description 'the Storage object metadata')) {
      $storageMetadata["$($object.bucket_id)/$($object.name)"] = $object
    }
  }
  if (Test-Path -LiteralPath $storageRoot -PathType Container) {
    foreach ($bucket in @(Get-ChildItem -LiteralPath $storageRoot -Directory)) {
      $files = @(Get-ChildItem -LiteralPath $bucket.FullName -File -Recurse)
      if ($files.Count -eq 0) { continue }
      Write-Host "Restoring local Storage bucket '$($bucket.Name)'..."
      foreach ($file in $files) {
        $objectName = $file.FullName.Substring($bucket.FullName.Length + 1).Replace('\', '/')
        $objectMetadata = $storageMetadata["$($bucket.Name)/$objectName"]
        $contentType = if ($objectMetadata.content_type) { [string]$objectMetadata.content_type } else { 'application/octet-stream' }
        Invoke-StorageObjectUpload `
          -ApiUrl ([string]$status.API_URL) `
          -ServiceRoleKey ([string]$status.SERVICE_ROLE_KEY) `
          -BucketId $bucket.Name `
          -ObjectName $objectName `
          -FilePath $file.FullName `
          -ContentType $contentType `
          -CacheControl ([string]$objectMetadata.cache_control)
      }
    }
  }

  $tableCount = Invoke-LocalPsqlQuery -DbUri $dbUri -Sql "select count(*) from pg_tables where schemaname = 'public'"
  Write-Host "Local restore completed: $tableCount public tables." -ForegroundColor Green
  Write-Host "Local Supabase project: $LocalRoot"
  Write-Warning 'Remote JWTs and OAuth settings do not carry over. Reconfigure local Function secrets and sign in again.'
}
finally { Pop-Location }
