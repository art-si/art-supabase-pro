import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('MDM 菜单筛选器在两个业务入口共用交互和响应式布局', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.goto('/tests/e2e/fixtures/mdm-menu-type-filter.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  const filter = page.locator('.menu-type-filter')
  await expect(filter).toHaveAttribute('aria-label', '业务类型功能菜单筛选', {
    timeout: 120_000
  })
  await expect(filter.locator('.business-menu-filter__node')).toHaveCount(3)
  await filter.getByRole('textbox', { name: '搜索菜单功能' }).fill('仓储')
  await expect(filter.getByText('仓储管理', { exact: true })).toBeVisible()
  await filter.getByRole('textbox', { name: '搜索菜单功能' }).clear()
  await filter.getByText('仓储管理', { exact: true }).click()
  await expect(filter.locator('.el-tree-node.is-current > .el-tree-node__content')).toContainText(
    '仓储管理'
  )
  await expect(filter.locator('.business-menu-filter__selection')).toContainText('仓储管理')

  const visualDir = join(
    process.cwd(),
    '.artifacts',
    'mdm-menu-filter-visual',
    testInfo.project.name
  )
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, 'business-desktop.png'), fullPage: true })

  await page.getByRole('button', { name: '切换主题' }).click()
  await expect(filter).toHaveAttribute('aria-label', '单据类型功能菜单筛选')
  await expect(filter).toContainText('查看当前数据范围内全部单据类型')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(filter).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: join(visualDir, 'document-mobile.png'), fullPage: true })
})
