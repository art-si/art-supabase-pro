function Get-BackupDumpDefinitions {
  @(
    @{ Name = 'roles.sql'; Stage = '导出数据库角色'; Arguments = @('--role-only') },
    @{ Name = 'schema.sql'; Stage = '导出数据库结构'; Arguments = @('--keep-comments') },
    @{ Name = 'data.sql'; Stage = '导出数据库数据'; Arguments = @('--data-only', '--use-copy', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes') },
    @{ Name = 'migration-history-schema.sql'; Stage = '导出迁移历史结构'; Arguments = @('--schema', 'supabase_migrations') },
    @{ Name = 'migration-history-data.sql'; Stage = '导出迁移历史数据'; Arguments = @('--schema', 'supabase_migrations', '--data-only', '--use-copy') },
    @{ Name = 'managed-schema-snapshot.sql'; Stage = '导出托管结构参考'; Arguments = @('--schema', 'auth,storage', '--keep-comments') }
  )
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

function Test-BackupDumpComplete {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -eq 0) { return $false }
  $endPattern = switch ($Name) {
    'roles.sql' { '^RESET ALL;$' }
    'migration-history-schema.sql' { 'ADD CONSTRAINT .* PRIMARY KEY|^-- PostgreSQL database dump complete' }
    default { '^-- PostgreSQL database dump complete' }
  }
  return [bool]((Get-Content -LiteralPath $Path -Tail 16) -match $endPattern)
}

function New-BackupProgress {
  param([string]$ProjectRef, [string]$CreatedAt = (Get-Date).ToUniversalTime().ToString('o'))
  return @{ format_version = 1; project_ref = $ProjectRef; created_at = $CreatedAt; resumed = $false; files = @{} }
}

function Save-BackupProgress {
  param([string]$BackupPath, [hashtable]$Progress)
  $metadata = Join-Path $BackupPath 'metadata'
  Assert-BackupPathWithoutLinks -Path $metadata
  New-Item -ItemType Directory -Path $metadata -Force | Out-Null
  $target = Join-Path $metadata 'backup-progress.json'
  $Progress | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$target.tmp" -Encoding utf8
  Move-Item -LiteralPath "$target.tmp" -Destination $target -Force
}

function Read-BackupProgress {
  param([string]$BackupPath, [string]$ProjectRef)
  $target = Join-Path $BackupPath 'metadata/backup-progress.json'
  Assert-BackupPathWithoutLinks -Path $target
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw '无法安全续跑：缺少备份来源和阶段记录。请先从原运维任务核对目录，不要混用其他来源的导出。'
  }
  try { $saved = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json }
  catch { throw '备份阶段记录无法读取，请保留已有文件并核对目录。' }
  if ($saved.format_version -ne 1 -or $saved.project_ref -ne $ProjectRef -or -not $saved.files) {
    throw '备份来源项目或阶段记录不匹配，不能混合续跑。'
  }
  $progress = New-BackupProgress -ProjectRef $ProjectRef -CreatedAt $saved.created_at
  $progress.resumed = $true
  if ($saved.PSObject.Properties['seeded_from_run_id']) {
    if ($saved.seeded_from_run_id -notmatch '^[a-f0-9-]{36}$') { throw '原备份任务来源记录无效。' }
    $progress.seeded_from_run_id = $saved.seeded_from_run_id
  }
  $names = @(Get-BackupDumpDefinitions | ForEach-Object { $_.Name })
  foreach ($item in $saved.files.PSObject.Properties) {
    if ($item.Name -notin $names -or $item.Value.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $item.Value.bytes -notmatch '^\d+$') {
      throw '备份阶段记录包含无效文件信息，请核对原备份。'
    }
    $progress.files[$item.Name] = @{ sha256 = $item.Value.sha256; bytes = [long]$item.Value.bytes; completed_at = $item.Value.completed_at }
  }
  return $progress
}

function Test-RecordedBackupDump {
  param([string]$BackupPath, [hashtable]$Definition, [hashtable]$Progress)
  $file = Join-Path $BackupPath "database/$($Definition.Name)"
  Assert-BackupPathWithoutLinks -Path $file
  if (-not $Progress.files.ContainsKey($Definition.Name)) { return $false }
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $false }
  $saved = $Progress.files[$Definition.Name]
  if (-not (Test-BackupDumpComplete -Path $file -Name $Definition.Name) -or
      (Get-Item -LiteralPath $file).Length -ne $saved.bytes -or
      (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $saved.sha256) {
    throw "已完成的导出 $($Definition.Name) 已变化，不能继续混用；原文件已保留。"
  }
  return $true
}

function Get-BackupIncompleteDirectory {
  param([string]$BackupPath)
  $root = [IO.Path]::GetFullPath($BackupPath).TrimEnd([char[]]'\/')
  $parent = Split-Path -Parent $root
  $directory = [IO.Path]::GetFullPath((Join-Path $parent ((Split-Path -Leaf $root) + '.incomplete')))
  if ((Split-Path -Parent $directory) -ne $parent -or $directory -eq $root) { throw '导出暂存路径无效。' }
  Assert-BackupPathWithoutLinks -Path $directory
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  return $directory
}

function Invoke-BackupDatabaseDump {
  param([string]$BackupPath, [hashtable]$Definition, [string[]]$TargetArguments, [hashtable]$Progress)
  if (Test-RecordedBackupDump -BackupPath $BackupPath -Definition $Definition -Progress $Progress) {
    Write-Host "复用已完成并校验的导出：$($Definition.Name)"
    return
  }
  $root = [IO.Path]::GetFullPath($BackupPath).TrimEnd([char[]]'\/')
  $database = Join-Path $root 'database'
  New-Item -ItemType Directory -Path $database -Force | Out-Null
  $target = [IO.Path]::GetFullPath((Join-Path $database $Definition.Name))
  if ((Split-Path -Parent $target) -ne $database) { throw '数据库导出路径无效。' }
  $staging = Get-BackupIncompleteDirectory -BackupPath $root
  if (Test-Path -LiteralPath $target) {
    $preserved = Join-Path $staging ("$([guid]::NewGuid())-$($Definition.Name).partial")
    Move-Item -LiteralPath $target -Destination $preserved
    Write-Host "未完成导出已保留到备份目录外：$preserved"
  }
  $temporary = Join-Path $staging ("$([guid]::NewGuid())-$($Definition.Name).partial")
  Write-Host "阶段：$($Definition.Stage)"
  try {
    Invoke-Supabase (@('db', 'dump') + $TargetArguments + $Definition.Arguments + @('--file', $temporary))
    if (-not (Test-BackupDumpComplete -Path $temporary -Name $Definition.Name)) {
      throw "数据库导出 $($Definition.Name) 没有完整结束标记。"
    }
  }
  catch {
    Write-Host "本阶段未完成，暂存文件保留在：$temporary"
    throw
  }
  $completed = @{
    sha256 = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash
    bytes = (Get-Item -LiteralPath $temporary).Length
    completed_at = (Get-Date).ToUniversalTime().ToString('o')
  }
  Move-Item -LiteralPath $temporary -Destination $target
  $Progress.files[$Definition.Name] = $completed
  Save-BackupProgress -BackupPath $root -Progress $Progress
  Write-Host "数据库文件已完成：$($Definition.Name)"
}

function Assert-NoRunningBackupDump {
  param([string]$ProjectRef)
  $containers = & docker ps --format '{{.ID}} {{.Image}}' 2>$null
  if ($LASTEXITCODE -ne 0) { throw '无法核对 Docker 导出状态，请启动 Docker Desktop 后重试。' }
  foreach ($line in $containers) {
    if ($line -notmatch '^([a-f\d]{12,64})\s+.*supabase/postgres(?::|@)') { continue }
    $containerId = $Matches[1]
    # The captured configuration can contain a password; never print it.
    $configuration = & docker inspect --format '{{json .Config}}' $containerId 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Docker 容器状态正在变化，请稍后重新核对再执行。' }
    $serialized = $configuration -join "`n"
    if ($serialized.Contains($ProjectRef) -and $serialized -match 'pg_dump\b') {
      throw '本项目还有旧数据库导出正在运行，请先等待结束或在运维台停止旧导出，再续跑。'
    }
  }
}

function Assert-BackupFunctionSource {
  param([string]$BackupPath, [string]$SourcePath)
  $backup = [IO.Path]::GetFullPath($BackupPath).TrimEnd([char[]]'\/')
  $source = [IO.Path]::GetFullPath($SourcePath).TrimEnd([char[]]'\/')
  $installed = Join-Path $backup 'functions'
  $staging = [IO.Path]::GetFullPath("$backup.incomplete") + [IO.Path]::DirectorySeparatorChar
  if ($source -ne $installed -and -not $source.StartsWith($staging, [StringComparison]::OrdinalIgnoreCase)) {
    throw '函数暂存位置不属于本备份，已停止处理。'
  }
  Assert-BackupPathWithoutLinks -Path $source
}

function Test-BackupFunctionFiles {
  param([string]$Root, [object[]]$Files)
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $false }
  $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in $Files) {
    $relative = [string]$file.path
    if ([string]::IsNullOrWhiteSpace($relative) -or [IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or
        @($relative -split '[\\/]' | Where-Object { $_ -in @('', '.', '..') }).Count -gt 0 -or
        -not $seen.Add($relative.Replace('\', '/')) -or $file.sha256 -notmatch '^[a-fA-F0-9]{64}$') { return $false }
    $path = [IO.Path]::GetFullPath((Join-Path $Root $relative))
    if (-not $path.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    Assert-BackupPathWithoutLinks -Path $path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -ne $file.bytes -or
        (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $file.sha256) { return $false }
  }
  return @($Files).Count -gt 0 -and @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force).Count -eq @($Files).Count
}

function Save-BackupFunctionProgress {
  param([string]$BackupPath, [string]$ProjectRef, [string]$SourcePath, [string]$MetadataHash)
  Assert-BackupFunctionSource -BackupPath $BackupPath -SourcePath $SourcePath
  $source = [IO.Path]::GetFullPath($SourcePath).TrimEnd([char[]]'\/')
  $files = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
    Assert-BackupPathWithoutLinks -Path $_.FullName
    [pscustomobject]@{
      path = $_.FullName.Substring($source.Length + 1).Replace('\', '/')
      bytes = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  })
  if (-not $files.Count) { throw '函数暂存目录没有可校验的源码，请重新下载。' }
  $record = [pscustomobject]@{ format_version = 1; project_ref = $ProjectRef; metadata_sha256 = $MetadataHash; source_path = $source; files = $files }
  $metadata = Join-Path $BackupPath 'metadata'
  Assert-BackupPathWithoutLinks -Path $metadata
  New-Item -ItemType Directory -Path $metadata -Force | Out-Null
  $temporary = Join-Path (Get-BackupIncompleteDirectory -BackupPath $BackupPath) ("functions-progress-$([guid]::NewGuid()).json.tmp")
  $record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination (Join-Path $metadata 'functions-progress.json') -Force -ErrorAction Stop
  return $record
}

function Read-BackupFunctionProgress {
  param([string]$BackupPath, [string]$ProjectRef, [string]$MetadataHash)
  $path = Join-Path $BackupPath 'metadata/functions-progress.json'
  Assert-BackupPathWithoutLinks -Path $path
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  try { $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
  catch { Write-Warning '函数阶段记录无法读取，本次将重新下载函数。'; return $null }
  if ($record.format_version -ne 1 -or $record.project_ref -ne $ProjectRef -or $record.metadata_sha256 -ne $MetadataHash) { return $null }
  if ([string]::IsNullOrWhiteSpace($record.source_path)) { return $null }
  Assert-BackupFunctionSource -BackupPath $BackupPath -SourcePath $record.source_path
  if (-not (Test-BackupFunctionFiles -Root $record.source_path -Files @($record.files))) { return $null }
  return $record
}

function Move-BackupFunctionDirectory {
  param([string]$BackupPath, [string]$Source, [string]$Destination)
  $backup = [IO.Path]::GetFullPath($BackupPath).TrimEnd([char[]]'\/')
  $sourcePath = [IO.Path]::GetFullPath($Source).TrimEnd([char[]]'\/')
  $destinationPath = [IO.Path]::GetFullPath($Destination).TrimEnd([char[]]'\/')
  $installed = Join-Path $backup 'functions'
  $stagingPrefix = [IO.Path]::GetFullPath("$backup.incomplete") + [IO.Path]::DirectorySeparatorChar
  $installing = $sourcePath.StartsWith($stagingPrefix, [StringComparison]::OrdinalIgnoreCase) -and $destinationPath -eq $installed
  $archiving = $sourcePath -eq $installed -and $destinationPath.StartsWith($stagingPrefix, [StringComparison]::OrdinalIgnoreCase)
  if (-not $installing -and -not $archiving) { throw '函数目录移动超出当前备份范围，已停止。' }
  Assert-BackupPathWithoutLinks -Path $sourcePath
  Assert-BackupPathWithoutLinks -Path $destinationPath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw '函数来源目录不存在，已停止处理。' }
  $sourceFiles = @(Get-ChildItem -LiteralPath $sourcePath -File -Recurse -Force -ErrorAction Stop)
  if ($sourceFiles.Count -eq 0) {
    if ($archiving -and @(Get-ChildItem -LiteralPath $sourcePath -Force -ErrorAction Stop).Count -eq 0) { return }
    throw '函数来源目录没有可校验的源码文件，已停止处理。'
  }
  if (Test-Path -LiteralPath $destinationPath) {
    if (-not $installing -or -not (Test-Path -LiteralPath $destinationPath -PathType Container) -or
        @(Get-ChildItem -LiteralPath $destinationPath -Force -ErrorAction Stop).Count -gt 0) {
      throw '函数目标目录已存在且不为空，请先核对备份状态。'
    }
  }
  $destinationPrefix = $destinationPath + [IO.Path]::DirectorySeparatorChar
  try {
    New-Item -ItemType Directory -Path $destinationPath -Force -ErrorAction Stop | Out-Null
    foreach ($sourceFile in $sourceFiles) {
      Assert-BackupPathWithoutLinks -Path $sourceFile.FullName
      $relativePath = $sourceFile.FullName.Substring($sourcePath.Length + 1)
      $targetFile = [IO.Path]::GetFullPath((Join-Path $destinationPath $relativePath))
      if (-not $targetFile.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw '函数文件超出当前备份目录，已停止。'
      }
      Assert-BackupPathWithoutLinks -Path $targetFile
      New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force -ErrorAction Stop | Out-Null
      Copy-Item -LiteralPath $sourceFile.FullName -Destination $targetFile -Force -ErrorAction Stop
      if ((Get-Item -LiteralPath $targetFile -ErrorAction Stop).Length -ne $sourceFile.Length -or
          (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256 -ErrorAction Stop).Hash -ne
          (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256 -ErrorAction Stop).Hash) {
        throw "函数文件复制后校验失败：$relativePath"
      }
    }
    if (@(Get-ChildItem -LiteralPath $destinationPath -File -Recurse -Force -ErrorAction Stop).Count -ne $sourceFiles.Count) {
      throw '函数复制后的文件数量不匹配。'
    }
  }
  catch {
    throw "函数文件复制或校验失败，来源目录仍保留；请从原备份目录续跑。详情：$($_.Exception.Message)"
  }
  if ($installing) { return }

  # The archive is complete before removing any old installed file. Keep the
  # functions root in place because Windows may deny a directory rename.
  $sourcePrefix = $sourcePath + [IO.Path]::DirectorySeparatorChar
  try {
    foreach ($sourceFile in $sourceFiles) {
      $safeFile = [IO.Path]::GetFullPath($sourceFile.FullName)
      if (-not $safeFile.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw '旧函数文件超出当前备份目录，已停止清理。'
      }
      Assert-BackupPathWithoutLinks -Path $safeFile
      Remove-Item -LiteralPath $safeFile -Force -ErrorAction Stop
    }
    $sourceDirectories = @(Get-ChildItem -LiteralPath $sourcePath -Directory -Recurse -Force -ErrorAction Stop |
      Sort-Object { $_.FullName.Length } -Descending)
    foreach ($sourceDirectory in $sourceDirectories) {
      $safeDirectory = [IO.Path]::GetFullPath($sourceDirectory.FullName)
      if (-not $safeDirectory.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw '旧函数子目录超出当前备份目录，已停止清理。'
      }
      Assert-BackupPathWithoutLinks -Path $safeDirectory
      Remove-Item -LiteralPath $safeDirectory -Force -ErrorAction Stop
    }
  }
  catch {
    throw "旧函数已完整归档，但原目录未能清空；请核对占用后从原备份目录续跑。详情：$($_.Exception.Message)"
  }
}
