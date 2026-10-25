import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const density of ['default', 'compact']) {
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      test(`公共头部 ${density} ${theme} ${box} 操作区使用可用宽度`, async ({ page }, info) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.route('**/rest/v1/**', async (route) => {
          const request = route.request()
          await route.fulfill({
            json:
              density === 'compact' ||
              request.method() === 'GET' ||
              request.url().includes('material_unit_compatibility_options')
                ? []
                : { records: [], total: 0, organizations: [], employees: [] },
            headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
          })
        })
        await page.goto(
          density === 'default'
            ? '/tests/e2e/fixtures/issuance-import-reuse.html?mode=ppe&scope=all'
            : '/tests/e2e/fixtures/business-import-records.html?mode=work-order'
        )
        await page.evaluate(
          ({ theme, box }) => {
            document.documentElement.classList.toggle('dark', theme === 'dark')
            document.documentElement.dataset.boxMode = box
          },
          { theme, box }
        )
        const header = page.locator(`.business-workspace-header--${density}`)
        await expect(header).toBeVisible()
        // Reproduce the app shell boundary used by the shared focus controller.
        await page
          .locator('#issuance-import-preview, #business-import-preview')
          .evaluate((element) => element.classList.add('art-page-view'))
        const hero = header.locator('.business-workspace-header__hero')
        const aside = header.locator('.business-workspace-header__aside')
        const importAction = header.getByRole('button', { name: '导入', exact: true })
        await expect(importAction).toBeVisible()
        if (info.project.name.includes('mobile')) {
          const geometry = await hero.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              left: bounds.left + parseFloat(style.paddingLeft),
              width: bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            }
          })
          const after = await aside.boundingBox()
          expect(after?.x).toBeCloseTo(geometry.left, 0)
          expect(after?.width).toBeCloseTo(geometry.width, 0)
          const height = (await header.boundingBox())?.height ?? 0
          const legacy = await page.addStyleTag({
            content: `@media (width <= 640px) { .business-workspace-header.business-workspace-header.business-workspace-header .business-workspace-header__aside {width:calc(100% - ${density === 'default' ? 66 : 54}px); margin-left:${density === 'default' ? 66 : 54}px;} }`
          })
          const legacyHeight = (await header.boundingBox())?.height ?? 0
          const legacyWidth = (await aside.boundingBox())?.width ?? 0
          await page.screenshot({ path: info.outputPath('header-before.png') })
          await legacy.evaluate((element) => element.remove())
          expect(after?.width ?? 0).toBeGreaterThan(legacyWidth)
          expect(height).toBeLessThanOrEqual(legacyHeight)
          await expect(importAction).toBeInViewport()
        }
        await page.screenshot({ path: info.outputPath('header-after.png') })
        if (theme === 'light' && box === 'border-mode') {
          await page
            .getByRole('switch', { name: '进入专注模式', exact: true })
            .locator('..')
            .click()
          await expect(header).toBeHidden()
          await page.keyboard.press('Escape')
          await expect(header).toBeVisible()
          await expect(importAction).toBeVisible()
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true)
        expect(errors).toEqual([])
      })
    }
  }
}
