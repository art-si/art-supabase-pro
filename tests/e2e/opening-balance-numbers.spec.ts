import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of ['missing', 'zero', 'decimal', 'readonly'] as const) {
  test(`期初余额数值 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.goto(`/tests/e2e/fixtures/opening-balance-numbers.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开期初余额', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const fields = dialog.getByRole('spinbutton')
    await expect(fields).toHaveCount(3)
    for (const field of await fields.all()) {
      await expect(field).toHaveValue(mode === 'missing' || mode === 'zero' ? '0.00' : '12.50')
      if (mode === 'readonly') await expect(field).toBeDisabled()
      else await expect(field).toBeEnabled()
    }
    await page.screenshot({
      path: testInfo.outputPath('opening-numbers.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
