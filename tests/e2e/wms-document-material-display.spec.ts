import { expect, test } from '@playwright/test'

for (const family of ['初始库存', '销售', '采购']) {
  test(`${family}详情缺失物料与仅编码显示`, async ({ page }, testInfo) => {
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() !== 'GET') writes += 1
      const menu = new URL(route.request().url()).pathname.endsWith('/sys_menu')
      return route.fulfill({
        json: menu ? { id: 'variant-menu' } : [],
        headers: { 'content-range': '*/0' }
      })
    })
    await page.goto(
      '/tests/e2e/fixtures/wms-document-serials.html?twoLines=true&missingMaterial=true'
    )
    await page
      .getByRole('button', {
        name: `查看${family}${family === '初始库存' ? '单' : '单据'}`,
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer:visible')
    const body = drawer.locator('.el-table__body')
    await expect(body.getByText('物料资料不可用', { exact: true })).toBeVisible()
    await expect(body.getByText('CODE-ONLY-DOCUMENT', { exact: true }).first()).toBeVisible()
    await expect(body).not.toContainText('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')
    await body.getByText('物料资料不可用', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('document-material-fallback.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: 'Close this dialog', exact: true }).click()
    await expect(drawer).toBeHidden()
    expect(writes).toBe(0)
  })
}

for (const family of ['初始库存', '销售', '采购']) {
  test(`${family}详情仓位名称与缺失资料显示`, async ({ page }, testInfo) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html?twoLines=true&binDisplay=true')
    await page
      .getByRole('button', {
        name: `查看${family}${family === '初始库存' ? '单' : '单据'}`,
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer:visible')
    const missing = drawer.getByText('仓位资料不可用', { exact: true })
    await expect(missing).toBeVisible()
    await expect(drawer.getByText('可识别测试仓位', { exact: true })).toBeVisible()
    await expect(drawer).not.toContainText('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb')
    await expect(drawer).not.toContainText('cccccccc-1111-4111-8111-cccccccccccc')
    await missing.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('stock-bin-display.png'),
      animations: 'disabled'
    })
  })
}

for (const family of ['销售', '采购']) {
  test(`${family}详情关联仓位从接口映射到显示`, async ({ page }, testInfo) => {
    let detailReads = 0
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const table = family === '销售' ? 'wms_sales_document' : 'wms_purchase_document'
      if (url.pathname.endsWith(`/${table}`)) {
        detailReads++
        expect(url.searchParams.get('select')).toContain(
          `bin:mdm_warehouse_bin!${table}_line_bin_id_fkey(bin_name,bin_code)`
        )
        return route.fulfill({
          json: {
            id: '11111111-2222-4222-8222-111111111111',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            document_no: 'BIN-API-DOC',
            organization_id: '33333333-3333-4333-8333-333333333333',
            kind: family === '销售' ? 'initial_outbound' : 'initial_inbound',
            status: 'draft',
            is_initialization: true,
            business_date: '2026-10-01',
            accounting_date: '2026-10-02',
            lines: [0, 1].map((index) => ({
              line_no: index + 1,
              material_id: 'test-material',
              quantity: 2,
              base_quantity: 2,
              amount: 20,
              tax_amount: 0,
              total_amount: 20,
              bin_id: `aaaaaaaa-1111-4111-8111-aaaaaaaaaaa${index}`,
              bin: index ? null : { bin_name: '接口仓位名称', bin_code: 'API-BIN' },
              material: { name: '接口测试物料', code: 'API-MAT' },
              serial_nos: []
            }))
          }
        })
      }
      return route.fulfill({ json: url.pathname.endsWith('/sys_menu') ? { id: 'test-menu' } : [] })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html?loadFromApi=true')
    await page.getByRole('button', { name: `查看${family}单据`, exact: true }).click()
    const drawer = page.locator('.el-drawer:visible')
    const name = drawer.getByText('接口仓位名称', { exact: true })
    await expect(name).toBeVisible()
    await expect(drawer.getByText('仓位资料不可用', { exact: true })).toBeVisible()
    await expect(drawer).not.toContainText('aaaaaaaa-1111-4111-8111-aaaaaaaaaaa')
    expect(detailReads).toBe(1)
    await name.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('api-bin-display.png'),
      animations: 'disabled'
    })
  })
}
