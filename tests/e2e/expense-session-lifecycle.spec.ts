import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockDeviceGeolocation } from './support/mock-device-geolocation'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

function fulfillExpenseFixtureRest(route: Route) {
  const expenseItems = new URL(route.request().url()).pathname.endsWith('/tms_expense_item')
  return route.fulfill({
    headers: expenseItems ? { 'content-range': '0-0/1' } : undefined,
    json: expenseItems
      ? [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            item_code: 'EXPENSE',
            item_name: '合成费用项目',
            parent_id: null,
            is_enabled: true,
            is_selectable: true,
            sort: 1
          }
        ]
      : []
  })
}

test('费用保存等待定位时切换记录，不向新记录提交旧确认', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1440) > 767, '保存时自动定位仅在窄屏启用')
  const saves: Record<string, unknown>[] = []
  await prepareIsolatedSession(page)
  await page.clock.install()
  await mockDeviceGeolocation(page)
  await page.route('**/rest/v1/**', (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    if (resource === 'tms_save_waybill_cost_classified_secure') {
      const body = route.request().postDataJSON()
      saves.push(body)
      return route.fulfill({ json: { id: body.p_id } })
    }
    return fulfillExpenseFixtureRest(route)
  })
  await page.goto('/tests/e2e/fixtures/expense-session-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
  await page.getByRole('tab', { name: '地点与说明', exact: true }).click()
  await expect(page.getByRole('button', { name: '定位当前位置', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '定位当前位置', exact: true })).toBeEnabled()
  await page.getByRole('tab', { name: '业务关联', exact: true }).click()
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
    if (route.request().url().includes('/tms_save_waybill_cost_classified_secure'))
      saves.push(route.request().postDataJSON())
    return fulfillExpenseFixtureRest(route)
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
  await expect(
    page.getByRole('alert').filter({ hasText: '第 10 行：费用金额必须大于 0' })
  ).toBeVisible()
  await expect(page.getByRole('dialog').locator('.is-validation-error')).toHaveCount(1)
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
      return fulfillExpenseFixtureRest(route)
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
    if (route.request().url().includes('/tms_save_waybill_cost_classified_secure')) {
      saves++
      const body = route.request().postDataJSON()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return route.fulfill({ json: { id: body.p_id } })
    }
    return fulfillExpenseFixtureRest(route)
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

for (const failed of [false, true]) {
  test(`同一运单切换收款对象后旧司机账户${failed ? '失败' : '成功'}不污染新请求`, async ({
    page
  }) => {
    await prepareIsolatedSession(page)
    let reads = 0
    let releaseOld: (() => void) | undefined
    await page.route('**/rest/v1/**', async (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      if (resource === 'fms_get_waybill_driver_default_account_secure') {
        const call = ++reads
        if (call === 1)
          await new Promise<void>((resolve) => {
            releaseOld = resolve
          })
        if (call === 1 && failed) {
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'stale driver lookup' }
          })
        }
        return route.fulfill({
          json: {
            driverId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            driverName: call === 1 ? '旧司机资料' : '当前司机资料',
            hasDefaultAccount: true,
            invoiceName: '合成开票名称',
            taxNo: null,
            bankName: '合成银行',
            bankAccount: call === 1 ? 'STALE-ACCOUNT' : 'CURRENT-ACCOUNT',
            bankBranch: null
          }
        })
      }
      return fulfillExpenseFixtureRest(route)
    })
    await page.goto('/tests/e2e/fixtures/expense-session-lifecycle.html?optionRaces')
    await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '编辑运单费用 · 合成费用-A', exact: true })
    await expect(dialog.getByRole('spinbutton', { name: /费用金额/ })).toBeVisible()
    await dialog.getByRole('tab', { name: '收款与票据', exact: true }).click()
    const payee = dialog.getByRole('combobox', { name: '收款对象', exact: true })
    await payee.click()
    await page.getByRole('option', { name: '运单司机', exact: true }).click()
    await expect.poll(() => reads).toBe(1)
    await payee.click()
    await page.getByRole('option', { name: '手工指定', exact: true }).click()
    await payee.click()
    await page.getByRole('option', { name: '运单司机', exact: true }).click()
    const account = dialog.getByRole('textbox', { name: '收款账号', exact: true })
    await expect(account).toHaveValue('CURRENT-ACCOUNT')
    releaseOld?.()
    await page.waitForLoadState('networkidle')
    await expect(account).toHaveValue('CURRENT-ACCOUNT')
    await expect(dialog.getByRole('textbox', { name: '收款方', exact: true })).toHaveValue(
      '当前司机资料'
    )
    await expect(dialog).not.toContainText('司机收款资料加载失败')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
  })
}

for (const mode of ['record', 'permission', 'scope', 'current'] as const) {
  test(`费用明细校验等待期间 ${mode} 保持提交上下文`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const saves: Record<string, unknown>[] = []
    await page.route('**/rest/v1/**', (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      if (resource === 'tms_save_waybill_cost_classified_secure') {
        const body = route.request().postDataJSON()
        saves.push(body)
        return route.fulfill({ json: { id: body.p_id } })
      }
      return fulfillExpenseFixtureRest(route)
    })
    await page.goto(
      `/tests/e2e/fixtures/expense-session-lifecycle.html?lineValidation&optionRaces${mode === 'scope' ? '&platformScope' : ''}`
    )
    await page.getByRole('button', { name: '打开费用表单', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toHaveValue('10.00')
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-line-validation', 'pending')
    if (mode === 'record') {
      await page.keyboard.press('F8')
      await expect(page.getByRole('dialog')).toContainText('合成费用-B')
      await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
      await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toHaveValue('20.00')
    }
    if (mode === 'permission') await page.keyboard.press('F7')
    if (mode === 'scope') {
      await page.keyboard.press('F6')
      await expect(page.locator('html')).toHaveAttribute(
        'data-expense-scope',
        '22222222-2222-4222-8222-222222222222'
      )
    }
    // The real ArtTable runs its original rules plus one fixture-only deferred metadata rule.
    // Product submit/validation methods are not replaced; the event releases that actual rule.
    await page.evaluate(() =>
      document.dispatchEvent(
        new CustomEvent('expense-line-validation-result', { detail: { valid: true } })
      )
    )
    await expect(page.locator('html')).toHaveAttribute('data-line-validation', 'resolved')
    await page.waitForLoadState('networkidle')
    if (mode === 'current') {
      expect(saves).toHaveLength(1)
      expect(saves[0].p_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      await expect(page.getByTestId('success-count')).toHaveText('1')
      return
    }
    expect(saves).toEqual([])
    await expect(page.getByTestId('success-count')).toHaveText('0')
    await expect(page.getByRole('dialog')).toBeVisible()
    if (mode === 'record') {
      await expect(page.getByRole('spinbutton', { name: /费用金额/ })).toHaveValue('20.00')
      await expect(page.getByRole('dialog')).not.toContainText('请检查费用明细', { timeout: 1500 })
      await expect(page.locator('.el-message--error')).toHaveCount(0)
    }
  })
}
