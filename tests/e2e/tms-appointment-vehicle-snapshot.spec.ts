import { expect, test, type Locator, type Page } from '@playwright/test'
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
  return showDrawer(page, kind)
}

async function showDrawer(page: Page, kind: Kind) {
  await page.getByRole('button', { name: '打开预约' }).click()
  const drawer = page.locator('.art-drawer:visible')
  await expect(drawer.getByText(kind === 'pickup' ? '提货预约明细' : '送货预约明细')).toBeVisible()
  return drawer
}

async function expectDrawerHeadingWithinHeader(heading: Locator) {
  const geometry = await heading.evaluate((element) => {
    const header = element.closest('.art-drawer__header')
    const main = header?.querySelector('.art-drawer__header-main')
    const actions = header?.querySelectorAll('.art-drawer__header-actions button')
    if (!main || !actions?.length) throw new Error('缺少抽屉标题栏或操作按钮')
    const available = header!.getBoundingClientRect()
    const controls = [...actions].map((button) => button.getBoundingClientRect())
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = [...range.getClientRects()]
    const overlap = (first: DOMRect, second: DOMRect) =>
      Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1 &&
      Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1
    return {
      columnWidth: available.width,
      maxLineWidth: Math.max(...lines.map((line) => line.width)),
      lines: lines.length,
      overhang: Math.max(
        0,
        ...lines.map((line) => Math.max(available.left - line.left, line.right - available.right))
      ),
      overlapsControls: lines.some((line) => controls.some((button) => overlap(line, button)))
    }
  })
  const measured = JSON.stringify(geometry)
  expect(geometry.lines, measured).toBeGreaterThan(0)
  expect(geometry.overhang, measured).toBeLessThanOrEqual(1)
  expect(geometry.overlapsControls, measured).toBe(false)
  return geometry
}

test('提货预约抽屉完整显示长运单号且标题不覆盖操作', async ({ page }, info) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  const writes: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/rpc/tms_save_waybill_appointment_secure')) writes.push(url)
    return route.fulfill({
      json: url.includes('/rpc/tms_get_appointment_dispatch_snapshot_secure') ? snapshot : []
    })
  })
  const waybillNo = `YD${'W'.repeat(35)}003`
  await page.goto(
    `/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete&waybillNo=${waybillNo}`
  )
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.boxMode = 'shadow-mode'
  })
  await showDrawer(page, 'pickup')
  const name = `提货预约 · ${waybillNo}`
  const drawer = page.getByRole('dialog', { name, exact: true })
  const heading = drawer.getByRole('heading', { name, exact: true })
  await expect(heading).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await drawer.screenshot({ path: info.outputPath('appointment-long-heading-dark-390.png') })
  expect((await expectDrawerHeadingWithinHeader(heading)).lines).toBeGreaterThan(1)
  await expect(drawer.getByRole('button', { name: '全屏', exact: true })).toBeInViewport()
  await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(writes).toEqual([])
})

test('窄屏切换调度子单时晚到的预约不会盖掉新抽屉', async ({ page }, info) => {
  const secondWaybillId = '00000000-0000-4000-a000-000000000005'
  const firstRead = Promise.withResolvers<void>()
  const secondRead = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const releaseSecond = Promise.withResolvers<void>()
  const snapshotReads: string[] = []
  const writes: string[] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_waybill_appointments_secure') {
      const [id] = route.request().postDataJSON().p_waybill_ids as string[]
      const first = id === waybillId
      const readStarted = first ? firstRead : secondRead
      readStarted.resolve()
      await (first ? releaseFirst : releaseSecond).promise
      return route.fulfill({
        json: [
          savedRecord({
            id: first ? appointmentId : '00000000-0000-4000-a000-000000000006',
            appointmentNo: first ? 'YY-OLD-003' : 'YY-CURRENT-005',
            anchorWaybillId: id,
            selectedWaybillIds: [id]
          })
        ]
      })
    }
    if (endpoint === 'tms_get_appointment_dispatch_snapshot_secure') {
      snapshotReads.push(route.request().postDataJSON().p_waybill_id)
      return route.fulfill({ json: snapshot })
    }
    if (endpoint === 'tms_save_waybill_appointment_secure') writes.push(endpoint)
    return route.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete&compare')
  const drawer = page.locator('.art-drawer:visible')
  const viewport = drawer.locator('.art-drawer__viewport')
  const oldRecord = drawer.getByText('YY-OLD-003', { exact: true })
  try {
    await page.getByRole('button', { name: '打开预约', exact: true }).click()
    await firstRead.promise
    await expect(viewport).toHaveAttribute('aria-busy', 'true')
    await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).press('Enter')
    await expect(drawer).toBeHidden()
    await page.getByRole('button', { name: '打开另一单预约', exact: true }).press('Enter')
    await secondRead.promise
    const heading = drawer.getByRole('heading', { name: '提货预约 · YD-TEST-005', exact: true })
    await expect(heading).toBeVisible()
    expect((await expectDrawerHeadingWithinHeader(heading)).lines).toBe(1)
    const firstResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/tms_list_waybill_appointments_secure') &&
        response.request().postDataJSON().p_waybill_ids[0] === waybillId
    )
    releaseFirst.resolve()
    await (await firstResponse).finished()
    // While the new read is still held, the old response must never populate its drawer.
    const showedOldRecord = await oldRecord.waitFor({ state: 'visible', timeout: 800 }).then(
      () => true,
      () => false
    )
    await drawer.screenshot({ path: info.outputPath('appointment-late-response-390.png') })
    expect(showedOldRecord).toBe(false)
    await expect(viewport).toHaveAttribute('aria-busy', 'true')
    const save = drawer.getByRole('button', { name: '保存预约', exact: true })
    await expect(save).toBeDisabled()
    expect(snapshotReads).toEqual([])

    releaseSecond.resolve()
    await expect(drawer.getByText('YY-CURRENT-005', { exact: true })).toBeVisible()
    await expect(oldRecord).toHaveCount(0)
    await expect(save).toBeEnabled()
    expect(snapshotReads).toEqual([secondWaybillId])
    expect(writes).toEqual([])
    await drawer.screenshot({ path: info.outputPath('appointment-current-390.png') })
  } finally {
    releaseFirst.resolve()
    releaseSecond.resolve()
  }
})

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
    test.setTimeout(60_000)
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
    await page.goto(
      `/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete&kind=${kind}`
    )
    for (const scenario of scenarios) {
      record = savedRecord({ kind, ...scenario.overrides })
      const drawer = await showDrawer(page, kind)
      await expect(field(drawer, 'loadCapacityTon'), scenario.name).toHaveValue(scenario.load)
      await expect(field(drawer, 'vehicleLengthM'), scenario.name).toHaveValue(scenario.length)
      if (scenario.name === '同车牌未完结空值') {
        await drawer.screenshot({
          path: `.artifacts/appointment-vehicle-snapshot/${kind}-existing-filled.png`,
          animations: 'disabled'
        })
      }
      await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      await expect(drawer).toBeHidden()
    }
    expect(errors).toEqual([])
  })
}
