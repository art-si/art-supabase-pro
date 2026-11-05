import { expect, test } from '@playwright/test'

test('virtual dictionary rows keep action hints anchored while scrolling', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('**/rest/v1/sys_dict_type*', async (route) => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      parent_id: null,
      node_type: 'directory',
      name: `测试目录 ${index + 1}`,
      code: `testDirectory${index + 1}`,
      status: '1',
      sort: index + 1
    }))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows)
    })
  })
  const response = await page.goto('/tests/e2e/fixtures/dictionary-virtual-tree.html')
  expect(response?.status()).toBe(200)

  const tree = page.locator('.dict-type-tree__virtual-tree')
  await expect(tree).toBeVisible()
  const rightEdgeGap = await page.locator('.tree-card').evaluate((card) => {
    const scrollbar = card.querySelector('.el-virtual-scrollbar')
    if (!scrollbar) throw new Error('字典虚拟树缺少滚动轨道')
    return Math.abs(card.getBoundingClientRect().right - scrollbar.getBoundingClientRect().right)
  })
  expect(rightEdgeGap).toBeLessThanOrEqual(4)

  for (let index = 0; index < 4; index += 1) {
    await tree.locator('.dict-type-tree__node').first().hover()
    const deleteButton = tree.getByRole('button', { name: /^删除测试目录/ }).first()
    await deleteButton.hover()
    await expect(deleteButton).toHaveAttribute('title', /^删除测试目录/)
    await expect(page.locator('.art-tooltip:visible')).toHaveCount(0)
    await tree.evaluate((element) => {
      const scrollable = [element, ...element.querySelectorAll<HTMLElement>('*')].find(
        (child) =>
          child.scrollHeight > child.clientHeight &&
          ['auto', 'scroll'].includes(getComputedStyle(child).overflowY)
      )
      if (!scrollable) throw new Error('字典虚拟树缺少纵向滚动容器')
      scrollable.scrollTop += 420
    })
  }

  await expect(tree.locator('.dict-type-tree__node').first()).toBeVisible()
  await expect(page.locator('.art-tooltip:visible')).toHaveCount(0)
})
