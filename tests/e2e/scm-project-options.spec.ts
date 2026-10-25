import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const failsLater of [false, true]) {
  test(`报价项目选项完整分页 ${failsLater ? '后页失败' : '末页可选'}`, async ({
    page
  }, testInfo) => {
    const navigation: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigation.push(frame.url())
    })
    const tenant = await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }]
      })
    )
    const path = '/scm/sales-quotation/item-category'
    const menu = {
      id: 'quote-category-options',
      parentId: null,
      name: 'ScmQuoteCategory',
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '报价项分类', is_enable: true, is_hide: false, roles: [] }
    }
    await mockApplicationMenus(page, {
      scm: [
        menu,
        ...['View', 'Add'].map((action) => ({
          ...menu,
          id: `quote-${action}`,
          parentId: menu.id,
          name: `ScmQuoteCategory:${action}`,
          path: '',
          component: '',
          type: 'button'
        }))
      ]
    })
    await page.route('**/rest/v1/scm_quote_category?**', (route) =>
      route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    )
    const expenseOffsets: number[] = []
    await page.route('**/rest/v1/scm_quote_expense?**', (route) => {
      const params = new URL(route.request().url()).searchParams
      expect(params.get('order')).toBe('sort_order.asc,expense_name.asc,id.asc')
      expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
      const offset = Number(params.get('offset') || 0)
      expenseOffsets.push(offset)
      const expenses = Array.from({ length: 1001 }, (_, index) => ({
        id: `expense-${index}`,
        tenant_id: tenant.id,
        expense_name: `测试费用${String(index).padStart(4, '0')}`,
        expense_code: `F${index}`,
        enabled: true,
        sort_order: index
      }))
      return route.fulfill({
        json: expenses.slice(offset, offset + Number(params.get('limit') || 500))
      })
    })
    const offsets: number[] = []
    let failurePending = failsLater
    await page.route('**/rest/v1/mdm_project?**', (route) => {
      const params = new URL(route.request().url()).searchParams
      expect(params.get('order')).toBe('project_name.asc,id.asc')
      expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
      const offset = Number(params.get('offset') || 0)
      offsets.push(offset)
      if (failurePending && offset === 500)
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      const projects = Array.from({ length: 1001 }, (_, index) => ({
        id: `project-${index}`,
        tenant_id: tenant.id,
        project_name: `测试项目${String(index).padStart(4, '0')}`,
        project_code: `P${index}`,
        customer: null
      }))
      return route.fulfill({
        json: projects.slice(offset, offset + Number(params.get('limit') || 500))
      })
    })
    await page.goto(`#${path}`)
    const add = page.getByRole('button', { name: '新增报价项', exact: true })
    await expect(add).toBeVisible({ timeout: 90_000 })
    const guide = page.getByText('知道了', { exact: true })
    if (await guide.isVisible()) await guide.click()
    await add.click()
    const dialog = page.getByRole('dialog', { name: '新增报价项分类', exact: true })
    await expect(dialog).toBeVisible()
    await expect.poll(() => offsets.length).toBe(failsLater ? 2 : 3)
    await testInfo.attach('navigation', {
      body: JSON.stringify(navigation),
      contentType: 'application/json'
    })
    if (failsLater) {
      await expect(dialog.getByText('当前账号没有此操作权限', { exact: true })).toBeVisible()
      await expect(dialog.getByText('项目与费用加载失败', { exact: true })).toBeVisible()
      await expect.poll(() => expenseOffsets.length).toBe(3)
      await page.screenshot({
        path: testInfo.outputPath('project-error.png'),
        animations: 'disabled'
      })
      failurePending = false
      await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect.poll(() => offsets.length).toBe(5)
      await expect(dialog.getByText('项目与费用加载失败', { exact: true })).toHaveCount(0)
    }
    const project = dialog.getByRole('combobox', { name: /项目名称/ })
    await expect(project).toBeVisible()
    await project.click()
    await project.fill('测试项目1000')
    await page.getByRole('option', { name: /测试项目1000/ }).click()
    await expect(dialog.getByText('测试项目1000（P1000）', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '添加费用', exact: true }).click()
    const expense = dialog.getByRole('combobox', { name: '附加费用类型', exact: true })
    await expense.click()
    await expense.fill('测试费用1000')
    await page.getByRole('option', { name: '测试费用1000（F1000）', exact: true }).click()
    await expect(dialog.getByText('测试费用1000（F1000）', { exact: true })).toBeVisible()
    expect(expenseOffsets).toEqual(failsLater ? [0, 500, 1000, 0, 500, 1000] : [0, 500, 1000])
    await page.screenshot({
      path: testInfo.outputPath('project-loaded.png'),
      animations: 'disabled'
    })
    expect(offsets).toEqual(failsLater ? [0, 500, 0, 500, 1000] : [0, 500, 1000])
  })
}
