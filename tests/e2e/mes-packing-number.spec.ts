import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('不同工单生成组合包号，历史空包可补板材，保存失败可重试，拆包继续编号', async ({
  page
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenant = 'packing-test-tenant'
  const orders = ['QA-MO-001', 'QA-MO-002'].map((work_order_no, index) => ({
    id: `order-${index}`,
    tenant_id: tenant,
    work_order_no,
    material_id: 'material',
    material_name_snapshot: '聚氨酯板',
    planned_start_date: new Date().toISOString().slice(0, 10),
    extension_values: { thickness: 50 },
    packing_thickness_field_key_snapshot: 'thickness',
    board_thickness_mm: 50,
    packing_rule_id: 'rule',
    status: 'confirmed',
    packing_published_at: null,
    update_time: '2026-10-26T00:00:00Z',
    details: [{ pieces: 10, packed_pieces: 0 }]
  }))
  type StoredPack = {
    id: string
    pack_no: string
    manually_adjusted: boolean
    confirmed: boolean
    remark: string
    items: { board_id: string; pieces: number; remark: string }[]
  }
  const stored: Record<string, StoredPack[]> = {
    'order-0': [
      {
        id: 'legacy-empty',
        pack_no: 'LEGACY-EMPTY-01',
        manually_adjusted: true,
        confirmed: false,
        remark: '',
        items: []
      }
    ],
    'order-1': []
  }
  const saved: string[][] = []
  let rejectSave = true
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/mes_work_order?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({
      json: params.get('select')?.startsWith('extension_values')
        ? { extension_values: { thickness: 50 }, packing_thickness_field_key_snapshot: 'thickness' }
        : orders
    })
  })
  await page.route('**/rest/v1/mes_pack_rule?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'rule',
          tenant_id: tenant,
          rule_code: 'PU_BOARD',
          rule_name: '聚氨酯板规则',
          enabled: true,
          max_pieces: 5,
          max_stack_height: 1000,
          board_thickness_mm: null,
          max_weight: null,
          max_length: null,
          same_width: true,
          same_area: true,
          same_number: true,
          allow_mix_length: false,
          remainder_policy: 'separate',
          sort_priority: 'area,boardNo,width,length',
          remark: ''
        }
      ]
    })
  )
  await page.route('**/rest/v1/mes_work_order_detail?*', (route) => {
    const orderId = new URL(route.request().url()).searchParams.get('work_order_id')!.slice(3)
    return route.fulfill({
      json: [
        {
          id: `${orderId}-board`,
          tenant_id: tenant,
          work_order_id: orderId,
          area: 'A区',
          number: 'A-1',
          length_mm: 6000,
          width_mm: 1000,
          thickness_mm: 50,
          pieces: 10,
          packed_pieces: 0,
          area_sqm: 60,
          unit_weight_kg: null,
          remark: ''
        }
      ]
    })
  })
  await page.route('**/rest/v1/mes_work_order_pack?*', (route) => {
    const orderId = new URL(route.request().url()).searchParams.get('work_order_id')!.slice(3)
    return route.fulfill({ json: stored[orderId] })
  })
  await page.route('**/rest/v1/rpc/mes_save_packing_plan_v2', async (route) => {
    if (rejectSave) {
      rejectSave = false
      return route.fulfill({ status: 409, json: { code: '40001', message: '保存失败，请重试' } })
    }
    const payload = route.request().postDataJSON() as {
      p_work_order_id: string
      p_packs: StoredPack[]
    }
    expect(payload.p_packs.every((pack) => pack.items.length > 0)).toBe(true)
    stored[payload.p_work_order_id] = payload.p_packs.map((pack, index) => ({
      ...pack,
      id: pack.id || `saved-${index}`
    }))
    const order = orders.find((entry) => entry.id === payload.p_work_order_id)!
    order.details[0].packed_pieces = 10
    saved.push(payload.p_packs.map((pack) => pack.pack_no))
    return route.fulfill({ json: { revision: order.update_time } })
  })
  await page.goto('/tests/e2e/fixtures/mes-packing-print.html?edit=1', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  await expect(page.getByRole('button', { name: /QA-MO-001/ })).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: /QA-MO-001/ }).click()
  const results = page.locator('.packing-page__results')
  await expect(results.getByText('存在没有板材的历史包')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('empty-pack-recovery.png'), fullPage: true })
  await results.getByRole('button', { name: '选定空包 LEGACY-EMPTY-01 为并入目标' }).click()
  await page.getByRole('button', { name: '排包', exact: true }).click()
  await expect(results.getByText('存在没有板材的历史包')).toHaveCount(0)
  await page.getByRole('button', { name: '取消目标', exact: true }).click()
  await page.getByRole('button', { name: '排包', exact: true }).click()
  await expect(
    results.getByRole('button', { name: '选定 QA-MO-001-PK-0001 为并入目标', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '保存数据' }).click()
  await expect(page.locator('.el-message--error')).toContainText('数据已被其他操作更新')
  await expect(results.getByText('未保存', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存数据' }).click()
  await expect.poll(() => saved.length).toBe(1)
  expect(saved[0]).toEqual(['LEGACY-EMPTY-01', 'QA-MO-001-PK-0001'])
  await expect(results.getByText('未保存', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: /QA-MO-002/ }).click()
  await expect(results.getByText('暂无关联排包', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '自动排包', exact: true }).click()
  await expect(
    results.getByRole('button', { name: '选定 QA-MO-002-PK-0001 为并入目标', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '保存数据' }).click()
  await expect.poll(() => saved.length).toBe(2)
  expect(saved[1]).toEqual(['QA-MO-002-PK-0001', 'QA-MO-002-PK-0002'])
  await expect(results.getByText('未保存', { exact: true })).toHaveCount(0)
  await results.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await results.getByRole('button', { name: '拆包', exact: true }).click()
  const prompt = page.getByRole('dialog', { name: '拆包块数', exact: true })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    results.getByRole('button', { name: '选定 QA-MO-002-PK-0003 为并入目标', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '保存数据' }).click()
  await expect.poll(() => saved.length).toBe(3)
  expect(saved[2]).toEqual(['QA-MO-002-PK-0001', 'QA-MO-002-PK-0002', 'QA-MO-002-PK-0003'])
  await expect(results.getByText('未保存', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('packing-composite-numbers.png'),
    fullPage: true
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false
  )
  expect(errors).toEqual([])
})
