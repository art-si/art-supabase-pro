import { expect, test } from '@playwright/test'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['supplier', 'project', 'route', 'customer', 'cargo']) {
  test(`${mode}公共分组布局保留筛选和专注工作区`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const groupFilters: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (!url.pathname.endsWith('/mdm_master_group')) {
        groupFilters.push(`${url.search} ${route.request().postData() ?? ''}`)
      }
      return route.fulfill({
        json: url.pathname.endsWith('/mdm_master_group')
          ? [
              {
                id: 'group-test',
                parent_id: null,
                code: 'GRP-001',
                name: '业务测试分组',
                enabled: true,
                sort: 0
              }
            ]
          : url.pathname.endsWith('/tms_list_customers_secure')
            ? { records: [], total: 0, fieldAccess: {} }
            : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/master-group-reuse.html?mode=${mode}`)
    const panel = page.locator('.master-group-panel')
    await expect(panel).toBeVisible()
    await expect(page.locator('.art-table-query')).toBeVisible()
    const mobile = (page.viewportSize()?.width ?? 1440) <= 900
    if (mobile) {
      await expect(panel.getByRole('button', { name: '展开分组', exact: true })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      await expect(panel.getByRole('textbox', { name: '搜索分组', exact: true })).toBeHidden()
      expect((await panel.boundingBox())?.height ?? Infinity).toBeLessThan(130)
      const primary = page.locator('.art-workspace-splitter__primary')
      expect((await primary.boundingBox())?.height ?? 0).toBeCloseTo(
        (await panel.boundingBox())?.height ?? -1,
        0
      )
      await panel.getByRole('button', { name: '展开分组', exact: true }).click()
    }
    const node = panel.getByRole('treeitem').filter({ hasText: '业务测试分组' })
    await expect(node).toBeVisible()
    await node.locator('.el-tree-node__content').click()
    await expect.poll(() => groupFilters.some((filter) => filter.includes('group-test'))).toBe(true)
    if (mobile) {
      await expect(panel).toContainText('当前：业务测试分组')
      await panel.getByRole('button', { name: '收起分组', exact: true }).click()
    }
    await assertTableFocusContract(page, info, ['.master-group-panel'])
    await page.screenshot({ path: info.outputPath('workspace.png'), animations: 'disabled' })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`公共分组 ${theme} ${box} 状态、键盘和管理动作`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/tests/e2e/fixtures/master-group-reuse.html')
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      const panel = page.locator('.master-group-panel')
      const mobile = (page.viewportSize()?.width ?? 1440) <= 900
      if (mobile) {
        const expand = panel.getByRole('button', { name: '展开分组', exact: true })
        await expand.focus()
        await page.keyboard.press('Enter')
        await expect(panel.getByRole('button', { name: '收起分组', exact: true })).toHaveAttribute(
          'aria-expanded',
          'true'
        )
      }
      await panel.getByRole('textbox', { name: '搜索分组', exact: true }).fill('下级测试')
      const node = panel.getByRole('treeitem').filter({ hasText: '下级测试分组' }).last()
      await expect(node).toBeVisible()
      await node.locator('.el-tree-node__content').click()
      if (mobile) {
        await panel.getByRole('button', { name: '收起分组', exact: true }).click()
        await expect(panel).toContainText('当前：下级测试分组')
        await panel.getByRole('button', { name: '展开分组', exact: true }).click()
        await expect(panel.getByRole('textbox', { name: '搜索分组', exact: true })).toHaveValue(
          '下级测试'
        )
        await expect(node).toBeVisible()
      }
      await node.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '编辑分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('编辑：下级测试分组')
      await node.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '新增下级分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('新增下级：下级测试分组')
      await node.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '删除分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('删除：下级测试分组')
      await panel.getByRole('button', { name: '新增分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('新增分组')
      await page.getByRole('button', { name: '只读切换', exact: true }).click()
      await expect(panel.getByRole('button', { name: '编辑分组', exact: true })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: '新增分组', exact: true })).toHaveCount(0)
      await panel.getByRole('textbox', { name: '搜索分组', exact: true }).fill('')
      await panel.getByRole('button', { name: /全部分组/ }).click()
      await page.screenshot({ path: info.outputPath('panel-success.png'), animations: 'disabled' })
      expect((await panel.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(
        mobile ? 440 : 520
      )
      const treeScroll = panel.locator('.master-group-panel__scroll .el-scrollbar__wrap')
      expect(
        await treeScroll.evaluate((element) => element.scrollHeight - element.clientHeight)
      ).toBeGreaterThan(0)
      await panel.getByRole('treeitem').filter({ hasText: '测试分组 23' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('panel-lower.png'), animations: 'disabled' })
      await page.getByRole('button', { name: 'error', exact: true }).click()
      await expect(panel.getByText('分组服务暂不可用，请重试', { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(panel.getByRole('tree')).toBeVisible()
      await page.getByRole('button', { name: 'loading', exact: true }).click()
      await expect(panel).toHaveAttribute('aria-busy', 'true')
      await page.getByRole('button', { name: 'empty', exact: true }).click()
      await expect(panel.getByText('尚未建立分组', { exact: true })).toBeVisible()
      if (mobile) {
        await panel.getByRole('button', { name: '收起分组', exact: true }).click()
        await expect(panel.getByText('尚未建立分组', { exact: true })).toBeHidden()
        await page.getByRole('button', { name: 'error', exact: true }).click()
        await expect(panel).toContainText('分组加载失败，请刷新重试')
        await panel.getByRole('button', { name: '刷新分组', exact: true }).click()
        await expect(panel).toContainText('当前：全部分组')
      }
      await page.screenshot({ path: info.outputPath('panel-state.png'), animations: 'disabled' })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(errors).toEqual([])
    })
  }
}
