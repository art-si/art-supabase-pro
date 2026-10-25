import { expect, test } from '@playwright/test'

const previewPath = '/tests/e2e/fixtures/ai-order-reference-scope.html'
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const platformCustomerId = '66666666-6666-4666-8666-666666666666'

test('没有客户名称时不启动客户查询，也不产生未处理错误', async ({ page }) => {
  let customerRequests = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('customer')) {
      customerRequests += 1
      await route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.goto(`${previewPath}?no-customer`)
  const output = page.locator('#reference-result')
  await expect(output).toContainText('"shippingCustomer":{"status":"empty"}')
  await expect(output).toContainText('"receivingCustomer":{"status":"empty"}')
  expect(customerRequests).toBe(0)
  expect(errors).toEqual([])
})

test('多条货物匹配限制并发、共享名称缓存并保持顺序', async ({ page }) => {
  let active = 0
  let peak = 0
  let cargoRequests = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/mdm_cargo')) {
      await route.fulfill({ json: [] })
      return
    }
    expect(url.searchParams.get('tenant_id')).toBe(`eq.${platformTenantId}`)
    cargoRequests += 1
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({ json: [] })
    active -= 1
  })
  await page.goto(`${previewPath}?bulk`)
  const output = page.locator('#reference-result')
  await expect(output).toContainText('货物-6')
  expect(peak).toBe(3)
  expect(cargoRequests).toBe(7)
  const result = JSON.parse(await output.innerText())
  expect(result.cargoItems).toEqual(
    Array.from({ length: 14 }, (_, index) => ({
      index,
      label: `货物-${index % 7}`,
      status: 'unmatched'
    }))
  )
})

test('全部租户智能填单只匹配默认平台租户的主数据', async ({ page }) => {
  test.setTimeout(60_000)
  const requests: Array<{ path: string; tenantFilter: string | null; body: string | null }> = []

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push({
      path: url.pathname,
      tenantFilter: url.searchParams.get('tenant_id'),
      body: request.postData()
    })

    if (url.pathname.endsWith('/rpc/tms_list_customer_options_secure')) {
      await route.fulfill({
        status: 200,
        json: [{ id: platformCustomerId, customer_name: '平台客户' }]
      })
      return
    }
    if (url.pathname.endsWith('/mdm_station') || url.pathname.endsWith('/mdm_cargo')) {
      await route.fulfill({ status: 200, json: [] })
      return
    }
    await route.fulfill({ status: 500, json: { message: 'unexpected reference request' } })
  })

  await page.goto(previewPath, { waitUntil: 'domcontentloaded' })
  const result = page.locator('#reference-result')
  await expect(result).toContainText(`"id":"${platformCustomerId}"`, { timeout: 45_000 })
  await expect(result).toContainText('"originStation":{"label":"平台发货站","status":"unmatched"}')

  const stationRequest = requests.find((request) => request.path.endsWith('/mdm_station'))
  const cargoRequest = requests.find((request) => request.path.endsWith('/mdm_cargo'))
  const customerRequest = requests.find((request) =>
    request.path.endsWith('/rpc/tms_list_customer_options_secure')
  )
  expect(stationRequest?.tenantFilter).toBe(`eq.${platformTenantId}`)
  expect(cargoRequest?.tenantFilter).toBe(`eq.${platformTenantId}`)
  expect(customerRequest?.body).toContain(`"p_tenant_id":"${platformTenantId}"`)
  expect(
    requests.some((request) => request.path.endsWith('/rpc/tms_list_customer_selector_secure'))
  ).toBe(false)
})
