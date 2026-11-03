import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'
import { dictionaries } from './fixtures/form-standard-wms-pmis-dictionaries'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(60_000)

const fixture = '/tests/e2e/fixtures/pmis-plan-context.html'
const planAId = '44444444-4444-4444-8444-444444444441'
const dictionaryItems = {
  ...dictionaries,
  pmisPlanFrequency: [
    ...dictionaries.pmisPlanFrequency,
    { label: '每月', value: 'monthly' },
    { label: '每季度', value: 'quarterly' },
    { label: '每年', value: 'yearly' }
  ]
}
type SavePayload = { p_id: string | null; p_payload: Record<string, unknown> }
const state = new WeakMap<
  Page,
  { writes: SavePayload[]; unknownRest: string[]; pageErrors: string[] }
>()

test.beforeEach(async ({ page }, info) => {
  const current = {
    writes: [] as SavePayload[],
    unknownRest: [] as string[],
    pageErrors: [] as string[]
  }
  state.set(page, current)
  page.on('pageerror', (error) => current.pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.unroute('**/rest/v1/**')
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/rpc/pmis_save_plan_secure')) {
      const payload = request.postDataJSON() as SavePayload
      current.writes.push(payload)
      return route.fulfill({ json: payload.p_id ?? planAId })
    }
    if (path.endsWith('/sys_dictionary')) {
      const code = new URL(request.url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      return route.fulfill({
        json: Object.entries(dictionaryItems)
          .filter(([type]) => !code || code === type)
          .flatMap(([type, rows]) =>
            rows.map((row, index) => ({
              id: `${type}-${row.value}`,
              type_id: type,
              code: row.value,
              value: row.value,
              label: row.label,
              sort: index,
              status: '1',
              dict_type_table: { code: type, name: type }
            }))
          )
      })
    }
    if (
      path.endsWith('/sys_param') ||
      path.endsWith('/sys_user') ||
      path.endsWith('/sys_tenant') ||
      path.endsWith('/rpc/current_is_super') ||
      path.endsWith('/rpc/get_organization_list_secure')
    )
      return route.fallback()
    current.unknownRest.push(`${request.method()} ${path}`)
    return route.abort()
  })
  const dark = info.project.name.includes('dark')
  await page.goto(`${fixture}?theme=${dark ? 'dark' : 'light'}`)
  await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await installActionFeedbackHistory(page)
})

test.afterEach(({ page }) => {
  expect(state.get(page)?.unknownRest).toEqual([])
  expect(state.get(page)?.pageErrors).toEqual([])
})

async function openA(page: Page) {
  await page.getByTestId('open-a').click()
  await expect(page.getByTestId('open-state')).toHaveText('ready')
  await expect(page.locator('.el-dialog:visible')).toContainText('验收方案 A')
}

async function openScheduledA(page: Page, schedule: string) {
  const theme = (await page.locator('html').evaluate((root) => root.classList.contains('dark')))
    ? 'dark'
    : 'light'
  await page.goto(`${fixture}?theme=${theme}&schedule=${schedule}`)
  await installActionFeedbackHistory(page)
  await openA(page)
}

async function save(page: Page) {
  await page.locator('.el-dialog:visible').getByRole('button', { name: '保存方案' }).click()
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(
    await page
      .locator('.el-dialog:visible')
      .evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
  ).toBeLessThanOrEqual(1)
}

test('正常编辑 A 保留原 ID、kind、项目与一次中文反馈', async ({ page }, info) => {
  await openA(page)
  await noHorizontalOverflow(page)
  await page.screenshot({ path: info.outputPath('plan-a.png'), animations: 'disabled' })
  await save(page)
  await expect.poll(() => state.get(page)?.writes.length).toBe(1)
  const saved = state.get(page)?.writes[0]
  expect(saved).toMatchObject({
    p_id: planAId,
    p_payload: {
      plan_kind: 'inspection',
      plan_name: '验收方案 A',
      responsible_employee_ids: ['employee-1'],
      equipment_ids: ['equipment-1']
    }
  })
  expect(Object.keys(saved?.p_payload ?? {}).sort()).toEqual(
    [
      'tenant_id',
      'plan_kind',
      'plan_name',
      'frequency',
      'frequency_value',
      'advance_days',
      'required_days',
      'holiday_policy',
      'notification_rules',
      'require_photo',
      'sop_files',
      'status',
      'remark',
      'items',
      'equipment_ids',
      'responsible_employee_ids'
    ].sort()
  )
  await expect(page.getByTestId('success-count')).toHaveText('1')
  expect(await readActionFeedbackHistory(page)).toEqual([{ kind: 'success', text: '方案已更新' }])
})

for (const expected of [
  { schedule: 'monthly17', label: '月度17日', value: 17 },
  { schedule: 'yearly10', label: '年度10月', value: 10 }
]) {
  test(`已有${expected.label}打开与保存仍保留原执行值`, async ({ page }) => {
    await openScheduledA(page, expected.schedule)
    const shown = await page.locator('[data-art-form-item-key="frequencyValue"] input').inputValue()
    await save(page)
    await expect.poll(() => state.get(page)?.writes.length).toBe(1)
    expect(state.get(page)?.writes[0]?.p_payload.frequency_value).toBe(expected.value)
    expect(shown).toBe(String(expected.value))
  })
}

test('用户主动从月度切到每周时执行星期重置为周一', async ({ page }) => {
  await openScheduledA(page, 'monthly17')
  await page.locator('[data-art-form-item-key="frequency"] .el-select').click()
  await page.getByRole('option', { name: '每周', exact: true }).click()
  await expect(page.locator('[data-art-form-item-key="frequencyValue"]')).toContainText('周一')
})

test('复制 A 使用 Add 载荷与原创建反馈', async ({ page }) => {
  await page.getByTestId('open-copy').click()
  await expect(page.getByTestId('open-state')).toHaveText('ready')
  await save(page)
  await expect.poll(() => state.get(page)?.writes.length).toBe(1)
  expect(state.get(page)?.writes[0]).toMatchObject({
    p_id: null,
    p_payload: { plan_kind: 'inspection', plan_name: '验收方案 A（副本）' }
  })
  expect(await readActionFeedbackHistory(page)).toEqual([{ kind: 'success', text: '方案已创建' }])
})

for (const outcome of ['success', 'error'] as const) {
  test(`A 写入晚到${outcome === 'success' ? '成功' : '失败'}不向新 B 发反馈或成功事件`, async ({
    page
  }, info) => {
    let releaseA: (() => void) | undefined
    const pendingA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    await page.route('**/rest/v1/rpc/pmis_save_plan_secure', async (route) => {
      state.get(page)?.writes.push(route.request().postDataJSON() as SavePayload)
      await pendingA
      await route.fulfill(
        outcome === 'success'
          ? { json: planAId }
          : { status: 503, json: { code: 'PGRST503', message: 'fixture delayed failure' } }
      )
    })
    try {
      await openA(page)
      await save(page)
      await expect.poll(() => state.get(page)?.writes.length).toBe(1)
      expect(state.get(page)?.writes[0]?.p_id).toBe(planAId)
      // ArtDialog blocks ordinary clicks while saving. This models an external parent switch.
      await page.getByTestId('open-b').evaluate((button: HTMLButtonElement) => button.click())
      await expect(page.locator('.el-dialog:visible')).toContainText('验收方案 B')
      const response = page.waitForResponse('**/rest/v1/rpc/pmis_save_plan_secure')
      releaseA?.()
      await response
      await page.waitForTimeout(150)
      await expect(page.locator('.el-dialog:visible')).toContainText('验收方案 B')
      await expect(page.getByTestId('success-count')).toHaveText('0')
      expect(await readActionFeedbackHistory(page)).toEqual([])
      await noHorizontalOverflow(page)
      await page.screenshot({ path: info.outputPath('plan-b-after.png'), animations: 'disabled' })
    } finally {
      releaseA?.()
    }
  })
}

for (const context of [
  { label: '路由', control: 'switch-route' },
  { label: '认证租户', control: 'switch-tenant' },
  { label: '编辑权限', control: 'revoke-edit' }
]) {
  test(`A 请求在途${context.label}变化后不向旧会话发成功反馈`, async ({ page }) => {
    let releaseA: (() => void) | undefined
    const pendingA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    await page.route('**/rest/v1/rpc/pmis_save_plan_secure', async (route) => {
      state.get(page)?.writes.push(route.request().postDataJSON() as SavePayload)
      await pendingA
      await route.fulfill({ json: planAId })
    })
    try {
      await openA(page)
      await save(page)
      await expect.poll(() => state.get(page)?.writes.length, { timeout: 20_000 }).toBe(1)
      expect(state.get(page)?.writes[0]?.p_id).toBe(planAId)
      // The ArtDialog is busy; this DOM click represents an external context change.
      await page
        .getByTestId(context.control)
        .evaluate((button: HTMLButtonElement) => button.click())
      const response = page.waitForResponse('**/rest/v1/rpc/pmis_save_plan_secure')
      releaseA?.()
      await response
      await page.waitForTimeout(150)
      await expect(page.getByTestId('success-count')).toHaveText('0')
      expect(await readActionFeedbackHistory(page)).toEqual([])
    } finally {
      releaseA?.()
    }
  })
}
