import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

type Kind = 'pickup' | 'delivery'
type Snapshot = {
  driverName: string
  driverPhone: string
  plateNo: string
  vehicleType: string
  loadCapacityTon: number | null
  vehicleLengthM: number | null
}

const waybillId = '00000000-0000-4000-a000-000000000003'
const appointmentId = '00000000-0000-4000-a000-000000000004'
const snapshot: Snapshot = {
  driverName: '验收司机',
  driverPhone: '13800000000',
  plateNo: '测A12345',
  vehicleType: '厢式货车',
  loadCapacityTon: 8,
  vehicleLengthM: 9.6
}

function savedRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: appointmentId,
    appointmentNo: 'YY-TEST-004',
    kind: 'pickup',
    anchorWaybillId: waybillId,
    selectedWaybillIds: [waybillId],
    ...snapshot,
    scheduledAt: '2026-11-08T00:00:00Z',
    status: 'confirming',
    remark: null,
    arrivalPlateNo: null,
    arrivedAt: null,
    dockName: null,
    loadingStartedAt: null,
    loadingFinishedAt: null,
    departedAt: null,
    updateTime: '2026-11-07T08:00:00+08:00',
    ...overrides
  }
}

function field(drawer: ReturnType<Page['locator']>, key: string) {
  return drawer.locator(`[data-art-form-item-key="entries.0.${key}"] input`)
}

async function openDrawer(page: Page, kind: Kind) {
  await page.goto(
    `/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete&kind=${kind}`
  )
  await page.getByRole('button', { name: '打开预约' }).click()
  const drawer = page.locator('.art-drawer:visible')
  await expect(drawer.getByText(kind === 'pickup' ? '提货预约明细' : '送货预约明细')).toBeVisible()
  return drawer
}

for (const kind of ['pickup', 'delivery'] as const) {
  test(`${kind} 预约带入调度车辆规格、保存并回显`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    const savePayloads: Record<string, unknown>[] = []
    const snapshotKinds: string[] = []
    let records: Record<string, unknown>[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('/rpc/tms_list_appointment_candidates_secure'))
        return route.fulfill({ json: [{ id: waybillId, waybillNo: 'YD-TEST-003' }] })
      if (url.includes('/rpc/tms_list_waybill_appointments_secure'))
        return route.fulfill({ json: records })
      if (url.includes('/rpc/tms_get_appointment_dispatch_snapshot_secure')) {
        snapshotKinds.push((route.request().postDataJSON() as { p_kind: string }).p_kind)
        return route.fulfill({ json: snapshot })
      }
      if (url.includes('/rpc/tms_save_waybill_appointment_secure')) {
        const { p_payload } = route.request().postDataJSON() as {
          p_payload: Record<string, unknown>
        }
        savePayloads.push(p_payload)
        records = [savedRecord({ kind, scheduledAt: p_payload.scheduled_at })]
        return route.fulfill({ json: appointmentId })
      }
      return route.fulfill({ json: [] })
    })

    let drawer = await openDrawer(page, kind)
    await expect(field(drawer, 'vehicleType')).toHaveValue(snapshot.vehicleType)
    await expect(field(drawer, 'loadCapacityTon')).toHaveValue('8.00')
    await expect(field(drawer, 'vehicleLengthM')).toHaveValue('9.60')
    for (const key of ['plateNo', 'vehicleType', 'loadCapacityTon', 'vehicleLengthM'])
      await expect(field(drawer, key)).toBeDisabled()

    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await drawer.screenshot({
        path: `.artifacts/appointment-vehicle-snapshot/${kind}-${width}.png`,
        animations: 'disabled'
      })
    }

    await field(drawer, 'scheduledAt').fill('2026-11-08 08:00')
    await drawer.getByRole('button', { name: '保存预约' }).click()
    await expect(drawer).toBeHidden()
    expect(savePayloads).toHaveLength(1)
    expect(savePayloads[0]).toMatchObject({
      kind,
      anchor_waybill_id: waybillId,
      plate_no: snapshot.plateNo,
      load_capacity_ton: 8,
      vehicle_length_m: 9.6
    })

    // RPC 返回已保存记录后，编辑表单应优先回显预约快照。
    drawer = await openDrawer(page, kind)
    await expect(drawer.getByText('YY-TEST-004')).toBeVisible()
    await expect(field(drawer, 'loadCapacityTon')).toHaveValue('8.00')
    await expect(field(drawer, 'vehicleLengthM')).toHaveValue('9.60')
    expect(snapshotKinds).toEqual([kind, kind])
    expect(errors).toEqual([])
  })

  test(`${kind} 预约车辆无规格时保持可选空值`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('/rpc/tms_get_appointment_dispatch_snapshot_secure'))
        return route.fulfill({
          json: { ...snapshot, loadCapacityTon: null, vehicleLengthM: null }
        })
      return route.fulfill({ json: [] })
    })
    const drawer = await openDrawer(page, kind)
    await expect(field(drawer, 'loadCapacityTon')).toBeEmpty()
    await expect(field(drawer, 'vehicleLengthM')).toBeEmpty()
    await expect(field(drawer, 'loadCapacityTon')).toHaveAttribute('placeholder', '可选')
    await expect(field(drawer, 'vehicleLengthM')).toHaveAttribute('placeholder', '可选')
  })

  test(`${kind} 旧预约仅对同车牌未完结记录补齐缺失规格`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let record = savedRecord({ kind, loadCapacityTon: null, vehicleLengthM: null })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('/rpc/tms_list_waybill_appointments_secure'))
        return route.fulfill({ json: [record] })
      if (url.includes('/rpc/tms_get_appointment_dispatch_snapshot_secure'))
        return route.fulfill({ json: snapshot })
      return route.fulfill({ json: [] })
    })

    const scenarios = [
      {
        name: '同车牌未完结空值',
        overrides: { loadCapacityTon: null, vehicleLengthM: null },
        load: '8.00',
        length: '9.60'
      },
      {
        name: '已维护数值',
        overrides: { loadCapacityTon: 5, vehicleLengthM: 6.8 },
        load: '5.00',
        length: '6.80'
      },
      {
        name: '已完结空值',
        overrides: { status: 'completed', loadCapacityTon: null, vehicleLengthM: null },
        load: '',
        length: ''
      },
      {
        name: '不同车牌空值',
        overrides: { plateNo: '测B67890', loadCapacityTon: null, vehicleLengthM: null },
        load: '',
        length: ''
      }
    ]
    for (const scenario of scenarios) {
      record = savedRecord({ kind, ...scenario.overrides })
      const drawer = await openDrawer(page, kind)
      await expect(field(drawer, 'loadCapacityTon'), scenario.name).toHaveValue(scenario.load)
      await expect(field(drawer, 'vehicleLengthM'), scenario.name).toHaveValue(scenario.length)
      if (scenario.name === '同车牌未完结空值') {
        await drawer.screenshot({
          path: `.artifacts/appointment-vehicle-snapshot/${kind}-existing-filled.png`,
          animations: 'disabled'
        })
      }
    }
    expect(errors).toEqual([])
  })
}
