$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("supabase-functions-install-test-$([guid]::NewGuid().ToString('N'))")
$backup = Join-Path $fixtureRoot 'backups/fixture'
$source = Join-Path $fixtureRoot 'backups/fixture.incomplete/functions-test/validated-functions'
$installed = Join-Path $backup 'functions'

try {
  New-Item -ItemType Directory -Path (Join-Path $source 'example/nested'), $backup -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $source 'example/index.ts'), 'export const value = 1')
  [IO.File]::WriteAllText((Join-Path $source 'example/nested/config.json'), '{"enabled":true}')
  . (Join-Path $PSScriptRoot '../../supabase/backup-progress.ps1')

  Move-BackupFunctionDirectory -BackupPath $backup -Source $source -Destination $installed
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'Installing functions removed the verified source.' }
  $originals = @(Get-ChildItem -LiteralPath $source -File -Recurse)
  foreach ($file in $originals) {
    $relative = $file.FullName.Substring($source.Length + 1)
    $copy = Join-Path $installed $relative
    if (-not (Test-Path -LiteralPath $copy -PathType Leaf) -or
        (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $copy).Hash) {
      throw "Installed function differs from source: $relative"
    }
  }
  $archived = Join-Path $fixtureRoot 'backups/fixture.incomplete/functions-old-test'
  Move-BackupFunctionDirectory -BackupPath $backup -Source $installed -Destination $archived
  if (-not (Test-Path -LiteralPath $installed -PathType Container) -or
      @(Get-ChildItem -LiteralPath $installed -Force).Count -ne 0 -or
      -not (Test-Path -LiteralPath $archived -PathType Container)) {
    throw 'The previous installed functions were not archived and emptied.'
  }
  Move-BackupFunctionDirectory -BackupPath $backup -Source $source -Destination $installed
  if (@(Get-ChildItem -LiteralPath $installed -File -Recurse).Count -ne $originals.Count) {
    throw 'A retry did not install all function files.'
  }
  $archiveFail = Join-Path $fixtureRoot 'backups/fixture.incomplete/functions-old-fail'
  $script:copyCalls = 0
  function Copy-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Destination, [switch]$Force)
    $script:copyCalls++
    if ($script:copyCalls -eq 2) { throw 'Simulated archive copy failure.' }
    Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force -ErrorAction Stop
  }
  try {
    $failed = $false
    try { Move-BackupFunctionDirectory -BackupPath $backup -Source $installed -Destination $archiveFail }
    catch { $failed = $_.Exception.Message -like '*Simulated archive copy failure*' }
    if (-not $failed -or @((Get-ChildItem -LiteralPath $installed -File -Recurse)).Count -ne $originals.Count) {
      throw 'A failed archive copy removed original function files.'
    }
  }
  finally { Remove-Item Function:\Copy-Item }
  Write-Host 'Function installation and archive checks passed.'
}
finally {
  $resolved = [IO.Path]::GetFullPath($fixtureRoot)
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolved) -notlike 'supabase-functions-install-test-*') { throw 'Unsafe fixture cleanup path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
