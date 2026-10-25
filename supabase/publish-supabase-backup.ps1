[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })][string]$ArchivePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]{20}$')][string]$DistributionProjectRef,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')][string]$BucketId = 'project-transfer-backups',
  [ValidateRange(60, 86400)][int]$ExpiresInSeconds = 3600,
  [securestring]$DistributionSecretKey
)

$ErrorActionPreference = 'Stop'
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $manifestEntry = $zip.GetEntry('manifest.json')
  if (-not $manifestEntry) { throw 'Archive does not contain manifest.json.' }
  $reader = [IO.StreamReader]::new($manifestEntry.Open())
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json }
  finally { $reader.Dispose() }
}
finally { $zip.Dispose() }
if ($manifest.project_ref -notmatch '^[a-z0-9]{20}$' -or
    $manifest.project_ref -eq $DistributionProjectRef) {
  throw 'Use a separate distribution project, not the source Supabase project.'
}
if ($manifest.recipient_safe_auth -ne $true) {
  throw 'This archive was not produced by the shareable packaging script; refusing to publish raw Auth credentials.'
}

if (-not $DistributionSecretKey) {
  $DistributionSecretKey = Read-Host 'Distribution project secret/service_role key (never shared with recipients)' -AsSecureString
}
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DistributionSecretKey)
try { $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ([string]::IsNullOrWhiteSpace($plainKey)) { throw 'Distribution project key is required.' }

$baseUrl = "https://$DistributionProjectRef.supabase.co"
$encodedBucket = [uri]::EscapeDataString($BucketId)
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
$headers = New-StorageAdminHeaders -Key $plainKey
try {
  try {
    $bucket = Invoke-RestMethod -Method Get -Uri "$baseUrl/storage/v1/bucket/$encodedBucket" `
      -Headers $headers -TimeoutSec 60
  }
  catch {
    throw "Cannot read distribution bucket '$BucketId'. Create it as a private Storage bucket in the separate distribution project, then retry."
  }
  if ($bucket.public -ne $false) {
    throw "Distribution bucket '$BucketId' is public; refusing to upload the backup."
  }

  $archiveSize = (Get-Item -LiteralPath $ArchivePath).Length
  if ($archiveSize -gt 5000000000) {
    throw 'The ZIP exceeds the 5 GB standard upload limit. Use private storage with resumable upload and a signed HTTPS download URL.'
  }
  $bucketLimit = [long]0
  if ([long]::TryParse([string]$bucket.file_size_limit, [ref]$bucketLimit) -and
      $bucketLimit -gt 0 -and $archiveSize -gt $bucketLimit) {
    throw "The ZIP exceeds distribution bucket '$BucketId' file_size_limit."
  }
  if ($archiveSize -gt 6000000) {
    Write-Warning 'Standard Storage uploads are less reliable above 6 MB. If this upload fails, use a private resumable upload service and share its signed HTTPS URL.'
  }

  $sha256 = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
  $objectName = "backups/$([IO.Path]::GetFileNameWithoutExtension($ArchivePath))-$([guid]::NewGuid().ToString('N')).zip"
  $encodedObject = (($objectName -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
  Write-Host "Uploading verified archive to private bucket '$BucketId' in separate project $DistributionProjectRef..."
  Invoke-WebRequest -Method Post `
    -Uri "$baseUrl/storage/v1/object/$encodedBucket/$encodedObject" `
    -Headers $headers `
    -InFile $ArchivePath `
    -ContentType 'application/zip' `
    -UseBasicParsing `
    -TimeoutSec 3600 | Out-Null

  $signBody = @{ expiresIn = $ExpiresInSeconds } | ConvertTo-Json
  $signed = Invoke-RestMethod -Method Post `
    -Uri "$baseUrl/storage/v1/object/sign/$encodedBucket/$encodedObject" `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body $signBody `
    -TimeoutSec 60
  if ([string]::IsNullOrWhiteSpace([string]$signed.signedURL) -or
      -not ([string]$signed.signedURL).StartsWith('/object/sign/')) {
    throw 'Storage did not return an expected signed download URL.'
  }
  $signedUrl = "$baseUrl/storage/v1$($signed.signedURL)"
  Write-Host 'Upload completed.' -ForegroundColor Green
  Write-Host "SHA256: $sha256"
  Write-Host "Expires in: $ExpiresInSeconds seconds"
  Write-Host "Signed URL: $signedUrl"
  Write-Host 'Share only the signed URL and SHA256. Never share the distribution key.'
}
finally {
  $headers = $null
  $plainKey = $null
}
