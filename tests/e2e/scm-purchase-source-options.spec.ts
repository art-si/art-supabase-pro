import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const kind of ['purchase_contract', 'purchase_request']) {
  test(`采购来源完整分页及后页错误恢复 ${kind}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const offsets: number[] = []
    let failsLater = true
    await page.route('**/rest/v1/scm_purchase_document?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.get('kind') === 'eq.purchase_order') {
        expect(params.get('tenant_id')).toBe('in.(tenant-a)')
        return route.fulfill({ json: [] })
      }
      expect(params.get('kind')).toBe(`eq.${kind}`)
      expect(params.get('tenant_id')).toBe('eq.tenant-a')
      expect(params.get('order')).toBe('updated_at.desc,id.asc')
      const offset = Number(params.get('offset') || 0)
      offsets.push(offset)
      if (failsLater && offset === 500)
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      return route.fulfill({
        json: Array.from({ length: Math.min(500, 1001 - offset) }, (_, index) => ({
          id: `source-${offset + index}`,
          tenant_id: 'tenant-a',
          kind,
          document_no: `来源单据-${offset + index}`,
          supplier_id: offset + index === 1000 ? 'supplier-last' : null,
          lines: [{ line_id: `line-${offset + index}`, quantity: 5 }]
        }))
      })
    })
    let supplierReads = 0
    await page.route('**/rest/v1/rpc/scm_purchase_suppliers_secure', (route) => {
      supplierReads++
      expect(route.request().postDataJSON().p_ids).toEqual(['supplier-last'])
      return route.fulfill({ json: [{ id: 'supplier-last', supplier_name: '尾页供应商' }] })
    })
    const mode = kind === 'purchase_request' ? 'purchaseRequestSources' : 'purchaseSources'
    await page.goto(`/tests/e2e/fixtures/receipt-bin-options.html?mode=${mode}`)
    const output = page.getByTestId('bin-result')
    await page.getByRole('button', { name: '加载库位' }).click()
    await expect(output).toHaveText('查询失败')
    expect(offsets).toEqual([0, 500])
    expect(supplierReads).toBe(0)
    failsLater = false
    await page.getByRole('button', { name: '加载库位' }).click()
    await expect(output).toContainText('来源单据-1000')
    const result = JSON.parse(await output.innerText())
    expect(result.data).toHaveLength(1001)
    expect(result.data[1000].supplier.supplierName).toBe('尾页供应商')
    if (kind === 'purchase_request') expect(result.data[1000].lines[0].remainingQuantity).toBe(5)
    expect(offsets).toEqual([0, 500, 0, 500, 1000])
    expect(supplierReads).toBe(1)
    expect(errors).toEqual([])
  })
}
