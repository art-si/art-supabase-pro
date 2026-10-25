import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('共享菜单面板保留审批与编号的领域选择、筛选和完整状态', async ({ page }) => {
  test.setTimeout(240_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/tests/e2e/fixtures/business-menu-filters.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  const panel = page.locator('.business-menu-filter')
  await expect(panel).toHaveAttribute('aria-label', '审批业务菜单筛选', { timeout: 120_000 })
  await expect(panel.locator('.business-menu-filter__node')).toHaveCount(3)
  await expect(panel.getByText('未接入菜单', { exact: true })).toHaveCount(0)
  await panel.getByText('销售管理', { exact: true }).click()
  await expect(page.getByLabel('选择结果')).toContainText('scm_sales_contract')
  await expect(page.getByLabel('选择结果')).toContainText('scm_sales_order')
  await expect(panel.locator('.business-menu-filter__selection')).toContainText('2 类')
  await panel.getByRole('textbox', { name: '搜索菜单或审批业务' }).fill('scm_sales_order')
  await expect(panel.getByText('销售订单', { exact: true })).toBeVisible()
  await expect(panel.getByText('销售合同', { exact: true })).toBeHidden()
  await panel.getByRole('textbox').clear()
  await panel.getByText('销售合同', { exact: true }).click()
  await expect(panel.locator('.el-tree-node.is-current > .el-tree-node__content')).toContainText(
    '销售合同'
  )
  await expect(page.getByLabel('选择结果')).toContainText('"types":["scm_sales_contract"]')
  await page.getByRole('button', { name: '模拟错误' }).click()
  await expect(panel.getByText('业务目录暂不可用，请重试。', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByLabel('刷新次数')).toHaveText('1')
  await page.getByRole('button', { name: '切换加载' }).click()
  await expect(panel.locator('.business-menu-filter__tree-area')).toHaveAttribute(
    'aria-busy',
    'true'
  )
  await page.getByRole('button', { name: '切换加载' }).click()
  await page.getByRole('button', { name: '切换空数据' }).click()
  await expect(panel.getByText('暂无已接入审批的菜单', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换空数据' }).click()

  mkdirSync('.artifacts/business-menu-filter-visual', { recursive: true })
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.body.classList.remove('border-mode', 'shadow-mode')
          document.body.classList.add(box)
        },
        { theme, box }
      )
      await page.screenshot({
        path: `.artifacts/business-menu-filter-visual/workflow-${theme}-${box}.png`
      })
    }
  }
  await page.getByRole('button', { name: '切换入口' }).click()
  await expect(panel).toHaveAttribute('aria-label', '编号规则功能菜单筛选')
  await panel.getByRole('textbox', { name: '搜索菜单或编号功能' }).fill('合同编号')
  await expect(panel.getByText('销售合同', { exact: true })).toBeVisible()
  await expect(panel.getByText('销售订单', { exact: true })).toBeHidden()
  await panel.getByRole('textbox').clear()
  await panel.getByText('销售管理', { exact: true }).click()
  await expect(page.getByLabel('选择结果')).toHaveText('sales')
  await expect(panel.locator('.business-menu-filter__selection')).toContainText('2 项')
  await panel.getByRole('button', { name: '全部功能' }).click()
  await expect(page.getByLabel('选择结果')).toHaveText('')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '.artifacts/business-menu-filter-visual/number-mobile-dark.png' })
  expect(pageErrors).toEqual([])
})
