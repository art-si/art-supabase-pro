import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of [
  'complete',
  'bom',
  'bom-routes',
  'bom-groups',
  'route-path',
  'movement-options'
]) {
  for (const missingPage of [false, true]) {
    test(`${mode === 'movement-options' ? '出入库类型选项' : mode === 'route-path' ? '工艺路径' : mode === 'bom-groups' ? 'BOM 分组' : mode === 'bom-routes' ? 'BOM 路线' : mode === 'bom' ? 'BOM 工序' : '序列工序'}完整读取${missingPage ? '缺页时阻止返回部分数据' : '覆盖第 1001 条'}`, async ({
      page
    }) => {
      const rows = Array.from({ length: 1001 }, (_, index) => ({
        id: `step-${index}`,
        name: `工序 ${index}`,
        tenant_id: 'tenant-a'
      }))
      const offsets: number[] = []
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        expect(url.pathname).toBe(
          mode === 'movement-options'
            ? '/rest/v1/mdm_stock_movement_type'
            : mode === 'bom-groups'
              ? '/rest/v1/mdm_master_group'
              : mode === 'bom-routes'
                ? '/rest/v1/mdm_process_route'
                : '/rest/v1/mdm_process_route_step'
        )
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
        if (mode === 'movement-options') {
          expect(url.searchParams.get('order')).toBe('movement_code.asc,id.asc')
        } else if (mode === 'bom-groups') {
          expect(url.searchParams.get('domain')).toBe('eq.bom')
          expect(url.searchParams.get('order')).toBe('sort.asc,code.asc,id.asc')
        } else if (mode === 'bom-routes') {
          expect(url.searchParams.get('material_id')).toBe('eq.material-a')
          expect(url.searchParams.get('enabled')).toBe('eq.true')
          expect(url.searchParams.get('order')).toBe('is_default.desc,update_time.desc,id.asc')
        } else {
          expect(url.searchParams.get('route_id')).toBe('eq.route-a')
          expect(url.searchParams.get('order')).toBe('sort.asc,code.asc,id.asc')
        }
        expect(url.searchParams.get('limit')).toBe('500')
        const offset = Number(url.searchParams.get('offset'))
        offsets.push(offset)
        const data = missingPage && offset === 1000 ? [] : rows.slice(offset, offset + 500)
        return route.fulfill({
          headers: {
            'content-range': data.length ? `${offset}-${offset + data.length - 1}/1001` : '*/1001',
            'access-control-expose-headers': 'content-range'
          },
          json: data
        })
      })
      await page.goto(`/tests/e2e/fixtures/process-step-counts.html?mode=${mode}`)
      await page.getByRole('button', { name: '查询工序' }).click()
      if (missingPage) {
        await expect(page.getByTestId('step-result')).toHaveText('查询失败')
      } else {
        if (mode === 'route-path') {
          await expect(page.getByTestId('step-result')).toHaveText(
            rows.map((row) => row.name).join('→')
          )
          expect(offsets).toEqual([0, 500, 1000])
          return
        }
        await expect(page.getByTestId('step-result')).toContainText('step-1000')
        const result = JSON.parse(await page.getByTestId('step-result').innerText())
        expect(result.total).toBe(1001)
        expect(result.data.map((row: { id: string }) => row.id)).toEqual(rows.map((row) => row.id))
      }
      expect(offsets).toEqual([0, 500, 1000])
    })
  }
}

test('不展示分配数量的工序读取只发起主查询', async ({ page }) => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    id: `step-${index}`,
    tenant_id: `tenant-${index % 2}`
  }))
  const requests: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    expect(path).toBe('/rest/v1/mdm_process_route_step')
    return route.fulfill({
      headers: { 'content-range': '0-999/1000', 'access-control-expose-headers': 'content-range' },
      json: rows
    })
  })
  await page.goto('/tests/e2e/fixtures/process-step-counts.html?mode=plain')
  await page.getByRole('button', { name: '查询工序' }).click()
  await expect(page.getByTestId('step-result')).toContainText('step-999')
  const result = JSON.parse(await page.getByTestId('step-result').innerText())
  expect(result.total).toBe(1000)
  expect(result.data.map((row: { id: string }) => row.id)).toEqual(rows.map((row) => row.id))
  expect(requests).toEqual(['/rest/v1/mdm_process_route_step'])
})

test('工序关联使用租户精确计数且限制并发', async ({ page }) => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    id: `step-${index}`,
    tenant_id: `tenant-${index % 2}`
  }))
  let active = 0
  let peak = 0
  const counts: URL[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/mdm_process_route_step')) {
      await route.fulfill({
        headers: { 'content-range': '0-6/7', 'access-control-expose-headers': 'content-range' },
        json: rows
      })
      return
    }
    counts.push(url)
    expect(route.request().method()).toBe('HEAD')
    expect(route.request().headers().prefer).toContain('count=exact')
    const index = Number(url.searchParams.get('process_route_step_id')?.replace('eq.step-', ''))
    expect(url.searchParams.get('tenant_id')).toBe(`eq.tenant-${index % 2}`)
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await route.fulfill({
      headers: {
        'content-range': `*/${index === 0 ? 10001 : index}`,
        'access-control-expose-headers': 'content-range'
      },
      body: ''
    })
    active -= 1
  })
  await page.goto('/tests/e2e/fixtures/process-step-counts.html')
  await page.getByRole('button', { name: '查询工序' }).click()
  await expect(page.getByTestId('step-result')).toContainText('componentAssignmentCount')
  const result = JSON.parse(await page.getByTestId('step-result').innerText())
  expect(
    result.data.map((row: { componentAssignmentCount: number }) => row.componentAssignmentCount)
  ).toEqual([10001, 1, 2, 3, 4, 5, 6])
  expect(result.data.map((row: { id: string }) => row.id)).toEqual(rows.map((row) => row.id))
  expect(counts).toHaveLength(7)
  expect(result.total).toBe(7)
  expect(peak).toBe(3)
})

test('关联计数失败时不返回部分工序统计', async ({ page }) => {
  let counts = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/mdm_process_route_step')) {
      await route.fulfill({
        json: Array.from({ length: 7 }, (_, index) => ({
          id: `step-${index}`,
          tenant_id: 'tenant-a'
        }))
      })
      return
    }
    counts += 1
    if (url.searchParams.get('process_route_step_id') === 'eq.step-0') {
      await route.fulfill({ status: 500, body: '' })
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill({
        headers: { 'content-range': '*/1', 'access-control-expose-headers': 'content-range' },
        body: ''
      })
    }
  })
  await page.goto('/tests/e2e/fixtures/process-step-counts.html')
  await page.getByRole('button', { name: '查询工序' }).click()
  await expect(page.getByTestId('step-result')).toHaveText('查询失败')
  expect(counts).toBe(3)
})
