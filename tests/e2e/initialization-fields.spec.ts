import { test, expect } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
for (const kind of [
  'stock',
  'sales-outbound',
  'sales-return',
  'purchase-inbound',
  'purchase-return'
]) {
  test(`${kind} shows document classification and personnel in both display modes`, async ({
    page
  }, info) => {
    test.setTimeout(180000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let state: 'data' | 'empty' | 'error' = 'data'
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/sys_dictionary?*', (route) => {
      const code = new URL(route.request().url()).searchParams.get('dict_type_table.code')
      return route.fulfill({
        json:
          code === 'eq.commonBoolean'
            ? [
                { label: '是', value: 'true', status: '1' },
                { label: '否', value: 'false', status: '1' }
              ]
            : code === 'eq.mdmStockMovementDirection'
              ? [
                  { label: '入库', value: 'inbound', status: '1' },
                  { label: '出库', value: 'outbound', status: '1' }
                ]
              : []
      })
    })
    const classification = {
      document_type: { document_type_name: '测试单据类型' },
      business_type: { business_type_name: '测试业务类型', stock_movement: 'inbound' },
      keeper: { employee_name: '测试仓管员' },
      salesperson: { employee_name: '测试销售员' },
      purchaser: { employee_name: '测试采购员' },
      is_initialization: true
    }
    const row = {
      ...classification,
      id: 'document-test',
      document_id: 'document-test',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: 'INIT-TEST',
      kind: kind.endsWith('return')
        ? 'initial_return'
        : kind.startsWith('sales')
          ? 'initial_outbound'
          : 'initial_inbound',
      status: 'draft',
      business_date: '2026-10-09',
      accounting_date: '2026-10-09',
      line_id: 'line-test',
      line_no: 10,
      quantity: 120,
      material_code: 'MAT-TEST',
      material_description: '测试物料',
      lines: [
        {
          id: 'line-test',
          line_no: 10,
          opening_quantity: 120,
          material: { code: 'MAT-TEST', name: '测试物料' },
          inventory_unit: { unit_name: '件' }
        }
      ]
    }
    await page.route(
      /\/rest\/v1\/wms_(initial_stock_document|sales_document_list|purchase_document(?:_list)?)\?/,
      (route) =>
        route.fulfill({
          status: state === 'error' ? 503 : 200,
          json:
            state === 'error'
              ? { code: 'P0001', message: '测试列表加载失败，请重试' }
              : state === 'empty'
                ? []
                : [row],
          headers: {
            'content-range': state === 'empty' ? '*/0' : '0-0/1',
            'access-control-expose-headers': 'content-range'
          }
        })
    )
    await page.goto(`/tests/e2e/fixtures/initialization-fields.html?kind=${kind}`)
    await expect(page.getByText('INIT-TEST', { exact: true }).first()).toBeVisible()
    for (const label of [
      '单据类型',
      '业务类型',
      '出入库标志',
      '初始化单据',
      '销售员',
      '采购员',
      '仓管员'
    ])
      await expect(page.locator('th').filter({ hasText: label }).first()).toBeVisible()
    await expect(page.getByText('测试单据类型', { exact: true }).first()).toBeAttached()
    await expect(page.getByText('测试业务类型', { exact: true }).first()).toBeAttached()
    await expect(page.getByText('入库', { exact: true }).first()).toBeAttached()
    await expect(page.getByText('是', { exact: true }).first()).toBeAttached()
    await page.getByText('按明细', { exact: true }).click()
    await expect(page.getByText('测试仓管员', { exact: true }).first()).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({ path: info.outputPath(`${kind}-fields.png`), animations: 'disabled' })
    const heading = page.getByRole('heading').first()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(heading).toBeHidden()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(heading).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(heading).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(heading).toBeVisible()
    state = 'empty'
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('INIT-TEST', { exact: true })).toHaveCount(0)
    state = 'error'
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const retry = page.getByRole('button', { name: '重新加载', exact: true })
    await expect(retry).toBeVisible()
    state = 'data'
    await retry.click()
    await expect(page.getByText('INIT-TEST', { exact: true }).first()).toBeVisible()
    expect(errors).toEqual([])
  })
}
