import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const theme of ['light', 'dark'] as const) {
  for (const boxMode of ['border-mode', 'shadow-mode'] as const) {
    test(`${theme} ${boxMode}：长菜单名称省略显示，文字徽章保留间距和完整名称提示`, async ({
      page
    }, testInfo) => {
      await page.goto('/tests/e2e/fixtures/sidebar-menu-badge.html')
      await page.evaluate(
        ({ theme, boxMode }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = boxMode
        },
        { theme, boxMode }
      )
      await expect(page.locator('html')).toHaveAttribute('data-box-mode', boxMode)
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
      else await expect(page.locator('html')).not.toHaveClass(/dark/)
      const item = page.getByRole('menuitem').first()
      const name = item.locator('.menu-name')
      const badge = item.locator('.art-text-badge')
      await expect(name).toHaveAttribute('title', '企业项目管理与跨部门业务协作综合工作台')
      await expect(badge).toHaveText('Beta')
      await expect(badge).toHaveCSS('position', 'static')
      await expect(name).toHaveCSS('text-overflow', 'ellipsis')
      const nameBox = await name.boundingBox()
      const badgeBox = await badge.boundingBox()
      expect(nameBox).not.toBeNull()
      expect(badgeBox).not.toBeNull()
      if (!nameBox || !badgeBox) throw new Error('菜单名称或徽章未显示')
      expect(badgeBox.x - nameBox.x - nameBox.width).toBeGreaterThanOrEqual(7)
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(230)
      expect(await name.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
      await page.getByRole('menuitem', { name: '业务分组', exact: true }).click()
      await page.getByRole('menuitem', { name: '二级分组', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: '三级业务页面', exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('sidebar-menu-badge.png') })
    })
  }
}
