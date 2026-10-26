import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const LONG_NAME = '测试超长组织或分类名称用于验证树节点在窄屏下保持截断且不会撑开整个页面布局'

for (const scenario of [
  {
    kind: 'leave',
    name: '请假信息组织树',
    selector: '.leave-organization',
    searchName: '搜索组织名称或编码',
    nodeCode: 'ORG-LONG',
    selectedId: 'org-long',
    minHeight: '48px'
  },
  {
    kind: 'risk',
    name: '岗位隐患组织树',
    selector: '.risk-organization',
    searchName: '搜索组织名称或编码',
    nodeCode: 'ORG-LONG',
    selectedId: 'org-long',
    minHeight: '48px'
  },
  {
    kind: 'category',
    name: '危废分类树',
    selector: '.hazardous-category-nav',
    searchName: '搜索危废分类',
    nodeCode: 'CAT-LONG',
    selectedId: 'category-long',
    minHeight: '50px'
  }
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${scenario.name}复用树样式与窄屏布局 ${theme}`, async ({ page }, testInfo) => {
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(
        `/tests/e2e/fixtures/smis-tree-navigator.html?kind=${scenario.kind}&theme=${theme}`,
        { waitUntil: 'domcontentloaded' }
      )

      const navigator = page.locator(scenario.selector)
      const longNode = navigator.locator('.el-tree-node__content').filter({ hasText: LONG_NAME })
      await expect(longNode).toBeVisible({ timeout: 90_000 })
      await expect(longNode).toHaveCSS('min-height', scenario.minHeight)
      const longTitle = longNode.locator('strong')
      await expect(longTitle).toHaveText(LONG_NAME)
      await expect(longTitle).toHaveCSS('text-overflow', 'ellipsis')
      await expect(longTitle).toHaveCSS('white-space', 'nowrap')
      await expect(longTitle).toHaveAttribute('title', LONG_NAME)

      await longNode.click()
      await expect(page.getByTestId('selected-key')).toHaveText(scenario.selectedId)
      await expect(longNode.locator('..')).toHaveClass(/is-current/)
      await navigator.getByRole('textbox', { name: scenario.searchName }).fill(scenario.nodeCode)
      await expect(longNode).toBeVisible()
      await expect(
        navigator.locator('.el-tree-node__content').filter({ hasText: '其他' })
      ).toBeHidden()
      await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true })

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(longNode).toBeVisible()
      await expect(longNode).toHaveCSS('min-height', scenario.minHeight)
      expect(await longTitle.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true
      )
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true })
    })
  }
}
