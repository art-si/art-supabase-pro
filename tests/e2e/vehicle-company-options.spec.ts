import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('筛选改变后防抖等待期间旧响应不能结束加载状态', async ({ page }) => {
  let releaseOld!: () => void
  let releaseNew!: () => void
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const newGate = new Promise<void>((resolve) => {
    releaseNew = resolve
  })
  let oldRequests = 0
  await page.route('**/rest/v1/vehicle_reminder_insurance_expiry?*', async (route) => {
    const isOld = !new URL(route.request().url()).searchParams.has('company_name')
    if (isOld) oldRequests += 1
    await (isOld ? oldGate : newGate)
    await route.fulfill({
      status: 200,
      headers: {
        'content-range': `*/${isOld ? 99 : 2}`,
        'access-control-expose-headers': 'content-range'
      },
      body: ''
    })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-company-options.html?risk-ui')
  await expect.poll(() => oldRequests).toBe(4)
  const oldResponses = page.waitForResponse(
    (response) =>
      response.url().includes('vehicle_reminder_insurance_expiry') &&
      !new URL(response.url()).searchParams.has('company_name')
  )
  await page.getByRole('textbox', { name: '公司筛选' }).fill('新公司')
  releaseOld()
  await oldResponses
  await expect(page.getByText('正在检查风险')).toBeVisible()
  await expect(page.getByText('状态稳定 0')).toHaveCount(0)
  releaseNew()
  await expect(page.getByText('2', { exact: true })).toHaveCount(4)
  await expect(page.getByText('99', { exact: true })).toHaveCount(0)
})

test('旧风险统计较晚返回时不会覆盖新筛选结果', async ({ page }) => {
  let releaseOld!: () => void
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let oldRequests = 0
  await page.route('**/rest/v1/vehicle_reminder_insurance_expiry?*', async (route) => {
    const url = new URL(route.request().url())
    const isOld = !url.searchParams.has('company_name')
    if (isOld) {
      oldRequests += 1
      await oldGate
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-range': `*/${isOld ? 99 : 2}`,
        'access-control-expose-headers': 'content-range'
      },
      body: ''
    })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-company-options.html?risk-ui')
  await expect.poll(() => oldRequests).toBe(4)
  await page.getByRole('textbox', { name: '公司筛选' }).fill('新公司')
  await expect(page.getByText('正在检查风险')).toHaveCount(0)
  await expect(page.getByText('2', { exact: true })).toHaveCount(4)
  releaseOld()
  await page.waitForResponse(
    (response) =>
      response.url().includes('vehicle_reminder_insurance_expiry') &&
      !new URL(response.url()).searchParams.has('company_name')
  )
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByText('99', { exact: true })).toHaveCount(0)
  await expect(page.getByText('2', { exact: true })).toHaveCount(4)
})

test('风险概览失败显示不可用且重试恢复正常指标', async ({ page }) => {
  let failed = true
  await page.route('**/rest/v1/vehicle_reminder_insurance_expiry?*', async (route) => {
    await route.fulfill(
      failed
        ? { status: 500, json: { code: 'XX000', message: 'internal failure' } }
        : {
            status: 200,
            headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
            body: ''
          }
    )
  })
  await page.goto('/tests/e2e/fixtures/vehicle-company-options.html?risk-ui')
  await expect(page.getByText('风险统计暂不可用')).toBeVisible()
  await expect(page.getByText('状态稳定 0')).toHaveCount(0)
  await expect(page.getByText('—', { exact: true })).toHaveCount(4)
  await page.screenshot({ path: `.artifacts/vehicle-risk-error-${test.info().project.name}.png` })
  failed = false
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('状态稳定 0')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: `.artifacts/vehicle-risk-success-${test.info().project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('风险统计任一计数失败时不返回零值概览且重试可恢复', async ({ page }) => {
  let failed = true
  await page.route('**/rest/v1/vehicle_reminder_insurance_expiry?*', async (route) => {
    const url = new URL(route.request().url())
    expect(route.request().method()).toBe('HEAD')
    if (failed && url.searchParams.get('expired') === 'eq.true') {
      await route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal failure' } })
      return
    }
    const count = !url.searchParams.has('expired')
      ? 10
      : url.searchParams.get('expired') === 'eq.true'
        ? 2
        : url.searchParams.has('remaining_days') &&
            url.searchParams.get('remaining_days')?.includes('gt.')
          ? 3
          : 1
    await route.fulfill({
      status: 200,
      headers: { 'content-range': `*/${count}`, 'access-control-expose-headers': 'content-range' },
      body: ''
    })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-company-options.html?risk')
  const output = page.getByTestId('company-result')
  await page.getByRole('button', { name: '查询公司' }).click()
  await expect(output).toHaveText('风险概览加载失败')
  failed = false
  await page.getByRole('button', { name: '查询公司' }).click()
  await expect(output).toContainText('"total":10')
  expect(JSON.parse(await output.innerText()).data).toEqual({
    total: 10,
    overdue: 2,
    dueWithin7Days: 1,
    dueWithin30Days: 3,
    stable: 4
  })
})

test('公司选项完整合并去重，部分失败返回失败，重试可恢复', async ({ page }) => {
  let failed = false
  let requestCount = 0
  await page.route('**/rest/v1/**', async (route) => {
    requestCount += 1
    const url = new URL(route.request().url())
    if (failed && url.pathname.endsWith('/vehicle_reminder_inspection_expiry')) {
      await route.fulfill({
        status: 500,
        json: { code: 'XX000', message: 'internal test failure' }
      })
      return
    }
    await route.fulfill({
      json: [
        { company_name: '乙公司' },
        { company_name: '甲公司' },
        { company_name: '乙公司' },
        { company_name: '' },
        { company_name: null }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-company-options.html')
  const output = page.getByTestId('company-result')
  await page.getByRole('button', { name: '查询公司' }).click()
  await expect(output).toContainText('甲公司')
  expect(JSON.parse(await output.innerText())).toEqual({
    data: [{ companyName: '甲公司' }, { companyName: '乙公司' }],
    failed: false
  })
  expect(requestCount).toBe(5)
  failed = true
  await page.getByRole('button', { name: '查询公司' }).click()
  await expect(output).toHaveText('{"data":null,"failed":true}')
  expect(requestCount).toBe(10)
  failed = false
  await page.getByRole('button', { name: '查询公司' }).click()
  await expect(output).toContainText('甲公司')
  expect(JSON.parse(await output.innerText()).failed).toBe(false)
  expect(requestCount).toBe(15)
})
