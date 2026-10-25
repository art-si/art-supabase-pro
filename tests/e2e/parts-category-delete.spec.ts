import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const entry of ['single', 'bulk', 'tree'] as const) {
  for (const state of ['child', 'child-check-failed', 'clear'] as const) {
    test(`类别层级删除 ${entry} ${state}`, async ({ page }, info) => {
      const rootId = '00000000-0000-4000-a000-000000000001'
      const childId = '00000000-0000-4000-a000-000000000002'
      let treeReads = 0
      let deleteCount = 0
      let inspectCount = 0
      await page.route('**/rest/v1/**', (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname.endsWith('/get_record_delete_dependency_details')) {
          inspectCount++
          expect(request.postDataJSON()).toMatchObject({
            p_table: 'mdm_part_category',
            p_ids: [rootId]
          })
          return route.fulfill({ json: [] })
        }
        if (url.pathname.endsWith('/sys_dictionary'))
          return route.fulfill({
            json: [
              {
                code: 'enabled',
                label: '启用',
                value: '1',
                status: '1',
                dict_type_table: { code: 'status', name: '状态' }
              }
            ]
          })
        if (url.pathname.endsWith('/mdm_part_category')) {
          if (request.method() === 'DELETE') {
            deleteCount++
            return route.fulfill({
              json: null,
              headers: {
                'content-range': '*/1',
                'access-control-expose-headers': 'content-range'
              }
            })
          }
          if (request.method() === 'GET') {
            const isTree = !url.searchParams.has('parent_id')
            if (isTree) treeReads++
            if (isTree && treeReads > 1 && state === 'child-check-failed')
              return route.fulfill({
                status: 500,
                json: { code: 'XX000', message: 'category inspection unavailable' }
              })
            const records: Array<{
              id: string
              parent_id: string | null
              category_name: string
              category_code: string
              status: string
            }> = [
              {
                id: rootId,
                parent_id: null,
                category_name: '测试父类别',
                category_code: 'LB-ROOT',
                status: '1'
              }
            ]
            if (isTree && state === 'child')
              records.push({
                id: childId,
                parent_id: rootId,
                category_name: '测试子类别',
                category_code: 'LB-CHILD',
                status: '1'
              })
            return route.fulfill({
              json: records,
              headers: {
                'content-range': `0-${records.length - 1}/${records.length}`,
                'access-control-expose-headers': 'content-range'
              }
            })
          }
        }
        return route.fulfill({ json: [] })
      })
      await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=parts-category')
      await expect(page.locator('.el-table__body-wrapper tr')).toHaveCount(1)
      await expect(page.getByText('测试父类别', { exact: true })).toHaveCount(2)
      if (entry === 'tree') {
        const node = page.locator('.tree-node').filter({ hasText: '测试父类别' })
        await node.hover()
        await node.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      } else if (entry === 'bulk') {
        await page.locator('.el-table__header-wrapper .el-checkbox').click()
        await page.getByRole('button', { name: '批量删除', exact: true }).click()
      } else {
        await page
          .locator('.el-table__body-wrapper tr')
          .getByRole('button', { name: '更多操作', exact: true })
          .click()
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      }
      if (state === 'clear') {
        const confirmation = page.locator('.el-message-box')
        await expect(confirmation).toBeVisible()
        expect(inspectCount).toBe(1)
        expect(treeReads).toBe(2)
        expect(deleteCount).toBe(0)
        await confirmation.getByRole('button', { name: /删除|确定/ }).click()
        await expect.poll(() => deleteCount).toBe(1)
      } else {
        await expect(page.locator('.el-message-box')).toHaveCount(0)
        await expect(
          page
            .getByRole('dialog')
            .getByText(state === 'child' ? 'LB-CHILD' : '删除检查未完成', { exact: true })
        ).toBeVisible()
        if (state === 'child') {
          await expect(page.getByText('子类别', { exact: true })).toBeVisible()
          await expect(page.getByRole('dialog')).toContainText('测试子类别')
          await expect(page.getByRole('dialog')).toContainText('启用')
        }
        expect(deleteCount).toBe(0)
        expect(inspectCount).toBe(1)
      }
      await page.screenshot({ path: info.outputPath('category-delete.png') })
    })
  }
}

test('类别树普通用户仅显示已授权的新增入口并保持专注模式布局', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/mdm_part_category'))
      return route.fulfill({
        json: [
          {
            id: '00000000-0000-4000-a000-000000000001',
            parent_id: null,
            category_name: '普通用户类别',
            category_code: 'LB-OWN',
            status: '1'
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=parts-category&ordinary=true')
  const node = page.locator('.tree-node').filter({ hasText: '普通用户类别' })
  await node.hover()
  await expect(page.getByRole('button', { name: '新增一级类别', exact: true })).toBeVisible()
  await expect(node.getByRole('button', { name: '新增子类别', exact: true })).toBeVisible()
  await expect(node.getByRole('button', { name: '编辑类别', exact: true })).toHaveCount(0)
  await expect(node.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '批量删除', exact: true })).toHaveCount(0)
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.getByRole('heading', { name: '零部件类别', exact: true })).not.toBeVisible()
  await expect(
    page.locator('.parts-category-tree-card').getByPlaceholder('请输入类别名称')
  ).toBeVisible()
  await expect(page.locator('.el-table__body-wrapper tr')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('category-focus.png') })
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(page.getByRole('heading', { name: '零部件类别', exact: true })).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: '零部件类别', exact: true })).toBeVisible()
})
