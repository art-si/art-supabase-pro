import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: [],
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
    })
  )
})

async function setAppearance(page: Page, width: number, theme: string, box: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await page.evaluate(
    ({ theme, box }) => {
      document.documentElement.dataset.uiScope = 'workspace'
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.dataset.boxMode = box
    },
    { theme, box }
  )
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
}

async function expectGap(before: Locator, after: Locator, expected = 12) {
  await expect(async () => {
    const previous = await before.boundingBox()
    const next = await after.boundingBox()
    expect(previous).not.toBeNull()
    expect(next).not.toBeNull()
    expect(next!.y - previous!.y - previous!.height).toBeCloseTo(expected, 0)
  }).toPass({ timeout: 5_000 })
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
}

test('真实挂车查询卡上下间距、单层卡片和专注恢复在 workspace 各模式一致', async ({
  page
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/workspace-query-spacing.html?entry=trailer')
  const header = page.locator('.business-workspace-header')
  const search = page.locator('.art-table-query__search-scrollbar')
  const table = page.locator('.art-table-card')
  await expect(header).toBeVisible()
  await expect(table).toBeVisible()
  await expect(page.getByText('暂无挂车档案', { exact: true })).toBeVisible()
  const surfaceShadows = new Map<string, string>()

  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const box of ['border-mode', 'shadow-mode']) {
        await setAppearance(page, width, theme, box)
        await expectGap(header, search)
        await expectGap(search, table)
        const surface = await search.evaluate((element) => {
          const style = getComputedStyle(element)
          const form = element.querySelector('.art-search-bar')!
          const inner = getComputedStyle(form)
          const bounds = element.getBoundingClientRect()
          const clippingAncestors: string[] = []
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent)
            const rect = parent.getBoundingClientRect()
            if (
              /(hidden|clip|auto|scroll)/.test(parentStyle.overflow) &&
              (rect.left > bounds.left - 4 ||
                rect.right < bounds.right + 4 ||
                rect.top > bounds.top - 4 ||
                rect.bottom < bounds.bottom + 4)
            ) {
              clippingAncestors.push(parent.className)
            }
          }
          return {
            shadow: style.boxShadow,
            innerShadow: inner.boxShadow,
            innerBorder: inner.borderTopWidth,
            clippingAncestors
          }
        })
        expect(surface.innerShadow).toBe('none')
        expect(surface.innerBorder).toBe('0px')
        expect(surface.clippingAncestors).toEqual([])
        if (box === 'shadow-mode') {
          expect(surface.shadow).not.toBe('none')
          expect(surface.shadow).not.toBe(surfaceShadows.get(`${width}-${theme}`))
        } else {
          surfaceShadows.set(`${width}-${theme}`, surface.shadow)
        }
        await expectNoHorizontalOverflow(page)
        await page.screenshot({
          path: info.outputPath(`trailer-${width}-${theme}-${box}.png`),
          fullPage: true
        })
      }
    }
  }

  await setAppearance(page, 900, 'dark', 'shadow-mode')
  await expectGap(header, search)
  await expectGap(search, table)
  // A token change must affect both boundaries once, with no additional page margins.
  await page
    .locator('html')
    .evaluate((element) => element.style.setProperty('--art-page-gap', '20px'))
  await expectGap(header, search, 20)
  await expectGap(search, table, 20)
  await page.locator('html').evaluate((element) => element.style.removeProperty('--art-page-gap'))
  await expectGap(header, search)
  await expectGap(search, table)

  await page.getByRole('switch', { name: '显示表格右侧工具栏', exact: true }).locator('..').click()
  await page.route('**/rest/v1/rpc/vms_list_trailers_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: 'spacing-trailer',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            plate_no: '测A-间距回归',
            trailer_type: '标准挂车',
            status: 'active'
          }
        ],
        total: 1
      }
    })
  )
  await page.getByRole('button', { name: '刷新表格', exact: true }).click()
  await expect(page.locator('.el-table__body-wrapper').getByText('测A-间距回归')).toBeVisible()
  await page.getByRole('button', { name: '收起搜索条件', exact: true }).click()
  await expect(search).toBeHidden()
  await expectGap(header, table)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(header).toBeHidden()
  await expect(search).toBeHidden()
  await expect(table).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()
  await expect(search).toBeHidden()
  await expectGap(header, table)

  await page.getByRole('button', { name: '展开搜索条件', exact: true }).click()
  await expectGap(header, search)
  await expectGap(search, table)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(header).toBeHidden()
  await expect(search).toBeVisible()
  await expectGap(search, table)
  await expect(page.locator('.el-pagination')).toBeVisible()
  expect((await table.boundingBox())!.height).toBeGreaterThan(200)
  await page.screenshot({
    path: info.outputPath('trailer-900-dark-shadow-focus.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(header).toBeVisible()
  await expectGap(header, search)
  await expectGap(search, table)
  await expectNoHorizontalOverflow(page)
  expect(errors).toEqual([])
})

for (const entry of ['project', 'operation']) {
  test(`真实 WMS ${entry} 工作区相邻区块不叠加页面间距`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/workspace-query-spacing.html?entry=${entry}`)
    const header = page.locator('.business-workspace-header')
    await expect(header).toBeVisible()
    const content = header.locator('xpath=following-sibling::*[1]')
    await expect(content).toBeVisible()
    for (const appearance of [
      { width: 900, theme: 'dark', box: 'shadow-mode' },
      { width: 390, theme: 'light', box: 'border-mode' }
    ]) {
      await setAppearance(page, appearance.width, appearance.theme, appearance.box)
      await expectGap(header, content)
      if (entry === 'project') {
        await expectGap(content, content.locator('xpath=following-sibling::*[1]'))
      }
      await expectNoHorizontalOverflow(page)
      await page.screenshot({
        path: info.outputPath(
          `${entry}-${appearance.width}-${appearance.theme}-${appearance.box}.png`
        ),
        fullPage: true
      })
    }
    expect(errors).toEqual([])
  })
}
