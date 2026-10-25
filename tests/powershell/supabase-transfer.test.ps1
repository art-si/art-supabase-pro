param([switch]$FullLocalRestore)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $projectRoot 'supabase/transfer-common.ps1')
$tempRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "supabase-transfer-test-$([guid]::NewGuid().ToString('N'))"))
$tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
if (-not $tempRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unexpected test directory.'
}

function Assert-Throws {
  param([Parameter(Mandatory = $true)][scriptblock]$Action)
  $threw = $false
  try { & $Action }
  catch { $threw = $true }
  if (-not $threw) { throw 'Expected command to fail.' }
}

try {
  $secretHeaders = New-StorageAdminHeaders -Key 'sb_secret_fixture'
  $legacyHeaders = New-StorageAdminHeaders -Key 'legacy-jwt-fixture'
  if ($secretHeaders.ContainsKey('Authorization') -or
      $legacyHeaders.Authorization -ne 'Bearer legacy-jwt-fixture') {
    throw 'Storage admin headers are incompatible with the supplied key type.'
  }
  $backup = Join-Path $tempRoot 'backup'
  New-Item -ItemType Directory -Path (Join-Path $backup 'database'), (Join-Path $backup 'metadata') -Force | Out-Null
  $contents = @{
    'config.toml' = 'project_id = "transfer-test"'
    'database/roles.sql' = '-- roles'
    'database/schema.sql' = '-- schema'
    'database/data.sql' = "COPY auth.users (id, encrypted_password) FROM stdin;`n\.`n"
    'database/migration-history-schema.sql' = '-- migration schema'
    'database/migration-history-data.sql' = '-- SOURCE_MIGRATION_SECRET'
    'database/managed-schema-snapshot.sql' = '-- SOURCE_MANAGED_SECRET'
    'metadata/functions.json' = '[]'
    'metadata/storage-buckets.json' = '[]'
    'metadata/realtime-publication-tables.json' = '[]'
  }
  foreach ($relativePath in $contents.Keys) {
    [IO.File]::WriteAllText(
      (Join-Path $backup $relativePath),
      $contents[$relativePath],
      [Text.UTF8Encoding]::new($false))
  }
  $files = @(foreach ($relativePath in $contents.Keys) {
    $path = Join-Path $backup $relativePath
    [pscustomobject]@{
      path = $relativePath
      bytes = (Get-Item -LiteralPath $path).Length
      sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    }
  })
  [pscustomobject]@{
    format_version = 1
    project_ref = 'abcdefghijklmnopqrst'
    files = $files
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding utf8

  $archive = Join-Path $tempRoot 'backup.zip'
  & (Join-Path $projectRoot 'supabase/package-supabase-backup.ps1') `
    -BackupPath $backup -ArchivePath $archive | Out-Null
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Archive was not created.' }
  $sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  Assert-Throws {
    & (Join-Path $projectRoot 'supabase/publish-supabase-backup.ps1') `
      -ArchivePath $archive -DistributionProjectRef 'abcdefghijklmnopqrst' | Out-Null
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $rawArchive = Join-Path $tempRoot 'raw-owner-backup.zip'
  [IO.Compression.ZipFile]::CreateFromDirectory($backup, $rawArchive)
  $rawRefusal = $null
  try {
    & (Join-Path $projectRoot 'supabase/publish-supabase-backup.ps1') `
      -ArchivePath $rawArchive -DistributionProjectRef 'bbbbbbbbbbbbbbbbbbbb' | Out-Null
  }
  catch { $rawRefusal = $_.Exception.Message }
  if ($rawRefusal -notmatch 'refusing to publish raw Auth credentials') {
    throw 'Publisher did not reject the raw owner backup.'
  }

  $download = Join-Path $tempRoot 'downloaded'
  & (Join-Path $projectRoot 'supabase/download-supabase-backup.ps1') `
    -ArchivePath $archive -ExpectedSha256 $sha256 -Destination $download | Out-Null
  & (Join-Path $projectRoot 'supabase/restore-local-supabase.ps1') `
    -BackupPath $download -LocalRoot (Join-Path $tempRoot 'local') -VerifyBackupOnly | Out-Null
  if ($FullLocalRestore) {
    & (Join-Path $projectRoot 'supabase/restore-local-supabase.ps1') `
      -BackupPath $download -LocalRoot (Join-Path $tempRoot 'local')
  }

  $sensitiveBackup = Join-Path $tempRoot 'sensitive'
  Copy-Item -LiteralPath $backup -Destination $sensitiveBackup -Recurse
  $sensitiveData = Join-Path $sensitiveBackup 'database/data.sql'
  [IO.File]::WriteAllText($sensitiveData, @"
COPY auth.users (id, email, encrypted_password, confirmation_token, raw_app_meta_data, raw_user_meta_data) FROM stdin;
00000000-0000-0000-0000-000000000001`ttest@example.com`tSOURCE_PASSWORD_HASH`tSOURCE_CONFIRMATION_TOKEN`t{"source":"SOURCE_METADATA_SECRET"}`t{"secret":"SOURCE_USER_SECRET"}
\.
COPY auth.refresh_tokens (token) FROM stdin;
SOURCE_REFRESH_TOKEN
\.
"@, [Text.UTF8Encoding]::new($false))
  $sensitiveManifestPath = Join-Path $sensitiveBackup 'manifest.json'
  $sensitiveManifest = Get-Content -LiteralPath $sensitiveManifestPath -Raw | ConvertFrom-Json
  $dataFile = @($sensitiveManifest.files | Where-Object { $_.path -eq 'database/data.sql' })[0]
  $dataFile.bytes = (Get-Item -LiteralPath $sensitiveData).Length
  $dataFile.sha256 = (Get-FileHash -LiteralPath $sensitiveData -Algorithm SHA256).Hash
  $sensitiveManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $sensitiveManifestPath -Encoding utf8
  $shareableArchive = Join-Path $tempRoot 'shareable.zip'
  & (Join-Path $projectRoot 'supabase/package-supabase-backup.ps1') `
    -BackupPath $sensitiveBackup -ArchivePath $shareableArchive | Out-Null
  $shareableDownload = Join-Path $tempRoot 'shareable-download'
  & (Join-Path $projectRoot 'supabase/download-supabase-backup.ps1') `
    -ArchivePath $shareableArchive `
    -ExpectedSha256 (Get-FileHash -LiteralPath $shareableArchive -Algorithm SHA256).Hash `
    -Destination $shareableDownload | Out-Null
  $shareableData = Get-Content -LiteralPath (Join-Path $shareableDownload 'database/data.sql') -Raw
  if ($shareableData -match 'SOURCE_PASSWORD_HASH|SOURCE_CONFIRMATION_TOKEN|SOURCE_REFRESH_TOKEN|SOURCE_METADATA_SECRET|SOURCE_USER_SECRET' -or
      $shareableData -notmatch 'test@example.com') {
    throw 'Recipient archive retained source Auth credentials or lost user IDs.'
  }
  if ((Get-Content -LiteralPath (Join-Path $shareableDownload 'database/migration-history-data.sql') -Raw) -match 'SOURCE_MIGRATION_SECRET' -or
      (Test-Path -LiteralPath (Join-Path $shareableDownload 'database/managed-schema-snapshot.sql'))) {
    throw 'Recipient archive retained owner-only migration or managed-schema content.'
  }

  Assert-Throws {
    & (Join-Path $projectRoot 'supabase/download-supabase-backup.ps1') `
      -ArchivePath $archive -ExpectedSha256 ('0' * 64) -Destination (Join-Path $tempRoot 'bad-hash') | Out-Null
  }
  if (Test-Path -LiteralPath (Join-Path $tempRoot 'bad-hash')) {
    throw 'A bad-hash archive was extracted.'
  }
  Assert-Throws {
    & (Join-Path $projectRoot 'supabase/download-supabase-backup.ps1') `
      -SignedUrl 'http://example.invalid/backup.zip' -ExpectedSha256 $sha256 `
      -Destination (Join-Path $tempRoot 'bad-url') | Out-Null
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $maliciousArchive = Join-Path $tempRoot 'malicious.zip'
  $zip = [IO.Compression.ZipFile]::Open($maliciousArchive, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $entry = $zip.CreateEntry('../outside.txt')
    $writer = [IO.StreamWriter]::new($entry.Open())
    try { $writer.Write('unsafe') }
    finally { $writer.Dispose() }
  }
  finally { $zip.Dispose() }
  $maliciousHash = (Get-FileHash -LiteralPath $maliciousArchive -Algorithm SHA256).Hash
  Assert-Throws {
    & (Join-Path $projectRoot 'supabase/download-supabase-backup.ps1') `
      -ArchivePath $maliciousArchive -ExpectedSha256 $maliciousHash `
      -Destination (Join-Path $tempRoot 'malicious-output') | Out-Null
  }
  if (Test-Path -LiteralPath (Join-Path $tempRoot 'outside.txt')) {
    throw 'An archive entry escaped the destination.'
  }

  Write-Host 'Supabase shareable packaging, Auth redaction, integrity, and archive path checks passed.' -ForegroundColor Green
}
finally {
  $localRoot = Join-Path $tempRoot 'local'
  if ($FullLocalRestore -and (Test-Path -LiteralPath (Join-Path $localRoot 'supabase/config.toml') -PathType Leaf)) {
    Push-Location $localRoot
    try {
      $previousPreference = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      & supabase stop --no-backup *> $null
      $ErrorActionPreference = $previousPreference
    }
    finally { Pop-Location }
  }
  if (Test-Path -LiteralPath $tempRoot -PathType Container) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
