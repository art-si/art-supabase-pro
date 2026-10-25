import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test('全局滚动条、普通模式填充与操作列拖动空间', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html')
  const card = page.locator('.art-table-card')
  await expect(card).toBeVisible()
  await expect
    .poll(() => card.evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(17)
  const table = page.locator('.el-table')
  await table.hover()
  const vertical = table.locator('.el-scrollbar__bar.is-vertical')
  const horizontal = table.locator('.el-scrollbar__bar.is-horizontal')
  await expect(vertical).toHaveCSS('width', '6px')
  await expect(horizontal).toHaveCSS('height', '6px')
  await expect(table.locator('.el-scrollbar__bar.is-horizontal')).not.toHaveClass(/is-always/)
  const actions = table.locator('.business-table-row-actions').first()
  await expect(actions.getByRole('button')).toHaveCount(3)
  await expect(actions.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(1)
  await expect(actions.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  await actions.getByRole('button', { name: '更多操作', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toHaveCount(1)
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await expect(page.getByTestId('deleted-row')).toHaveText('0')

  expect(
    await actions.evaluate((el) => {
      const cell = el.closest('.el-table__cell')!
      return cell.getBoundingClientRect().right - el.getBoundingClientRect().right
    })
  ).toBeGreaterThanOrEqual(6)
  const wrap = table.locator('.el-table__body-wrapper .el-scrollbar__wrap')
  await table.hover()
  await expect(horizontal.locator('.el-scrollbar__thumb')).toBeVisible()
  const thumb = await horizontal.locator('.el-scrollbar__thumb').boundingBox()
  const bar = await horizontal.boundingBox()
  await page.mouse.move(thumb!.x + thumb!.width / 2, thumb!.y + thumb!.height / 2)
  await page.mouse.down()
  await page.mouse.move(bar!.x + bar!.width - 15, thumb!.y + thumb!.height / 2)
  await page.mouse.up()
  await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100)
  await page.screenshot({ path: testInfo.outputPath('normal-workspace.png') })
  await page.locator('.el-select').first().click()
  await expect(
    page.locator('.el-select-dropdown:visible .el-scrollbar__bar.is-vertical')
  ).toHaveCSS('width', '6px')
  await page.locator('.el-select-dropdown:visible').hover()
  await page.screenshot({ path: testInfo.outputPath('select-scrollbar.png') })
  await page.keyboard.press('Escape')
  await page.locator('.el-select').nth(1).click()
  await expect(
    page.locator('.el-tree-select__popper:visible .el-scrollbar__bar.is-vertical')
  ).toHaveCSS('width', '6px')
  await page.locator('.el-popper.el-tree-select__popper:visible').hover()
  await page.screenshot({ path: testInfo.outputPath('tree-scrollbar.png') })
})

test('发货通知单普通模式填满内容区', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=shipping')
  const card = page.locator('.art-table-card')
  await expect(card).toBeVisible()
  await expect
    .poll(() => card.evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(17)
  await page.screenshot({ path: testInfo.outputPath('shipping-normal.png') })
})

test('装卸地址选项紧凑显示且滚动条保留拖动尺寸', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/tms_list_customer_address_options_secure', (route) =>
    route.fulfill({
      json: Array.from({ length: 10 }, (_, i) => ({
        id: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
        customer_id: null,
        address_type: 'shipping',
        customer: { customer_name: `测试企业长名称地址选项 ${i + 1}` },
        contact_name: '测试联系人',
        contact_phone: '13800138000',
        region: '北京市',
        address_detail: '测试详细地址，用于确认长文字不会撑高选项'
      }))
    })
  )
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html')
  await page.getByRole('button', { name: '打开地址表单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增常用线路', exact: true })
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('combobox', { name: /装货地址/ })
    .locator('..')
    .click()
  const popper = page.locator('.el-popper.favorite-route-address-popper:visible')
  await expect(popper.getByRole('option')).toHaveCount(10)
  const height = await popper
    .getByRole('option')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height)
  expect(height).toBeGreaterThanOrEqual(68)
  expect(height).toBeLessThanOrEqual(76)
  await popper.hover()
  await expect(popper.locator('.el-scrollbar__bar.is-vertical')).toHaveCSS('width', '6px')
  await page.screenshot({ path: testInfo.outputPath('address-options.png') })
})
