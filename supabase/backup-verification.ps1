function Invoke-BackupVerification {
  param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [string]$VerificationReportPath
  )

  $root = [IO.Path]::GetFullPath($BackupPath).TrimEnd([char[]]'\/')
  Enter-BackupReadLease -Root $root
  $startedAt = (Get-Date).ToUniversalTime().ToString('o')
  $issueState = @{ count = 0; items = [Collections.Generic.List[object]]::new() }
  $checks = [Collections.Generic.List[object]]::new()
  $groupIds = @('database', 'functions', 'storage', 'metadata', 'configuration', 'other')
  $groupLabels = @('数据库', '函数源码', 'Storage 文件', '元数据', '配置', '其他')
  $groups = [ordered]@{}
  for ($index = 0; $index -lt $groupIds.Count; $index++) {
    $groups[$groupIds[$index]] = [ordered]@{ id = $groupIds[$index]; label = $groupLabels[$index]; files = 0; verifiedFiles = 0; bytes = [long]0 }
  }
  $addIssue = {
    param([string]$Code, [string]$Path, [string]$Message)
    $issueState.count++
    if ($issueState.items.Count -ge 100) { return }
    $issue = [ordered]@{ code = $Code; message = $Message.Substring(0, [Math]::Min($Message.Length, 240)) }
    if (-not [string]::IsNullOrWhiteSpace($Path)) {
      $issue.path = $Path.Replace('\', '/').Substring(0, [Math]::Min($Path.Length, 240))
    }
    $issueState.items.Add([pscustomobject]$issue)
  }
  $addCheck = {
    param([string]$Id, [string]$Label, [string]$Status, [string]$Detail)
    $checks.Add([pscustomobject]@{ id = $Id; label = $Label; status = $Status; detail = $Detail })
  }

  $manifestPath = Join-Path $root 'manifest.json'
  $manifest = $null
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    & $addIssue 'MANIFEST_MISSING' 'manifest.json' '缺少最终清单，备份尚未完成。'
  }
  else {
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -ErrorAction Stop }
    catch { & $addIssue 'MANIFEST_INVALID' 'manifest.json' '最终清单不是有效 JSON。' }
  }
  $canonicalPassed = $false
  if ($null -ne $manifest) {
    Write-Host '阶段：核对清单与必备文件'
    try {
      Assert-BackupManifest -Root $root -Manifest $manifest -VerifyPayloadCompleteness
      $canonicalPassed = $true
    }
    catch { }
  }

  $manifestPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $fileCount = 0
  $verifiedCount = 0
  $totalBytes = [long]0
  $entries = if ($null -ne $manifest -and $manifest.files -is [array]) { @($manifest.files) } else { @() }
  if ($null -ne $manifest -and $manifest.files -isnot [array]) {
    & $addIssue 'MANIFEST_FILES_INVALID' 'manifest.json' '最终清单没有有效的文件列表。'
  }
  $rootPrefix = $root + [IO.Path]::DirectorySeparatorChar
  for ($index = 0; $index -lt $entries.Count; $index++) {
    if (($index + 1) % 50 -eq 0 -or $index + 1 -eq $entries.Count) {
      Write-Host "阶段：核对文件 $($index + 1)/$($entries.Count)"
    }
    $entry = $entries[$index]
    $relative = [string]$entry.path
    $normalized = $relative.Replace('\', '/')
    $groupId = if ($normalized.StartsWith('database/')) { 'database' }
      elseif ($normalized.StartsWith('functions/')) { 'functions' }
      elseif ($normalized.StartsWith('storage/')) { 'storage' }
      elseif ($normalized.StartsWith('metadata/')) { 'metadata' }
      elseif ($normalized -eq 'config.toml') { 'configuration' }
      else { 'other' }
    $fileCount++
    $groups[$groupId].files++
    if ([string]::IsNullOrWhiteSpace($relative) -or [IO.Path]::IsPathRooted($relative) -or
        $relative.Contains(':') -or $normalized -match '(^|/)\.{1,2}(/|$)' -or
        -not $manifestPaths.Add($normalized)) {
      & $addIssue 'FILE_PATH_INVALID' $normalized '清单文件路径无效或重复。'
      continue
    }
    $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $path.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      & $addIssue 'FILE_PATH_INVALID' $normalized '清单文件路径越出备份目录。'
      continue
    }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      & $addIssue 'FILE_MISSING' $normalized '清单中的文件不存在。'
      continue
    }
    try { $file = Get-Item -LiteralPath $path -Force -ErrorAction Stop }
    catch { & $addIssue 'FILE_UNREADABLE' $normalized '文件无法读取。'; continue }
    $groups[$groupId].bytes += [long]$file.Length
    $totalBytes += [long]$file.Length
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      & $addIssue 'FILE_LINKED' $normalized '文件是链接，无法作为可信备份。'
      continue
    }
    if ($file.Length -ne [long]$entry.bytes) {
      & $addIssue 'FILE_SIZE_MISMATCH' $normalized '文件大小与清单不符。'
      continue
    }
    try { $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash }
    catch { & $addIssue 'FILE_UNREADABLE' $normalized '无法计算文件 SHA-256。'; continue }
    if ($entry.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $actualHash -ne [string]$entry.sha256) {
      & $addIssue 'FILE_HASH_MISMATCH' $normalized '文件 SHA-256 与清单不符。'
      continue
    }
    $verifiedCount++
    $groups[$groupId].verifiedFiles++
  }
  if ($entries.Count -eq 0) { Write-Host '阶段：核对文件 0/0' }
  if ($null -ne $manifest) {
    try {
      foreach ($file in @(Get-ChildItem -LiteralPath $root -File -Recurse -Force -ErrorAction Stop)) {
        $relative = $file.FullName.Substring($rootPrefix.Length).Replace('\', '/')
        if ($relative -notin @('manifest.json', 'README.md') -and -not $manifestPaths.Contains($relative)) {
          & $addIssue 'FILE_UNLISTED' $relative '存在未列入最终清单的文件。'
        }
      }
    }
    catch { & $addIssue 'FILE_SCAN_FAILED' '' '无法遍历全部备份文件。' }
  }
  & $addCheck 'manifest' '最终清单与文件' $(if ($canonicalPassed) { 'passed' } else { 'failed' }) `
    $(if ($canonicalPassed) { '最终清单通过标准校验。' } else { '标准校验未通过，不能恢复此备份。' })
  & $addCheck 'files' '文件大小与 SHA-256' $(if ($entries.Count -gt 0 -and $verifiedCount -eq $entries.Count) { 'passed' } else { 'failed' }) `
    "已核对 $verifiedCount/$($entries.Count) 个清单文件。"

  $required = @('config.toml', 'database/roles.sql', 'database/schema.sql', 'database/data.sql',
    'database/migration-history-schema.sql', 'database/migration-history-data.sql',
    'metadata/functions.json', 'metadata/storage-buckets.json', 'metadata/realtime-publication-tables.json')
  $missingRequired = @($required | Where-Object { -not $manifestPaths.Contains($_) })
  foreach ($relative in $missingRequired) { & $addIssue 'REQUIRED_FILE_MISSING' $relative '缺少必备文件。' }
  & $addCheck 'required' '必备文件' $(if ($missingRequired.Count -eq 0) { 'passed' } else { 'failed' }) `
    $(if ($missingRequired.Count -eq 0) { '必备文件均已列入清单。' } else { "缺少 $($missingRequired.Count) 个必备文件。" })

  $sqlFailed = 0
  foreach ($name in @('roles.sql', 'schema.sql', 'data.sql', 'migration-history-schema.sql',
      'migration-history-data.sql', 'managed-schema-snapshot.sql')) {
    $relative = "database/$name"
    $path = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      if ($name -eq 'managed-schema-snapshot.sql' -and $manifest.recipient_safe_auth -eq $true) { continue }
      $sqlFailed++
      & $addIssue 'SQL_MISSING' $relative '数据库导出文件不存在。'
      continue
    }
    try { $sqlComplete = Test-BackupSqlComplete -Path $path -Name $name -RecipientSafeAuth:($manifest.recipient_safe_auth -eq $true) }
    catch { $sqlComplete = $false }
    if (-not $sqlComplete) {
      $sqlFailed++
      & $addIssue 'SQL_INCOMPLETE' $relative '数据库导出缺少完整结束标志。'
    }
  }
  & $addCheck 'sql' '数据库导出结束标志' $(if ($sqlFailed -eq 0) { 'passed' } else { 'failed' }) `
    $(if ($sqlFailed -eq 0) { '数据库 SQL 均有预期结束标志。' } else { "$sqlFailed 个 SQL 文件缺失或未完整结束。" })

  $metadataFailed = 0
  foreach ($relative in @('metadata/functions.json', 'metadata/storage-buckets.json',
      'metadata/realtime-publication-tables.json', 'metadata/storage-object-counts.json')) {
    $path = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    try {
      $parsed = @(ConvertFrom-SupabaseJsonArray `
        -Text (Get-Content -LiteralPath $path -Raw -Encoding UTF8) `
        -Description $relative)
      $valid = $true
    }
    catch { $valid = $false }
    if (-not $valid) {
      $metadataFailed++
      & $addIssue 'METADATA_INVALID' $relative '元数据不是有效的 JSON 数组。'
    }
  }
  & $addCheck 'metadata' 'JSON 元数据' $(if ($metadataFailed -eq 0) { 'passed' } else { 'failed' }) `
    $(if ($metadataFailed -eq 0) { '现有元数据可解析。' } else { "$metadataFailed 个元数据文件无效。" })

  $layoutFailed = $false
  $layoutPath = Join-Path $root 'metadata/function-layout.json'
  if (Test-Path -LiteralPath $layoutPath -PathType Leaf) {
    try {
      $layout = Get-BackupFunctionLayout -Root $root
      $functions = @(ConvertFrom-SupabaseJsonArray -Text (Get-Content -LiteralPath (Join-Path $root 'metadata/functions.json') -Raw) -Description 'the backed-up Edge Function list')
      Assert-BackupFunctionLayout -Root $root -Layout $layout -Functions $functions -ManifestPaths $manifestPaths
    }
    catch { $layoutFailed = $true; & $addIssue 'FUNCTION_LAYOUT_INVALID' 'metadata/function-layout.json' '函数入口或依赖布局未通过核对。' }
  }
  & $addCheck 'functions' '函数源码覆盖与布局' $(if ($layoutFailed) { 'failed' } elseif ($canonicalPassed) { 'passed' } else { 'warning' }) `
    $(if ($layoutFailed) { '函数布局未通过核对。' } elseif (Test-Path -LiteralPath $layoutPath) { '函数布局与部署清单一致。' } else { '旧版平铺函数目录由标准校验核对。' })

  $storageStatus = 'skipped'
  $storageDetail = '备份没有 Storage 对象数量清单。'
  $countsPath = Join-Path $root 'metadata/storage-object-counts.json'
  if (Test-Path -LiteralPath $countsPath -PathType Leaf) {
    $storageFailed = 0
    $seenBuckets = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    try {
      $counts = @(ConvertFrom-SupabaseJsonArray `
        -Text (Get-Content -LiteralPath $countsPath -Raw -Encoding UTF8) `
        -Description 'Storage object counts')
    }
    catch { $counts = @(); $storageFailed++; & $addIssue 'STORAGE_COUNTS_INVALID' 'metadata/storage-object-counts.json' 'Storage 数量清单不可解析。' }
    foreach ($entry in $counts) {
      $bucket = [string]$entry.bucket_id
      $expected = [long]0
      if ($bucket -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or
          -not $seenBuckets.Add($bucket) -or
          -not [long]::TryParse([string]$entry.object_count, [ref]$expected) -or $expected -lt 0) {
        $storageFailed++
        & $addIssue 'STORAGE_COUNTS_INVALID' 'metadata/storage-object-counts.json' 'Storage 桶数量记录无效。'
        continue
      }
      $bucketPath = Join-Path $root "storage/$bucket"
      $actual = if (Test-Path -LiteralPath $bucketPath -PathType Container) { @(Get-ChildItem -LiteralPath $bucketPath -File -Recurse -Force).Count } else { 0 }
      if ($actual -ne $expected) {
        $storageFailed++
        & $addIssue 'STORAGE_COUNT_MISMATCH' "storage/$bucket" 'Storage 文件数量与清单不符。'
      }
    }
    $storageRoot = Join-Path $root 'storage'
    if (Test-Path -LiteralPath $storageRoot -PathType Container) {
      foreach ($directory in @(Get-ChildItem -LiteralPath $storageRoot -Directory -Force)) {
        if (-not $seenBuckets.Contains($directory.Name) -and
            @(Get-ChildItem -LiteralPath $directory.FullName -File -Recurse -Force).Count -gt 0) {
          $storageFailed++
          & $addIssue 'STORAGE_BUCKET_UNLISTED' "storage/$($directory.Name)" 'Storage 桶未列入数量清单。'
        }
      }
    }
    $storageStatus = if ($storageFailed -eq 0) { 'passed' } else { 'failed' }
    $storageDetail = if ($storageFailed -eq 0) { "已核对 $($counts.Count) 个 Storage 桶。" } else { "$storageFailed 个 Storage 数量问题。" }
  }
  & $addCheck 'storage' 'Storage 文件数量' $storageStatus $storageDetail
  & $addCheck 'restore' '实际恢复' 'skipped' '本次仅核对本地文件，未启动 Docker 或执行恢复。'
  & $addCheck 'remote' '远端最新状态' 'skipped' '未访问远端项目，不能确认备份与当前远端一致。'

  if (-not $canonicalPassed -and $issueState.count -eq 0) {
    & $addIssue 'CANONICAL_VALIDATION_FAILED' 'manifest.json' '标准备份校验未通过。'
  }
  foreach ($group in $groups.Values) {
    Write-Host "分组：$($group.label) $($group.verifiedFiles)/$($group.files) 个文件，$($group.bytes) 字节"
  }
  $status = if ($canonicalPassed -and $issueState.count -eq 0) { 'passed' } else { 'failed' }
  $report = [ordered]@{
    formatVersion = 1
    status = $status
    backupPath = $root
    sourceProjectRef = if ($null -ne $manifest -and $manifest.project_ref -match '^[a-z0-9]{20}$') { [string]$manifest.project_ref } else { $null }
    snapshotCreatedAt = if ($null -ne $manifest -and $manifest.created_at) { [string]$manifest.created_at } else { $null }
    startedAt = $startedAt
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    summary = [ordered]@{ files = $fileCount; verifiedFiles = $verifiedCount; totalBytes = $totalBytes; issueCount = $issueState.count }
    checks = @($checks.ToArray())
    groups = @($groups.Values | ForEach-Object { [pscustomobject]$_ })
    issues = @($issueState.items.ToArray())
    limitations = @('只校验本地文件和阶段元数据，未执行 Docker 恢复。', '未核对远端当前数据；多阶段导出不保证同一事务快照。')
  }
  $destination = if ($VerificationReportPath) { [IO.Path]::GetFullPath($VerificationReportPath) }
    else { Join-Path ([IO.Path]::GetTempPath()) "supabase-backup-verification-$([guid]::NewGuid().ToString('N')).json" }
  if ($destination.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or $destination -eq $root -or
      (Test-Path -LiteralPath $destination)) { throw '校验报告必须写到备份目录外的新文件。' }
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $json = $report | ConvertTo-Json -Depth 8
  if ([Text.Encoding]::UTF8.GetByteCount($json) -gt 262144) { throw '校验报告过大，已停止写入。' }
  $temporary = "$destination.$([guid]::NewGuid().ToString('N')).tmp"
  try {
    [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $destination -ErrorAction Stop
  }
  finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
  Write-Host "校验报告：$destination"
  return [pscustomobject]$report
}
