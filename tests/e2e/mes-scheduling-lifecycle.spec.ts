import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [tenantA, tenantB].map((id, index) => ({
        id,
        tenant_name: `测试租户${index + 1}`,
        tenant_code: `test-${index + 1}`,
        status: '1'
      }))
    })
  )
  await page.route('**/rest/v1/rpc/mes_scheduling_context', (route) =>
    route.fulfill({ json: { shifts: [] } })
  )
})

test('旧租户加载完成后不会创建过期订阅', async ({ page }) => {
  let releaseOld!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const requests: string[] = []
  let oldFinished = false
  await page.route('**/rest/v1/mes_operation_task?*', async (route) => {
    const tenant = route.request().headers()['x-art-tenant-scope'] ?? ''
    const isOld = requests.length === 0
    requests.push(tenant)
    if (isOld) await gate
    await route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    if (isOld) oldFinished = true
  })
  await page.goto('/tests/e2e/fixtures/mes-scheduling-lifecycle.html')
  await expect.poll(() => requests.length, { timeout: 60_000 }).toBe(1)
  await page.getByRole('button', { name: '切换测试租户' }).click()
  await expect(page.getByTestId('subscriptions')).toContainText(`mes-scheduling-${tenantB}-`)
  releaseOld()
  await expect.poll(() => oldFinished).toBe(true)
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  const subscriptions: string[] = JSON.parse(await page.getByTestId('subscriptions').innerText())
  expect(subscriptions).toHaveLength(1)
  expect(subscriptions[0]).toContain(tenantB)
  expect(requests).toEqual([tenantA, tenantB])
  await page.getByRole('button', { name: '离开排程页面' }).click()
  await expect(page.getByTestId('removals')).toContainText(subscriptions[0])
})

test('离开页面后已排队的实时刷新不再加载', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/mes_operation_task?*', (route) => {
    requests += 1
    return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })
  await page.goto('/tests/e2e/fixtures/mes-scheduling-lifecycle.html')
  await expect(page.getByTestId('subscriptions')).toContainText(`mes-scheduling-${tenantA}-`)
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'))
  await page.getByRole('button', { name: '模拟实时变化' }).click()
  await page.getByRole('button', { name: '离开排程页面' }).click()
  await expect(page.getByTestId('removals')).toContainText(tenantA)
  await page.clock.runFor(600)
  expect(requests).toBe(1)
})
