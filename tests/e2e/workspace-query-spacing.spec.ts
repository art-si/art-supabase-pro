import { expect, test, type Locator, type Page } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { expectInputTextUnclipped } from './support/input-text-width'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectQueryLabelLayout } from './support/query-label-layout'
import {
  expectQueryDateRangeReadable,
  installQueryDateClock,
  selectQueryDateRange
} from './support/query-date-range'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: [],
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
    })
  )
})

async function setAppearance(page: Page, width: number, theme: string, box: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await page.evaluate(
    ({ theme, box }) => {
      document.documentElement.dataset.uiScope = 'workspace'
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.dataset.boxMode = box
    },
    { theme, box }
  )
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
}

async function expectGap(before: Locator, after: Locator, expected = 12) {
  await expect(async () => {
    const previous = await before.boundingBox()
    const next = await after.boundingBox()
    expect(previous).not.toBeNull()
    expect(next).not.toBeNull()
    expect(next!.y - previous!.y - previous!.height).toBeCloseTo(expected, 0)
  }).toPass({ timeout: 5_000 })
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
}

for (const { width, height, appearance } of [
  { width: 390, height: 844, appearance: { theme: 'dark', boxBorderMode: false } },
  { width: 1440, height: 900, appearance: { theme: 'light', boxBorderMode: true } }
] as const) {
  test(`真实挂车键盘切换专注模式时交接焦点并保留筛选内容（${width}px）`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    await prepareAppearance(page, appearance)
    await page.goto('/tests/e2e/fixtures/workspace-query-spacing.html?entry=trailer')
    const header = page.locator('.business-workspace-header')
    const workspace = page.locator('.art-table-query')
    const enter = header.getByRole('switch', { name: '进入专注模式', exact: true })
    const exit = workspace.getByRole('button', { name: '退出专注模式', exact: true })
    const plate = workspace.getByRole('textbox', { name: '车牌号', exact: true })
    const exitIndicator = () =>
      exit.evaluate((button) => {
        const { boxShadow, outline } = getComputedStyle(button)
        return { boxShadow, outline }
      })
    await expect(plate).toBeVisible({ timeout: 45_000 })
    await assertAppearance(page, appearance)

    await enter.press('Space')
    await expect(header).toBeHidden()
    await expect(exit).toBeFocused()
    expect(await exit.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
    await workspace.screenshot({
      path: info.outputPath(`trailer-focus-keyboard-${width}.png`),
      animations: 'disabled'
    })
    const focusedIndicator = await exitIndicator()
    await exit.press('Enter')
    await expect(enter).toBeFocused()

    await enter.press('Space')
    await expect(exit).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(enter).toBeFocused()

    await enter.press('Space')
    await expect(exit).toBeFocused()
    await plate.fill('测A12345')
    await expect.poll(exitIndicator).not.toEqual(focusedIndicator)
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await expect(plate).toBeFocused()
    await expect(plate).toHaveValue('测A12345')
  })
}

test('真实挂车查询卡上下间距、单层卡片和专注恢复在 workspace 各模式一致', async ({
  page
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/workspace-query-spacing.html?entry=trailer')
  const header = page.locator('.business-workspace-header')
  const search = page.locator('.art-table-query__search-scrollbar')
  const table = page.locator('.art-table-card')
  await expect(header).toBeVisible()
  await expect(table).toBeVisible()
  await expect(page.getByText('暂无挂车档案', { exact: true })).toBeVisible()
  const surfaceShadows = new Map<string, string>()

  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const box of ['border-mode', 'shadow-mode']) {
        await setAppearance(page, width, theme, box)
        await expectGap(header, search)
        await expectGap(search, table)
        const surface = await search.evaluate((element) => {
          const style = getComputedStyle(element)
          const form = element.querySelector('.art-search-bar')!
          const inner = getComputedStyle(form)
          const bounds = element.getBoundingClientRect()
          const clippingAncestors: string[] = []
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent)
            const rect = parent.getBoundingClientRect()
            if (
              /(hidden|clip|auto|scroll)/.test(parentStyle.overflow) &&
              (rect.left > bounds.left - 4 ||
                rect.right < bounds.right + 4 ||
                rect.top > bounds.top - 4 ||
                rect.bottom < bounds.bottom + 4)
            ) {
              clippingAncestors.push(parent.className)
            }
          }
          return {
            shadow: style.boxShadow,
            innerShadow: inner.boxShadow,
            innerBorder: inner.borderTopWidth,
            clippingAncestors
          }
        })
        expect(surface.innerShadow).toBe('none')
        expect(surface.innerBorder).toBe('0px')
        expect(surface.clippingAncestors).toEqual([])
        if (box === 'shadow-mode') {
          expect(surface.shadow).not.toBe('none')
          expect(surface.shadow).not.toBe(surfaceShadows.get(`${width}-${theme}`))
        } else {
          surfaceShadows.set(`${width}-${theme}`, surface.shadow)
        }
        await expectNoHorizontalOverflow(page)
        await page.screenshot({
          path: info.outputPath(`trailer-${width}-${theme}-${box}.png`),
          fullPage: true
        })
      }
    }
  }

  await setAppearance(page, 900, 'dark', 'shadow-mode')
  await expectGap(header, search)
  await expectGap(search, table)
  // A token change must affect both boundaries once, with no additional page margins.
  await page
    .locator('html')
    .evaluate((element) => element.style.setProperty('--art-page-gap', '20px'))
  await expectGap(header, search, 20)
  await expectGap(search, table, 20)
  await page.locator('html').evaluate((element) => element.style.removeProperty('--art-page-gap'))
  await expectGap(header, search)
  await expectGap(search, table)

  await page.getByRole('switch', { name: '显示表格右侧工具栏', exact: true }).locator('..').click()
  await page.route('**/rest/v1/rpc/vms_list_trailers_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: 'spacing-trailer',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            plate_no: '测A-间距回归',
            trailer_type: '标准挂车',
            status: 'active'
          }
        ],
        total: 1
      }
    })
  )
  await page.getByRole('button', { name: '刷新表格', exact: true }).click()
  await expect(page.locator('.el-table__body-wrapper').getByText('测A-间距回归')).toBeVisible()
  await page.getByRole('button', { name: '收起搜索条件', exact: true }).click()
  await expect(search).toBeHidden()
  await expectGap(header, table)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(header).toBeHidden()
  await expect(search).toBeHidden()
  await expect(table).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()
  await expect(search).toBeHidden()
  await expectGap(header, table)

  await page.getByRole('button', { name: '展开搜索条件', exact: true }).click()
  await expectGap(header, search)
  await expectGap(search, table)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(header).toBeHidden()
  await expect(search).toBeVisible()
  await expectGap(search, table)
  await expect(page.locator('.el-pagination')).toBeVisible()
  expect((await table.boundingBox())!.height).toBeGreaterThan(200)
  await page.screenshot({
    path: info.outputPath('trailer-900-dark-shadow-focus.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(header).toBeVisible()
  await expectGap(header, search)
  await expectGap(search, table)
  await expectNoHorizontalOverflow(page)
  expect(errors).toEqual([])
})

const vehicleInsuranceListEndpoint = '**/rpc/vms_list_vehicle_insurance_secure*'

async function openVehicleInsuranceQuery(page: Page): Promise<Locator> {
  await page.route(vehicleInsuranceListEndpoint, (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: '11111111-1111-4111-8111-111111111118',
            plateNo: '沪A71234',
            companyName: '测试运输公司',
            commercialPolicyNo: 'COMMERCIAL-TEST',
            compulsoryPolicyNo: 'COMPULSORY-TEST'
          }
        ],
        total: 1,
        fieldAccess: { policyNumbers: 'read' }
      }
    })
  )
  await installQueryDateClock(page)
  await page.goto('/tests/e2e/fixtures/workspace-query-spacing.html?entry=insurance')
  return page.locator('.vehicle-insurance-page')
}

test('真实车辆保险的三个日期范围在窄屏完整显示并保留专注状态', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const workspace = await openVehicleInsuranceQuery(page)
  await setAppearance(page, 1280, 'light', 'border-mode')
  const search = workspace.locator('.art-search-bar')
  const ranges = ['commercialExpireDateRange', 'compulsoryExpireDateRange', 'createTimeRange'].map(
    (key) => search.locator(`[data-art-form-item-key="${key}"]`)
  )
  await expect(workspace.getByText('沪A71234', { exact: true })).toBeVisible()
  await expect(search.getByText('所属公司', { exact: true })).toBeVisible()
  await expect(search.getByText('车牌号', { exact: true })).toBeVisible()
  await expect(search.getByText('商业险单号', { exact: true })).toBeVisible()
  await search.getByRole('button', { name: '展开', exact: true }).click()
  for (const range of ranges) await selectQueryDateRange(range)

  for (const appearance of [
    { width: 1280, theme: 'light', box: 'border-mode' },
    { width: 390, theme: 'dark', box: 'shadow-mode' }
  ]) {
    await setAppearance(page, appearance.width, appearance.theme, appearance.box)
    for (const range of ranges) await expectQueryDateRangeReadable(range)
    await expect(workspace.locator('.el-pagination')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await search.screenshot({
      path: info.outputPath(`insurance-date-ranges-${appearance.width}.png`)
    })
  }

  await setAppearance(page, 900, 'dark', 'shadow-mode')
  await assertTableFocusContract(page, info)
  for (const range of ranges) await expectQueryDateRangeReadable(range)
  expect(errors).toEqual([])
})

test('真实车辆保险收起后可识别、查询和重置已填高级日期', async ({ page }, info) => {
  const workspace = await openVehicleInsuranceQuery(page)
  await setAppearance(page, 1280, 'light', 'border-mode')
  await expect(workspace.getByText('沪A71234', { exact: true })).toBeVisible()
  const search = workspace.locator('.art-search-bar')
  const range = search.locator('[data-art-form-item-key="commercialExpireDateRange"]')
  const expand = search.getByRole('button', { name: '展开', exact: true })
  const expandWithFilter = search.getByRole('button', { name: /展开.*已应用\s*1\s*项/ })
  const collapse = search.getByRole('button', { name: '收起', exact: true })
  const query = search.getByRole('button', { name: '查询', exact: true })
  const reset = search.getByRole('button', { name: '重置', exact: true })
  const dateFilter = {
    p_commercial_expire_from: '2026-11-07',
    p_commercial_expire_to: '2026-11-10'
  }
  const submit = async (action: Locator): Promise<unknown> => {
    const [response] = await Promise.all([
      page.waitForResponse(vehicleInsuranceListEndpoint),
      action.click()
    ])
    expect(response.ok()).toBe(true)
    return response.request().postDataJSON()
  }

  await expand.click()
  await selectQueryDateRange(range)
  await expectQueryDateRangeReadable(range)
  await collapse.click()
  await expect(range).toBeHidden()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(expandWithFilter).toHaveCount(0)

  await expand.click()
  await expectQueryDateRangeReadable(range)
  expect(await submit(query)).toMatchObject(dateFilter)
  await collapse.click()
  await expect(range).toBeHidden()

  await setAppearance(page, 390, 'dark', 'shadow-mode')
  await expect(expandWithFilter).toBeVisible()
  await expect(expandWithFilter).toHaveAttribute('aria-expanded', 'false')
  await expect(expandWithFilter).toContainText(/[1一]/)
  await expectNoHorizontalOverflow(page)
  await search.screenshot({ path: info.outputPath('insurance-collapsed-active-filter-390.png') })
  expect(await submit(query)).toMatchObject(dateFilter)

  await page.route(
    vehicleInsuranceListEndpoint,
    (route) => route.fulfill({ status: 503, json: { message: 'isolated list error' } }),
    { times: 1 }
  )
  await query.click()
  await expect(workspace.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(expand).toBeVisible()
  await expect(expandWithFilter).toHaveCount(0)

  await page.route(
    vehicleInsuranceListEndpoint,
    (route) =>
      route.fulfill({ json: { records: [], total: 0, fieldAccess: { policyNumbers: 'read' } } }),
    { times: 1 }
  )
  expect(
    await submit(workspace.getByRole('button', { name: '重新加载', exact: true }))
  ).toMatchObject(dateFilter)
  await expect(workspace.getByText('数据加载失败', { exact: true })).toHaveCount(0)
  await expect(expandWithFilter).toBeVisible()

  await expandWithFilter.focus()
  await page.keyboard.press('Enter')
  await expect(collapse).toBeFocused()
  await expectQueryDateRangeReadable(range)
  const editor = range.locator('.el-range-editor')
  await editor.hover()
  await editor.locator('.el-range__close-icon:not(.el-range__close-icon--hidden)').click()
  await expect(range.getByPlaceholder('开始日期')).toHaveValue('')
  await collapse.click()
  // Clearing the draft does not change the conditions used by the current table results.
  await expect(expandWithFilter).toBeVisible()
  expect(await submit(reset)).toMatchObject({
    p_commercial_expire_from: null,
    p_commercial_expire_to: null
  })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(expandWithFilter).toHaveCount(0)

  await expand.click()
  await expect(range.getByPlaceholder('开始日期')).toHaveValue('')
  await expect(range.getByPlaceholder('结束日期')).toHaveValue('')
})

for (const entry of ['project', 'operation']) {
  test(`真实 WMS ${entry} 工作区相邻区块不叠加页面间距`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/workspace-query-spacing.html?entry=${entry}`)
    const header = page.locator('.business-workspace-header')
    await expect(header).toBeVisible()
    const content = header.locator('xpath=following-sibling::*[1]')
    await expect(content).toBeVisible()
    for (const appearance of [
      { width: 900, theme: 'dark', box: 'shadow-mode' },
      { width: 390, theme: 'light', box: 'border-mode' }
    ]) {
      await setAppearance(page, appearance.width, appearance.theme, appearance.box)
      await expectGap(header, content)
      if (entry === 'project') {
        await expectGap(content, content.locator('xpath=following-sibling::*[1]'))
      }
      await expectNoHorizontalOverflow(page)
      await page.screenshot({
        path: info.outputPath(
          `${entry}-${appearance.width}-${appearance.theme}-${appearance.box}.png`
        ),
        fullPage: true
      })
    }
    expect(errors).toEqual([])
  })
}

const longQueryLabels = [
  {
    entry: 'insurance-company',
    label: '保险公司名称',
    key: 'companyName',
    endpoint: '**/rest/v1/mdm_insurance_company?*',
    parameter: 'company_name',
    urlFilter: true
  },
  {
    entry: 'supplier',
    label: '供应厂商名称',
    key: 'supplierName',
    endpoint: '**/rest/v1/rpc/vms_list_vehicle_suppliers_secure',
    parameter: 'p_supplier_name'
  },
  {
    entry: 'alert-center',
    label: '合同编号/名称',
    key: 'keyword',
    endpoint: '**/rest/v1/rpc/tms_list_contract_alerts_secure',
    parameter: 'p_keyword'
  }
]

for (const [entry, label] of [
  ['fms-account-set', '关键字'],
  ['fms-accounting-subject', '会计科目'],
  ['fms-accounting-currency', '汇率记录'],
  ['fms-accounting-auxiliary', '核算项目'],
  ['fms-opening-balance', '会计科目']
] as const) {
  test(`财务查询标签与输入框对齐 ${entry}`, async ({ page }, info) => {
    await page.route(/\/rest\/v1\/rpc\/fms_list_account_set(?:s|_options)_secure$/, (route) =>
      route.fulfill({ json: { records: [], total: 0 } })
    )
    await page.route('**/rest/v1/rpc/fms_get_account_set_overview_secure', (route) =>
      route.fulfill({ json: { totalCount: 0, activeCount: 0, draftCount: 0, suspendedCount: 0 } })
    )
    const appearance = { theme: 'light', boxBorderMode: true } as const
    await prepareAppearance(page, appearance)
    await page.goto(`/tests/e2e/fixtures/workspace-query-spacing.html?entry=${entry}`, {
      waitUntil: 'domcontentloaded'
    })
    const search = page.locator('.art-search-bar:visible')
    const field = search.locator('[data-art-form-item-key="keyword"]')
    await expect(field.getByRole('textbox', { name: label, exact: true })).toBeVisible({
      timeout: 45_000
    })
    await assertAppearance(page, appearance)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await field.scrollIntoViewIfNeeded()
      await search.screenshot({
        path: info.outputPath(`${entry}-query-${width}.png`),
        animations: 'disabled'
      })
      await expectQueryLabelLayout(field)
      await expect(search.getByRole('button', { name: '查询', exact: true })).toBeVisible()
      await expect(search.getByRole('button', { name: '重置', exact: true })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  })
}

for (const item of longQueryLabels) {
  test(`真实查询标签「${item.label}」在宽窄布局中完整且与输入框对齐`, async ({ page }, info) => {
    const received: unknown[] = []
    await page.route(item.endpoint, (route) => {
      const request = route.request()
      if (item.urlFilter) {
        received.push(new URL(request.url()).searchParams.get(item.parameter))
        return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
      }
      received.push(request.postDataJSON()?.[item.parameter])
      return route.fulfill({
        json: { records: [], total: 0, fieldAccess: { contactDetails: 'read' } }
      })
    })
    await page.goto(`/tests/e2e/fixtures/workspace-query-spacing.html?entry=${item.entry}`, {
      waitUntil: 'domcontentloaded'
    })
    const search = page.locator('.art-search-bar')
    const field = search.locator(`[data-art-form-item-key="${item.key}"]`)
    const input = field.getByRole('textbox', { name: item.label, exact: true })
    await expect(input).toBeVisible()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    for (const [width, theme, box] of [
      [1440, 'light', 'border-mode'],
      [390, 'dark', 'shadow-mode']
    ] as const) {
      await setAppearance(page, width, theme, box)
      await field.scrollIntoViewIfNeeded()
      await search.screenshot({
        path: info.outputPath(`${item.entry}-${width}.png`),
        animations: 'disabled'
      })
      const geometry = await expectQueryLabelLayout(field)
      await info.attach(`${item.entry}-${width}-label-geometry`, {
        body: JSON.stringify(geometry),
        contentType: 'application/json'
      })
      if (item.entry === 'alert-center') {
        const dates = search.locator('[data-art-form-item-key="dueRange"] .el-range-input')
        await expect(dates).toHaveCount(2)
        await expectInputTextUnclipped(dates, 'placeholder')
      }
      await expectNoHorizontalOverflow(page)
    }

    const value = '查询样本'
    await input.fill(value)
    await input.press('Enter')
    await expect.poll(() => received.at(-1)).toBe(item.urlFilter ? `ilike.%${value}%` : value)
    await search.getByRole('button', { name: '重置', exact: true }).click()
    await expect(input).toBeEmpty()
  })
}
