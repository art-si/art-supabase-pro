import { expect, test } from '@playwright/test'

for (const visual of [
  { theme: 'light', width: 1440, height: 900 },
  { theme: 'dark', width: 390, height: 844 }
]) {
  test(`${visual.theme}${visual.width} 仓储树卡片单层滚动、固定筛选和选中留白`, async ({
    page
  }, info) => {
    await page.setViewportSize(visual)
    await page.goto(`/tests/e2e/fixtures/wms-scroll-ownership.html?theme=${visual.theme}`)
    const card = page.locator('.inventory-location-navigator')
    const toolbar = card.locator('.art-section-card__toolbar')
    const scrollbar = card.locator('.art-section-card__scrollbar')
    await expect(card.locator('.el-scrollbar')).toHaveCount(1)
    await expect(card.getByRole('treeitem').first()).toBeVisible()
    await card.getByText('验收仓库 01', { exact: true }).click()
    const selected = card.locator('.el-tree-node.is-current > .el-tree-node__content')
    const padding = await selected.evaluate((element) => {
      const row = element.getBoundingClientRect(),
        card = element.closest('.art-section-card')!.getBoundingClientRect()
      return { left: row.left - card.left, right: card.right - row.right }
    })
    expect(padding.left).toBeGreaterThanOrEqual(16)
    expect(padding.right).toBeGreaterThanOrEqual(16)
    const rail = scrollbar.locator(':scope > .el-scrollbar__bar.is-vertical')
    expect(
      await rail.evaluate(
        (element) =>
          element.closest('.art-section-card')!.getBoundingClientRect().right -
          element.getBoundingClientRect().right
      )
    ).toBeLessThanOrEqual(6)
    const toolbarTop = (await toolbar.boundingBox())!.y
    await scrollbar.locator(':scope > .el-scrollbar__wrap').evaluate((element) => {
      element.scrollTop = 500
    })
    expect((await toolbar.boundingBox())!.y).toBe(toolbarTop)
    await expect(card.getByRole('textbox', { name: '搜索仓库、库区或库位' })).toBeVisible()
    const last = card.getByText('验收仓库 40', { exact: true })
    await last.click()
    await expect(card.locator('.el-tree-node.is-current')).toContainText('验收仓库 40')
    const end = await last.evaluate((element) => {
      const row = element.getBoundingClientRect(),
        viewport = element.closest('.el-scrollbar__wrap')!.getBoundingClientRect()
      return {
        bottom: row.bottom,
        visibleBottom:
          viewport.bottom -
          Number.parseFloat(
            getComputedStyle(element.closest('.el-scrollbar')!).getPropertyValue(
              '--art-scroll-viewport-inset'
            )
          )
      }
    })
    expect(end.bottom).toBeLessThanOrEqual(end.visibleBottom + 1)
    await card.screenshot({
      path: info.outputPath('selected-last.png'),
      timeout: 60_000,
      animations: 'disabled'
    })
    await card.getByRole('textbox', { name: '搜索仓库、库区或库位' }).fill('未找到的仓库')
    await expect(card.getByText('未找到匹配的仓储位置', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: '清除位置搜索', exact: true }).click()
    await expect(card.getByRole('tree')).toBeVisible()
  })
}
