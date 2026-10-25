import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)

test('锁屏保持密码校验并允许全选、右键和正常浏览器操作', async ({ page }) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/screen-lock-reuse.html?locked')
  const input = page.locator('#unlock-screen-password')
  await expect(input).toBeFocused()
  await page.getByRole('button', { name: '解锁工作台', exact: true }).click()
  await expect(page.getByText('请输入锁屏密码', { exact: true })).toBeVisible()
  await expect(page.getByLabel('锁屏状态')).toHaveText('true')
  await input.fill('wrong-password')
  await page.keyboard.press('ControlOrMeta+A')
  await expect(input).toHaveJSProperty('selectionStart', 0)
  await expect(input).toHaveJSProperty('selectionEnd', 'wrong-password'.length)
  const browserActionsAllowed = await input.evaluate((element) =>
    ['contextmenu', 'selectstart', 'dragstart'].every((type) =>
      element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
    )
  )
  expect(browserActionsAllowed).toBe(true)
  await page.getByRole('button', { name: '解锁工作台', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '密码不正确，请重新输入' })).toBeVisible()
  await expect(page.getByText('请输入锁屏密码', { exact: true })).toBeHidden()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(input).toHaveValue('wrong-password')
  await expect(page.getByLabel('锁屏状态')).toHaveText('true')
  await expect(input).toBeFocused()
  await input.fill('screen-test-password')
  await page.getByRole('button', { name: '解锁工作台', exact: true }).click()
  await expect(page.getByLabel('锁屏状态')).toHaveText('false')
  await expect(page.getByLabel('已清理锁屏密码')).toHaveText('true')
  await expect(page.locator('.unlock-scrollbar')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  expect(errors).toEqual([])
})

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`锁屏首屏可解锁且窗口尺寸不会误遮挡 ${theme} ${box}`, async ({ page }) => {
      await prepareIsolatedSession(page)
      await page.clock.install()
      await page.addInitScript(() => {
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth + 300 })
      })
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`/tests/e2e/fixtures/screen-lock-reuse.html?locked&theme=${theme}&box=${box}`)
      await page.clock.runFor(700)
      await expect(
        page.getByRole('heading', { name: '工作台已锁定', exact: true })
      ).toBeInViewport()
      await expect(page.getByRole('button', { name: '解锁工作台', exact: true })).toBeInViewport()
      await expect(page.locator('#unlock-screen-password')).toBeFocused()
      await expect(page.locator('.lock-warning')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.screenshot({
        path: test.info().outputPath('screen-lock.png'),
        style: '.screen-lock-fixture-controls { visibility: hidden; }'
      })
      expect(errors).toEqual([])
    })
  }
}

test('设置锁屏密码后恢复焦点，卸载清理快捷键和滚动锁', async ({ page }) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const shortcut = () =>
    page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '¬', altKey: true, cancelable: true })
      )
    )
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/screen-lock-reuse.html')
  await page.getByRole('button', { name: '打开锁屏设置', exact: true }).click()
  const input = page.locator('#lock-screen-password')
  await expect(input).toBeFocused()
  await input.fill('screen-test-password')
  await page.getByRole('button', { name: '锁定工作台', exact: true }).click()
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
  await expect(page.getByLabel('锁屏状态')).toHaveText('true')
  await page
    .getByRole('button', { name: '切换组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('.layout-lock-screen')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  expect(await shortcut()).toBe(true)
  await page
    .getByRole('button', { name: '切换组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
  await expect(page.getByLabel('锁屏状态')).toHaveText('true')
  await page
    .getByRole('button', { name: '切换组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await page
    .getByRole('button', { name: '清理验收锁屏', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('锁屏状态')).toHaveText('false')
  expect(await shortcut()).toBe(true)
  await page
    .getByRole('button', { name: '切换组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect.poll(shortcut).toBe(false)
  await expect(input).toBeFocused()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(input).toBeHidden()
  expect(errors).toEqual([])
})
