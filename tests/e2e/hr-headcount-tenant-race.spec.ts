import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const overview = (name: string) => ({
  active_plan_count: 1,
  pending_approval_count: 0,
  operational_capacity: 8,
  current_incumbent_count: 4,
  vacancy_count: 4,
  over_capacity_count: 0,
  featured_plan: {
    id: name,
    plan_no: name,
    plan_name: name,
    status: 'draft',
    baseline_count: 4,
    planned_hires: 2,
    planned_exits: 0,
    target_count: 6,
    planned_payroll: 1000,
    currency_code: 'CNY'
  }
})

const tenantOf = (route: Route): string | null => {
  const body = route.request().postDataJSON() as { p_tenant_id?: string | null } | null
  return body?.p_tenant_id ?? null
}

const selectTenant = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: `切换${name}` }).click()
}

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const width of [1440, 570]) {
  test(`编制规划租户切换丢弃旧响应并保持页面宽度 ${width}px`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const releaseA: Array<() => void> = []
    let aRequests = 0
    let completedA = 0
    const recordTenants: Array<string | null> = []
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/rpc/hr_workforce_overview_secure')) {
        const tenant = tenantOf(route)
        if (tenant === tenantA) {
          aRequests++
          await new Promise<void>((resolve) => {
            releaseA.push(resolve)
          })
        }
        await route.fulfill({ json: overview(tenant === tenantA ? '甲租户规划' : '乙租户规划') })
        if (tenant === tenantA) completedA++
        return
      }
      if (path.endsWith('/rpc/hr_list_workforce_options_secure')) {
        const tenant = tenantOf(route)
        if (tenant === tenantA) {
          aRequests++
          await new Promise<void>((resolve) => {
            releaseA.push(resolve)
          })
        }
        await route.fulfill({
          json: [
            {
              id: tenant === tenantA ? 'plan-a' : 'plan-b',
              name: tenant === tenantA ? '甲规划' : '乙规划',
              code: tenant === tenantA ? 'A' : 'B'
            }
          ]
        })
        if (tenant === tenantA) completedA++
        return
      }
      if (path.endsWith('/rpc/hr_list_workforce_records_secure')) {
        const tenant = tenantOf(route)
        recordTenants.push(tenant)
        const body = route.request().postDataJSON() as { p_kind?: string }
        return route.fulfill({
          json:
            body.p_kind === 'line'
              ? {
                  records: [
                    {
                      id: tenant === tenantA ? 'line-a' : 'line-b',
                      tenant_id: tenant,
                      position: { name: tenant === tenantA ? '甲岗位' : '乙岗位', code: 'POS-01' },
                      organization: { name: '测试组织' },
                      plan: { name: tenant === tenantA ? '甲规划' : '乙规划', code: 'PLAN-01' },
                      baseline_count: 4,
                      planned_hires: 1,
                      planned_exits: 0,
                      target_count: 5,
                      current_count: 4,
                      forecast_gap: 1,
                      plan_status: 'active'
                    }
                  ],
                  total: 21
                }
              : { records: [], total: 0 }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/hr-headcount-tenant-race.html', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.locator('.workforce-page__bridge')).toContainText('乙租户规划')
    await page.getByRole('tab', { name: /岗位需求/ }).click()
    await selectTenant(page, '租户甲')
    await expect.poll(() => aRequests).toBe(2)
    const previousTable = await page.locator('.workforce-page .art-table-query').elementHandle()
    await selectTenant(page, '租户乙')
    await expect.poll(() => previousTable?.evaluate((element) => element.isConnected)).toBe(false)
    await expect(page.locator('.workforce-page__bridge')).toContainText('乙租户规划')
    releaseA.forEach((release) => release())
    await expect.poll(() => completedA).toBe(2)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(page.locator('.workforce-page__bridge')).not.toContainText('甲租户规划')
    const planSelect = page
      .locator('.el-form-item')
      .filter({ hasText: '规划周期' })
      .getByRole('combobox')
    await planSelect.click()
    await expect(page.getByRole('option', { name: /乙规划/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /甲规划/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    const currentTable = page.locator('.workforce-page .art-table-query')
    let requestCount = recordTenants.length
    await currentTable.getByRole('button', { name: '查询' }).click()
    await expect.poll(() => recordTenants.length).toBeGreaterThan(requestCount)
    expect(recordTenants.at(-1)).toBe(tenantB)
    requestCount = recordTenants.length
    await currentTable.getByRole('button', { name: '重置' }).click()
    await expect.poll(() => recordTenants.length).toBeGreaterThan(requestCount)
    expect(recordTenants.at(-1)).toBe(tenantB)
    if (width === 1440) {
      const header = page.locator('.workforce-page .business-workspace-header')
      const capacityDeck = page.locator('.workforce-page__capacity-deck')
      await expect(currentTable.locator('.pagination')).toBeVisible()
      await header
        .locator('.el-switch')
        .filter({ has: page.locator('input[aria-label="进入专注模式"]') })
        .click()
      await expect(header).toBeHidden()
      await expect(capacityDeck).toBeHidden()
      await expect(currentTable).toBeVisible()
      await expect(currentTable.locator('.art-search-bar')).toBeVisible()
      await expect(currentTable.locator('.pagination')).toBeVisible()
      const visibleExit = currentTable.getByRole('button', { name: '退出专注模式' })
      await expect(visibleExit).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      await visibleExit.click()
      await expect(header).toBeVisible()
      await expect(capacityDeck).toBeVisible()
      await header
        .locator('.el-switch')
        .filter({ has: page.locator('input[aria-label="进入专注模式"]') })
        .click()
      await page.keyboard.press('Escape')
      await expect(header).toBeVisible()
      await expect(capacityDeck).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    await page
      .locator('.workforce-page')
      .screenshot({ path: info.outputPath(`headcount-${width}.png`) })
  })
}

test('编制规划读取失败显示页面重试并恢复数据', async ({ page }) => {
  await prepareIsolatedSession(page)
  let overviewAttempts = 0
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/rpc/hr_workforce_overview_secure')) {
      overviewAttempts++
      return overviewAttempts === 1
        ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'temporary failure' } })
        : route.fulfill({ json: overview('恢复的规划') })
    }
    if (path.endsWith('/rpc/hr_list_workforce_options_secure')) return route.fulfill({ json: [] })
    if (path.endsWith('/rpc/hr_list_workforce_records_secure'))
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/hr-headcount-tenant-race.html', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('容量总览暂时无法加载，请重试')).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await expect(page.getByText('尚未建立人力规划')).toHaveCount(0)
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.locator('.workforce-page__bridge')).toContainText('恢复的规划')
  await expect(page.getByText('容量总览暂时无法加载，请重试')).toHaveCount(0)
})

test('编制规划当前租户列表失败在表格内重试且不弹 toast', async ({ page }) => {
  await prepareIsolatedSession(page)
  let failedTenantRequests = 0
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/rpc/hr_workforce_overview_secure'))
      return route.fulfill({ json: overview('乙租户规划') })
    if (path.endsWith('/rpc/hr_list_workforce_options_secure')) return route.fulfill({ json: [] })
    if (path.endsWith('/rpc/hr_list_workforce_records_secure')) {
      if (tenantOf(route) === tenantB && ++failedTenantRequests === 1)
        return route.fulfill({ status: 503, json: { code: 'XX000', message: 'temporary failure' } })
      return route.fulfill({ json: { records: [], total: 0 } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/hr-headcount-tenant-race.html', {
    waitUntil: 'domcontentloaded'
  })
  await selectTenant(page, '租户乙')
  const table = page.locator('.workforce-page .art-table-query')
  const retry = table.getByRole('button', { name: '重新加载' })
  await expect(retry).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await retry.click()
  await expect.poll(() => failedTenantRequests).toBe(2)
  await expect(retry).toHaveCount(0)
  await expect(page.locator('.el-message')).toHaveCount(0)
})
