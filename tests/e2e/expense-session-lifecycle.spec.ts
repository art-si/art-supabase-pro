import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockDeviceGeolocation } from './support/mock-device-geolocation'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('费用保存等待定位时切换记录，不向新记录提交旧确认', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1440) > 767, '保存时自动定位仅在窄屏启用')
  const saves: Record<string, unknown>[] = []
  await prepareIsolatedSession(page)
  await page.clock.install()
  await mockDeviceGeolocation(page)
  await page.route('**/rest/v1/**', (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    if (resource === 'tms_save_waybill_cost_secure') {
      const body = route.request().postDataJSON()
      saves.push(body)
      return route.fulfill({ json: { id: body.p_id } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/expense-session-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
  await expect(page.getByRole('button', { name: '定位当前位置', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '定位当前位置', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => matchMedia('(max-width: 767px)').matches)).toBe(true)
  await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /费用项目/ })).toBeEnabled()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog')).toContainText('合成费用-B')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(64)
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
  expect(saves).toEqual([])
})

test('等待定位期间清空金额会再次校验，未校验内容不提交', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1440) > 767, '保存时自动定位仅在窄屏启用')
  const saves: unknown[] = []
  await prepareIsolatedSession(page)
  await page.clock.install()
  await mockDeviceGeolocation(page)
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().includes('/tms_save_waybill_cost_secure'))
      saves.push(route.request().postDataJSON())
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/expense-session-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
  const amount = page.getByRole('spinbutton', { name: /费用金额/ })
  await expect(amount).toBeVisible()
  await expect(page.getByRole('combobox', { name: /费用项目/ })).toBeEnabled()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await amount.fill('')
  await amount.press('Tab')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await expect(page.locator('.el-form-item__error')).toContainText('费用金额必须大于 0')
  expect(saves).toEqual([])
})

for (const failed of [false, true]) {
  test(`旧识别结果加载${failed ? '失败' : '成功'}不影响新费用或清除其准备状态`, async ({
    page
  }) => {
    await prepareIsolatedSession(page)
    await page.clock.install()
    let configCalls = 0
    let releaseConfig!: () => void
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().url().includes('/get_effective_ai_feature_configs')) {
        configCalls++
        if (configCalls === 2)
          await new Promise<void>((resolve) => {
            releaseConfig = resolve
          })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/expense-session-lifecycle.html?deferredOcr', {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-expense-loader', 'pending')
    await page.keyboard.press('F8')
    await expect(page.getByRole('dialog')).toContainText('合成费用-B')
    await expect.poll(() => configCalls).toBe(2)
    await page.evaluate(
      (failed) =>
        document.dispatchEvent(new CustomEvent('expense-loader-result', { detail: { failed } })),
      failed
    )
    await page.clock.runFor(32)
    await expect(page.getByRole('dialog').locator('.art-dialog__viewport')).toHaveAttribute(
      'aria-busy',
      'true'
    )
    releaseConfig()
    await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toHaveValue('20.00')
    await expect(page.locator('.el-alert--error')).toHaveCount(0)
  })
}

test('旧保存完成后质量审计仍绑定原费用和原识别结果', async ({ page }) => {
  await prepareIsolatedSession(page)
  let release!: () => void
  let saves = 0
  const reviews: Record<string, unknown>[] = []
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('/tms_save_waybill_cost_secure')) {
      saves++
      const body = route.request().postDataJSON()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return route.fulfill({ json: { id: body.p_id } })
    }
    return route.fulfill({ json: [] })
  })
  await page.route('**/functions/v1/ai-waybill-expense-ocr', (route) => {
    reviews.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  await page.goto('/tests/e2e/fixtures/expense-session-lifecycle.html?artifact', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /费用项目/ })).toBeEnabled()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(() => saves).toBe(1)
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog')).toContainText('合成费用-B')
  release()
  await expect(page.getByTestId('success-count')).toHaveText('1')
  expect(reviews).toHaveLength(1)
  expect(reviews[0].artifactId).toBe('artifact-A')
  expect(reviews[0].entityId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  expect(reviews[0].finalPayload).toMatchObject({ amount: 10 })
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toHaveValue('20.00')
})
