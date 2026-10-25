import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T04:00:00Z') })
  await page.goto('/tests/e2e/fixtures/ceremony-lifecycle.html')
  await expect(page.getByRole('button', { name: '打开主题延迟' })).toBeVisible()
})

for (const action of ['关闭主题延迟', '卸载控制器']) {
  test(`${action}阻止延迟主题状态写入`, async ({ page }) => {
    await page.getByRole('button', { name: '打开主题延迟' }).click()
    await page.getByRole('button', { name: action }).click()
    await page.clock.runFor(600)
    await expect(page.locator('body')).not.toHaveClass(/theme-change/)
  })
}

test('卸载后清理已生效的主题状态', async ({ page }) => {
  await page.getByRole('button', { name: '打开主题延迟' }).click()
  await page.clock.runFor(500)
  await expect(page.locator('body')).toHaveClass(/theme-change/)
  await page.getByRole('button', { name: '卸载控制器' }).click()
  await expect(page.locator('body')).not.toHaveClass(/theme-change/)
})

test('重复打开重新计算延迟', async ({ page }) => {
  await page.getByRole('button', { name: '打开主题延迟' }).click()
  await page.clock.runFor(300)
  await page.getByRole('button', { name: '打开主题延迟' }).click()
  await page.clock.runFor(300)
  await expect(page.locator('body')).not.toHaveClass(/theme-change/)
  await page.clock.runFor(200)
  await expect(page.locator('body')).toHaveClass(/theme-change/)
})

test('连续选择盒子模式保持最后目标且没有延迟反转', async ({ page }) => {
  const state = page.getByTestId('state')
  const shadow = page.getByRole('button', { name: '选择阴影', exact: true })
  const border = page.getByRole('button', { name: '选择边框', exact: true })
  await shadow.click()
  await shadow.click()
  await expect.poll(async () => JSON.parse(await state.innerText()).borderMode).toBe(false)
  await border.click()
  await shadow.click()
  await page.clock.runFor(100)
  await expect.poll(async () => JSON.parse(await state.innerText()).borderMode).toBe(false)
  await border.click()
  await expect.poll(async () => JSON.parse(await state.innerText()).borderMode).toBe(true)
})

test('色弱初始化立即同步且关闭后不会延迟恢复', async ({ page }) => {
  await page.getByRole('button', { name: '初始化色弱', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/color-weak/)
  await page.getByRole('button', { name: '关闭色弱', exact: true }).click()
  await page.getByRole('button', { name: '卸载控制器', exact: true }).click()
  await page.clock.runFor(200)
  await expect(page.locator('html')).not.toHaveClass(/color-weak/)
})
