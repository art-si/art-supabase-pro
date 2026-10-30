import { expect, test, type Page } from '@playwright/test'
import type { BackupVerificationReport, OperationRun } from '../../src/types/supabase-operations'
import { prepareIsolatedSession } from './support/isolated-session'

const projectRef = 'ckbftoopuyophiebamwy'
const backupPath = 'D:\\fixture\\supabase-backups\\complete'
const at = '2026-10-30T02:00:00.000Z'

function report(status: 'passed' | 'failed'): BackupVerificationReport {
  const passed = status === 'passed'
  return {
    formatVersion: 1,
    status,
    backupPath,
    sourceProjectRef: projectRef,
    snapshotCreatedAt: '2026-10-29T13:00:00.000Z',
    startedAt: at,
    completedAt: '2026-10-30T02:00:08.000Z',
    summary: {
      files: 643,
      verifiedFiles: passed ? 643 : 641,
      totalBytes: 462_422_016,
      issueCount: passed ? 0 : 2
    },
    checks: [
      { id: 'manifest', label: '完成清单', status: 'passed', detail: 'manifest.json 已核对' },
      {
        id: 'hashes',
        label: '文件哈希',
        status: passed ? 'passed' : 'failed',
        detail: passed ? '643 个文件的 SHA-256 一致' : '发现缺失和哈希不匹配文件'
      },
      { id: 'storage', label: 'Storage 对象', status: 'passed', detail: '对象数量一致' },
      { id: 'restore', label: '恢复演练', status: 'skipped', detail: '未执行恢复演练' }
    ],
    groups: [
      { id: 'database', label: '数据库', files: 6, verifiedFiles: 6, bytes: 300_000_000 },
      {
        id: 'functions',
        label: '函数源码',
        files: 428,
        verifiedFiles: passed ? 428 : 427,
        bytes: 30_000_000
      },
      {
        id: 'storage',
        label: 'Storage',
        files: 180,
        verifiedFiles: passed ? 180 : 179,
        bytes: 130_000_000
      },
      { id: 'metadata', label: '元数据', files: 29, verifiedFiles: 29, bytes: 2_422_016 }
    ],
    issues: passed
      ? []
      : [
          { code: 'missing', path: 'storage/contracts/2026-10.pdf', message: '文件缺失' },
          { code: 'sha256', path: 'functions/invoice/index.ts', message: 'SHA-256 不匹配' }
        ],
    limitations: ['未执行恢复演练', '未与当前远端项目的数据比较']
  }
}

function run(
  status: OperationRun['status'],
  verificationReport?: BackupVerificationReport,
  id = '11111111-1111-4111-8111-111111111111'
): OperationRun {
  return {
    id,
    operationId: 'verify',
    title: '校验备份完整性',
    actorId: 'fixture-user',
    status,
    startedAt: at,
    endedAt: status === 'running' ? undefined : '2026-10-30T02:00:08.000Z',
    lastOutputAt: at,
    stage: status === 'running' ? '正在核对文件哈希' : '校验文件与清单',
    parameters: { BackupPath: backupPath },
    logs: [],
    verificationReport
  }
}

async function openWithRuns(page: Page, runs: OperationRun[], theme = 'light') {
  await prepareIsolatedSession(page)
  let posts = 0
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    if (route.request().method() === 'POST') posts++
    await route.fulfill({
      json: { projectRef, runs, busy: runs.some((item) => item.status === 'running') },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto(`/tests/e2e/fixtures/supabase-operations.html?theme=${theme}`)
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  await expect(page.getByText('执行端已连接', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Supabase 运维操作' })
    .getByRole('button', { name: /校验备份完整性/ })
    .click()
  return () => posts
}

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => socket.close())
})

for (const theme of ['light', 'dark'] as const) {
  test(`校验通过报告完整展示并可下载 · ${theme} · 1440`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    const posts = await openWithRuns(page, [run('succeeded', report('passed'))], theme)
    const panel = page.getByTestId('operations-verification-report')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('文件完整性校验通过')
    await expect(panel).toContainText('643/643')
    await expect(panel).toContainText(/441\s*MB/)
    for (const label of ['数据库', '函数源码', 'Storage', '元数据', '文件哈希']) {
      await expect(panel.getByText(label, { exact: true }).first()).toBeVisible()
    }
    await expect(panel).toContainText('未执行恢复演练')
    await expect(panel).toContainText('未与当前远端项目的数据比较')
    await expect(page.getByTestId('operations-task').locator(':scope > .el-scrollbar')).toHaveCount(
      1
    )
    const downloadPromise = page.waitForEvent('download')
    await panel.getByRole('button', { name: '下载校验报告' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.json$/)
    expect(posts()).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`verification-passed-${theme}-1440.png`) })
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('operations-connection')).not.toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('operations-connection')).toBeVisible()
    await page.reload()
    await expect(panel).toContainText('文件完整性校验通过')
    expect(posts()).toBe(0)
  })
}

test('校验失败明确显示问题路径，历史无明细只准备重试不执行', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const failed = run('failed', report('failed'))
  const legacy = run('succeeded', undefined, '22222222-2222-4222-8222-222222222222')
  const posts = await openWithRuns(page, [failed, legacy])
  const panel = page.getByTestId('operations-verification-report')
  await expect(panel).toContainText('文件完整性校验未通过')
  await panel.getByRole('button', { name: /问题明细/ }).click()
  await expect(panel).toContainText('storage/contracts/2026-10.pdf')
  await expect(panel).toContainText('functions/invoice/index.ts')
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('verification-failed-1440.png') })
  await page.getByTestId('operations-task').locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: /校验备份完整性.*已完成/ }).click()
  await expect(panel).toContainText('此历史任务未保存校验明细')
  await page.screenshot({ path: testInfo.outputPath('verification-legacy-1440.png') })
  await panel.getByRole('button', { name: /重新校验|准备重试|再次校验/ }).click()
  await expect(page.getByRole('button', { name: '执行校验备份完整性' })).toBeVisible()
  expect(posts()).toBe(0)
})

test('校验中不显示通过结论，窄屏报告无水平溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posts = await openWithRuns(page, [run('running')])
  const panel = page.getByTestId('operations-verification-report')
  await expect(panel).toContainText(/校验中|正在校验/)
  await expect(panel).not.toContainText('文件完整性校验通过')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  expect(overflow).toBe(false)
  expect(posts()).toBe(0)
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('verification-running-mobile-390.png') })
})

test('1280 宽度校验报告无水平溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openWithRuns(page, [run('succeeded', report('passed'))])
  await expect(page.getByTestId('operations-verification-report')).toContainText('643/643')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  expect(overflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('verification-passed-1280.png') })
})
