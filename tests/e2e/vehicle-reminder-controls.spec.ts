import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)

const scenarios: Array<{ mode: string; title: string; theme?: string; box?: string }> = [
  { mode: 'insurance', title: '保险到期' },
  { mode: 'inspection', title: '年检到期' },
  { mode: 'maintenance', title: '保养到期' },
  { mode: 'part', title: '配件寿命' },
  { mode: 'vehicle', title: '车辆寿命' },
  { mode: 'insurance', title: '保险到期 light shadow-mode', theme: 'light', box: 'shadow-mode' },
  { mode: 'insurance', title: '保险到期 dark border-mode', theme: 'dark', box: 'border-mode' },
  { mode: 'insurance', title: '保险到期 dark shadow-mode', theme: 'dark', box: 'shadow-mode' }
]

for (const scenario of scenarios) {
  test(`${scenario.title}公共显示控制及专注模式`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    )
    await page.goto(
      `/tests/e2e/fixtures/vehicle-reminder-controls.html?mode=${scenario.mode}&theme=${scenario.theme ?? 'light'}&box=${scenario.box ?? 'border-mode'}`
    )
    const header = page.locator('.business-workspace-header')
    await expect(header.getByRole('heading')).toBeVisible({ timeout: 120_000 })
    const tools = page.getByRole('switch', { name: '显示表格右侧工具栏', exact: true })
    await expect(tools).toBeEnabled()
    await tools.locator('..').click()
    await expect(page.locator('.art-table-header')).toHaveCount(1)
    await expect(page.getByRole('button', { name: '刷新表格', exact: true })).toBeVisible()
    await expect
      .poll(async () => (await page.locator('.art-table-header').boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(30)
    await page
      .locator('.art-table-header')
      .screenshot({ path: info.outputPath('toolbar-expanded.png') })
    await tools.locator('..').click()
    await expect(page.locator('.art-table-header')).toHaveCount(0)
    const enter = page.getByRole('switch', { name: '进入专注模式', exact: true })
    for (const exit of ['button', 'escape']) {
      await enter.locator('..').click()
      await expect(header).toBeHidden()
      await page.getByRole('button', { name: '展开搜索条件', exact: true }).click()
      await expect(page.getByRole('textbox', { name: '车牌号', exact: true })).toBeVisible()
      await expect(page.locator('.art-table')).toBeVisible()
      if (exit === 'button')
        await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      else await page.keyboard.press('Escape')
      await expect(header).toBeVisible()
      await expect(page.getByRole('textbox', { name: '车牌号', exact: true })).toHaveCount(0)
    }
    await page.screenshot({ path: info.outputPath('reminder-public-controls.png'), fullPage: true })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('保险到期风险概览与列表只使用成功应用的筛选', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.clock.install()
  await page.setViewportSize({ width: 390, height: 844 })
  const plate = '测A12345'
  const otherPlate = '测B67890'
  const plateFilter = `ilike.%${plate}%`
  const overviewFilters: Array<string | null> = []
  const listFilters: Array<{ plate: string | null; expired: string | null }> = []
  const filteredListGate = Promise.withResolvers<void>()
  let failNextList = false
  await page.route('**/rest/v1/vehicle_reminder_insurance_expiry?*', async (route) => {
    const request = route.request()
    const params = new URL(request.url()).searchParams
    const queryPlate = params.get('plate_no')
    const expired = params.get('expired')
    const filtered = queryPlate === plateFilter
    const responseHeaders = { 'access-control-expose-headers': 'content-range' }
    if (request.method() === 'HEAD') {
      overviewFilters.push(queryPlate)
      const count = expired === 'eq.true' ? 1 : expired === 'eq.false' ? 0 : filtered ? 1 : 2
      return route.fulfill({ headers: { ...responseHeaders, 'content-range': `*/${count}` } })
    }

    listFilters.push({ plate: queryPlate, expired })
    if (failNextList) {
      failNextList = false
      return route.fulfill({
        status: 400,
        json: { message: '列表加载失败' }
      })
    }
    if (filtered && expired !== 'eq.true') await filteredListGate.promise
    const records = [
      { id: 'risk-a', plate_no: plate, expired: true, remaining_days: -1 },
      { id: 'risk-b', plate_no: otherPlate, expired: false, remaining_days: 60 }
    ].filter(
      (row) => (!filtered || row.plate_no === plate) && (expired !== 'eq.true' || row.expired)
    )
    return route.fulfill({
      json: records,
      headers: { ...responseHeaders, 'content-range': `0-${records.length - 1}/${records.length}` }
    })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-reminder-controls.html?mode=insurance')
  const header = page.locator('.business-workspace-header')
  const total = header.locator('.business-workspace-header__metric').filter({ hasText: '全部提醒' })
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(total.getByText('2', { exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(rows).toHaveCount(2)
  expect(overviewFilters).toEqual([null, null, null, null])
  const initialListCount = listFilters.length

  await header
    .getByRole('switch', { name: '显示表格右侧工具栏', exact: true })
    .locator('..')
    .click()
  await page.getByRole('button', { name: '展开搜索条件', exact: true }).click()
  const filter = page.getByRole('textbox', { name: '车牌号', exact: true })
  await filter.fill(plate)
  expect(await total.getAttribute('aria-busy')).toBeNull()
  await page.clock.runFor(300)
  expect(overviewFilters).toHaveLength(4)
  expect(listFilters).toHaveLength(initialListCount)
  await expect(total.getByText('2', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(2)

  try {
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => listFilters.at(-1)?.plate).toBe(plateFilter)
    await page.clock.runFor(300)
    expect(overviewFilters).toHaveLength(4)
    expect(await total.getAttribute('aria-busy')).toBeNull()
  } finally {
    filteredListGate.resolve()
  }
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText(plate)
  await expect(total.getByText('1', { exact: true })).toBeVisible()
  expect(overviewFilters.slice(4)).toEqual([plateFilter, plateFilter, plateFilter, plateFilter])

  const overdue = header.getByRole('button', { name: /已逾期/ })
  await overdue.click()
  await expect.poll(() => listFilters.at(-1)).toEqual({ plate: plateFilter, expired: 'eq.true' })
  await expect(overdue).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(300)
  expect(overviewFilters).toHaveLength(8)
  expect(listFilters).toHaveLength(initialListCount + 2)
  await page.screenshot({ path: info.outputPath('reminder-accepted-risk-scope-390.png') })

  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const notices = document.querySelectorAll('.el-message--error, .el-notification')
      if (!Array.from(notices).some((notice) => notice.textContent?.includes('列表加载失败')))
        return
      document.documentElement.dataset.reminderListNoticeSeen = 'true'
      observer.disconnect()
    })
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  })
  failNextList = true
  await page.getByRole('button', { name: '刷新表格', exact: true }).click()
  const errorState = page.locator('.art-table-query__error-state')
  const retry = errorState.getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeVisible()
  await expect(errorState.getByText('列表加载失败', { exact: true })).toBeVisible()
  await expect(header.getByText('等待列表结果', { exact: true })).toBeVisible()
  await expect(total.getByText('1', { exact: true })).toHaveCount(0)
  expect(overviewFilters).toHaveLength(8)
  await page.screenshot({ path: info.outputPath('reminder-awaiting-list-retry-390.png') })
  expect(await page.locator('html').getAttribute('data-reminder-list-notice-seen')).toBeNull()

  await retry.click()
  await expect(rows).toContainText(plate)
  await expect(total.getByText('1', { exact: true })).toBeVisible()
  expect(overviewFilters.slice(8)).toEqual([plateFilter, plateFilter, plateFilter, plateFilter])
})

test('引用处理入口保留公共控制且不请求风险概览', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  let statistics = 0
  let located = false
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'HEAD') statistics++
    if (
      url.pathname.endsWith('/vehicle_reminder_insurance_expiry') &&
      url.searchParams.get('id') === 'eq.source-test'
    )
      located = true
    return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-reminder-controls.html?mode=insurance&linked')
  await expect(page.locator('.business-workspace-header')).toHaveCount(0)
  const enter = page.getByRole('switch', { name: '进入专注模式', exact: true })
  await expect(enter).toBeEnabled({ timeout: 120_000 })
  await enter.locator('..').click()
  await page.getByRole('button', { name: '展开搜索条件', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '车牌号', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(enter.locator('..')).toBeVisible()
  await expect.poll(() => located).toBe(true)
  await expect(page.locator('.master-delete-notice')).toContainText('定位待完成')
  await expect(page.locator('.master-delete-notice')).not.toContainText('已找到关联记录')
  expect(statistics).toBe(0)
  await page.screenshot({ path: info.outputPath('reminder-linked-controls.png'), fullPage: true })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: '清除定位', exact: true }).click()
  await expect(page.getByRole('heading', { name: '保险到期风险概览', exact: true })).toBeVisible()
  await expect.poll(() => statistics).toBe(4)
  await expect(enter).toBeEnabled()
  await enter.locator('..').click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.screenshot({ path: info.outputPath('reminder-linked-cleared.png'), fullPage: true })
})

for (const scenario of scenarios.slice(0, 5)) {
  test(`${scenario.title}关联提示以实际数据为准`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let stage: 'empty' | 'unrelated' | 'matched' | 'error' = 'empty'
    let release: (() => void) | undefined
    let received = false
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (!path.includes('/vehicle_reminder_') || path.endsWith('/vehicle_reminder_work_order')) {
        await route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
        return
      }
      received = true
      await gate
      if (stage === 'error') {
        await route.fulfill({ status: 400, json: { message: '关联资料加载失败' } })
        return
      }
      const rows =
        stage === 'empty'
          ? []
          : [
              {
                id: stage === 'matched' ? 'source-test' : 'record-test',
                plate_no: '沪A测试',
                company_name: '测试运输公司',
                remaining_days: 5,
                remaining_mileage: 1000,
                expired: false
              }
            ]
      await route.fulfill({
        json: rows,
        headers: {
          'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/vehicle-reminder-controls.html?mode=${scenario.mode}&linked`
    )
    const notice = page.locator('.master-delete-notice')
    await expect(notice).toContainText('定位待完成', { timeout: 120_000 })
    await expect.poll(() => received).toBe(true)
    release?.()
    await expect(page.locator('.art-table')).toBeVisible()
    await expect(notice).not.toContainText('已找到关联记录')
    await page
      .getByRole('switch', { name: '显示表格右侧工具栏', exact: true })
      .locator('..')
      .click()
    const refresh = page.getByRole('button', { name: '刷新表格', exact: true })
    const refreshRows = async (): Promise<void> => {
      const mobile = info.project.name === 'mobile-390'
      if (mobile)
        await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await refresh.click()
      if (mobile) await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    }
    stage = 'unrelated'
    await refreshRows()
    await expect(page.locator('.art-table')).toContainText('沪A测试')
    await expect(notice).toContainText('定位待完成')
    stage = 'matched'
    await refreshRows()
    await expect(notice).toContainText('已找到关联记录')
    await page.screenshot({
      path: info.outputPath('reminder-location-matched.png'),
      fullPage: true
    })
    stage = 'error'
    await refreshRows()
    await expect(notice).toContainText('定位待完成')
    await expect(page.getByText('关联资料加载失败', { exact: true }).first()).toBeVisible()
    stage = 'matched'
    await refreshRows()
    await expect(notice).toContainText('已找到关联记录')
    expect(errors).toEqual([])
  })
}
