import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test('承运方调度带出、改选并保存开票账户', async ({ page }) => {
  const writes: Array<Record<string, unknown>> = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_dispatch_candidates_secure') {
      return route.fulfill({
        json: {
          records: [
            {
              id: 'carrier-a',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              company_name: '承运商甲',
              dispatch_channel: 'offline'
            },
            {
              id: 'carrier-b',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              company_name: '承运商乙',
              dispatch_channel: 'offline'
            }
          ],
          total: 2
        }
      })
    }
    if (endpoint === 'tms_list_carrier_billing_accounts_for_dispatch_secure') {
      const carrierId = route.request().postDataJSON().p_carrier_id
      return route.fulfill({
        json:
          carrierId === 'carrier-a'
            ? [
                {
                  id: 'account-a1',
                  invoice_title: '甲默认账户',
                  bank_name: '甲银行',
                  is_default: true
                },
                {
                  id: 'account-a2',
                  invoice_title: '甲备用账户',
                  bank_name: '乙银行',
                  is_default: false
                }
              ]
            : [
                {
                  id: 'account-b1',
                  invoice_title: '乙默认账户',
                  bank_name: '丙银行',
                  is_default: true
                }
              ]
      })
    }
    if (endpoint === 'tms_create_dispatch_plan_secure') {
      writes.push(route.request().postDataJSON().p_plan as Record<string, unknown>)
      return route.fulfill({ json: { waybill_ids: ['waybill-1'], waybill_nos: ['YWD-001'] } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-carrier-dispatch-account.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开调度' }).click()
  const dialog = page.getByRole('dialog', { name: '调度配载' })
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-radio-button').filter({ hasText: '承运方' }).click()
  await dialog.getByRole('textbox', { name: /承运方/ }).click()
  const picker = page.getByRole('dialog', { name: '选择承运方' })
  await expect(picker).toBeVisible()
  await picker.getByText('承运商甲', { exact: true }).click()
  await picker.getByRole('button', { name: '确定' }).click()
  const account = dialog
    .locator('.el-form-item')
    .filter({ hasText: '开票账户' })
    .locator('.el-select')
  await expect(account).toContainText('甲默认账户')
  await account.click()
  await page.getByText('甲备用账户 · 乙银行', { exact: false }).click()
  await expect(account).toContainText('甲备用账户')
  await dialog.getByRole('textbox', { name: /承运方/ }).click()
  await picker.getByText('承运商乙', { exact: true }).click()
  await picker.getByRole('button', { name: '确定' }).click()
  await expect(account).toContainText('乙默认账户')
  await dialog.getByRole('combobox', { name: /计划发车时间/ }).fill('2026-11-03 10:00:00')
  await dialog.getByRole('combobox', { name: /计划发车时间/ }).press('Tab')
  await dialog.getByRole('combobox', { name: /计划到达时间/ }).fill('2026-11-03 14:00:00')
  await dialog.getByRole('combobox', { name: /计划到达时间/ }).press('Tab')
  await dialog.getByRole('button', { name: '确认配载' }).click()
  await expect.poll(() => writes.length).toBe(1)
  const execution = (writes[0].executions as Array<Record<string, unknown>>)[0]
  expect(execution.dispatch_carrier_id).toBe('carrier-b')
  expect(execution.carrier_billing_account_id).toBe('account-b1')
})
