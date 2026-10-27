[CmdletBinding()]
param(
  [string]$LocalRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) ('supabase-local-' + (Split-Path -Leaf $PSScriptRoot))),
  [switch]$Resume,
  [switch]$VerifyBackupOnly
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
$restoreScript = Join-Path $PSScriptRoot 'tools/restore-local-supabase.ps1'
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $restoreScript)) {
  throw 'Run start.ps1 from an extracted recipient backup ZIP.'
}

if (-not $VerifyBackupOnly) {
  . (Join-Path $PSScriptRoot 'tools/transfer-common.ps1')
  Assert-BackupManifest -Root $PSScriptRoot -Manifest (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json)
  $bundledCli = Join-Path $PSScriptRoot 'tools/runtime/supabase.exe'
  if (Test-Path -LiteralPath $bundledCli -PathType Leaf) {
    if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ne 'X64') {
      throw 'This bundled CLI targets Windows x64. Install a compatible Supabase CLI 2.122.0 or newer and use tools/restore-local-supabase.ps1.'
    }
    $env:Path = "$(Split-Path -Parent $bundledCli);$env:Path"
  }
}
$cliVersion = if (-not $VerifyBackupOnly -and (Get-Command supabase -ErrorAction SilentlyContinue)) {
  [version]((& supabase --version | Select-Object -First 1) -replace '^v', '')
} else { $null }
if (-not $VerifyBackupOnly -and ($null -eq $cliVersion -or $cliVersion -lt [version]'2.122.0')) {
  if ($env:OS -ne 'Windows_NT') {
    throw 'Install the Supabase CLI, then rerun this script. Docker must also be running.'
  }
  $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  $downloads = @{
    X64 = @{
      Asset = 'amd64'
      Sha256 = '60031fd5bf050fc12a0c6aef68997600d143870f944bf13109c7765dca329af8'
    }
    Arm64 = @{
      Asset = 'arm64'
      Sha256 = 'dda0185f8b56a5c35c36fba7c08dbe6683b0f99180df7018ea2b863b73fb3775'
    }
  }
  if (-not $downloads.ContainsKey($architecture)) { throw 'Unsupported Windows architecture.' }
  $download = $downloads[$architecture]
  $runtimeRoot = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($LocalRoot))) '.supabase-cli-2.122.0'
  if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'supabase.exe'))) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $archive = Join-Path $runtimeRoot 'supabase-cli.zip'
    $url = "https://github.com/supabase/cli/releases/download/v2.122.0/supabase_2.122.0_windows_$($download.Asset).zip"
    Write-Host 'Downloading the pinned Supabase CLI to run the local Docker stack...'
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing -TimeoutSec 600 | Out-Null
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $download.Sha256) {
      throw 'Supabase CLI checksum verification failed.'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $runtimeRoot)
  }
  $env:Path = "$runtimeRoot;$env:Path"
}

& $restoreScript -BackupPath $PSScriptRoot -LocalRoot $LocalRoot -Resume:$Resume -VerifyBackupOnly:$VerifyBackupOnly
