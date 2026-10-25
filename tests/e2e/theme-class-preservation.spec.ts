import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('减少动态效果和键盘切换不调用 View Transition，鼠标正常模式仍调用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tests/e2e/fixtures/ceremony-lifecycle.html')
  await page.evaluate(() => {
    document.body.dataset.transitionCalls = '0'
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        document.body.dataset.transitionCalls = String(
          Number(document.body.dataset.transitionCalls) + 1
        )
        update()
      }
    })
  })
  const trigger = page.getByRole('button', { name: '切换主题效果', exact: true })
  await trigger.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('body')).toHaveAttribute('data-transition-calls', '0')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator('body')).toHaveAttribute('data-transition-calls', '0')
  await trigger.click()
  await expect(page.locator('body')).toHaveAttribute('data-transition-calls', '1')
})

test('主题切换和初始化保留色弱与其他布局状态', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T04:00:00Z') })
  await page.goto('/tests/e2e/fixtures/ceremony-lifecycle.html')
  await page.getByRole('button', { name: '初始化色弱' }).click()
  await page.evaluate(() => document.documentElement.classList.add('layout-state-test'))
  for (const name of ['切换暗色', '切换亮色', '切换暗色', '初始化主题']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/color-weak/)
    await expect(page.locator('html')).toHaveClass(/layout-state-test/)
    if (name === '切换亮色') await expect(page.locator('html')).not.toHaveClass(/dark/)
    else await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await page.locator('#disable-transitions').count()).toBeLessThanOrEqual(1)
  }
  await page.clock.runFor(100)
  await expect(page.locator('#disable-transitions')).toHaveCount(0)
})

test('手动模式启动后选择自动模式仍跟随系统，回到手动后保持选择', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/tests/e2e/fixtures/ceremony-lifecycle.html')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: '跟随系统主题' }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: '切换暗色', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass(/dark/)
})
