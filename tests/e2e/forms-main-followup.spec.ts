import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
})
const tenantId = '11111111-1111-4111-8111-111111111111',
  definitionId = '44444444-4444-4444-8444-444444444444'
const nodes = (updated = false, count = 4): Api.Workflow.WorkflowNode[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `node-${index}`,
    name: `审批节点${index + 1}`,
    order: index + 1,
    approvalMode: 'any',
    approvalThresholdPercent: 100,
    rejectVetoEnabled: true,
    allowSelfApproval: false,
    dueHours: updated ? 48 : 24,
    reminderBeforeMinutes: 30,
    escalationEnabled: false,
    escalateAfterHours: 0,
    assignee: { type: 'roles', roleCodes: ['finance'] },
    condition: { field: 'amount', operator: 'gte', value: 100 }
  }))
const definition: Api.Workflow.WorkflowDefinitionRecord = {
  id: definitionId,
  tenantId,
  code: 'WORKFLOW-001',
  name: '验收审批流程',
  businessType: 'tms_waybill_cost',
  status: 'published',
  currentVersionId: 'version-2',
  createTime: '2026-11-01T08:00:00Z',
  updateTime: '2026-11-01T08:00:00Z',
  versions: [1, 2, 3, 4].map((versionNo) => ({
    id: `version-${versionNo}`,
    definitionId,
    tenantId,
    versionNo,
    status: 'published',
    config: {
      nodes: nodes(versionNo > 1).map((node, index) =>
        versionNo === 4 && index === 0 ? { ...node, dueHours: 72 } : node
      ),
      allowAutoApprove: false
    },
    changeNote: `验收版本${versionNo}`,
    publishedAt: '2026-11-01T08:00:00Z',
    createTime: '2026-11-01T08:00:00Z',
    updateTime: '2026-11-01T08:00:00Z'
  }))
}
const snapshot = {
  projectRef: 'fixture',
  capturedAt: '2026-11-01T08:00:00Z',
  database: {
    version: '17',
    sizeBytes: 1024 ** 3,
    activeConnections: 2,
    maxConnections: 100,
    publicTables: 10,
    publicViews: 2,
    estimatedRows: 100,
    cacheHitPercent: 99
  },
  security: {
    publicTables: 10,
    rlsEnabledTables: 10,
    forceRlsTables: 10,
    rlsCoveragePercent: 100,
    policyCount: 20,
    invalidIndexes: 0,
    unindexedForeignKeys: 1,
    views: 2,
    securityInvokerViews: 2,
    tablesWithoutRls: [],
    unindexedForeignKeyTables: ['fixture']
  },
  performance: {
    sequentialScans: 1,
    indexScans: 10,
    deadRows: 0,
    statements: { enabled: true, trackedStatements: 1 }
  },
  auth: { enabled: true, users: 10, confirmedUsers: 9, active30d: 8 },
  storage: {
    enabled: true,
    buckets: 1,
    publicBuckets: 0,
    objects: 10,
    totalBytes: 1024,
    policies: 2
  },
  realtime: { enabled: true, publishedTables: 1 },
  cron: { enabled: true, jobs: 1, activeJobs: 1 },
  queues: { enabled: true, queues: 1 },
  vectors: { enabled: true, columns: 1, indexes: 1 },
  extensions: {
    installed: [
      { name: 'pgcrypto', version: '1.3' },
      { name: 'vector', version: '0.8' }
    ],
    vaultEnabled: true
  }
}
async function open(
  page: Page,
  mode: string,
  theme: string,
  input: NonNullable<Window['mainOverlayInput']> = {}
) {
  await page.addInitScript((data) => {
    window.mainOverlayInput = data
  }, input)
  await page.goto(`/tests/e2e/fixtures/forms-main-followup.html?mode=${mode}&theme=${theme}`)
  await page.getByRole('button', { name: '打开公开入口', exact: true }).click()
  await expect(page.getByTestId('open-error')).toBeEmpty()
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  const overlay = page.locator('.el-dialog:visible,.el-drawer:visible').first()
  expect(
    await overlay.evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1)
}
for (const profile of [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
]) {
  test.describe(`${profile.theme}${profile.width}`, () => {
    test.beforeEach(async ({ page }) => {
      await prepareIsolatedSession(page)
      await page.setViewportSize(profile)
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    })
    test('能力中心两组内容、刷新恢复和分析事件', async ({ page }, info) => {
      let requests = 0
      await page.route('**/functions/v1/ai-project-assistant', (route) => {
        requests++
        return requests === 1
          ? route.fulfill({ status: 500, json: { message: 'fixture snapshot failure' } })
          : route.fulfill({ json: { data: snapshot } })
      })
      await open(page, 'capability', profile.theme)
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer).toBeVisible()
      await expect(page.getByRole('button', { name: '刷新能力快照', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: '刷新能力快照', exact: true }).click()
      await expect(drawer.getByRole('tab')).toHaveCount(2)
      await expect(drawer.locator('.capability-center__grid article')).toHaveCount(9)
      await drawer.getByRole('tab', { name: '治理与扩展', exact: true }).click()
      await expect(drawer.getByText('pgcrypto · 1.3', { exact: true })).toBeVisible()
      await expect(drawer.locator('.capability-center__grid article')).toHaveCount(9)
      await noOverflow(page)
      await page.screenshot({ path: info.outputPath('governance.png'), animations: 'disabled' })
      await drawer.getByRole('tab', { name: '产品能力', exact: true }).click()
      await expect(drawer.getByText('Database', { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('products.png'), animations: 'disabled' })
      await drawer
        .getByRole('button', { name: /AI 专项分析/ })
        .first()
        .click()
      await expect(page.getByTestId('analyze')).toContainText('Database')
      await expect(drawer).toBeHidden()
      await page.getByRole('button', { name: '打开公开入口', exact: true }).click()
      await expect(page.getByRole('tab', { name: '产品能力', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })
    test('复杂模拟页签保留输入并响应清空与生成样例', async ({ page }, info) => {
      await open(page, 'simulator', profile.theme, {
        simulator: {
          businessType: 'tms_waybill_cost',
          businessTypeLabel: '运单费用',
          config: { nodes: nodes(), allowAutoApprove: false }
        }
      })
      const dialog = page.locator('.el-dialog:visible'),
        field = dialog.getByRole('spinbutton', { name: /^费用金额/ })
      await expect(dialog.getByRole('tab')).toHaveCount(2)
      await field.fill('321')
      await field.press('Tab')
      await field.evaluate((element) => element.setAttribute('data-sample-control', 'retained'))
      await dialog.getByRole('tab', { name: '模拟路径与体检', exact: true }).click()
      await expect(field).toBeHidden()
      await expect(page.locator('[data-sample-control]')).toHaveCount(1)
      await expect(dialog.locator('.workflow-simulator__trace-list')).toContainText(
        '费用金额（321）'
      )
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('simulation-path.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '清空样例', exact: true }).click()
      await dialog.getByRole('tab', { name: '业务样例', exact: true }).click()
      await expect(field).toHaveValue('')
      await dialog.getByRole('button', { name: '生成命中样例', exact: true }).click()
      await expect(field).toHaveValue('101.00')
      await page.screenshot({
        path: info.outputPath('simulation-sample.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '完成试跑', exact: true }).click()
      await expect(dialog).toBeHidden()
    })
    test('短模拟与无字段通用模拟保持单页', async ({ page }, info) => {
      for (const businessType of ['tms_waybill_cost', 'generic']) {
        await open(page, 'simulator', profile.theme, {
          simulator: {
            businessType,
            businessTypeLabel: '紧凑模拟',
            config: { nodes: nodes(false, 2), allowAutoApprove: false }
          }
        })
        const dialog = page.locator('.el-dialog:visible')
        await expect(dialog.getByRole('tab')).toHaveCount(0)
        if (businessType === 'generic')
          await expect(dialog.getByText('当前业务没有可模拟字段', { exact: true })).toBeVisible()
        else await expect(dialog.getByRole('spinbutton', { name: /^费用金额/ })).toBeVisible()
        await noOverflow(page)
        await page.screenshot({
          path: info.outputPath(`compact-${businessType}.png`),
          animations: 'disabled'
        })
        await dialog.getByRole('button', { name: '完成试跑', exact: true }).click()
      }
    })
    test('版本导航按内容切换单双页并实际恢复草稿', async ({ page }, info) => {
      const submissions: Record<string, unknown>[] = []
      await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
        submissions.push(route.request().postDataJSON())
        return route.fulfill({ json: { definitionId, versionId: 'restored', versionNo: 4 } })
      })
      await open(page, 'versions', profile.theme, { definition })
      const dialog = page.locator('.el-dialog:visible'),
        navigation = dialog.getByRole('complementary', { name: '流程版本列表', exact: true })
      await expect(dialog.getByRole('tab')).toHaveCount(2)
      await dialog.getByRole('tab', { name: '节点快照', exact: true }).click()
      await expect(dialog.locator('.workflow-version__node-list article')).toHaveCount(4)
      await expect(dialog.locator('.workflow-version__changes article')).toHaveCount(4)
      await noOverflow(page)
      await page.screenshot({ path: info.outputPath('version-nodes.png'), animations: 'disabled' })
      await navigation.getByRole('button', { name: /V3/ }).click()
      await expect(dialog.getByRole('tab')).toHaveCount(0)
      await expect(dialog.getByText('未发现配置变化', { exact: true })).toBeVisible()
      await navigation.getByRole('button', { name: /V4/ }).click()
      await expect(dialog.getByRole('tab')).toHaveCount(0)
      await expect(dialog.locator('.workflow-version__changes article')).toHaveCount(1)
      await navigation.getByRole('button', { name: /V1/ }).click()
      await expect(dialog.getByRole('tab')).toHaveCount(0)
      await navigation.getByRole('button', { name: /V2/ }).click()
      await expect(dialog.getByRole('tab', { name: '版本差异', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      await page.screenshot({
        path: info.outputPath('version-changes.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '恢复为草稿', exact: true }).click()
      await page
        .locator('.el-message-box')
        .getByRole('button', { name: '确认生成草稿', exact: true })
        .click()
      await expect.poll(() => submissions.length).toBe(1)
      expect(submissions[0].p_definition).toMatchObject({
        id: definitionId,
        tenantId,
        code: definition.code,
        businessType: definition.businessType,
        changeNote: '从 V2 恢复为草稿',
        config: definition.versions![1].config
      })
      await expect(page.getByTestId('successes')).toHaveText('1')
    })
  })
}
