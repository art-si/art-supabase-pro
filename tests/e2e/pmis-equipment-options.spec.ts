import { expect, test, type Page, type Route } from '@playwright/test'
import dayjs from 'dayjs'
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
    )
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
      await fulfillPage(route, [task()], 0, 500)
      return
    }
    await route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  return reads
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
