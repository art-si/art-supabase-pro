[CmdletBinding(DefaultParameterSetName = 'SignedUrl')]
param(
  [Parameter(Mandatory = $true, ParameterSetName = 'SignedUrl')][uri]$SignedUrl,
  [Parameter(Mandatory = $true, ParameterSetName = 'LocalArchive')]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$ArchivePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')

$Destination = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $Destination) {
  throw "Destination already exists; choose a new directory: $Destination"
}
$destinationParent = Split-Path -Parent $Destination
if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) {
  throw "Destination parent directory does not exist: $destinationParent"
}

$temporaryArchive = $null
try {
  if ($PSCmdlet.ParameterSetName -eq 'SignedUrl') {
    if ($SignedUrl.Scheme -ne 'https' -or -not $SignedUrl.IsAbsoluteUri) {
      throw 'Only an HTTPS signed download URL is accepted.'
    }
    $temporaryArchive = Join-Path ([IO.Path]::GetTempPath()) "supabase-download-$([guid]::NewGuid().ToString('N')).zip"
    Invoke-WebRequest -Uri $SignedUrl -OutFile $temporaryArchive -UseBasicParsing -TimeoutSec 600 | Out-Null
    $archive = $temporaryArchive
  }
  else {
    $archive = (Resolve-Path -LiteralPath $ArchivePath).Path
  }

  $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if ($actualSha256 -ne $ExpectedSha256.ToUpperInvariant()) {
    throw 'The downloaded archive SHA256 does not match the owner-provided value.'
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $entryPaths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
      $path = $entry.FullName.Replace('\', '/')
      if ([string]::IsNullOrWhiteSpace($path) -or $path.StartsWith('/') -or $path.Contains(':') -or
          @($path -split '/' | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count -gt 0 -or
          -not $entryPaths.Add($path)) {
        throw "Unsafe or duplicate archive entry: $path"
      }
      # A Unix symbolic link in a ZIP has file type 0120000 in the upper 16 bits.
      if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
        throw "Linked archive entry is not allowed: $path"
      }
    }
  }
  finally {
    $zip.Dispose()
  }

  [IO.Compression.ZipFile]::ExtractToDirectory($archive, $Destination)
  $manifestPath = Join-Path $Destination 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'The downloaded archive is missing manifest.json.'
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.recipient_safe_auth -ne $true) {
    throw 'This archive is not marked as safe for recipient distribution.'
  }
  Assert-BackupManifest -Root $Destination -Manifest $manifest
  Write-Host "Backup downloaded and verified: $Destination" -ForegroundColor Green
}
finally {
  if ($temporaryArchive -and (Test-Path -LiteralPath $temporaryArchive)) {
    Remove-Item -LiteralPath $temporaryArchive -Force
  }
}
