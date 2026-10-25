[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })][string]$BackupPath,
  [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')

function ConvertTo-ShareableDataDump {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  # Retain user IDs for application references, but remove source Auth credentials.
  $safeUserColumns = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in @(
      'instance_id', 'id', 'aud', 'role', 'email', 'email_confirmed_at',
      'invited_at', 'confirmation_sent_at', 'recovery_sent_at',
      'last_sign_in_at', 'is_super_admin', 'created_at', 'updated_at',
      'phone', 'phone_confirmed_at', 'phone_change_sent_at', 'confirmed_at',
      'email_change_confirm_status', 'banned_until',
      'reauthentication_sent_at', 'deleted_at', 'is_anonymous')) {
    [void]$safeUserColumns.Add($name)
  }

  $reader = [IO.StreamReader]::new($Source, [Text.Encoding]::UTF8, $true)
  $writer = [IO.StreamWriter]::new($Destination, $false, [Text.UTF8Encoding]::new($false))
  $copyTable = $null
  $userColumns = @()
  $authUsersSeen = $false
  try {
    while ($null -ne ($line = $reader.ReadLine())) {
      if ($copyTable) {
        if ($line -eq '\.') {
          if ($copyTable -eq 'auth.users' -or -not $copyTable.StartsWith('auth.')) {
            $writer.WriteLine($line)
          }
          $copyTable = $null
          $userColumns = @()
          continue
        }
        if ($copyTable -eq 'auth.users') {
          $fields = @($line.Split([char]9))
          if ($fields.Count -ne $userColumns.Count) {
            throw 'Unexpected auth.users COPY row width; refusing to make a shareable archive.'
          }
          for ($i = 0; $i -lt $fields.Count; $i++) {
            $column = $userColumns[$i]
            if ($column -eq 'raw_app_meta_data') {
              $fields[$i] = '{"provider":"email","providers":["email"]}'
            }
            elseif ($column -eq 'raw_user_meta_data') { $fields[$i] = '{}' }
            elseif ($column -eq 'is_sso_user') { $fields[$i] = 'f' }
            elseif (-not $safeUserColumns.Contains($column)) { $fields[$i] = '\N' }
          }
          $writer.WriteLine(($fields -join "`t"))
        }
        elseif (-not $copyTable.StartsWith('auth.')) {
          $writer.WriteLine($line)
        }
        continue
      }

      if ($line -match '^\s*(?:COPY|INSERT\s+INTO)\s+(?:"?auth"?|"?vault"?)\.' -and
          $line -notmatch '^\s*COPY\s+"?auth"?\."?[A-Za-z0-9_]+"?\s*\([^)]*\)\s+FROM\s+stdin;\s*$') {
        throw 'Unexpected Auth or Vault data statement; refusing to make a shareable archive.'
      }
      if ($line -match '^\s*COPY\s+"?(auth|vault)"?\."?([A-Za-z0-9_]+)"?\s*\(([^)]*)\)\s+FROM\s+stdin;\s*$') {
        if ($Matches[1] -eq 'vault') {
          throw 'Vault data is present in the dump; refusing to make a shareable archive.'
        }
        $copyTable = "auth.$($Matches[2])"
        if ($copyTable -eq 'auth.users') {
          $authUsersSeen = $true
          $userColumns = @(($Matches[3] -split '\s*,\s*') | ForEach-Object { $_.Trim('"') })
          if ('id' -notin $userColumns -or 'encrypted_password' -notin $userColumns) {
            throw 'The auth.users dump has an unexpected column layout.'
          }
          $writer.WriteLine($line)
        }
        continue
      }
      $writer.WriteLine($line)
    }
    if ($copyTable -or -not $authUsersSeen) {
      throw 'The Auth data dump is incomplete or uses an unexpected format.'
    }
  }
  finally {
    $writer.Dispose()
    $reader.Dispose()
  }
}

$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$manifestPath = Join-Path $BackupPath 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'The backup is incomplete: manifest.json is missing.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $BackupPath -Manifest $manifest

if (-not $ArchivePath) {
  $ArchivePath = Join-Path (Split-Path -Parent $BackupPath) "$(Split-Path -Leaf $BackupPath).zip"
}
$ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
$archiveParent = Split-Path -Parent $ArchivePath
if (-not (Test-Path -LiteralPath $archiveParent -PathType Container)) {
  throw "Archive parent directory does not exist: $archiveParent"
}
$backupPrefix = $BackupPath.TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
if ($ArchivePath.StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $ArchivePath)) {
  throw 'The archive must be outside the backup directory and must not overwrite an existing file.'
}

$temporaryPath = Join-Path $archiveParent ".$(Split-Path -Leaf $ArchivePath).$([guid]::NewGuid().ToString('N')).partial"
$safeDataPath = Join-Path $archiveParent ".supabase-shareable-data-$([guid]::NewGuid().ToString('N')).sql.tmp"
$safeMigrationPath = Join-Path $archiveParent ".supabase-shareable-migration-$([guid]::NewGuid().ToString('N')).sql.tmp"
$safeManifestPath = Join-Path $archiveParent ".supabase-shareable-manifest-$([guid]::NewGuid().ToString('N')).json.tmp"
try {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  ConvertTo-ShareableDataDump `
    -Source (Join-Path $BackupPath 'database/data.sql') `
    -Destination $safeDataPath
  $dataEntry = @($manifest.files | Where-Object { $_.path.Replace('\', '/') -eq 'database/data.sql' })
  if ($dataEntry.Count -ne 1) { throw 'Backup manifest is missing one database/data.sql entry.' }
  $dataEntry[0].bytes = (Get-Item -LiteralPath $safeDataPath).Length
  $dataEntry[0].sha256 = (Get-FileHash -LiteralPath $safeDataPath -Algorithm SHA256).Hash
  [IO.File]::WriteAllText($safeMigrationPath, '-- Migration history data omitted from recipient package.', [Text.UTF8Encoding]::new($false))
  $migrationEntry = @($manifest.files | Where-Object { $_.path.Replace('\', '/') -eq 'database/migration-history-data.sql' })
  if ($migrationEntry.Count -ne 1) { throw 'Backup manifest is missing one migration-history-data.sql entry.' }
  $migrationEntry[0].bytes = (Get-Item -LiteralPath $safeMigrationPath).Length
  $migrationEntry[0].sha256 = (Get-FileHash -LiteralPath $safeMigrationPath -Algorithm SHA256).Hash
  $manifest.files = @($manifest.files | Where-Object { $_.path.Replace('\', '/') -ne 'database/managed-schema-snapshot.sql' })
  $manifest | Add-Member -NotePropertyName recipient_safe_auth -NotePropertyValue $true -Force
  [IO.File]::WriteAllText(
    $safeManifestPath,
    ($manifest | ConvertTo-Json -Depth 12),
    [Text.UTF8Encoding]::new($false))

  $stream = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew)
  try {
    $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($entry in $manifest.files) {
        $relativePath = [string]$entry.path.Replace('\', '/')
        $sourcePath = if ($relativePath -eq 'database/data.sql') {
          $safeDataPath
        }
        elseif ($relativePath -eq 'database/migration-history-data.sql') {
          $safeMigrationPath
        }
        else { Join-Path $BackupPath $entry.path }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $zip, $sourcePath, $relativePath, [IO.Compression.CompressionLevel]::Optimal)
      }
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $safeManifestPath, 'manifest.json', [IO.Compression.CompressionLevel]::Optimal)
      $readmePath = Join-Path $BackupPath 'README.md'
      if (Test-Path -LiteralPath $readmePath -PathType Leaf) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $zip, $readmePath, 'README.md', [IO.Compression.CompressionLevel]::Optimal)
      }
    }
    finally { $zip.Dispose() }
  }
  finally { $stream.Dispose() }
  Move-Item -LiteralPath $temporaryPath -Destination $ArchivePath
}
finally {
  foreach ($path in @($temporaryPath, $safeDataPath, $safeMigrationPath, $safeManifestPath)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }
}

$sha256 = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
Write-Host "Archive: $ArchivePath" -ForegroundColor Green
Write-Host "SHA256: $sha256"
Write-Host 'Auth credentials were removed from this shareable ZIP. Review business data and Storage files before sharing.'
