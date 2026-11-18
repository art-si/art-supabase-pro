import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('物料分类树键盘：只读页面逐级筛选右侧分类', async ({ page }) => {
  await prepareIsolatedSession(page)
  const categories = [
    { id: 'parent', parent_id: null, category_code: 'RAW', category_name: '原材料分类' },
    { id: 'child', parent_id: 'parent', category_code: 'RAW-ST', category_name: '车间钢材' },
    { id: 'other', parent_id: null, category_code: 'PACK', category_name: '包装耗材分类' }
  ].map((row, sort) => ({ ...row, sort, tenant_id: 'test-tenant', status: 'enabled' }))
  const requests: string[] = []
  await page.route('**/rest/v1/mdm_material_category?*', (route) => {
    requests.push(route.request().method())
    return route.fulfill({ json: categories })
  })
  await page.goto('/tests/e2e/fixtures/material-category-options.html?mode=list', {
    waitUntil: 'domcontentloaded'
  })
  const tree = page.locator('.material-category-tree')
  const branch = tree.locator('[role="treeitem"][data-key="parent"]')
  const child = tree.locator('[role="treeitem"][data-key="child"]')
  const rows = page.locator('.material-category-page__table-pane .el-table__body tbody tr')
  await expect(rows).toHaveCount(3, { timeout: 90_000 })
  await expect(child).toBeVisible()
  await expect(tree.getByRole('button', { name: /新增.*分类|编辑分类/ })).toHaveCount(0)
  const before = requests.length

  await branch.press('ArrowLeft')
  await expect(child).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(child).toBeVisible()
  expect(requests).toHaveLength(before)
  await expect(rows).toHaveCount(3)

  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(2)
  await expect(rows.getByRole('cell', { name: '原材料分类 RAW', exact: true })).toHaveCount(1)
  await expect(rows.getByRole('cell', { name: '车间钢材 RAW-ST', exact: true })).toHaveCount(1)
  await expect(rows.getByRole('cell', { name: '包装耗材分类 PACK', exact: true })).toHaveCount(0)
  await expect(branch).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(child).toBeFocused()
  await page.keyboard.press('Space')
  await expect(rows).toHaveCount(1)
  await expect(rows.getByRole('cell', { name: '车间钢材 RAW-ST', exact: true })).toBeVisible()
  expect(requests.slice(before)).toEqual(['GET', 'GET'])
})

test('物料分类树键盘：行内编辑和新增不触发选组', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/section-card-navigation.html?feature=material', {
    waitUntil: 'domcontentloaded'
  })
  const tree = page.locator('.material-category-tree')
  const first = tree.locator('[role="treeitem"][data-key="group-0"]')
  const other = tree.locator('[role="treeitem"][data-key="group-1"]')
  const selection = page.getByLabel('选中分组')
  const action = page.getByLabel('最近操作')
  await expect(first).toBeVisible({ timeout: 90_000 })
  await first.press('Enter')
  await expect(selection).toHaveText('group-0')

  const edit = other.getByRole('button', { name: '编辑分类', exact: true })
  await edit.focus()
  await expect(other.locator('.material-category-tree__node-actions')).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect(action).toHaveText('编辑分组')
  await expect(selection).toHaveText('group-0')

  await other.getByRole('button', { name: '新增下级分类', exact: true }).press('Space')
  await expect(action).toHaveText('新增分组')
  await expect(selection).toHaveText('group-0')
})
