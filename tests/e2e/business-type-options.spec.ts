import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test('菜单标题翻译、菜单与单据级联和可清空出入库标志', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const menus: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.split('/').pop()
    if (path === 'mdm_document_type') {
      const filter = url.searchParams.get('menu_ids') || ''
      menus.push(filter)
      return route.fulfill({
        json: filter.includes('business-page')
          ? [
              {
                id: 'document-type',
                tenant_id: 'test-tenant',
                document_type_code: 'TEST',
                document_type_name: '测试业务单据',
                menu_ids: ['business-page'],
                enabled: true
              }
            ]
          : []
      })
    }
    if (path === 'sys_dictionary' && url.search.includes('mdmStockMovementDirection'))
      return route.fulfill({
        json: [
          {
            id: 'dict-inbound',
            type_id: 'dict-type',
            code: 'inbound',
            label: '入库',
            value: 'inbound',
            status: '1',
            dict_type_table: { code: 'mdmStockMovementDirection', name: '出入库标志' }
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/business-type-options.html')
  await page.getByRole('button', { name: '新增业务类型', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增业务类型' })
  await dialog
    .getByRole('combobox', { name: '所属菜单功能', exact: false })
    .locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')
    .click()
  await page
    .getByRole('treeitem', { name: '系统管理', exact: false })
    .locator('.el-tree-node__expand-icon')
    .first()
    .click()
  await expect(page.getByText('个人中心', { exact: true })).toBeVisible()
  await expect(page.getByText('menus.system.userCenter', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('translated-menu.png'),
    animations: 'disabled'
  })
  await page.getByText('测试业务功能', { exact: true }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => menus.some((value) => value.includes('business-page'))).toBe(true)
  await dialog
    .getByRole('combobox', { name: '所属单据类型', exact: false })
    .locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')
    .click()
  await expect(page.getByRole('option', { name: '测试业务单据 · TEST', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  const movement = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('出入库标志', { exact: true }) })
  await movement.locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: '入库', exact: true }).click()
  await movement.hover()
  await movement.locator('.el-select__clear').click()
  await expect(movement.getByRole('combobox')).toHaveValue('')
})
