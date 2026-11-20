import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId, dictionaryRows } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

const targets = [
  ['initialization/initial-stock', 'WmsInitialStock', '初始库存单'],
  ['initialization/initial-sales-outbound', 'WmsInitialSalesOutbound', '期初销售出库单'],
  ['inbound-business/purchase-inbound', 'WmsPurchaseInbound', '采购入库单'],
  ['count-business/count-gain', 'WmsCountGain', '盘盈单'],
  ['count-business/count', 'WmsCount', '库存盘点'],
  ['outbound-business/outbound-request', 'WmsIssueRequest', '出库申请单'],
  ['transfer-business/transfer-request', 'WmsTransfer', '调拨申请单'],
  ['adjustment-business/adjustment', 'WmsAdjustment', '库存调整'],
  ['adjustment-business/assembly', 'WmsAssembly', '库存组装']
]

test('仓储各类工作区展示模式更新列并可还原', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await installFixtures(page)
  await page.route('**/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    wms: targets.flatMap(([path, name, title], index) => {
      const id = `column-mode-${index}`
      return [
        {
          id,
          parentId: null,
          name,
          path: `/wms/${path}`,
          component: `/wms/${path}`,
          type: 'menu',
          sort: index,
          meta: meta(title)
        },
        {
          id: `${id}-View`,
          parentId: id,
          name: `${name}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        }
      ]
    })
  })
  const errors: string[] = []
  const unexpectedWrites: string[] = []
  const displayReads: string[] = []
  let stockDictionaryPreloaded = false
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/wms_sales_document_list?*', (route) =>
    route.fulfill({
      headers: {
        'content-range': '0-3/4',
        'access-control-expose-headers': 'content-range'
      },
      json: ['normal', 'entrusted_processing', '', 'unresolved-stock-type'].map(
        (stockType, index) => ({
          document_id: `dictionary-sales-${index + 1}`,
          tenant_id: tenantId,
          organization_id: 'dictionary-organization',
          kind: 'initial_outbound',
          document_no: `DICT-SALES-${index + 1}`,
          business_date: '2026-11-18',
          accounting_date: '2026-11-18',
          customer_id: 'dictionary-customer',
          customer_code: 'CUST-001',
          customer_name: '字典验收客户',
          status: 'draft',
          line_id: `dictionary-line-${index + 1}`,
          line_no: 1,
          material_id: 'dictionary-material',
          material_code: `DICT-MAT-${index + 1}`,
          material_name: '字典验收物料',
          material_description: '核对库存类型历史字典',
          inventory_unit_name: '件',
          quantity: 1,
          base_quantity: 1,
          warehouse_name: '验收仓库',
          stock_type: stockType,
          stock_status: 'normal',
          unit_price: 1,
          tax_inclusive_unit_price: 1,
          tax_rate: 0,
          discount_amount: 0,
          amount: 1,
          tax_amount: 0,
          total_amount: 1,
          gift: false
        })
      )
    })
  )
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    const code = query.get('dict_type_table.code')?.replace(/^eq\./, '')
    if (code && code !== 'wmsInitialStockType') return route.fallback()
    const value = query.get('value')?.replace(/^eq\./, '')
    if (value !== undefined) {
      expect(query.has('status')).toBe(false)
      displayReads.push(value)
    } else {
      expect(query.get('status')).toBe('eq.1')
      stockDictionaryPreloaded = true
    }
    return route.fulfill({
      json: [
        ...(!code ? dictionaryRows.map((item) => ({ ...item, status: '1' })) : []),
        ...[
          { value: 'normal', label: '正常库存', status: '1' },
          { value: 'entrusted_processing', label: '受托加工库存', status: '0' }
        ]
          .filter((item) => (value === undefined ? item.status === '1' : item.value === value))
          .map((item) => ({
            ...item,
            id: `wmsInitialStockType-${item.value}`,
            dict_type_table: { code: 'wmsInitialStockType', name: '库存类型' }
          }))
      ]
    })
  })
  if (process.env.WMS_E2E_PAGE === 'initialization/initial-sales-outbound')
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const endpoint = url.pathname.split('/').at(-1) ?? ''
      if (endpoint === 'get_login_default_language') return route.fulfill({ json: 'zh' })
      if (endpoint === 'current_user_role_names') return route.fulfill({ json: ['R_SUPER'] })
      const readRpcs = [
        'current_is_super',
        'get_accessible_applications',
        'get_menus_for_current_applications',
        'get_current_user_button_permissions',
        'get_table_column_runtime',
        'get_organization_list_secure',
        'material_unit_compatibility_options',
        'mdm_list_warehouses_secure'
      ]
      if (
        request.method() !== 'GET' &&
        !(url.pathname.includes('/rpc/') && readRpcs.includes(endpoint))
      ) {
        unexpectedWrites.push(`${request.method()} ${url.pathname}`)
        return route.fulfill({ status: 403, json: { message: '测试不允许业务写入' } })
      }
      return route.fallback()
    })
  const selectedTargets = process.env.WMS_E2E_PAGE
    ? targets.filter(([path]) => path === process.env.WMS_E2E_PAGE)
    : targets
  for (const [path, , title] of selectedTargets) {
    await page.goto(`#/wms/${path}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const headers = page.locator('.el-table__header-wrapper th')
    await expect(headers.first()).toBeVisible()
    const signature = async () => (await headers.allTextContents()).join('|')
    const documentColumns = await signature()
    await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
    if (path === 'initialization/initial-stock') await expect.poll(signature).toBe(documentColumns)
    else await expect.poll(signature).not.toBe(documentColumns)
    if (path === 'initialization/initial-sales-outbound') {
      expect(stockDictionaryPreloaded).toBe(true)
      const table = page.locator('.art-table-query .el-table').first()
      await expect(table.locator('tbody tr')).toHaveCount(4)
      const column = await table
        .getByRole('columnheader', { name: '库存类型', exact: true })
        .evaluate((element) => (element as HTMLTableCellElement).cellIndex)
      for (const [index, label] of [
        '正常库存',
        '受托加工库存',
        '未识别库存类型',
        '未识别库存类型'
      ].entries()) {
        const cell = table.locator('tbody tr').nth(index).locator('td').nth(column)
        await cell.scrollIntoViewIfNeeded()
        await expect.soft(cell).toHaveText(label)
      }
      expect.soft(displayReads).toContain('entrusted_processing')
    }
    await page.screenshot({
      path: testInfo.outputPath(`${path.replaceAll('/', '-')}-line-columns.png`),
      animations: 'disabled'
    })
    await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
    await expect.poll(signature).toBe(documentColumns)
    const header = page.locator('.business-workspace-header')
    const table = page.locator('.art-table-query')
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(header).toBeHidden()
    await expect(table).toHaveClass(/is-focus-mode/)
    await page.screenshot({
      path: testInfo.outputPath(`${path.replaceAll('/', '-')}-focus.png`),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await expect(table).not.toHaveClass(/is-focus-mode/)
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await table.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await expect.poll(signature).toBe(documentColumns)
    expect(
      await page
        .locator('.business-workspace-page')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)
  }
  expect(errors).toEqual([])
  expect(unexpectedWrites).toEqual([])
})
