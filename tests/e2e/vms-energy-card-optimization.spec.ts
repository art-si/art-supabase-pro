import { expect, test, type Page } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(300_000)

const baseCard = {
  id: 'card-1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  vehicleId: 'vehicle-1',
  plateNo: '测A·10001',
  companyName: '验收运输公司',
  vehicleOwnership: 'carrier',
  carrierName: '验收承运商',
  driverPhone: '138****0001',
  cardNo: 'YK2026001',
  issuer: '亿油卡',
  imagePath: null,
  ownerEmployeeId: null,
  ownerEmployeeName: null,
  openerEmployeeId: null,
  openerEmployeeName: null,
  driverId: null,
  driverName: '验收司机',
  status: 'active',
  balance: 1250,
  remark: '',
  createTime: '2026-11-02T08:00:00Z',
  updateTime: '2026-11-02T08:00:00Z'
}
const fuelCard = { ...baseCard, fuelType: 'diesel_0' }
const electricCard = { ...baseCard, cardNo: 'DK2026001', issuer: '亿电卡' }
const commonEntry = {
  id: 'entry-1',
  tenantId: baseCard.tenantId,
  cardId: 'card-1',
  cardNo: baseCard.cardNo,
  vehicleId: 'vehicle-1',
  plateNo: baseCard.plateNo,
  companyName: baseCard.companyName,
  vehicleOwnership: 'carrier',
  carrierName: '验收承运商',
  vehicleDriverName: '验收司机',
  vehicleDriverPhone: '138****0001',
  cardStatus: 'active',
  driverId: null,
  driverName: '验收司机',
  entryType: 'consume',
  amount: 100,
  signedAmount: -100,
  balanceAfter: 1250,
  cardBalance: 1250,
  waybillId: null,
  waybillNo: 'YD2026001',
  expenseLocation: '',
  expenseLongitude: null,
  expenseLatitude: null,
  expenseCoordinateSystem: null,
  expenseCoordinateSource: null,
  expenseCoordinateStatus: 'pending',
  expenseGeocodeProvider: null,
  expenseGeocodedAt: null,
  stationName: '',
  unitPrice: null,
  rechargeChannel: '',
  invoiceNo: '',
  referenceNo: '',
  voucherPaths: [],
  remark: '',
  reversesEntryId: null,
  isReversed: false,
  createTime: '2026-11-02T08:00:00Z'
}
const fuelEntry = {
  ...commonEntry,
  sourceCostId: null,
  sourceCostNo: 'YDFY2026001',
  liters: null,
  paymentMethod: 'fuel_card',
  rechargerEmployeeId: null,
  rechargerEmployeeName: null,
  occurredAt: null,
  occurredOn: '2026-11-02',
  odometerKm: null,
  tripFuelPer100Km: null
}
const electricEntry = {
  ...commonEntry,
  postingSeq: 1,
  cardNo: 'DK2026001',
  sourceCostNo: null,
  occurredAt: '2026-11-02T08:00:00Z',
  chargeKwh: null,
  pileNo: ''
}

async function setup(page: Page, kind: string) {
  const requests: Array<Record<string, unknown>> = []
  const unexpected: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    unexpected.push(route.request().url())
    return route.fulfill({ status: 400, json: { message: 'unexpected test request' } })
  })
  await installDictionaryOptions(page, {
    vehicleOwnership: [{ value: 'carrier', label: '承运商' }],
    vehicleType: [{ value: 'semi_trailer', label: '半挂车' }],
    fuelCardStatus: [{ value: 'active', label: '正常' }],
    fuelCardEntryType: [{ value: 'consume', label: '消费' }],
    fuelCardFuelType: [{ value: 'diesel_0', label: '0号柴油' }],
    vmsCardViewMode: [
      { value: 'list', label: '按明细' },
      { value: 'cards', label: '按卡片' }
    ]
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  await page.route('**/rest/v1/rpc/vms_list_vehicle_archive_navigation_secure', (route) =>
    route.fulfill({
      json: [{ id: 'vehicle-1', vehicleOwnership: 'carrier', vehicleType: 'semi_trailer' }]
    })
  )
  const rpc = {
    fuel: 'vms_list_fuel_cards_secure',
    electric: 'vms_list_electric_cards_secure_v2',
    'fuel-ledger': 'vms_list_fuel_card_entries_secure',
    'electric-ledger': 'vms_list_electric_card_entries_secure_v2'
  }[kind]!
  await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    const record =
      kind === 'fuel'
        ? fuelCard
        : kind === 'electric'
          ? electricCard
          : kind === 'fuel-ledger'
            ? fuelEntry
            : electricEntry
    const records =
      kind === 'fuel' || kind === 'electric'
        ? Array.from({ length: 5 }, (_, index) => ({
            ...record,
            id: `card-${index + 1}`,
            cardNo: `${record.cardNo.slice(0, -1)}${index + 1}`
          }))
        : [record]
    return route.fulfill({ json: { records, total: records.length } })
  })
  if (kind === 'fuel' || kind === 'electric') {
    const ledgerRpc =
      kind === 'fuel'
        ? 'vms_list_fuel_card_entries_secure'
        : 'vms_list_electric_card_entries_secure_v2'
    await page.route(`**/rest/v1/rpc/${ledgerRpc}`, (route) =>
      route.fulfill({ json: { records: [], total: 0 } })
    )
  }
  if (kind === 'fuel-ledger' || kind === 'electric-ledger') {
    const cardRpc =
      kind === 'fuel-ledger' ? 'vms_list_fuel_cards_secure' : 'vms_list_electric_cards_secure_v2'
    const record = kind === 'fuel-ledger' ? fuelCard : electricCard
    await page.route(`**/rest/v1/rpc/${cardRpc}`, (route) =>
      route.fulfill({ json: { records: [record], total: 1 } })
    )
  }
  return { requests, unexpected }
}

for (const kind of ['fuel', 'electric', 'fuel-ledger', 'electric-ledger']) {
  test(`${kind} 分类级联和关联字段`, async ({ page }, testInfo) => {
    const { requests, unexpected } = await setup(page, kind)
    const isFuel = kind === 'fuel' || kind === 'fuel-ledger'
    await page.goto(
      `/tests/e2e/fixtures/vms-operations-optimization.html?kind=${kind}${isFuel ? '&withActions=1' : ''}`,
      {
        waitUntil: 'domcontentloaded'
      }
    )
    const navigation = page.locator('.vehicle-classification-panel')
    await expect(navigation.getByText('半挂车', { exact: true })).toBeVisible({ timeout: 180_000 })
    await expect(page.getByRole('columnheader', { name: '车辆归属', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '所属承运商', exact: true })).toBeVisible()
    if (isFuel) {
      const operationRow = page.locator('.business-workspace-header__actions')
      await expect(
        operationRow.getByRole('button', {
          name: kind === 'fuel' ? '新增油卡' : '登记充值',
          exact: true
        })
      ).toBeVisible()
      await expect(
        page.locator('.business-workspace-header__hero .business-table-workspace-actions')
      ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-operation-row.png`),
        fullPage: true
      })
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-operation-row-dark.png`),
        fullPage: true
      })
      await page.evaluate(() => document.documentElement.classList.remove('dark'))
    }
    await navigation.getByText('半挂车', { exact: true }).click()
    await expect.poll(() => requests.at(-1)?.p_vehicle_ownership).toBe('carrier')
    await expect.poll(() => requests.at(-1)?.p_vehicle_type).toBe('semi_trailer')
    await page
      .locator('.business-table-workspace-actions__toggle')
      .filter({ hasText: '专注模式' })
      .locator('.el-switch')
      .click()
    await expect(page.locator('.business-workspace-header')).toBeHidden()
    await expect(navigation).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    await page
      .locator('.business-table-workspace-actions__toggle')
      .filter({ hasText: '专注模式' })
      .locator('.el-switch')
      .click()
    await expect(page.locator('.business-workspace-header')).toBeHidden()
    await page.getByRole('button', { name: '退出专注' }).click()
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    const primaryPane = page.locator('.art-workspace-splitter > .el-splitter-panel').first()
    await expect
      .poll(() => primaryPane.evaluate((pane) => pane.getBoundingClientRect().width))
      .toBeGreaterThan(200)
    const collapseIcon = page.locator('.el-splitter-bar__horizontal-collapse-icon-start')
    await expect(collapseIcon).toBeVisible()
    await collapseIcon.click()
    await expect
      .poll(() => primaryPane.evaluate((pane) => pane.getBoundingClientRect().width))
      .toBeLessThan(24)
    const expandIcon = page.locator('.el-splitter-bar__horizontal-collapse-icon-end')
    await expect(expandIcon).toBeVisible()
    await expandIcon.click()
    await expect
      .poll(() => primaryPane.evaluate((pane) => pane.getBoundingClientRect().width))
      .toBeGreaterThan(200)
    await expect(navigation).toBeVisible()
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(navigation).toBeVisible()
    await expect(page.locator('.art-workspace-splitter .el-splitter-bar')).toBeHidden()
    await page.setViewportSize({ width: 1440, height: 900 })
    if (kind === 'fuel' || kind === 'electric') {
      await page.getByText('按卡片', { exact: true }).click()
      await expect(page.getByText('交易流水', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('验收运输公司', { exact: false }).first()).toBeVisible()
      const columns = await page
        .locator('.energy-card-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
      expect(columns).toBeGreaterThanOrEqual(3)
      expect(columns).toBeLessThanOrEqual(4)
      await page.screenshot({ path: testInfo.outputPath(`${kind}-cards.png`), fullPage: true })
      await page.getByRole('button', { name: '交易流水' }).first().click()
      await expect(page.locator('output[aria-label="当前业务路由"]')).toContainText('cardId=card-1')
    } else {
      await expect(page.getByRole('columnheader', { name: '费用单号', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: '运单号', exact: true })).toBeVisible()
    }
    await page.screenshot({ path: testInfo.outputPath(`${kind}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(unexpected).toEqual([])
  })
}
