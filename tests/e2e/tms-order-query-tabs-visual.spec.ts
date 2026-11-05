import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('订单综合查询的运单详情分类与异常费用空态可读', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_get_order_detail_secure')
      return route.fulfill({
        json: {
          id: '11111111-1111-4111-8111-111111111201',
          orderNo: 'QA-ORDER-TABS-001',
          orderStatus: 'pending_load',
          originStation: '上海站',
          destinationStation: '苏州站',
          dispatchDriverName: '验收司机甲',
          driverOwnership: 'company',
          dispatchPlateNo: '测A12345',
          dispatchMode: 'vehicle',
          shippingCustomer: { customerName: '验收客户甲' },
          receivingCustomer: { customerName: '验收客户乙' },
          cargoItems: [],
          relatedWaybills: [],
          fieldAccess: {
            freightAmounts: 'read',
            settlementAmounts: 'read',
            proofAttachments: 'read',
            shipperContact: 'read',
            receiverContact: 'read'
          }
        }
      })
    if (endpoint === 'tms_get_order_execution_supplement_secure')
      return route.fulfill({
        json: { loading: [], unloading: [], signatures: [], carrierReconciliation: [] }
      })
    if (endpoint === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        tmsOrderStatus: [['pending_load', '待配载']],
        tmsWaybillStatus: [['accepted', '待装货']],
        tmsDriverOwnership: [['company', '自有司机']],
        tmsDispatchOperatorMode: [['vehicle', '车辆调度']]
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

  await page.goto('/tests/e2e/fixtures/tms-order-contract-visual.html')
  await expect(page.getByRole('heading', { name: 'QA-ORDER-TABS-001' })).toBeVisible()
  await page.getByRole('tab', { name: '运单详情', exact: true }).click()
  const detailTabs = page.locator('.order-detail__tabs')
  await expect(detailTabs.getByRole('tab')).toHaveText([
    '运单收发信息',
    '配置信息',
    '货物信息',
    '应收信息'
  ])
  await expect(page.getByText('已使用前端默认列')).toBeHidden({ timeout: 15_000 })
  await page.screenshot({ path: info.outputPath('waybill-detail-1440-light.png') })
  await detailTabs.getByRole('tab', { name: '配置信息' }).click()
  await expect(page.getByText('暂无装卸签收记录')).toBeVisible()
  await page.screenshot({ path: info.outputPath('waybill-config-1440-light.png') })
  await detailTabs.getByRole('tab', { name: '应收信息' }).click()
  await expect(page.getByText('暂无承运对账')).toBeVisible()
  await page.screenshot({ path: info.outputPath('waybill-receivable-1440-light.png') })

  await page.getByRole('tab', { name: '异常费用' }).click()
  await expect(page.getByText('暂无异常费用')).toBeVisible()
  await page.screenshot({ path: info.outputPath('abnormal-empty-1440-light.png') })

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`abnormal-empty-390-${theme}.png`) })
  }
  expect(errors).toEqual([])
})
