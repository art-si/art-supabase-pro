import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['execution-shifts', 'report-shifts']) {
  test(`${mode}班次选项完整分页并去重`, async ({ page }) => {
    const requests: URL[] = []
    const table =
      mode === 'execution-shifts' ? 'mes_operation_task_allocation' : 'mes_production_report'
    const field = mode === 'execution-shifts' ? 'shift_name_snapshot' : 'shift_name'
    const rowCount = mode === 'execution-shifts' ? 1001 : 10001
    await page.route(`**/rest/v1/${table}?*`, async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit'))
      await route.fulfill({
        json: Array.from({ length: Math.min(limit, rowCount - offset) }, (_, index) => ({
          [field]: offset + index === rowCount - 1 ? '尾页班次' : '常用班次'
        }))
      })
    })
    await page.goto(`/tests/e2e/fixtures/mes-execution-query.html?mode=${mode}&tenant=tenant-a`)
    await page.getByRole('button', { name: '查询测试' }).click()
    await expect(page.getByTestId('execution-result')).toHaveText('["常用班次","尾页班次"]')
    expect(requests).toHaveLength(Math.ceil(rowCount / 500))
    requests.forEach((url, index) => {
      expect(url.searchParams.get('offset')).toBe(String(index * 500))
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      expect(url.searchParams.get('order')).toBe(
        mode === 'execution-shifts' ? 'id.asc' : 'reported_at.desc,id.desc'
      )
      if (mode === 'report-shifts') {
        expect(url.searchParams.getAll('reported_at')).toEqual([
          'gte.2026-10-01T00:00:00+08:00',
          'lte.2026-10-02T23:59:59+08:00'
        ])
      }
    })
  })
}

test('出勤统计读取超过一万条时逐页保留租户和工作中心条件', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/rest/v1/mes_execution_attendance?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const from = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    await route.fulfill({
      json: Array.from({ length: Math.min(limit, 10001 - from) }, (_, index) => ({
        id: `attendance-${from + index}`,
        tenant_id: 'tenant-a'
      }))
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/mes-execution-query.html?mode=attendance&tenant=tenant-a&center=center-a'
  )
  await page.getByRole('button', { name: '查询测试' }).click()
  await expect(page.getByTestId('execution-result')).toContainText('attendance-10000')
  const result = JSON.parse(await page.getByTestId('execution-result').innerText())
  expect(result).toHaveLength(10001)
  expect(requests).toHaveLength(21)
  requests.forEach((url, index) => {
    expect(url.searchParams.get('offset')).toBe(String(index * 500))
    expect(url.searchParams.get('limit')).toBe('500')
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('work_center_id')).toBe('eq.center-a')
    expect(url.searchParams.get('order')).toBe('clock_in_at.desc,id.desc')
  })
})

test('出勤统计后续页失败时不会返回不完整统计数据', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/mes_execution_attendance?*', async (route) => {
    requests += 1
    if (requests === 1)
      await route.fulfill({
        json: Array.from({ length: 500 }, (_, index) => ({ id: `attendance-${index}` }))
      })
    else await route.fulfill({ status: 500, json: { code: 'XX000', message: 'page failure' } })
  })
  await page.goto('/tests/e2e/fixtures/mes-execution-query.html?mode=attendance')
  await page.getByRole('button', { name: '查询测试' }).click()
  await expect(page.getByTestId('execution-result')).toHaveText('查询失败')
  expect(requests).toBe(2)
})

test('取消工单查询会终止物料读取并停止调度剩余租户', async ({ page }) => {
  const materialRequests: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/mes_work_order')) {
      await route.fulfill({
        json: Array.from({ length: 7 }, (_, index) => ({
          id: `order-${index}`,
          tenant_id: `tenant-${index}`,
          material_id: `material-${index}`
        }))
      })
    } else {
      materialRequests.push(route.request().url())
    }
  })
  await page.goto('/tests/e2e/fixtures/mes-execution-query.html?mode=work-orders')
  await page.getByRole('button', { name: '查询测试' }).click()
  await expect.poll(() => materialRequests.length).toBe(3)
  await page.getByRole('button', { name: '取消查询' }).click()
  await expect(page.getByTestId('execution-result')).toHaveText('查询失败')
  expect(materialRequests).toHaveLength(3)
})

test('工单物料查询按租户去重、限制并发并保留工单顺序', async ({ page }) => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    id: `order-${index}`,
    tenant_id: `tenant-${index % 7}`,
    material_id: `material-${index % 7}`,
    material_name_snapshot: '原物料名称',
    details: [{ sort_order: 2 }, { sort_order: 1 }]
  }))
  const materialRequests: URL[] = []
  let active = 0
  let peak = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/mes_work_order')) {
      await route.fulfill({
        headers: { 'content-range': '20-33/34', 'access-control-expose-headers': 'content-range' },
        json: rows
      })
      return
    }
    materialRequests.push(url)
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 100))
    const tenant = url.searchParams.get('tenant_id')?.replace('eq.', '')
    const index = tenant?.replace('tenant-', '')
    await route.fulfill({
      json: [{ id: `material-${index}`, description: `物料说明-${index}` }]
    })
    active -= 1
  })
  await page.goto('/tests/e2e/fixtures/mes-execution-query.html?mode=work-orders')
  await page.getByRole('button', { name: '查询测试' }).click()
  await expect(page.getByTestId('execution-result')).toContainText('物料说明-6')
  expect(peak).toBe(3)
  expect(materialRequests).toHaveLength(7)
  materialRequests.forEach((url) => {
    expect(url.pathname).toBe('/rest/v1/mdm_material')
    const index = url.searchParams.get('tenant_id')?.replace('eq.tenant-', '')
    expect(url.searchParams.get('id')).toBe(`in.(material-${index})`)
  })
  const output = JSON.parse(await page.getByTestId('execution-result').innerText())
  expect(output.total).toBe(34)
  expect(output.data.map((row: { id: string }) => row.id)).toEqual(rows.map((row) => row.id))
  output.data.forEach(
    (row: { materialDescription: string; details: { sortOrder: number }[] }, index: number) => {
      expect(row.materialDescription).toBe(`物料说明-${index % 7}`)
      expect(row.details.map((detail) => detail.sortOrder)).toEqual([1, 2])
    }
  )
})

for (const tenant of [null, '11111111-1111-4111-8111-111111111111']) {
  for (const shift of [null, '白班']) {
    test(`生产执行分页查询保留${tenant ? '指定租户' : '全部租户'}和${shift ? '班次' : '无班次'}条件`, async ({
      page
    }) => {
      const requests: URL[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url())
        requests.push(url)
        await route.fulfill({
          headers: {
            'content-range': '20-20/41',
            'access-control-expose-headers': 'content-range'
          },
          json: [
            {
              id: 'test-task',
              allocations: [
                { id: 'day-allocation', shift_name_snapshot: '白班' },
                { id: 'night-allocation', shift_name_snapshot: '夜班' }
              ]
            }
          ]
        })
      })
      const params = new URLSearchParams()
      if (tenant) params.set('tenant', tenant)
      if (shift) params.set('shift', shift)
      await page.goto(`/tests/e2e/fixtures/mes-execution-query.html?${params}`)
      await page.getByRole('button', { name: '查询测试' }).click()
      await expect(page.getByTestId('execution-result')).toContainText('night-allocation')
      expect(requests).toHaveLength(1)
      const request = requests[0]
      expect(request.pathname).toBe('/rest/v1/mes_operation_task')
      expect(request.searchParams.get('limit')).toBe('20')
      expect(request.searchParams.get('offset')).toBe('20')
      expect(request.searchParams.get('tenant_id')).toBe(tenant ? `eq.${tenant}` : null)
      expect(request.searchParams.get('shiftFilter.shift_name_snapshot')).toBe(
        shift ? `eq.${shift}` : null
      )
      expect(request.searchParams.get('shiftFilter')).toBe(shift ? 'not.is.null' : null)
      expect(request.searchParams.get('shiftFilter.tenant_id')).toBe(
        shift && tenant ? `eq.${tenant}` : null
      )
      expect(request.searchParams.get('select')).toContain(
        'allocations:mes_operation_task_allocation('
      )
      const output = JSON.parse(await page.getByTestId('execution-result').innerText())
      expect(output.total).toBe(41)
      expect(output.data[0].allocations).toHaveLength(2)
      expect(errors).toEqual([])
    })
  }
}
