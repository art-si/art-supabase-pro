import { expect, test } from '@playwright/test'
import type { BackupUpdateReport, OperationRun } from '../../src/types/supabase-operations'
import { prepareIsolatedSession } from './support/isolated-session'

const originalPath = 'D:\\fixture\\supabase-backups\\20261030-215709'
const latestPath = 'D:\\fixture\\supabase-backups\\20261101-192345'
const report: BackupUpdateReport = {
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
  items: [{ kind: 'table', key: 'public.fixture', label: '测试业务表', status: 'changed' }],
  warnings: ['旧 ZIP 仍是之前的分发快照；需要分享最新版时，请重新制作分发包。']
}

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => socket.close())
})

for (const [theme, width] of [
  ['light', 1440],
  ['dark', 1280]
] as const) {
  test(`更新成功展示最新目录，复用、校验和打包采用新路径 · ${theme} · ${width}`, async ({
    page
  }, testInfo) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    let posts = 0
    let run: OperationRun = {
      id: '22222222-2222-4222-8222-222222222222',
      operationId: 'updateBackup',
      title: '更新已有备份',
      actorId: 'fixture-user',
      status: 'running',
      startedAt: report.startedAt,
      lastOutputAt: report.startedAt,
      stage: '校验暂存快照',
      parameters: { UpdateBackupPath: originalPath },
      logs: []
    }
    await page.route('http://127.0.0.1:4318/**', async (route) => {
      if (route.request().method() === 'POST') posts++
      await route.fulfill({
        json: {
          projectRef: report.sourceProjectRef,
          runs: [run],
          busy: run.status === 'running'
        },
        headers: { 'access-control-allow-origin': '*' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/supabase-operations.html?theme=${theme}`)
    await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
    const navigation = page.getByRole('navigation', { name: 'Supabase 运维操作' })
    await navigation.getByRole('button', { name: /更新已有备份/ }).click()
    const panel = page.getByTestId('operations-update-report')
    await expect(panel).toContainText('正在比较或更新备份')
    await expect(panel).not.toContainText('已有备份更新完成')
    await expect(page.getByRole('textbox', { name: '要更新的完整备份目录' })).toHaveValue(
      originalPath
    )
    run = { ...run, status: 'succeeded', updateReport: report, endedAt: report.completedAt }
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await expect(panel).toContainText('已有备份更新完成')
    await expect(panel).toContainText('备份目录名已改为最新时间')
    await expect(page.getByRole('textbox', { name: '要更新的完整备份目录' })).toHaveValue(
      latestPath
    )
    await expect(page.locator('code').filter({ hasText: latestPath })).toBeVisible()
    await expect(panel).toContainText('旧 ZIP 仍是之前的分发快照')
    await page.getByRole('button', { name: '复用参数', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '要更新的完整备份目录' })).toHaveValue(
      latestPath
    )
    await expect(page.getByLabel('来源数据库密码')).toHaveValue('')
    await navigation.getByRole('button', { name: /校验备份完整性/ }).click()
    await expect(page.getByRole('textbox', { name: /^\*?\s*备份目录/ })).toHaveValue(latestPath)
    await navigation.getByRole('button', { name: /制作分发包/ }).click()
    await expect(page.getByRole('textbox', { name: /^\*?\s*备份目录/ })).toHaveValue(latestPath)
    await navigation.getByRole('button', { name: /更新已有备份/ }).click()
    await expect(panel.getByRole('cell', { name: '测试业务表', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`backup-updated-${theme}-${width}.png`) })
    expect(posts).toBe(0)

    run = {
      ...run,
      status: 'failed',
      parameters: { UpdateBackupPath: originalPath },
      updateReport: {
        ...report,
        status: 'failed',
        backupPath: originalPath,
        error: '来源数据库连接暂时中断，请检查网络后重新检查。'
      }
    }
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await expect(panel).toContainText('本次更新未完成')
    await panel.getByRole('button', { name: '重新检查并恢复更新' }).click()
    await expect(page.getByRole('textbox', { name: '要更新的完整备份目录' })).toHaveValue(
      originalPath
    )
    expect(posts).toBe(0)
  })
}
