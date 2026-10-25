import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test('调拨申请只读详情长数量保持完整单行', async ({ page }, testInfo) => {
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() !== 'GET') writes++
    const table = new URL(route.request().url()).pathname.split('/').pop()
    return route.fulfill({
      json:
        table === 'sys_menu'
          ? { id: 'menu-test' }
          : table === 'wms_transfer_request_list'
            ? [
                {
                  document_id: 'document-test',
                  line_id: 'line-test',
                  tenant_id: 'tenant-test',
                  document_no: 'TRANSFER-LONG',
                  status: 'draft',
                  line_no: 10,
                  application_date: '2026-10-07',
                  material_id: 'material-test',
                  material_code: 'MAT-TEST',
                  material_name: '长数量测试物料',
                  quantity: 12345678.1234,
                  base_quantity: 12345678.1234,
                  inventory_unit_name: '件',
                  base_unit_name: '件',
                  auxiliary_quantity: 12345678.1234,
                  auxiliary_quantity2: 12345678.1234,
                  source_warehouse_name: '调出测试仓库',
                  target_warehouse_name: '调入测试仓库',
                  stock_type: 'normal',
                  stock_status: 'available',
                  owner_type: 'self',
                  gift: false
                }
              ]
            : []
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试调拨申请 view', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '查看调拨申请单', exact: true })
  await expect(drawer.getByRole('spinbutton')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
  await drawer.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  for (const label of ['数量', '基本数量', '辅助数量', '辅助数量2']) {
    const index = await drawer
      .getByRole('columnheader', { name: label, exact: true })
      .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
    const cell = drawer
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .nth(index)
      .locator('.cell')
    await expect(cell).toHaveText('12345678.1234')
    await cell.scrollIntoViewIfNeeded()
    await cell.evaluate((element) => {
      const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
      if (!(wrap instanceof HTMLElement)) throw new Error('详情滚动容器缺失')
      const visibleLeft = Math.max(
        wrap.getBoundingClientRect().left,
        ...Array.from(
          element.closest('tr')?.querySelectorAll('.el-table-fixed-column--left') ?? []
        ).map((fixedCell) => fixedCell.getBoundingClientRect().right)
      )
      wrap.scrollLeft += element.getBoundingClientRect().left - visibleLeft - 16
    })
    await expect
      .poll(() =>
        cell.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return element.contains(
            document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          )
        })
      )
      .toBe(true)
    expect(
      await cell.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const lines = new Set(
          Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))
        )
        return lines.size === 1 && element.scrollWidth <= element.clientWidth
      })
    ).toBe(true)
    await expect(cell).toBeInViewport({ ratio: 1 })
    await cell.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await page.screenshot({
      path: testInfo.outputPath(`${label}-readonly.png`),
      animations: 'allow'
    })
  }
  expect(writes).toBe(0)
})
