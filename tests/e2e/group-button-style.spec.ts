import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const modes = ['shared', 'bom', 'warehouse', 'category', 'industry'] as const

for (const mode of modes) {
  for (const variant of [
    'light-border-mode',
    'light-shadow-mode',
    'dark-border-mode',
    'dark-shadow-mode',
    '700-dark-shadow-mode',
    '570-light-shadow-mode',
    'narrow'
  ] as const) {
    test(`${mode} 分组入口 ${variant} 选中、悬停和键盘焦点`, async ({ page }, info) => {
      if (variant === 'narrow') await page.setViewportSize({ width: 390, height: 844 })
      if (variant === '700-dark-shadow-mode')
        await page.setViewportSize({ width: 700, height: 900 })
      if (variant === '570-light-shadow-mode')
        await page.setViewportSize({ width: 570, height: 900 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareIsolatedSession(page)
      await page.route('**/rest/v1/**', (route) =>
        route.fulfill({
          json: new URL(route.request().url()).pathname.endsWith('/mdm_master_group')
            ? [
                {
                  id: 'group-0',
                  tenant_id: 'test-tenant',
                  parent_id: null,
                  code: 'STYLE-01',
                  name: '样式验证分组',
                  sort: 0,
                  enabled: true,
                  remark: ''
                }
              ]
            : [],
          headers: { 'content-range': '*/0' }
        })
      )
      await page.goto(`/tests/e2e/fixtures/group-button-style.html?mode=${mode}`, {
        waitUntil: 'domcontentloaded'
      })
      await page.evaluate((variant) => {
        document.documentElement.classList.toggle('dark', variant.includes('dark-'))
        document.documentElement.dataset.boxMode = variant.includes('shadow')
          ? 'shadow-mode'
          : 'border-mode'
      }, variant)
      const expand = page.getByRole('button', { name: '展开分组', exact: true })
      if (mode === 'shared' && (page.viewportSize()?.width ?? 1440) <= 900) await expand.click()
      const all = page.getByRole('button', { name: /全部(?:分组|分类|仓库)/ }).first()
      await expect(all).toBeVisible({ timeout: 60_000 })
      await expect(all).toHaveClass(/is-current/)
      await expect(all).toHaveAttribute('aria-pressed', 'true')
      const selectedBackground = await all.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      )
      await page.getByText('样式验证分组', { exact: true }).last().click()
      await expect(all).not.toHaveClass(/is-current/)
      await expect(all).toHaveAttribute('aria-pressed', 'false')
      const normalBackground = await all.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      )
      expect(normalBackground).not.toBe(selectedBackground)
      await all.hover()
      await expect(all).toHaveCSS('background-color', selectedBackground)
      await expect(all).toHaveCSS(
        'cursor',
        (page.viewportSize()?.width ?? 1440) <= 640 ? 'default' : 'pointer'
      )
      await expect(all).toHaveCSS('border-top-style', 'solid')
      await page.keyboard.press('Tab')
      await all.focus()
      await expect(all).toBeFocused()
      await expect(all).toHaveCSS('outline-style', 'solid')
      await page.keyboard.press('Enter')
      await expect(all).toHaveClass(/is-current/)
      await expect(all).toHaveAttribute('aria-pressed', 'true')
      const geometry = await all.evaluate((element) => {
        const button = getComputedStyle(element)
        const icon = getComputedStyle(element.querySelector(':scope > span:first-child')!)
        return {
          columns: button.gridTemplateColumns,
          gap: button.columnGap,
          iconDisplay: icon.display,
          iconWidth: icon.width,
          iconHeight: icon.height
        }
      })
      expect(geometry.columns).toMatch(/^36px .+ 18px$/)
      expect(geometry.gap).toBe('10px')
      expect([geometry.iconDisplay, geometry.iconWidth, geometry.iconHeight]).toEqual([
        'grid',
        '36px',
        '36px'
      ])
      expect(
        await all.evaluate((element) => element.getBoundingClientRect().height)
      ).toBeGreaterThanOrEqual(58)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(errors).toEqual([])
      if (
        mode === 'shared' ||
        variant === 'light-border-mode' ||
        variant === '700-dark-shadow-mode' ||
        variant === '570-light-shadow-mode' ||
        (mode === 'industry' && variant === 'narrow')
      ) {
        await all.screenshot({ path: info.outputPath(`${mode}-${variant}.png`) })
      }
    })
  }
}
