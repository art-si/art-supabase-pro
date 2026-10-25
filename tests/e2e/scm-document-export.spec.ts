import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

for (const scenario of [
  {
    path: 'sales-management/sales-order',
    name: 'ScmSalesOrder',
    title: '销售订单',
    table: 'scm_sales_document',
    kind: 'sales_order'
  },
  {
    path: 'purchase-management/purchase-order',
    name: 'ScmPurchaseOrder',
    title: '采购订单',
    table: 'scm_purchase_document',
    kind: 'purchase_order'
  }
]) {
  test(`${scenario.title}两种展示模式完整导出跨页数据`, async ({ page }) => {
    test.setTimeout(180_000)
    await installFixtures(page)
    const menu = {
      id: `export-${scenario.name}`,
      parentId: null,
      name: scenario.name,
      path: `/scm/${scenario.path}`,
      component: `/scm/${scenario.path}`,
      type: 'menu',
      sort: 1,
      meta: meta(scenario.title)
    }
    const buttons = ['View', 'Export'].map((action) => ({
      id: `${menu.id}-${action}`,
      parentId: menu.id,
      name: `${scenario.name}:${action}`,
      path: '',
      component: '',
      type: 'button',
      sort: 1,
      meta: meta(action)
    }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '测试平台', baseUrl: '/' },
          { code: 'scm', name: 'SCM供应链管理', baseUrl: '/scm/' }
        ]
      })
    )
    await mockApplicationMenus(page, { scm: [menu, ...buttons] })
    const documents = Array.from({ length: 1001 }, (_, index) => ({
      id: `document-${index}`,
      tenant_id: tenantId,
      kind: scenario.kind,
      document_no: `EXPORT-${String(index).padStart(4, '0')}`,
      document_date: '2026-10-04',
      status: 'draft',
      details: {},
      subtotal: 2,
      tax_amount: 0,
      total_amount: 2,
      lines: [0, 1].map((line) => ({
        line_id: `line-${index}-${line}`,
        line_no: line + 1,
        material_code: `M-${index}-${line}`,
        material_description: '跨页导出物料',
        quantity: 1,
        unit_price: 1,
        amount: 1,
        tax_amount: 0,
        total_amount: 1
      }))
    }))
    const offsets: number[] = []
    await page.route(`**/rest/v1/${scenario.table}?*`, (route) => {
      const params = new URL(route.request().url()).searchParams
      expect(params.get('kind')).toBe(`eq.${scenario.kind}`)
      expect(params.get('order')).toBe('updated_at.desc,id.asc')
      const offset = Number(params.get('offset') || 0)
      const limit = Math.min(Number(params.get('limit') || 1000), 1000)
      offsets.push(offset)
      const scopedDocuments = params.has('id')
        ? documents.filter((row) => params.get('id') === `eq.${row.id}`)
        : documents
      const data = scopedDocuments.slice(offset, offset + limit)
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': `${offset}-${offset + data.length - 1}/${scopedDocuments.length}`,
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto(`#/scm/${scenario.path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
      timeout: 120_000
    })
    const documentMode = page.locator('.el-radio-button').filter({ hasText: '按单据' })
    if (!(await documentMode.isVisible())) {
      await page.getByRole('button', { name: '展开搜索条件', exact: true }).click()
    }
    await expect(documentMode).toBeVisible()
    for (const mode of ['按单据', '按明细']) {
      await page.locator('.el-radio-button').filter({ hasText: mode }).click()
      await expect(page.getByRole('radio', { name: mode, exact: true })).toBeChecked()
      const body = page.locator('.el-table__body-wrapper').first()
      await expect(body.getByText('EXPORT-0000', { exact: true }).first()).toBeVisible()
      if (mode === '按明细') {
        await expect(body.getByText('M-0-0', { exact: true })).toHaveCount(1)
        await expect(body.getByText('M-9-1', { exact: true })).toHaveCount(1)
      }
      await expect(body.locator('tr.el-table__row')).toHaveCount(20)
      const listBeforeExport = await body.innerText()
      offsets.length = 0
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出', exact: true }).click()
      const path = await (await downloadPromise).path()
      expect(path).not.toBeNull()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(path!)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(mode === '按单据' ? 1002 : 2003)
      expect(sheet.getCell('A2').text).toBe('EXPORT-0000')
      expect(sheet.getCell(`A${sheet.rowCount}`).text).toBe('EXPORT-1000')
      expect(offsets).toContain(1000)
      if (mode === '按明细') {
        const materialCodes: string[] = []
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) materialCodes.push(row.getCell(3).text)
        })
        expect(new Set(materialCodes).size).toBe(2002)
      }
      await expect.poll(() => body.innerText()).toBe(listBeforeExport)
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await expect(
        body.getByText(mode === '按单据' ? 'EXPORT-0020' : 'EXPORT-0010', { exact: true }).first()
      ).toBeVisible()
      await expect(body.getByText('EXPORT-0000', { exact: true })).toHaveCount(0)
      await expect(body.locator('tr.el-table__row')).toHaveCount(20)
      await page.getByRole('button', { name: '上一页', exact: true }).click()
      await expect(body.getByText('EXPORT-0000', { exact: true }).first()).toBeVisible()
    }
    await documentMode.click()
    await expect(page.getByRole('radio', { name: '按单据', exact: true })).toBeChecked()
    const documentRows = page.locator('.el-table__body-wrapper').first().locator('tr.el-table__row')
    await expect(documentRows).toHaveCount(20)
    await expect(documentRows.nth(19)).toContainText('EXPORT-0019')
    const identifiers = (await documentRows.allTextContents()).map(
      (text) => text.match(/EXPORT-\d{4}/)?.[0]
    )
    expect(identifiers.every(Boolean)).toBe(true)
    expect(new Set(identifiers).size).toBe(20)
    if (scenario.kind === 'purchase_order') {
      await page.goto(
        `#/scm/${scenario.path}?fromMasterDelete=1&dependencyCode=scm_purchase_document&recordId=document-0&resourceId=supplier-1`
      )
      await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
      await expect(documentRows).toHaveCount(1)
      await expect(documentRows).toContainText('EXPORT-0000')
      await expect(documentRows).not.toContainText('EXPORT-0001')
      await page.getByRole('button', { name: '清除定位', exact: true }).click()
      await expect(documentRows).toHaveCount(20)
      await expect(page.locator('.master-delete-notice')).toHaveCount(0)
    }
  })
}
