import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function openScroll(page: Page, query: string) {
  await prepareIsolatedSession(page)
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto(`/tests/e2e/fixtures/art-form-tabs.html?${query}`, {
    waitUntil: 'domcontentloaded'
  })
  const content = page.getByTestId('native-content')
  const owner = query.includes('overlay=')
    ? page.getByRole('dialog')
    : page.getByTestId('native-scroll')
  const scroll = owner.locator('.el-scrollbar__wrap').first()
  await expect(content.getByRole('textbox', { name: /业务名称$/ })).toBeVisible({ timeout: 60_000 })
  await expect(content.getByRole('button', { name: '校验滚动表单', exact: true })).toBeEnabled()
  const target = content.getByRole('textbox', { name: /待校验联系人$/ })
  return { content, owner, scroll, target, failures }
}

async function geometry(scroll: Locator, target: Locator) {
  const [viewport, field] = await Promise.all([
    scroll.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        top: bounds.top + element.clientTop + (parseFloat(style.scrollPaddingTop) || 0),
        bottom:
          bounds.top +
          element.clientTop +
          element.clientHeight -
          (parseFloat(style.scrollPaddingBottom) || 0),
        scrollTop: element.scrollTop,
        extent: element.scrollHeight - element.clientHeight
      }
    }),
    target.evaluate((element) => {
      const field = element.closest('.el-form-item')!.getBoundingClientRect()
      return { top: field.top, bottom: field.bottom }
    })
  ])
  return { viewport, field, endOffset: Math.abs(viewport.bottom - field.bottom) }
}

test('普通表单显式自动定位生效，删除配置恢复不自动滚动', async ({ page }, info) => {
  const view = await openScroll(page, 'native-scroll=plain&flag=on')
  await expect(view.target).not.toBeInViewport()
  await view.content.getByRole('button', { name: '校验滚动表单', exact: true }).click()
  await expect(view.content.getByLabel('滚动校验次数')).toHaveText('1')
  await expect(view.target).toBeInViewport({ ratio: 1 })
  expect((await geometry(view.scroll, view.target)).viewport.scrollTop).toBeGreaterThan(100)
  await page.screenshot({ path: info.outputPath('plain-auto-scroll.png') })
  await view.content.getByRole('button', { name: '默认自动定位', exact: true }).click()
  await view.content.getByRole('button', { name: '重置滚动表单', exact: true }).click()
  await view.scroll.evaluate((element) => {
    element.scrollTop = 0
  })
  await view.content.getByRole('button', { name: '校验滚动表单', exact: true }).click()
  await expect(view.content.getByLabel('滚动校验次数')).toHaveText('2')
  expect((await geometry(view.scroll, view.target)).viewport.scrollTop).toBeLessThanOrEqual(1)
  await expect(view.target).not.toBeInViewport()
  expect(view.failures).toEqual([])
})

test('页签自动定位可关闭，错误页签仍揭示且手动聚焦保留定位能力', async ({ page }, info) => {
  const view = await openScroll(page, 'native-scroll=tabs&flag=off')
  await view.content.getByRole('button', { name: '校验滚动表单', exact: true }).click()
  await expect(view.content.getByLabel('滚动校验次数')).toHaveText('1')
  await expect(view.content.getByRole('tab', { name: '联系资料', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(view.target).toBeFocused()
  expect((await geometry(view.scroll, view.target)).viewport.scrollTop).toBeLessThanOrEqual(1)
  await expect(view.target).not.toBeInViewport()
  await view.content.getByRole('button', { name: '手动聚焦联系人', exact: true }).click()
  await expect(view.target).toBeInViewport({ ratio: 1 })
  await expect(view.target).toBeFocused()
  await view.owner.screenshot({ path: info.outputPath('tabs-manual-focus.png') })
  expect(view.failures).toEqual([])
})

test('布尔滚动选项false按底部对齐，仍能从隐藏页签手动定位', async ({ page }, info) => {
  const view = await openScroll(page, 'native-scroll=tabs&options=boolean')
  await view.content.getByRole('button', { name: '手动定位联系人', exact: true }).click()
  await expect(view.content.getByRole('tab', { name: '联系资料', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect
    .poll(async () => (await geometry(view.scroll, view.target)).endOffset)
    .toBeLessThanOrEqual(3)
  await expect(view.target).toBeInViewport({ ratio: 1 })
  await info.attach('boolean-end-geometry', {
    body: JSON.stringify(await geometry(view.scroll, view.target)),
    contentType: 'application/json'
  })
  expect(view.failures).toEqual([])
})

test('已打开表单的手动定位实时响应减少动态效果设置', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const view = await openScroll(page, 'native-scroll=tabs&options=end')
  await page.evaluate(() => {
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (options) {
      if (this.closest('[data-art-form-item-key="errorName"]'))
        this.dataset.scrollBehavior =
          typeof options === 'object' ? (options.behavior ?? 'auto') : 'auto'
      original.call(this, options)
    }
  })
  const focusTarget = view.target.locator(
    'xpath=ancestor::div[contains(@class,"el-form-item__content")][1]'
  )
  await view.content.getByRole('button', { name: '手动聚焦联系人', exact: true }).click()
  await expect(focusTarget).toHaveAttribute('data-scroll-behavior', 'smooth')
  await expect
    .poll(async () => (await geometry(view.scroll, view.target)).endOffset)
    .toBeLessThanOrEqual(3)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await view.scroll.evaluate((element) => {
    element.scrollTop = 0
  })
  await view.content.getByRole('button', { name: '手动聚焦联系人', exact: true }).click()
  await expect(focusTarget).toHaveAttribute('data-scroll-behavior', 'auto')
  await expect
    .poll(async () => (await geometry(view.scroll, view.target)).endOffset)
    .toBeLessThanOrEqual(3)
  await expect(view.target).toBeFocused()
  expect(view.failures).toEqual([])
})

for (const overlay of ['dialog', 'drawer']) {
  for (const layout of ['tabs', 'plain'])
    test(`${overlay}/${layout}拒绝确认尊重自动定位关闭和末端选项，保持草稿`, async ({
      page
    }, info) => {
      const view = await openScroll(page, `native-scroll=${layout}&overlay=${overlay}&flag=off`)
      const name = view.content.getByRole('textbox', { name: /业务名称$/ })
      await name.fill('滚动选项业务草稿')
      await view.owner.getByRole('button', { name: '确认校验', exact: true }).click()
      await expect(view.content.getByLabel('滚动校验次数')).toHaveText('1')
      await expect(view.target).toBeFocused()
      expect((await geometry(view.scroll, view.target)).viewport.scrollTop).toBeLessThanOrEqual(1)
      await expect(view.target).not.toBeInViewport()
      await view.content.getByRole('button', { name: '启用自动定位', exact: true }).click()
      await view.content.getByRole('button', { name: '末端定位', exact: true }).click()
      await view.owner.getByRole('button', { name: '确认校验', exact: true }).click()
      await expect(view.content.getByLabel('滚动校验次数')).toHaveText('2')
      await expect
        .poll(async () => (await geometry(view.scroll, view.target)).endOffset)
        .toBeLessThanOrEqual(3)
      await expect(view.target).toBeFocused()
      await view.owner.screenshot({ path: info.outputPath(`${overlay}-end-viewport.png`) })
      await view.target.fill('有效联系人')
      if (layout === 'tabs')
        await view.content.getByRole('tab', { name: '基础资料', exact: true }).click()
      await expect(name).toHaveValue('滚动选项业务草稿')
      await view.owner.getByRole('button', { name: '确认校验', exact: true }).click()
      await expect(view.owner).toBeHidden()
      expect(view.failures).toEqual([])
    })
}
