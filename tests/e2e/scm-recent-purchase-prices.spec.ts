import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of ['late', 'first-page', 'missing']) {
  test(`最近采购价分页 ${scenario}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const offsets: number[] = []
    let failurePending = scenario === 'late'
    await page.route('**/rest/v1/scm_purchase_document?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      expect(params.get('tenant_id')).toBe('eq.tenant-a')
      expect(params.get('kind')).toBe('eq.purchase_order')
      expect(params.get('status')).toBe('in.(approved,completed)')
      expect(params.get('order')).toBe('document_date.desc,created_at.desc,id.desc')
      const offset = Number(params.get('offset') || 0)
      offsets.push(offset)
      if (failurePending && offset === 500)
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      return route.fulfill({
        json: Array.from({ length: Math.min(500, 1001 - offset) }, (_, index) => {
          const position = offset + index
          return {
            lines: [
              { material_id: 'material-first', unit_price: position === 0 ? 0 : 99 },
              ...((scenario === 'first-page' && position === 0) ||
              (scenario === 'late' && position === 1000)
                ? [{ material_id: 'material-last', unit_price: 23 }]
                : [])
            ]
          }
        })
      })
    })
    await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=recentPrices')
    const output = page.getByTestId('bin-result')
    const load = page.getByRole('button', { name: '加载库位' })
    await load.click()
    if (scenario === 'late') {
      await expect(output).toHaveText('查询失败')
      expect(offsets).toEqual([0, 500])
      failurePending = false
      await load.click()
    }
    await expect(output).toContainText('material-first')
    expect(JSON.parse(await output.innerText())).toEqual(
      scenario === 'missing'
        ? { 'material-first': 0 }
        : { 'material-first': 0, 'material-last': 23 }
    )
    expect(offsets).toEqual(
      scenario === 'first-page'
        ? [0]
        : scenario === 'late'
          ? [0, 500, 0, 500, 1000]
          : [0, 500, 1000]
    )
    expect(errors).toEqual([])
  })
}

test('最近采购价空物料不发请求', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/scm_purchase_document?*', (route) => {
    requests++
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=emptyPrices')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toHaveText('{}')
  expect(requests).toBe(0)
})
