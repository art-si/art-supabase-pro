import { expect, test } from '@playwright/test'
import { installFixtures } from './support/inventory-fixtures'
import { assertAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 180_000 })

for (const kind of ['stock', 'movement', 'ledger', 'receipt-issue'] as const) {
  test(`${kind}显示混长包原始明细且保持报表行与数量粒度`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
      route.fulfill({ json: { enabled: false, profiles: [] } })
    )
    const appearance = {
      theme: testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light',
      boxBorderMode: !testInfo.project.name.includes('shadow')
    } as const
    const packed = {
      id: 'packed-row',
      batch_id: 'packed-batch',
      material_code: 'PACK-MAT',
      material_name: '混长包板材',
      warehouse_id: 'warehouse-test',
      warehouse_name: '测试仓库',
      inventory_quantity: 5,
      opening_quantity: 2,
      inbound_quantity: 5,
      outbound_quantity: 2,
      closing_quantity: 5,
      pack_no: 'PK-0007',
      pack_area: '一号区域',
      pack_details: [
        { board_id: 'board-long', area: '一号区域', board_no: 'A-01', length_mm: 8000, pieces: 2 },
        { board_id: 'board-short', area: '一号区域', board_no: 'A-02', length_mm: 6000, pieces: 3 }
      ]
    }
    const unlinked = {
      ...packed,
      id: 'unlinked-row',
      batch_id: 'unlinked-batch',
      material_code: 'PLAIN-MAT',
      material_name: '普通物料',
      inventory_quantity: 4,
      closing_quantity: 4,
      pack_no: null,
      pack_area: null,
      pack_details: []
    }
    await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) =>
      route.fulfill({ json: { data: [packed, unlinked], total: 2, navigation: [] } })
    )
    await page.goto(
      `/tests/e2e/fixtures/wms-inventory-report.html?kind=${kind}&authority=super&theme=${appearance.theme}&box=${appearance.boxBorderMode ? 'border-mode' : 'shadow-mode'}`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 120_000
      }
    )
    await assertAppearance(page, appearance)
    const table = page.locator('.inventory-report-workspace .art-table-query')
    await expect(table.getByText('PACK-MAT', { exact: true })).toBeVisible({ timeout: 120_000 })
    const headers = table.locator('.el-table__header-wrapper th')
    for (const label of ['包号', '区域', '编号', '长度 mm', '块数']) {
      await expect(headers.getByText(label, { exact: true })).toHaveCount(1)
    }
    const rows = table.locator('.el-table__body tr')
    await expect(rows).toHaveCount(2)
    async function columnCells(label: string) {
      const columnClass = await headers
        .getByText(label, { exact: true })
        .locator('xpath=ancestor::th[1]')
        .evaluate((header) =>
          Array.from(header.classList).find((value) => /^el-table_.*_column_/.test(value))
        )
      expect(columnClass).toBeTruthy()
      return rows.locator(`td.${columnClass}`)
    }
    await expect((await columnCells('包号')).nth(0)).toHaveText('PK-0007')
    await expect((await columnCells('区域')).nth(0)).toHaveText('一号区域')
    await expect((await columnCells('编号')).nth(0)).toHaveText(/A-01\s*A-02/)
    await expect((await columnCells('长度 mm')).nth(0)).toHaveText(/8,?000\s*6,?000/)
    await expect((await columnCells('块数')).nth(0)).toHaveText(/2\s*3/)
    for (const label of ['包号', '区域', '编号', '长度 mm', '块数']) {
      await expect((await columnCells(label)).nth(1)).toHaveText('—')
    }
    const piecesCell = (await columnCells('块数')).nth(0)
    await piecesCell.scrollIntoViewIfNeeded()
    await expect(piecesCell).toBeInViewport()
    const piecesHint = table.getByRole('button', { name: '块数填写说明' })
    await piecesHint.hover()
    await expect(page.getByText(/原始排包组成的块数/)).toBeVisible()
    await page.mouse.move(10, 10)
    await expect(page.getByText(/原始排包组成的块数/)).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false
    )
    await page.screenshot({ path: testInfo.outputPath(`inventory-${kind}-package.png`) })
    expect(errors).toEqual([])
  })
}
