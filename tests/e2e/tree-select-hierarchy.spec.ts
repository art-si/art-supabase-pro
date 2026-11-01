import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })

async function prepare(page: Page) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'org-root',
          tenant_id: 'tree-tenant',
          parent_id: null,
          organization_code: 'ROOT',
          organization_name: '验收公司',
          status: '1',
          sort: 1
        },
        {
          id: 'org-child',
          tenant_id: 'tree-tenant',
          parent_id: 'org-root',
          organization_code: 'DEPT',
          organization_name: '制造部门',
          status: '1',
          sort: 2
        }
      ]
    })
  )
}

test('仓库库存组织与分组按真实父子节点展开、搜索、选中回显', async ({ page }, info) => {
  await prepare(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tree-select-hierarchy.html')
  await page.getByRole('button', { name: '打开层级表单' }).click()
  const dialog = page.getByRole('dialog', { name: '新增仓库', exact: true })
  const organization = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('库存组织', { exact: true }) })
    .locator('.el-select')
  await organization.click()
  const root = page.getByRole('treeitem').filter({ hasText: '验收公司' }).first()
  await expect(root).toHaveAttribute('aria-expanded', 'false')
  await root.locator('.el-tree-node__expand-icon').first().click()
  await expect(page.getByRole('treeitem', { name: '制造部门 · DEPT', exact: true })).toBeVisible()
  await page.getByRole('treeitem', { name: '制造部门 · DEPT', exact: true }).click()
  await expect(organization).toContainText('制造部门 · DEPT')
  const group = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('仓库分组', { exact: true }) })
    .locator('.el-select')
  await group.click()
  const groupRoot = page.getByRole('treeitem').filter({ hasText: '仓库总组' }).first()
  await groupRoot.locator('.el-tree-node__expand-icon').first().click()
  await page.getByRole('treeitem', { name: '原料仓组 · RAW', exact: true }).click()
  await expect(group).toContainText('原料仓组 · RAW')
  await group.click()
  await group.locator('input').fill('原料')
  await expect(page.getByRole('treeitem', { name: '原料仓组 · RAW', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('warehouse-tree.png') })
  await page.keyboard.press('Escape')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('科目上级构树并排除编辑节点及其整个后代分支', async ({ page }, info) => {
  await prepare(page)
  await page.goto('/tests/e2e/fixtures/tree-select-hierarchy.html?mode=subject-edit')
  await page.getByRole('button', { name: '打开层级表单' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑科目 · 100101', exact: true })
  const parent = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('上级科目', { exact: true }) })
    .locator('.el-select')
  await parent.click()
  const root = page.getByRole('treeitem', { name: '1001 现金总科目', exact: true })
  await root.locator('.el-tree-node__expand-icon').first().click()
  await expect(
    page.getByRole('treeitem', { name: '100102 备用现金科目', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('treeitem', { name: '100101 当前现金科目', exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole('treeitem', { name: '10010101 现金明细科目', exact: true })
  ).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('subject-parent-tree.png') })
})

test('凭证科目保留祖先层级且只允许选择末级科目', async ({ page }, info) => {
  await prepare(page)
  await page.goto('/tests/e2e/fixtures/tree-select-hierarchy.html?mode=voucher')
  await page.getByRole('combobox', { name: '第 1 条分录会计科目' }).click()
  const root = page.getByRole('treeitem', { name: '1001 现金总科目', exact: true })
  await expect(root).toHaveAttribute('aria-disabled', 'true')
  if ((await root.getAttribute('aria-expanded')) !== 'true')
    await root.locator('.el-tree-node__expand-icon').first().click()
  const current = page.getByRole('treeitem', { name: '100101 当前现金科目', exact: true })
  await expect(current).toHaveAttribute('aria-disabled', 'true')
  await current.locator('.el-tree-node__expand-icon').first().click()
  await page.getByRole('treeitem', { name: '10010101 现金明细科目', exact: true }).click()
  await expect(page.locator('.el-select').first()).toContainText('10010101 现金明细科目')
  const line = JSON.parse(await page.getByTestId('voucher-model').innerText())
  expect(line).toMatchObject({
    subjectId: 'subject-descendant',
    auxiliaryValues: {},
    currencyId: null,
    exchangeRate: 1,
    originalAmount: 0,
    quantity: 0
  })
  await page.screenshot({ path: info.outputPath('voucher-leaf-selection.png') })
})
