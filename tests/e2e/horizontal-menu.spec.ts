import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test('混合导航图文间距及居中', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/horizontal-menu.html?mixed')
  const labels = page.locator('.art-mixed-menu .menu-item.art-icon-label:has(.art-svg-icon)')
  await expect(labels).toHaveCount(2)
  await expect(labels.first()).toBeVisible()
  for (const label of await labels.all()) {
    const geometry = await label.evaluate((element) => {
      const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
      const text = element.querySelector('span')!.getBoundingClientRect()
      return {
        gap: text.left - icon.right,
        center: Math.abs((icon.top + icon.bottom - text.top - text.bottom) / 2),
        ratio: icon.width / Number.parseFloat(getComputedStyle(element).fontSize)
      }
    })
    expect(geometry.gap).toBeCloseTo(8, 1)
    expect(geometry.center).toBeLessThanOrEqual(0.5)
    expect(geometry.ratio).toBeCloseTo(16 / 14, 1)
  }
  await page.screenshot({ path: info.outputPath('mixed.png') })
})
for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`横向导航递归及父级页面 ${theme} ${box}`, async ({ page }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/tests/e2e/fixtures/horizontal-menu.html')
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      await expect(page.getByText('导航预览首页', { exact: true })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: '父级业务页面', exact: true })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: '空业务目录', exact: true })).toHaveCount(0)
      await page.getByRole('menuitem', { name: '业务分组', exact: true }).hover()
      await page.getByRole('menuitem', { name: '二级分组', exact: true }).hover()
      const leaf = page.getByRole('menuitem', { name: '三级业务页面 Beta', exact: true })
      await expect(leaf).toBeVisible()
      for (const label of await page.locator('.art-icon-label:visible').all()) {
        const geometry = await label.evaluate((element) => {
          const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
          const text = element.querySelector('span')!.getBoundingClientRect()
          return {
            gap: text.left - icon.right,
            center: Math.abs((icon.top + icon.bottom - text.top - text.bottom) / 2),
            ratio: icon.width / Number.parseFloat(getComputedStyle(element).fontSize)
          }
        })
        expect(geometry.gap).toBeCloseTo(8, 1)
        expect(geometry.center).toBeLessThanOrEqual(0.5)
        expect(geometry.ratio).toBeCloseTo(16 / 14, 1)
      }
      const popup = leaf.locator('xpath=ancestor::ul[contains(@class,"el-menu--popup")]').first()
      if (box === 'border-mode') await expect(popup).toHaveCSS('box-shadow', 'none')
      else await expect(popup).not.toHaveCSS('box-shadow', 'none')
      await expect(page.getByRole('menuitem', { name: '隐藏详情', exact: true })).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('expanded.png'), animations: 'disabled' })
      await leaf.click()
      await expect(page.getByText('三级页面已打开', { exact: true })).toBeVisible()
      await expect(page).toHaveURL(/#\/preview-leaf$/)
      await page.getByRole('menuitem', { name: '父级业务页面', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByText('父级页面已打开', { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  }
