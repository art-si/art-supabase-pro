import { expect, test, type Page, type Route } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }, testInfo) => {
  await prepareAppearance(page, {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('shadow')
  })
})

async function openDemo(page: Page) {
  await prepareIsolatedSession(page)
  // Use the existing synthetic widget data, without adding database menus or permissions.
  const menu = {
    id: 'test-select-widget',
    parentId: null,
    name: 'TestSelectWidget',
    path: '/widgets/data-select',
    component: '/widgets/data-select',
    type: 'menu',
    meta: { title: '数据选择器', is_enable: true, is_hide: false },
    children: []
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, { platform: [menu] })
  await page.goto('#/widgets/data-select', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('表格多选', { exact: true })).toBeVisible({ timeout: 60_000 })
  const projectName = test.info().project.name
  if (projectName.includes('dark')) await expect(page.locator('html')).toHaveClass(/dark/)
  else await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute(
    'data-box-mode',
    projectName.includes('shadow') ? 'shadow-mode' : 'border-mode'
  )
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
}

test('table and tree selectors keep usable content and footer at low heights', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  await openDemo(page)
  if (!testInfo.project.name.includes('mobile'))
    await page.setViewportSize({ width: 1280, height: 600 })
  for (const [label, title, content, multiple] of [
    ['表格多选', '选择合作企业', '.el-table', true],
    ['表格单选', '选择发货仓', '.el-table', false],
    ['树形多选', '选择经营区域', '.el-tree', true],
    ['树形单选', '选择默认区域', '.el-tree', false]
  ] as const) {
    const field = page
      .locator('.demo-field')
      .filter({ has: page.getByText(label, { exact: true }) })
    await field.getByRole('textbox').click()
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    await expect(dialog.locator(content).first()).toBeVisible()
    await expect(dialog.locator('.art-data-select-dialog__content')).toHaveAttribute(
      'aria-busy',
      'false'
    )
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeInViewport({
      ratio: 1
    })
    const region = await dialog.locator('.art-data-select-dialog__content').boundingBox()
    expect(region!.height).toBeGreaterThan(80)
    if (label === '表格多选') {
      const pager = dialog.locator('.art-data-select-dialog__pager')
      await expect(pager).toBeInViewport({ ratio: 1 })
      const tableBounds = await dialog
        .locator('.art-data-select-dialog__content .el-table')
        .boundingBox()
      const pagerBounds = await pager.boundingBox()
      expect(Math.abs(tableBounds!.y - region!.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(tableBounds!.y + tableBounds!.height - pagerBounds!.y)).toBeLessThanOrEqual(1)
      const search = dialog.locator('.art-data-select-dialog__search input').first()
      await search.fill('no-such-fixture-987654')
      await search.press('Enter')
      await expect(dialog.locator('.el-table__empty-block')).toBeVisible()
      await expect(dialog.locator('.art-data-select-dialog__pager')).toBeInViewport({ ratio: 1 })
      await search.fill('')
      await search.press('Enter')
      await expect(dialog.locator('.el-table__body tr').first()).toBeVisible()
    }
    await expect(dialog.locator('.art-data-select-dialog__selected')).toHaveCount(multiple ? 1 : 0)
    await dialog.screenshot({ path: testInfo.outputPath(`${label}-bounded.png`) })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    await field.getByRole('textbox').click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '关闭此对话框' }).click()
    await expect(dialog).toBeHidden()
    await field.getByRole('textbox').click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
})

test('remote selector ignores obsolete requests and recovers errors without losing selection', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // Replace only the demo loader at the Vite boundary. The real selector and dialog
  // run unchanged; controlled responses below never touch a business table.
  await page.route(
    (url) =>
      url.pathname.endsWith('/src/views/widgets/data-select/index.vue') &&
      !url.searchParams.has('vue'),
    async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      const signature = 'const fetchCompanies = async (params) => {'
      expect(body).toContain(signature)
      await route.fulfill({
        response,
        body: body.replace(
          signature,
          `${signature}
      return fetch('/__test/data-select?keyword=' + encodeURIComponent(params.keyword)).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error('TEST_PROVIDER_INTERNAL_DETAILS');
        return result;
      });`
        )
      })
    }
  )
  const pending = new Map<string, Route[]>()
  await page.route('**/__test/data-select?*', (route) => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword') ?? ''
    pending.set(keyword, [...(pending.get(keyword) ?? []), route])
  })
  const take = async (keyword: string) => {
    await expect.poll(() => pending.get(keyword)?.length ?? 0).toBeGreaterThan(0)
    return pending.get(keyword)!.shift()!
  }
  const success = (route: Route, name: string) =>
    route.fulfill({ json: { data: [{ id: `test-${name}`, name, city: '测试城市' }], total: 1 } })
  await openDemo(page)
  await page.evaluate(
    (settings) => {
      document.documentElement.classList.toggle('dark', settings.dark)
      document.documentElement.classList.toggle('shadow-mode', settings.shadow)
      document.documentElement.classList.toggle('border-mode', !settings.shadow)
    },
    {
      dark: testInfo.project.name.includes('dark'),
      shadow: testInfo.project.name.includes('shadow')
    }
  )
  const trigger = page
    .locator('.demo-field')
    .filter({ has: page.getByText('表格多选', { exact: true }) })
    .getByRole('textbox')
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '选择合作企业', exact: true })
  const search = dialog.locator('.art-data-select-dialog__search input').first()
  const confirm = dialog.getByRole('button', { name: '确定', exact: true })
  const region = dialog.locator('.art-data-select-dialog__content')
  const selected = dialog.locator('.art-data-select-dialog__selected-item')
  const results = dialog.locator('.el-table__body:visible')
  await expect(confirm).toBeDisabled()
  await success(await take(''), '初始结果')
  await expect(results.getByText('初始结果', { exact: true })).toBeVisible()
  await expect(selected).toHaveCount(2)
  const query = async (keyword: string) => {
    await search.fill(keyword)
    await search.press('Enter')
    return take(keyword)
  }

  const old = await query('旧查询')
  const latest = await query('新查询')
  await success(old, '过期结果')
  await expect(region).toHaveAttribute('aria-busy', 'true')
  await expect(confirm).toBeDisabled()
  await success(latest, '最新结果')
  await expect(results.getByText('最新结果', { exact: true })).toBeVisible()
  await expect(results.getByText('过期结果', { exact: true })).toHaveCount(0)

  const obsoleteFailure = await query('旧失败')
  const newerSuccess = await query('更新成功')
  await success(newerSuccess, '仍为最新结果')
  await obsoleteFailure.fulfill({ status: 503, json: {} })
  await expect(results.getByText('仍为最新结果', { exact: true })).toBeVisible()
  await expect(dialog.getByText('可选数据加载失败', { exact: true })).toHaveCount(0)

  const failed = await query('当前失败')
  await failed.fulfill({ status: 503, json: {} })
  await expect(dialog.getByText('可选数据加载失败', { exact: true })).toBeVisible()
  await expect(confirm).toBeDisabled()
  await expect(selected).toHaveCount(2)
  await expect(dialog.getByText('TEST_PROVIDER_INTERNAL_DETAILS', { exact: false })).toHaveCount(0)
  const retryBox = await dialog.getByRole('button', { name: '重新加载', exact: true }).boundingBox()
  const contentBox = await region.boundingBox()
  expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(contentBox!.y + contentBox!.height + 1)
  await dialog.screenshot({ path: testInfo.outputPath('selector-retry.png') })
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await success(await take('当前失败'), '重试成功')
  await expect(results.getByText('重试成功', { exact: true })).toBeVisible()
  await expect(confirm).toBeEnabled()

  const softFailure = await query('返回错误')
  await softFailure.fulfill({ json: { data: [], error: { code: 'TEST_SOFT_ERROR' } } })
  await expect(dialog.getByText('可选数据加载失败', { exact: true })).toBeVisible()
  await expect(confirm).toBeDisabled()
  await expect(selected).toHaveCount(2)
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await success(await take('返回错误'), '返回错误后恢复')
  await expect(results.getByText('返回错误后恢复', { exact: true })).toBeVisible()

  const beforeClose = await query('关闭前')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await trigger.click()
  await success(await take(''), '重新打开结果')
  await success(beforeClose, '关闭前过期结果')
  await expect(results.getByText('重新打开结果', { exact: true })).toBeVisible()
  await expect(results.getByText('关闭前过期结果', { exact: true })).toHaveCount(0)
  await expect(selected).toHaveCount(2)
  expect(pageErrors).toEqual([])
})
