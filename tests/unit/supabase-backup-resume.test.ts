import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const helperPath = fileURLToPath(new URL('../../supabase/backup-progress.ps1', import.meta.url))
const backupEntryPath = fileURLToPath(
  new URL('../../supabase/backup-supabase.ps1', import.meta.url)
)
const transferHelperPath = fileURLToPath(
  new URL('../../supabase/transfer-common.ps1', import.meta.url)
)
const functionHelperPath = fileURLToPath(
  new URL('../../supabase/backup-functions.ps1', import.meta.url)
)

function runPowerShellFixture(body: string): Record<string, unknown> {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'supabase-backup-resume-'))
  const scriptPath = path.join(directory, 'fixture.ps1')
  writeFileSync(
    scriptPath,
    `\uFEFFif ($PSVersionTable.PSEdition -eq 'Desktop') {
  $windowsModulePaths = @($env:PSModulePath -split [IO.Path]::PathSeparator |
    Where-Object { $_ -match '[\\\\/]WindowsPowerShell[\\\\/]' })
  $systemModulePath = Join-Path $PSHOME 'Modules'
  if ($windowsModulePaths -notcontains $systemModulePath) { $windowsModulePaths += $systemModulePath }
  $env:PSModulePath = $windowsModulePaths -join [IO.Path]::PathSeparator
}
$ErrorActionPreference = 'Stop'
. $env:BACKUP_PROGRESS_HELPER
. $env:BACKUP_FUNCTION_HELPER
${body}
`,
    'utf8'
  )

  try {
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-File', scriptPath],
      {
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          BACKUP_PROGRESS_HELPER: helperPath,
          BACKUP_FUNCTION_HELPER: functionHelperPath,
          BACKUP_ENTRY_SCRIPT: backupEntryPath,
          BACKUP_TRANSFER_HELPER: transferHelperPath,
          BACKUP_TEST_NODE: process.execPath,
          BACKUP_TEST_ROOT: directory
        }
      }
    )
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
    const marker = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('BACKUP_TEST_RESULT='))
    assert.ok(marker, `Fixture did not return a result: ${result.stdout}\n${result.stderr}`)
    return JSON.parse(marker.slice('BACKUP_TEST_RESULT='.length)) as Record<string, unknown>
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const fixtureSetup = String.raw`
$projectRef = 'ckbftoopuyophiebamwy'
$definitions = @(Get-BackupDumpDefinitions)
$script:calls = New-Object System.Collections.Generic.List[string]
$script:mode = 'complete'
function Invoke-Supabase {
  param([string[]]$Arguments)
  $name = $script:currentName
  $script:calls.Add($name)
  $index = [Array]::IndexOf($Arguments, '--file')
  if ($index -lt 0) { throw 'Stub received no output path.' }
  $destination = $Arguments[$index + 1]
  if ($destination -notmatch '\.incomplete[\\/]') { throw 'Dump output was not staged outside the backup.' }
  $footer = if ($name -eq 'roles.sql') { 'RESET ALL;' } else { '-- PostgreSQL database dump complete' }
  if ($script:mode -eq 'fail') {
    Set-Content -LiteralPath $destination -Value 'partial output from failed dump' -Encoding UTF8
    throw 'Simulated CLI failure.'
  }
  if ($script:mode -eq 'missing-footer') { $footer = 'incomplete output' }
  Set-Content -LiteralPath $destination -Value @("-- $name", $footer) -Encoding UTF8
}
function Run-Dump {
  param([hashtable]$Definition, [string]$BackupPath, [hashtable]$Progress)
  $script:currentName = $Definition.Name
  Invoke-BackupDatabaseDump -BackupPath $BackupPath -Definition $Definition -TargetArguments @('--linked') -Progress $Progress
}
function Expect-Throw {
  param([scriptblock]$Action)
  try { & $Action; return $false } catch { return $true }
}
`

test('PowerShell 5.1 捕获原生 CLI stderr 不误报成功进度，真实 EOF 保持失败', () => {
  const result = runPowerShellFixture(String.raw`
. $env:BACKUP_TRANSFER_HELPER
$native = Join-Path $env:BACKUP_TEST_ROOT 'native-cli.js'
@'
if (process.argv[2] === 'success') {
  process.stdout.write(JSON.stringify([{ slug: 'fixture' }]) + '\n')
  process.stderr.write('Downloaded Function fixture from project.\n')
  process.exit(0)
}
process.stderr.write('unexpected EOF while downloading\n')
process.exit(1)
'@ | Set-Content -LiteralPath $native -Encoding ASCII
$global:nativeMode = 'success'
function global:supabase { & $env:BACKUP_TEST_NODE $native $global:nativeMode }
$success = Invoke-SupabaseQuiet @('functions', 'list')
$global:nativeMode = 'failure'
$failure = Invoke-SupabaseQuiet @('functions', 'download')
$summary = @{
  success = $success.Succeeded
  success_code = $success.ExitCode
  success_output = $success.Output
  success_error = $success.Error
  success_json_valid = (@(ConvertFrom-Json -InputObject $success.Output).Count -eq 1)
  failure = $failure.Succeeded
  failure_code = $failure.ExitCode
  failure_output = $failure.Output
  failure_error = $failure.Error
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.success, true)
  assert.equal(result.success_code, 0)
  assert.equal(result.success_json_valid, true)
  assert.equal(result.success_output, '[{"slug":"fixture"}]')
  assert.match(result.success_error as string, /Downloaded Function fixture/)
  assert.doesNotMatch(result.success_error as string, /NativeCommandError|At .*char:|\.ps1:\d/)
  assert.equal(result.failure, false)
  assert.equal(result.failure_code, 1)
  assert.equal(result.failure_output, '')
  assert.match(result.failure_error as string, /unexpected EOF/)
  assert.doesNotMatch(result.failure_error as string, /NativeCommandError|At .*char:|\.ps1:\d/)
})

test('数据库阶段续跑只跳过校验通过的文件，保留部分导出并补齐六份 SQL', () => {
  const result = runPowerShellFixture(`${fixtureSetup}
$backup = Join-Path $env:BACKUP_TEST_ROOT 'backup-a'
$progress = New-BackupProgress -ProjectRef $projectRef
Save-BackupProgress -BackupPath $backup -Progress $progress
Run-Dump -Definition $definitions[0] -BackupPath $backup -Progress $progress
Run-Dump -Definition $definitions[1] -BackupPath $backup -Progress $progress
$partial = Join-Path $backup 'database/data.sql'
Set-Content -LiteralPath $partial -Value 'original partial data must survive' -Encoding UTF8
$progress = Read-BackupProgress -BackupPath $backup -ProjectRef $projectRef
foreach ($definition in $definitions) { Run-Dump -Definition $definition -BackupPath $backup -Progress $progress }
$preserved = @(Get-ChildItem -LiteralPath "$backup.incomplete" -Filter '*data.sql.partial')
$completed = @($definitions | ForEach-Object {
  Test-BackupDumpComplete -Path (Join-Path $backup "database/$($_.Name)") -Name $_.Name
})
$manifest = Test-Path -LiteralPath (Join-Path $backup 'metadata/manifest.json')
$summary = @{
  names = @($definitions | ForEach-Object { $_.Name })
  calls = @($script:calls.ToArray())
  completed = $completed
  tracked_count = $progress.files.Count
  preserved_count = $preserved.Count
  preserved_content = if ($preserved.Count -eq 1) { [IO.File]::ReadAllText($preserved[0].FullName) } else { '' }
  manifest = $manifest
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 6))`)

  assert.equal((result.names as string[]).length, 6)
  assert.deepEqual(result.calls, result.names)
  assert.deepEqual(result.completed, [true, true, true, true, true, true])
  assert.equal(result.tracked_count, 6)
  assert.equal(result.preserved_count, 1)
  assert.match(result.preserved_content as string, /original partial data must survive/)
  assert.equal(result.manifest, false)
})

test('阶段记录来源错误、缺失或已完成文件被改动时拒绝续跑', () => {
  const result = runPowerShellFixture(`${fixtureSetup}
$backup = Join-Path $env:BACKUP_TEST_ROOT 'backup-b'
$missing = Expect-Throw { Read-BackupProgress -BackupPath $backup -ProjectRef $projectRef }
$progress = New-BackupProgress -ProjectRef $projectRef
Save-BackupProgress -BackupPath $backup -Progress $progress
Run-Dump -Definition $definitions[0] -BackupPath $backup -Progress $progress
$wrongSource = Expect-Throw { Read-BackupProgress -BackupPath $backup -ProjectRef 'different-project-ref' }
$roles = Join-Path $backup 'database/roles.sql'
Add-Content -LiteralPath $roles -Value '-- tampered after completion'
$original = Get-Content -LiteralPath $roles -Raw
$tampered = Expect-Throw { Run-Dump -Definition $definitions[0] -BackupPath $backup -Progress $progress }
$unchanged = (Get-Content -LiteralPath $roles -Raw) -eq $original
$summary = @{ missing = $missing; wrong_source = $wrongSource; tampered = $tampered; unchanged = $unchanged; calls = @($script:calls.ToArray()) }
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.missing, true)
  assert.equal(result.wrong_source, true)
  assert.equal(result.tampered, true)
  assert.equal(result.unchanged, true)
  assert.deepEqual(result.calls, ['roles.sql'])
})

test('CLI 失败和缺失完成标记不会安装 SQL 或产生完成清单，暂存文件可诊断', () => {
  const result = runPowerShellFixture(`${fixtureSetup}
$backup = Join-Path $env:BACKUP_TEST_ROOT 'backup-c'
$progress = New-BackupProgress -ProjectRef $projectRef
Save-BackupProgress -BackupPath $backup -Progress $progress
$script:mode = 'fail'
$cliFailed = Expect-Throw { Run-Dump -Definition $definitions[2] -BackupPath $backup -Progress $progress }
$script:mode = 'missing-footer'
$incomplete = Expect-Throw { Run-Dump -Definition $definitions[2] -BackupPath $backup -Progress $progress }
$staged = @(Get-ChildItem -LiteralPath "$backup.incomplete" -Filter '*data.sql.partial')
$summary = @{
  cli_failed = $cliFailed
  incomplete = $incomplete
  staged_count = $staged.Count
  installed = Test-Path -LiteralPath (Join-Path $backup 'database/data.sql')
  tracked_count = $progress.files.Count
  manifest = Test-Path -LiteralPath (Join-Path $backup 'metadata/manifest.json')
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.cli_failed, true)
  assert.equal(result.incomplete, true)
  assert.equal(result.staged_count, 2)
  assert.equal(result.installed, false)
  assert.equal(result.tracked_count, 0)
  assert.equal(result.manifest, false)
})

test('函数暂存记录只复用来源、部署清单和文件哈希均匹配的下载', () => {
  const result = runPowerShellFixture(String.raw`
$backup = Join-Path $env:BACKUP_TEST_ROOT 'function-cache'
$stage = Join-Path "$backup.incomplete" 'functions-fixture/validated-functions'
$file = Join-Path $stage 'resume-test/index.ts'
New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
Set-Content -LiteralPath $file -Value 'Deno.serve(() => new Response("fixture"));' -Encoding UTF8
$projectRef = 'ckbftoopuyophiebamwy'
$metadataHash = ('a' * 64)
$missing = Read-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -MetadataHash $metadataHash
$record = Save-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -SourcePath $stage -MetadataHash $metadataHash
$saved = Read-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -MetadataHash $metadataHash
$path = Join-Path $backup 'metadata/functions-progress.json'
$wrongProject = Read-BackupFunctionProgress -BackupPath $backup -ProjectRef 'different-project-ref' -MetadataHash $metadataHash
$wrongMetadata = Read-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -MetadataHash ('b' * 64)
Add-Content -LiteralPath $file -Value '// changed after download'
$changedFile = Read-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -MetadataHash $metadataHash
$summary = @{
  exists = Test-Path -LiteralPath $path -PathType Leaf
  missing = $null -eq $missing
  source = $record.source_path
  saved = $null -ne $saved
  files = @($record.files).Count
  first_path = [string]$record.files[0].path
  first_hash = [string]$record.files[0].sha256
  wrong_project = $null -eq $wrongProject
  wrong_metadata = $null -eq $wrongMetadata
  changed_file = $null -eq $changedFile
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.exists, true)
  assert.equal(result.missing, true)
  assert.equal(result.saved, true)
  assert.equal(result.files, 1)
  assert.match(result.first_path as string, /resume-test[\\/]index\.ts$/)
  assert.match(result.first_hash as string, /^[A-Fa-f0-9]{64}$/)
  assert.match(result.source as string, /functions-fixture[\\/]validated-functions$/)
  assert.equal(result.wrong_project, true)
  assert.equal(result.wrong_metadata, true)
  assert.equal(result.changed_file, true)
})

test('逐函数缓存按稳定部署身份隔离，清单顺序不影响复用且篡改只影响对应函数', () => {
  const result = runPowerShellFixture(String.raw`
$backup = Join-Path $env:BACKUP_TEST_ROOT 'per-function-cache'
$projectRef = 'ckbftoopuyophiebamwy'
$alpha = [pscustomobject]@{
  slug = 'alpha'; id = 'alpha-id'; version = 11; ezbr_sha256 = ('a' * 64)
  verify_jwt = $true; entrypoint_path = 'index.ts'; import_map = $null
}
$alphaReordered = [pscustomobject]@{
  import_map = $null; entrypoint_path = 'index.ts'; verify_jwt = $true
  ezbr_sha256 = ('a' * 64); version = 11; id = 'alpha-id'; slug = 'alpha'
}
$beta = [pscustomobject]@{
  slug = 'beta'; id = 'beta-id'; version = 12; ezbr_sha256 = ('b' * 64)
  verify_jwt = $false; entrypoint_path = 'index.ts'; import_map = 'import_map.json'
}
$alphaSource = Join-Path "$backup.incomplete" 'alpha/supabase/functions'
$betaSource = Join-Path "$backup.incomplete" 'beta/supabase/functions'
$alphaFile = Join-Path $alphaSource 'alpha/index.ts'
$betaFile = Join-Path $betaSource 'beta/index.ts'
foreach ($file in @($alphaFile, $betaFile)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
  Set-Content -LiteralPath $file -Value "// $file" -Encoding UTF8
}
$alphaShared = Join-Path $alphaSource '_shared/helpers.ts'
$betaShared = Join-Path $betaSource '_shared/helpers.ts'
New-Item -ItemType Directory -Path (Split-Path -Parent $alphaShared), (Split-Path -Parent $betaShared) -Force | Out-Null
Set-Content -LiteralPath $alphaShared -Value '// alpha shared' -Encoding UTF8
Set-Content -LiteralPath $betaShared -Value '// beta shared' -Encoding UTF8
$before = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $alpha
$alphaRecord = Save-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $alpha -SourcePath $alphaSource
$betaRecord = Save-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $beta -SourcePath $betaSource
$alphaReused = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $alphaReordered
$betaReused = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $beta
$changedAlpha = [pscustomobject]@{
  slug = 'alpha'; id = 'alpha-id'; version = 12; ezbr_sha256 = ('c' * 64)
  verify_jwt = $true; entrypoint_path = 'index.ts'; import_map = $null
}
$untrustedAlpha = [pscustomobject]@{
  slug = 'alpha'; id = $null; version = 11; ezbr_sha256 = ('a' * 64)
  verify_jwt = $true; entrypoint_path = 'index.ts'; import_map = $null
}
$alphaVersionChanged = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $changedAlpha
$alphaIdentityMissing = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $untrustedAlpha
$wrongProject = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef 'different-project-ref' -Function $alpha
Add-Content -LiteralPath $alphaShared -Value '// local tampering'
$alphaTampered = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $alpha
$betaAfterAlphaTamper = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $beta
$summary = @{
  missing = $null -eq $before
  alpha_saved = $null -ne $alphaRecord
  beta_saved = $null -ne $betaRecord
  cache_alpha = Test-Path -LiteralPath (Join-Path "$backup.incomplete" 'function-cache/alpha.json') -PathType Leaf
  cache_beta = Test-Path -LiteralPath (Join-Path "$backup.incomplete" 'function-cache/beta.json') -PathType Leaf
  stable_identity = (Get-BackupFunctionIdentity -Function $alpha) -eq (Get-BackupFunctionIdentity -Function $alphaReordered)
  stable_set = (Get-BackupFunctionSetHash -Functions @($alpha, $beta)) -eq (Get-BackupFunctionSetHash -Functions @($beta, $alphaReordered))
  alpha_reused = $null -ne $alphaReused
  beta_reused = $null -ne $betaReused
  alpha_changed = $null -eq $alphaVersionChanged
  untrusted_identity = $null -eq $alphaIdentityMissing
  wrong_project = $null -eq $wrongProject
  alpha_tampered = $null -eq $alphaTampered
  beta_unaffected = $null -ne $betaAfterAlphaTamper
  shared_isolated = (Get-Content -LiteralPath $betaShared -Raw) -match 'beta shared'
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  for (const [key, value] of Object.entries(result)) {
    assert.equal(value, true, key)
  }
})

test('函数下载仅对瞬时 EOF 重试，401 立即失败且保留先前函数缓存', () => {
  const result = runPowerShellFixture(String.raw`
$backup = Join-Path $env:BACKUP_TEST_ROOT 'function-retry'
$config = Join-Path $env:BACKUP_TEST_ROOT 'config.toml'
Set-Content -LiteralPath $config -Value '[project]' -Encoding UTF8
$projectRef = 'ckbftoopuyophiebamwy'
$script:mode = 'eof-twice'
$script:calls = @{}
$script:sleeps = New-Object System.Collections.Generic.List[int]
function Start-Sleep { param([int]$Seconds); $script:sleeps.Add($Seconds) }
function Invoke-SupabaseQuiet {
  param([string[]]$Arguments)
  $slug = [string]$Arguments[2]
  if (-not $script:calls.ContainsKey($slug)) { $script:calls[$slug] = 0 }
  $script:calls[$slug]++
  if ($script:mode -eq 'eof-always' -or ($script:mode -eq 'eof-twice' -and $script:calls[$slug] -lt 3)) {
    return [pscustomobject]@{ Succeeded = $false; Output = ''; Error = 'unexpected EOF' }
  }
  if ($script:mode -eq 'permanent') {
    return [pscustomobject]@{ Succeeded = $false; Output = ''; Error = '401 unauthorized' }
  }
  $file = Join-Path (Get-Location).Path "supabase/functions/$slug/index.ts"
  New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
  Set-Content -LiteralPath $file -Value "// $slug" -Encoding UTF8
  return [pscustomobject]@{ Succeeded = $true; Output = ''; Error = '' }
}
function New-FunctionDescriptor {
  param([string]$Slug, [char]$HashChar)
  return [pscustomobject]@{
    slug = $Slug; id = "$Slug-id"; version = 1; ezbr_sha256 = ([string]$HashChar * 64)
    verify_jwt = $true; entrypoint_path = $null; import_map = $false
  }
}
$alpha = New-FunctionDescriptor -Slug 'alpha' -HashChar 'a'
$beta = New-FunctionDescriptor -Slug 'beta' -HashChar 'b'
$gamma = New-FunctionDescriptor -Slug 'gamma' -HashChar 'c'
$alphaRecord = Invoke-BackupFunctionDownload -BackupPath $backup -ProjectRef $projectRef -Function $alpha -ConfigPath $config
$script:mode = 'permanent'
$betaRejected = $false
try { Invoke-BackupFunctionDownload -BackupPath $backup -ProjectRef $projectRef -Function $beta -ConfigPath $config | Out-Null }
catch { $betaRejected = $_.Exception.Message -like '*beta*' }
$script:mode = 'eof-always'
$gammaRejected = $false
try { Invoke-BackupFunctionDownload -BackupPath $backup -ProjectRef $projectRef -Function $gamma -ConfigPath $config | Out-Null }
catch { $gammaRejected = $_.Exception.Message -like '*gamma*' }
$alphaStillCached = $null -ne (Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $alpha)
$summary = @{
  alpha_calls = $script:calls.alpha
  beta_calls = $script:calls.beta
  gamma_calls = $script:calls.gamma
  sleeps = @($script:sleeps.ToArray())
  alpha_record = $null -ne $alphaRecord
  alpha_cached = $alphaStillCached
  beta_rejected = $betaRejected
  gamma_rejected = $gammaRejected
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.alpha_calls, 3)
  assert.equal(result.beta_calls, 1)
  assert.equal(result.gamma_calls, 3)
  assert.deepEqual(result.sleeps, [2, 4, 2, 4])
  assert.equal(result.alpha_record, true)
  assert.equal(result.alpha_cached, true)
  assert.equal(result.beta_rejected, true)
  assert.equal(result.gamma_rejected, true)
})

test('隔离函数包识别三种来源入口路径，并拒绝指向其他函数的入口', () => {
  const result = runPowerShellFixture(String.raw`
$backup = Join-Path $env:BACKUP_TEST_ROOT 'function-entrypoints'
$config = Join-Path $env:BACKUP_TEST_ROOT 'config.toml'
Set-Content -LiteralPath $config -Value '[project]' -Encoding UTF8
$projectRef = 'ckbftoopuyophiebamwy'
$cases = @(
  [pscustomobject]@{ slug = 'first'; entrypoint_path = '/source/index.ts'; hash = ('a' * 64) },
  [pscustomobject]@{ slug = 'second'; entrypoint_path = '/source/functions/second/index.ts'; hash = ('b' * 64) },
  [pscustomobject]@{ slug = 'third'; entrypoint_path = '/source/third/index.ts'; hash = ('c' * 64) }
)
$functions = @($cases | ForEach-Object {
  $source = Join-Path "$backup.incomplete" "$($_.slug)/supabase/functions"
  $file = Join-Path $source "$($_.slug)/index.ts"
  New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
  Set-Content -LiteralPath $file -Value "// $($_.slug)" -Encoding UTF8
  $descriptor = [pscustomobject]@{
    slug = $_.slug; id = "$($_.slug)-id"; version = 1; ezbr_sha256 = $_.hash
    verify_jwt = $true; entrypoint_path = $_.entrypoint_path; import_map = $false
  }
  Save-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $descriptor -SourcePath $source | Out-Null
  $descriptor
})
function Invoke-SupabaseQuiet { throw 'No network download should run for valid checkpoints.' }
$tree = New-BackupFunctionTree -BackupPath $backup -ProjectRef $projectRef -Functions $functions -ConfigPath $config
$layout = Get-Content -LiteralPath $tree.layout_path -Raw | ConvertFrom-Json
$validPaths = @($layout.functions | ForEach-Object {
  $_.entrypoint -eq "functions/$($_.slug)/_bundle/$($_.slug)/index.ts" -and
    (Test-Path -LiteralPath (Join-Path $tree.source_path "$($_.slug)/_bundle/$($_.slug)/index.ts") -PathType Leaf)
})
$wrong = [pscustomobject]@{
  slug = 'wrong'; id = 'wrong-id'; version = 1; ezbr_sha256 = ('d' * 64)
  verify_jwt = $true; entrypoint_path = '/source/another/index.ts'; import_map = $false
}
$wrongSource = Join-Path "$backup.incomplete" 'wrong/supabase/functions'
$wrongFile = Join-Path $wrongSource 'wrong/index.ts'
New-Item -ItemType Directory -Path (Split-Path -Parent $wrongFile) -Force | Out-Null
Set-Content -LiteralPath $wrongFile -Value '// wrong' -Encoding UTF8
Save-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $wrong -SourcePath $wrongSource | Out-Null
$rejectedWrongEntrypoint = $false
try { New-BackupFunctionTree -BackupPath $backup -ProjectRef $projectRef -Functions @($wrong) -ConfigPath $config | Out-Null }
catch { $rejectedWrongEntrypoint = $true }
$summary = @{ count = $validPaths.Count; valid = @($validPaths); rejected_wrong = $rejectedWrongEntrypoint }
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.count, 3)
  assert.deepEqual(result.valid, [true, true, true])
  assert.equal(result.rejected_wrong, true)
})

test('函数安装复制失败会保留暂存源码，可重试且拒绝备份目录外的源', () => {
  const result = runPowerShellFixture(String.raw`
$backup = Join-Path $env:BACKUP_TEST_ROOT 'function-move'
$stage = Join-Path "$backup.incomplete" 'functions-fixture/validated-functions'
$destination = Join-Path $backup 'functions'
$sourceFile = Join-Path $stage 'resume-test/index.ts'
New-Item -ItemType Directory -Path $backup, (Split-Path -Parent $sourceFile) -Force | Out-Null
Set-Content -LiteralPath $sourceFile -Value 'fixture' -Encoding UTF8
$script:attempts = 0
function global:Copy-Item {
  param([string]$LiteralPath, [string]$Destination, [switch]$Force)
  $script:attempts++
  if ($script:attempts -eq 1) { throw 'Simulated temporary file lock.' }
  Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force -ErrorAction Stop
}
$firstFailed = $false
try { Move-BackupFunctionDirectory -BackupPath $backup -Source $stage -Destination $destination }
catch { $firstFailed = $_.Exception.Message -like '*函数文件复制或校验失败*' }
$stagePreserved = Test-Path -LiteralPath $sourceFile -PathType Leaf
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
Move-BackupFunctionDirectory -BackupPath $backup -Source $stage -Destination $destination
$outside = Join-Path $env:BACKUP_TEST_ROOT 'outside-functions'
New-Item -ItemType Directory -Path $outside -Force | Out-Null
$rejected = $false
try { Move-BackupFunctionDirectory -BackupPath $backup -Source $outside -Destination (Join-Path "$backup.incomplete" 'outside') }
catch { $rejected = $true }
$summary = @{
  attempts = $script:attempts
  first_failed = $firstFailed
  stage_preserved = $stagePreserved
  installed = Test-Path -LiteralPath (Join-Path $destination 'resume-test/index.ts') -PathType Leaf
  rejected = $rejected
  outside_preserved = Test-Path -LiteralPath $outside -PathType Container
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.equal(result.attempts, 2)
  assert.equal(result.first_failed, true)
  assert.equal(result.stage_preserved, true)
  assert.equal(result.installed, true)
  assert.equal(result.rejected, true)
  assert.equal(result.outside_preserved, true)
})

test('真实备份入口可从阶段记录续跑到完整 manifest，所有外部命令均由临时沙箱拦截', () => {
  const result = runPowerShellFixture(String.raw`
$projectRef = 'ckbftoopuyophiebamwy'
$sandbox = Join-Path $env:BACKUP_TEST_ROOT 'entry-sandbox'
$supabaseRoot = Join-Path $sandbox 'supabase'
$temp = Join-Path $supabaseRoot '.temp'
$backup = Join-Path $supabaseRoot 'backups/resume-case'
New-Item -ItemType Directory -Path $temp, (Join-Path $backup 'database') -Force | Out-Null
Copy-Item -LiteralPath $env:BACKUP_ENTRY_SCRIPT -Destination (Join-Path $supabaseRoot 'backup-supabase.ps1')
Copy-Item -LiteralPath $env:BACKUP_PROGRESS_HELPER -Destination (Join-Path $supabaseRoot 'backup-progress.ps1')
Copy-Item -LiteralPath $env:BACKUP_FUNCTION_HELPER -Destination (Join-Path $supabaseRoot 'backup-functions.ps1')
Copy-Item -LiteralPath $env:BACKUP_TRANSFER_HELPER -Destination (Join-Path $supabaseRoot 'transfer-common.ps1')
Set-Content -LiteralPath (Join-Path $supabaseRoot 'config.toml') -Value '[project]' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $temp 'project-ref') -Value $projectRef -Encoding UTF8
Set-Content -LiteralPath (Join-Path $temp 'pooler-url') -Value 'postgresql://postgres.ckbftoopuyophiebamwy:placeholder@pooler.example.invalid:6543/postgres' -Encoding UTF8
$progress = New-BackupProgress -ProjectRef $projectRef
$seededRunId = '11111111-2222-4333-8444-555555555555'
$progress.seeded_from_run_id = $seededRunId
foreach ($name in @('roles.sql', 'schema.sql')) {
  $file = Join-Path $backup "database/$name"
  $footer = if ($name -eq 'roles.sql') { 'RESET ALL;' } else { '-- PostgreSQL database dump complete' }
  Set-Content -LiteralPath $file -Value @("-- $name", $footer) -Encoding UTF8
  $progress.files[$name] = @{
    sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    bytes = (Get-Item -LiteralPath $file).Length
    completed_at = (Get-Date).ToUniversalTime().ToString('o')
  }
}
Save-BackupProgress -BackupPath $backup -Progress $progress
Set-Content -LiteralPath (Join-Path $backup 'database/data.sql') -Value 'partial old data' -Encoding UTF8
$oldFunction = Join-Path $backup 'functions/resume-test/deleted.ts'
New-Item -ItemType Directory -Path (Split-Path -Parent $oldFunction) -Force | Out-Null
Set-Content -LiteralPath $oldFunction -Value '// old function must be replaced' -Encoding UTF8
$oldDescriptors = @(
  [pscustomobject]@{ slug = 'resume-test'; id = 'first-id'; version = 11; ezbr_sha256 = ('a' * 64); verify_jwt = $true; entrypoint_path = $null; import_map = $null },
  [pscustomobject]@{ slug = 'resume-second'; id = 'second-id'; version = 12; ezbr_sha256 = ('b' * 64); verify_jwt = $true; entrypoint_path = $null; import_map = $null }
)
$oldSetHash = Get-BackupFunctionSetHash -Functions $oldDescriptors
Save-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -SourcePath (Join-Path $backup 'functions') -MetadataHash $oldSetHash | Out-Null
$oldWholeCacheValid = $null -ne (Read-BackupFunctionProgress -BackupPath $backup -ProjectRef $projectRef -MetadataHash $oldSetHash)
$oldLayoutAbsent = -not (Test-Path -LiteralPath (Join-Path $backup 'metadata/function-layout.json'))
$global:stubCalls = New-Object System.Collections.Generic.List[string]
function global:supabase {
  $parts = @($args | ForEach-Object { [string]$_ })
  $command = $parts -join ' '
  if ($parts[0] -eq '--version') { $global:LASTEXITCODE = 0; '2.93.0'; return }
  if ($parts[0] -eq 'projects' -and $parts[1] -eq 'list') {
    $global:LASTEXITCODE = 0
    '[{"ref":"ckbftoopuyophiebamwy"}]'
    return
  }
  if ($parts[0] -eq 'db' -and $parts[1] -eq 'dump' -and $parts -contains '--dry-run') {
    $global:LASTEXITCODE = 0
    'export PGHOST="pooler.example.invalid"'
    'export PGPORT="6543"'
    'export PGUSER="postgres.ckbftoopuyophiebamwy"'
    'export PGDATABASE="postgres"'
    return
  }
  if ($parts[0] -eq 'db' -and $parts[1] -eq 'dump' -and $parts -contains '--file') {
    $index = [Array]::IndexOf($parts, '--file')
    $destination = $parts[$index + 1]
    $name = if ($parts -contains '--role-only') { 'roles.sql' }
      elseif ($parts -contains '--schema' -and $parts -contains 'auth,storage') { 'managed-schema-snapshot.sql' }
      elseif ($parts -contains '--schema' -and $parts -contains 'supabase_migrations' -and $parts -contains '--data-only') { 'migration-history-data.sql' }
      elseif ($parts -contains '--schema' -and $parts -contains 'supabase_migrations') { 'migration-history-schema.sql' }
      elseif ($parts -contains '--data-only') { 'data.sql' }
      else { 'schema.sql' }
    $global:stubCalls.Add($name)
    $footer = '-- PostgreSQL database dump complete'
    Set-Content -LiteralPath $destination -Value @("-- $name", $footer) -Encoding UTF8
    $global:LASTEXITCODE = 0
    return
  }
  if ($parts[0] -eq 'functions' -and $parts[1] -eq 'list') {
    $global:LASTEXITCODE = 0
    $global:metadataListCalls++
    $version = $global:secondVersion
    $hash = $global:secondHash
    if ($global:driftOnRecheck -and $global:metadataListCalls -gt 1) {
      $version++
      $hash = ('e' * 64)
    }
    $functions = @(
      [pscustomobject]@{ slug = 'resume-test'; id = 'first-id'; version = 11; ezbr_sha256 = ('a' * 64); verify_jwt = $true; entrypoint_path = $null; import_map = $null },
      [pscustomobject]@{ slug = 'resume-second'; id = 'second-id'; version = $version; ezbr_sha256 = $hash; verify_jwt = $true; entrypoint_path = $null; import_map = $null }
    )
    if ($global:reverseFunctionList) { [array]::Reverse($functions) }
    ConvertTo-Json -InputObject $functions -Compress -Depth 5
    return
  }
  if ($parts[0] -eq 'functions' -and $parts[1] -eq 'download' -and $parts[2] -in @('resume-test', 'resume-second')) {
    $slug = $parts[2]
    $global:stubCalls.Add("function:$slug")
    if ($slug -eq 'resume-second' -and $global:failSecondDownload) { throw 'Simulated persistent function download failure.' }
    $destination = Join-Path (Get-Location).Path "supabase/functions/$slug/index.ts"
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Set-Content -LiteralPath $destination -Value "Deno.serve(() => new Response('$slug'));" -Encoding UTF8
    $shared = Join-Path (Get-Location).Path 'supabase/functions/_shared/helpers.ts'
    New-Item -ItemType Directory -Path (Split-Path -Parent $shared) -Force | Out-Null
    Set-Content -LiteralPath $shared -Value '// shared fixture' -Encoding UTF8
    $global:LASTEXITCODE = 0
    return
  }
  if ($parts[0] -eq 'secrets' -and $parts[1] -eq 'list') { $global:LASTEXITCODE = 0; '[]'; return }
  if ($parts[0] -eq 'db' -and $parts[1] -eq 'query') { $global:LASTEXITCODE = 0; '[]'; return }
  $global:LASTEXITCODE = 1
  throw "Unexpected sandbox Supabase command: $command"
}
function global:docker {
  if ($args[0] -eq 'version') { $global:LASTEXITCODE = 0; '27.0'; return }
  if ($args[0] -eq 'ps') { $global:LASTEXITCODE = 0; return }
  $global:LASTEXITCODE = 1
  throw 'Unexpected sandbox Docker command.'
}
$password = ConvertTo-SecureString 'fixture-password-only' -AsPlainText -Force
$global:secondVersion = 12
$global:secondHash = ('b' * 64)
$global:failSecondDownload = $true
$global:reverseFunctionList = $false
$global:metadataListCalls = 0
$global:driftOnRecheck = $false
$firstFailedAtSecondFunction = $false
try { & (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password }
catch {
  $firstFailedAtSecondFunction = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count -gt 0 -and
    -not (Test-Path -LiteralPath (Join-Path $backup 'manifest.json'))
}
$firstFunction = [pscustomobject]@{
  slug = 'resume-test'; id = 'first-id'; version = 11; ezbr_sha256 = ('a' * 64)
  verify_jwt = $true; entrypoint_path = $null; import_map = $null
}
$firstCheckpoint = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $firstFunction
$firstCacheValid = $null -ne $firstCheckpoint -and $firstCheckpoint.source_path -like '*resume-test*'
$downloadedFirstBeforeResume = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
$global:failSecondDownload = $false
$global:reverseFunctionList = $true
& (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password
. (Join-Path $supabaseRoot 'transfer-common.ps1')
$manifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $backup -Manifest $manifest
$firstFunctionDownloads = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
$secondFunctionDownloads = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count
$firstSqlDumps = @($global:stubCalls | Where-Object { $_ -like '*.sql' }).Count
Remove-Item -LiteralPath (Join-Path $backup 'manifest.json') -Force
& (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password
$manifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $backup -Manifest $manifest
$firstAfterUnchangedResume = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
$secondAfterUnchangedResume = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count
Remove-Item -LiteralPath (Join-Path $backup 'manifest.json') -Force
$global:secondVersion = 13
$global:secondHash = ('c' * 64)
& (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password
$changedManifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $backup -Manifest $changedManifest
$firstAfterMetadataChange = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
$secondAfterMetadataChange = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count
Remove-Item -LiteralPath (Join-Path $backup 'manifest.json') -Force
$firstCheckpoint = Read-BackupFunctionCheckpoint -BackupPath $backup -ProjectRef $projectRef -Function $firstFunction
$firstCachedFile = Join-Path $firstCheckpoint.source_path 'resume-test/index.ts'
Add-Content -LiteralPath $firstCachedFile -Value '// local tampering'
Add-Content -LiteralPath (Join-Path $backup 'functions/resume-test/_bundle/resume-test/index.ts') -Value '// installed copy tampering'
& (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password
$manifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $backup -Manifest $manifest
$firstAfterTamper = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
$secondAfterTamper = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count
Remove-Item -LiteralPath (Join-Path $backup 'manifest.json') -Force
$global:secondVersion = 14
$global:secondHash = ('d' * 64)
$global:metadataListCalls = 0
$global:driftOnRecheck = $true
$remoteChangedDuringDownload = $false
try { & (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password }
catch { $remoteChangedDuringDownload = $_.Exception.Message -like '*版本*' -or $_.Exception.Message -like '*变化*' }
$noManifestAfterDrift = -not (Test-Path -LiteralPath (Join-Path $backup 'manifest.json'))
$firstAfterDrift = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
$secondAfterDrift = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count
$global:driftOnRecheck = $false
$global:secondVersion = 15
$global:secondHash = ('e' * 64)
$global:metadataListCalls = 0
& (Join-Path $supabaseRoot 'backup-supabase.ps1') -ProjectRef $projectRef -ResumeBackupPath $backup -DbPassword $password
$manifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
Assert-BackupManifest -Root $backup -Manifest $manifest
$savedProgress = Read-BackupProgress -BackupPath $backup -ProjectRef $projectRef
$allComplete = @((Get-BackupDumpDefinitions) | ForEach-Object {
  Test-BackupDumpComplete -Path (Join-Path $backup "database/$($_.Name)") -Name $_.Name
})
$preserved = @(Get-ChildItem -LiteralPath "$backup.incomplete" -Filter '*data.sql.partial')
$oldFunctionDirectories = @(Get-ChildItem -LiteralPath "$backup.incomplete" -Directory -Filter 'functions-old-*')
$downloadedFunction = Join-Path $backup 'functions/resume-test/_bundle/resume-test/index.ts'
$downloadedSecondFunction = Join-Path $backup 'functions/resume-second/_bundle/resume-second/index.ts'
$manifestPaths = @($manifest.files | ForEach-Object { [string]$_.path.Replace('\', '/') })
$summary = @{
  calls = @($global:stubCalls.ToArray())
  all_complete = $allComplete
  manifest_resumed = [bool]$manifest.consistency.resumed
  manifest_files = @($manifest.files).Count
  first_failed_at_second_function = $firstFailedAtSecondFunction
  old_whole_cache_valid = $oldWholeCacheValid
  old_layout_absent = $oldLayoutAbsent
  new_layout_exists = Test-Path -LiteralPath (Join-Path $backup 'metadata/function-layout.json') -PathType Leaf
  first_cache_valid = $firstCacheValid
  downloaded_first_before_resume = $downloadedFirstBeforeResume
  first_function_downloads = $firstFunctionDownloads
  second_function_downloads = $secondFunctionDownloads
  first_after_unchanged_resume = $firstAfterUnchangedResume
  second_after_unchanged_resume = $secondAfterUnchangedResume
  first_after_metadata_change = $firstAfterMetadataChange
  second_after_metadata_change = $secondAfterMetadataChange
  first_after_tamper = $firstAfterTamper
  second_after_tamper = $secondAfterTamper
  remote_changed_during_download = $remoteChangedDuringDownload
  no_manifest_after_drift = $noManifestAfterDrift
  first_after_drift = $firstAfterDrift
  second_after_drift = $secondAfterDrift
  first_after_drift_resume = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-test' }).Count
  second_after_drift_resume = @($global:stubCalls | Where-Object { $_ -eq 'function:resume-second' }).Count
  first_sql_dumps = $firstSqlDumps
  second_sql_dumps = @($global:stubCalls | Where-Object { $_ -like '*.sql' }).Count
  preserved = $preserved.Count
  project_ref = $manifest.project_ref
  seeded_run_id = $savedProgress.seeded_from_run_id
  downloaded_function = Test-Path -LiteralPath $downloadedFunction -PathType Leaf
  downloaded_second_function = Test-Path -LiteralPath $downloadedSecondFunction -PathType Leaf
  old_function_installed = Test-Path -LiteralPath $oldFunction -PathType Leaf
  old_function_preserved = @($oldFunctionDirectories | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'resume-test/deleted.ts') -PathType Leaf
  }).Count -ge 1
  manifest_has_new_function = $manifestPaths -contains 'functions/resume-test/_bundle/resume-test/index.ts'
  manifest_has_second_function = $manifestPaths -contains 'functions/resume-second/_bundle/resume-second/index.ts'
  manifest_has_old_function = $manifestPaths -contains 'functions/resume-test/deleted.ts'
}
Write-Output ('BACKUP_TEST_RESULT=' + ($summary | ConvertTo-Json -Compress -Depth 5))`)

  assert.deepEqual(
    (result.calls as string[]).filter((call) => call.endsWith('.sql')),
    [
      'data.sql',
      'migration-history-schema.sql',
      'migration-history-data.sql',
      'managed-schema-snapshot.sql'
    ]
  )
  assert.deepEqual(result.all_complete, [true, true, true, true, true, true])
  assert.equal(result.manifest_resumed, true)
  assert.equal(result.first_failed_at_second_function, true)
  assert.equal(result.old_whole_cache_valid, true)
  assert.equal(result.old_layout_absent, true)
  assert.equal(result.new_layout_exists, true)
  assert.equal(result.first_cache_valid, true)
  assert.equal(result.downloaded_first_before_resume, 1)
  assert.equal(result.first_function_downloads, 1)
  assert.ok((result.second_function_downloads as number) >= 2)
  assert.equal(result.first_after_unchanged_resume, 1)
  assert.equal(result.second_after_unchanged_resume, result.second_function_downloads)
  assert.equal(result.first_after_metadata_change, 1)
  assert.equal(
    result.second_after_metadata_change,
    (result.second_function_downloads as number) + 1
  )
  assert.equal(result.first_after_tamper, 2)
  assert.equal(result.second_after_tamper, result.second_after_metadata_change)
  assert.equal(result.remote_changed_during_download, true)
  assert.equal(result.no_manifest_after_drift, true)
  assert.equal(result.first_after_drift, result.first_after_tamper)
  assert.equal(result.second_after_drift, (result.second_after_tamper as number) + 1)
  assert.equal(result.first_after_drift_resume, result.first_after_tamper)
  assert.equal(result.second_after_drift_resume, (result.second_after_drift as number) + 1)
  assert.equal(result.first_sql_dumps, 4)
  assert.equal(result.second_sql_dumps, 4)
  assert.equal(result.project_ref, 'ckbftoopuyophiebamwy')
  assert.ok((result.manifest_files as number) >= 12)
  assert.equal(result.preserved, 1)
  assert.equal(result.seeded_run_id, '11111111-2222-4333-8444-555555555555')
  assert.equal(result.downloaded_function, true)
  assert.equal(result.downloaded_second_function, true)
  assert.equal(result.old_function_installed, false)
  assert.equal(result.old_function_preserved, true)
  assert.equal(result.manifest_has_new_function, true)
  assert.equal(result.manifest_has_second_function, true)
  assert.equal(result.manifest_has_old_function, false)
})
