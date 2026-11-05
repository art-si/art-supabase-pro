import { expect, test } from '@playwright/test'

const regions = [
  {
    card: '.project-assistant-object-browser',
    scroll: '.project-assistant-object-browser__list',
    inset: 7
  },
  { card: '.project-assistant__detail', scroll: '.project-assistant__code-scroll', inset: 14 },
  { card: '.dashboard-transit', scroll: '.dashboard-transit__list', inset: 25 },
  { card: '.recent-orders', scroll: '.recent-orders__list', inset: 25 }
] as const

for (const viewport of [1440, 1024] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`workspace scrollbars stay at card edges at ${viewport}px in ${theme} theme`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width: viewport, height: 900 })
      const response = await page.goto(
        `/tests/e2e/fixtures/scrollbar-workspaces.html${theme === 'dark' ? '?dark' : ''}`
      )
      expect(response?.status()).toBe(200)

      for (const region of regions) {
        const card = page.locator(region.card)
        const scroll = card.locator(region.scroll)
        await expect(scroll).toBeVisible()
        await scroll.hover()
        const geometry = await card.evaluate((element, scrollSelector) => {
          const scrollbar = element.querySelector<HTMLElement>(scrollSelector)
          const wrap = scrollbar?.querySelector<HTMLElement>('.el-scrollbar__wrap')
          const view = scrollbar?.querySelector<HTMLElement>('.el-scrollbar__view')
          const bar = scrollbar?.querySelector<HTMLElement>('.el-scrollbar__bar.is-vertical')
          if (!scrollbar || !wrap || !view || !bar) throw new Error('滚动组件结构缺失')
          return {
            wrapGap: element.getBoundingClientRect().right - wrap.getBoundingClientRect().right,
            railGap: element.getBoundingClientRect().right - bar.getBoundingClientRect().right,
            contentInset:
              view.getBoundingClientRect().left -
              element.getBoundingClientRect().left +
              parseFloat(getComputedStyle(view).paddingLeft),
            overflows: wrap.scrollHeight > wrap.clientHeight
          }
        }, region.scroll)
        expect(geometry.wrapGap, `${region.card} 滚动窗口未贴卡片右侧`).toBeLessThanOrEqual(4)
        expect(geometry.railGap, `${region.card} 轨道未贴卡片右侧`).toBeLessThanOrEqual(6)
        expect(geometry.contentInset, `${region.card} 内容内距不足`).toBeGreaterThanOrEqual(
          region.inset
        )
        expect(geometry.overflows, `${region.card} 脱敏数据不足以验证滚动`).toBe(true)
      }

      for (const [tabName, scrollClass] of [
        ['智能概览', '.project-assistant__insights-scroll'],
        ['外键关系', '.project-assistant__relation-list']
      ] as const) {
        await page.getByRole('tab', { name: tabName }).click()
        const detailCard = page.locator('.project-assistant__detail')
        const scrollbar = detailCard.locator(scrollClass)
        await expect(scrollbar).toBeVisible()
        const gap = await detailCard.evaluate((element, selector) => {
          const wrap = element.querySelector(`${selector} .el-scrollbar__wrap`)
          if (!wrap) throw new Error('详情滚动区域缺失')
          return element.getBoundingClientRect().right - wrap.getBoundingClientRect().right
        }, scrollClass)
        expect(gap, `${tabName} 滚动窗口未贴详情卡片右侧`).toBeLessThanOrEqual(4)
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport
      )

      await page.screenshot({ path: testInfo.outputPath(`scrollbars-${viewport}-${theme}.png`) })
    })
  }
}
