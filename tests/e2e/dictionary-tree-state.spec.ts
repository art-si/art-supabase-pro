import { expect, test } from '@playwright/test'

test('dictionary tree distinguishes invalid hierarchy, loading failure, empty and recovered data', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  let mode: 'cycle' | 'error' | 'empty' | 'valid' = 'cycle'
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const dictionary = (id: string, parentId: string | null) => ({
    id,
    parent_id: parentId,
    node_type: 'directory',
    name: `测试目录 ${id}`,
    code: `test${id}`,
    status: '1',
    sort: 1,
    cascade_parent_type_id: null,
    cascade_parent_type: null
  })
  await page.route('**/rest/v1/sys_dict_type?*', async (route) => {
    // No business writes are permitted by this regression.
    if (route.request().method() !== 'GET') throw new Error('Unexpected dictionary mutation')
    if (mode === 'error') {
      await route.fulfill({
        status: 503,
        json: { code: 'TEST_UNAVAILABLE', message: 'Synthetic upstream failure' }
      })
      return
    }
    const rows =
      mode === 'cycle'
        ? [dictionary('A', 'B'), dictionary('B', 'A')]
        : mode === 'valid'
          ? [dictionary('A', null), dictionary('B', 'A')]
          : []
    await route.fulfill({ json: rows })
  })
  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })
  const panel = page.locator('.dict-tree-panel')
  const errorTitle = panel.getByText('字典目录加载失败', { exact: true })
  const retry = panel.getByRole('button', { name: '重新加载', exact: true })
  await expect(errorTitle).toBeVisible({ timeout: 60_000 })
  const acknowledge = page.getByRole('button', { name: '知道了', exact: true })
  if (await acknowledge.isVisible()) await acknowledge.click()
  await expect(page.locator('.setting-guide:visible')).toHaveCount(0, { timeout: 10_000 })
  await expect(panel).toContainText('字典层级存在循环关联')
  await expect(panel).toContainText('排序不可用')
  await expect(panel.getByText('暂无字典目录', { exact: true })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '新增根节点', exact: true })).toBeDisabled()
  await expect(panel.getByRole('textbox', { name: '搜索目录名称或字典编码' })).toBeDisabled()
  await page.evaluate(
    (dark) => document.documentElement.classList.toggle('dark', dark),
    testInfo.project.name.includes('dark')
  )
  await panel.screenshot({ path: testInfo.outputPath('dictionary-cycle-error.png') })

  mode = 'error'
  await retry.click()
  await expect(errorTitle).toBeVisible()
  await expect(panel).not.toContainText('循环关联')
  await expect(panel).not.toContainText('Synthetic upstream failure')
  await expect(panel.getByText('暂无字典目录', { exact: true })).toHaveCount(0)

  mode = 'empty'
  await retry.click()
  await expect(panel.getByText('暂无字典目录', { exact: true })).toBeVisible()
  await expect(errorTitle).toHaveCount(0)
  await panel.screenshot({ path: testInfo.outputPath('dictionary-empty.png') })

  mode = 'valid'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(panel.getByText('测试目录 A', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(panel).toContainText('2 个目录 · 0 个类型')
  await panel.getByRole('button', { name: '全部展开字典目录', exact: true }).click()
  await expect(panel.getByText('测试目录 B', { exact: true })).toBeVisible()
  await panel.getByRole('textbox', { name: '搜索目录名称或字典编码' }).fill('testB')
  await expect(panel.getByText('测试目录 B', { exact: true })).toBeVisible()
  await expect(panel.locator('.dict-type-tree__viewport')).toHaveAttribute('aria-busy', 'false')
  expect(pageErrors).toEqual([])
})
