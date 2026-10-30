function Invoke-SupabaseQuiet {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $outputLines = New-Object System.Collections.Generic.List[string]
  $errorLines = New-Object System.Collections.Generic.List[string]
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    # PS5 formats native stderr redirection as an ErrorRecord with a PowerShell
    # stack. Keep the CLI's own text without manufacturing a failure on exit 0.
    & supabase @Arguments 2>&1 | ForEach-Object {
      if ($_ -is [Management.Automation.ErrorRecord]) { $errorLines.Add($_.ToString()) }
      else { $outputLines.Add([string]$_) }
    }
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  return [pscustomobject]@{
    Succeeded = ($exitCode -eq 0)
    ExitCode = $exitCode
    Output = (($outputLines.ToArray() -join "`n").Trim())
    Error = (($errorLines.ToArray() -join "`n").Trim())
  }
}

function Invoke-SupabaseQuietWithRetry {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [int]$Attempts = 3
  )

  $lastResult = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $lastResult = Invoke-SupabaseQuiet $Arguments
    if ($lastResult.Succeeded) { return $lastResult }

    if ($attempt -lt $Attempts) {
      Write-Warning "Supabase CLI request failed (attempt $attempt/$Attempts). Retrying..."
      Start-Sleep -Seconds (3 * $attempt)
    }
  }

  return $lastResult
}

function Test-SupabaseCliProjectVisible {
  param([Parameter(Mandatory = $true)][string]$ProjectRef)

  $result = Invoke-SupabaseQuiet @('projects', 'list', '--agent=no', '--output', 'json')
  $script:SupabaseProjectAccessState = 'request-failed'
  if (-not $result.Succeeded) {
    # Inspect captured output only; never print tokens or raw CLI payloads.
    if ("$($result.Output) $($result.Error)" -match 'Invalid access token|Access token not provided|not logged in|Unauthorized|authentication required') {
      $script:SupabaseProjectAccessState = 'login-required'
    }
    return $false
  }

  try {
    $parsed = ConvertFrom-Json -InputObject $result.Output -ErrorAction Stop
    if ($parsed -is [System.Array]) { $projects = @($parsed) }
    elseif ($parsed.PSObject.Properties['projects']) { $projects = @($parsed.projects) }
    elseif ($parsed.PSObject.Properties['ref']) { $projects = @($parsed) }
    else { throw 'Unexpected project-list response.' }
    $script:SupabaseProjectAccessState = 'project-missing'
    return @($projects | Where-Object { $_.ref -eq $ProjectRef }).Count -gt 0
  }
  catch {
    return $false
  }
}

function Assert-SupabaseCliProjectAccess {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [switch]$NonInteractive
  )

  if (Test-SupabaseCliProjectVisible -ProjectRef $ProjectRef) { return }

  $inheritedToken = $env:SUPABASE_ACCESS_TOKEN
  if (-not [string]::IsNullOrWhiteSpace($inheritedToken)) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
    $savedLoginWorks = $false
    try {
      $savedLoginWorks = Test-SupabaseCliProjectVisible -ProjectRef $ProjectRef
    }
    finally {
      if (-not $savedLoginWorks) { $env:SUPABASE_ACCESS_TOKEN = $inheritedToken }
    }
    if ($savedLoginWorks) {
      Write-Host 'Using the saved Supabase CLI login instead of an inherited access token.'
      return
    }
  }

  if ($script:SupabaseProjectAccessState -eq 'request-failed') {
    throw 'Supabase project lookup failed. Check your network and HTTP proxy, then run the script again.'
  }
  if ($NonInteractive -or $env:CI) {
    throw "Supabase login or project access is required for $ProjectRef. Run 'supabase login --agent=no' in an interactive terminal, then retry."
  }

  Write-Host "Supabase login needs attention. Complete the browser login using an account with access to project $ProjectRef; the script will then continue."
  # An inherited token overrides the saved login, including a newly refreshed one.
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  $loginWorks = $false
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & supabase login --agent=no
    $loginExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($loginExitCode -eq 0) {
      $loginWorks = Test-SupabaseCliProjectVisible -ProjectRef $ProjectRef
    }
  }
  finally {
    $ErrorActionPreference = $previousPreference
    if (-not $loginWorks -and -not [string]::IsNullOrWhiteSpace($inheritedToken)) {
      $env:SUPABASE_ACCESS_TOKEN = $inheritedToken
    }
  }
  if ($loginWorks) { return }
  throw "Login was cancelled, failed, or the account cannot access project $ProjectRef. Use an account with source-project access and retry. Local backup recipients should run restore-local-supabase.ps1 instead; no source login is required."
}

function Enable-SystemProxyForSupabaseCli {
  $env:NO_PROXY = (@($env:NO_PROXY -split ',' | Where-Object { $_ }) + @('localhost', '127.0.0.1', '::1') | Select-Object -Unique) -join ','
  if ($env:HTTP_PROXY -or $env:HTTPS_PROXY) { return }
  # The Supabase CLI does not inherit the Windows Internet Settings proxy.
  $settingsPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  try {
    $settings = Get-ItemProperty -Path $settingsPath -ErrorAction Stop
    if ($settings.ProxyEnable -ne 1 -or [string]::IsNullOrWhiteSpace($settings.ProxyServer)) { return }

    $entries = @($settings.ProxyServer -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $selected = $entries | Where-Object { $_ -match '^https=' } | Select-Object -First 1
    if (-not $selected) { $selected = $entries | Select-Object -First 1 }
    $proxy = ($selected -replace '^(https?|all)=', '').Trim()
    if ($proxy -notmatch '^[a-z]+://') { $proxy = "http://$proxy" }
    $env:HTTP_PROXY = $proxy
    $env:HTTPS_PROXY = $proxy
    $env:http_proxy = $proxy
    $env:https_proxy = $proxy
    Write-Host 'Using the configured Windows proxy for Supabase API calls...'
  }
  catch {
    Write-Verbose 'Windows proxy settings could not be read; continuing without an HTTP proxy.'
  }
}

function Get-PlainText {
  param([Parameter(Mandatory = $true)][securestring]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function ConvertFrom-SupabaseJsonArray {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $json = [regex]::Match($Text, '\[[\s\S]*\]').Value
  if (-not $json) { throw "Unable to read ${Description}: the CLI did not return a JSON array." }
  try {
    $parsed = ConvertFrom-Json -InputObject $json -ErrorAction Stop
    return @($parsed)
  }
  catch { throw "Unable to parse $Description returned by the Supabase CLI." }
}

function Get-SupabaseApiKeyValue {
  param(
    [Parameter(Mandatory = $true)]$KeyRecord,
    [Parameter(Mandatory = $true)][string[]]$Names
  )

  foreach ($name in $Names) {
    $property = $KeyRecord.PSObject.Properties[$name]
    if ($property -and $property.Value -isnot [System.Array] -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
      return [string]$property.Value
    }
  }

  return $null
}

function Expand-SupabaseApiKeyRecords {
  param($Value)

  if ($null -eq $Value) { return @() }

  if ($Value -is [System.Array]) {
    $items = @()
    foreach ($item in $Value) {
      $items += @(Expand-SupabaseApiKeyRecords $item)
    }
    return $items
  }

  # Windows PowerShell can preserve a JSON top-level array as one object whose
  # properties are arrays. Rebuild normal row objects before searching by name.
  $apiKeyProperty = $Value.PSObject.Properties['api_key']
  $nameProperty = $Value.PSObject.Properties['name']
  if ($apiKeyProperty -and $apiKeyProperty.Value -is [System.Array]) {
    $apiKeys = @($apiKeyProperty.Value)
    $names = if ($nameProperty) { @($nameProperty.Value) } else { @() }
    $ids = if ($Value.PSObject.Properties['id']) { @($Value.PSObject.Properties['id'].Value) } else { @() }
    $types = if ($Value.PSObject.Properties['type']) { @($Value.PSObject.Properties['type'].Value) } else { @() }

    $rows = @()
    for ($i = 0; $i -lt $apiKeys.Count; $i++) {
      $rows += [pscustomobject]@{
        api_key = $apiKeys[$i]
        name = if ($i -lt $names.Count) { $names[$i] } else { $null }
        id = if ($i -lt $ids.Count) { $ids[$i] } else { $null }
        type = if ($i -lt $types.Count) { $types[$i] } else { $null }
      }
    }
    return $rows
  }

  return @($Value)
}

function Get-SupabaseServiceRoleKey {
  param([Parameter(Mandatory = $true)][string]$ProjectRef)

  $result = Invoke-SupabaseQuietWithRetry `
    -Arguments @('projects', 'api-keys', '--project-ref', $ProjectRef, '--output', 'json') `
    -Attempts 3
  if (-not $result.Succeeded) {
    throw "Unable to read Supabase API keys for Storage transfer. $($result.Error)"
  }

  try {
    $records = @(Expand-SupabaseApiKeyRecords ($result.Output | ConvertFrom-Json))
  }
  catch {
    throw 'Unable to parse the Supabase API key list returned by the CLI.'
  }

  foreach ($record in $records) {
    $name = Get-SupabaseApiKeyValue -KeyRecord $record -Names @('name', 'key_name', 'label', 'id')
    if ($name -and $name -match 'service[_ -]?role') {
      $value = Get-SupabaseApiKeyValue -KeyRecord $record -Names @('api_key', 'key', 'value')
      if ($value) { return $value }
    }
  }

  # New projects may use an sb_secret_ key instead of a legacy service_role JWT.
  foreach ($record in $records) {
    $value = Get-SupabaseApiKeyValue -KeyRecord $record -Names @('api_key', 'key', 'value')
    if ($value -match '^sb_secret_[A-Za-z0-9_-]+$') { return $value }
  }

  throw 'No service_role or secret API key was found. Storage transfer requires a privileged server key for private buckets.'
}

function ConvertTo-StorageApiPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return (($Path -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
}

function New-StorageAdminHeaders {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [switch]$Upsert
  )

  $headers = @{ apikey = $Key }
  # New sb_secret_ keys are not JWTs and must not be sent as bearer tokens.
  if ($Key -notmatch '^sb_secret_') { $headers.Authorization = "Bearer $Key" }
  if ($Upsert) { $headers['x-upsert'] = 'true' }
  return $headers
}

function Invoke-StorageObjectUpload {
  param(
    [Parameter(Mandatory = $true)][string]$ApiUrl,
    [Parameter(Mandatory = $true)][string]$ServiceRoleKey,
    [Parameter(Mandatory = $true)][string]$BucketId,
    [Parameter(Mandatory = $true)][string]$ObjectName,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string]$ContentType = 'application/octet-stream',
    [string]$CacheControl
  )

  $encodedBucket = [uri]::EscapeDataString($BucketId)
  $encodedObject = ConvertTo-StorageApiPath $ObjectName
  $headers = New-StorageAdminHeaders -Key $ServiceRoleKey -Upsert
  if ($CacheControl) { $headers['cache-control'] = $CacheControl }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Invoke-WebRequest `
        -Method Post `
        -Uri "$($ApiUrl.TrimEnd('/'))/storage/v1/object/$encodedBucket/$encodedObject" `
        -Headers $headers `
        -InFile $FilePath `
        -ContentType $ContentType `
        -UseBasicParsing `
        -TimeoutSec 180 | Out-Null
      return
    }
    catch {
      if ($attempt -eq 3) { throw }
      Write-Warning "Storage upload failed for '$BucketId/$ObjectName' (attempt $attempt/3). Retrying..."
      Start-Sleep -Seconds (3 * $attempt)
    }
  }
}

function Set-BackupFunctionJwtConfig {
  param(
    [Parameter(Mandatory = $true)][string]$Config,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Functions
  )

  foreach ($function in $Functions) {
    if ($function.slug -notmatch '^[a-z0-9][a-z0-9_-]*$' -or $function.verify_jwt -isnot [bool]) {
      throw 'Invalid function slug or JWT setting in backup metadata.'
    }
    $jwt = if ($function.verify_jwt) { 'true' } else { 'false' }
    $slug = [regex]::Escape([string]$function.slug)
    $section = [regex]::Match($Config, "(?ms)^\[functions\.$slug\][^\r\n]*\r?\n.*?(?=^\[|\z)")
    if ($section.Success) {
      $replacement = if ($section.Value -match '(?m)^verify_jwt\s*=') {
        $section.Value -replace '(?m)^verify_jwt\s*=[^\r\n]*', "verify_jwt = $jwt"
      }
      else { $section.Value.TrimEnd() + "`nverify_jwt = $jwt`n`n" }
      $Config = $Config.Remove($section.Index, $section.Length).Insert($section.Index, $replacement)
    }
    else { $Config = $Config.TrimEnd() + "`n`n[functions.$($function.slug)]`nverify_jwt = $jwt`n" }
  }
  return $Config
}

function Get-BackupFunctionLayout {
  param([Parameter(Mandatory = $true)][string]$Root)

  $layoutPath = Join-Path $Root 'metadata/function-layout.json'
  if (-not (Test-Path -LiteralPath $layoutPath -PathType Leaf)) { return $null }
  try { $layout = Get-Content -LiteralPath $layoutPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Invalid Edge Function layout metadata.' }
  if ($layout.format_version -ne 1 -or $layout.layout -ne 'isolated-bundles' -or
      $layout.functions -isnot [array]) {
    throw 'Unsupported or incomplete Edge Function layout metadata.'
  }
  return $layout
}

function Assert-BackupFunctionLayout {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]$Layout,
    [Parameter(Mandatory = $true)][object[]]$Functions,
    [System.Collections.Generic.HashSet[string]]$ManifestPaths
  )

  $expected = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($function in $Functions) {
    if ($function.slug -notmatch '^[a-z0-9][a-z0-9_-]*$' -or -not $expected.Add([string]$function.slug)) {
      throw 'Invalid or duplicate Edge Function in deployment metadata.'
    }
  }
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($item in @($Layout.functions)) {
    $slug = [string]$item.slug
    if (-not $expected.Contains($slug) -or -not $seen.Add($slug)) {
      throw 'Edge Function layout contains an unknown or duplicate function.'
    }
    $entrypoint = [string]$item.entrypoint
    $bundlePrefix = "functions/$slug/_bundle/"
    $entryPrefix = "$bundlePrefix$slug/"
    if ($entrypoint -notmatch '^[A-Za-z0-9_./-]+$' -or
        -not $entrypoint.StartsWith($entryPrefix, [StringComparison]::Ordinal) -or
        $entrypoint -match '(^|/)\.{1,2}(/|$)' -or
        $entrypoint -notmatch '\.(ts|tsx|js|jsx|mjs)$') {
      throw "Invalid Edge Function entrypoint in layout: $slug"
    }
    $importMap = $item.import_map
    if ($null -ne $importMap) {
      if ($importMap -isnot [string] -or $importMap -notmatch '^[A-Za-z0-9_./-]+$' -or
          -not $importMap.StartsWith($bundlePrefix, [StringComparison]::Ordinal) -or
          $importMap -match '(^|/)\.{1,2}(/|$)' -or
          (Split-Path -Leaf $importMap) -notin @('deno.json', 'import_map.json')) {
        throw "Invalid Edge Function import map in layout: $slug"
      }
    }
    foreach ($relative in @($entrypoint, $importMap)) {
      if ($null -eq $relative) { continue }
      if ($ManifestPaths -and -not $ManifestPaths.Contains($relative)) {
        throw "Edge Function layout file is absent from manifest: $relative"
      }
      $path = Join-Path $Root ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
      $bundleRoot = [IO.Path]::GetFullPath((Join-Path $Root $bundlePrefix))
      $fullPath = [IO.Path]::GetFullPath($path)
      if (-not $fullPath.StartsWith($bundleRoot, [StringComparison]::OrdinalIgnoreCase) -or
          -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Edge Function layout file is missing or outside its bundle: $relative"
      }
      $current = $fullPath
      while ($current -and $current.StartsWith([IO.Path]::GetFullPath($Root), [StringComparison]::OrdinalIgnoreCase)) {
        $part = Get-Item -LiteralPath $current -Force
        if (($part.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
          throw "Edge Function layout uses a linked file or directory: $relative"
        }
        $current = Split-Path -Parent $current
      }
    }
  }
  if ($seen.Count -ne $expected.Count) { throw 'Edge Function layout does not cover every deployed function.' }
}

function Set-BackupFunctionSourceConfig {
  param(
    [Parameter(Mandatory = $true)][string]$Config,
    [Parameter(Mandatory = $true)][string]$Root
  )

  $layout = Get-BackupFunctionLayout -Root $Root
  if ($null -eq $layout) { return $Config }
  $functions = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath (Join-Path $Root 'metadata/functions.json') -Raw -Encoding UTF8) `
    -Description 'the backed-up Edge Function list')
  Assert-BackupFunctionLayout -Root $Root -Layout $layout -Functions $functions
  foreach ($item in @($layout.functions)) {
    $slug = [regex]::Escape([string]$item.slug)
    $matches = [regex]::Matches($Config, "(?ms)^\[functions\.$slug\][^\r\n]*\r?\n.*?(?=^\[|\z)")
    if ($matches.Count -ne 1) { throw "Expected one config section for Edge Function $($item.slug)." }
    $section = $matches[0]
    $replacement = [regex]::Replace($section.Value, '(?m)^\s*(?:entrypoint|import_map)\s*=[^\r\n]*(?:\r?\n)?', '')
    $replacement = $replacement.TrimEnd() + "`nentrypoint = `"./$($item.entrypoint)`"`n"
    if ($null -ne $item.import_map) { $replacement += "import_map = `"./$($item.import_map)`"`n" }
    $replacement += "`n"
    $Config = $Config.Remove($section.Index, $section.Length).Insert($section.Index, $replacement)
  }
  return $Config
}

function Test-BackupSqlComplete {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [switch]$RecipientSafeAuth
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -eq 0) { return $false }
  $tail = @(Get-Content -LiteralPath $Path -Tail 20)
  if ($Name -eq 'roles.sql') { return [bool]($tail -match '^RESET ALL;$') }
  if ($Name -eq 'migration-history-schema.sql') {
    return [bool]($tail -match 'ADD CONSTRAINT .* PRIMARY KEY|^-- PostgreSQL database dump complete')
  }
  if ($RecipientSafeAuth -and $Name -eq 'migration-history-data.sql') {
    return [bool]($tail -match '^-- Migration history data omitted from recipient package\.$')
  }
  return [bool]($tail -match '^-- PostgreSQL database dump complete')
}

function Assert-BackupPayloadCompleteness {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]$Manifest
  )

  foreach ($name in @('roles.sql', 'schema.sql', 'data.sql', 'migration-history-schema.sql',
      'migration-history-data.sql', 'managed-schema-snapshot.sql')) {
    $path = Join-Path $Root "database/$name"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      if ($name -eq 'managed-schema-snapshot.sql' -and $Manifest.recipient_safe_auth -eq $true) { continue }
      throw "Database SQL file is missing: database/$name"
    }
    if (-not (Test-BackupSqlComplete -Path $path -Name $name -RecipientSafeAuth:($Manifest.recipient_safe_auth -eq $true))) {
      throw "Database SQL file has no complete ending: database/$name"
    }
  }

  foreach ($relative in @('metadata/functions.json', 'metadata/storage-buckets.json',
      'metadata/realtime-publication-tables.json', 'metadata/storage-object-counts.json')) {
    $path = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    try {
      $parsed = @(ConvertFrom-SupabaseJsonArray `
        -Text (Get-Content -LiteralPath $path -Raw -Encoding UTF8) `
        -Description $relative)
    }
    catch { throw "Invalid JSON array metadata: $relative" }
  }

  $countsPath = Join-Path $Root 'metadata/storage-object-counts.json'
  if (Test-Path -LiteralPath $countsPath -PathType Leaf) {
    $counts = @(ConvertFrom-SupabaseJsonArray `
      -Text (Get-Content -LiteralPath $countsPath -Raw -Encoding UTF8) `
      -Description 'Storage object counts')
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($entry in $counts) {
      $bucket = [string]$entry.bucket_id
      $count = [long]0
      if ($bucket -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or -not $seen.Add($bucket) -or
          -not [long]::TryParse([string]$entry.object_count, [ref]$count) -or $count -lt 0) {
        throw 'Invalid Storage object count metadata.'
      }
      $bucketPath = Join-Path $Root "storage/$bucket"
      $actual = if (Test-Path -LiteralPath $bucketPath -PathType Container) {
        @(Get-ChildItem -LiteralPath $bucketPath -File -Recurse -Force).Count
      }
      else { 0 }
      if ($actual -ne $count) { throw "Storage object count differs: storage/$bucket" }
    }
    $storageRoot = Join-Path $Root 'storage'
    if (Test-Path -LiteralPath $storageRoot -PathType Container) {
      foreach ($directory in @(Get-ChildItem -LiteralPath $storageRoot -Directory -Force)) {
        if (-not $seen.Contains($directory.Name) -and
            @(Get-ChildItem -LiteralPath $directory.FullName -File -Recurse -Force).Count -gt 0) {
          throw "Storage bucket is absent from object counts: storage/$($directory.Name)"
        }
      }
    }
  }
}

function Assert-BackupPathWithoutLinks {
  param([string]$Path)
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      $entry = Get-Item -LiteralPath $current -Force
      if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw '备份与暂存目录不能包含符号链接或目录联接，请使用实际目录。'
      }
    }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }
    $current = $parent
  }
}

function Enter-BackupReadLease {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$AllowPendingUpdate
  )
  $resolved = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]'\/').ToUpperInvariant()
  Assert-BackupPathWithoutLinks -Path $resolved
  if (-not $script:BackupMutexLeases) { $script:BackupMutexLeases = @{} }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($resolved)))).Replace('-', '')
  }
  finally { $sha.Dispose() }
  $name = "Global\ArtBackup_$hash"
  if (-not $script:BackupMutexLeases.ContainsKey($name)) {
    $mutex = [Threading.Mutex]::new($false, $name)
    $acquired = $false
    try { $acquired = $mutex.WaitOne(10000) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
      $mutex.Dispose()
      throw '备份目录正被其他命令使用，请等待任务完成后重试。'
    }
    $script:BackupMutexLeases[$name] = $mutex
  }
  if (-not $AllowPendingUpdate -and (Test-Path -LiteralPath "$resolved.update-work/transaction.json")) {
    $held = $script:BackupMutexLeases[$name]
    if ($held) { $held.ReleaseMutex(); $held.Dispose(); $script:BackupMutexLeases.Remove($name) }
    throw '备份更新尚未完成，请先运行更新恢复；当前备份不可用于校验、打包或恢复。'
  }
}

function Assert-BackupManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]$Manifest,
    [string]$TargetProjectRef,
    [switch]$VerifyPayloadCompleteness
  )

  Enter-BackupReadLease -Root $Root

  if ($Manifest.format_version -ne 1 -or $Manifest.project_ref -notmatch '^[a-z0-9]{20}$') {
    throw 'Invalid backup manifest format or source project ref.'
  }
  if ($TargetProjectRef -and $Manifest.project_ref -eq $TargetProjectRef) {
    throw 'The target project must differ from the backup source project.'
  }

  $files = @($Manifest.files)
  if ($files.Count -eq 0) { throw 'The backup manifest has no files.' }
  $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  $paths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $files) {
    $relativePath = [string]$entry.path
    $normalizedPath = $relativePath.Replace('\', '/')
    if ([string]::IsNullOrWhiteSpace($relativePath) -or [IO.Path]::IsPathRooted($relativePath) -or
        $relativePath.Contains(':') -or
        @($normalizedPath -split '/' | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count -gt 0) {
      throw "Unsafe path in backup manifest: $relativePath"
    }
    $fullPath = [IO.Path]::GetFullPath((Join-Path $Root $relativePath))
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not $paths.Add($normalizedPath)) {
      throw "Duplicate or out-of-root backup path: $relativePath"
    }
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      throw "Backup file is missing: $relativePath"
    }
    $file = Get-Item -LiteralPath $fullPath
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $file.Length -ne [long]$entry.bytes -or
        (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash -ne [string]$entry.sha256) {
      throw "Backup file failed integrity check: $relativePath"
    }
  }
  foreach ($directory in @(Get-ChildItem -LiteralPath $Root -Directory -Recurse -Force)) {
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Backup contains a linked directory: $($directory.FullName)"
    }
  }
  foreach ($file in @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force)) {
    $relativePath = $file.FullName.Substring($Root.Length + 1).Replace('\', '/')
    if ($relativePath -notin @('manifest.json', 'README.md') -and -not $paths.Contains($relativePath)) {
      throw "Backup contains an unverified file: $relativePath"
    }
  }
  foreach ($required in @('config.toml', 'database/roles.sql', 'database/schema.sql',
      'database/data.sql', 'database/migration-history-schema.sql',
      'database/migration-history-data.sql', 'metadata/functions.json',
      'metadata/storage-buckets.json', 'metadata/realtime-publication-tables.json')) {
    if (-not $paths.Contains($required)) { throw "Backup manifest is missing $required" }
  }
  $functionMetadata = Join-Path $Root 'metadata/functions.json'
  $functions = @(ConvertFrom-SupabaseJsonArray `
    -Text (Get-Content -LiteralPath $functionMetadata -Raw -Encoding UTF8) `
    -Description 'the backed-up Edge Function list')
  foreach ($function in $functions) {
    if ($function.slug -notmatch '^[a-z0-9][a-z0-9_-]*$' -or
        -not (Test-Path -LiteralPath (Join-Path $Root "functions/$($function.slug)") -PathType Container)) {
      throw "Backup is missing a deployed Edge Function: $($function.slug)"
    }
  }
  $layout = Get-BackupFunctionLayout -Root $Root
  if ($null -ne $layout) {
    if (-not $paths.Contains('metadata/function-layout.json')) {
      throw 'Edge Function layout metadata is absent from the backup manifest.'
    }
    Assert-BackupFunctionLayout -Root $Root -Layout $layout -Functions $functions -ManifestPaths $paths
    foreach ($path in $paths) {
      if (-not $path.StartsWith('functions/', [StringComparison]::Ordinal)) { continue }
      $parts = $path.Split('/')
      if ($parts.Count -lt 4 -or $parts[2] -ne '_bundle' -or
          @($layout.functions | Where-Object { $_.slug -eq $parts[1] }).Count -ne 1) {
        throw "Unregistered Edge Function bundle file: $path"
      }
    }
  }
  if ($VerifyPayloadCompleteness) { Assert-BackupPayloadCompleteness -Root $Root -Manifest $Manifest }
}
