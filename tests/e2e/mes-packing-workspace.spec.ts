import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('未发布工单不受默认日期限制，批量移出按行处理并保护已入库包', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenantId = 'packing-test-tenant'
  const order = {
    id: 'order',
    tenant_id: tenantId,
    work_order_no: 'QA-历史已排工单',
    material_id: 'material',
    material_name_snapshot: '聚氨酯墙面板',
    project_name_snapshot: '长名称测试项目 · 一期厂房及配套设施工程',
    planned_start_date: '2020-01-01',
    extension_values: { thickness: 50 },
    packing_thickness_field_key_snapshot: 'thickness',
    packing_rule_id: 'rule',
    status: 'confirmed',
    packing_published_at: null as string | null,
    update_time: '2026-11-01T00:00:00Z',
    details: [{ pieces: 12, packed_pieces: 8 }]
  }
  const orders = [
    order,
    { ...order, id: 'future', work_order_no: 'QA-远期未排工单', planned_start_date: '2099-12-31' },
    { ...order, id: 'undated', work_order_no: 'QA-无日期工单', planned_start_date: null },
    {
      ...order,
      id: 'published',
      work_order_no: 'QA-已发布工单',
      packing_published_at: '2026-11-01T00:00:00Z'
    }
  ]
  const boards = [1000, 3000, 2000, 4000].map((length, index) => ({
    id: `board-${index}`,
    tenant_id: tenantId,
    work_order_id: order.id,
    area: '生产一区 · 长区域名称',
    number: 'A-1',
    length_mm: length,
    width_mm: 1000,
    thickness_mm: 50,
    pieces: 3,
    packed_pieces: 2,
    area_sqm: (length / 1000) * 3,
    unit_weight_kg: null,
    remark: ''
  }))
  type StoredPack = {
    id?: string
    pack_no: string
    manually_adjusted: boolean
    confirmed: boolean
    remark: string
    inbound_quantity?: number
    inbound_area_sqm?: number
    inbound_at?: string | null
    items: { board_id: string; pieces: number; remark: string }[]
  }
  let packs: StoredPack[] = [
    {
      id: 'pack-1',
      pack_no: 'PK-0001',
      manually_adjusted: false,
      confirmed: false,
      remark: '',
      items: [
        { board_id: 'board-0', pieces: 2, remark: '' },
        { board_id: 'board-1', pieces: 2, remark: '' }
      ]
    },
    {
      id: 'pack-2',
      pack_no: 'PK-0002',
      manually_adjusted: false,
      confirmed: false,
      remark: '',
      items: [{ board_id: 'board-2', pieces: 2, remark: '' }]
    },
    {
      id: 'locked',
      pack_no: 'PK-0003',
      manually_adjusted: false,
      confirmed: true,
      remark: '',
      inbound_quantity: 2,
      inbound_area_sqm: 8,
      inbound_at: '2026-11-01T00:00:00Z',
      items: [{ board_id: 'board-3', pieces: 2, remark: '' }]
    }
  ]
  let failDetails = true
  const saved: StoredPack[][] = []
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: [
        ['pending', '未入库'],
        ['received', '已入库'],
        ['returned', '已退库']
      ].map(([value, label], index) => ({
        id: `inbound-${value}`,
        code: value,
        value,
        label,
        status: '1',
        sort: index,
        dict_type_table: { code: 'wmsPackInboundStatus', name: '包入库状态' }
      }))
    })
  )
  await page.route('**/rest/v1/mes_work_order?*', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams
        .get('select')
        ?.startsWith('extension_values')
        ? { extension_values: { thickness: 50 }, packing_thickness_field_key_snapshot: 'thickness' }
        : orders
    })
  )
  await page.route('**/rest/v1/mes_pack_rule?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'rule',
          tenant_id: tenantId,
          rule_code: 'PU_BOARD',
          rule_name: '聚氨酯板规则',
          enabled: true,
          max_pieces: 10,
          max_stack_height: 1000,
          board_thickness_mm: null,
          max_weight: null,
          max_length: null,
          same_width: true,
          same_area: true,
          same_number: true,
          allow_mix_length: true,
          length_sort_direction: 'asc',
          remainder_policy: 'merge',
          sort_priority: 'area,boardNo,width,length',
          remark: ''
        }
      ]
    })
  )
  await page.route('**/rest/v1/mes_work_order_detail?*', (route) => {
    if (failDetails) {
      failDetails = false
      return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
    }
    return route.fulfill({ json: boards })
  })
  await page.route('**/rest/v1/mes_work_order_pack?*', (route) => route.fulfill({ json: packs }))
  await page.route('**/rest/v1/rpc/mes_save_packing_plan_v2', (route) => {
    const payload = route.request().postDataJSON() as { p_packs: StoredPack[]; p_rule_id: string }
    expect(payload.p_rule_id).toBe('rule')
    saved.push(payload.p_packs)
    packs = payload.p_packs
    order.details[0].packed_pieces = packs
      .flatMap((pack) => pack.items)
      .reduce((sum, item) => sum + item.pieces, 0)
    return route.fulfill({ json: { revision: order.update_time } })
  })
  await page.goto('/tests/e2e/fixtures/mes-packing-print.html?edit=1', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  const orderList = page.locator('.packing-page__orders')
  await expect(orderList.getByRole('button', { name: /QA-历史已排工单/ })).toBeVisible({
    timeout: 120_000
  })
  await expect(orderList.getByRole('button', { name: /QA-远期未排工单/ })).toBeVisible()
  await expect(orderList.getByRole('button', { name: /QA-无日期工单/ })).toBeVisible()
  await expect(orderList.getByRole('button', { name: /QA-已发布工单/ })).toHaveCount(0)
  await orderList.getByText('包含已发布工单', { exact: true }).click()
  await expect(orderList.getByRole('button', { name: /QA-已发布工单/ })).toBeVisible()
  await orderList.getByText('包含已发布工单', { exact: true }).click()
  await orderList.getByRole('button', { name: /QA-历史已排工单/ }).click()
  const results = page.locator('.packing-page__results')
  await expect(results.getByText('板材和排包明细加载失败，请重试。', { exact: true })).toBeVisible()
  await results.getByRole('button', { name: '重新加载', exact: true }).click()
  const rows = results.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(4)
  const bulkRemove = results.getByRole('button', { name: '批量移出', exact: true })
  await expect(bulkRemove).toBeDisabled()
  await rows.nth(0).locator('.el-checkbox').click()
  await rows.nth(3).locator('.el-checkbox').click()
  await expect(bulkRemove).toBeDisabled()
  await expect(bulkRemove).toHaveAttribute('title', /已入库明细不可移出/)
  await rows.nth(3).locator('.el-checkbox').click()
  await rows.nth(2).locator('.el-checkbox').click()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('packing-bulk-selected.png'), fullPage: true })
  await bulkRemove.click()
  await expect(rows).toHaveCount(2)
  await expect(results.getByText('未保存', { exact: true })).toBeVisible()
  await expect(results.getByRole('button', { name: '选定 PK-0002 为并入目标' })).toHaveCount(0)
  await expect(
    rows.filter({ hasText: 'PK-0003' }).getByRole('button', { name: '移出', exact: true })
  ).toBeDisabled()
  await page.getByRole('button', { name: '保存数据', exact: true }).click()
  await expect.poll(() => saved.length).toBe(1)
  expect(saved[0].map((pack) => [pack.pack_no, pack.items.map((item) => item.board_id)])).toEqual([
    ['PK-0001', ['board-1']],
    ['PK-0003', ['board-3']]
  ])
  expect(saved[0][1].inbound_at).toBe('2026-11-01T00:00:00Z')
  await expect(results.getByText('未保存', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '自动排包', exact: true }).click()
  await page
    .getByRole('dialog', { name: '自动排包', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await page.getByRole('button', { name: '保存数据', exact: true }).click()
  await expect.poll(() => saved.length).toBe(2)
  const generated = saved[1].find((pack) => !['PK-0001', 'PK-0003'].includes(pack.pack_no))!
  expect(generated.items.map((item) => item.board_id)).toEqual([
    'board-0',
    'board-2',
    'board-1',
    'board-3'
  ])
  await expect(results.getByText('未保存', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '自动排包', exact: true })).toBeEnabled()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('packing-bulk-saved.png'), fullPage: true })
  await orderList.getByRole('textbox', { name: '组合查询工单' }).fill('不存在的工单')
  await expect(orderList.getByText('当前条件下没有工单')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false
  )
  expect(errors).toEqual([])
})
