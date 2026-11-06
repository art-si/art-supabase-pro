import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance, assertAppearance } from './support/appearance'
import { dispatchFixtureDictionaryRows } from './support/tms-dispatch-dictionaries'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)
const tenant = '11111111-1111-4111-8111-111111111111'
const carrierA = {
  id: 'carrier-a',
  tenant_id: tenant,
  company_name: '承运商甲',
  dispatch_channel: 'offline'
}
const carrierB = {
  id: 'carrier-b',
  tenant_id: tenant,
  company_name: '承运商乙',
  dispatch_channel: 'offline'
}
const baseVehicle = (
  id: string,
  plate: string,
  ownership: string,
  carrier: typeof carrierA | null
) => ({
  id,
  tenant_id: tenant,
  plate_no: plate,
  vehicle_ownership: ownership,
  carrier_id: carrier?.id ?? null,
  carrier,
  carrier_name: carrier?.company_name ?? null,
  company_name: ownership === 'self_operated' ? '测试自营公司' : null,
  vehicle_type: 'truck',
  spec_length_m: 13,
  load_tons: 30
})
const selfVehicle = baseVehicle('vehicle-self', '测A10001', 'self_operated', null)
const vehicleA = baseVehicle('vehicle-a', '测A20001', 'carrier', carrierA)
const vehicleB = baseVehicle('vehicle-b', '测A20002', 'third_party', carrierB)
const unboundVehicle = baseVehicle('vehicle-unbound', '测A29999', 'carrier', carrierB)
const personalVehicle = baseVehicle(
  'vehicle-personal',
  '测A30001',
  'individual_affiliation',
  carrierA
)
const baseDriver = (id: string, name: string, ownership: string, vehicle: typeof vehicleA) => ({
  id,
  tenant_id: tenant,
  driver_name: name,
  driver_ownership: ownership,
  driver_status: 'on_duty',
  phone: '13800000001',
  gender: '1',
  license_type: 'A2',
  portrait_url: 'https://example.test/dispatch-photo.svg',
  vehicle_id: vehicle.id,
  vehicle,
  plate_no: vehicle.plate_no,
  carrier_id: vehicle.carrier_id,
  carrier: vehicle.carrier,
  carrier_name: vehicle.carrier_name,
  company_name: vehicle.company_name
})
const selfDriver = baseDriver('driver-self', '自营司机甲', 'self', selfVehicle)
const driverA = baseDriver('driver-a', '承运商甲司机', 'carrier', vehicleA)
const driverB = baseDriver('driver-b', '承运商乙司机', 'carrier', vehicleB)
const personalDriver = baseDriver('driver-personal', '个体司机甲', 'individual', personalVehicle)
const withDriver = (vehicle: typeof vehicleA, driver: typeof driverA) => ({
  ...vehicle,
  primary_driver_id: driver.id,
  primary_driver: driver
})

async function setup(page: Page) {
  const writes: Array<{ kind: string; executions: Array<Record<string, unknown>> }> = []
  await prepareIsolatedSession(page)
  const appearance = {
    theme: test.info().project.name.includes('dark') ? ('dark' as const) : ('light' as const),
    boxBorderMode: !test.info().project.name.includes('shadow')
  }
  await prepareAppearance(page, appearance)
  await page.route('https://example.test/dispatch-photo.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="#ddd"/></svg>'
    })
  )
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'sys_dictionary')
      return route.fulfill({ json: dispatchFixtureDictionaryRows(new URL(route.request().url())) })
    if (endpoint === 'tms_list_dispatch_candidates_secure') {
      const kind = route.request().postDataJSON().p_kind
      const records =
        kind === 'carrier'
          ? [carrierA, carrierB]
          : kind === 'carrier_vehicle'
            ? [
                withDriver(vehicleA, driverA),
                withDriver(vehicleB, driverB),
                { ...unboundVehicle, primary_driver_id: null, primary_driver: null }
              ]
            : kind === 'carrier_driver'
              ? [driverA, driverB]
              : kind === 'individual_vehicle'
                ? [withDriver(personalVehicle, personalDriver)]
                : kind === 'individual_driver'
                  ? [personalDriver]
                  : kind === 'self_driver'
                    ? [selfDriver]
                    : [withDriver(selfVehicle, selfDriver)]
      return route.fulfill({ json: { records, total: records.length } })
    }
    if (endpoint === 'tms_create_dispatch_plan_secure') {
      writes.push(route.request().postDataJSON().p_plan)
      return route.fulfill({
        json: { waybill_ids: ['waybill-1'], waybill_nos: ['YWD-001'], warnings: [] }
      })
    }
    if (endpoint === 'tms_check_dispatch_advisories_secure') return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-carrier-dispatch-account.html', { waitUntil: 'commit' })
  await expect(page.getByRole('button', { name: '打开调度', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await assertAppearance(page, appearance)
  return writes
}

async function chooseMode(dialog: Locator, label: string, part = 0) {
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '调度对象' })
    .nth(part)
    .locator('.el-radio-button')
    .filter({ hasText: label })
    .click()
}
async function choose(
  page: Page,
  dialog: Locator,
  resource: 'vehicle' | 'driver',
  text: string,
  part = 0
) {
  await dialog
    .getByRole('textbox', { name: resource === 'vehicle' ? /车辆/ : /司机/ })
    .nth(part)
    .click()
  const picker = page.getByRole('dialog', {
    name: resource === 'vehicle' ? /选择.*车辆/ : /选择.*司机/
  })
  await expect(picker).toBeVisible()
  for (const header of [
    '车辆归属',
    '照片',
    '司机',
    '联系电话',
    '性别',
    '驾照类型',
    '司机归属',
    '所属公司',
    '所属承运商',
    '车型',
    '车长（米）'
  ]) {
    await expect(picker.getByRole('columnheader', { name: header, exact: true })).toHaveCount(1)
  }
  await picker.getByText(text, { exact: true }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
}
async function fillTimes(dialog: Locator) {
  const departures = dialog.getByRole('combobox', { name: /计划发车/ })
  const arrivals = dialog.getByRole('combobox', { name: /计划到达/ })
  for (let index = 0; index < (await departures.count()); index++) {
    await departures.nth(index).fill('2026-11-07 10:00:00')
    await departures.nth(index).press('Tab')
    await arrivals.nth(index).fill('2026-11-08 10:00:00')
    await arrivals.nth(index).press('Tab')
  }
}

test('普通配载：承运商车辆带出司机和承运商，不需要先选承运商', async ({ page }, info) => {
  const writes = await setup(page)
  await page.getByRole('button', { name: '打开调度', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调度配载', exact: true })
  await chooseMode(dialog, '承运方')
  await dialog.getByRole('textbox', { name: /车辆/ }).click()
  const picker = page.getByRole('dialog', { name: '选择配载车辆', exact: true })
  await expect(picker.getByText('测A20001', { exact: true })).toBeVisible()
  await expect(picker.getByText('测A20002', { exact: true })).toBeVisible()
  await expect(picker.getByRole('img', { name: '承运商甲司机的照片' })).toBeVisible()
  await expect(picker.getByRole('cell', { name: '男', exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('carrier-resource-picker.png'), fullPage: true })
  await picker.getByText('测A20001', { exact: true }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: /承运商司机/ })).toHaveValue('承运商甲司机')
  await expect(dialog.getByRole('textbox', { name: /承运方/ })).toHaveValue('承运商甲')
  await fillTimes(dialog)
  await page.screenshot({ path: info.outputPath('carrier-linked.png'), fullPage: true })
  await dialog.getByRole('button', { name: '确认配载', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].executions[0]).toMatchObject({
    dispatch_mode: 'carrier',
    dispatch_vehicle_id: 'vehicle-a',
    dispatch_driver_id: 'driver-a',
    dispatch_carrier_id: 'carrier-a'
  })
})

test('合单配载：第三方物流司机带出车辆和承运商', async ({ page }) => {
  const writes = await setup(page)
  await page.getByRole('button', { name: '打开合单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '合单调度', exact: true })
  await chooseMode(dialog, '承运方')
  await choose(page, dialog, 'driver', '承运商乙司机')
  await expect(dialog.getByRole('textbox', { name: /车辆/ })).toHaveValue('测A20002')
  await fillTimes(dialog)
  await dialog.getByRole('button', { name: '确认合单并配载', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({
    kind: 'merge',
    executions: [
      {
        dispatch_mode: 'carrier',
        dispatch_vehicle_id: 'vehicle-b',
        dispatch_driver_id: 'driver-b',
        dispatch_carrier_id: 'carrier-b'
      }
    ]
  })
})

test('个体司机模式保留车辆参选，车辆和司机一并提交', async ({ page }) => {
  const writes = await setup(page)
  await page.getByRole('button', { name: '打开调度', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调度配载', exact: true })
  await chooseMode(dialog, '个体司机')
  await choose(page, dialog, 'vehicle', '测A30001')
  await expect(dialog.getByRole('textbox', { name: /个体司机/ })).toHaveValue('个体司机甲')
  await fillTimes(dialog)
  await dialog.getByRole('button', { name: '确认配载', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].executions[0]).toMatchObject({
    dispatch_mode: 'individual_driver',
    dispatch_vehicle_id: 'vehicle-personal',
    dispatch_driver_id: 'driver-personal'
  })
})

test('拆单各批次独立调度对象，参选后车牌与司机自动带入', async ({ page }, info) => {
  const writes = await setup(page)
  await page.getByRole('button', { name: '打开拆单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /拆单配载 ·/ })
  const amounts = dialog.locator('.el-input-number input')
  for (let i = 0; i < 2; i++) {
    await amounts.nth(i).fill('0.25')
    await amounts.nth(i).press('Tab')
  }
  await chooseMode(dialog, '承运方', 0)
  await choose(page, dialog, 'vehicle', '测A20001', 0)
  await chooseMode(dialog, '个体司机', 1)
  await choose(page, dialog, 'driver', '个体司机甲', 1)
  await expect(dialog.getByRole('textbox', { name: /执行车辆/ }).nth(1)).toHaveValue('测A30001')
  await expect(dialog.getByRole('textbox', { name: /^司机$/ }).nth(0)).toHaveValue('承运商甲司机')
  await fillTimes(dialog)
  await page.screenshot({ path: info.outputPath('split-mixed-resources.png'), fullPage: true })
  await dialog.getByRole('button', { name: '生成调度执行单', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({
    kind: 'split',
    executions: [
      {
        dispatch_mode: 'carrier',
        dispatch_vehicle_id: 'vehicle-a',
        dispatch_driver_id: 'driver-a',
        dispatch_carrier_id: 'carrier-a'
      },
      {
        dispatch_mode: 'individual_driver',
        dispatch_vehicle_id: 'vehicle-personal',
        dispatch_driver_id: 'driver-personal',
        dispatch_carrier_id: 'carrier-a'
      }
    ]
  })
})

test('切换调度对象清理旧的车辆司机，再选自营车辆正确联动', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: '打开调度', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调度配载', exact: true })
  await chooseMode(dialog, '承运方')
  await choose(page, dialog, 'driver', '承运商乙司机')
  await chooseMode(dialog, '自营')
  await expect(dialog.getByRole('textbox', { name: /车辆/ })).toHaveValue('')
  await expect(dialog.getByRole('textbox', { name: /自营司机/ })).toHaveValue('')
  await choose(page, dialog, 'vehicle', '测A10001')
  await expect(dialog.getByRole('textbox', { name: /自营司机/ })).toHaveValue('自营司机甲')
})

test('无关联车辆不沿用旧自动司机，但保留明确手选的同承运商司机', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: '打开调度', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调度配载', exact: true })
  await chooseMode(dialog, '承运方')
  await choose(page, dialog, 'vehicle', '测A20002')
  await expect(dialog.getByRole('textbox', { name: /承运商司机/ })).toHaveValue('承运商乙司机')
  await choose(page, dialog, 'vehicle', '测A29999')
  await expect(dialog.getByRole('textbox', { name: /承运商司机/ })).toHaveValue('')
  await choose(page, dialog, 'driver', '承运商乙司机')
  await choose(page, dialog, 'vehicle', '测A29999')
  await expect(dialog.getByRole('textbox', { name: /承运商司机/ })).toHaveValue('承运商乙司机')
  await expect(dialog.getByRole('textbox', { name: /车辆/ })).toHaveValue('测A29999')
})
