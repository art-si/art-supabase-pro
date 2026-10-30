import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { SUPABASE_OPERATIONS } from '../../src/utils/supabase/operations-catalog'
import { OperationsRunner } from '../../scripts/supabase-operations-runtime'

test(
  '12 项操作通过真实 PowerShell 执行入口分发，参数和续跑开关正确且不访问云端',
  { skip: process.platform !== 'win32', timeout: 180_000 },
  async () => {
    const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(path.join(parent, 'dispatch-'))
    const scripts = path.join(root, 'supabase')
    mkdirSync(scripts)
    copyFileSync(
      path.resolve('supabase/operations-task.ps1'),
      path.join(scripts, 'operations-task.ps1')
    )
    writeFileSync(
      path.join(scripts, 'transfer-common.ps1'),
      '\ufeff' +
        [
          'function Enable-SystemProxyForSupabaseCli {}',
          'function Assert-SupabaseCliProjectAccess {}',
          "function global:supabase { Write-Output 'CLI sandbox'; $global:LASTEXITCODE = 0 }",
          "function global:docker { Write-Output 'Docker sandbox'; $global:LASTEXITCODE = 0 }"
        ].join('\n')
    )
    const declarations = new Map<string, Set<string>>()
    for (const operation of SUPABASE_OPERATIONS) {
      if (operation.id === 'diagnose') continue
      const fields = declarations.get(operation.script) || new Set<string>()
      for (const field of operation.fields) fields.add(field.key)
      if (['restoreLocal', 'resumeLocal', 'verify'].includes(operation.id)) {
        fields.add('VerifyBackupOnly')
        fields.add('Resume')
        fields.add('LocalRoot')
        fields.add('VerificationReportPath')
      }
      declarations.set(operation.script, fields)
    }
    for (const [script, keys] of declarations) {
      const parameters = [...keys].map((key) => {
        const type = [
          'DbPassword',
          'TargetDbPassword',
          'DistributionSecretKey',
          'Password'
        ].includes(key)
          ? 'Security.SecureString'
          : ['Resume', 'VerifyBackupOnly'].includes(key)
            ? 'switch'
            : 'object'
        return `[${type}]$${key}`
      })
      writeFileSync(
        path.join(scripts, script),
        '\ufeff' +
          [
            `param(${parameters.join(',')})`,
            `Write-Output 'DISPATCH:${script}'`,
            'Write-Output "VERIFY:$([bool]$VerifyBackupOnly) RESUME:$([bool]$Resume)"',
            'if ($VerifyBackupOnly) {',
            '  if (-not $VerificationReportPath) { throw "Missing fixed verification report path." }',
            '  $now = (Get-Date).ToUniversalTime().ToString("o")',
            '  $report = @{ formatVersion = 1; status = "passed"; backupPath = [IO.Path]::GetFullPath([string]$BackupPath); sourceProjectRef = $null; snapshotCreatedAt = $null; startedAt = $now; completedAt = $now; summary = @{ files = 1; verifiedFiles = 1; totalBytes = 4; issueCount = 0 }; checks = [object[]]@(@{ id = "manifest"; label = "清单"; status = "passed"; detail = "隔离测试通过" }); groups = [object[]]@(@{ id = "database"; label = "数据库"; files = 1; verifiedFiles = 1; bytes = 4 }); issues = [object[]]@(); limitations = [object[]]@("隔离测试，不读取真实备份") }',
            '  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $VerificationReportPath -Encoding utf8',
            '}'
          ].join('\n')
      )
    }
    const runner = new OperationsRunner(root)
    const samples: Record<string, string> = {
      DbPassword: 'dispatch-secret',
      TargetDbPassword: 'dispatch-secret',
      Password: 'dispatch-secret',
      DistributionSecretKey: 'dispatch-secret',
      TargetProjectRef: 'abcdefghijklmnopqrst',
      ConfirmTargetProjectRef: 'abcdefghijklmnopqrst',
      DistributionProjectRef: 'abcdefghijklmnopqrst',
      Email: 'sandbox@example.invalid',
      ExpectedSha256: 'a'.repeat(64),
      ExpiresInSeconds: '3600'
    }
    try {
      for (const operation of SUPABASE_OPERATIONS) {
        const parameters: Record<string, string | boolean> = {}
        for (const field of operation.fields) {
          if (field.kind === 'switch') parameters[field.key] = true
          else if (
            field.required ||
            (operation.id === 'download' && field.key === 'ArchivePath') ||
            field.key === 'ExpectedSha256'
          )
            parameters[field.key] = samples[field.key] || path.join(root, field.key)
        }
        const run = runner.start(operation, parameters, 'sandbox-actor')
        for (let poll = 0; runner.busy && poll < 300; poll++) await delay(150)
        assert.equal(
          run.status,
          'succeeded',
          `${operation.id}: ${run.logs.map((line) => line.message).join('\n')}`
        )
        if (operation.id !== 'diagnose')
          assert.ok(run.logs.some((line) => line.message === `DISPATCH:${operation.script}`))
        if (operation.id === 'verify')
          assert.ok(run.logs.some((line) => line.message.includes('VERIFY:True')))
        if (operation.id === 'verify') assert.equal(run.verificationReport?.status, 'passed')
        if (operation.id === 'resumeLocal')
          assert.ok(run.logs.some((line) => line.message.includes('RESUME:True')))
        assert.ok(!JSON.stringify(run).includes('dispatch-secret'))
      }
    } finally {
      if (runner.busy) {
        runner.cancel(runner.runs[0].id)
        for (let poll = 0; runner.busy && poll < 100; poll++) await delay(100)
      }
      assert.equal(path.dirname(path.resolve(root)), parent)
      assert.ok(path.basename(root).startsWith('dispatch-'))
      if (!runner.busy) rmSync(root, { recursive: true, force: true })
    }
  }
)
