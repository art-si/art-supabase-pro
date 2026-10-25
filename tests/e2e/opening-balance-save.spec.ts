import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of ['success', 'failure', 'auxiliary-only', 'readonly', 'revoked'] as const) {
  test(`期初余额保存 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const payloads: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/save_fms_opening_balance_secure**', async (route) => {
      payloads.push(route.request().postDataJSON().p_payload)
      if (mode === 'failure')
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({ json: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' } })
    })
    await page.goto(`/tests/e2e/fixtures/opening-balance-numbers.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开期初余额', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const save = dialog.getByRole('button', { name: '保存修改', exact: true })
    if (mode === 'readonly') {
      await expect(save).toBeDisabled()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      expect(payloads).toHaveLength(0)
      return
    }
    if (mode !== 'auxiliary-only') {
      await dialog.getByRole('spinbutton').first().fill('20.50')
      await dialog.getByRole('spinbutton').first().blur()
    }
    if (mode === 'revoked') {
      await page
        .getByTestId('revoke-save-permission')
        .evaluate((button: HTMLButtonElement) => button.click())
      await save.click()
      await expect(
        page.getByText('期初余额操作权限已变化，请刷新页面后重试', { exact: true })
      ).toBeVisible()
      await expect(dialog).toBeVisible()
      expect(payloads).toHaveLength(0)
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      return
    }
    await save.click()
    await expect.poll(() => payloads.length).toBe(1)
    expect(payloads[0]).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      accountSetId: 'test-account-set',
      fiscalYear: 2026,
      subjectId: 'test-subject'
    })
    if (mode === 'auxiliary-only') {
      expect(payloads[0]).toMatchObject({ currencyId: null, auxiliaryValues: {} })
      for (const key of [
        'openingDebit',
        'openingCredit',
        'yearToDateDebit',
        'yearToDateCredit',
        'openingQuantity',
        'originalCurrencyAmount'
      ])
        expect(payloads[0]).not.toHaveProperty(key)
    } else {
      expect(payloads[0]).toMatchObject({
        openingDebit: 20.5,
        openingCredit: 0,
        yearToDateDebit: 12.5,
        yearToDateCredit: 12.5
      })
      expect(payloads[0]).not.toHaveProperty('auxiliaryValues')
      expect(payloads[0]).not.toHaveProperty('currencyId')
    }
    if (mode === 'failure') {
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('spinbutton').first()).toHaveValue('20.50')
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
      await page.screenshot({
        path: testInfo.outputPath('save-failure.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    }
    await expect(dialog).toBeHidden()
    expect(payloads).toHaveLength(1)
  })
}

for (const mode of ['create', 'denied'] as const) {
  test(`普通用户期初余额打开 ${mode}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.goto(`/tests/e2e/fixtures/opening-balance-numbers.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开期初余额', exact: true }).click()
    if (mode === 'denied') {
      await expect(
        page.getByText('没有期初余额操作权限，请联系管理员', { exact: true })
      ).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    } else {
      const dialog = page.getByRole('dialog', { name: '录入期初余额', exact: true })
      await expect(dialog.getByRole('button', { name: '保存余额', exact: true })).toBeEnabled()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
  })
}
