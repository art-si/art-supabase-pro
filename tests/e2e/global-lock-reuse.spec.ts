import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
const shortcut = (page: Page) =>
  page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true })
    )
  )
async function prepare(page: Page) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('锁屏时搜索快捷键保持默认行为且不会开始懒加载', async ({ page }) => {
  await prepare(page)
  await page.goto('/tests/e2e/fixtures/global-lock-reuse.html?locked')
  await expect(page.locator('#unlock-screen-password')).toBeFocused({ timeout: 60_000 })
  expect(await shortcut(page)).toBe(true)
  await expect(page.getByLabel('加载次数')).toHaveText('0')
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
})

test('已挂载搜索在锁屏时不会打开或抢走解锁输入焦点', async ({ page }) => {
  await prepare(page)
  await page.goto('/tests/e2e/fixtures/global-lock-reuse.html?locked&standalone')
  await expect(page.locator('#unlock-screen-password')).toBeFocused({ timeout: 60_000 })
  expect(await shortcut(page)).toBe(true)
  await expect(page.locator('.art-global-search-dialog')).toBeHidden()
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
  await page
    .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
    .evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await expect(page.locator('.art-global-search-dialog')).toBeHidden()
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
})

for (const component of ['global-search', 'settings-panel', 'chat-window', 'fireworks-effect']) {
  test(`全局组件统一阻止锁屏激活，解锁复用缓存且清理旧界面 ${component}`, async ({ page }) => {
    const errors = await prepare(page)
    await page.goto(`/tests/e2e/fixtures/global-lock-reuse.html?locked&component=${component}`)
    await expect(page.locator('#unlock-screen-password')).toBeFocused()
    await page
      .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('加载次数')).toHaveText('0')
    await expect(page.getByLabel('挂载次数')).toHaveText('0')
    await page
      .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await page
      .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    await page
      .getByRole('button', { name: '完成加载', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('完成次数')).toHaveText('1')
    await expect(page.getByLabel('挂载次数')).toHaveText('1')
    await expect(page.getByLabel('事件次数')).toHaveText('3')
    if (component !== 'fireworks-effect')
      await expect(page.locator('.el-overlay:visible')).toHaveCount(1)
    await page
      .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('卸载次数')).toHaveText('1')
    await expect(page.locator('.el-overlay:visible')).toHaveCount(0)
    await expect(page.locator('#unlock-screen-password')).toBeFocused()
    await page
      .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('挂载次数')).toHaveText('2')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    await expect(page.locator('.el-overlay:visible')).toHaveCount(0)
    await page
      .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('事件次数')).toHaveText('4')
    if (component !== 'fireworks-effect')
      await expect(page.locator('.el-overlay:visible')).toHaveCount(1)
    await page
      .getByRole('button', { name: '锁屏再解锁', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('卸载次数')).toHaveText('2')
    await expect(page.getByLabel('挂载次数')).toHaveText('3')
    await expect(page.locator('.el-overlay:visible')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test(`锁屏再解锁不会重放旧加载意图 ${component}`, async ({ page }) => {
    const errors = await prepare(page)
    await page.goto(`/tests/e2e/fixtures/global-lock-reuse.html?component=${component}`)
    await page
      .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    await page
      .getByRole('button', { name: '锁屏再解锁', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await page
      .getByRole('button', { name: '完成加载', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('完成次数')).toHaveText('1')
    await expect(page.getByLabel('挂载次数')).toHaveText('1')
    await expect(page.getByLabel('事件次数')).toHaveText('1')
    await expect(page.locator('.el-overlay:visible')).toHaveCount(0)
    await page
      .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
      .dispatchEvent('click')
    await expect(page.getByLabel('事件次数')).toHaveText('2')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    if (component !== 'fireworks-effect')
      await expect(page.locator('.el-overlay:visible')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}

test('加载在锁屏期间完成只保留缓存，不挂载或自动打开', async ({ page }) => {
  const errors = await prepare(page)
  await page.goto('/tests/e2e/fixtures/global-lock-reuse.html')
  await page
    .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  await page
    .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
  // Background completion must not move focus to the fixture control.
  await page
    .getByRole('button', { name: '完成加载', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('完成次数')).toHaveText('1')
  await expect(page.getByLabel('挂载次数')).toHaveText('0')
  await expect(page.getByLabel('事件次数')).toHaveText('1')
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
  await page.screenshot({ path: test.info().outputPath('locked-after-load.png') })
  await page
    .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('挂载次数')).toHaveText('1')
  await expect(page.locator('.el-overlay:visible')).toHaveCount(0)
  await expect(page.getByLabel('事件次数')).toHaveText('1')
  await page
    .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  expect(errors).toEqual([])
})

test('旧加载失败不弹出提示，当前意图失败可重新尝试', async ({ page }) => {
  const errors = await prepare(page)
  await page.goto('/tests/e2e/fixtures/global-lock-reuse.html')
  await page
    .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  await page
    .getByRole('button', { name: '锁屏再解锁', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await page
    .getByRole('button', { name: '加载失败', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await page
    .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('加载次数')).toHaveText('2')
  await expect(page.getByText('全局搜索加载失败，请稍后重试', { exact: true })).toHaveCount(0)
  await page
    .getByRole('button', { name: '加载失败', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByText('全局搜索加载失败，请稍后重试', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: '激活组件', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.getByLabel('加载次数')).toHaveText('3')
  await page
    .getByRole('button', { name: '完成加载', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  expect(errors).toEqual([])
})

test('搜索禁用时快捷键不拦截浏览器', async ({ page }) => {
  await prepare(page)
  await page.goto('/tests/e2e/fixtures/global-lock-reuse.html?disabled')
  await expect(page.getByLabel('锁屏状态')).toHaveText('false')
  expect(await shortcut(page)).toBe(true)
  await expect(page.getByLabel('加载次数')).toHaveText('0')
})

test('独立搜索关闭旧界面，解锁后 Ctrl 和 Meta 快捷键一致', async ({ page }) => {
  const errors = await prepare(page)
  await page.goto(
    '/tests/e2e/fixtures/global-lock-reuse.html?standalone&theme=dark&box=shadow-mode'
  )
  await expect.poll(() => shortcut(page)).toBe(false)
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('search-unlocked.png') })
  await page
    .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('.art-global-search-dialog')).toBeHidden()
  await expect(page.locator('#unlock-screen-password')).toBeFocused()
  expect(await shortcut(page)).toBe(true)
  await page
    .getByRole('button', { name: '切换锁屏', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('.art-global-search-dialog')).toBeHidden()
  expect(
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
      )
    )
  ).toBe(false)
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  await page
    .getByRole('button', { name: '锁屏再解锁', exact: true, includeHidden: true })
    .dispatchEvent('click')
  await expect(page.locator('.art-global-search-dialog')).toBeHidden()
  expect(errors).toEqual([])
})
