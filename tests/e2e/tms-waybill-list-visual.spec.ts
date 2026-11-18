import { expect, test, type Page } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { expectOverlayTabPanel } from './support/overlay-tab-card'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

async function setAppearance(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(async (theme) => {
    const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
      new URL('/src/hooks/core/useTheme.ts', location.origin).href
    )
    const { useSettingStore }: typeof import('../../src/store/modules/setting') = await import(
      new URL('/src/store/modules/setting.ts', location.origin).href
    )
    const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
      new URL('/src/enums/app-enum.ts', location.origin).href
    )
    useTheme().switchThemeStyles(theme === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT)
    useSettingStore().boxBorderMode = theme === 'light'
    document.documentElement.dataset.boxMode = theme === 'light' ? 'border-mode' : 'shadow-mode'
  }, theme)
  await assertAppearance(page, { theme, boxBorderMode: theme === 'light' })
}

const fees = {
  transportFee: 1200,
  deliveryFee: 80,
  unloadingFee: 40,
  collectPaymentFee: 20,
  transferFee: 50,
  declaredValue: 20000,
  insuranceFee: 30,
  packageFee: 10,
  otherFee: 5,
  totalFee: 1435
}
const common = {
  originStation: '上海站',
  transferStation: '昆山站',
  destinationStation: '苏州站',
  shippingContactName: '验收发货人',
  shippingCustomerName: '验收客户甲',
  receivingContactName: '验收收货人',
  receivingCustomerName: '验收客户乙',
  cargoItems: [{ cargoName: '测试货物' }],
  cargoQuantityTotal: 10,
  cargoVolumeTotal: 3.5,
  cargoWeightTotal: 800,
  paymentMethod: 'monthly',
  createTime: '2026-11-05T02:00:00Z',
  createdByName: '验收开单员',
  fieldAccess: { freightAmounts: 'read', settlementAmounts: 'read' },
  ...fees
}
const pending = [
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111201',
    orderNo: 'DD-PENDING-001',
    waybillNo: 'YD-PENDING-001',
    dispatchStatus: 'pending',
    hasReturnTrip: true
  },
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111202',
    orderNo: 'DD-PENDING-002',
    waybillNo: 'YD-PENDING-002',
    dispatchStatus: 'pending',
    hasReturnTrip: false
  }
]
const loaded = [
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111301',
    driverWaybillId: '11111111-1111-4111-8111-111111111301',
    waybillNo: 'YD-LOADED-001',
    orderNo: 'DD-PENDING-001',
    sourceOrderRefs: [
      { id: pending[0].id, orderNo: pending[0].orderNo },
      { id: pending[1].id, orderNo: pending[1].orderNo }
    ],
    executionKind: 'merge',
    dispatchType: 'forward_load',
    dispatchStatus: 'dispatched',
    waybillStatus: 'accepted',
    dispatchDriverName: '验收司机甲',
    driverOwnership: 'company',
    carrierName: '验收承运商',
    companyName: '验收物流公司',
    dispatchPlateNo: '测A12345',
    hasReturnTrip: true
  },
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111302',
    driverWaybillId: '11111111-1111-4111-8111-111111111302',
    waybillNo: 'YD202611-004-R01',
    forwardWaybillId: '11111111-1111-4111-8111-111111111399',
    forwardWaybillNo: 'YD202611-004-01',
    dispatchType: 'return_load',
    orderNo: 'DD-RETURN-002',
    sourceOrderRefs: [{ id: pending[1].id, orderNo: 'DD-RETURN-002' }],
    executionKind: 'single',
    dispatchStatus: 'dispatched',
    waybillStatus: 'loading',
    dispatchDriverName: '验收司机乙',
    driverOwnership: 'company',
    carrierName: '验收承运商',
    companyName: '验收物流公司',
    dispatchPlateNo: '测A67890',
    hasReturnTrip: true
  },
  {
    ...common,
    ...Object.fromEntries(Object.keys(fees).map((key) => [key, 0])),
    id: '11111111-1111-4111-8111-111111111303',
    driverWaybillId: '11111111-1111-4111-8111-111111111303',
    waybillNo: 'YD202611-004-R02',
    forwardWaybillId: '11111111-1111-4111-8111-111111111399',
    forwardWaybillNo: 'YD202611-004-01',
    dispatchType: 'return_empty',
    orderNo: '',
    sourceOrderRefs: [],
    executionKind: 'return_trip',
    dispatchStatus: 'dispatched',
    waybillStatus: 'accepted',
    dispatchDriverName: '验收司机乙',
    dispatchPlateNo: '测A67890',
    cargoItems: [],
    cargoQuantityTotal: 0,
    cargoVolumeTotal: 0,
    cargoWeightTotal: 0,
    hasReturnTrip: false
  }
]

for (const mode of ['pending', 'loaded'] as const) {
  test(`${mode === 'pending' ? '待配载派车' : '运输运单'}列表在深浅主题和窄屏下可读`, async ({
    page
  }, info) => {
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    let supplementPhase: 'empty' | 'error' | 'rows' = 'empty'
    let supplementGate: Promise<void> | undefined
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_list_dispatch_workbench_secure') {
        const request = route.request().postDataJSON() as {
          p_mode: 'pending' | 'loaded'
          p_count_only: boolean
        }
        const records = request.p_mode === 'pending' ? pending : loaded
        return route.fulfill({
          json: {
            records: request.p_count_only ? [] : records,
            total: records.length,
            fieldAccess: { freightAmounts: 'read', settlementAmounts: 'read' },
            waybillStatusCounts: { accepted: 1, loading: 1 }
          }
        })
      }
      if (endpoint === 'tms_get_order_detail_secure') {
        const { p_id } = route.request().postDataJSON() as { p_id: string }
        const order = pending.find((item) => item.id === p_id)
        return route.fulfill({
          json: order
            ? {
                ...order,
                tenantId: '11111111-1111-4111-8111-111111111111',
                status: 'pending_order',
                orderConfig: { loadType: 'ltl' },
                fieldAccess: { ...common.fieldAccess, proofAttachments: 'read' },
                cargoItems: common.cargoItems
              }
            : null
        })
      }
      if (endpoint === 'tms_get_order_execution_supplement_secure') {
        await supplementGate
        if (supplementPhase === 'error')
          return route.fulfill({ status: 503, json: { code: 'PGRST000', message: 'unavailable' } })
        return route.fulfill({
          json: {
            loading:
              supplementPhase === 'rows'
                ? [
                    {
                      id: '11111111-1111-4111-8111-111111111401',
                      waybillId: loaded[0].id,
                      waybillNo: loaded[0].waybillNo,
                      operationType: 'loading',
                      operationStatus: 'completed',
                      completedAt: null,
                      weightTon: 1,
                      remark: '验收装货记录'
                    }
                  ]
                : [],
            unloading: [],
            signatures: [],
            carrierReconciliation:
              supplementPhase === 'rows'
                ? [
                    {
                      statementId: '11111111-1111-4111-8111-111111111402',
                      statementNo: 'DZ-LAYOUT-001',
                      waybillId: loaded[0].id,
                      waybillNo: loaded[0].waybillNo,
                      carrierName: '测试承运商',
                      status: 'pending_review',
                      lineAmount: 100
                    }
                  ]
                : []
          }
        })
      }
      if (endpoint === 'sys_dictionary') {
        const code = new URL(route.request().url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '')
        const labels: Record<string, Array<[string, string]>> = {
          tmsOrderPaymentMethod: [['monthly', '月结']],
          tmsWaybillDispatchStatus: [['pending', '待派车']],
          tmsWaybillStatus: [
            ['accepted', '待装货'],
            ['loading', '装货中']
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
    await page.goto(
      `${process.env.E2E_FIXTURE_PREFIX || ''}/tests/e2e/fixtures/tms-waybill-list-visual.html?mode=${mode}`
    )
    await assertAppearance(page, { theme: 'light', boxBorderMode: true })
    await expect(
      page.getByRole('heading', { name: mode === 'pending' ? '待配载派车' : '运输运单' })
    ).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(mode === 'loaded' ? 4 : 3)
    for (const label of [
      '基础运费',
      '配送费',
      '卸货费',
      '回款费',
      '中转费',
      '声明价值',
      '保费',
      '包装费',
      '其他费用',
      '运费合计'
    ])
      await expect(page.getByRole('columnheader', { name: label })).toBeAttached()
    const tableScroll = page.locator('.el-table__body-wrapper .el-scrollbar__wrap').first()
    await expect
      .poll(() => tableScroll.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(100)
    await expect
      .poll(() => tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth))
      .toBe(true)
    if (mode === 'pending') {
      const returnBadge = page
        .getByRole('row')
        .filter({ hasText: 'DD-PENDING-001' })
        .getByText('含返程', { exact: true })
      await expect(returnBadge).toBeVisible()
      await expect
        .poll(() =>
          returnBadge.evaluate((element) => {
            const cell = element.closest('td')
            if (!cell) return false
            const badge = element.getBoundingClientRect()
            const bounds = cell.getBoundingClientRect()
            return badge.left >= bounds.left && badge.right <= bounds.right
          })
        )
        .toBe(true)
    }
    if (mode === 'loaded') {
      await expect(page.getByRole('link', { name: 'DD-PENDING-001' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'DD-PENDING-002' })).toBeVisible()
      const forward = page.getByRole('row').filter({ hasText: 'YD-LOADED-001' })
      await expect(forward).toContainText('合单')
      await expect(forward).not.toContainText('返程配载')
      const loadedReturn = page.getByRole('row').filter({ hasText: 'YD202611-004-R01' })
      const emptyReturn = page.getByRole('row').filter({ hasText: 'YD202611-004-R02' })
      await expect(loadedReturn).toContainText('返程配载')
      await expect(emptyReturn).toContainText('返程空载')
      for (const row of [loadedReturn, emptyReturn]) {
        await expect(
          row.getByRole('link', { name: 'YD202611-004-01', exact: true })
        ).toHaveAttribute(
          'href',
          /waybill-management\/detail\/11111111-1111-4111-8111-111111111399/
        )
      }
    }
    await expect(page.getByText('已使用前端默认列')).toBeHidden({ timeout: 15_000 })
    for (const theme of ['light', 'dark']) {
      await setAppearance(page, theme as 'light' | 'dark')
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1280, height: 800 },
        { width: 390, height: 844 }
      ]) {
        await page.setViewportSize(viewport)
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
          .toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath(`${mode}-${viewport.width}-${theme}.png`),
          animations: 'disabled'
        })
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await tableScroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await page.screenshot({
      path: info.outputPath(`${mode}-fee-columns-1440-dark.png`),
      animations: 'disabled'
    })
    const hero = page.getByRole('heading', {
      name: mode === 'pending' ? '待配载派车' : '运输运单'
    })
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(hero).toBeHidden()
    await expect(page.getByRole('table').last()).toBeVisible()
    await expect
      .poll(() => tableScroll.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(100)
    await expect(page.getByText(`共 ${mode === 'loaded' ? 3 : 2} 条`)).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${mode}-focus-1440-dark.png`),
      animations: 'disabled'
    })
    await page.getByRole('button', { name: '退出专注模式' }).click()
    await expect(hero).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(hero).toBeVisible()
    await tableScroll.evaluate((element) => {
      element.scrollLeft = 0
    })
    const sourceLink = page
      .getByRole('row')
      .filter({ hasText: mode === 'loaded' ? 'YD-LOADED-001' : 'DD-PENDING-001' })
      .getByRole('link', { name: 'DD-PENDING-001', exact: true })
    await sourceLink.scrollIntoViewIfNeeded()
    await expect(sourceLink).toBeInViewport()
    await sourceLink.click()
    const orderDrawer = page.locator('.art-drawer:visible')
    await expect(orderDrawer.getByText('运单详情 · DD-PENDING-001')).toBeVisible()
    for (const theme of ['light', 'dark'] as const) {
      await setAppearance(page, theme)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        for (const tab of ['运单收发信息', '配置信息', '货物信息', '应收信息']) {
          const item = orderDrawer.getByRole('tab', { name: tab })
          await item.click()
          await expect(item).toBeInViewport({ ratio: 0.95 })
          const panel = await expectOverlayTabPanel(orderDrawer, tab)
          await expect(panel.locator('.art-section-card')).toHaveCount(0)
          if (tab === '货物信息') {
            const cargo = panel.getByText('测试货物', { exact: true })
            await cargo.scrollIntoViewIfNeeded()
            await expect(cargo).toBeInViewport({ ratio: 0.95 })
          }
          if (tab === '配置信息')
            await expect(panel.getByText('暂无装卸签收记录', { exact: true })).toBeVisible()
          if (tab === '应收信息')
            await expect(panel.getByText('暂无承运对账', { exact: true })).toBeVisible()
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth)
          ).toBeLessThanOrEqual(width + 1)
          await page.screenshot({
            path: info.outputPath(`${mode}-order-${tab}-${width}-${theme}.png`),
            animations: 'disabled'
          })
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await setAppearance(page, 'light')
    await orderDrawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await expect(orderDrawer).toBeHidden()
    const held = Promise.withResolvers<void>()
    supplementGate = held.promise
    supplementPhase = 'error'
    await sourceLink.click()
    await orderDrawer.getByRole('tab', { name: '配置信息', exact: true }).click()
    const configuration = orderDrawer.getByRole('tabpanel', { name: '配置信息', exact: true })
    await expect(configuration.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
    await expect(configuration.locator('.el-skeleton')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${mode}-supplement-loading.png`) })
    held.resolve()
    supplementGate = undefined
    await expect(
      configuration.getByText('关联执行记录加载失败，请重试。', { exact: true })
    ).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${mode}-supplement-error.png`) })
    supplementPhase = 'rows'
    await configuration.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(configuration.getByText('验收装货记录', { exact: true })).toBeVisible()
    await expect(
      configuration.getByText('关联执行记录加载失败，请重试。', { exact: true })
    ).toBeHidden()
    await orderDrawer.getByRole('tab', { name: '应收信息', exact: true }).click()
    const receivable = orderDrawer.getByRole('tabpanel', { name: '应收信息', exact: true })
    await expect(receivable.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await receivable.getByRole('button', { name: '重新加载', exact: true }).click()
    const statement = receivable.getByText('DZ-LAYOUT-001', { exact: true })
    await statement.scrollIntoViewIfNeeded()
    await expect(statement).toBeInViewport({ ratio: 0.95 })
    await page.screenshot({ path: info.outputPath(`${mode}-supplement-recovered.png`) })
    await expect(hero).toBeVisible()
    await page.goto(`/tests/e2e/fixtures/tms-waybill-list-visual.html?orderId=${pending[0].id}`)
    await expect(page.getByRole('heading', { name: pending[0].orderNo, exact: true })).toBeVisible()
    const standalone = page.locator('.order-detail')
    await expect(standalone.locator('.art-overlay-tab-card')).toHaveCount(0)
    for (const tab of ['运单收发信息', '配置信息', '货物信息', '应收信息']) {
      await standalone.getByRole('tab', { name: tab, exact: true }).click()
      const panel = standalone.getByRole('tabpanel', { name: tab, exact: true })
      await expect(panel.locator('.art-section-card').first()).toBeVisible()
      if (tab === '应收信息')
        await expect(panel.getByText('DZ-LAYOUT-001', { exact: true })).toBeVisible()
    }
    await page.screenshot({ path: info.outputPath(`${mode}-standalone-order-detail.png`) })
    expect(errors).toEqual([])
  })
}
