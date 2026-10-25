import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('检验类别完整分页与虚拟选择', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const path = '/smis/equipment-ledger/inspection-declaration'
  const menu = {
    id: 'inspection-category-options',
    parentId: null,
    name: 'SmisInspectionDeclaration',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '检验申报', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }]
    })
  )
  await mockApplicationMenus(page, {
    smis: [
      menu,
      ...['View', 'Add'].map((action) => ({
        ...menu,
        id: `${menu.id}-${action}`,
        parentId: menu.id,
        name: `${menu.name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
  const records = Array.from({ length: 5001 }, (_, index) => ({
    id: `category-${index}`,
    categoryName: `测试检验类别${index}`,
    status: 'enabled'
  }))
  const offsets: number[] = []
  let missingPage = true
  let serverFailure = true
  await page.route('**/rest/v1/rpc/smis_list_inspection_categories_secure', (route) => {
    const query = route.request().postDataJSON()
    expect(query.p_status).toBe('enabled')
    expect(query.p_to - query.p_from + 1).toBe(500)
    offsets.push(query.p_from)
    if (serverFailure) {
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'database unavailable' }
      })
    }
    return route.fulfill({
      json: {
        records:
          missingPage && query.p_from === 500 ? [] : records.slice(query.p_from, query.p_to + 1),
        total: records.length
      }
    })
  })
  await page.route('**/rest/v1/rpc/smis_list_equipment_inspections_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0 } })
  )
  await page.goto(`#${path}`)
  const add = page.getByRole('button', { name: '新增检验申报', exact: true })
  await expect(add).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('检验类别加载失败，请重新加载', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '检验类别', exact: true })).toBeDisabled()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  serverFailure = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect.poll(() => offsets.includes(500)).toBe(true)
  await expect(page.getByText('检验类别加载失败，请重新加载', { exact: true })).toBeVisible()
  missingPage = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect.poll(() => offsets.includes(5000)).toBe(true)
  missingPage = true
  serverFailure = true
  await add.click()
  const dialog = page.getByRole('dialog', { name: '新增检验申报' })
  const input = dialog.getByRole('combobox', { name: /检验类别$/ })
  const loadError = dialog.getByText('检验类别加载失败，请重新加载', { exact: true })
  await expect(loadError).toBeVisible()
  await expect(input).toBeDisabled()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '创建检验申报', exact: true })).toBeDisabled()
  const remark = dialog.getByRole('textbox', { name: '备注', exact: true })
  await remark.fill('重试后保留的申报草稿')
  await loadError.scrollIntoViewIfNeeded()
  await dialog.screenshot({ path: testInfo.outputPath('inspection-category-error.png') })
  serverFailure = false
  const attemptsBeforeMissingPage = offsets.filter((offset) => offset === 500).length
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect
    .poll(() => offsets.filter((offset) => offset === 500).length)
    .toBeGreaterThan(attemptsBeforeMissingPage)
  await expect(loadError).toBeVisible()
  await expect(remark).toHaveValue('重试后保留的申报草稿')
  missingPage = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(input).toBeEnabled()
  await expect(remark).toHaveValue('重试后保留的申报草稿')
  await input.click()
  await input.fill('测试检验类别5000')
  await page.getByRole('option', { name: '测试检验类别5000', exact: true }).click()
  await expect(dialog.getByText('测试检验类别5000', { exact: true })).toBeVisible()
  await input.click()
  await input.fill('')
  await expect(page.getByRole('option').first()).toBeVisible()
  expect(await page.getByRole('option').count()).toBeLessThan(50)
  await input.fill('测试检验类别0')
  await page.getByRole('option', { name: '测试检验类别0', exact: true }).click()
  await expect(dialog.getByText('测试检验类别0', { exact: true })).toBeVisible()
  expect(offsets.filter((offset) => offset === 5000).length).toBeGreaterThanOrEqual(2)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ).toBeLessThanOrEqual(1)
  await dialog.screenshot({ path: testInfo.outputPath('inspection-category.png') })
})
