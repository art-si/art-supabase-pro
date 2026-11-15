import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import type { FuelCard, FuelCardEntry } from '@/api/fuel-card'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(900_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const vehicleIds = ['11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102']
const cardIds = ['11111111-1111-4111-8111-111111111601', '11111111-1111-4111-8111-111111111602']

test('油卡对账导入拒绝无效金额，合法文件可预览并提交', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'get_table_column_runtime') {
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    }
    if (endpoint === 'vms_list_fuel_card_entries_secure') {
      return route.fulfill({ json: { records: [], total: 0 } })
    }
    return route.fulfill({ json: [] })
  })
  const validFile = {
    name: 'valid-station.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '油卡号,消费时间,金额,加油站,加油升数\n000123,2026-11-02,"1,234.56",验收站,'
    )
  }
  const invalidFile = {
    ...validFile,
    name: 'invalid-station.csv',
    buffer: Buffer.from(validFile.buffer.toString().replace('1,234.56', '12,34'))
  }
  const imports: unknown[] = []
  await page.route('**/rest/v1/rpc/vms_import_fuel_statement_secure', (route) => {
    imports.push(route.request().postDataJSON())
    return route.fulfill({
      json: { batchId: 'fixture-batch', matched: 1, difference: 0, unmatched: 0 }
    })
  })

  await page.goto('/tests/e2e/fixtures/vms-fuel-card-visual.html?page=ledger')
  await page.getByRole('button', { name: '站点对账', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '加油站对账' })
  const input = drawer.locator('input[type="file"]')
  const confirm = drawer.getByRole('button', { name: '确认导入', exact: true })
  await expect
    .poll(async () => (await drawer.locator('.el-select').first().boundingBox())?.width ?? 0)
    .toBeGreaterThan(150)
  await input.setInputFiles(invalidFile)
  const error = page.getByText('第 2 行金额无效。', { exact: true })
  await expect(error).toBeVisible()
  await expect(confirm).toHaveCount(0)
  expect(imports).toHaveLength(0)

  await input.setInputFiles(validFile)
  await expect(drawer.getByRole('heading', { name: '待导入 · valid-station.csv' })).toBeVisible()
  await expect(drawer.getByRole('cell', { name: /1,234\.56/ })).toBeInViewport({ ratio: 1 })
  await expect(error).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await drawer.screenshot({
    path: info.outputPath('fuel-statement-preview.png'),
    animations: 'disabled'
  })
  await confirm.click()
  await expect(page.getByText(/已导入：一致 1 条/)).toBeVisible()
  expect(imports).toEqual([
    expect.objectContaining({
      p_file_name: validFile.name,
      p_sha256: createHash('sha256').update(validFile.buffer).digest('hex'),
      p_rows: [
        expect.objectContaining({ sourceRow: 2, cardNo: '000123', amount: 1234.56, liters: null })
      ]
    })
  ])
})

interface FixtureCard {
  id: string
  tenantId: string
  cardNo: string
  vehicleId: string
  plateNo: string
  issuer: string
  remark: string
  status: string
  balance: number
  createTime: string
  updateTime: string
}
interface FixtureEntry {
  id: string
  tenantId: string
  cardId: string
  cardNo: string
  vehicleId: string
  plateNo: string
  entryType: string
  amount: number
  signedAmount: number
  balanceAfter: number
  occurredOn: string
  referenceNo: string
  remark: string
  reversesEntryId: string | null
  isReversed: boolean
  createTime: string
}
const cardFields = {
  companyName: '验收物流',
  vehicleOwnership: null,
  carrierName: null,
  driverPhone: null,
  imagePath: null,
  fuelType: 'diesel_0',
  ownerEmployeeId: null,
  ownerEmployeeName: null,
  openerEmployeeId: null,
  openerEmployeeName: null,
  driverId: null,
  driverName: null
} satisfies Omit<FuelCard, keyof FixtureCard>

const entryFields = {
  companyName: cardFields.companyName,
  vehicleOwnership: null,
  carrierName: null,
  vehicleDriverName: null,
  vehicleDriverPhone: null,
  cardStatus: 'active',
  driverId: null,
  driverName: null,
  stationName: '',
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
  occurredAt: null,
  expenseLocation: '',
  expenseLongitude: null,
  expenseLatitude: null,
  expenseCoordinateSystem: null,
  expenseCoordinateSource: null,
  expenseCoordinateStatus: 'pending',
  expenseGeocodeProvider: null,
  expenseGeocodedAt: null,
  odometerKm: null,
  tripFuelPer100Km: null
} satisfies Omit<FuelCardEntry, keyof FixtureEntry | 'cardBalance'>

const cards: FixtureCard[] = [
  {
    id: cardIds[0],
    tenantId,
    cardNo: 'QA-CARD-001',
    vehicleId: vehicleIds[0],
    plateNo: '测A·10001',
    issuer: '验收能源服务',
    remark: '主车油卡',
    status: 'active',
    balance: 1680.25,
    createTime: '2026-10-01T08:00:00+08:00',
    updateTime: '2026-10-20T08:00:00+08:00'
  },
  {
    id: cardIds[1],
    tenantId,
    cardNo: 'QA-CARD-002',
    vehicleId: vehicleIds[1],
    plateNo: '测A·10002',
    issuer: '验收能源服务',
    remark: '',
    status: 'disabled',
    balance: 320.5,
    createTime: '2026-10-02T08:00:00+08:00',
    updateTime: '2026-10-21T08:00:00+08:00'
  }
]
const entries: FixtureEntry[] = [
  {
    id: '11111111-1111-4111-8111-111111111701',
    tenantId,
    cardId: cardIds[0],
    cardNo: cards[0].cardNo,
    vehicleId: vehicleIds[0],
    plateNo: cards[0].plateNo,
    entryType: 'opening',
    amount: 1000,
    signedAmount: 1000,
    balanceAfter: 1000,
    occurredOn: '2026-10-01',
    referenceNo: '',
    remark: '期初余额',
    reversesEntryId: null,
    isReversed: false,
    createTime: '2026-10-01T08:00:00+08:00'
  },
  {
    id: '11111111-1111-4111-8111-111111111702',
    tenantId,
    cardId: cardIds[0],
    cardNo: cards[0].cardNo,
    vehicleId: vehicleIds[0],
    plateNo: cards[0].plateNo,
    entryType: 'recharge',
    amount: 900,
    signedAmount: 900,
    balanceAfter: 1900,
    occurredOn: '2026-10-12',
    referenceNo: 'QA-RC-001',
    remark: '',
    reversesEntryId: null,
    isReversed: false,
    createTime: '2026-10-12T08:00:00+08:00'
  },
  {
    id: '11111111-1111-4111-8111-111111111703',
    tenantId,
    cardId: cardIds[0],
    cardNo: cards[0].cardNo,
    vehicleId: vehicleIds[0],
    plateNo: cards[0].plateNo,
    entryType: 'consume',
    amount: 219.75,
    signedAmount: -219.75,
    balanceAfter: 1680.25,
    occurredOn: '2026-10-20',
    referenceNo: 'QA-CM-001',
    remark: '验收加油',
    reversesEntryId: null,
    isReversed: false,
    createTime: '2026-10-20T08:00:00+08:00'
  },
  {
    id: '11111111-1111-4111-8111-111111111704',
    tenantId,
    cardId: cardIds[1],
    cardNo: cards[1].cardNo,
    vehicleId: vehicleIds[1],
    plateNo: cards[1].plateNo,
    entryType: 'opening',
    amount: 320.5,
    signedAmount: 320.5,
    balanceAfter: 320.5,
    occurredOn: '2026-10-02',
    referenceNo: '',
    remark: '',
    reversesEntryId: null,
    isReversed: false,
    createTime: '2026-10-02T08:00:00+08:00'
  }
]

test('两张油卡与多笔流水在档案、流水、弹窗和窄桌面呈现', async ({ page }, info) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
    process.stderr.write(`VMS 油卡页面错误：${error.message}\n`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`VMS 油卡控制台：${message.text()}\n`)
  })
  page.on('requestfailed', (request) => {
    process.stderr.write(`VMS 油卡请求失败：${request.url()} ${request.failure()?.errorText}\n`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      process.stderr.write(`VMS 油卡 HTTP ${response.status()}：${response.url()}\n`)
    }
  })
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    const payload = route.request().postDataJSON?.() || {}
    if (endpoint === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (endpoint === 'vms_list_vehicle_archive_navigation_secure')
      return route.fulfill({ json: [] })
    if (endpoint === 'vms_create_fuel_card_v2') {
      const vehicle = cards.find((card) => card.vehicleId === payload.p_vehicle_id)
      const created = {
        id: '11111111-1111-4111-8111-111111111603',
        tenantId,
        cardNo: String(payload.p_card_no),
        vehicleId: String(payload.p_vehicle_id),
        plateNo: vehicle?.plateNo || '测A·10001',
        issuer: String(payload.p_issuer || ''),
        remark: String(payload.p_remark || ''),
        status: 'active',
        balance: Number(payload.p_opening_balance || 0),
        createTime: '2026-10-26T10:00:00+08:00',
        updateTime: '2026-10-26T10:00:00+08:00'
      }
      cards.push(created)
      if (created.balance > 0) {
        entries.push({
          id: 'qa-entry-opening',
          tenantId,
          cardId: created.id,
          cardNo: created.cardNo,
          vehicleId: created.vehicleId,
          plateNo: created.plateNo,
          entryType: 'opening',
          amount: created.balance,
          signedAmount: created.balance,
          balanceAfter: created.balance,
          occurredOn: '2026-10-26',
          referenceNo: '',
          remark: '期初余额',
          reversesEntryId: null,
          isReversed: false,
          createTime: created.createTime
        })
      }
      return route.fulfill({ json: created.id })
    }
    if (endpoint === 'vms_record_fuel_card_transaction_v4') {
      const card = cards.find((item) => item.id === payload.p_card_id)
      if (!card) return route.fulfill({ status: 400, json: { message: '油卡不存在' } })
      const original = entries.find((item) => item.id === payload.p_reverses_entry_id)
      const amount = Number(payload.p_amount)
      const signedAmount =
        payload.p_entry_type === 'consume'
          ? -amount
          : payload.p_entry_type === 'reversal'
            ? -(original?.signedAmount || 0)
            : amount
      card.balance += signedAmount
      if (original) original.isReversed = true
      const created = {
        id: `qa-entry-${entries.length + 1}`,
        tenantId,
        cardId: card.id,
        cardNo: card.cardNo,
        vehicleId: card.vehicleId,
        plateNo: card.plateNo,
        entryType: String(payload.p_entry_type),
        amount,
        signedAmount,
        balanceAfter: card.balance,
        occurredOn: String(payload.p_occurred_on),
        referenceNo: String(payload.p_reference_no || ''),
        remark: String(payload.p_remark || ''),
        reversesEntryId: original?.id || null,
        isReversed: false,
        createTime: '2026-10-26T10:30:00+08:00'
      }
      entries.push(created)
      return route.fulfill({ json: created.id })
    }
    if (endpoint === 'vms_list_fuel_cards_secure') {
      const filtered = cards.filter(
        (card) =>
          (!payload.p_vehicle_id || card.vehicleId === payload.p_vehicle_id) &&
          (!payload.p_ids || payload.p_ids.includes(card.id)) &&
          (!payload.p_status || card.status === payload.p_status) &&
          (!payload.p_keyword || `${card.cardNo} ${card.plateNo}`.includes(payload.p_keyword))
      )
      const records = filtered.map((card) => ({ ...cardFields, ...card }))
      return route.fulfill({ json: { records, total: records.length } })
    }
    if (endpoint === 'vms_list_fuel_card_entries_secure') {
      const filtered = entries.filter(
        (entry) =>
          (!payload.p_vehicle_id || entry.vehicleId === payload.p_vehicle_id) &&
          (!payload.p_ids || payload.p_ids.includes(entry.id)) &&
          (!payload.p_card_id || entry.cardId === payload.p_card_id) &&
          (!payload.p_entry_type || entry.entryType === payload.p_entry_type)
      )
      const records = filtered.map((entry) => ({
        ...entryFields,
        ...entry,
        cardBalance: cards.find((card) => card.id === entry.cardId)?.balance ?? entry.balanceAfter
      }))
      return route.fulfill({ json: { records, total: records.length } })
    }
    if (endpoint === 'list_vehicle_driver_choices_secure' && payload.p_source === 'energy_vehicle')
      return route.fulfill({
        json: {
          records: vehicleIds.map((vehicleId, index) => ({
            id: vehicleId,
            tenantId,
            plateNo: index === 0 ? '测A·10001' : '测A·10002',
            companyName: '验收物流',
            auditStatus: 'approved'
          })),
          total: 2
        }
      })
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        fuelCardStatus: [
          ['active', '在用'],
          ['disabled', '停用']
        ],
        fuelCardFuelType: [['diesel_0', '0号柴油']],
        fuelCardEntryType: [
          ['opening', '期初'],
          ['recharge', '充值'],
          ['consume', '消费'],
          ['reversal', '冲正']
        ],
        vmsCardViewMode: [
          ['list', '按明细'],
          ['cards', '按卡片']
        ]
      }
      return route.fulfill({
        json: (labels[code || ''] || []).map(([value, label], index) => ({
          id: `${code}-${index}`,
          code: value,
          label,
          value,
          sort: index,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/vms-fuel-card-visual.html', {
    waitUntil: 'commit',
    timeout: 360_000
  })
  await expect(page.getByText('QA-CARD-001')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('QA-CARD-002')).toBeVisible()
  await expect(page.getByPlaceholder('输入油卡号或车牌号')).toBeVisible()
  await page.screenshot({ path: info.outputPath('fuel-card-archive-light.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.getByText('按车辆管理油卡绑定')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByText('按车辆管理油卡绑定')).toBeVisible()
  await page.getByRole('button', { name: '新增油卡' }).click()
  await expect(page.getByText('绑定已审批车辆')).toBeVisible()
  await expect(page.getByPlaceholder('请输入油卡号')).toBeVisible()
  await page.screenshot({ path: info.outputPath('fuel-card-create-dialog.png'), fullPage: true })
  const createDialog = page.getByRole('dialog', { name: '新增油卡' })
  await createDialog.getByPlaceholder('请输入油卡号').fill('QA-CARD-003')
  await createDialog.getByRole('textbox', { name: /绑定车辆/ }).click()
  const vehiclePicker = page.getByRole('dialog', { name: '选择已审批燃油车' })
  await vehiclePicker.getByRole('row').filter({ hasText: '测A·10001' }).first().click()
  await vehiclePicker.getByRole('button', { name: /确.*定/ }).click()
  await createDialog.getByRole('combobox', { name: /所属油品/ }).click()
  await page.getByRole('option', { name: '0号柴油', exact: true }).click()
  await createDialog.getByRole('spinbutton', { name: /期初余额/ }).fill('80')
  await createDialog.getByRole('button', { name: '创建油卡' }).click()
  await expect(page.getByText('QA-CARD-003')).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/tests/e2e/fixtures/vms-fuel-card-visual.html?page=ledger', {
    waitUntil: 'commit',
    timeout: 360_000
  })
  await expect(page.getByText('QA-RC-001')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('QA-CM-001')).toBeVisible()
  await expect(page.locator('.el-date-editor').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('fuel-card-ledger-1280.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '冲正' }).first().click()
  await expect(page.getByPlaceholder('说明原流水错误原因与本次更正依据')).toBeVisible()
  await page.screenshot({ path: info.outputPath('fuel-card-reversal-dialog.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: '登记充值' }).click()
  await expect(page.getByText('当前余额')).toBeVisible()
  await expect(page.locator('.el-input-number input').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('fuel-card-recharge-dialog.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  for (const flow of [
    {
      action: '登记充值',
      title: '登记充值',
      confirm: '确认充值',
      amount: '100',
      reference: 'QA-RC-NEW',
      balance: '¥1,680.25'
    },
    {
      action: '登记消费',
      title: '登记消费',
      confirm: '确认消费',
      amount: '50',
      reference: 'QA-CM-NEW',
      balance: '¥1,780.25'
    }
  ]) {
    await page.getByRole('button', { name: flow.action }).click()
    const dialog = page.getByRole('dialog', { name: flow.title })
    await dialog.getByRole('textbox', { name: /油卡/ }).click()
    const cardPicker = page.getByRole('dialog', { name: '选择油卡' })
    await cardPicker.getByRole('row').filter({ hasText: 'QA-CARD-001' }).first().click()
    await cardPicker.getByRole('button', { name: /确.*定/ }).click()
    await expect(dialog.getByText(flow.balance)).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('spinbutton', { name: /充值金额|消费金额/ }).fill(flow.amount)
    await dialog.getByPlaceholder('可填写充值单号或消费凭证号').fill(flow.reference)
    await dialog.getByRole('button', { name: flow.confirm }).click()
    await expect(page.getByText(flow.reference)).toBeVisible()
  }
  const originalRecharge = page.getByRole('row').filter({ hasText: 'QA-RC-NEW' })
  await originalRecharge.getByRole('button', { name: '冲正' }).click()
  const reversalDialog = page.getByRole('dialog', { name: '冲正流水' })
  await reversalDialog
    .getByPlaceholder('说明原流水错误原因与本次更正依据')
    .fill('验收冲正：重复充值')
  await reversalDialog.getByRole('button', { name: '确认冲正' }).click()
  await expect(originalRecharge.getByRole('button', { name: '冲正' })).toHaveCount(0)
  await expect(page.getByText('验收冲正：重复充值')).toBeVisible()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: info.outputPath('fuel-card-ledger-dark.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})
