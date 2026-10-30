# Per-function checkpoints live outside the snapshot. Each download keeps its
# own dependency tree; functions deployed at different times may differ in _shared.
function Get-BackupFunctionIdentity {
  param([Parameter(Mandatory = $true)]$Function)
  if ($Function.slug -notmatch '^[a-z0-9][a-z0-9_-]*$') { throw '来源项目返回了无效函数名称。' }
  $descriptor = [ordered]@{}
  foreach ($field in @('slug', 'id', 'version', 'ezbr_sha256', 'verify_jwt', 'entrypoint_path', 'import_map')) {
    $descriptor[$field] = $Function.$field
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($descriptor | ConvertTo-Json -Compress -Depth 6))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '') }
  finally { $sha.Dispose() }
}

function Get-BackupFunctionSetHash {
  param([object[]]$Functions)
  $identities = @($Functions | Sort-Object slug | ForEach-Object { Get-BackupFunctionIdentity -Function $_ })
  if (@($Functions | Group-Object slug | Where-Object Count -gt 1).Count) { throw '函数清单包含重复名称，已停止备份。' }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($identities -join "`n"))))).Replace('-', '') }
  finally { $sha.Dispose() }
}

function Get-BackupFunctionCheckpointPath {
  param([string]$BackupPath, $Function)
  [void](Get-BackupFunctionIdentity -Function $Function)
  $directory = Join-Path (Get-BackupIncompleteDirectory -BackupPath $BackupPath) 'function-cache'
  Assert-BackupPathWithoutLinks -Path $directory
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $path = Join-Path $directory "$($Function.slug).json"
  Assert-BackupPathWithoutLinks -Path $path
  return $path
}

function Save-BackupFunctionCheckpoint {
  param([string]$BackupPath, [string]$ProjectRef, $Function, [string]$SourcePath)
  Assert-BackupFunctionSource -BackupPath $BackupPath -SourcePath $SourcePath
  $source = [IO.Path]::GetFullPath($SourcePath).TrimEnd([char[]]'\/')
  $slugDirectory = Join-Path $source $Function.slug
  if (-not (Test-Path -LiteralPath $slugDirectory -PathType Container) -or
      @(Get-ChildItem -LiteralPath $slugDirectory -File -Recurse -Force).Count -eq 0) {
    throw "函数 $($Function.slug) 下载结果不完整，已保留暂存文件。"
  }
  $files = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
    Assert-BackupPathWithoutLinks -Path $_.FullName
    [pscustomobject]@{ path = $_.FullName.Substring($source.Length + 1).Replace('\', '/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  })
  foreach ($directory in @(Get-ChildItem -LiteralPath $source -Directory -Recurse -Force)) {
    Assert-BackupPathWithoutLinks -Path $directory.FullName
  }
  $record = [pscustomobject]@{
    format_version = 1; project_ref = $ProjectRef; slug = $Function.slug
    identity = Get-BackupFunctionIdentity -Function $Function
    source_path = $source; files = $files
  }
  $path = Get-BackupFunctionCheckpointPath -BackupPath $BackupPath -Function $Function
  $temporary = "$path.$([guid]::NewGuid()).tmp"
  $record | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $path -Force -ErrorAction Stop
  return $record
}

function Read-BackupFunctionCheckpoint {
  param([string]$BackupPath, [string]$ProjectRef, $Function)
  # Without deployment identity, do not infer remote equality from local files.
  if ([string]::IsNullOrWhiteSpace([string]$Function.id) -or $Function.version -notmatch '^\d+$' -or
      $Function.ezbr_sha256 -notmatch '^[a-fA-F0-9]{64}$') { return $null }
  $path = Get-BackupFunctionCheckpointPath -BackupPath $BackupPath -Function $Function
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  try { $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
  catch { Write-Warning "函数 $($Function.slug) 的进度记录损坏，将只重新下载该函数。"; return $null }
  if ($record.format_version -ne 1 -or $record.project_ref -ne $ProjectRef -or
      $record.slug -ne $Function.slug -or $record.identity -ne (Get-BackupFunctionIdentity -Function $Function)) { return $null }
  if ([string]::IsNullOrWhiteSpace([string]$record.source_path)) { return $null }
  Assert-BackupFunctionSource -BackupPath $BackupPath -SourcePath $record.source_path
  if (-not (Test-BackupFunctionFiles -Root $record.source_path -Files @($record.files))) { return $null }
  return $record
}

function Invoke-BackupFunctionDownload {
  param([string]$BackupPath, [string]$ProjectRef, $Function, [string]$ConfigPath)
  $record = Read-BackupFunctionCheckpoint -BackupPath $BackupPath -ProjectRef $ProjectRef -Function $Function
  if ($record) { Write-Host "复用已校验函数：$($Function.slug)"; return $record }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $work = Join-Path (Get-BackupIncompleteDirectory -BackupPath $BackupPath) ("fn-$([guid]::NewGuid().ToString('N').Substring(0, 12))")
    $projectDirectory = Join-Path $work 'supabase'
    New-Item -ItemType Directory -Path $projectDirectory -Force | Out-Null
    Copy-Item -LiteralPath $ConfigPath -Destination (Join-Path $projectDirectory 'config.toml') -ErrorAction Stop
    Write-Host "阶段：下载函数 $($Function.slug)（$attempt/3）"
    Push-Location $work
    try { $result = Invoke-SupabaseQuiet @('functions', 'download', [string]$Function.slug, '--project-ref', $ProjectRef, '--use-api') }
    finally { Pop-Location }
    foreach ($line in @($result.Output, $result.Error)) { if (-not [string]::IsNullOrWhiteSpace($line)) { Write-Host $line } }
    if ($result.Succeeded) {
      return Save-BackupFunctionCheckpoint -BackupPath $BackupPath -ProjectRef $ProjectRef -Function $Function -SourcePath (Join-Path $projectDirectory 'functions')
    }
    $errorText = "$($result.Output)`n$($result.Error)"
    $transient = $errorText -match '(?i)\bEOF\b|unexpected eof|timed?\s*out|timeout|connection (reset|refused)|TLS handshake|context deadline|temporary failure|no such host|\b(429|500|502|503|504)\b'
    if (-not $transient -or $attempt -eq 3) {
      throw "函数 $($Function.slug) 下载失败；已完成函数和 SQL 均已保留。网络恢复后从原备份目录继续，无需重新创建备份。"
    }
    Write-Warning "函数 $($Function.slug) 下载连接中断，$($attempt * 2) 秒后自动重试；已完成函数不会重下。"
    Start-Sleep -Seconds ($attempt * 2)
  }
}

function New-BackupFunctionTree {
  param([string]$BackupPath, [string]$ProjectRef, [object[]]$Functions, [string]$ConfigPath)
  $assembly = Join-Path (Get-BackupIncompleteDirectory -BackupPath $BackupPath) ("tree-$([guid]::NewGuid().ToString('N').Substring(0, 12))")
  $fresh = Join-Path $assembly 'validated-functions'
  New-Item -ItemType Directory -Path $fresh -Force | Out-Null
  $layout = New-Object System.Collections.Generic.List[object]
  foreach ($function in $Functions) {
    $record = Invoke-BackupFunctionDownload -BackupPath $BackupPath -ProjectRef $ProjectRef -Function $function -ConfigPath $ConfigPath
    $bundleRoot = Join-Path $fresh "$($function.slug)/_bundle"
    foreach ($file in @($record.files)) {
      $target = Join-Path $bundleRoot $file.path
      New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
      Copy-Item -LiteralPath (Join-Path $record.source_path $file.path) -Destination $target -ErrorAction Stop
    }
    if (-not (Test-BackupFunctionFiles -Root $bundleRoot -Files @($record.files))) { throw "函数 $($function.slug) 复制校验失败，缓存仍保留。" }
    $entry = "$($function.slug)/index.ts"
    if (-not [string]::IsNullOrWhiteSpace([string]$function.entrypoint_path)) {
      $match = [regex]::Match([string]$function.entrypoint_path, '/supabase/functions/(.+)$')
      if ($match.Success) { $entry = $match.Groups[1].Value }
      else {
        # Earlier CLI deployment layouts put the function directly in source/.
        # Map only known layouts, then require that exact file in its own bundle.
        $slugPattern = [regex]::Escape([string]$function.slug)
        $legacy = [regex]::Match([string]$function.entrypoint_path, "/source/(?:functions/)?$slugPattern/(.+)$")
        if ($legacy.Success) { $entry = "$($function.slug)/$($legacy.Groups[1].Value)" }
        elseif ([string]$function.entrypoint_path -notmatch '/source/index\.ts$') {
          throw "函数 $($function.slug) 的入口路径无法识别，请核对部署配置。"
        }
      }
    }
    if (-not $entry.StartsWith("$($function.slug)/", [StringComparison]::Ordinal) -or
        $entry.Contains(':') -or @($entry -split '[\\/]' | Where-Object { $_ -in @('', '.', '..') }).Count -or
        -not (Test-Path -LiteralPath (Join-Path $bundleRoot $entry) -PathType Leaf)) { throw "函数 $($function.slug) 缺少可验证的入口源码。" }
    $importMap = $null
    if ($function.import_map -eq $true) {
      $candidates = @("$($function.slug)/deno.json", "$($function.slug)/import_map.json", 'deno.json', 'import_map.json')
      $found = @($candidates | Where-Object { Test-Path -LiteralPath (Join-Path $bundleRoot $_) -PathType Leaf })
      if ($found.Count -ne 1) { throw "函数 $($function.slug) 的 import map 无法唯一确定，缓存已保留，请核对配置。" }
      $importMap = "functions/$($function.slug)/_bundle/$($found[0])"
    }
    $layout.Add([pscustomobject]@{ slug = $function.slug; entrypoint = "functions/$($function.slug)/_bundle/$entry"; import_map = $importMap })
  }
  $layoutPath = Join-Path $assembly 'function-layout.json'
  [pscustomobject]@{ format_version = 1; layout = 'isolated-bundles'; functions = @($layout.ToArray()) } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $layoutPath -Encoding utf8
  return [pscustomobject]@{ source_path = $fresh; layout_path = $layoutPath }
}
