import { expect, test, type Page, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { expectInputTextUnclipped } from './support/input-text-width'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { expectQueryLabelLayout } from './support/query-label-layout'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const path = '/scm/sales-quotation/item-category'

async function mockCategoryList(page: Page) {
  const tenant = await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }] })
  )
  const menu = {
    id: 'category-detail-retry',
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
      {
        ...menu,
        id: 'category-detail-view',
        parentId: menu.id,
        name: 'ScmQuoteCategory:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  await page.route('**/rest/v1/scm_quote_category?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'category-1',
          tenant_id: tenant.id,
          category_name: '测试报价分类',
          project_id: 'project-1',
          quantity: 1,
          unit_price: 10,
          fee_total: 2,
          total_amount: 12,
          fee_items: [{ expense_id: 'expense-1', amount: 2 }],
          quotation_no: null,
          remark: '测试备注'
        }
      ],
      headers: { 'content-range': '0-0/1' }
    })
  )
  return tenant
}

for (const width of [320, 390]) {
  test(`报价项分类在 ${width}px 完整显示三种查询入口并保持标签对齐`, async ({ page }, info) => {
    const appearance =
      width === 390
        ? ({ theme: 'dark', boxBorderMode: false } as const)
        : ({ theme: 'light', boxBorderMode: true } as const)
    await page.setViewportSize({ width, height: 844 })
    await prepareAppearance(page, appearance)
    const tenant = await mockCategoryList(page)
    const projectId = '55555555-5555-4555-8555-555555555555'
    await page.route('**/rest/v1/mdm_project?**', (route) =>
      route.fulfill({
        json: [
          { id: projectId, tenant_id: tenant.id, project_code: 'QA-01', project_name: '验收分类' }
        ]
      })
    )
    await page.goto(`#${path}`)
    await expect(page.getByRole('heading', { name: '报价项分类', exact: true })).toBeVisible({
      timeout: 90_000
    })
    await assertAppearance(page, appearance)
    const search = page.locator('.art-table-query .art-search-bar')
    const field = search.locator('[data-art-form-item-key="keyword"]')
    const keyword = field.getByRole('textbox', { name: '项目/分类', exact: true })
    await expect(keyword).toBeVisible()
    await expect(keyword).toBeEmpty()
    await expect(keyword).toHaveAttribute('placeholder', /单号.*项目.*分类/)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await search.screenshot({ path: info.outputPath(`scm-category-keyword-${width}.png`) })
    await expectInputTextUnclipped(keyword, 'placeholder')
    await expectQueryLabelLayout(field)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1
    )

    await keyword.fill('验收分类')
    const [request] = await Promise.all([
      page.waitForRequest(
        (request) => {
          const url = new URL(request.url())
          return (
            url.pathname.endsWith('/scm_quote_category') &&
            Boolean(url.searchParams.get('or')?.includes('验收分类'))
          )
        },
        { timeout: 15_000 }
      ),
      keyword.press('Enter')
    ])
    const filter = new URL(request.url()).searchParams.get('or')
    expect(filter).toContain('category_name.ilike."%验收分类%"')
    expect(filter).toContain('quotation_no.ilike."%验收分类%"')
    expect(filter).toContain(`project_id.in.(${projectId})`)
  })
}

test('报价分类费用失败重试并拒绝关闭前旧响应', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenant = await mockCategoryList(page)
  let fails = true
  let holdNext = false
  const pending: Route[] = []
  const expense = {
    id: 'expense-1',
    tenant_id: tenant.id,
    expense_name: '当前费用名称',
    expense_code: 'F1'
  }
  await page.route('**/rest/v1/scm_quote_expense?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe(`eq.${tenant.id}`)
    if (holdNext) {
      holdNext = false
      pending.push(route)
      return
    }
    return fails
      ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      : route.fulfill({ json: [expense] })
  })
  await page.goto(`#${path}`)
  const view = page.getByRole('button', { name: '查看', exact: true }).first()
  await expect(view).toBeVisible({ timeout: 90_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await view.click()
  const drawer = page.getByRole('dialog', { name: '查看报价项分类', exact: true })
  const closeDrawer = drawer.getByRole('button', { name: '关闭抽屉', exact: true })
  const feeTab = drawer.getByRole('tab', { name: '附加费用', exact: true })
  const fees = drawer.getByRole('tabpanel', { name: '附加费用', exact: true })
  await feeTab.click()
  await expect(fees.getByText('费用名称加载失败', { exact: true })).toBeVisible()
  await fees.getByRole('button', { name: '重新加载', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('category-error.png'), animations: 'disabled' })
  fails = false
  await fees.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(fees.getByText('当前费用名称（F1）', { exact: true })).toBeVisible()
  await closeDrawer.click()
  await expect(drawer).not.toBeVisible()
  holdNext = true
  await view.click()
  await expect.poll(() => pending.length).toBe(1)
  await closeDrawer.click()
  await expect(drawer).not.toBeVisible()
  await view.click()
  await feeTab.click()
  await expect(fees.getByText('当前费用名称（F1）', { exact: true })).toBeVisible()
  const lateResponse = page.waitForResponse((response) =>
    response.url().includes('/scm_quote_expense?')
  )
  await pending[0].fulfill({ json: [{ ...expense, expense_name: '旧费用名称不得出现' }] })
  await lateResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(fees.getByText('当前费用名称（F1）', { exact: true })).toBeVisible()
  await expect(fees.getByText('旧费用名称不得出现（F1）', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
  await fees.getByText('当前费用名称（F1）', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('category-current.png'),
    animations: 'disabled'
  })
})
