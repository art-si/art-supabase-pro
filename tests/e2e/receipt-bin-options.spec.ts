import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('工程报价基础数据完整分页且四类尾页映射正确', async ({ page }) => {
  const options = [
    {
      table: 'mdm_material_category',
      key: 'categories',
      code: 'category_code',
      name: 'category_name'
    },
    { table: 'mdm_material_type', key: 'materialTypes', code: 'type_code', name: 'type_name' },
    { table: 'mdm_unit_of_measure', key: 'units', code: 'unit_code', name: 'unit_name' },
    { table: 'mdm_material_code_rule', key: 'codeRules', code: 'rule_code', name: 'rule_name' }
  ]
  const requests = new Map<string, URL[]>()
  for (const option of options) {
    requests.set(option.table, [])
    await page.route(`**/rest/v1/${option.table}?*`, async (route) => {
      const url = new URL(route.request().url())
      requests.get(option.table)?.push(url)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit'))
      await route.fulfill({
        json: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) => ({
          id: `${option.key}-${offset + index}`,
          tenant_id: 'tenant-a',
          [option.code]: `CODE-${offset + index}`,
          [option.name]: '测试名称'
        }))
      })
    })
  }
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=engineering')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('codeRules-1000')
  const result = JSON.parse(await page.getByTestId('bin-result').innerText())
  for (const option of options) {
    expect(result.data[option.key]).toHaveLength(1001)
    expect(result.data[option.key][1000]).toEqual({
      id: `${option.key}-1000`,
      tenantId: 'tenant-a',
      code: 'CODE-1000',
      name: '测试名称'
    })
    expect(requests.get(option.table)).toHaveLength(3)
    requests.get(option.table)?.forEach((url, index) => {
      expect(url.searchParams.get('offset')).toBe(String(index * 500))
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      expect(url.searchParams.get('status')).toBe('eq.enabled')
      expect(url.searchParams.get('order')).toBe(`sort.asc,${option.name}.asc,id.asc`)
    })
  }
})

test('来源单据尾页有效订单可见且每页保留项目客户和租户条件', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/scm_sales_document?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) => ({
        id: `source-${offset + index}`,
        status: offset + index === 1000 ? 'approved' : 'draft'
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=salesSources')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('source-1000')
  const result = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(result.data).toHaveLength(1001)
  expect(result.data.filter((row: { status: string }) => row.status === 'approved')).toEqual([
    { id: 'source-1000', status: 'approved' }
  ])
  expect(requests).toHaveLength(3)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('project_id')).toBe('eq.project-a')
    expect(url.searchParams.get('customer_id')).toBe('eq.customer-a')
    expect(url.searchParams.get('kind')).toBe('eq.sales_order')
    expect(url.searchParams.get('order')).toBe('updated_at.desc,id.asc')
  })
})

test('销售单据类型完整分页且业务菜单只解析一次', async ({ page }) => {
  let menuRequests = 0
  const requests: URL[] = []
  await page.route('**/rest/v1/sys_menu?*', async (route) => {
    menuRequests += 1
    await route.fulfill({ json: { id: 'menu-a' } })
  })
  await page.route('**/rest/v1/mdm_document_type?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) => ({
        id: `type-${offset + index}`,
        is_default: offset + index === 1000
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=salesTypes')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('type-1000')
  const result = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(result.data).toHaveLength(1001)
  expect(result.data[1000].isDefault).toBe(true)
  expect(menuRequests).toBe(1)
  expect(requests).toHaveLength(3)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('menu_id')).toBe('eq.menu-a')
    expect(url.searchParams.get('enabled')).toBe('eq.true')
    expect(url.searchParams.get('order')).toBe('sort_order.asc,id.asc')
  })
})

test('销售物料尾页保留分类单位映射和名称回退', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/mdm_material?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) => ({
        id: `material-${offset + index}`,
        tenant_id: 'tenant-a',
        material_code: `M-${offset + index}`,
        material_name: '测试物料',
        description: null,
        materialCategory: { category_name: '测试分类' },
        salesUnit: { unit_name: '件' },
        unit_conversions: null
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=salesMaterials')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('material-1000')
  const result = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(result.data).toHaveLength(1001)
  expect(result.total).toBe(1001)
  expect(result.data[1000]).toMatchObject({
    id: 'material-1000',
    materialDescription: '测试物料',
    materialCategory: '测试分类',
    salesUnit: '件',
    unitConversions: []
  })
  expect(requests).toHaveLength(3)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('order')).toBe('material_name.asc,id.asc')
  })
})

test('销售客户完整分页并在每页保留搜索及租户条件', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/mdm_customer?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) => ({
        id: `customer-${offset + index}`,
        customer_name: '测试客户'
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=salesCustomers')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('customer-1000')
  const result = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(result.data).toHaveLength(1001)
  expect(result.total).toBe(1001)
  expect(result.error).toBeNull()
  expect(requests).toHaveLength(3)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('enabled')).toBe('eq.true')
    expect(url.searchParams.get('order')).toBe('customer_name.asc,id.asc')
    expect(url.searchParams.get('or')).toContain('测试')
  })
})

test('装车出库按单据和明细隔离分配记录并保持批次及序列号顺序', async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    if (table === 'scm_sales_document') {
      const data = url.searchParams.has('kind')
        ? ['loading-a', 'loading-b'].map((id) => ({
            id,
            tenant_id: 'tenant-a',
            document_no: id,
            lines: ['line-a', 'line-b'].map((lineId) => ({
              lineId,
              quantity: 10,
              sourceDocumentId: 'notice-a',
              sourceLineId: 'notice-line'
            }))
          }))
        : [{ id: 'notice-a', lines: [{ lineId: 'notice-line' }] }]
      await route.fulfill({ json: data })
    } else if (table === 'scm_loading_outbound_allocation') {
      await route.fulfill({
        json: [
          {
            loading_id: 'loading-a',
            loading_line_id: 'line-a',
            quantity: 2,
            batch_id: 'batch-2',
            serial_ids: ['serial-2']
          },
          {
            loading_id: 'loading-b',
            loading_line_id: 'line-a',
            quantity: 10,
            batch_id: 'batch-3',
            serial_ids: ['serial-3']
          },
          {
            loading_id: 'loading-a',
            loading_line_id: 'line-b',
            quantity: 1,
            batch_id: 'batch-3',
            serial_ids: []
          },
          {
            loading_id: 'loading-a',
            loading_line_id: 'line-a',
            quantity: 3,
            batch_id: 'batch-1',
            serial_ids: ['serial-1']
          }
        ]
      })
    } else if (table === 'wms_serial_number') {
      await route.fulfill({
        json: [1, 2, 3].map((id) => ({ id: `serial-${id}`, serial_no: `SN-${id}` }))
      })
    } else if (table === 'wms_inventory_batch') {
      await route.fulfill({
        json: [1, 2, 3].map((id) => ({
          id: `batch-${id}`,
          batch_no: `批次${id}`,
          zone_id: null,
          warehouse: { warehouse_name: '测试仓' },
          bin: { bin_name: `库位${id}` }
        }))
      })
    } else {
      await route.fulfill({ json: [] })
    }
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=outbound')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('loading-a:line-a')
  const rows = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(rows.map((row: { id: string }) => row.id)).toEqual([
    'loading-a:line-a',
    'loading-a:line-b',
    'loading-b:line-a',
    'loading-b:line-b'
  ])
  expect(rows.map((row: { deliveredQuantity: number }) => row.deliveredQuantity)).toEqual([
    5, 1, 10, 0
  ])
  expect(rows.map((row: { outboundStatus: string }) => row.outboundStatus)).toEqual([
    'partial',
    'partial',
    'complete',
    'pending'
  ])
  expect(rows[0]).toMatchObject({
    batchNo: '批次2、批次1',
    binName: '库位2、库位1',
    serialNos: 'SN-2、SN-1',
    warehouseName: '测试仓'
  })
  expect(rows[2]).toMatchObject({ batchNo: '批次3', serialNos: 'SN-3' })
  expect(rows[3]).toMatchObject({ batchNo: '', serialNos: '' })
})

test('剩余发货数量计入一万条之后的下游单据并排除取消单据', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/scm_sales_document?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 10004 - offset) }, (_, index) => ({
        id: `child-${offset + index}`,
        status:
          offset + index < 10001
            ? 'draft'
            : ['cancelled', 'closed', 'terminated'][offset + index - 10001],
        lines: [{ sourceLineId: 'line-a', quantity: 1 }]
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=remaining')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('"quantity":9')
  const rows = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(rows).toHaveLength(1)
  expect(rows[0].quantity).toBe(9)
  expect(requests).toHaveLength(21)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('source_id')).toBe('eq.source-a')
    expect(url.searchParams.get('kind')).toBe('eq.shipping_notice')
    expect(url.searchParams.get('order')).toBe('id.asc')
  })
})

test('下游单据后续页失败时不提供错误的剩余数量', async ({ page }) => {
  await page.route('**/rest/v1/scm_sales_document?*', async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
    await route.fulfill(
      offset === 0
        ? {
            json: Array.from({ length: 500 }, (_, index) => ({
              id: `child-${index}`,
              status: 'draft',
              lines: [{ sourceLineId: 'line-a', quantity: 1 }]
            }))
          }
        : { status: 500, json: { code: 'XX000', message: 'query failed' } }
    )
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=remaining')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toHaveText('查询失败')
})

test('施工号后续页失败时阻止返回不完整选项', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/mdm_project_construction?*', async (route) => {
    requests += 1
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
    await route.fulfill(
      offset === 0
        ? { json: Array.from({ length: 500 }, (_, index) => ({ id: `section-${index}` })) }
        : { status: 500, json: { code: 'XX000', message: 'query failed' } }
    )
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?mode=sections')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toHaveText('查询失败')
  expect(requests).toBe(2)
})

test('可用库位超过一千条时完整分页且保留仓库租户条件', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/mdm_warehouse_bin?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const from = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 1001 - from) }, (_, index) => ({
        id: `bin-${from + index}`,
        bin_code: `库位-${from + index}`,
        warehouse_id: 'warehouse-a'
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('bin-1000')
  expect(JSON.parse(await page.getByTestId('bin-result').innerText())).toHaveLength(1001)
  expect(requests).toHaveLength(3)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('warehouse_id')).toBe('eq.warehouse-a')
    expect(url.searchParams.get('status')).toBe('eq.available')
    expect(url.searchParams.get('order')).toBe('bin_code.asc,id.asc')
  })
})

test('采购分类树完整读取尾页分类并保留父节点关系', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/mdm_material_category?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const from = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 1001 - from) }, (_, index) => ({
        id: `category-${from + index}`,
        parent_id: from + index ? 'category-0' : null,
        category_name: `分类-${from + index}`
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/receipt-bin-options.html?categories')
  await page.getByRole('button', { name: '加载库位' }).click()
  await expect(page.getByTestId('bin-result')).toContainText('category-1000')
  const rows = JSON.parse(await page.getByTestId('bin-result').innerText())
  expect(rows).toHaveLength(1001)
  expect(rows[1000].parentId).toBe('category-0')
  expect(requests).toHaveLength(3)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('order')).toBe('sort.asc,category_code.asc,id.asc')
  })
})

for (const option of [
  {
    mode: 'sections',
    table: 'mdm_project_construction',
    filter: 'tenant_id',
    value: 'eq.tenant-a',
    order: 'construction_no.asc,id.asc'
  },
  {
    mode: 'projects',
    table: 'mdm_project',
    filter: 'enabled',
    value: 'eq.true',
    order: 'project_name.asc,id.asc'
  },
  {
    mode: 'warehouses',
    table: 'mdm_warehouse',
    filter: 'status',
    value: 'eq.enabled',
    order: 'warehouse_code.asc,id.asc'
  },
  {
    mode: 'bins',
    table: 'mdm_warehouse_bin',
    filter: 'status',
    value: 'eq.available',
    order: 'bin_code.asc,id.asc'
  },
  {
    mode: 'customers',
    table: 'mdm_customer',
    filter: 'enabled',
    value: 'eq.true',
    order: 'customer_code.asc,id.asc'
  }
]) {
  test(`采购${option.mode}选项完整读取并保留状态及租户条件`, async ({ page }) => {
    const requests: URL[] = []
    await page.route(`**/rest/v1/${option.table}?*`, async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit'))
      await route.fulfill({
        json: Array.from({ length: Math.min(limit, 1001 - offset) }, (_, index) => ({
          id: `option-${offset + index}`
        }))
      })
    })
    await page.goto(`/tests/e2e/fixtures/receipt-bin-options.html?mode=${option.mode}`)
    await page.getByRole('button', { name: '加载库位' }).click()
    await expect(page.getByTestId('bin-result')).toContainText('option-1000')
    expect(JSON.parse(await page.getByTestId('bin-result').innerText())).toHaveLength(1001)
    expect(requests).toHaveLength(3)
    requests.forEach((url, index) => {
      expect(url.searchParams.get('offset')).toBe(String(index * 500))
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      expect(url.searchParams.get(option.filter)).toBe(option.value)
      expect(url.searchParams.get('order')).toBe(option.order)
    })
  })
}
