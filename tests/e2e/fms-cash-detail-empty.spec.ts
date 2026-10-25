import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/sys_dictionary?*', async (route) => {
    const code = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    const item = code?.endsWith('tmsCashTransactionStatus')
      ? { code: 'pending_allocation', label: '待核销', value: 'pending_allocation' }
      : code?.endsWith('tmsCashPaymentMethod')
        ? { code: 'bank_transfer', label: '银行转账', value: 'bank_transfer' }
        : null
    if (!item) throw new Error(`未定义测试字典：${code}`)

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ ...item, id: item.code, sort: 1, status: '1' }])
    })
  })
})

test('收付款详情的空凭证和空核销记录使用统一空状态', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/rpc/tms_get_cash_transaction_secure', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '44444444-4444-4444-8444-444444444444',
        tenantId: '11111111-1111-4111-8111-111111111111',
        transactionNo: 'TEST-RECEIPT-001',
        direction: 'receipt',
        counterpartyName: '测试客户',
        transactionDate: '2026-10-02',
        amount: 10,
        allocatedAmount: 0,
        unallocatedAmount: 10,
        allocationCount: 0,
        paymentMethod: 'bank_transfer',
        status: 'pending_allocation',
        voucherUrls: [],
        allocations: [],
        createTime: '2026-10-02T08:00:00Z',
        updateTime: '2026-10-02T08:00:00Z',
        fieldAccess: {
          transactionAmounts: 'read',
          bankDetails: 'read',
          voucherEvidence: 'read'
        }
      })
    })
  })
  await page.goto('/tests/e2e/fixtures/cash-detail-empty.html')
  if (testInfo.project.name.includes('dark')) {
    await page.evaluate(() => document.documentElement.classList.add('dark'))
  }
  if (testInfo.project.name.includes('shadow')) {
    await page.evaluate(() => document.documentElement.setAttribute('data-box-mode', 'shadow-mode'))
  }
  await page.getByRole('button', { name: '打开收款详情' }).click()

  const drawer = page.locator('.el-drawer')
  await expect(drawer.getByText('待核销', { exact: true })).toBeVisible()
  await expect(drawer.getByText('银行转账', { exact: true })).toBeVisible()
  await expect(drawer.getByText('暂无收付款凭证')).toBeVisible()
  await expect(drawer.getByText('暂无核销记录')).toBeVisible()
  await expect(drawer.locator('.art-empty-state')).toHaveCount(2)
  if (testInfo.project.name.includes('dark')) {
    const darkStyles = await page.evaluate(() => ({
      pageOpacity: getComputedStyle(document.documentElement).opacity,
      pageFilter: getComputedStyle(document.documentElement).filter,
      haloOpacity: Number(
        getComputedStyle(document.querySelector('.art-empty-state__halo') as SVGElement).opacity
      ),
      haloFill: getComputedStyle(document.querySelector('.art-empty-state__halo') as SVGElement)
        .fill
    }))
    expect(darkStyles.pageOpacity).toBe('1')
    expect(darkStyles.pageFilter).toBe('none')
    expect(darkStyles.haloOpacity).toBeGreaterThan(0)
    expect(darkStyles.haloOpacity).toBeLessThanOrEqual(1)
    const lightHaloFill = await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      const fill = getComputedStyle(
        document.querySelector('.art-empty-state__halo') as SVGElement
      ).fill
      document.documentElement.classList.add('dark')
      return fill
    })
    expect(darkStyles.haloFill).not.toBe(lightHaloFill)
  }

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/fms-cash-detail-empty-${testInfo.project.name}.png`,
    animations: 'disabled'
  })

  await drawer.getByText('暂无核销记录').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: `.artifacts/fms-cash-detail-empty-lower-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})

test('收付款记录不存在时显示可操作的详情空状态', async ({ page }) => {
  let requestCount = 0
  await page.route('**/rest/v1/rpc/tms_get_cash_transaction_secure', async (route) => {
    requestCount += 1
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })

  await page.goto('/tests/e2e/fixtures/cash-detail-empty.html')
  await page.getByRole('button', { name: '打开收款详情' }).click()

  const drawer = page.locator('.el-drawer')
  await expect(drawer.getByText('暂无收付款详情')).toBeVisible()
  await expect(drawer.getByText('请返回收付款列表重新选择记录，或刷新后重试。')).toBeVisible()
  await expect(drawer.getByText('TEST-RECEIPT-001', { exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无收付款详情')).toBeVisible()
  expect(requestCount).toBe(2)
})

test('收付款详情请求失败时显示错误并允许重试', async ({ page }, testInfo) => {
  let attempts = 0
  await page.route('**/rest/v1/rpc/tms_get_cash_transaction_secure', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST000', message: 'temporary connection failure' })
      })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })

  await page.goto('/tests/e2e/fixtures/cash-detail-empty.html')
  await page.getByRole('button', { name: '打开收款详情' }).click()

  const drawer = page.locator('.el-drawer')
  await expect(
    drawer.getByText('收付款详情加载失败，请重试或返回列表重新选择。', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('暂无收付款详情')).toHaveCount(0)
  await page.screenshot({
    path: `.artifacts/fms-cash-detail-error-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无收付款详情')).toBeVisible()
  expect(attempts).toBe(2)
})
