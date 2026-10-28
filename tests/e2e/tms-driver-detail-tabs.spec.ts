import { expect, test } from '@playwright/test'

const driverId = '11111111-1111-4111-8111-111111111401'
const orderId = '11111111-1111-4111-8111-111111111201'
const relation = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  orderId,
  orderNo: 'YD202610-001',
  orderStatus: 'transporting',
  waybillId: '11111111-1111-4111-8111-111111111301',
  waybillNo: 'DD202610-001',
  waybillStatus: 'transporting',
  vehicleId: '11111111-1111-4111-8111-111111111501',
  plateNo: '测A12345',
  driverId,
  driverName: '测试司机甲',
  departedAt: '2026-10-26T08:00:00+08:00',
  completedAt: null,
  originStation: '青岛',
  destinationStation: '济南',
  executionKind: 'single',
  dispatchMode: 'carrier',
  dispatchTargetName: '测试承运商',
  shippingAddress: '测试发货地址',
  receivingAddress: '测试收货地址',
  orderCreatedAt: '2026-10-25T10:00:00+08:00',
  arrivedAt: null,
  signedAt: null,
  receiptAt: null,
  cargoType: '钢材',
  cargoQuantity: 20,
  cargoVolumeM3: 3.5,
  cargoWeightKg: 2100,
  insuranceFee: 120,
  deliveryFee: 80,
  unloadingFee: 30,
  orderTotalFee: 2300,
  relationFreightAmount: 1150,
  detailsAvailable: true
}

test.use({ storageState: { cookies: [], origins: [] } })

test('司机详情按页签组织承运宽表与费用，窄屏只在表内滚动', async ({ page }, testInfo) => {
  test.setTimeout(480_000)
  page.on('pageerror', (error) => console.error('driver-detail pageerror:', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('driver-detail console:', message.text())
  })
  await page.route('**/rest/v1/sys_dictionary?**', (route) => {
    const url = new URL(route.request().url())
    const dictCode = String(url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
    const entries: Record<string, Array<[string, string]>> = {
      fmsExpenseDocumentStatus: [['approved', '已审核']],
      fmsRepaymentStatus: [['completed', '已还款']],
      tmsReimbursementApprovalStatus: [['approved', '已审核']],
      tmsDispatchOperatorMode: [['carrier', '承运方']],
      tmsWaybillStatus: [['transporting', '运输中']],
      tmsDriverType: [['primary', '主驾']],
      tmsDriverLicenseType: [['A1', 'A1']],
      commonEnabledStatus: [['enabled', '启用']]
    }
    return route.fulfill({
      status: 200,
      json: (entries[dictCode] || []).map(([value, label], index) => ({
        id: `dict-${dictCode}-${index}`,
        type_id: `type-${dictCode}`,
        code: value,
        value,
        label,
        status: '1',
        sort: index + 1,
        dict_type_table: { code: dictCode, name: dictCode }
      }))
    })
  })
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    let json: unknown = { records: [], total: 0, available: true, linkedEmployee: false }
    if (name === 'tms_get_driver_secure') {
      json = {
        id: driverId,
        driverName: '测试司机甲',
        tenantId: relation.tenantId,
        carrier: { companyName: '测试承运商' },
        driverType: 'primary',
        licenseType: 'A1',
        enabled: true,
        employeeId: '11111111-1111-4111-8111-111111111601',
        fieldAccess: {},
        assignedVehicles: [{ id: relation.vehicleId, plateNo: relation.plateNo }]
      }
    } else if (name === 'tms_list_transport_mainline_relations_secure') {
      json = {
        records: [
          relation,
          {
            ...relation,
            orderId: 'order-2',
            orderNo: 'YD202610-002',
            waybillId: 'waybill-2',
            waybillNo: 'DD202610-002',
            arrivedAt: '2026-10-26T18:00:00+08:00'
          }
        ],
        total: 2
      }
    } else if (name === 'tms_list_current_driver_mainline_relations_secure') {
      json = { records: [relation], total: 1 }
    } else if (name === 'tms_list_driver_finance_records_secure') {
      const kind = route.request().postDataJSON()?.p_kind
      json = {
        records: [
          {
            id: `${kind}-1`,
            no: `${kind}-20261001`,
            occurredOn: '2026-10-26',
            status: kind === 'repayment' ? 'completed' : 'approved',
            amount: 100,
            waybillId: null,
            waybillNo: null,
            orderNo: null,
            costType: null,
            reason: '测试用途',
            remark: null,
            relatedNo: null,
            settlementStatus: null
          }
        ],
        total: 1
      }
    }
    await route.fulfill({ status: 200, json })
  })

  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-detail')
  await expect(page.getByRole('heading', { name: '测试司机甲' })).toBeVisible({ timeout: 300_000 })
  if (testInfo.project.name.includes('dark')) {
    await page.evaluate(() => document.documentElement.classList.add('dark'))
  }
  await expect(page.getByText('当前出车', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '承运订单与车辆明细' }).click()
  await expect(page.getByRole('columnheader', { name: '运输订单号' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '总运费', exact: true })).toHaveCount(1)
  await expect(page.getByRole('columnheader', { name: '订单总运费' })).toHaveCount(1)
  await expect(page.getByText('YD202610-002')).toBeVisible()
  await expect(page.getByText('正向货配载').first()).toBeVisible()
  await expect(page.getByText('测试发货地址')).toHaveCount(2)
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(bodyOverflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: `.artifacts/driver-detail-tabs-${testInfo.project.name}-orders.png`,
    fullPage: true
  })
  await page.getByRole('tab', { name: '费用明细' }).click()
  await expect(page.getByText('借款明细', { exact: true })).toBeVisible()
  await expect(page.getByText('还款明细', { exact: true })).toBeVisible()
  await expect(page.getByText('费用报销明细', { exact: true })).toBeVisible()
  await expect(page.getByText('loan-20261001')).toBeVisible()
  await expect(page.getByText('已审核', { exact: true })).toHaveCount(2)
  await expect(page.getByText('已还款', { exact: true })).toHaveCount(1)
  await page.screenshot({
    path: `.artifacts/driver-detail-tabs-${testInfo.project.name}-costs.png`,
    fullPage: true
  })
})

test('司机资质和安全记录忽略迟到旧页，培训失败可重试', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let releaseQualificationPage = () => {}
  const qualificationPageGate = new Promise<void>((resolve) => {
    releaseQualificationPage = resolve
  })
  let releaseSafetyPage = () => {}
  const safetyPageGate = new Promise<void>((resolve) => {
    releaseSafetyPage = resolve
  })
  const qualificationOffsets: number[] = []
  const safetyOffsets: number[] = []
  let trainingRequests = 0

  await page.route('**/rest/v1/sys_dictionary?**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const params = route.request().postDataJSON() ?? {}
    if (name === 'tms_get_driver_secure') {
      const id = String(params.p_id)
      await route.fulfill({
        json: {
          id,
          driverName: id === driverId ? '测试司机甲' : '测试司机乙',
          tenantId: relation.tenantId,
          driverType: 'primary',
          enabled: true,
          employeeId:
            id === driverId
              ? '11111111-1111-4111-8111-111111111601'
              : '11111111-1111-4111-8111-111111111602',
          fieldAccess: {},
          assignedVehicles: []
        }
      })
      return
    }
    if (name === 'tms_list_driver_mainline_qualifications_secure') {
      const from = Number(params.p_from)
      const isOriginalDriver = params.p_driver_id === driverId
      if (isOriginalDriver) qualificationOffsets.push(from)
      if (isOriginalDriver && from === 20) await qualificationPageGate
      await route.fulfill({
        json: {
          records: [
            {
              id: `qualification-${from}`,
              qualificationName:
                from === 20
                  ? '迟到的资质第二页'
                  : isOriginalDriver &&
                      qualificationOffsets.filter((offset) => offset === 0).length > 1
                    ? '返回后的资质第一页'
                    : '初始资质第一页',
              status: 'valid'
            }
          ],
          total: 41,
          available: true,
          linkedEmployee: true
        }
      })
      return
    }
    if (name === 'tms_list_driver_mainline_safety_secure') {
      const from = Number(params.p_from)
      const isOriginalViolation = params.p_kind === 'violation' && params.p_driver_id === driverId
      if (isOriginalViolation) safetyOffsets.push(from)
      if (isOriginalViolation && from === 20) await safetyPageGate
      await route.fulfill({
        json: {
          records:
            params.p_kind === 'violation'
              ? [
                  {
                    id: `violation-${from}`,
                    vehicleId: 'vehicle-1',
                    plateNo: '测A12345',
                    violationTime: '2026-10-26T08:00:00+08:00',
                    violationBehavior:
                      from === 20
                        ? '迟到的违章第二页'
                        : isOriginalViolation &&
                            safetyOffsets.filter((offset) => offset === 0).length > 2
                          ? '返回后的违章第一页'
                          : '初始违章第一页',
                    processed: true
                  }
                ]
              : [],
          total: params.p_kind === 'violation' ? 41 : 0,
          available: true
        }
      })
      return
    }
    if (name === 'hr_get_employee_profile_secure') {
      trainingRequests++
      if (trainingRequests === 1) {
        await route.fulfill({ status: 500, json: { message: '暂时不可用' } })
      } else {
        await route.fulfill({
          json: {
            fieldAccess: { careerRecords: 'read' },
            trainings: [{ id: 'training-1', trainingName: '复训已恢复' }]
          }
        })
      }
      return
    }
    await route.fulfill({ json: { records: [], total: 0, available: true } })
  })

  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-detail&race')
  await expect(page.getByRole('heading', { name: '测试司机甲' })).toBeVisible({
    timeout: 240_000
  })
  await page.getByRole('tab', { name: '档案与资质' }).click()
  const qualificationCard = page.locator('section.art-section-card').filter({
    has: page.getByText('驾驶资质', { exact: true })
  })
  await expect(qualificationCard.getByText('初始资质第一页')).toBeVisible()
  const trainingCard = page.locator('section.art-section-card').filter({
    has: page.getByText('培训记录', { exact: true })
  })
  await expect(trainingCard.getByText('培训记录加载失败，请重试。', { exact: true })).toBeVisible()
  await trainingCard.getByRole('button', { name: '重新加载' }).click()
  await expect(trainingCard.getByText('复训已恢复')).toBeVisible()
  expect(trainingRequests).toBe(2)

  const clickNext = async (title: string) => {
    const card = page.locator('section.art-section-card').filter({
      has: page.getByText(title, { exact: true })
    })
    await card.locator('.el-pagination .btn-next').click()
  }

  const switchAwayAndBack = async () => {
    await page.getByRole('button', { name: '测试切换司机乙' }).click()
    await expect(page.getByRole('heading', { name: '测试司机乙' })).toBeVisible()
    await page.getByRole('button', { name: '测试切换司机甲' }).click()
    await expect(page.getByRole('heading', { name: '测试司机甲' })).toBeVisible()
  }

  await clickNext('驾驶资质')
  await expect.poll(() => qualificationOffsets).toEqual([0, 20])
  await switchAwayAndBack()
  await expect.poll(() => qualificationOffsets).toEqual([0, 20, 0])
  await page.getByRole('tab', { name: '档案与资质' }).click()
  await expect(qualificationCard.getByText('返回后的资质第一页')).toBeVisible()
  releaseQualificationPage()
  await expect(qualificationCard.getByText('返回后的资质第一页')).toBeVisible()
  await expect(qualificationCard.getByText('迟到的资质第二页')).toHaveCount(0)

  await page.getByRole('tab', { name: '风控记录' }).click()
  const safetyCard = page.locator('section.art-section-card').filter({
    has: page.getByText('违章扣分', { exact: true })
  })
  await expect(safetyCard.getByText('初始违章第一页')).toBeVisible()
  await clickNext('违章扣分')
  await expect.poll(() => safetyOffsets).toEqual([0, 0, 20])
  await switchAwayAndBack()
  await expect.poll(() => safetyOffsets).toEqual([0, 0, 20, 0])
  await page.getByRole('tab', { name: '风控记录' }).click()
  await expect(safetyCard.getByText('返回后的违章第一页')).toBeVisible()
  releaseSafetyPage()
  await expect(safetyCard.getByText('返回后的违章第一页')).toBeVisible()
  await expect(safetyCard.getByText('迟到的违章第二页')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('driver-detail-latest-page.png'),
    fullPage: true
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
