import { validateOperationInput } from '../../src/utils/supabase/operations-input'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { execFileSync } from 'node:child_process'
import {
  cancelDetachedExports,
  describeDetachedExports,
  describeDockerInspectionFailure
} from '../../scripts/supabase-operations-inspection'
import {
  SUPABASE_OPERATIONS,
  findSupabaseOperation,
  OPERATIONS_PROJECT_REF
} from '../../src/utils/supabase/operations-catalog'
import {
  authorizeOperationsIdentity,
  OperationsRunner,
  redactOperationOutput
} from '../../scripts/supabase-operations-runtime'
import {
  getOperationBackupPath,
  getOperationLogLevel,
  stripOperationLogAnsi
} from '../../src/utils/supabase/operations-log'
import type { OperationRun } from '../../src/types/supabase-operations'

test('仅识别本项目独立 Docker 导出，进程命令与密码不会返回页面', () => {
  const activity = describeDetachedExports([
    {
      Env: [`PGUSER=postgres.${OPERATIONS_PROJECT_REF}`, 'PGPASSWORD=never-display'],
      Cmd: ['pg_dump', '--data-only']
    }
  ])
  assert.equal(activity?.state, 'running')
  assert.match(activity?.stage || '', /数据/)
  assert.ok(!JSON.stringify(activity).includes('never-display'))
  assert.equal(
    describeDetachedExports([{ Env: ['PGUSER=postgres.abcdefghijklmnopqrst'], Cmd: ['pg_dump'] }]),
    undefined
  )
  assert.equal(
    describeDetachedExports([
      { Env: [`PGUSER=postgres.${OPERATIONS_PROJECT_REF}`], Cmd: ['postgres'] }
    ]),
    undefined
  )
})

test('Docker 探测失败分类可操作且不泄露原始异常', () => {
  const secret = 'PGPASSWORD=never-display'
  const missing = describeDockerInspectionFailure({ code: 'ENOENT', message: secret })
  assert.equal(missing?.state, 'unknown')
  assert.match(missing?.message || '', /找不到 Docker/)
  const timedOut = describeDockerInspectionFailure({ code: 'ETIMEDOUT', message: secret })
  assert.match(timedOut?.message || '', /超时/)
  assert.match(describeDockerInspectionFailure({ killed: true })?.message || '', /超时/)
  const unavailable = describeDockerInspectionFailure({ code: 1, stderr: secret })
  assert.match(unavailable?.message || '', /无法连接 Docker/)
  for (const result of [missing, timedOut, unavailable])
    assert.ok(!JSON.stringify(result).includes(secret))
})

test('取消仅停止二次确认的本项目 pg_dump，忽略其他项目和非导出容器', async () => {
  const ownId = 'a'.repeat(64)
  const foreignId = 'b'.repeat(64)
  const nonDumpId = 'c'.repeat(64)
  const stopped: string[] = []
  const configs = [
    {
      Id: ownId,
      State: { Running: true },
      Config: {
        Env: [`PGUSER=postgres.${OPERATIONS_PROJECT_REF}`],
        Cmd: ['pg_dump', '--data-only']
      }
    },
    {
      Id: foreignId,
      State: { Running: true },
      Config: { Env: ['PGUSER=postgres.abcdefghijklmnopqrst'], Cmd: ['pg_dump'] }
    },
    {
      Id: nonDumpId,
      State: { Running: true },
      Config: { Env: [`PGUSER=postgres.${OPERATIONS_PROJECT_REF}`], Cmd: ['postgres'] }
    }
  ]
  const run = async (args: string[]): Promise<string> => {
    if (args[0] === 'ps')
      return configs
        .filter((entry) => !stopped.includes(entry.Id))
        .map((entry) => `${entry.Id.slice(0, 12)} public.ecr.aws/supabase/postgres:17`)
        .join('\n')
    if (args[0] === 'inspect')
      return configs
        .filter((entry) => args.some((arg) => entry.Id.startsWith(arg)))
        .map((entry) => JSON.stringify(entry))
        .join('\n')
    assert.deepEqual(args.slice(0, 3), ['stop', '--timeout', '10'])
    stopped.push(args[3])
    return args[3]
  }
  assert.deepEqual(await cancelDetachedExports(run), { stopped: 1 })
  assert.deepEqual(stopped, [ownId])
})

test('取消前容器已消失时不调用 stop；停止失败时不泄露 Docker 异常', async () => {
  const ownId = 'd'.repeat(64)
  const record = JSON.stringify({
    Id: ownId,
    State: { Running: true },
    Config: { Env: [`PGUSER=postgres.${OPERATIONS_PROJECT_REF}`], Cmd: ['pg_dump'] }
  })
  let psCalls = 0
  const disappearing = async (args: string[]): Promise<string> => {
    if (args[0] === 'ps') return psCalls++ === 0 ? `${ownId.slice(0, 12)} supabase/postgres:17` : ''
    if (args[0] === 'inspect') return record
    assert.fail('容器已消失，不得停止')
  }
  assert.deepEqual(await cancelDetachedExports(disappearing), { stopped: 0 })

  const secret = 'PGPASSWORD=never-display'
  const failing = async (args: string[]): Promise<string> => {
    if (args[0] === 'ps') return `${ownId.slice(0, 12)} supabase/postgres:17`
    if (args[0] === 'inspect') return record
    throw new Error(secret)
  }
  await assert.rejects(cancelDetachedExports(failing), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /无法确认导出容器已停止/)
    assert.ok(!error.message.includes(secret))
    return true
  })
})

test(
  '全部运维目录参数与真实 PowerShell 脚本签名匹配',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  () => {
    const script = String.raw`
    $files = Get-ChildItem -LiteralPath './supabase' -Filter '*.ps1'
    $result = @{}
    foreach ($file in $files) {
      $tokens = $null; $parseErrors = $null
      $ast = [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
      if ($parseErrors.Count) { throw "Invalid PowerShell syntax: $($file.Name)" }
      $result[$file.Name] = @($ast.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath })
    }
    $result | ConvertTo-Json -Compress
  `
    const parsed: unknown = JSON.parse(
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 45_000,
        windowsHide: true
      })
    )
    assert.ok(parsed && typeof parsed === 'object')
    for (const operation of SUPABASE_OPERATIONS) {
      const actual: unknown = Reflect.get(parsed, operation.script)
      assert.ok(Array.isArray(actual), `${operation.id}: script missing`)
      for (const field of operation.fields)
        assert.ok(
          actual.includes(field.key),
          `${operation.id}: ${field.key} missing from ${operation.script}`
        )
    }
    assert.equal(SUPABASE_OPERATIONS.length, 12)
  }
)

test('CLI stderr 进度按内容显示，历史误标记录也可校正，真实错误保留', () => {
  const progress = [
    'Dumping roles from remote database...',
    'Dumped schema to D:\\backups\\database\\roles.sql.',
    'Dumping schemas from remote database...',
    'Exporting database roles, schema, and data...',
    'Downloading Function: ai-tms-driver-document-ocr',
    'Extracting file: supabase\\functions\\_shared\\error-handler.ts',
    'Downloaded Function ai-tms-driver-document-ocr from project ckbftoopuyophiebamwy.'
  ]
  for (const line of progress) assert.equal(getOperationLogLevel(line, 'error'), 'info')
  assert.equal(getOperationLogLevel('WARNING: temporary delay; retrying...', 'error'), 'info')
  assert.equal(
    getOperationLogLevel(
      'pg_dump: warning: there are circular foreign-key constraints on this table:',
      'error'
    ),
    'info'
  )
  assert.equal(
    getOperationLogLevel('pg_dump: detail: wms_production_material_line', 'error'),
    'info'
  )
  assert.equal(
    getOperationLogLevel(
      'pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.',
      'error'
    ),
    'info'
  )
  assert.equal(
    getOperationLogLevel('pg_dump: error: server closed the connection', 'info'),
    'error'
  )
  assert.equal(
    getOperationLogLevel('pg_dump: detail: connection unexpectedly closed', 'error'),
    'error'
  )
  assert.equal(getOperationLogLevel('SSL connection has been closed unexpectedly', 'info'), 'error')
  assert.equal(getOperationLogLevel('ERROR: permission denied', 'info'), 'error')
  assert.equal(getOperationLogLevel('FATAL: authentication failed', 'info'), 'error')
  assert.equal(getOperationLogLevel('Dumping schema failed: connection lost', 'error'), 'error')
  assert.equal(getOperationLogLevel('Failed to download Function ai-example', 'error'), 'error')
  assert.equal(getOperationLogLevel('ConvertTo-SecureString : module missing', 'error'), 'error')
  assert.equal(getOperationLogLevel('Unknown CLI output', 'error'), 'error')
  assert.equal(getOperationLogLevel('Unknown CLI output', 'info'), 'info')
  assert.equal(stripOperationLogAnsi('\u001b[31mERROR: failed\u001b[0m'), 'ERROR: failed')
  assert.equal(getOperationLogLevel('\u001b[32mDumping data...\u001b[0m', 'error'), 'info')
})

test('续跑目录优先取明确路径，忽略暂存导出目录', () => {
  const backupPath = 'D:\\backups\\20261029-155141'
  const stagingPath = 'D:\\backups\\20261029-155141.incomplete'
  const run: OperationRun = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    operationId: 'backup',
    title: '创建完整备份',
    actorId: 'test-actor',
    status: 'failed',
    startedAt: '2026-10-29T07:51:35.000Z',
    lastOutputAt: '2026-10-29T08:35:51.000Z',
    stage: '导出数据库数据',
    parameters: {},
    artifacts: [{ label: '本机产物路径', kind: 'path', value: backupPath }],
    logs: [
      {
        sequence: 1,
        time: '2026-10-29T08:35:51.000Z',
        level: 'info',
        message: `Dumped schema to ${stagingPath}\\database\\schema.sql.`
      }
    ]
  }
  assert.equal(getOperationBackupPath(run), backupPath)
  run.logs.push({
    sequence: 2,
    time: '2026-10-29T08:35:52.000Z',
    level: 'info',
    message: '备份目录：D:\\backups\\explicit'
  })
  assert.equal(getOperationBackupPath(run), 'D:\\backups\\explicit')
  run.parameters.ResumeBackupPath = 'D:\\backups\\selected'
  assert.equal(getOperationBackupPath(run), 'D:\\backups\\selected')
  delete run.parameters.ResumeBackupPath
  run.logs.pop()
  run.artifacts = []
  assert.equal(getOperationBackupPath(run), undefined)
  run.logs[0].message = `Dumped schema to ${backupPath}\\database\\schema.sql.`
  assert.equal(getOperationBackupPath(run), backupPath)
})

test('运维入口白名单不接受脚本路径或额外参数', () => {
  assert.equal(findSupabaseOperation('../restore-supabase.ps1'), undefined)
  assert.equal(
    new Set(SUPABASE_OPERATIONS.map((item) => item.permission)).size,
    SUPABASE_OPERATIONS.length
  )
  const operation = findSupabaseOperation('diagnose')!
  assert.throws(() => validateOperationInput(operation, { Script: 'malicious.ps1' }), /不支持/)
  assert.deepEqual(validateOperationInput(operation, {}), {})
})
test('云恢复拒绝来源项目、目标不一致和缺少密码', () => {
  const operation = findSupabaseOperation('restoreRemote')!
  const parameters = {
    BackupPath: 'D:\\backup',
    TargetProjectRef: 'abcdefghijklmnopqrst',
    ConfirmTargetProjectRef: 'abcdefghijklmnopqrst',
    TargetDbPassword: 'private-password'
  }
  assert.deepEqual(validateOperationInput(operation, parameters), parameters)
  assert.throws(
    () =>
      validateOperationInput(operation, {
        ...parameters,
        TargetProjectRef: OPERATIONS_PROJECT_REF,
        ConfirmTargetProjectRef: OPERATIONS_PROJECT_REF
      }),
    /另一个独立/
  )
  assert.throws(
    () =>
      validateOperationInput(operation, {
        ...parameters,
        ConfirmTargetProjectRef: 'xxxxxxxxxxxxxxxxxxxx'
      }),
    /不一致/
  )
  assert.throws(
    () => validateOperationInput(operation, { ...parameters, TargetDbPassword: '' }),
    /请填写/
  )
})
test('参数支持字面路径，拒绝换行和非法 SHA/链接', () => {
  const operation = findSupabaseOperation('download')!
  const parameters = {
    SignedUrl: 'https://example.invalid/download?token=test',
    ExpectedSha256: 'a'.repeat(64),
    Destination: 'D:\\backup with spaces'
  }
  assert.deepEqual(validateOperationInput(operation, parameters), parameters)
  assert.throws(
    () =>
      validateOperationInput(operation, { ...parameters, Destination: 'D:\\backup\nRemove-Item' }),
    /格式无效/
  )
  assert.throws(
    () => validateOperationInput(operation, { ...parameters, SignedUrl: 'file:///C:/data' }),
    /HTTPS/
  )
  assert.throws(
    () => validateOperationInput(operation, { ...parameters, ExpectedSha256: 'not-a-checksum' }),
    /SHA-256/
  )
})
test('密码、管理令牌、JWT、数据库连接和签名链接不会进入诊断日志', () => {
  const raw =
    'private-password sbp_test123 sb_secret_testabc eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature postgres://admin:password@db.invalid/postgres https://example.invalid/path?token=private'
  const redacted = redactOperationOutput(raw, ['private-password'])
  for (const secret of [
    'private-password',
    'sbp_test123',
    'sb_secret_testabc',
    'eyJhbGci',
    'admin:password',
    'token=private'
  ])
    assert.ok(!redacted.includes(secret))
  assert.ok(redacted.includes('已隐藏'))
})

test('执行端独立验证平台身份、操作权限和真实用户，拒绝普通用户或缺失身份', async () => {
  let requests = 0
  await assert.rejects(
    authorizeOperationsIdentity(async () => {
      requests++
      return false
    }, 'SupabaseOperations:Backup'),
    /平台超级管理员/
  )
  assert.equal(requests, 1)
  await assert.rejects(
    authorizeOperationsIdentity(
      async (route) => (route.includes('current_is_super') ? true : false),
      'SupabaseOperations:Backup'
    ),
    /操作权限/
  )
  await assert.rejects(
    authorizeOperationsIdentity(
      async (route) => (route.startsWith('/rest/') ? true : {}),
      'SupabaseOperations:Backup'
    ),
    /身份无效/
  )
  const permissions: string[] = []
  const actor = await authorizeOperationsIdentity(async (route, body) => {
    if (route.endsWith('current_has_permission')) permissions.push(JSON.stringify(body))
    return route.startsWith('/rest/') ? true : { id: 'verified-actor' }
  }, 'SupabaseOperations:Backup')
  assert.equal(actor, 'verified-actor')
  assert.deepEqual(permissions, ['{"p_permission":"SupabaseOperations:Backup"}'])
})

test('下载三种来源互斥，支持本机 ZIP 和分片清单，空可选字段不传给脚本', () => {
  const operation = findSupabaseOperation('download')!
  assert.deepEqual(
    validateOperationInput(operation, {
      SignedUrl: '',
      ArchivePath: '',
      PartsManifestPath: 'D:\\parts.json',
      ExpectedSha256: '',
      Destination: 'D:\\new'
    }),
    { PartsManifestPath: 'D:\\parts.json', Destination: 'D:\\new' }
  )
  assert.throws(
    () =>
      validateOperationInput(operation, { ArchivePath: 'D:\\bundle.zip', Destination: 'D:\\new' }),
    /SHA-256/
  )
  assert.throws(
    () =>
      validateOperationInput(operation, {
        ArchivePath: 'D:\\bundle.zip',
        PartsManifestPath: 'D:\\parts.json',
        Destination: 'D:\\new'
      }),
    /只能填写一项/
  )
})

test(
  '本机进程状态、排他、脱敏记录和重启恢复使用真实子进程验证',
  { skip: process.platform !== 'win32', timeout: 180_000 },
  async () => {
    const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(path.join(parent, 'run-'))
    mkdirSync(path.join(root, 'supabase'))
    writeFileSync(
      path.join(root, 'supabase/operations-task.ps1'),
      '\ufeff' +
        [
          'param([string]$Operation)',
          '[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)',
          '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
          '$parameters = [Console]::In.ReadLine() | ConvertFrom-Json',
          'Write-Output "阶段：安全测试任务"',
          'Write-Output $parameters.DbPassword',
          'Start-Sleep -Milliseconds 200',
          'exit 0'
        ].join('\n')
    )
    const runner = new OperationsRunner(root)
    const run = runner.start(
      findSupabaseOperation('backup')!,
      { DbPassword: 'never-persist-this-password' },
      'verified-test-user'
    )
    try {
      assert.throws(() => runner.start(findSupabaseOperation('diagnose')!, {}, 'test'), /已有任务/)
      for (let count = 0; runner.busy && count < 240; count++) await delay(250)
      assert.equal(run.status, 'succeeded')
      assert.equal(runner.busy, false)
      const record = path.join(root, '.artifacts/supabase-operations', `${run.id}.json`)
      const saved = readFileSync(record, 'utf8')
      assert.ok(!saved.includes('never-persist-this-password'))
      assert.ok(run.logs.some((line) => line.message.includes('已隐藏')))
      writeFileSync(record, JSON.stringify({ ...run, status: 'running' }))
      const recovered = new OperationsRunner(root)
      assert.equal(recovered.runs[0].status, 'interrupted')
      assert.equal(recovered.busy, false)
      assert.throws(() => recovered.cancel(run.id), /任务已结束/)
      const cancelled = runner.start(
        findSupabaseOperation('backup')!,
        { DbPassword: 'test-only' },
        'verified-test-user'
      )
      runner.cancel(cancelled.id)
      for (let count = 0; runner.busy && count < 300; count++) await delay(100)
      assert.equal(cancelled.status, 'interrupted')
      assert.match(cancelled.error || '', /目标侧任务可能仍在运行/)
    } finally {
      if (runner.busy) {
        runner.cancel(runner.runs[0].id)
        for (let count = 0; runner.busy && count < 300; count++) await delay(100)
      }
      assert.equal(path.dirname(path.resolve(root)), parent)
      assert.ok(path.basename(root).startsWith('run-'))
      if (!runner.busy) rmSync(root, { recursive: true, force: true })
    }
  }
)

test(
  'Windows PowerShell 从 Node 启动时转换真实 SecureString 并传给备份脚本',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  async () => {
    const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(path.join(parent, 'secure-string-'))
    const scriptsRoot = path.join(root, 'supabase')
    mkdirSync(scriptsRoot)
    copyFileSync(
      path.resolve('supabase/operations-task.ps1'),
      path.join(scriptsRoot, 'operations-task.ps1')
    )
    writeFileSync(
      path.join(scriptsRoot, 'transfer-common.ps1'),
      '\ufefffunction Enable-SystemProxyForSupabaseCli {}\n'
    )
    writeFileSync(
      path.join(scriptsRoot, 'backup-supabase.ps1'),
      '\ufeff' +
        [
          '[CmdletBinding()] param([Parameter(Mandatory)][Security.SecureString]$DbPassword)',
          '$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DbPassword)',
          'try {',
          "  if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -ne 'test-password-only') { throw 'SecureString value mismatch.' }",
          '} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }',
          "Write-Output 'SecureString parameter verified.'"
        ].join('\n')
    )
    const runner = new OperationsRunner(root)
    try {
      const run = runner.start(
        findSupabaseOperation('backup')!,
        { DbPassword: 'test-password-only' },
        'verified-test-user'
      )
      for (let count = 0; runner.busy && count < 240; count++) await delay(200)
      assert.equal(run.status, 'succeeded', run.logs.map((line) => line.message).join('\n'))
      assert.ok(run.logs.some((line) => line.message === 'SecureString parameter verified.'))
      const record = readFileSync(
        path.join(root, '.artifacts/supabase-operations', `${run.id}.json`),
        'utf8'
      )
      assert.ok(!record.includes('test-password-only'))
    } finally {
      if (runner.busy) {
        runner.cancel(runner.runs[0].id)
        for (let count = 0; runner.busy && count < 300; count++) await delay(100)
      }
      assert.equal(path.dirname(path.resolve(root)), parent)
      if (!runner.busy) rmSync(root, { recursive: true, force: true })
    }
  }
)
