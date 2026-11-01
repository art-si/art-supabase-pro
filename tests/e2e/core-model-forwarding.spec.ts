import { expect, test } from '@playwright/test'

test.use({
  storageState: { cookies: [], origins: [] },
  actionTimeout: 15_000,
  navigationTimeout: 30_000
})
test.setTimeout(180_000)

for (const [width, theme, boxMode] of [
  [1440, 'light', 'border-mode'],
  [900, 'dark', 'shadow-mode']
] as const) {
  test(`公共模型转发保留值类型和生命周期 ${width} ${theme}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tests/e2e/fixtures/core-model-forwarding.html')
    await expect(page.getByRole('heading', { name: '公共控件双向绑定' })).toBeVisible()
    await page.evaluate(
      ({ theme, boxMode }) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.dataset.boxMode = boxMode
      },
      { theme, boxMode }
    )

    const state = page.getByTestId('model-state')
    await page.getByText('未启用', { exact: true }).click()
    await expect(state).toContainText('"status":false')
    await page.getByText('数量为零', { exact: true }).click()
    await expect(state).toContainText('"status":0')

    const single = page.locator('.art-user-select').nth(0)
    await single.click()
    await page.getByRole('option', { name: /测试乙/ }).click()
    await expect(state).toContainText('"single":"user-b"')
    await expect(state).toContainText('"changes":["user-b"]')
    await single.hover()
    await single.locator('.el-select__clear').click()
    await expect(state).not.toContainText('"single":')
    await page.keyboard.press('Escape')

    await page.locator('.art-user-select').nth(1).click()
    await page.getByRole('option', { name: /测试甲/ }).click()
    await page.getByRole('option', { name: /测试乙/ }).click()
    await expect(state).toContainText('"multiple":["user-a","user-b"]')
    await page.keyboard.press('Escape')
    const iconInput = page.locator('.art-icon-picker input').first()
    await iconInput.fill('ri:user-line')
    await iconInput.press('Tab')
    await expect(state).toContainText('"icon":"ri:user-line"')
    await iconInput.hover()
    await page.locator('.art-icon-picker .el-input__clear').click()
    await expect(state).toContainText('"icon":""')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('models.png'), animations: 'disabled' })

    await page.getByRole('button', { name: '打开设置' }).click()
    await expect(page.getByRole('heading', { name: '设置内容' })).toBeVisible()
    await expect(state).toContainText('"visible":true,"opens":1,"closes":0')
    await page.screenshot({ path: testInfo.outputPath('drawer.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '设置内容' })).toBeHidden()
    await expect(state).toContainText('"visible":false,"opens":1,"closes":1')
    await page.getByRole('button', { name: '打开设置' }).click()
    await page.getByRole('button', { name: '关闭设置' }).click()
    await expect(state).toContainText('"visible":false,"opens":2,"closes":2')
    expect(errors).toEqual([])
  })
}
