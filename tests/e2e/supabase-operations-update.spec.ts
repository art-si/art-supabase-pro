import { expect, test, type Page } from '@playwright/test'
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

test.describe('补充增量更新回归', () => {
  const backupPath = 'D:\\fixture\\supabase-backups\\complete'

  const at = '2026-10-30T02:00:00.000Z'

  function report(status: BackupUpdateReport['status'] = 'planned'): BackupUpdateReport {
    return {
      formatVersion: 1,
      mode: status === 'planned' ? 'preview' : 'apply',
      status,
      backupPath,
      sourceProjectRef: 'ckbftoopuyophiebamwy',
      planId: '11111111-1111-4111-8111-111111111111',
      baseManifestSha256: 'a'.repeat(64),
      startedAt: at,
      completedAt: at,
      summary: { added: 1, changed: 1, removed: 0, unchanged: 1 },
      items: [
        {
          kind: 'schema',
          key: 'schema.sql',
          label: '数据库结构、函数和 RLS 策略',
          status: 'changed'
        },
        {
          kind: 'table',
          key: 'new',
          label: 'public.new_orders',
          status: 'added',
          detail: '仅导出本表数据。'
        },
        {
          kind: 'table',
          key: 'old',
          label: 'public.retained',
          status: 'unchanged',
          detail: '指纹一致，不下载。'
        }
      ],
      warnings: ['变化的表按整表导出；未变化的表和附件跳过。'],
      ...(status === 'failed' ? { error: '变化附件下载失败，原备份保持不变。' } : {})
    }
  }

  async function open(
    page: Page,
    value?: BackupUpdateReport,
    theme = 'light',
    running = false,
    submittedPlan?: string
  ) {
    await prepareIsolatedSession(page)
    const run: OperationRun = {
      id: '22222222-2222-4222-8222-222222222222',
      operationId: value?.mode === 'apply' ? 'updateBackup' : 'previewBackupUpdate',
      title: value?.mode === 'apply' ? '更新已有备份' : '检查远端变化',
      actorId: 'fixture-user',
      status: running ? 'running' : value?.status === 'failed' ? 'failed' : 'succeeded',
      startedAt: at,
      lastOutputAt: at,
      endedAt: running ? undefined : at,
      stage: '比较结构和表数据',
      parameters: {
        UpdateBackupPath: backupPath,
        ...(submittedPlan ? { PlanId: submittedPlan } : {})
      },
      logs: [],
      updateReport: value
    }
    let posts = 0
    await page.route('http://127.0.0.1:4318/**', async (route) => {
      if (route.request().method() === 'POST') posts++
      await route.fulfill({
        json: { projectRef: 'ckbftoopuyophiebamwy', runs: [run], busy: running },
        headers: { 'access-control-allow-origin': '*' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/supabase-operations.html?theme=${theme}`)
    await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
    await expect(page.getByText('执行端已连接', { exact: true })).toBeVisible()
    return () => posts
  }

  test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000 })

  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) =>
      socket.close()
    )
  })

  for (const theme of ['light', 'dark']) {
    test(`更新计划可筛选并准备执行，不自动提交 · ${theme}`, async ({ page }, info) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: 1440, height: 900 })
      const posts = await open(page, report(), theme)
      const panel = page.getByTestId('operations-update-report')
      await expect(panel).toContainText('更新计划已生成，原备份未改动')
      await expect(panel.getByText('public.new_orders', { exact: true })).toBeVisible()
      await expect(panel.getByText('public.retained', { exact: true })).toHaveCount(0)
      await panel.locator('.el-select__wrapper').first().click()
      await page.getByRole('option', { name: '只看跳过', exact: true }).click()
      await expect(panel.getByText('public.retained', { exact: true })).toBeVisible()
      await panel.locator('.el-select__wrapper').first().click()
      await page.getByRole('option', { name: '只看变化', exact: true }).click()
      await expect
        .poll(async () =>
          panel
            .locator('.el-table__body-wrapper')
            .evaluate((node) => node.getBoundingClientRect().height)
        )
        .toBeGreaterThan(70)
      await page.screenshot({ path: info.outputPath(`update-plan-${theme}.png`) })
      await panel.getByRole('button', { name: '使用此计划准备更新' }).click()
      await expect(
        page.getByRole('button', { name: '执行更新已有备份', exact: true })
      ).toBeVisible()
      await expect(page.getByRole('textbox', { name: '要更新的完整备份目录' })).toHaveValue(
        backupPath
      )
      await expect(page.getByRole('textbox', { name: /更新计划编号/ })).toHaveValue(report().planId)
      await expect(page.getByLabel('来源数据库密码')).toHaveValue('')
      expect(posts()).toBe(0)
      await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
      await expect(page.getByTestId('operations-connection')).not.toBeVisible()
      await expect(panel).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('operations-connection')).toBeVisible()
    })
  }

  for (const width of [1280, 390]) {
    test(`失败报告可准备重试，无水平溢出 · ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      const posts = await open(page, report('failed'))
      const panel = page.getByTestId('operations-update-report')
      await panel.scrollIntoViewIfNeeded()
      await expect(panel).toContainText('原备份保持不变')
      await expect(panel.getByRole('button', { name: '重试更新备份' })).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        )
      ).toBe(false)
      await page.screenshot({ path: info.outputPath(`update-failed-${width}.png`) })
      await panel.getByRole('button', { name: '重新检查并恢复更新' }).click()
      await expect(
        page.getByRole('button', { name: '执行检查远端变化', exact: true })
      ).toBeVisible()
      expect(posts()).toBe(0)
    })
  }

  for (const withPlan of [true, false]) {
    test(`结构读取超时尚无变更列表时可以直接重试 · 原计划${withPlan ? '存在' : '未生成'}`, async ({
      page
    }, info) => {
      test.setTimeout(90_000)
      const failed = {
        ...report('failed'),
        items: [],
        summary: { added: 0, changed: 0, removed: 0, unchanged: 0 },
        errorCode: 'BACKUP_SOURCE_READ_TIMEOUT',
        error: '来源数据库读取超时，原完整备份保留。'
      }
      const posts = await open(page, failed, 'light', false, withPlan ? failed.planId : undefined)
      const panel = page.getByTestId('operations-update-report')
      await panel.getByRole('button', { name: '重试更新备份' }).click()
      await expect(page.getByRole('textbox', { name: '要更新的完整备份目录' })).toHaveValue(
        backupPath
      )
      await expect(page.getByRole('textbox', { name: '更新计划编号（可选）' })).toHaveValue(
        withPlan ? failed.planId : ''
      )
      await expect(page.getByLabel('来源数据库密码')).toHaveValue('')
      await expect(
        page.getByRole('button', { name: '执行更新已有备份', exact: true })
      ).toBeVisible()
      await expect(panel).toContainText('无需单独重新检查')
      await page.screenshot({ path: info.outputPath(`update-early-timeout-${withPlan}.png`) })
      expect(posts()).toBe(0)
    })
  }

  test('比较中不显示完成结论', async ({ page }) => {
    await open(page, undefined, 'light', true)
    const panel = page.getByTestId('operations-update-report')
    await expect(panel).toContainText('正在比较或更新备份')
    await expect(panel).not.toContainText('已有备份更新完成')
  })
})
