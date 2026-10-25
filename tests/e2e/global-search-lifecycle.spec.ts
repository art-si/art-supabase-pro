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
