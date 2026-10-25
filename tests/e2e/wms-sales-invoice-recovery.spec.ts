import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('已打开的发票页连续承接两张新草稿后刷新列表', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const invoices = [1, 2, 3].map((number) => ({
    id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${number}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    document_no: `QA-LINK-INVOICE-${number}`,
    invoice_type: number === 3 ? 'special' : 'ordinary',
    red_letter: number === 3,
    issue_date: '2026-10-12',
    remark: `承接草稿 ${number}`,
    created_at: '2026-10-12T00:00:00Z',
    customer: { customer_name: '验收客户' },
    source: { document_no: `QA-LINK-SOURCE-${number}`, kind: number === 3 ? 'return' : 'outbound' },
    lines: []
  }))
  let available = 1
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name !== 'wms_sales_invoice')
      return route.fulfill({ json: name === 'sys_menu' ? { id: 'test-menu' } : [] })
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    if (id) return route.fulfill({ json: invoices.find((invoice) => invoice.id === id) })
    return route.fulfill({
      json: invoices.slice(0, available),
      headers: {
        'content-range': `0-${available - 1}/${available}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/wms-bulk-delete.html?kind=invoice&routeDocumentIds=${invoices
      .slice(1)
      .map((invoice) => invoice.id)
      .join(',')}`
  )
  const rows = page.locator('.art-table-query .el-table__body tr')
  await expect(rows).toHaveCount(1)
  for (const [index, invoice] of invoices.slice(1).entries()) {
    available++
    await page.getByTestId(`open-linked-document-${index + 1}`).click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toContainText(invoice.document_no)
    await expect(rows).toHaveCount(available)
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
    await expect(rows.filter({ hasText: invoice.document_no })).toBeVisible()
  }
  await page.screenshot({ path: info.outputPath('invoice-linked-list-refreshed.png') })
})

test('两条销售发票草稿加载重试及保存失败恢复', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  let listFailed = true
  let saveFailed = true
  let writes = 0
  const invoices = [1, 2].map((number) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${number}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    document_no: `QA-INVOICE-00${number}`,
    invoice_type: number === 1 ? 'ordinary' : 'special',
    red_letter: number === 2,
    issue_date: '2026-10-12',
    remark: `测试草稿 ${number}`,
    created_at: '2026-10-12T00:00:00Z',
    customer: { customer_name: '验收客户' },
    source: { document_no: `QA-SOURCE-00${number}`, kind: number === 1 ? 'outbound' : 'return' },
    lines: [
      {
        id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${number}`,
        quantity: number === 1 ? 2 : -1,
        amount: number === 1 ? 200 : -100,
        tax_amount: number === 1 ? 26 : -13,
        total_amount: number === 1 ? 226 : -113,
        source: {
          line_no: 10,
          material: { material_code: `MAT-00${number}`, description: '验收物料' },
          inventory_unit: { unit_name: '件' },
          unit_price: 100,
          tax_rate: 13
        }
      }
    ]
  }))
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'wms_sales_invoice') {
      if (listFailed)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'internal database failure' }
        })
      return route.fulfill({
        json: invoices,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    }
    if (name === 'wms_edit_sales_invoice_secure') {
      writes++
      if (saveFailed)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'internal database failure' }
        })
      const body = route.request().postDataJSON() as { p_id: string; p_remark: string }
      const invoice = invoices.find((item) => item.id === body.p_id)
      expect(invoice).toBeTruthy()
      invoice!.remark = body.p_remark
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({ json: name === 'sys_menu' ? { id: 'test-menu' } : [] })
  })
  await page.goto('/tests/e2e/fixtures/wms-bulk-delete.html?kind=invoice')
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('internal database failure', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('invoice-list-error.png') })
  listFailed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  const rows = page.locator('.art-table-query .el-table__body tr')
  await expect(rows).toHaveCount(2)
  await rows.first().getByRole('button', { name: /编辑/ }).click()
  const drawer = page.locator('.el-drawer:visible')
  const remark = drawer.getByRole('textbox', { name: '备注', exact: true })
  await remark.fill('保存失败后保留的验收备注')
  await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => writes).toBe(1)
  await expect(drawer).toBeVisible()
  await expect(remark).toHaveValue('保存失败后保留的验收备注')
  await expect(drawer.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled()
  await expect(page.getByText('internal database failure', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('invoice-save-error.png') })
  saveFailed = false
  await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect.poll(() => writes).toBe(2)
  await expect(rows).toHaveCount(2)
  await rows.first().getByRole('button', { name: /编辑/ }).click()
  await expect(remark).toHaveValue('保存失败后保留的验收备注')
  await page.screenshot({ path: info.outputPath('invoice-save-recovered.png') })
})
