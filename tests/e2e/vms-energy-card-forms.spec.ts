import { expect, test } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

for (const kind of ['fuel', 'electric', 'fuel-ledger', 'electric-ledger'] as const) {
  test(`${kind} 新增表单完整显示且必填校验保留`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.stack || error.message))
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /VueError|RangeError|TypeError|ReferenceError/.test(message.text())
      ) {
        errors.push(message.text())
      }
    })
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1) || ''
      if (endpoint === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (endpoint.includes('list_') && endpoint.includes('secure'))
        return route.fulfill({ json: { records: [], total: 0 } })
      return route.fulfill({ json: [] })
    })
    await installDictionaryOptions(page, {
      fuelCardFuelType: [{ value: 'diesel_0', label: '0号柴油' }],
      vmsCardViewMode: [
        { value: 'list', label: '按明细' },
        { value: 'cards', label: '按卡片' }
      ]
    })
    await page.goto(
      `/tests/e2e/fixtures/vms-operations-optimization.html?kind=${kind}&withActions=1`
    )
    const ledger = kind.endsWith('ledger')
    await page
      .getByRole('button', {
        name: ledger ? '登记充值' : kind === 'fuel' ? '新增油卡' : '新增电卡',
        exact: true
      })
      .click()
    const dialog = page.getByRole('dialog').last()
    await expect(dialog).toBeVisible()
    await expect.poll(() => errors, { timeout: 1000 }).toEqual([])
    await expect(dialog.locator('[data-art-form-item-key]').first()).toBeVisible()
    await expect(dialog.getByText(ledger ? '充值金额' : '绑定车辆', { exact: true })).toBeVisible()
    await dialog
      .getByRole('button', {
        name: ledger ? '确认充值' : kind === 'fuel' ? '创建油卡' : '创建电卡',
        exact: true
      })
      .click()
    await expect(
      dialog.getByText(
        ledger ? '请选择' + (kind === 'fuel-ledger' ? '油卡' : '电卡') : '请选择已审批车辆',
        { exact: true }
      )
    ).toBeVisible()
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${kind}-create.png`), fullPage: true })
  })
}
