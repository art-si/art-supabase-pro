import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(360_000)

const orderId = '11111111-1111-4111-8111-111111111201'
const contractId = '11111111-1111-4111-8111-111111111601'

for (const linked of [true, false]) {
  test(`订单综合查询${linked ? '已关联' : '未关联'}合同可读且布局完整`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_get_order_detail_secure')
        return route.fulfill({
          json: {
            id: orderId,
            orderNo: linked ? 'QA-ORDER-CONTRACT-001' : 'QA-ORDER-CONTRACT-002',
            contractId: linked ? contractId : null,
            orderStatus: 'pending_load',
            originStation: '上海站',
            destinationStation: '苏州站',
            shippingCustomer: { customerName: '验收客户甲' },
            receivingCustomer: { customerName: '验收客户乙' },
            cargoItems: [],
            relatedWaybills: [],
            fieldAccess: { freightAmounts: 'read', shipperContact: 'read', receiverContact: 'read' }
          }
        })
      if (endpoint === 'tms_get_order_contract_summary')
        return route.fulfill({
          json: {
            id: contractId,
            contractNo: 'HT-QA-2026-001',
            contractName: '验收客户年度运输合同',
            contractStatus: 'approved'
          }
        })
      if (endpoint === 'tms_list_transport_mainline_relations_secure')
        return route.fulfill({ json: { records: [], total: 0 } })
      if (endpoint === 'tms_get_order_mainline_finance_secure')
        return route.fulfill({
          json: {
            statementsAvailable: true,
            statements: [],
            statementTotal: 0,
            exceptions: [],
            exceptionTotal: 0
          }
        })
      if (endpoint === 'tms_list_mainline_costs_secure')
        return route.fulfill({ json: { records: [], total: 0 } })
      if (endpoint === 'sys_dictionary') {
        const code = new URL(route.request().url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '')
        const labels: Record<string, Array<[string, string]>> = {
          tmsOrderStatus: [['pending_load', '待配载']],
          tmsOrderPaymentMethod: [['monthly', '月结']],
          tmsOrderDeliveryMethod: [['door', '送货上门']]
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

    await page.goto('/tests/e2e/fixtures/tms-order-contract-visual.html', {
      waitUntil: 'commit'
    })
    await expect(page.locator('#tms-order-contract-visual .order-query-detail')).toBeVisible({
      timeout: 300_000
    })
    await expect(page.getByText('合同与报价')).toBeVisible()
    await expect(page.getByText('待配载').first()).toBeVisible()
    if (linked) {
      await expect(page.getByText('HT-QA-2026-001')).toBeVisible()
      await expect(page.getByText('验收客户年度运输合同')).toBeVisible()
    } else {
      await expect(page.getByText('这张订单未关联客户合同。')).toBeVisible()
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
      .toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({
      path: info.outputPath(`order-contract-${linked ? 'linked' : 'empty'}.png`),
      fullPage: true
    })
    if (linked) {
      await page.getByRole('link', { name: 'HT-QA-2026-001' }).click()
      await expect(page.getByText('合同详情')).toBeVisible()
    }
  })
}

test('快速切换订单时旧详情响应不会覆盖新订单', async ({ page }) => {
  const secondId = '11111111-1111-4111-8111-111111111202'
  let releaseFirst: () => void = () => {}
  let firstRequested = false
  let firstFulfilled = false
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = () => resolve()
  })
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const payload = route.request().postDataJSON?.() ?? {}
    if (endpoint === 'tms_get_order_detail_secure') {
      if (payload.p_id === orderId) {
        firstRequested = true
        await firstGate
      }
      await route.fulfill({
        json: {
          id: payload.p_id,
          orderNo: payload.p_id === orderId ? 'QA-ORDER-OLD' : 'QA-ORDER-NEW',
          contractId: null,
          orderStatus: 'pending_load',
          originStation: '上海站',
          destinationStation: '苏州站',
          relatedWaybills: [],
          fieldAccess: {}
        }
      })
      if (payload.p_id === orderId) firstFulfilled = true
      return
    }
    if (endpoint === 'tms_list_transport_mainline_relations_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (endpoint === 'tms_get_order_mainline_finance_secure')
      return route.fulfill({
        json: {
          statementsAvailable: true,
          statements: [],
          statementTotal: 0,
          exceptions: [],
          exceptionTotal: 0
        }
      })
    if (endpoint === 'tms_list_mainline_costs_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  try {
    await page.goto('/tests/e2e/fixtures/tms-order-contract-visual.html', { waitUntil: 'commit' })
    await expect.poll(() => firstRequested, { timeout: 300_000 }).toBe(true)
    await page.evaluate((id) => {
      window.dispatchEvent(
        new CustomEvent('tms-order-contract-route', { detail: `/tms/order-query/detail/${id}` })
      )
    }, secondId)
    await expect(page.getByText('QA-ORDER-NEW').first()).toBeVisible({ timeout: 30_000 })
  } finally {
    releaseFirst()
  }
  await expect.poll(() => firstFulfilled).toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByText('QA-ORDER-NEW').first()).toBeVisible()
  await expect(page.getByText('QA-ORDER-OLD')).toHaveCount(0)
})

test('快速切换订单时旧合同摘要不会覆盖新订单空态', async ({ page }) => {
  const secondId = '11111111-1111-4111-8111-111111111202'
  let releaseSummary: () => void = () => {}
  let summaryRequested = false
  let summaryFulfilled = false
  const summaryGate = new Promise<void>((resolve) => {
    releaseSummary = () => resolve()
  })
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const payload = route.request().postDataJSON?.() ?? {}
    if (endpoint === 'tms_get_order_detail_secure')
      return route.fulfill({
        json: {
          id: payload.p_id,
          orderNo: payload.p_id === orderId ? 'QA-ORDER-OLD' : 'QA-ORDER-NEW',
          contractId: payload.p_id === orderId ? contractId : null,
          orderStatus: 'pending_load',
          originStation: '上海站',
          destinationStation: '苏州站',
          relatedWaybills: [],
          fieldAccess: {}
        }
      })
    if (endpoint === 'tms_get_order_contract_summary') {
      summaryRequested = true
      await summaryGate
      await route.fulfill({
        json: { id: contractId, contractNo: 'HT-OLD', contractName: '旧合同' }
      })
      summaryFulfilled = true
      return
    }
    if (endpoint === 'tms_list_transport_mainline_relations_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (endpoint === 'tms_get_order_mainline_finance_secure')
      return route.fulfill({
        json: {
          statementsAvailable: true,
          statements: [],
          statementTotal: 0,
          exceptions: [],
          exceptionTotal: 0
        }
      })
    if (endpoint === 'tms_list_mainline_costs_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  try {
    await page.goto('/tests/e2e/fixtures/tms-order-contract-visual.html', { waitUntil: 'commit' })
    await expect.poll(() => summaryRequested, { timeout: 300_000 }).toBe(true)
    await page.evaluate((id) => {
      window.dispatchEvent(
        new CustomEvent('tms-order-contract-route', { detail: `/tms/order-query/detail/${id}` })
      )
    }, secondId)
    await expect(page.getByText('QA-ORDER-NEW').first()).toBeVisible({ timeout: 30_000 })
  } finally {
    releaseSummary()
  }
  await expect.poll(() => summaryFulfilled).toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByText('这张订单未关联客户合同。')).toBeVisible()
  await expect(page.getByText('HT-OLD')).toHaveCount(0)
})

for (const summaryFails of [false, true]) {
  test(`关联合同${summaryFails ? '读取失败可重试' : '无合同详情权限不提供跳转'}`, async ({
    page
  }) => {
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_get_order_detail_secure')
        return route.fulfill({
          json: {
            id: orderId,
            orderNo: 'QA-ORDER-PERMISSION',
            contractId,
            orderStatus: 'pending_load',
            originStation: '上海站',
            destinationStation: '苏州站',
            relatedWaybills: [],
            fieldAccess: {}
          }
        })
      if (endpoint === 'tms_get_order_contract_summary')
        return summaryFails
          ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'temporary failure' } })
          : route.fulfill({
              json: {
                id: contractId,
                contractNo: 'HT-QA-2026-001',
                contractName: '验收客户年度运输合同'
              }
            })
      if (endpoint === 'tms_list_transport_mainline_relations_secure')
        return route.fulfill({ json: { records: [], total: 0 } })
      if (endpoint === 'tms_get_order_mainline_finance_secure')
        return route.fulfill({
          json: {
            statementsAvailable: true,
            statements: [],
            statementTotal: 0,
            exceptions: [],
            exceptionTotal: 0
          }
        })
      if (endpoint === 'tms_list_mainline_costs_secure')
        return route.fulfill({ json: { records: [], total: 0 } })
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/tms-order-contract-visual.html${summaryFails ? '' : '?restricted'}`,
      { waitUntil: 'commit' }
    )
    await expect(page.getByText('合同与报价')).toBeVisible({ timeout: 300_000 })
    if (summaryFails) {
      await expect(page.getByText('关联合同加载失败，请重试。')).toBeVisible()
      await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    } else {
      await expect(page.getByText('HT-QA-2026-001')).toBeVisible()
      await expect(page.getByRole('link', { name: 'HT-QA-2026-001' })).toHaveCount(0)
    }
  })
}

test('订单详情读取失败显示中文错误并可重试', async ({ page }) => {
  let attempts = 0
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_get_order_detail_secure') {
      attempts += 1
      return attempts === 1
        ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'temporary failure' } })
        : route.fulfill({
            json: {
              id: orderId,
              orderNo: 'QA-ORDER-RETRIED',
              contractId: null,
              orderStatus: 'pending_load',
              originStation: '上海站',
              destinationStation: '苏州站',
              relatedWaybills: [],
              fieldAccess: {}
            }
          })
    }
    if (endpoint === 'tms_list_transport_mainline_relations_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (endpoint === 'tms_get_order_mainline_finance_secure')
      return route.fulfill({
        json: {
          statementsAvailable: true,
          statements: [],
          statementTotal: 0,
          exceptions: [],
          exceptionTotal: 0
        }
      })
    if (endpoint === 'tms_list_mainline_costs_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-order-contract-visual.html', { waitUntil: 'commit' })
  await expect(page.getByText('订单综合信息加载失败，请刷新后重试。', { exact: true })).toBeVisible({
    timeout: 300_000
  })
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('QA-ORDER-RETRIED').first()).toBeVisible()
  expect(attempts).toBe(2)
})
