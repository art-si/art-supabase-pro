import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

for (const mode of ['data', 'compact', 'tree', 'resource', 'icon', 'catalog']) {
  test(`${mode} 选单全屏时内容填满正文，退出后恢复高度`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('https://api.iconify.design/collection**', (route) => route.abort())
    await page.addInitScript(
      ({ dark, boxMode }) =>
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            document.documentElement.classList.toggle('dark', dark)
            document.documentElement.dataset.boxMode = boxMode
          },
          { once: true }
        ),
      {
        dark: info.project.name.includes('dark'),
        boxMode: info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
      }
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/picker-overlay-state.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开选择器' }).click()
    const dialog = page.locator('.el-dialog:visible')
    const content = dialog.locator(
      mode === 'resource'
        ? '.art-resource-picker__content'
        : mode === 'icon'
          ? '.art-icon-picker__panel'
          : mode === 'catalog'
            ? '.workflow-catalog'
            : '.art-data-select-dialog__body'
    )
    await expect(content).toBeVisible()
    const originalHeight = (await content.boundingBox())!.height
    await dialog.getByRole('button', { name: '全屏', exact: true }).click()
    await expect(dialog).toHaveClass(/is-fullscreen/)
    await expect
      .poll(() =>
        content.evaluate((element) => {
          const body = element.closest('.el-dialog__body')!.getBoundingClientRect()
          const bounds = element.getBoundingClientRect()
          const padding = getComputedStyle(element.closest('.art-dialog__content')!)
          return Math.abs(body.bottom - bounds.bottom - parseFloat(padding.paddingBottom))
        })
      )
      .toBeLessThan(2)
    await expect(dialog.getByRole('button', { name: '关闭弹窗', exact: true })).toBeVisible()
    if (mode === 'data') {
      await dialog.locator('.el-table__body .el-checkbox').first().click()
      await expect(dialog.locator('.art-data-select-dialog__selected-item')).toHaveCount(1)
      const pager = dialog.locator('.art-data-select-dialog__pager')
      const bounds = (await pager.boundingBox())!
      const contentBounds = (await content.boundingBox())!
      expect(
        Math.abs(bounds.y + bounds.height - contentBounds.y - contentBounds.height)
      ).toBeLessThan(2)
      await dialog.locator('.el-pager .number').filter({ hasText: /^2$/ }).click()
      await expect(
        dialog.locator('.el-table__body').getByText('PK-0011', { exact: true })
      ).toBeVisible()
    }
    await dialog.screenshot({ path: info.outputPath(`${mode}-fullscreen.png`) })
    await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
    await expect
      .poll(async () => Math.abs((await content.boundingBox())!.height - originalHeight))
      .toBeLessThan(2)
    if (mode === 'data')
      await expect(dialog.locator('.art-data-select-dialog__selected-item')).toHaveCount(1)
    await dialog.screenshot({ path: info.outputPath(`${mode}-restored.png`) })
    expect(errors).toEqual([])
  })
}

test('全屏长正文仍能滚动到底部，整体加载层覆盖可见正文', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/overlay-loading-viewport.html')
  await page.getByRole('button', { name: '打开测试弹窗', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  const scroll = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(dialog.getByText('长内容测试行 50', { exact: true })).toBeInViewport()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('overlay-preview-loading', { detail: { kind: 'dialog', loading: true } })
    )
  )
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  const mask = dialog.locator('.art-dialog__viewport > .art-overlay-loading')
  await expect(mask).toBeInViewport()
  await dialog.screenshot({ path: info.outputPath('long-content-loading.png') })
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('overlay-preview-loading', { detail: { kind: 'dialog', loading: false } })
    )
  )
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
})

test('完工入库规则合并为一条提示并与表头保持间距', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html?kind=finished_inbound')
  await page.getByRole('button', { name: '测试生产单据创建', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  const notice = drawer.locator('.el-alert--info')
  await expect(notice).toHaveCount(1)
  await expect(notice).toContainText('同一工单首次实际入库后固定入库模式')
  await expect(notice).toContainText('可按工单、已确认排包单或物料带入')
  const summary = drawer.locator('.art-entity-summary')
  const card = drawer.locator('.art-section-card').first()
  for (const fullscreen of [false, true]) {
    if (fullscreen) await drawer.getByRole('button', { name: '全屏', exact: true }).click()
    const summaryBounds = (await summary.boundingBox())!
    const noticeBounds = (await notice.boundingBox())!
    const cardBounds = (await card.boundingBox())!
    expect(noticeBounds.y - summaryBounds.y - summaryBounds.height).toBeGreaterThanOrEqual(15)
    expect(cardBounds.y - noticeBounds.y - noticeBounds.height).toBeGreaterThanOrEqual(15)
    await drawer.screenshot({
      path: info.outputPath(`production-notice-${fullscreen ? 'full' : 'normal'}.png`)
    })
  }
})
