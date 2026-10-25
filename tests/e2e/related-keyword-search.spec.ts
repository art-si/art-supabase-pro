import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test('销售退货关联搜索直接筛选通知并保留分页', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    requests.push(url.pathname)
    expect(url.pathname).toBe('/rest/v1/wms_sales_outbound_allocation')
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('shippingNotice.tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('shippingNotice.kind')).toBe('eq.shipping_notice')
    expect(url.searchParams.get('shippingNotice.or')).toBe('(document_no.ilike."%测试,(材料)%")')
    expect(url.searchParams.get('shipping_notice_id')).toBeNull()
    expect(url.searchParams.get('select')).toContain('shipping_notice_id_fkey!inner(')
    expect(url.searchParams.get('offset')).toBe('1000')
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.asc')
    expect(route.request().headers().prefer).toContain('count=exact')
    return route.fulfill({
      headers: {
        'content-range': '1000-1000/1201',
        'access-control-expose-headers': 'content-range'
      },
      json: [{ id: 'result-1000' }]
    })
  })
  await page.goto('/tests/e2e/fixtures/related-keyword-search.html?mode=sales-return')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByTestId('result')).toHaveText('1201:1:result-1000')
  expect(requests).toEqual(['/rest/v1/wms_sales_outbound_allocation'])
})

for (const [mode, table] of [
  ['bom', 'mdm_bom'],
  ['task', 'mes_operation_task'],
  ['report', 'mes_production_report'],
  ['event', 'mes_execution_event']
]) {
  test(`${mode} 关联搜索一次请求且保留分页与租户`, async ({ page }) => {
    const requests: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      requests.push(url.pathname)
      expect(url.pathname).toBe(`/rest/v1/${table}`)
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      expect(url.searchParams.get('offset')).toBe('1000')
      expect(url.searchParams.get('limit')).toBe('50')
      expect(url.searchParams.get('order')).toContain('id.asc')
      const select = url.searchParams.get('select') ?? ''
      const rootFilters = url.searchParams.getAll('or').join(',')
      expect(rootFilters).not.toContain('_id.in.')
      expect(rootFilters).toContain('测试,(材料)')
      expect(select).toContain(
        mode === 'bom' ? 'materialSearch:' : mode === 'task' ? 'orderSearch:' : 'taskSearch:'
      )
      const alias =
        mode === 'bom'
          ? 'materialSearch'
          : mode === 'task'
            ? 'orderSearch'
            : 'taskSearch.orderSearch'
      expect(url.searchParams.get(`${alias}.tenant_id`)).toBe('eq.tenant-a')
      expect(url.searchParams.get(`${alias}.or`)).toContain('测试,(材料)')
      if (mode === 'task') expect(rootFilters).toContain('and(or(')
      return route.fulfill({
        headers: {
          'content-range': '1000-1000/1201',
          'access-control-expose-headers': 'content-range'
        },
        json: [{ id: 'result-1000', items: [] }]
      })
    })
    await page.goto(`/tests/e2e/fixtures/related-keyword-search.html?mode=${mode}`)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await expect(page.getByTestId('result')).toHaveText('1201:1:result-1000')
    expect(requests).toEqual([`/rest/v1/${table}`])
  })
}
