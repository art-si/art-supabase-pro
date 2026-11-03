import { expect, test, type Page, type Route } from '@playwright/test'
import dayjs from 'dayjs'
import { writeFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = (view: string) => `/tests/e2e/fixtures/pmis-equipment-options.html?view=${view}`

const equipment = (index: number, tenantId = tenantA) => ({
  id: `equipment-${tenantId === tenantA ? 'a' : 'b'}-${index}`,
  tenant_id: tenantId,
  equipment_code: `EQ-${String(index).padStart(4, '0')}`,
  equipment_name: `设备${index}`,
  production_department_id: 'department-a',
  operation_status: 'normal',
  status: 'enabled',
  department: {
    id: 'department-a',
    tenant_id: tenantId,
    parent_id: null,
    department_code: 'DEPT-A',
    department_name: '测试产线'
  }
})

const task = () => ({
  id: 'task-tail',
  tenant_id: tenantA,
  task_no: 'TASK-TAIL',
  planned_date: dayjs().format('YYYY-MM-DD'),
  shift_name: '早班',
  status: 'pending',
  task_source: 'scheduled',
  before_photo_files: [],
  after_photo_files: [],
  plan: {
    id: 'plan-a',
    plan_kind: 'inspection',
    plan_name: '测试点检方案',
    required_days: 1,
    require_photo: false,
    items: [
      {
        id: 'item-a',
        item_name: '尾页设备检查项',
        requirement: '检查运行状态',
        require_photo: false,
        sort: 1
      }
    ]
  },
  equipment: equipment(1001),
  results: []
})

const rowsA = Array.from({ length: 1001 }, (_, index) => equipment(index + 1))
const rowsB = [equipment(1, tenantB), equipment(2, tenantB)]

async function calendarGeometry(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('.pmis-calendar__matrix-card')
    const table = card?.querySelector('.el-table')
    const row = [...(card?.querySelectorAll('.el-table__row') ?? [])].find((item) =>
      item.textContent?.includes('检查项目乙')
    )
    const secondary = row?.querySelector('.pmis-calendar__identity-copy small')
    const box = (element: Element | null | undefined) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: rect.height }
    }
    const scroll = (element: Element | null | undefined) =>
      element
        ? {
            top: element.scrollTop,
            height: element.clientHeight,
            scrollHeight: element.scrollHeight
          }
        : null
    const ancestors: Array<{ className: string; overflowY: string; box: ReturnType<typeof box> }> =
      []
    for (
      let current = secondary?.parentElement;
      current && current !== card;
      current = current.parentElement
    ) {
      const overflowY = getComputedStyle(current).overflowY
      if (overflowY !== 'visible')
        ancestors.push({ className: String(current.className), overflowY, box: box(current) })
    }
    return {
      viewportHeight: innerHeight,
      fullHeightVariable: getComputedStyle(
        document.querySelector('.pmis-calendar')!
      ).getPropertyValue('--art-full-height'),
      root: box(document.querySelector('.pmis-calendar')),
      card: box(card),
      cardHeader: box(card?.querySelector('.art-section-card__header')),
      outerScroll: scroll(card?.querySelector('.art-section-card__scrollbar .el-scrollbar__wrap')),
      table: box(table),
      tableHeader: box(table?.querySelector('.el-table__header-wrapper')),
      tableBody: scroll(table?.querySelector('.el-table__body-wrapper')),
      row: box(row),
      secondary: box(secondary),
      ancestors
    }
  })
}

type EquipmentRead = { offset: number; limit: number; url: URL; headers: Record<string, string> }

async function fulfillPage(
  route: Route,
  rows: unknown[],
  offset: number,
  limit: number
): Promise<void> {
  const page = rows.slice(offset, offset + limit)
  await route.fulfill({
    headers: {
      'content-range': page.length
        ? `${offset}-${offset + page.length - 1}/${rows.length}`
        : `*/${rows.length}`,
      'access-control-expose-headers': 'content-range'
    },
    json: page
  })
}

async function intercept(
  page: Page,
  onEquipment: (route: Route, read: EquipmentRead) => Promise<void> = (route, read) =>
    fulfillPage(
      route,
      read.url.searchParams.get('tenant_id') === `eq.${tenantB}` ? rowsB : rowsA,
      read.offset,
      read.limit
    ),
  taskRows: unknown[] = [task()]
): Promise<EquipmentRead[]> {
  const reads: EquipmentRead[] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    if (table === 'mdm_equipment') {
      const read = {
        offset: Number(url.searchParams.get('offset') ?? 0),
        limit: Number(url.searchParams.get('limit') ?? 20),
        url,
        headers: route.request().headers()
      }
      reads.push(read)
      await onEquipment(route, read)
      return
    }
    if (table === 'pmis_task') {
      await fulfillPage(route, taskRows, 0, 500)
      return
    }
    await route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  return reads
}

for (const withItemIds of [false, true]) {
  test(`日历两方案同序项目${withItemIds ? '带' : '不带'}item ID仍显示各自方案名`, async ({
    page
  }, info) => {
    const errors: string[] = []
    const unexpectedRest: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const taskRows = ['甲', '乙'].map((label) => {
      const base = task()
      return {
        ...base,
        id: `task-plan-${label}`,
        task_no: `TASK-PLAN-${label}`,
        plan: {
          ...base.plan,
          id: `plan-${label}`,
          plan_name: `点检方案${label}`,
          items: [
            {
              ...base.plan.items[0],
              id: withItemIds ? `item-${label}` : undefined,
              item_name: `检查项目${label}`,
              requirement: `检查要求${label}`,
              sort: 1
            }
          ]
        }
      }
    })
    const equipmentReads = await intercept(
      page,
      (route, read) => fulfillPage(route, [equipment(1001)], read.offset, read.limit),
      taskRows
    )
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1) || ''
      if (endpoint === 'get_table_column_runtime') {
        expect(route.request().postDataJSON().p_route_path).toBe(
          '/pmis/inspection/inspection-detail'
        )
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      }
      if (route.request().method() !== 'GET') {
        writes.push(`${route.request().method()} ${endpoint}`)
        return route.abort()
      }
      if (
        !['mdm_equipment', 'mdm_production_department', 'pmis_task', 'sys_dictionary'].includes(
          endpoint
        )
      )
        unexpectedRest.push(endpoint)
      return route.fallback()
    })
    const dark = info.project.name.includes('dark')
    await page.goto(
      `/tests/e2e/fixtures/pmis-calendar-scope.html?mode=detail&configured=true&theme=${dark ? 'dark' : 'light'}`,
      { waitUntil: 'domcontentloaded' }
    )
    await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
    const picker = page.getByRole('combobox', { name: '设备' })
    await picker.click()
    await picker.fill('设备1001')
    await page.getByRole('option', { name: /设备1001.*EQ-1001/ }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const rowA = page.getByRole('row').filter({ hasText: '检查项目甲' })
    const rowB = page.getByRole('row').filter({ hasText: '检查项目乙' })
    await expect(rowA).toContainText('检查要求甲（点检方案甲）')
    await expect(rowB).toContainText('检查要求乙（点检方案乙）')
    await expect(rowB).not.toContainText('点检方案甲')
    const beforeGeometry = await calendarGeometry(page)
    await writeFile(
      info.outputPath('geometry-before.json'),
      JSON.stringify(beforeGeometry, null, 2)
    )
    await rowB.scrollIntoViewIfNeeded()
    await expect(rowB).toBeInViewport()
    const afterGeometry = await calendarGeometry(page)
    await writeFile(info.outputPath('geometry-after.json'), JSON.stringify(afterGeometry, null, 2))
    expect(afterGeometry.fullHeightVariable).toBe('calc(100dvh - 56px)')
    if (page.viewportSize()!.width >= 900) {
      expect(afterGeometry.outerScroll?.top).toBe(0)
      expect(afterGeometry.outerScroll!.scrollHeight).toBeLessThanOrEqual(
        afterGeometry.outerScroll!.height + 1
      )
      expect(afterGeometry.tableHeader!.top).toBeGreaterThanOrEqual(
        afterGeometry.cardHeader!.bottom
      )
      expect(afterGeometry.secondary!.bottom).toBeLessThanOrEqual(afterGeometry.card!.bottom)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath(`plan-names-${withItemIds ? 'with' : 'without'}-ids.png`)
    })
    expect(equipmentReads).toHaveLength(1)
    expect(unexpectedRest).toEqual([])
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

for (const view of ['dashboard', 'calendar'] as const) {
  test(`${view} loads the 1001st equipment and keeps its task visible after selection`, async ({
    page
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const reads = await intercept(page)
    await page.goto(fixture(view), { waitUntil: 'domcontentloaded' })
    await expect.poll(() => reads.map(({ offset }) => offset)).toEqual([0, 500, 1000])
    expect(reads.every(({ limit }) => limit === 500)).toBe(true)
    expect(reads.every(({ url }) => url.searchParams.get('status') === 'eq.enabled')).toBe(true)
    expect(reads.every(({ url }) => url.searchParams.get('tenant_id') === `eq.${tenantA}`)).toBe(
      true
    )
    expect(
      reads.every(({ url }) => url.searchParams.get('order') === 'equipment_code.asc,id.asc')
    ).toBe(true)

    const picker = page.getByRole('combobox', { name: view === 'dashboard' ? '筛选设备' : '设备' })
    await picker.click()
    await picker.fill('设备1001')
    const option = page.getByRole('option', { name: /设备1001.*EQ-1001/ })
    await expect(option).toBeVisible()
    await option.click()
    if (view === 'dashboard') {
      await expect(page.locator('.pmis-dashboard__grid')).toContainText('设备1001')
      await expect(page.locator('.pmis-dashboard__grid')).toContainText('测试点检方案')
    } else {
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(page.locator('.pmis-calendar__content')).toContainText('尾页设备检查项')
      await expect(page.locator('.pmis-calendar__content')).not.toContainText('请先选择设备')
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`${view}-tail-selected.png`) })
    expect(errors).toEqual([])
  })

  test(`${view} rejects a missing second page and recovers on retry`, async ({ page }, info) => {
    let failSecond = true
    const reads = await intercept(page, async (route, read) => {
      if (read.offset === 500 && failSecond) {
        failSecond = false
        await route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'temporary failure' }
        })
      } else await fulfillPage(route, rowsA, read.offset, read.limit)
    })
    await page.goto(fixture(view), { waitUntil: 'domcontentloaded' })
    if (view === 'dashboard') {
      await expect(page.getByText('部分筛选选项暂不可用')).toBeVisible()
      await expect(page.getByRole('combobox', { name: '筛选设备' })).toBeDisabled()
      await expect(page.locator('.pmis-dashboard__grid')).toContainText('设备1001')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.getByText('部分筛选选项暂不可用').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`${view}-second-page-failed.png`) })
      await page.getByRole('button', { name: '重新加载筛选' }).click()
      await expect(page.getByText('部分筛选选项暂不可用')).toHaveCount(0)
    } else {
      await expect(page.getByText('设备筛选暂不可用')).toBeVisible()
      await expect(page.getByText('请先选择设备')).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.getByText('设备筛选暂不可用').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`${view}-second-page-failed.png`) })
      await page.getByRole('button', { name: '重新加载设备' }).click()
      await expect(page.getByText('设备筛选暂不可用')).toHaveCount(0)
    }
    await expect.poll(() => reads.filter(({ offset }) => offset === 1000).length).toBe(1)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
  })
}

test('paged API remains 20 and selector remains its existing 10-row page', async ({ page }) => {
  const reads = await intercept(page)
  await page.goto(fixture('api'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '加载单页20' }).click()
  await expect(page.getByTestId('api-status')).toHaveText('success')
  await expect(page.getByTestId('api-count')).toHaveText('20')
  await expect(page.getByTestId('api-total')).toHaveText('1001')
  expect(reads.map(({ offset, limit }) => [offset, limit])).toEqual([[0, 20]])

  const selectorPage = await page.context().newPage()
  const selectorReads = await intercept(selectorPage)
  await selectorPage.goto(fixture('selector'), { waitUntil: 'domcontentloaded' })
  await selectorPage.getByRole('textbox', { name: '请选择一台生产设备' }).click()
  const dialog = selectorPage.getByRole('dialog', { name: '选择设备' })
  await expect(dialog).toBeVisible()
  await expect.poll(() => selectorReads.map(({ limit }) => limit)).toEqual([10])
  await dialog.locator('.el-pagination .btn-next').click()
  await expect.poll(() => selectorReads.map(({ offset }) => offset)).toEqual([0, 10])
  expect(selectorReads.map(({ limit }) => limit)).toEqual([10, 10])
})

test('cancelled snapshot publishes no partial data and tenant filters survive retry', async ({
  page
}) => {
  let releaseSecond: (() => void) | undefined
  const holdSecond = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  let hold = true
  const reads = await intercept(page, async (route, read) => {
    if (read.offset === 500 && hold) {
      await holdSecond
      await route
        .fulfill({ status: 499, json: { code: 'ABORTED', message: 'cancelled' } })
        .catch(() => {})
      return
    }
    await fulfillPage(
      route,
      read.url.searchParams.get('tenant_id') === `eq.${tenantB}` ? rowsB : rowsA,
      read.offset,
      read.limit
    )
  })
  await page.goto(fixture('api'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '加载完整设备' }).click()
  await expect.poll(() => reads.some(({ offset }) => offset === 500)).toBe(true)
  await page.getByRole('button', { name: '取消设备读取' }).click()
  releaseSecond?.()
  await expect(page.getByTestId('api-status')).toHaveText('cancelled')
  await expect(page.getByTestId('api-count')).toHaveText('0')
  hold = false
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await page.getByRole('button', { name: '加载完整设备' }).click()
  await expect(page.getByTestId('api-status')).toHaveText('success')
  await expect(page.getByTestId('api-count')).toHaveText('2')
  const tenantBRead = reads.find(({ url }) => url.searchParams.get('tenant_id') === `eq.${tenantB}`)
  expect(tenantBRead?.url.searchParams.get('production_department_id')).toBe('eq.department-a')
  expect(tenantBRead?.url.searchParams.get('status')).toBe('eq.enabled')
  expect(tenantBRead?.url.searchParams.get('or')).toContain('equipment_code.ilike')
  expect(tenantBRead?.url.searchParams.get('order')).toBe('equipment_code.asc,id.asc')
  expect(tenantBRead?.headers['x-art-tenant-scope']).toBe(tenantB)
})

test('snapshot freezes filters when the caller mutates its query during paging', async ({
  page
}) => {
  let releaseSecond: (() => void) | undefined
  const holdSecond = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  const reads = await intercept(page, async (route, read) => {
    if (read.offset === 500) await holdSecond
    await fulfillPage(route, rowsA, read.offset, read.limit)
  })
  await page.goto(fixture('api'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '加载完整设备' }).click()
  await expect.poll(() => reads.some(({ offset }) => offset === 500)).toBe(true)
  await page.getByRole('button', { name: '更改请求条件' }).click()
  releaseSecond?.()
  await expect(page.getByTestId('api-status')).toHaveText('success')
  await expect(page.getByTestId('api-count')).toHaveText('1001')
  expect(reads.map(({ offset }) => offset)).toEqual([0, 500, 1000])
  expect(reads.every(({ url }) => url.searchParams.get('or')?.includes('泵'))).toBe(true)
  expect(
    reads.every(({ url }) => url.searchParams.get('production_department_id') === 'eq.department-a')
  ).toBe(true)
  expect(reads.every(({ url }) => url.searchParams.get('tenant_id') === `eq.${tenantA}`)).toBe(true)
})
