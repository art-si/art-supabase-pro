$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("supabase-verification-test-$([guid]::NewGuid().ToString('N'))")
$backup = Join-Path $fixtureRoot 'backup'
$restoreScript = Join-Path $PSScriptRoot '../../supabase/restore-local-supabase.ps1'

function Write-FixtureFile {
  param([string]$Relative, [string]$Content)
  $path = Join-Path $backup $Relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  [IO.File]::WriteAllText($path, $Content, [Text.UTF8Encoding]::new($false))
}

function Write-FixtureManifest {
  $files = @(Get-ChildItem -LiteralPath $backup -File -Recurse | Where-Object Name -NE 'manifest.json' | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName.Substring($backup.Length + 1).Replace('\', '/')
      bytes = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  })
  [pscustomobject]@{
    format_version = 1
    project_ref = 'ckbftoopuyophiebamwy'
    created_at = '2026-10-30T00:00:00Z'
    files = $files
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding utf8
}

try {
  Write-FixtureFile 'config.toml' 'project_id = "fixture"'
  Write-FixtureFile 'database/roles.sql' "-- roles`nRESET ALL;"
  foreach ($name in @('schema.sql', 'migration-history-schema.sql',
      'migration-history-data.sql', 'managed-schema-snapshot.sql')) {
    Write-FixtureFile "database/$name" "-- fixture`n-- PostgreSQL database dump complete"
  }
  Write-FixtureFile 'database/data.sql' "COPY auth.users (id, encrypted_password) FROM stdin;`n\.`n-- PostgreSQL database dump complete"
  Write-FixtureFile 'metadata/functions.json' '{"rows":[]}'
  Write-FixtureFile 'metadata/storage-buckets.json' '{"rows":[]}'
  Write-FixtureFile 'metadata/realtime-publication-tables.json' '{"rows":[]}'
  Write-FixtureFile 'metadata/storage-object-counts.json' '{"rows":[{"bucket_id":"docs.v1","object_count":1}]}'
  Write-FixtureFile 'storage/docs.v1/example.txt' 'fixture file'
  New-Item -ItemType Directory -Path (Join-Path $backup 'storage/empty-bucket') -Force | Out-Null
  Write-FixtureManifest

  $passedPath = Join-Path $fixtureRoot 'passed.json'
  & $restoreScript -BackupPath $backup -LocalRoot (Join-Path $fixtureRoot 'unused-local') `
    -VerifyBackupOnly -VerificationReportPath $passedPath | Out-Null
  $passed = Get-Content -LiteralPath $passedPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($passed.formatVersion -ne 1 -or $passed.status -ne 'passed' -or
      $passed.summary.files -ne $passed.summary.verifiedFiles -or $passed.summary.issueCount -ne 0 -or
      @($passed.groups).Count -ne 6 -or
      @($passed.checks | Where-Object { $_.id -eq 'restore' -and $_.status -eq 'skipped' }).Count -ne 1) {
    throw 'Successful backup report has incorrect counts or claims an actual restore.'
  }

  $archive = Join-Path $fixtureRoot 'recipient.zip'
  & (Join-Path $PSScriptRoot '../../supabase/package-supabase-backup.ps1') `
    -BackupPath $backup -ArchivePath $archive | Out-Null
  $recipient = Join-Path $fixtureRoot 'recipient'
  Expand-Archive -LiteralPath $archive -DestinationPath $recipient
  $recipientReportPath = Join-Path $fixtureRoot 'recipient-report.json'
  & $restoreScript -BackupPath $recipient -LocalRoot (Join-Path $fixtureRoot 'unused-local') `
    -VerifyBackupOnly -VerificationReportPath $recipientReportPath | Out-Null
  $recipientReport = Get-Content -LiteralPath $recipientReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($recipientReport.status -ne 'passed' -or $recipientReport.summary.issueCount -ne 0) {
    throw 'Recipient-safe backup was incorrectly rejected after credential redaction.'
  }

  $dataPath = Join-Path $backup 'database/data.sql'
  $brokenData = [IO.File]::ReadAllText($dataPath).Replace('dump complete', 'dump completX')
  [IO.File]::WriteAllText($dataPath, $brokenData)
  [IO.File]::WriteAllText((Join-Path $backup 'metadata/functions.json'), '{not-json')
  Write-FixtureFile 'storage/docs.v1/unlisted.txt' 'fixture file'
  $failedPath = Join-Path $fixtureRoot 'failed.json'
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & powershell.exe -NoProfile -File $restoreScript -BackupPath $backup `
      -LocalRoot (Join-Path $fixtureRoot 'unused-local') -VerifyBackupOnly `
      -VerificationReportPath $failedPath 2>&1 | Out-String
  }
  finally { $ErrorActionPreference = $previousPreference }
  if ($LASTEXITCODE -ne 1 -or -not (Test-Path -LiteralPath $failedPath -PathType Leaf)) {
    throw 'Failed verification did not exit 1 and write a sidecar report.'
  }
  $failed = Get-Content -LiteralPath $failedPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($failed.status -ne 'failed' -or $failed.summary.issueCount -lt 3 -or
      @($failed.issues | Where-Object code -EQ 'FILE_HASH_MISMATCH').Count -lt 1 -or
      @($failed.issues | Where-Object code -EQ 'FILE_UNLISTED').Count -lt 1 -or
      @($failed.issues | Where-Object code -EQ 'METADATA_INVALID').Count -lt 1 -or
      $failed.summary.verifiedFiles -ge $failed.summary.files) {
    throw "Failed backup report did not identify multiple integrity problems: $($failed.summary.issueCount), $(@($failed.issues | ForEach-Object code) -join ',')"
  }
  if ((Get-Item -LiteralPath $failedPath).Length -gt 262144 -or
      (Get-Content -LiteralPath $failedPath -Raw -Encoding UTF8) -match 'COPY auth.users') {
    throw 'Verification report is too large or contains SQL content.'
  }
  Write-Host 'Backup verification report, sidecar integrity, and failure exit checks passed.'
}
finally {
  $resolved = [IO.Path]::GetFullPath($fixtureRoot)
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolved) -notlike 'supabase-verification-test-*') {
    throw 'Unsafe fixture cleanup path.'
  }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
