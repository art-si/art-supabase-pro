import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const area of ['销售', '采购']) {
  test(`期初${area}退货负数数据回显为红色正数，数量编辑不被清零`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/sys_menu?*', (route) =>
      route.fulfill({ json: { id: 'menu-test' } })
    )
    await page.goto(
      '/tests/e2e/fixtures/wms-document-serials.html?salesKind=initial_return&purchaseKind=initial_return&openingReturnValues=true'
    )
    await page.getByRole('button', { name: `查看${area}单据`, exact: true }).click()
    const drawer = page.locator('.el-drawer:visible')
    const cells = drawer.locator('.el-table__body td.opening-return-value-cell')
    await expect(cells).toHaveCount(7)
    for (const [index, value] of ['2', '4', '6', '8', '1.00', '20.00', '22.60'].entries()) {
      await expect(cells.nth(index)).toContainText(value)
      expect(
        await cells
          .nth(index)
          .evaluate((node) => getComputedStyle(node.querySelector('.cell')!).color)
      ).not.toBe('rgb(0, 0, 0)')
    }
    await cells.first().scrollIntoViewIfNeeded()
    expect(await drawer.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
    await page.screenshot({
      path: testInfo.outputPath(`opening-${area}-return-view.png`),
      animations: 'disabled'
    })
    await cells.last().scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`opening-${area}-return-financials.png`),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: `打开${area}单据`, exact: true }).click()
    const quantity = drawer.locator('td.opening-return-value-cell').first().getByRole('spinbutton')
    await expect(quantity).toHaveValue('2.0000')
    await quantity.fill('3')
    await quantity.blur()
    await expect(quantity).toHaveValue('3.0000')
    await page.screenshot({
      path: testInfo.outputPath(`opening-${area}-return-edit.png`),
      animations: 'disabled'
    })
  })
}
