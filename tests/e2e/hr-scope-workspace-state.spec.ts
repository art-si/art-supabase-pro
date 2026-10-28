import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const workspace of [
  {
    page: 'performance',
    title: '绩效管理',
    overviewRpc: 'hr_performance_overview_secure',
    listRpc: 'hr_list_performance_records_secure',
    optionsRpc: 'hr_list_performance_options_secure',
    alert: '绩效数据加载失败'
  },
  {
    page: 'lifecycle',
    title: '入转调离',
    overviewRpc: 'hr_lifecycle_overview_secure',
    listRpc: 'hr_list_lifecycle_records_secure',
    optionsRpc: 'hr_list_lifecycle_options_secure',
    alert: '员工旅程数据加载失败'
  }
] as const) {
  test(`${workspace.title}：失败与重试`, async ({ page }, testInfo) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    let overviewCalls = 0
    let listCalls = 0
    let optionCalls = 0
    const tenantArguments: unknown[] = []
    await page.route(`**/rest/v1/rpc/${workspace.overviewRpc}**`, (route) => {
      tenantArguments.push(route.request().postDataJSON().p_tenant_id)
      overviewCalls += 1
      return overviewCalls === 1
        ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'Unavailable' } })
        : route.fulfill({ json: {} })
    })
    await page.route(`**/rest/v1/rpc/${workspace.listRpc}**`, (route) => {
      tenantArguments.push(route.request().postDataJSON().p_tenant_id)
      listCalls += 1
      return listCalls === 1
        ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'Unavailable' } })
        : route.fulfill({ json: { records: [], total: 0 } })
    })
    await page.route(`**/rest/v1/rpc/${workspace.optionsRpc}**`, (route) => {
      tenantArguments.push(route.request().postDataJSON().p_tenant_id)
      optionCalls += 1
      return optionCalls === 1
        ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'Unavailable' } })
        : route.fulfill({ json: [] })
    })

    await page.goto(`/tests/e2e/fixtures/hr-delete-workflows.html?page=${workspace.page}`)
    await expect(page.getByText(workspace.alert)).toBeVisible()
    await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '重新加载' })).toHaveCount(2)
    await expect(page.getByText('已使用前端默认列')).toBeHidden({ timeout: 10_000 })
    await page.screenshot({
      path: testInfo.outputPath(`${workspace.page}-${testInfo.project.name}-error.png`),
      fullPage: true,
      animations: 'disabled'
    })
    await page.setViewportSize({ width: 570, height: 900 })
    await page.screenshot({
      path: testInfo.outputPath(`${workspace.page}-570-error.png`),
      fullPage: true,
      animations: 'disabled'
    })

    await page.getByRole('button', { name: '重新加载' }).first().click()
    await expect(page.getByText(workspace.alert)).toBeHidden()
    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('数据加载失败', { exact: true })).toBeHidden()
    expect(overviewCalls).toBeGreaterThanOrEqual(2)
    expect(listCalls).toBeGreaterThanOrEqual(2)
    expect(optionCalls).toBeGreaterThanOrEqual(2)
    expect(tenantArguments.every((tenantId) => tenantId === null)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`${workspace.page}-570-recovered.png`),
      fullPage: true,
      animations: 'disabled'
    })
    for (const viewportWidth of [570, 1440]) {
      await page.setViewportSize({ width: viewportWidth, height: 900 })
      const width = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth
      }))
      expect(width.document).toBeLessThanOrEqual(width.viewport)
    }
    await page.screenshot({
      path: testInfo.outputPath(`${workspace.page}-1440-recovered.png`),
      fullPage: true,
      animations: 'disabled'
    })
    expect(pageErrors).toEqual([])
  })

  test(`${workspace.title}：选定租户请求参数`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const selectedTenantId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    await page.addInitScript(() => {
      sessionStorage.setItem('art-platform-tenant-scope-id', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
      sessionStorage.setItem('art-platform-tenant-scope-active', '1')
      sessionStorage.setItem(
        'tenant-scope',
        JSON.stringify({
          selectedTenantId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          scopeOwnerUserId: 'permission-test-user'
        })
      )
    })
    const requests: unknown[] = []
    for (const rpc of [workspace.overviewRpc, workspace.listRpc, workspace.optionsRpc]) {
      await page.route(`**/rest/v1/rpc/${rpc}**`, (route) => {
        requests.push(route.request().postDataJSON().p_tenant_id)
        return route.fulfill({
          json:
            rpc === workspace.listRpc
              ? { records: [], total: 0 }
              : rpc === workspace.optionsRpc
                ? []
                : {}
        })
      })
    }
    await page.goto(`/tests/e2e/fixtures/hr-delete-workflows.html?page=${workspace.page}`)
    await expect(page.getByText(workspace.title, { exact: true }).first()).toBeVisible()
    await expect.poll(() => requests.length).toBeGreaterThanOrEqual(4)
    expect(requests.every((tenantId) => tenantId === selectedTenantId)).toBe(true)
  })
}
