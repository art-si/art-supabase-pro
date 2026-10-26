import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(600_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const orderIds = ['11111111-1111-4111-8111-111111111201', '11111111-1111-4111-8111-111111111202']
const driverIds = ['11111111-1111-4111-8111-111111111401', '11111111-1111-4111-8111-111111111402']
const vehicleIds = ['11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102']
const orders = [
  {
    id: orderIds[0],
    tenantId,
    orderNo: 'QA-ORDER-001',
    orderStatus: 'transporting',
    originStation: '上海站',
    destinationStation: '苏州站',
    deliveryMethod: 'door',
    shippingContactName: '测试发货方甲',
    receivingContactName: '测试收货方甲',
    shippingCustomer: { customerName: '验收客户甲' },
    receivingCustomer: { customerName: '验收客户乙' },
    paymentMethod: 'monthly',
    dispatchVehicleId: vehicleIds[0],
    dispatchPlateNo: '测A·10001',
    dispatchDriverId: driverIds[0],
    dispatchDriverName: '验收司机甲',
    totalFee: 1800,
    createTime: '2026-10-01T08:00:00+08:00',
    fieldAccess: {
      freightAmounts: 'edit',
      settlementAmounts: 'read',
      shipperContact: 'read',
      receiverContact: 'read',
      proofAttachments: 'read'
    }
  },
  {
    id: orderIds[1],
    tenantId,
    orderNo: 'QA-ORDER-002',
    orderStatus: 'pending_pickup',
    originStation: '宁波站',
    destinationStation: '杭州站',
    deliveryMethod: 'pickup',
    shippingContactName: '测试发货方乙',
    receivingContactName: '测试收货方乙',
    paymentMethod: 'cash',
    dispatchVehicleId: vehicleIds[1],
    dispatchPlateNo: '测A·10002',
    dispatchDriverId: driverIds[1],
    dispatchDriverName: '验收司机乙',
    totalFee: 960,
    createTime: '2026-10-02T08:00:00+08:00',
    fieldAccess: { freightAmounts: 'read' }
  }
]
const drivers = [
  {
    id: driverIds[0],
    employeeId: '11111111-1111-4111-8111-111111111901',
    tenantId,
    driverName: '验收司机甲',
    carrierId: '11111111-1111-4111-8111-111111111501',
    carrier: { companyName: '验收承运商' },
    driverType: 'primary',
    gender: 'male',
    licenseType: 'A2',
    licenseExpireDate: '2027-11-01',
    enabled: true,
    assignedVehicles: [{ id: vehicleIds[0], plateNo: '测A·10001' }],
    fieldAccess: {}
  },
  {
    id: driverIds[1],
    employeeId: '11111111-1111-4111-8111-111111111902',
    tenantId,
    driverName: '验收司机乙',
    carrierId: '11111111-1111-4111-8111-111111111501',
    carrier: { companyName: '验收承运商' },
    driverType: 'secondary',
    gender: 'female',
    licenseType: 'B2',
    licenseExpireDate: '2028-05-01',
    enabled: true,
    assignedVehicles: [{ id: vehicleIds[1], plateNo: '测A·10002' }],
    fieldAccess: {}
  }
]
const relations = [
  {
    tenantId,
    orderId: orderIds[0],
    orderNo: orders[0].orderNo,
    orderStatus: orders[0].orderStatus,
    waybillId: '11111111-1111-4111-8111-111111111301',
    waybillNo: 'QA-WB-001',
    waybillStatus: 'transporting',
    vehicleId: vehicleIds[0],
    plateNo: '测A·10001',
    driverId: driverIds[0],
    driverName: drivers[0].driverName,
    departedAt: '2026-10-03T08:00:00+08:00',
    completedAt: null
  },
  {
    tenantId,
    orderId: orderIds[0],
    orderNo: orders[0].orderNo,
    orderStatus: orders[0].orderStatus,
    waybillId: '11111111-1111-4111-8111-111111111302',
    waybillNo: 'QA-WB-002',
    waybillStatus: 'accepted',
    vehicleId: vehicleIds[1],
    plateNo: '测A·10002',
    driverId: driverIds[1],
    driverName: drivers[1].driverName,
    departedAt: null,
    completedAt: null
  },
  {
    tenantId,
    orderId: orderIds[1],
    orderNo: orders[1].orderNo,
    orderStatus: orders[1].orderStatus,
    waybillId: '11111111-1111-4111-8111-111111111303',
    waybillNo: 'QA-WB-003',
    waybillStatus: 'pending',
    vehicleId: vehicleIds[0],
    plateNo: '测A·10001',
    driverId: driverIds[0],
    driverName: drivers[0].driverName,
    departedAt: null,
    completedAt: null
  }
]

test('订单与司机综合查询两条记录可穿透，并在明暗主题及窄桌面呈现', async ({ page }, info) => {
  test.setTimeout(600_000)
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    process.stderr.write(`TMS 主线测试页面错误：${error.message}\n`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`TMS 主线浏览器错误：${message.text()}\n`)
  })
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const payload = route.request().postDataJSON?.() ?? {}
    if (endpoint === 'tms_list_orders_secure')
      return route.fulfill({
        json: { records: orders, total: 2, fieldAccess: orders[0].fieldAccess }
      })
    if (endpoint === 'tms_get_order_detail_secure')
      return route.fulfill({ json: orders.find((item) => item.id === payload.p_id) || null })
    if (endpoint === 'tms_get_order_quote_secure')
      return route.fulfill({
        json: {
          order: orders.find((item) => item.id === payload.p_order_id) || null,
          quote:
            payload.p_order_id === orderIds[0]
              ? {
                  id: '11111111-1111-4111-8111-111111111601',
                  orderId: orderIds[0],
                  status: 'submitted',
                  totalAmount: 1800,
                  submittedAt: '2026-10-02T10:00:00+08:00'
                }
              : null
        }
      })
    if (endpoint === 'tms_get_order_mainline_finance_secure')
      return route.fulfill({
        json: {
          statementsAvailable: !new URL(page.url()).searchParams.has('limited'),
          statementTotal:
            payload.p_order_id === orderIds[0] && !new URL(page.url()).searchParams.has('limited')
              ? 1
              : 0,
          statements:
            payload.p_order_id === orderIds[0] && !new URL(page.url()).searchParams.has('limited')
              ? [
                  {
                    id: '11111111-1111-4111-8111-111111111701',
                    statementId: '11111111-1111-4111-8111-111111111702',
                    statementNo: 'QA-ST-001',
                    status: 'pending_review',
                    periodStart: '2026-10-01',
                    periodEnd: '2026-10-31',
                    waybillNo: 'QA-WB-001',
                    isActive: true,
                    lineAmount: 1800
                  }
                ]
              : [],
          exceptionTotal: payload.p_order_id === orderIds[0] ? 1 : 0,
          exceptions:
            payload.p_order_id === orderIds[0]
              ? [
                  {
                    id: '11111111-1111-4111-8111-111111111801',
                    exceptionType: 'delay',
                    stage: 'transit',
                    description: '验收演示：到达时间调整',
                    occurredAt: '2026-10-03T13:00:00+08:00',
                    status: 'pending',
                    resolutionNote: null
                  }
                ]
              : []
        }
      })
    if (endpoint === 'tms_list_drivers_secure')
      return route.fulfill({ json: { records: drivers, total: 2, fieldAccess: {} } })
    if (endpoint === 'tms_get_driver_secure')
      return route.fulfill({ json: drivers.find((item) => item.id === payload.p_id) || null })
    if (endpoint === 'tms_get_driver_compensation_secure') {
      const first = payload.p_driver_id === driverIds[0]
      return route.fulfill({
        json: {
          employeeLinked: true,
          current: {
            id: first
              ? '11111111-1111-4111-8111-111111112001'
              : '11111111-1111-4111-8111-111111112002',
            employeeId: first
              ? '11111111-1111-4111-8111-111111112101'
              : '11111111-1111-4111-8111-111111112102',
            planName: first ? '司机月薪方案甲' : '司机月薪方案乙',
            baseAmount: first ? 8800 : 9200,
            currencyCode: 'CNY',
            payFrequency: 'monthly',
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            status: 'approved'
          }
        }
      })
    }
    if (endpoint === 'tms_list_driver_mainline_safety_secure') {
      const first = payload.p_driver_id === driverIds[0]
      const records =
        payload.p_kind === 'violation'
          ? first
            ? [
                {
                  id: '11111111-1111-4111-8111-111111111911',
                  vehicleId: vehicleIds[0],
                  plateNo: '测A·10001',
                  violationTime: '2026-10-08T09:00:00+08:00',
                  violationBehavior: '验收违章记录',
                  penaltyPoints: 3,
                  processed: false
                }
              ]
            : []
          : first
            ? [
                {
                  id: '11111111-1111-4111-8111-111111111912',
                  vehicleId: vehicleIds[0],
                  plateNo: '测A·10001',
                  accidentTime: '2026-10-09T15:00:00+08:00',
                  accidentSummary: '验收事故记录',
                  damageLevel: '轻微',
                  processed: true
                }
              ]
            : []
      return route.fulfill({ json: { available: true, records, total: records.length } })
    }
    if (endpoint === 'tms_list_driver_mainline_qualifications_secure') {
      const records =
        payload.p_driver_id === driverIds[0]
          ? [
              {
                id: '11111111-1111-4111-8111-111111111921',
                qualificationName: '道路运输从业资格',
                qualificationType: 'transport',
                status: 'valid',
                verificationStatus: 'verified',
                expiryDate: '2027-10-01'
              },
              {
                id: '11111111-1111-4111-8111-111111111922',
                qualificationName: '危险品运输资格',
                qualificationType: 'hazmat',
                status: 'valid',
                verificationStatus: 'verified',
                expiryDate: '2027-12-01'
              }
            ]
          : []
      return route.fulfill({
        json: { available: true, linkedEmployee: true, records, total: records.length }
      })
    }
    if (endpoint === 'hr_get_employee_profile_secure') {
      const trainings =
        payload.p_employee_id === drivers[0].employeeId
          ? [
              {
                id: '11111111-1111-4111-8111-111111111931',
                trainingName: '安全驾驶培训',
                trainingType: 'safety',
                startDate: '2026-08-01',
                endDate: '2026-08-02',
                trainingResult: '通过'
              },
              {
                id: '11111111-1111-4111-8111-111111111932',
                trainingName: '应急处置培训',
                trainingType: 'emergency',
                startDate: '2026-09-01',
                endDate: '2026-09-02',
                trainingResult: '通过'
              }
            ]
          : []
      return route.fulfill({ json: { fieldAccess: { careerRecords: 'read' }, trainings } })
    }
    if (endpoint === 'tms_list_mainline_costs_secure') {
      const records =
        payload.p_driver_id === driverIds[0]
          ? [
              {
                id: '11111111-1111-4111-8111-111111111941',
                costNo: 'QA-COST-001',
                waybillId: relations[0].waybillId,
                waybillNoSnapshot: 'QA-WB-001',
                orderNoSnapshot: 'QA-ORDER-001',
                plateNoSnapshot: '测A·10001',
                driverNameSnapshot: '验收司机甲',
                costType: 'toll',
                expenseItem: { itemName: '过路费' },
                amount: 120,
                occurredOn: '2026-10-03',
                auditStatus: 'approved',
                settlementStatus: 'unsettled'
              },
              {
                id: '11111111-1111-4111-8111-111111111942',
                costNo: 'QA-COST-002',
                waybillId: relations[2].waybillId,
                waybillNoSnapshot: 'QA-WB-003',
                orderNoSnapshot: 'QA-ORDER-002',
                plateNoSnapshot: '测A·10001',
                driverNameSnapshot: '验收司机甲',
                costType: 'parking',
                amount: 45,
                occurredOn: '2026-10-04',
                auditStatus: 'approved',
                settlementStatus: 'unsettled'
              }
            ]
          : []
      return route.fulfill({ json: { records, total: records.length } })
    }
    if (endpoint === 'tms_list_carrier_options_secure') return route.fulfill({ json: [] })
    if (endpoint === 'tms_list_current_driver_mainline_relations_secure') {
      const records = relations.filter(
        (item) =>
          item.driverId === payload.p_driver_id &&
          item.departedAt &&
          !item.completedAt &&
          !['completed', 'cancelled'].includes(item.waybillStatus || '')
      )
      return route.fulfill({
        json: {
          records: records.slice(payload.p_from || 0, (payload.p_to ?? 19) + 1),
          total: records.length
        }
      })
    }
    if (endpoint === 'tms_list_transport_mainline_relations_secure') {
      const records = relations.filter(
        (item) =>
          (!payload.p_order_ids || payload.p_order_ids.includes(item.orderId)) &&
          (!payload.p_driver_id || payload.p_driver_id === item.driverId) &&
          (!payload.p_vehicle_id || payload.p_vehicle_id === item.vehicleId)
      )
      return route.fulfill({
        json: {
          records: records.slice(payload.p_from || 0, (payload.p_to ?? 49) + 1),
          total: records.length
        }
      })
    }
    if (endpoint === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        tmsOrderStatus: [
          ['transporting', '运输中'],
          ['pending_pickup', '待提货']
        ],
        tmsWaybillStatus: [
          ['transporting', '运输中'],
          ['accepted', '已接单'],
          ['pending', '待调度']
        ],
        tmsDriverType: [
          ['primary', '主驾'],
          ['secondary', '副驾']
        ],
        tmsDriverLicenseType: [
          ['A2', 'A2'],
          ['B2', 'B2']
        ],
        commonBoolean: [
          ['true', '启用'],
          ['false', '停用']
        ],
        commonEnabledStatus: [
          ['enabled', '启用'],
          ['disabled', '停用']
        ],
        tmsOrderPaymentMethod: [
          ['monthly', '月结'],
          ['cash', '现付']
        ],
        tmsOrderDeliveryMethod: [
          ['door', '送货上门'],
          ['pickup', '客户自提']
        ],
        tmsOrderExceptionType: [['delay', '延误']],
        tmsOrderExceptionStage: [['transit', '在途']],
        tmsSettlementStatus: [['pending_review', '待审核']],
        vehicleRecordProcessed: [
          ['true', '已处理'],
          ['false', '未处理']
        ],
        hrQualificationStatus: [['valid', '有效']],
        hrQualificationVerificationStatus: [['verified', '已核验']],
        tmsCostAuditStatus: [['approved', '已审核']],
        tmsWaybillCostSettlementStatus: [['unsettled', '未结算']],
        tmsWaybillCostType: [['parking', '停车费']]
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

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html', {
      waitUntil: 'domcontentloaded'
    })
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.locator('.art-table-query')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText('QA-ORDER-001').first()).toBeVisible()
    await expect(page.getByText('QA-ORDER-002').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`order-list-${theme}.png`), fullPage: true })
    if (theme === 'light') {
      const orderDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出', exact: true }).click()
      expect((await orderDownload).suggestedFilename()).toContain('运输订单综合查询')
      await page
        .locator('.business-table-workspace-actions__toggle')
        .filter({ hasText: '专注模式' })
        .locator('.el-switch')
        .click()
      await expect(page.getByText('运输订单综合查询')).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(page.getByText('运输订单综合查询')).toBeVisible()
    }

    await page.getByText('QA-ORDER-001').first().click()
    await expect(page.locator('.order-query-detail')).toBeVisible()
    const orderHeaderBox = await page.locator('.order-query-detail .art-page-header').boundingBox()
    const orderFirstCardBox = await page
      .locator('.order-query-detail .art-section-card')
      .first()
      .boundingBox()
    if (!orderHeaderBox || !orderFirstCardBox) throw new Error('订单详情页头或首卡未渲染')
    expect(orderFirstCardBox.y - orderHeaderBox.y - orderHeaderBox.height).toBeGreaterThanOrEqual(
      12
    )
    await expect(page.getByRole('link', { name: 'QA-WB-001' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'QA-WB-002' })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`order-detail-${theme}.png`), fullPage: true })
    if (theme === 'light') {
      await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html', {
        waitUntil: 'domcontentloaded'
      })
      await page.getByText('QA-ORDER-002').first().click()
      await expect(page.locator('.order-query-detail')).toBeVisible()
      await expect(page.getByRole('link', { name: 'QA-WB-003' })).toBeVisible()
      await page.screenshot({
        path: info.outputPath('order-detail-second-light.png'),
        fullPage: true
      })
    }

    await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-list', {
      waitUntil: 'domcontentloaded'
    })
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.getByText('验收司机甲').first()).toBeVisible()
    await expect(page.getByText('验收司机乙').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`driver-list-${theme}.png`), fullPage: true })
    if (theme === 'light') {
      const driverDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出', exact: true }).click()
      expect((await driverDownload).suggestedFilename()).toContain('司机综合查询')
      await page
        .locator('.business-table-workspace-actions__toggle')
        .filter({ hasText: '专注模式' })
        .locator('.el-switch')
        .click()
      await expect(page.getByText('司机综合查询')).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(page.getByText('司机综合查询')).toBeVisible()
    }

    await page.getByText('验收司机甲').first().click()
    await expect(page.locator('.driver-query-detail')).toBeVisible()
    const driverHeaderBox = await page
      .locator('.driver-query-detail .art-page-header')
      .boundingBox()
    const driverFirstCardBox = await page
      .locator('.driver-query-detail .art-section-card')
      .first()
      .boundingBox()
    if (!driverHeaderBox || !driverFirstCardBox) throw new Error('司机详情页头或首卡未渲染')
    expect(
      driverFirstCardBox.y - driverHeaderBox.y - driverHeaderBox.height
    ).toBeGreaterThanOrEqual(12)
    await expect(page.getByRole('link', { name: 'QA-ORDER-001' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'QA-ORDER-002' }).first()).toBeVisible()
    await expect(page.getByText('当前出车')).toBeVisible()
    await expect(page.getByText('道路运输从业资格').first()).toBeVisible()
    await expect(page.getByText('危险品运输资格').first()).toBeVisible()
    await expect(page.getByText('安全驾驶培训').first()).toBeVisible()
    await expect(page.getByText('应急处置培训').first()).toBeVisible()
    await expect(page.getByText('司机月薪方案甲')).toBeVisible()
    await expect(page.getByText('¥8,800.00')).toBeVisible()
    await expect(page.getByText('验收违章记录').first()).toBeVisible()
    await expect(page.getByText('验收事故记录').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'QA-COST-001' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'QA-COST-002' })).toBeVisible()
    await expect(
      page
        .locator('.art-section-card')
        .filter({ hasText: '费用流水' })
        .getByRole('link', { name: 'QA-WB-001' })
    ).toBeVisible()
    await expect(page.getByText('停车费').first()).toBeVisible()
    await expect(
      page.locator('.driver-query-detail .el-tag:visible').filter({ hasText: '已审核' }).first()
    ).toBeVisible()
    await expect(
      page.locator('.driver-query-detail .el-tag:visible').filter({ hasText: '未结算' }).first()
    ).toBeVisible()
    await page.screenshot({ path: info.outputPath(`driver-detail-${theme}.png`), fullPage: true })
    if (theme === 'light') {
      await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-list', {
        waitUntil: 'domcontentloaded'
      })
      await page.getByText('验收司机乙').first().click()
      await expect(page.locator('.driver-query-detail')).toBeVisible()
      await expect(page.getByText('QA-ORDER-001')).toBeVisible()
      await expect(page.getByText('司机月薪方案乙')).toBeVisible()
      await expect(page.getByText('¥9,200.00')).toBeVisible()
      await expect(page.getByText('暂无资质记录')).toBeVisible()
      await expect(page.getByText('暂无关联违章')).toBeVisible()
      await expect(page.getByText('暂无关联事故')).toBeVisible()
      await expect(page.getByText('暂无关联费用')).toBeVisible()
      await page.screenshot({
        path: info.outputPath('driver-detail-second-light.png'),
        fullPage: true
      })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }

  for (const entry of ['order-list', 'order-detail', 'driver-list', 'driver-detail']) {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(
      `/tests/e2e/fixtures/tms-mainline-visual.html?page=${encodeURIComponent(entry)}`,
      {
        waitUntil: 'domcontentloaded'
      }
    )
    const selector = entry.includes('detail')
      ? `.${entry.replace('-', '-query-')}`
      : '.art-table-query'
    await expect(page.locator(selector).first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${entry}-1280.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=order-detail&limited', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.order-query-detail')).toBeVisible()
  await expect(page.getByText('没有客户对账查看权限。')).toBeVisible()
  await expect(page.getByRole('link', { name: '测A·10001' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '验收司机甲' })).toHaveCount(0)
  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-detail&limited', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('暂无薪酬查看权限')).toBeVisible()
  await expect(page.getByText('司机月薪方案甲')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('1920 宽度订单日期独占一行且状态使用字典文案', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_orders_secure') {
      return route.fulfill({ json: { records: orders, total: orders.length, fieldAccess: {} } })
    }
    return route.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 1920, height: 900 })
  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html', {
    waitUntil: 'domcontentloaded'
  })
  const identity = page
    .getByRole('link', { name: 'QA-ORDER-001' })
    .first()
    .locator(
      'xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," business-record-link ")][1]'
    )
  await expect(identity).toBeVisible()
  const numberBox = await identity.getByRole('link', { name: 'QA-ORDER-001' }).boundingBox()
  const dateBox = await identity.locator(':scope > small').boundingBox()
  if (!numberBox || !dateBox) throw new Error('订单号或开单日期未渲染')
  expect(dateBox.y).toBeGreaterThan(numberBox.y + numberBox.height)
  await expect(
    page.locator('.el-table__body').getByText('运输中', { exact: true }).first()
  ).toBeVisible()
  await expect(
    page.locator('.el-table__body').getByText('待提货', { exact: true }).first()
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('order-list-1920-dictionary.png'), fullPage: true })
})

test('司机当前出车独立于历史分页且 1280 宽度处理状态完整可见', async ({ page }, info) => {
  test.setTimeout(240_000)
  const historical = Array.from({ length: 21 }, (_, index) => ({
    ...relations[2],
    waybillId: `11111111-1111-4111-8111-${String(index + 500).padStart(12, '0')}`,
    waybillNo: `QA-WB-H-${String(index + 1).padStart(2, '0')}`,
    waybillStatus: 'completed',
    departedAt: '2026-09-01T08:00:00+08:00',
    completedAt: '2026-09-02T08:00:00+08:00'
  }))
  const allHistory = [...historical, relations[0]]
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const payload = route.request().postDataJSON?.() ?? {}
    if (endpoint === 'tms_get_driver_secure') return route.fulfill({ json: drivers[0] })
    if (endpoint === 'tms_list_current_driver_mainline_relations_secure') {
      return route.fulfill({ json: { records: [relations[0]], total: 1 } })
    }
    if (endpoint === 'tms_list_transport_mainline_relations_secure') {
      return route.fulfill({
        json: {
          records: allHistory.slice(payload.p_from || 0, (payload.p_to ?? 19) + 1),
          total: allHistory.length
        }
      })
    }
    if (endpoint === 'tms_list_driver_mainline_safety_secure') {
      return route.fulfill({
        json: {
          available: true,
          records:
            payload.p_kind === 'violation'
              ? [
                  {
                    id: '11111111-1111-4111-8111-111111111911',
                    vehicleId: vehicleIds[0],
                    plateNo: '测A·10001',
                    violationTime: '2026-10-08T09:00:00+08:00',
                    violationBehavior: '验收违章记录',
                    penaltyPoints: 3,
                    processed: false
                  }
                ]
              : [],
          total: payload.p_kind === 'violation' ? 1 : 0
        }
      })
    }
    if (endpoint === 'tms_list_driver_mainline_qualifications_secure') {
      return route.fulfill({
        json: { available: true, linkedEmployee: true, records: [], total: 0 }
      })
    }
    if (endpoint === 'hr_get_employee_profile_secure') {
      return route.fulfill({ json: { fieldAccess: { careerRecords: 'read' }, trainings: [] } })
    }
    if (endpoint === 'tms_get_driver_compensation_secure') {
      return route.fulfill({ json: { employeeLinked: true, current: null } })
    }
    if (endpoint === 'tms_list_mainline_costs_secure') {
      return route.fulfill({ json: { records: [], total: 0 } })
    }
    if (endpoint === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        tmsDriverType: [['primary', '主驾']],
        commonEnabledStatus: [['enabled', '启用']],
        tmsWaybillStatus: [
          ['transporting', '运输中'],
          ['completed', '已完成']
        ],
        vehicleRecordProcessed: [['false', '未处理']]
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

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-detail', {
    waitUntil: 'domcontentloaded'
  })
  const currentCard = page.locator('.driver-query-detail .art-section-card').filter({
    has: page.getByText('当前出车', { exact: true })
  })
  const historyCard = page.locator('.driver-query-detail .art-section-card').filter({
    has: page.getByText('承运订单与车辆', { exact: true })
  })
  await expect(currentCard.getByRole('link', { name: 'QA-ORDER-001' })).toBeVisible({
    timeout: 90_000
  })
  await expect(historyCard.getByText('QA-WB-H-01')).toBeVisible()
  await historyCard.locator('.btn-next').click()
  await expect(historyCard.getByText('QA-WB-H-21')).toBeVisible()
  await expect(currentCard.getByRole('link', { name: 'QA-ORDER-001' })).toBeVisible()
  await expect(page.getByText('主驾', { exact: true })).toBeVisible()
  await expect(page.getByText('启用', { exact: true })).toBeVisible()
  await expect(historyCard.getByText('已完成', { exact: true })).toBeVisible()
  await expect(historyCard.getByText('运输中', { exact: true })).toBeVisible()

  const violationCard = page.locator('.driver-query-detail .art-section-card').filter({
    has: page.getByText('违章扣分', { exact: true })
  })
  const violationBounds = await violationCard.boundingBox()
  const statusBounds = await violationCard.getByText('处理状态', { exact: true }).boundingBox()
  if (!violationBounds || !statusBounds) throw new Error('违章卡片或处理状态列未渲染')
  expect(statusBounds.x + statusBounds.width).toBeLessThanOrEqual(
    violationBounds.x + violationBounds.width - 8
  )
  await expect(violationCard.getByText('未处理', { exact: true })).toBeVisible()
  await expect(page.getByText(/^(primary|enabled|completed|false)$/)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({
    path: info.outputPath('driver-current-history-page-2-1280.png'),
    fullPage: true
  })
})
