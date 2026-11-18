import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('常用线路通过键盘全选当前页，并保留其他页的选择', async ({ page, hasTouch }) => {
  test.setTimeout(120_000)
  if (hasTouch) await page.setViewportSize({ width: 320, height: 700 })
  const tenant = await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const records = Array.from({ length: 26 }, (_, i) => ({
    id: `route-scope-${i + 1}`,
    tenant_id: tenant.id,
    route_name: `测试线路 ${String(i + 1).padStart(2, '0')}`,
    enabled: true
  }))
  await page.route('**/rest/v1/rpc/tms_list_favorite_routes_secure', (route) => {
    const { p_from, p_to } = route.request().postDataJSON()
    return route.fulfill({
      json: { records: records.slice(p_from, p_to + 1), total: records.length }
    })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=favorite-route')

  const firstRow = page.getByRole('row').filter({ hasText: '测试线路 01' })
  const pageAll = page.getByRole('checkbox', { name: '选择当前页全部行', exact: true })
  const checkedRows = page.getByRole('checkbox', { name: 'Select this row', checked: true })
  const summary = page.locator('.art-table-query__selection-summary')
  await expect(firstRow).toBeVisible({ timeout: 60_000 })
  await expect(pageAll).toHaveCount(1)
  await pageAll.press('Space')
  await expect(checkedRows).toHaveCount(20)
  await expect(summary).toContainText('已选择 20 项')

  await page.locator('.el-pagination button.btn-next').click()
  await expect(firstRow).not.toBeVisible()
  await expect(pageAll).not.toBeChecked()
  await expect(summary).toContainText('已选择 20 项')
  await pageAll.press('Space')
  await expect(checkedRows).toHaveCount(6)
  await expect(summary).toContainText('已选择 26 项')
  await pageAll.press('Space')
  await expect(checkedRows).toHaveCount(0)
  await expect(summary).toContainText('已选择 20 项')

  await page.locator('.el-pagination button.btn-prev').click()
  await expect(firstRow.getByRole('checkbox', { name: 'Select this row' })).toBeChecked()
  const clear = page.getByRole('button', { name: '取消选择', exact: true })
  await clear.press('Enter')
  await expect(firstRow.getByRole('checkbox', { name: 'Select this row' })).not.toBeChecked()
  await expect(summary).not.toBeVisible()
  await expect(pageAll).toBeFocused()

  await page.keyboard.press('Space')
  await expect(summary).toContainText('已选择 20 项')
  if (hasTouch) await clear.tap()
  else await clear.click()
  await expect(summary).not.toBeVisible()
  await expect(pageAll).not.toBeFocused()
})
