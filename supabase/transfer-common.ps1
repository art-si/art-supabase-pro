function Invoke-SupabaseQuiet {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $errorPath = Join-Path ([IO.Path]::GetTempPath()) ("supabase-cli-$([guid]::NewGuid()).stderr.tmp")
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $stdout = & supabase @Arguments 2> $errorPath
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  $stderrContent = if (Test-Path $errorPath) { Get-Content -Raw $errorPath } else { $null }
  $stderr = if ($null -eq $stderrContent) { '' } else { $stderrContent.Trim() }
  Remove-Item -LiteralPath $errorPath -Force -ErrorAction SilentlyContinue

  return [pscustomobject]@{
    Succeeded = ($exitCode -eq 0)
    ExitCode = $exitCode
    Output = (($stdout | Out-String).Trim())
    Error = $stderr
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
    [Parameter(Mandatory = $true)][string]$FilePath
  )

  $encodedBucket = [uri]::EscapeDataString($BucketId)
  $encodedObject = ConvertTo-StorageApiPath $ObjectName
  $headers = New-StorageAdminHeaders -Key $ServiceRoleKey -Upsert
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Invoke-WebRequest `
        -Method Post `
        -Uri "$($ApiUrl.TrimEnd('/'))/storage/v1/object/$encodedBucket/$encodedObject" `
        -Headers $headers `
        -InFile $FilePath `
        -ContentType 'application/octet-stream' `
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

function Assert-BackupManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]$Manifest,
    [string]$TargetProjectRef
  )

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
    -Text (Get-Content -LiteralPath $functionMetadata -Raw) `
    -Description 'the backed-up Edge Function list')
  foreach ($function in $functions) {
    if ($function.slug -notmatch '^[a-z0-9][a-z0-9_-]*$' -or
        -not (Test-Path -LiteralPath (Join-Path $Root "functions/$($function.slug)") -PathType Container)) {
      throw "Backup is missing a deployed Edge Function: $($function.slug)"
    }
  }
}
