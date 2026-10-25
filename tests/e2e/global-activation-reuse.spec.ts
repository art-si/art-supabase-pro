import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
const control = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true, includeHidden: true }).dispatchEvent('click')
async function prepare(page: Page, component: string) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`/tests/e2e/fixtures/global-lock-reuse.html?component=${component}`)
  return errors
}

for (const component of ['global-search', 'settings-panel', 'chat-window', 'fireworks-effect']) {
  test(`连续激活只重放一次 ${component}`, async ({ page }) => {
    const errors = await prepare(page, component)
    for (let count = 0; count < 3; count++) await control(page, '激活组件')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    await expect(page.getByLabel('事件次数')).toHaveText('3')
    await control(page, '完成加载')
    await expect(page.getByLabel('挂载次数')).toHaveText('1')
    await expect(page.getByLabel('事件次数')).toHaveText('4')
    await control(page, '激活组件')
    await expect(page.getByLabel('事件次数')).toHaveText('5')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    expect(errors).toEqual([])
  })

  test(`解锁后的新操作接管旧加载 ${component}`, async ({ page }) => {
    const errors = await prepare(page, component)
    await control(page, '激活组件')
    await control(page, '锁屏再解锁')
    for (let count = 0; count < 3; count++) await control(page, '激活组件')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    await control(page, '完成加载')
    await expect(page.getByLabel('挂载次数')).toHaveText('1')
    await expect(page.getByLabel('事件次数')).toHaveText('5')
    expect(errors).toEqual([])
  })

  test(`解锁同一轮激活缓存组件 ${component}`, async ({ page }) => {
    const errors = await prepare(page, component)
    await control(page, '激活组件')
    await control(page, '完成加载')
    await expect(page.getByLabel('事件次数')).toHaveText('2')
    await control(page, '切换锁屏')
    await expect(page.getByLabel('卸载次数')).toHaveText('1')
    await control(page, '解锁并激活')
    await expect(page.getByLabel('挂载次数')).toHaveText('2')
    await expect(page.getByLabel('事件次数')).toHaveText('4')
    await expect(page.getByLabel('加载次数')).toHaveText('1')
    if (component !== 'fireworks-effect')
      await expect(page.locator('.el-overlay:visible')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}

test('连续失败只提示一次并可重新加载', async ({ page }) => {
  const errors = await prepare(page, 'global-search')
  for (let count = 0; count < 3; count++) await control(page, '激活组件')
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  await control(page, '加载失败')
  await expect(page.getByText('全局搜索加载失败，请稍后重试', { exact: true })).toHaveCount(1)
  await control(page, '激活组件')
  await expect(page.getByLabel('加载次数')).toHaveText('2')
  await control(page, '完成加载')
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  await expect(page.getByLabel('事件次数')).toHaveText('5')
  expect(errors).toEqual([])
})

test('礼花懒加载只重放最后选择的图案', async ({ page }) => {
  const errors = await prepare(page, 'fireworks-effect')
  for (let index = 1; index <= 3; index++) await control(page, `激活图案${index}`)
  const lastPayload = await page
    .getByRole('button', { name: '激活图案3', exact: true })
    .getAttribute('data-payload')
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  await control(page, '完成加载')
  await expect(page.getByLabel('挂载次数')).toHaveText('1')
  await expect(page.getByLabel('事件次数')).toHaveText('4')
  await expect(page.getByLabel('最后激活图案')).toHaveText(lastPayload ?? '')
  expect(errors).toEqual([])
})

test('连续搜索快捷键复用加载，解锁同一轮搜索等待实际挂载', async ({ page }) => {
  const errors = await prepare(page, 'global-search')
  const key = (ctrlKey: boolean, metaKey: boolean, value = 'k') =>
    page.evaluate(
      ({ ctrlKey, metaKey, value }) =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: value,
            ctrlKey,
            metaKey,
            bubbles: true,
            cancelable: true
          })
        ),
      { ctrlKey, metaKey, value }
    )
  expect(await key(false, false, 'a')).toBe(true)
  await expect(page.getByLabel('加载次数')).toHaveText('0')
  for (let count = 0; count < 3; count++) expect(await key(count !== 1, count === 1)).toBe(false)
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  await control(page, '完成加载')
  await expect(page.getByLabel('事件次数')).toHaveText('1')
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  await control(page, '切换锁屏')
  await expect(page.getByLabel('卸载次数')).toHaveText('1')
  await control(page, '解锁并搜索')
  await expect(page.getByLabel('挂载次数')).toHaveText('2')
  await expect(page.getByLabel('事件次数')).toHaveText('2')
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  expect(errors).toEqual([])
})
