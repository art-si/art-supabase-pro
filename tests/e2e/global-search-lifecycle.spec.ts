import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.setTimeout(90_000)

const fixtureControl = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true, includeHidden: true }).dispatchEvent('click')

async function openTarget(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
        )
      )
    )
    .toBe(false)
  const dialog = page.locator('.art-global-search-dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('input').fill('预加载')
  await dialog.getByRole('button', { name: '预加载验收页面', exact: true }).click()
  return dialog
}

test('输入法确认不打开搜索结果，普通回车仍能导航', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true })
  const input = dialog.getByRole('textbox')
  await input.fill('预加载')
  await expect(dialog.getByRole('button', { name: '预加载验收页面' })).toBeVisible()
  const compositionWasAccepted = await input.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true
      })
    )
  )
  expect(compositionWasAccepted).toBe(true)
  await expect(page.getByLabel('预加载次数')).toHaveText('0')
  await input.press('Enter')
  await expect(page.getByLabel('预加载次数')).toHaveText('1')
  await fixtureControl(page, '完成预加载')
  await expect(page.getByLabel('当前路径')).toHaveText('/search-preload-test')
  await expect(dialog).toBeHidden()
})

test('搜索历史的移除按钮按回车不误打开页面', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1&history=1')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true })
  const input = dialog.getByRole('textbox')
  await expect(input).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '预加载验收页面', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('.search-item__remove')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('历史次数')).toHaveText('0')
  await expect(page.getByLabel('预加载次数')).toHaveText('0')
  await expect(input).toBeFocused()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: info.outputPath('search-after-removal-390.png') })
})

test('窄屏搜索的方向键高亮与滚动位置一致，缩小搜索范围后回到首项', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1&many=1')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true })
  const input = dialog.getByRole('textbox')
  const first = dialog.getByRole('button', { name: /^验收页面 01/ })
  const last = dialog.getByRole('button', { name: /^验收页面 12/ })
  await input.fill('验收')
  await expect(first).toBeInViewport({ ratio: 0.98 })
  await input.press('ArrowUp')
  await expect(last).toHaveClass(/is-highlighted/)
  await expect(last).toBeInViewport({ ratio: 0.98 })
  await input.press('ArrowDown')
  await expect(first).toHaveClass(/is-highlighted/)
  await expect(first).toBeInViewport({ ratio: 0.98 })
  await input.press('ArrowUp')
  await expect(last).toBeInViewport({ ratio: 0.98 })
  await input.fill('验收页面')
  await expect(first).toHaveClass(/is-highlighted/)
  await expect(first).toBeInViewport({ ratio: 0.98 })
  await expect(input).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.screenshot({ path: info.outputPath('search-first-result-320.png') })
})

test.describe('搜索关闭', () => {
  test.use({ hasTouch: true })

  test('输入法 Esc 不关弹窗，触屏可点关闭', async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1')
    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true })
    const input = dialog.getByRole('textbox')
    await expect(input).toBeFocused()
    const compositionWasAccepted = await input.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
          isComposing: true
        })
      )
    )
    expect(compositionWasAccepted).toBe(true)
    await expect(input).toBeFocused()

    const close = dialog.getByRole('button', { name: '关闭', exact: true })
    await expect(close).toBeInViewport()
    await dialog.locator('.art-global-search-dialog').screenshot({
      path: info.outputPath('search-touch-close-320.png')
    })
    await close.tap()
    await expect(dialog).toBeHidden()
  })
})

for (const cancellation of ['lock', 'unmount']) {
  for (const outcome of ['complete', 'reject']) {
    test(`搜索真实预加载 ${cancellation} 后 ${outcome} 不跳转或写历史，新操作可恢复`, async ({
      page
    }, info) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1')
      const dialog = await openTarget(page)
      await expect(page.getByLabel('预加载次数')).toHaveText('1')
      await expect(dialog.locator('input')).toHaveAttribute('readonly', '')
      await expect(dialog.locator('.search-item')).toBeDisabled()
      await page.screenshot({ path: info.outputPath('preload-pending.png') })
      const cancelButton = cancellation === 'lock' ? '切换锁定状态' : '切换搜索组件'
      await fixtureControl(page, cancelButton)
      await expect(dialog).toBeHidden()
      await fixtureControl(page, outcome === 'complete' ? '完成预加载' : '拒绝预加载')
      await expect(page.getByLabel('当前路径')).toHaveText('/')
      await expect(page.getByLabel('历史次数')).toHaveText('0')
      await expect(page.locator('.el-message')).toHaveCount(0)
      await fixtureControl(page, cancelButton)
      await openTarget(page)
      if (outcome === 'reject') {
        await expect(page.getByLabel('预加载次数')).toHaveText('2')
        await fixtureControl(page, '完成预加载')
      }
      await expect(page.getByLabel('当前路径')).toHaveText('/search-preload-test')
      await expect(page.getByLabel('历史次数')).toHaveText('1')
      await expect(dialog).toBeHidden()
      await expect(page.getByLabel('预加载次数')).toHaveText(outcome === 'reject' ? '2' : '1')
      expect(errors).toEqual([])
    })
  }
}

test('关闭搜索后，尚未结束的页面预加载不会继续导航', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1')
  const dialog = await openTarget(page)
  await expect(page.getByLabel('预加载次数')).toHaveText('1')
  await dialog.locator('input').press('Escape')
  await expect(dialog).toBeHidden()
  await fixtureControl(page, '完成预加载')
  await expect
    .poll(async () => {
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      )
      return page.getByLabel('当前路径').textContent()
    })
    .toBe('/')
  await expect(page.getByLabel('历史次数')).toHaveText('0')
  await openTarget(page)
  await expect(page.getByLabel('当前路径')).toHaveText('/search-preload-test')
  await expect(page.getByLabel('历史次数')).toHaveText('1')
})

test('搜索真实预加载失败保留输入并支持重试', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html?navigation=1')
  const dialog = await openTarget(page)
  await fixtureControl(page, '拒绝预加载')
  await expect(page.getByText('页面打开失败，请重试或从左侧菜单进入', { exact: true })).toHaveCount(
    1
  )
  await expect(dialog.locator('input')).toHaveValue('预加载')
  await expect(dialog.locator('input')).not.toHaveAttribute('readonly', '')
  await expect(page.getByLabel('历史次数')).toHaveText('0')
  await page.screenshot({ path: info.outputPath('preload-error.png') })
  await dialog.getByRole('button', { name: '预加载验收页面', exact: true }).click()
  await expect(page.getByLabel('预加载次数')).toHaveText('2')
  await fixtureControl(page, '完成预加载')
  await expect(page.getByLabel('当前路径')).toHaveText('/search-preload-test')
  await expect(page.getByLabel('历史次数')).toHaveText('1')
  await expect(dialog).toBeHidden()
})
test('搜索快捷键随组件卸载停止，重新挂载恢复', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/global-search-lifecycle.html')
  const shortcut = () =>
    page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
      )
    )
  await expect.poll(shortcut).toBe(false)
  const dialog = page.locator('.art-global-search-dialog')
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: info.outputPath('search-dialog.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '切换搜索组件', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await shortcut()).toBe(true)
  await page.getByRole('button', { name: '切换搜索组件', exact: true }).click()
  await expect.poll(shortcut).toBe(false)
  await expect(dialog).toBeVisible()
  expect(errors).toEqual([])
})
