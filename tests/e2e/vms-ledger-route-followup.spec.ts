import { expect, test, type Page, type Response } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({
  storageState: { cookies: [], origins: [] },
  actionTimeout: 15_000,
  timezoneId: 'Asia/Shanghai'
})
test.setTimeout(900_000)

type LedgerKind = 'fuel' | 'electric'
const tenantId = '11111111-1111-4111-8111-111111111111'
const cards = [
  { id: 'card-a', cardNo: 'QA-CARD-A', balance: 1680.25 },
  { id: 'card-b', cardNo: 'QA-CARD-B', balance: 320.5 }
] as const

const cardRow = (card: (typeof cards)[number]) => ({
  id: card.id,
  tenantId,
  vehicleId: 'vehicle-' + card.id,
  plateNo: card.id === 'card-a' ? '测A·10001' : '测A·10002',
  companyName: '验收物流',
  cardNo: card.cardNo,
  issuer: '验收能源服务',
  imagePath: null,
  fuelType: 'diesel_0',
  ownerEmployeeId: null,
  ownerEmployeeName: null,
  openerEmployeeId: null,
  openerEmployeeName: null,
  driverId: null,
  driverName: null,
  status: 'active',
  balance: card.balance,
  remark: '',
  createTime: '2026-10-01T08:00:00+08:00',
  updateTime: '2026-10-20T08:00:00+08:00'
})

const entryRow = (
  kind: LedgerKind,
  card: (typeof cards)[number],
  type: 'recharge' | 'consume'
) => ({
  id: kind + '-' + card.id + '-' + type,
  postingSeq: card.id === 'card-a' ? 2 : 3,
  tenantId,
  cardId: card.id,
  cardNo: card.cardNo,
  vehicleId: 'vehicle-' + card.id,
  plateNo: card.id === 'card-a' ? '测A·10001' : '测A·10002',
  companyName: '验收物流',
  cardStatus: 'active',
  driverId: null,
  driverName: null,
  entryType: type,
  amount: type === 'recharge' ? 100 : 20,
  signedAmount: type === 'recharge' ? 100 : -20,
  balanceAfter: card.balance,
  cardBalance: card.balance,
  occurredAt: '2026-10-20T08:00:00+08:00',
  occurredOn: '2026-10-20',
  stationName: kind === 'fuel' ? '验收加油站' : '验收充电站',
  liters: null,
  unitPrice: null,
  paymentMethod: null,
  voucherPaths: [],
  sourceCostId: null,
  sourceCostNo: null,
  rechargeChannel: '',
  invoiceNo: '',
  rechargerEmployeeId: null,
  rechargerEmployeeName: null,
  waybillId: null,
  waybillNo: null,
  expenseLocation: '',
  expenseLongitude: null,
  expenseLatitude: null,
  expenseCoordinateSystem: null,
  expenseCoordinateSource: null,
  expenseCoordinateStatus: '',
  expenseGeocodeProvider: null,
  expenseGeocodedAt: null,
  odometerKm: null,
  tripFuelPer100Km: null,
  chargeKwh: null,
  pileNo: '',
  referenceNo: kind + '-' + card.id + '-' + type,
  remark: '',
  reversesEntryId: null,
  isReversed: false,
  createTime: '2026-10-20T08:00:00+08:00'
})

const entries = (['fuel', 'electric'] as const).flatMap((kind) => [
  entryRow(kind, cards[0], 'recharge'),
  entryRow(kind, cards[0], 'consume'),
  entryRow(kind, cards[1], 'consume')
])

const tasks = [
  {
    id: 'task-accepted',
    waybillNo: 'QA-TASK-ACCEPTED',
    plateNo: '测A·10001',
    driverName: '验收司机',
    originCity: '上海',
    destinationCity: '杭州',
    status: 'accepted',
    plannedDepartureAt: '2026-10-20T08:00:00+08:00',
    actualDepartureAt: '2026-10-20T09:15:00+08:00',
    actualArrivalAt: '2026-10-20T12:30:00+08:00',
    distanceKm: 180,
    returnDistanceKm: null,
    registeredTollFee: null,
    registeredOtherFee: null,
    approvedTollFee: null,
    approvedOtherFee: null,
    hasReturnLeg: false
  },
  {
    id: 'task-pending',
    waybillNo: 'QA-TASK-PENDING',
    plateNo: '测A·10002',
    driverName: null,
    originCity: '上海',
    destinationCity: '苏州',
    status: 'pending',
    plannedDepartureAt: null,
    actualDepartureAt: null,
    actualArrivalAt: null,
    distanceKm: null,
    returnDistanceKm: null,
    registeredTollFee: null,
    registeredOtherFee: null,
    approvedTollFee: null,
    approvedOtherFee: null,
    hasReturnLeg: false
  }
]

async function pushCard(page: Page, cardId?: string): Promise<void> {
  await page.evaluate(async (id) => {
    const bridge = window as typeof window & {
      __vmsLedgerPushQuery: (cardId?: string) => Promise<unknown>
    }
    await bridge.__vmsLedgerPushQuery(id)
  }, cardId)
}

async function afterRender(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

for (const kind of ['fuel', 'electric'] as const) {
  test(kind + ' 流水在同一组件切卡、余额延迟与筛选时保持一致', async ({ page }, info) => {
    const pageErrors: string[] = []
    const writes: string[] = []
    const entryCalls: Array<{ cardId: unknown; type: unknown }> = []
    const lateAResponses: Response[] = []
    let heldBCalls = 0
    let heldACalls = 0
    let holdB = false
    let holdLateA = false
    let releaseB: () => void = () => {}
    let releaseA: () => void = () => {}
    const bGate = new Promise<void>((resolve) => {
      releaseB = resolve
    })
    const aGate = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const cardEndpoint =
      kind === 'fuel' ? 'vms_list_fuel_cards_secure' : 'vms_list_electric_cards_secure'
    const entryEndpoint =
      kind === 'fuel'
        ? 'vms_list_fuel_card_entries_secure'
        : 'vms_list_electric_card_entries_secure'
    const cardLabel = kind === 'fuel' ? '油卡' : '电卡'
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('response', (response) => {
      if (holdLateA && new URL(response.url()).pathname.endsWith('/' + cardEndpoint)) {
        const payload = response.request().postDataJSON() as Record<string, unknown>
        const selected =
          kind === 'fuel' ? (payload.p_ids as string[] | null)?.[0] : payload.p_card_id
        if (selected === 'card-a') lateAResponses.push(response)
      }
    })
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const endpoint = new URL(request.url()).pathname.split('/').at(-1)
      const payload =
        request.method() === 'POST' ? (request.postDataJSON() as Record<string, unknown>) : {}
      if (endpoint === cardEndpoint) {
        const selected =
          kind === 'fuel' ? (payload.p_ids as string[] | null)?.[0] : payload.p_card_id
        if (selected === 'card-b' && holdB) {
          heldBCalls++
          await bGate
        }
        if (selected === 'card-a' && holdLateA) {
          heldACalls++
          await aGate
        }
        const matched = selected ? cards.filter((card) => card.id === selected) : cards
        return route.fulfill({ json: { records: matched.map(cardRow), total: matched.length } })
      }
      if (endpoint === entryEndpoint) {
        entryCalls.push({ cardId: payload.p_card_id, type: payload.p_entry_type })
        const matched = entries.filter(
          (row) =>
            row.id.startsWith(kind) &&
            (!payload.p_card_id || row.cardId === payload.p_card_id) &&
            (!payload.p_entry_type || row.entryType === payload.p_entry_type)
        )
        return route.fulfill({ json: { records: matched, total: matched.length } })
      }
      writes.push(request.method() + ' ' + endpoint)
      return route.fulfill({ status: 405, json: { message: '测试禁止写入' } })
    })
    await installDictionaryOptions(page, {
      fuelCardStatus: [
        { value: 'active', label: '在用' },
        { value: 'disabled', label: '停用' }
      ],
      fuelCardEntryType: [
        { value: 'recharge', label: '充值' },
        { value: 'consume', label: '消费' }
      ]
    })
    await page.setViewportSize(
      kind === 'fuel' ? { width: 1440, height: 900 } : { width: 1024, height: 768 }
    )
    await page.goto('/tests/e2e/fixtures/vms-ledger-route-followup.html?kind=' + kind, {
      waitUntil: 'commit',
      timeout: 360_000
    })
    if (kind === 'electric') {
      await page.evaluate(() => document.documentElement.classList.add('dark'))
    }
    const root = await page.locator('.business-workspace-page').elementHandle({ timeout: 360_000 })
    expect(root).not.toBeNull()
    const balance = page
      .locator('.business-workspace-header__metric')
      .filter({ hasText: '所选' + cardLabel + '余额' })
      .locator('strong')
    await expect(balance).toHaveText('¥1,680.25', { timeout: 360_000 })
    await expect(page.getByText(kind + '-card-a-recharge')).toBeVisible()
    holdB = true
    await pushCard(page, 'card-b')
    await expect.poll(() => heldBCalls).toBeGreaterThan(0)
    await expect.poll(() => entryCalls.at(-1)?.cardId).toBe('card-b')
    await expect(balance).toHaveText('--')
    await expect(page.getByText(kind + '-card-a-recharge')).toHaveCount(0)
    expect(await root!.evaluate((node) => node.isConnected)).toBe(true)
    releaseB()
    holdB = false
    await expect(balance).toHaveText('¥320.50')
    await expect(page.getByText(kind + '-card-b-consume')).toBeVisible()

    holdLateA = true
    await pushCard(page, 'card-a')
    await expect.poll(() => heldACalls).toBeGreaterThan(0)
    await expect(balance).toHaveText('--')
    await pushCard(page, 'card-b')
    await expect(balance).toHaveText('¥320.50')
    const pendingA = heldACalls
    releaseA()
    await expect.poll(() => lateAResponses.length).toBe(pendingA)
    await Promise.all(lateAResponses.map((response) => response.finished()))
    await afterRender(page)
    await expect(balance).toHaveText('¥320.50')
    expect(await root!.evaluate((node) => node.isConnected)).toBe(true)

    await page
      .locator('[aria-label="' + cardLabel + '流水类型视图"] .el-segmented__item')
      .filter({ hasText: '充值记录' })
      .click()
    await expect.poll(() => entryCalls.at(-1)?.type).toBe('recharge')
    await expect(page.getByText(kind + '-card-b-consume')).toHaveCount(0)
    await pushCard(page)
    await expect.poll(() => entryCalls.at(-1)?.cardId).toBe(null)
    await expect(page.getByText(kind + '-card-a-recharge')).toBeVisible()
    await expect(
      page
        .locator('.business-workspace-header__metric')
        .filter({ hasText: '本页' + cardLabel + '余额' })
    ).toBeVisible()
    expect(await root!.evaluate((node) => node.isConnected)).toBe(true)
    await page.screenshot({
      path: info.outputPath(
        kind + '-ledger-' + (kind === 'fuel' ? 'light-1440' : 'dark-1024') + '.png'
      ),
      fullPage: true
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(pageErrors).toEqual([])
    expect(writes).toEqual([])
  })
}

test('自有车任务筛选已接单，实际时间及空值对应各自列', async ({ page }, info) => {
  const pageErrors: string[] = []
  const writes: string[] = []
  const statuses: unknown[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname.split('/').at(-1)
    if (endpoint === 'vms_list_own_vehicle_tasks_secure') {
      const payload = request.postDataJSON() as Record<string, unknown>
      statuses.push(payload.p_status)
      const records = payload.p_status
        ? tasks.filter((row) => row.status === payload.p_status)
        : tasks
      return route.fulfill({ json: { records, total: records.length, canViewCosts: false } })
    }
    writes.push(request.method() + ' ' + endpoint)
    return route.fulfill({ status: 405, json: { message: '测试禁止写入' } })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/vms-ledger-route-followup.html?kind=task', {
    waitUntil: 'commit',
    timeout: 360_000
  })
  const table = page.locator('.own-vehicle-task-page .el-table')
  await expect(table.getByText('QA-TASK-ACCEPTED')).toBeVisible({ timeout: 360_000 })
  await expect(table.getByText('QA-TASK-PENDING')).toBeVisible()
  const headers = await table.locator('.el-table__header-wrapper th .cell').allTextContents()
  const departureIndex = headers.findIndex((label) => label.trim() === '实际发车')
  const arrivalIndex = headers.findIndex((label) => label.trim() === '实际到达')
  expect(departureIndex).toBeGreaterThanOrEqual(0)
  expect(arrivalIndex).toBeGreaterThanOrEqual(0)
  const accepted = table
    .locator('.el-table__body-wrapper tr.el-table__row')
    .filter({ hasText: 'QA-TASK-ACCEPTED' })
  const pending = table
    .locator('.el-table__body-wrapper tr.el-table__row')
    .filter({ hasText: 'QA-TASK-PENDING' })
  await expect(accepted.locator('td').nth(departureIndex)).toContainText('2026-10-20 09:15')
  await expect(accepted.locator('td').nth(arrivalIndex)).toContainText('2026-10-20 12:30')
  await expect(pending.locator('td').nth(departureIndex)).toHaveText('—')
  await expect(pending.locator('td').nth(arrivalIndex)).toHaveText('—')
  await page.screenshot({ path: info.outputPath('own-task-light-1440.png'), fullPage: true })
  const statusField = page.locator('.el-form-item').filter({ hasText: '任务状态' })
  await statusField.locator('.el-select').click()
  await page.getByRole('option', { name: '已接单' }).click()
  await page.getByRole('button', { name: '查询' }).click()
  await expect.poll(() => statuses.at(-1)).toBe('accepted')
  await expect(pending).toHaveCount(0)
  await expect(accepted).toBeVisible()
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  for (const [column, value] of [
    [departureIndex, '2026-10-20 09:15:00'],
    [arrivalIndex, '2026-10-20 12:30:00']
  ] as const) {
    const cell = accepted.locator('td').nth(column).locator('.cell')
    await cell.scrollIntoViewIfNeeded()
    await cell.hover()
    await expect(
      page.locator('.el-popper[role="tooltip"]:visible').filter({ hasText: value })
    ).toBeVisible()
  }
  await page.screenshot({ path: info.outputPath('own-task-dark-1024.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(pageErrors).toEqual([])
  expect(writes).toEqual([])
})
