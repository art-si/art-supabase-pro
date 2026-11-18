import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

const driver = {
  authUserId: 'qa-driver-auth',
  userId: 'qa-driver-user',
  tenantId: 'qa-tenant',
  tenantName: '验收服务商',
  kind: 'driver',
  displayName: '验收司机',
  email: 'driver@example.invalid',
  phone: '18900000111',
  enabled: true,
  accountEnabled: true,
  driverId: 'qa-driver',
  driverName: '验收司机',
  carrierName: '验收承运商',
  customerId: null,
  customerName: null,
  orderActorId: null,
  wechatBound: false,
  version: '2026-11-18T00:00:00Z'
}

test('移动账号抽屉保持可见表格并覆盖加载、失败重试、空查询和司机关联', async ({ page }, info) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page, { tenantId: 'qa-tenant', platformSuper: false })
  let state: 'success' | 'failed' | 'empty' = 'success'
  let release = (): void => undefined
  let pending: Promise<void> | undefined = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/rpc/system_list_mobile_accounts', async (route) => {
    await pending
    if (state === 'failed')
      return route.fulfill({
        status: 503,
        json: { code: 'QA_UNAVAILABLE', message: '账号列表暂时不可用，请重试' }
      })
    return route.fulfill({
      json: { records: state === 'empty' ? [] : [driver], total: state === 'empty' ? 0 : 1 }
    })
  })
  await page.route('**/rest/v1/rpc/system_mobile_account_workspace', (route) =>
    route.fulfill({
      json: {
        account: driver,
        users: [
          {
            id: driver.userId,
            authUserId: driver.authUserId,
            label: '验收司机 · driver@example.invalid',
            email: driver.email,
            phone: driver.phone,
            enabled: true
          }
        ],
        drivers: [
          { id: driver.driverId, label: '验收司机 · 18900000111 · 验收承运商', enabled: true }
        ],
        customers: [],
        orderActors: []
      }
    })
  )
  await page.route('**/rest/v1/rpc/system_save_mobile_account', (route) =>
    route.fulfill({ json: { ...driver, version: '2026-11-18T01:00:00Z' } })
  )
  await page.goto('/tests/e2e/fixtures/mobile-account.html', { waitUntil: 'commit' })
  await page.getByRole('button', { name: '打开移动账号', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '移动端账号', exact: true })
  await expect(drawer.getByText('正在加载表格数据…', { exact: true })).toBeVisible()
  release()
  pending = undefined
  const row = drawer.getByRole('row').filter({ hasText: driver.email })
  await expect(row).toBeVisible()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 })
    await expect(row).toBeInViewport()
    const box = await row.boundingBox()
    expect(box?.height).toBeGreaterThan(40)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: info.outputPath(`mobile-accounts-${width}.png`) })
  }
  await row.getByRole('button', { name: '编辑业务关联', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '业务身份与客户端', exact: true })
  await expect(editor.getByText('使用已有个人登录账号。', { exact: false })).toBeVisible()
  await editor.getByRole('tab', { name: '业务身份与客户端', exact: true }).click()
  await expect(editor.getByRole('textbox')).toHaveValue('验收司机 · 18900000111 · 验收承运商')
  await page.screenshot({ path: info.outputPath('mobile-account-driver-390.png') })
  await editor.getByRole('button', { name: '保存关联', exact: true }).click()
  await expect(editor).toBeHidden()
  state = 'failed'
  await drawer.getByRole('button', { name: '查询', exact: true }).click()
  await expect(drawer.getByText('账号列表暂时不可用，请重试', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('mobile-accounts-error-390.png') })
  state = 'empty'
  await drawer.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(drawer.getByText('尚未开通移动端账号', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '新建货主账号', exact: true })).toBeVisible()
})
