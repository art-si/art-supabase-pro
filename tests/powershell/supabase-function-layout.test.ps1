$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("supabase-function-layout-test-$([guid]::NewGuid().ToString('N'))")
$backup = Join-Path $fixtureRoot 'backup'
. (Join-Path $PSScriptRoot '../../supabase/transfer-common.ps1')

function Write-FixtureFile {
  param([string]$Relative, [string]$Content)
  $path = Join-Path $backup $Relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  [IO.File]::WriteAllText($path, $Content, [Text.UTF8Encoding]::new($false))
}

function New-FixtureManifest {
  $files = @(Get-ChildItem -LiteralPath $backup -File -Recurse | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName.Substring($backup.Length + 1).Replace('\', '/')
      bytes = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  })
  return [pscustomobject]@{ format_version = 1; project_ref = 'ckbftoopuyophiebamwy'; files = $files }
}

try {
  $functions = @(
    [pscustomobject]@{ slug = 'alpha'; verify_jwt = $true },
    [pscustomobject]@{ slug = 'beta'; verify_jwt = $false }
  )
  Write-FixtureFile 'metadata/functions.json' (ConvertTo-Json -InputObject $functions -Depth 4)
  Write-FixtureFile 'metadata/function-layout.json' (@{
    format_version = 1
    layout = 'isolated-bundles'
    functions = @(
      @{ slug = 'alpha'; entrypoint = 'functions/alpha/_bundle/alpha/index.ts'; import_map = 'functions/alpha/_bundle/alpha/deno.json' },
      @{ slug = 'beta'; entrypoint = 'functions/beta/_bundle/beta/main.ts'; import_map = $null }
    )
  } | ConvertTo-Json -Depth 5)
  Write-FixtureFile 'functions/alpha/_bundle/alpha/index.ts' "import '../_shared/version.ts'"
  Write-FixtureFile 'functions/alpha/_bundle/alpha/deno.json' '{}'
  Write-FixtureFile 'functions/alpha/_bundle/_shared/version.ts' 'export const version = 1'
  Write-FixtureFile 'functions/beta/_bundle/beta/main.ts' "import '../_shared/version.ts'"
  Write-FixtureFile 'functions/beta/_bundle/_shared/version.ts' 'export const version = 2'
  foreach ($required in @('config.toml', 'database/roles.sql', 'database/schema.sql',
      'database/data.sql', 'database/migration-history-schema.sql',
      'database/migration-history-data.sql', 'metadata/storage-buckets.json',
      'metadata/realtime-publication-tables.json')) {
    Write-FixtureFile $required 'fixture'
  }
  Write-FixtureFile 'database/data.sql' "COPY auth.users (id, encrypted_password) FROM stdin;`n\.`n"

  $config = @'
project_id = "fixture"
[functions.alpha]
verify_jwt = true
entrypoint = "./functions/alpha/index.ts"
import_map = "./functions/alpha/import_map.json"

[functions.beta]
verify_jwt = false
'@
  $manifest = New-FixtureManifest
  Assert-BackupManifest -Root $backup -Manifest $manifest
  $updated = Set-BackupFunctionSourceConfig -Config $config -Root $backup
  if ($updated -notmatch 'entrypoint = "\./functions/alpha/_bundle/alpha/index.ts"' -or
      $updated -notmatch 'import_map = "\./functions/alpha/_bundle/alpha/deno.json"' -or
      $updated -notmatch 'entrypoint = "\./functions/beta/_bundle/beta/main.ts"' -or
      $updated -match 'functions/alpha/import_map.json' -or
      @([regex]::Matches($updated, '(?m)^entrypoint\s*=')).Count -ne 2 -or
      @([regex]::Matches($updated, '(?m)^import_map\s*=')).Count -ne 1) {
    throw 'Isolated bundle source settings were not installed correctly.'
  }
  if ((Set-BackupFunctionSourceConfig -Config $updated -Root $backup) -ne $updated) {
    throw 'Applying the same layout twice changed config.toml.'
  }
  if ($updated -notmatch '\[functions\.beta\][\s\S]*?verify_jwt = false') {
    throw 'JWT settings changed during source configuration.'
  }
  $cloudConfig = @'
project_id = "fixture"
[functions.alpha]
verify_jwt = false

[auth]
enabled = true
'@
  $cloudConfig = Set-BackupFunctionJwtConfig -Config $cloudConfig -Functions $functions
  $cloudConfig = Set-BackupFunctionSourceConfig -Config $cloudConfig -Root $backup
  if ($cloudConfig -notmatch '(?s)\[functions\.alpha\].*?verify_jwt = true.*?entrypoint = "\./functions/alpha/_bundle/alpha/index.ts"' -or
      $cloudConfig -notmatch '(?s)\[functions\.beta\].*?verify_jwt = false.*?entrypoint = "\./functions/beta/_bundle/beta/main.ts"' -or
      $cloudConfig -notmatch '(?s)\[auth\].*?enabled = true') {
    throw 'The cloud restore config did not add absent functions and refresh JWT settings.'
  }

  $manifestPath = Join-Path $backup 'manifest.json'
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 7), [Text.UTF8Encoding]::new($false))
  $archive = Join-Path $fixtureRoot 'shareable.zip'
  & (Join-Path $PSScriptRoot '../../supabase/package-supabase-backup.ps1') -BackupPath $backup -ArchivePath $archive | Out-Null
  $recipient = Join-Path $fixtureRoot 'recipient'
  Expand-Archive -LiteralPath $archive -DestinationPath $recipient
  $recipientManifest = Get-Content -LiteralPath (Join-Path $recipient 'manifest.json') -Raw | ConvertFrom-Json
  Assert-BackupManifest -Root $recipient -Manifest $recipientManifest
  $recipientConfig = Set-BackupFunctionSourceConfig -Config $config -Root $recipient
  if ($recipientConfig -notmatch 'functions/alpha/_bundle/alpha/index.ts' -or
      $recipientConfig -notmatch 'functions/beta/_bundle/beta/main.ts') {
    throw 'The shareable archive lost isolated Edge Function source settings.'
  }

  $layoutPath = Join-Path $backup 'metadata/function-layout.json'
  $layoutText = Get-Content -LiteralPath $layoutPath -Raw
  Remove-Item -LiteralPath $layoutPath
  if ((Set-BackupFunctionSourceConfig -Config $config -Root $backup) -ne $config) {
    throw 'A legacy flat backup changed its config.'
  }
  [IO.File]::WriteAllText($layoutPath, $layoutText)

  $unlisted = [pscustomobject]@{
    format_version = $manifest.format_version
    project_ref = $manifest.project_ref
    files = @($manifest.files | Where-Object { $_.path -ne 'metadata/function-layout.json' })
  }
  $rejected = $false
  try { Assert-BackupManifest -Root $backup -Manifest $unlisted }
  catch { $rejected = $true }
  if (-not $rejected) { throw 'An unlisted function layout was accepted.' }

  $invalidLayout = $layoutText | ConvertFrom-Json
  $invalidLayout.functions[0].entrypoint = 'functions/alpha/_bundle/beta/main.ts'
  [IO.File]::WriteAllText($layoutPath, ($invalidLayout | ConvertTo-Json -Depth 5))
  $rejected = $false
  try { Set-BackupFunctionSourceConfig -Config $config -Root $backup | Out-Null }
  catch { $rejected = $true }
  if (-not $rejected) { throw 'A cross-function entrypoint was accepted.' }
  [IO.File]::WriteAllText($layoutPath, $layoutText)

  Write-FixtureFile 'functions/rogue/_bundle/rogue/index.ts' 'export const value = 1'
  $rejected = $false
  try { Assert-BackupManifest -Root $backup -Manifest (New-FixtureManifest) }
  catch { $rejected = $true }
  if (-not $rejected) { throw 'An unregistered function bundle was accepted.' }

  Write-Host 'Isolated function bundle layout and legacy compatibility checks passed.'
}
finally {
  $resolved = [IO.Path]::GetFullPath($fixtureRoot)
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolved) -notlike 'supabase-function-layout-test-*') {
    throw 'Unsafe fixture cleanup path.'
  }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
