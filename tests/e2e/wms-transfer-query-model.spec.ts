import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'
import { prepareAppearance } from './support/appearance'
import { expectInputTextUnclipped } from './support/input-text-width'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('调拨申请查询重置后清除旧条件并继续接受新查询', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenant = await prepareIsolatedSession(page)
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ]
  })
  const dark = testInfo.project.name.includes('dark')
  const shadow = testInfo.project.name.includes('shadow')
  await prepareAppearance(page, { theme: dark ? 'dark' : 'light', boxBorderMode: !shadow })
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  const path = '/wms/transfer-business/transfer-request'
  const menu = {
    id: 'transfer-model-test',
    parentId: null,
    name: 'WmsTransfer',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '调拨申请单', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'wms', name: '测试仓储管理', baseUrl: '/wms/' }] })
  )
  await mockApplicationMenus(page, {
    wms: [
      menu,
      {
        ...menu,
        id: `${menu.id}-View`,
        parentId: menu.id,
        name: 'WmsTransfer:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  await page.route('**/rest/v1/mdm_document_type?*', (route) => route.fulfill({ json: [] }))
  const filters: Array<string | null> = []
  await page.route('**/rest/v1/wms_transfer_request_list?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('order')).toBe('created_at.desc,line_no.asc,document_id.asc,line_id.asc')
    const keyword = params.get('document_no')
    filters.push(keyword)
    return route.fulfill({
      headers: {
        'content-range': '0-0/1',
        'access-control-expose-headers': 'content-range'
      },
      json: [
        {
          document_id: 'test-document',
          line_id: 'test-line',
          tenant_id: tenant.id,
          document_no: 'TRANSFER-TEST',
          document_type_name: '测试申请',
          status: 'draft',
          application_date: '2026-10-05',
          created_at: '2026-10-05T08:00:00Z',
          line_no: 1,
          quantity: 1,
          base_quantity: 1,
          inventory_unit_name: '件',
          source_warehouse_name: '测试调出仓库',
          target_warehouse_name: '测试调入仓库'
        }
      ]
    })
  })
  await page.goto(`#${path}`)
  await expect(page.locator('html')).toHaveAttribute(
    'data-box-mode',
    shadow ? 'shadow-mode' : 'border-mode'
  )
  if (dark) await expect(page.locator('html')).toHaveClass(/dark/)
  else await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.getByRole('heading', { name: '调拨申请单', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect.poll(() => filters.length).toBeGreaterThan(0)
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    const modes = page.getByRole('radiogroup', { name: '单据列表展示方式' })
    const documentMode = await modes.getByText('按单据', { exact: true }).boundingBox()
    const lineMode = await modes.getByText('按明细', { exact: true }).boundingBox()
    if (!documentMode || !lineMode) throw new Error('展示方式选项未完整显示')
    expect(Math.abs(documentMode.y - lineMode.y)).toBeLessThanOrEqual(1)
  }
  const keyword = page.getByPlaceholder('单据编号', { exact: true })
  if (!(await keyword.isVisible()))
    await page
      .locator('.art-table-query')
      .getByRole('button', { name: '展开', exact: true })
      .click()
  const search = page.getByRole('button', { name: '查询', exact: true })
  await page.getByPlaceholder('开始日期', { exact: true }).click()
  const datePanel = page.locator('.el-date-range-picker:visible')
  await expect(datePanel).toBeVisible()
  const dateBounds = await datePanel.boundingBox()
  if (!dateBounds) throw new Error('日期范围面板未显示')
  expect(dateBounds.width).toBeGreaterThan(250)
  expect(dateBounds.x).toBeGreaterThanOrEqual(0)
  expect(dateBounds.x + dateBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  expect(dateBounds.y).toBeGreaterThanOrEqual(0)
  expect(dateBounds.y + dateBounds.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
  const months = datePanel.locator('.el-date-range-picker__content')
  if ((page.viewportSize()?.width ?? 0) <= 640) {
    await expect
      .poll(async () => {
        const firstMonth = await months.first().boundingBox()
        const secondMonth = await months.nth(1).boundingBox()
        if (!firstMonth || !secondMonth) throw new Error('日期范围的双月面板未完整呈现')
        return secondMonth.y - (firstMonth.y + firstMonth.height)
      })
      .toBeGreaterThanOrEqual(-1)
  }
  await page.screenshot({
    path: testInfo.outputPath('date-range-panel.png'),
    animations: 'disabled'
  })
  await datePanel.locator('td.available:not(.prev-month):not(.next-month)').first().click()
  const endDate = months.nth(1).locator('td.available:not(.prev-month):not(.next-month)').first()
  await endDate.scrollIntoViewIfNeeded()
  await expect(endDate).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('date-range-second-month.png'),
    animations: 'disabled'
  })
  await endDate.click()
  await expect(datePanel).toBeHidden()
  await expect(page.getByPlaceholder('开始日期', { exact: true })).not.toHaveValue('')
  await expect(page.getByPlaceholder('结束日期', { exact: true })).not.toHaveValue('')
  await expectInputTextUnclipped(page.locator('.el-date-editor input.el-range-input'))
  await page.screenshot({
    path: testInfo.outputPath('date-range-values.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await keyword.fill('OLD-FILTER')
  await search.click()
  await expect.poll(() => filters.at(-1)).toBe('ilike.%OLD-FILTER%')
  await expect(
    page.locator('.art-table-query').getByText('TRANSFER-TEST', { exact: true })
  ).toBeVisible()
  const previousRequests = filters.length
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(keyword).toHaveValue('')
  await expect.poll(() => filters.length).toBeGreaterThan(previousRequests)
  expect(filters.at(-1)).toBeNull()
  await keyword.fill('NEW-FILTER')
  await search.click()
  await expect.poll(() => filters.at(-1)).toBe('ilike.%NEW-FILTER%')
  await expect(keyword).toHaveValue('NEW-FILTER')
  await assertTableFocusContract(page, testInfo)
  // 展开筛选项后的滚动区域必须仍能操作底部查询按钮。
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await search.scrollIntoViewIfNeeded()
  await expect(search).toBeInViewport()
  await search.click()
  await expect.poll(() => filters.at(-1)).toBe('ilike.%NEW-FILTER%')
  await expect(page.locator('.art-table-query .el-table')).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('table-focus-search-actions.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.art-table-query')).not.toHaveClass(/is-focus-mode/)
  await expect(keyword).toHaveValue('NEW-FILTER')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('transfer-query-restored.png') })
  await page.getByRole('button', { name: '打开界面设置', exact: true }).click()
  const settings = page.locator('.setting-modal .el-drawer')
  await expect(settings).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('settings-initial.png'),
    animations: 'disabled'
  })
  await settings.getByRole('button', { name: /精细配置/ }).click()
  await expect(settings.locator('#manual-settings-content')).toBeVisible()
  const shadowMode = settings.getByRole('button', { name: '阴影', exact: true })
  const borderMode = settings.getByRole('button', { name: '边框', exact: true })
  await shadowMode.click()
  await shadowMode.click()
  await expect(shadowMode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-box-mode', 'shadow-mode')
  await borderMode.click()
  await expect(borderMode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-box-mode', 'border-mode')
  if (shadow) await shadowMode.click()
  const colorWeakSwitch = settings.getByRole('switch', { name: '色弱模式', exact: true })
  await expect(colorWeakSwitch).toHaveAttribute('aria-checked', 'false')
  await colorWeakSwitch.locator('..').click()
  await expect(page.locator('html')).toHaveClass(/color-weak/)
  await colorWeakSwitch.locator('..').click()
  await expect(page.locator('html')).not.toHaveClass(/color-weak/)
  const mobileSettings = settings.locator('.setting-item-row.mobile-hide')
  expect(await mobileSettings.count()).toBeGreaterThan(0)
  for (const item of await mobileSettings.all()) {
    if ((page.viewportSize()?.width ?? 0) <= 800) await expect(item).toBeHidden()
    else await expect(item).toBeVisible()
  }
  const radius = settings.locator('.setting-item-row').filter({ hasText: '自定义圆角' })
  await expect(settings.getByRole('combobox', { name: '自定义圆角', exact: true })).toBeVisible()
  await radius.locator('.el-select').click()
  await page.getByRole('option', { name: '0.75', exact: true }).click()
  await expect(radius.locator('.el-select')).toContainText('0.75')
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--custom-radius').trim()
      )
    )
    .toBe('0.75rem')
  const tabStyle = settings.locator('.setting-item-row').filter({ hasText: '标签页风格' })
  await tabStyle.locator('.el-select').click()
  await page.getByRole('option', { name: '卡片', exact: true }).click()
  await expect(tabStyle.locator('.el-select')).toContainText('卡片')
  await page.screenshot({
    path: testInfo.outputPath('settings-select-options.png'),
    animations: 'disabled'
  })
  await settings.getByRole('button', { name: '关闭界面设置', exact: true }).click()
  await expect(settings).toBeHidden()
  await expect(page.locator('body')).not.toHaveClass(/theme-change/)
  await expect(keyword).toHaveValue('NEW-FILTER')
  await page.clock.install()
  await page.keyboard.press('Control+k')
  const globalSearch = page.locator('.art-global-search-dialog')
  await expect(globalSearch).toBeVisible()
  await page.keyboard.press('Escape')
  await keyword.focus()
  await page.clock.runFor(200)
  await expect(globalSearch).toBeHidden()
  await expect(keyword).toBeFocused()
  await page.keyboard.press('Control+k')
  await page.clock.runFor(100)
  await expect(globalSearch.getByPlaceholder('搜索页面')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开用户菜单', exact: true }).click()
  const userMenu = page.locator('.user-menu-popover')
  await expect(userMenu).toBeVisible()
  await userMenu.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.clock.runFor(200)
  const logoutConfirmation = page.locator('.login-out-dialog')
  await expect(logoutConfirmation).toContainText('您是否要退出登录?')
  await logoutConfirmation.getByRole('button', { name: '取消', exact: true }).click()
  await page.clock.runFor(200)
  await expect(logoutConfirmation).toBeHidden()
  await expect(page.getByRole('heading', { name: '调拨申请单', exact: true })).toBeVisible()
  const requestsBeforeLanguageChange = filters.length
  const languageButton = page.getByRole('button', { name: '切换语言', exact: true })
  await languageButton.hover()
  await page.clock.runFor(300)
  await page.getByRole('menuitem', { name: 'English', exact: true }).click()
  await page.clock.runFor(100)
  await expect.poll(() => filters.length).toBeGreaterThan(requestsBeforeLanguageChange)
  const requestsAfterEnglish = filters.length
  await languageButton.hover()
  await page.clock.runFor(300)
  await page.getByRole('menuitem', { name: '简体中文', exact: true }).click()
  await page.clock.runFor(100)
  await expect.poll(() => filters.length).toBeGreaterThan(requestsAfterEnglish)
  await expect(page.getByRole('heading', { name: '调拨申请单', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开界面设置', exact: true }).click()
  await expect(settings).toBeVisible()
  await colorWeakSwitch.locator('..').click()
  await settings.getByRole('button', { name: '关闭界面设置', exact: true }).click()
  for (const mode of [!dark, dark]) {
    await page
      .getByRole('button', { name: mode ? '切换深色模式' : '切换浅色模式', exact: true })
      .click()
    await page.clock.runFor(100)
    await expect(page.locator('html')).toHaveClass(/color-weak/)
    if (mode) await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
  }
  await page.screenshot({
    path: testInfo.outputPath('theme-color-weak-preserved.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '打开界面设置', exact: true }).click()
  await settings.getByRole('button', { name: '系统主题', exact: true }).click()
  await settings.getByRole('button', { name: '关闭界面设置', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveClass(/color-weak/)
  expect(errors).toEqual([])
})
