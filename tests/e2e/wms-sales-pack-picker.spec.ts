import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('销售库存选单按包号展示、搜索并带入垛包', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const keywords: Array<string | null> = []
  await page.route('**/rest/v1/rpc/wms_sales_choices_secure', (route) => {
    const payload = route.request().postDataJSON() as { p_keyword?: string | null }
    keywords.push(payload.p_keyword ?? null)
    return route.fulfill({
      json: {
        data: [
          {
            id: 'stock-pack-1',
            source_document_id: null,
            source_line_id: null,
            document_no: null,
            document_type: null,
            line_no: null,
            customer_id: null,
            customer_name: null,
            material_code: 'MAT-PACK-001',
            material_description: '已入库垛包成品',
            specification_model: '1200×600',
            drawing_no: 'DRAW-PACK-001',
            brand: null,
            project_name: '包号追溯项目',
            construction_no: 'PACK-SECTION',
            sales_order_quantity: null,
            shipping_notice_quantity: null,
            outbound_quantity: 0,
            returned_quantity: 0,
            deliverable_quantity: 5,
            inventory_quantity: 5,
            inventory_unit: '件',
            available_quantity: 5,
            allocated_quantity: 0,
            batch_no: 'BATCH-PACK-001',
            pack_no: 'PACK-QA-001',
            serial_nos: [],
            unit_price: 100,
            tax_rate: 13,
            warehouse_name: '成品仓',
            zone_name: '成品区',
            bin_name: 'A-01',
            keeper_name: '测试仓管',
            material_source: 'production',
            contract_no: null,
            material: {
              id: 'material-pack-1',
              material_code: 'MAT-PACK-001',
              material_name: '已入库垛包成品'
            },
            line: {
              warehouse_id: 'd97f5bc1-73c4-4617-9225-b0af0327875f',
              stock_batch_id: 'stock-pack-1',
              stock_status: 'available',
              stock_type: 'normal'
            }
          }
        ],
        total: 1
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-sales-pack-picker.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开库存选单' }).click()
  const picker = page.getByRole('dialog', { name: '选择出库库存' })
  await expect(picker.getByRole('columnheader', { name: '包号', exact: true })).toBeAttached()
  const packNo = picker.locator('.el-table__body').getByText('PACK-QA-001', { exact: true })
  await packNo.scrollIntoViewIfNeeded()
  await expect(packNo).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('sales-stock-pack-no.png'),
    animations: 'disabled'
  })
  await picker.getByPlaceholder('请输入关键词').fill('PACK-QA-001')
  await picker.getByPlaceholder('请输入关键词').press('Enter')
  await expect.poll(() => keywords.at(-1)).toBe('PACK-QA-001')
  await picker.locator('.el-table__body .el-checkbox__inner').first().click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('#selected-packs')).toHaveText('PACK-QA-001')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
