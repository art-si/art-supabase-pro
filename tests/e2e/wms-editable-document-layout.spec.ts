import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const scenarios = [
  ['打开初始库存单', '', '初始库存'],
  ...[
    'initial_outbound',
    'initial_return',
    'outbound',
    'return',
    'other_outbound',
    'other_return'
  ].map((kind) => ['打开销售单据', `?salesKind=${kind}`, `销售-${kind}`]),
  ...[
    'initial_inbound',
    'initial_return',
    'purchase_inbound',
    'purchase_return',
    'other_inbound',
    'other_return',
    'entrusted_processing_inbound',
    'entrusted_processing_return'
  ].map((kind) => ['打开采购单据', `?purchaseKind=${kind}`, `采购-${kind}`])
]
for (const [trigger, query, label] of scenarios) {
  test(`${label}复制明细后下拉控件占满列宽`, async ({ page }, testInfo) => {
    const uniqueReturn = ['采购-purchase_return', '采购-entrusted_processing_return'].includes(
      label
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(
      `/tests/e2e/fixtures/wms-document-serials.html${query}${query ? '&' : '?'}withoutSerial=true${uniqueReturn ? '&layoutRows=10' : ''}`
    )
    if (testInfo.project.name.includes('dark')) {
      await page.evaluate(() => document.documentElement.classList.add('dark'))
    }
    if (testInfo.project.name.includes('shadow')) {
      await page.evaluate(() =>
        document.documentElement.setAttribute('data-box-mode', 'shadow-mode')
      )
    }
    await page.getByRole('button', { name: trigger, exact: true }).click()
    const drawer = page.locator('.el-drawer:visible')
    const table = drawer.locator('.art-table.wms-editable-line-table')
    await expect(table.locator('.el-table__body tr')).toHaveCount(uniqueReturn ? 10 : 1)
    await table.getByRole('button', { name: '更多操作', exact: true }).first().click()
    await page.getByRole('menuitem', { name: '复制明细', exact: true }).click()
    await expect(table.locator('.el-table__body tr')).toHaveCount(uniqueReturn ? 10 : 2)
    if (uniqueReturn) await expect(page.getByText('同一退货单不能重复添加物料')).toBeVisible()
    if (testInfo.project.name.includes('mobile')) {
      await expect(
        table.locator('td.el-table-fixed-column--left, td.el-table-fixed-column--right')
      ).toHaveCount(0)
    }
    const widths = await table.evaluate((el) => {
      const headers = Array.from(el.querySelectorAll('.el-table__header th')).map((cell) =>
        cell.textContent?.replace(/^\s*\*\s*|\s*（必填）\s*$/g, '').trim()
      )
      return Array.from(el.querySelectorAll('.el-table__body tr')).flatMap((row) =>
        ['库存类型', '库存状态', '货主类型'].map((label) => {
          const index = headers.indexOf(label)
          const cell = row.querySelectorAll('td')[index]
          const control = cell?.querySelector('.el-select')
          return {
            label,
            width: control?.getBoundingClientRect().width || 0,
            ratio:
              cell && control
                ? control.getBoundingClientRect().width / cell.getBoundingClientRect().width
                : 0
          }
        })
      )
    })
    expect(widths).toHaveLength(uniqueReturn ? 30 : 6)
    for (const field of widths) {
      expect(field.ratio, field.label).toBeGreaterThan(0.7)
      expect(field.width, field.label).toBeGreaterThan(100)
    }
    await table
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .filter({ has: page.locator('.el-select') })
      .last()
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('wms-editor-width.png'),
      animations: 'disabled'
    })
    const operation = table.getByRole('columnheader', { name: '操作', exact: true })
    await expect
      .poll(async () => (await operation.boundingBox())?.width || 0)
      .toBeLessThanOrEqual(80)
    const originalWidth = (await operation.boundingBox())!.width
    for (let count = uniqueReturn ? 10 : 2; count < 10; count++) {
      await table.getByRole('button', { name: '更多操作', exact: true }).first().click()
      await page.getByRole('menuitem', { name: '复制明细', exact: true }).click()
      await expect(table.locator('.el-table__body tr')).toHaveCount(count + 1)
    }
    for (let count = 10; count > 1; count--) {
      await table.getByRole('button', { name: '更多操作', exact: true }).first().click()
      await page.getByRole('menuitem', { name: '删除明细', exact: true }).click()
      await expect(table.locator('.el-table__body tr')).toHaveCount(count - 1)
      await expect
        .poll(async () => (await operation.boundingBox())?.width || 0)
        .toBeLessThanOrEqual(originalWidth + 1)
    }
    await page.screenshot({
      path: testInfo.outputPath('wms-operation-after-nine-deletions.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await expect(drawer).not.toBeVisible()
    expect(errors).toEqual([])
  })
}

for (const [trigger, query] of [
  ['打开销售单据', '?salesKind=return'],
  ['打开采购单据', '?purchaseKind=purchase_inbound']
]) {
  test(`${trigger}序列号与更多按钮保留紧凑宽度`, async ({ page }) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(`/tests/e2e/fixtures/wms-document-serials.html${query}&twoLines=true`)
    await page.getByRole('button', { name: trigger, exact: true }).click()
    const table = page.locator('.el-drawer:visible .art-table.wms-editable-line-table')
    await expect(table.locator('.el-table__body tr')).toHaveCount(2)
    const operation = table.getByRole('columnheader', { name: '操作', exact: true })
    await expect
      .poll(async () => (await operation.boundingBox())?.width || 0)
      .toBeLessThanOrEqual(150)
    const initialWidth = (await operation.boundingBox())!.width
    await table.getByRole('button', { name: '更多操作', exact: true }).first().click()
    await page.getByRole('menuitem', { name: '删除明细', exact: true }).click()
    await expect(table.locator('.el-table__body tr')).toHaveCount(1)
    await expect
      .poll(async () => (await operation.boundingBox())?.width || 0)
      .toBeLessThanOrEqual(initialWidth + 1)
    const button = table.getByRole('button', { name: /序列号/ }).first()
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeInViewport()
    await expect(table.getByRole('button', { name: '更多操作', exact: true })).toBeInViewport()
  })
}
