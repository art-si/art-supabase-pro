import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import {
  OperationsRunner,
  readOperationUpdateReport
} from '../../scripts/supabase-operations-runtime'
import { findSupabaseOperation } from '../../src/utils/supabase/operations-catalog'
import { getOperationBackupPath } from '../../src/utils/supabase/operations-log'
import type { BackupUpdateReport, OperationRun } from '../../src/types/supabase-operations'

const originalPath = 'D:\\Backups\\20261030-215709'
const latestPath = 'D:\\Backups\\20261101-192345'
const validReport: BackupUpdateReport = {
  formatVersion: 1,
  mode: 'apply',
  status: 'updated',
  backupPath: latestPath,
  sourceProjectRef: 'ckbftoopuyophiebamwy',
  planId: '11111111-1111-4111-8111-111111111111',
  baseManifestSha256: 'a'.repeat(64),
  resultManifestSha256: 'b'.repeat(64),
  startedAt: '2026-11-01T11:20:00Z',
  completedAt: '2026-11-01T11:23:45Z',
  summary: { added: 0, changed: 1, removed: 0, unchanged: 3 },
  items: [],
  warnings: []
}

test('更新报告只允许成功更新重命名到同父目录时间戳，预览、失败及其他路径不得冒充', () => {
  const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(path.join(parent, 'update-reader-'))
  const file = path.join(root, 'fixed.update.json')
  try {
    for (const [report, accepted] of [
      [validReport, true],
      [{ ...validReport, status: 'unchanged' }, true],
      [{ ...validReport, backupPath: latestPath + '-2' }, true],
      [{ ...validReport, backupPath: originalPath, status: 'failed' }, true],
      [{ ...validReport, backupPath: originalPath, mode: 'preview', status: 'planned' }, true],
      [{ ...validReport, status: 'failed' }, false],
      [{ ...validReport, mode: 'preview', status: 'unchanged' }, false],
      [{ ...validReport, backupPath: 'D:\\Other\\20261101-192345' }, false],
      [{ ...validReport, backupPath: latestPath + '\\20261101-192345' }, false],
      [{ ...validReport, backupPath: 'D:\\Backups\\arbitrary' }, false],
      [{ ...validReport, backupPath: latestPath + '.incomplete' }, false],
      [{ ...validReport, backupPath: latestPath + '.zip' }, false]
    ] as const) {
      writeFileSync(file, JSON.stringify(report))
      assert.equal(Boolean(readOperationUpdateReport(file, originalPath)), accepted)
    }
  } finally {
    assert.equal(path.dirname(path.resolve(root)), parent)
    rmSync(root, { recursive: true, force: true })
  }
})

test('备份路径优先采用更新报告中的最终目录，兼容旧任务仍保留原始参数', () => {
  const run: OperationRun = {
    id: '22222222-2222-4222-8222-222222222222',
    operationId: 'updateBackup',
    title: '更新已有备份',
    actorId: 'fixture-user',
    status: 'succeeded',
    startedAt: validReport.startedAt,
    lastOutputAt: validReport.completedAt,
    stage: '执行完成',
    parameters: { UpdateBackupPath: originalPath },
    logs: [],
    updateReport: validReport
  }
  assert.equal(getOperationBackupPath(run), latestPath)
  delete run.updateReport
  assert.equal(getOperationBackupPath(run), originalPath)
})

test(
  '执行端保存最终目录供参数复用和后续校验，移除旧路径产物并保留更新报告',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  async () => {
    const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(path.join(parent, 'update-run-'))
    const supabase = path.join(root, 'supabase')
    mkdirSync(supabase)
    writeFileSync(
      path.join(supabase, 'operations-task.ps1'),
      '\ufeff' +
        [
          'param([string]$Operation)',
          '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
          '$request = [Console]::In.ReadLine() | ConvertFrom-Json',
          'Write-Output "备份目录：$($request.UpdateBackupPath)"',
          `$report = '${JSON.stringify(validReport)}'`,
          '$report | Set-Content -LiteralPath $env:SUPABASE_OPS_UPDATE_REPORT_PATH -Encoding utf8',
          'exit 0'
        ].join('\n')
    )
    const runner = new OperationsRunner(root)
    try {
      const run = runner.start(
        findSupabaseOperation('updateBackup')!,
        { UpdateBackupPath: originalPath, DbPassword: 'fixture-only-password' },
        'fixture-user'
      )
      for (let count = 0; runner.busy && count < 200; count++) await delay(100)
      assert.equal(run.status, 'succeeded', run.error || '')
      assert.equal(run.parameters.UpdateBackupPath, latestPath)
      assert.equal(getOperationBackupPath(run), latestPath)
      assert.ok(!run.artifacts?.some((item) => item.value === originalPath))
      assert.ok(run.artifacts?.some((item) => item.label === '备份更新报告'))
      const saved: OperationRun = JSON.parse(
        readFileSync(path.join(root, '.artifacts/supabase-operations', `${run.id}.json`), 'utf8')
      )
      assert.equal(saved.parameters.UpdateBackupPath, latestPath)
      assert.equal(getOperationBackupPath(new OperationsRunner(root).runs[0]), latestPath)
    } finally {
      assert.equal(runner.busy, false)
      assert.equal(path.dirname(path.resolve(root)), parent)
      rmSync(root, { recursive: true, force: true })
    }
  }
)
