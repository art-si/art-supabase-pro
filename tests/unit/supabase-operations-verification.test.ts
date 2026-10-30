import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { findSupabaseOperation, isOperationRun } from '../../src/utils/supabase/operations-catalog'
import { isBackupVerificationReport } from '../../src/utils/supabase/operations-verification'
import {
  OperationsRunner,
  readOperationVerificationReport
} from '../../scripts/supabase-operations-runtime'

const validReport = {
  formatVersion: 1,
  status: 'passed',
  backupPath: 'D:\\Backups\\Example',
  sourceProjectRef: null,
  snapshotCreatedAt: null,
  startedAt: '2026-10-30T01:00:00Z',
  completedAt: '2026-10-30T01:01:00Z',
  summary: { files: 2, verifiedFiles: 2, totalBytes: 42, issueCount: 0 },
  checks: [{ id: 'manifest', label: '清单', status: 'passed', detail: '通过' }],
  groups: [{ id: 'database', label: '数据库', files: 2, verifiedFiles: 2, bytes: 42 }],
  issues: [],
  limitations: ['需单独核对业务一致性']
}

test('校验报告只接受有限、内部一致的结构和匹配的备份路径', () => {
  assert.equal(isBackupVerificationReport(validReport), true)
  assert.equal(
    isBackupVerificationReport({
      ...validReport,
      summary: { files: 0, verifiedFiles: 0, totalBytes: 0, issueCount: 0 }
    }),
    false
  )
  assert.equal(isBackupVerificationReport({ ...validReport, checks: [] }), false)
  assert.equal(isBackupVerificationReport({ ...validReport, groups: [] }), false)
  assert.equal(
    isBackupVerificationReport({
      ...validReport,
      summary: { ...validReport.summary, issueCount: 1 }
    }),
    false
  )
  assert.equal(
    isBackupVerificationReport({
      ...validReport,
      checks: [{ ...validReport.checks[0], status: 'failed' }]
    }),
    false
  )
  assert.equal(
    isBackupVerificationReport({
      ...validReport,
      issues: Array(101).fill({ code: 'x', message: 'x' })
    }),
    false
  )
  const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(path.join(parent, 'verification-reader-'))
  try {
    const reportPath = path.join(root, 'fixed.verification.json')
    writeFileSync(reportPath, `\ufeff${JSON.stringify(validReport)}`)
    assert.equal(
      readOperationVerificationReport(reportPath, 'd:\\backups\\example')?.status,
      'passed'
    )
    assert.equal(readOperationVerificationReport(reportPath, 'D:\\Backups\\Other'), undefined)
    writeFileSync(reportPath, '{invalid')
    assert.equal(readOperationVerificationReport(reportPath, validReport.backupPath), undefined)
    writeFileSync(reportPath, 'x'.repeat(256 * 1024 + 1))
    assert.equal(readOperationVerificationReport(reportPath, validReport.backupPath), undefined)
  } finally {
    assert.ok(root.startsWith(`${parent}${path.sep}`))
    rmSync(root, { recursive: true, force: true })
  }
})

test(
  '校验任务读取固定 sidecar 并持久化；缺失、路径不符和失败报告不得成功',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  async () => {
    const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(path.join(parent, 'verification-run-'))
    const supabase = path.join(root, 'supabase')
    mkdirSync(supabase)
    writeFileSync(
      path.join(supabase, 'operations-task.ps1'),
      '\ufeff' +
        [
          'param([string]$Operation)',
          '$request = [Console]::In.ReadLine() | ConvertFrom-Json',
          'if ($request.BackupPath -like "*missing") { exit 0 }',
          '$failed = $request.BackupPath -like "*failed"',
          '$reportedPath = if ($request.BackupPath -like "*mismatch") { "D:\\Other\\Backup" } else { $request.BackupPath }',
          '$issues = [object[]]@(); if ($failed) { $issues = [object[]]@(@{ code = "missing_file"; message = "文件缺失" }) }',
          '$checks = [object[]]@(@{ id = "manifest"; label = "清单"; status = $(if ($failed) { "failed" } else { "passed" }); detail = $(if ($failed) { "文件缺失" } else { "通过" }) })',
          '$report = @{ formatVersion = 1; status = $(if ($failed) { "failed" } else { "passed" }); backupPath = $reportedPath; sourceProjectRef = $null; snapshotCreatedAt = $null; startedAt = (Get-Date).ToUniversalTime().ToString("o"); completedAt = (Get-Date).ToUniversalTime().ToString("o"); summary = @{ files = 1; verifiedFiles = $(if ($failed) { 0 } else { 1 }); totalBytes = 4; issueCount = $(if ($failed) { 1 } else { 0 }) }; checks = $checks; groups = @(@{ id = "database"; label = "数据库"; files = 1; verifiedFiles = $(if ($failed) { 0 } else { 1 }); bytes = 4 }); issues = $issues; limitations = @("隔离测试") }',
          '$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $env:SUPABASE_OPS_REPORT_PATH -Encoding utf8',
          'exit 0'
        ].join('\n')
    )
    const runner = new OperationsRunner(root)
    const verify = findSupabaseOperation('verify')!
    try {
      for (const [suffix, expected] of [
        ['valid', 'succeeded'],
        ['missing', 'failed'],
        ['mismatch', 'failed'],
        ['failed', 'failed']
      ] as const) {
        const run = runner.start(
          verify,
          { BackupPath: `D:\\Backups\\${suffix}` },
          'verified-test-user'
        )
        for (let count = 0; runner.busy && count < 200; count++) await delay(100)
        assert.equal(
          run.status,
          expected,
          `${suffix}: ${run.error}\n${run.logs.map((line) => line.message).join('\n')}`
        )
        assert.equal(Boolean(run.verificationReport), suffix === 'valid' || suffix === 'failed')
        const saved = JSON.parse(
          readFileSync(path.join(root, '.artifacts/supabase-operations', `${run.id}.json`), 'utf8')
        )
        assert.equal(isOperationRun(saved), true)
        assert.equal(Boolean(saved.verificationReport), Boolean(run.verificationReport))
        if (suffix === 'valid')
          assert.equal(new OperationsRunner(root).runs[0].verificationReport?.status, 'passed')
      }
    } finally {
      assert.equal(runner.busy, false)
      assert.ok(root.startsWith(`${parent}${path.sep}`))
      rmSync(root, { recursive: true, force: true })
    }
  }
)
