import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scope of ['all', 'selected'] as const) {
  test(`新增销售报价引用使用${scope === 'all' ? '平台默认' : '指定'}租户`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const tenants: string[] = []
    await page.route('**/rest/v1/mdm_**', (route) => {
      const tenant = new URL(route.request().url()).searchParams.get('tenant_id')
      if (tenant) tenants.push(tenant)
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/quotation-conversion.html?scope=${scope}`)
    tenants.length = 0
    await page.getByRole('button', { name: '新增报价', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增销售报价单', exact: true })
    await expect(dialog).toBeVisible()
    await expect.poll(() => tenants.length).toBeGreaterThan(0)
    await expect(dialog.getByText('单据选项加载失败', { exact: true })).toHaveCount(0)
    const target = scope === 'all' ? 'platform-tenant' : 'selected-tenant'
    expect(tenants).toContain(`eq.${target}`)
    expect(
      tenants.filter((tenant) => tenant !== `eq.${target}` && tenant !== `in.(${target})`)
    ).toEqual([])
  })
}
test('销售单据引用失败可原地重试并保留填写', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  let fail = true
  let writes = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') {
      if (path.endsWith('/scm_sales_document')) {
        writes++
        return route.fulfill({ json: [] })
      }
      return route.fallback()
    }
    if (path.endsWith('/sys_menu')) return route.fulfill({ json: { id: 'quote-menu' } })
    if (path.endsWith('/mdm_material_type') && fail)
      return route.fulfill({
        status: 500,
        json: { code: 'XX000', message: 'technical reference failure' }
      })
    if (
      path.includes('/mdm_') ||
      path.endsWith('/scm_quote_expense') ||
      path.endsWith('/sys_dictionary')
    )
      return route.fulfill({ json: [] })
    return route.fallback()
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '编辑报价', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑销售报价单 · TEST-A', exact: true })
  await expect(dialog.getByText('单据选项加载失败', { exact: true })).toBeVisible()
  const remark = dialog.getByRole('textbox', { name: '备注', exact: true })
  await remark.fill('TEST-KEEP')
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(page.getByText('请等待单据选项加载成功后再提交', { exact: true })).toBeVisible()
  expect(writes).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('reference-error.png'),
    animations: 'disabled'
  })
  fail = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('单据选项加载失败', { exact: true })).toHaveCount(0)
  await expect(remark).toHaveValue('TEST-KEEP')
  await page.screenshot({
    path: testInfo.outputPath('reference-recovered.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
