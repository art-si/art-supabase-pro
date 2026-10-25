import { expect, test } from '@playwright/test'

test('菜单权限虚拟树保持稳定高度并独立滚动', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/system/role', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/auth\/login/)
  await expect(page.locator('.role-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })

  await page.getByLabel('配置菜单权限').first().click()
  const dialog = page.getByRole('dialog', { name: '配置菜单权限' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-overlay-loading.is-loading')).toHaveCount(0, {
    timeout: 60_000
  })

  const viewport = dialog.locator('.role-permission-dialog__tree-viewport')
  const treeScroll = dialog.locator('.role-permission-dialog__tree .el-tree-virtual-list')
  const dialogScroll = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
  await expect(viewport).toBeVisible()
  await expect(treeScroll).toBeVisible()

  const initialMetrics = await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
  })
  expect(initialMetrics.height).toBeGreaterThan(240)
  await expect.poll(() => treeScroll.evaluate((element) => element.scrollTop)).toBe(0)

  await treeScroll.evaluate((element) => element.scrollTo({ top: 800, behavior: 'auto' }))
  await expect.poll(() => treeScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  const scrolledMetrics = await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
  })
  expect(Math.abs(scrolledMetrics.top - initialMetrics.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(scrolledMetrics.height - initialMetrics.height)).toBeLessThanOrEqual(1)
  expect(await dialogScroll.evaluate((element) => element.scrollTop)).toBe(0)

  const stableScrollHeight = await treeScroll.evaluate((element) => element.scrollHeight)
  await treeScroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await page.waitForTimeout(200)
  expect(await treeScroll.evaluate((element) => element.scrollHeight)).toBe(stableScrollHeight)
  expect(pageErrors, `页面出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])
})
