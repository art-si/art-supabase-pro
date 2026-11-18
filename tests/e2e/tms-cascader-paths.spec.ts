import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ hasTouch: true, storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const regionLabels = ['新疆维吾尔自治区', '伊犁哈萨克自治州', '察布查尔锡伯自治县'] as const
const regionValue = regionLabels.join('/')
const regionText = regionLabels.join(' / ')

async function expectPopupWithinScreen(popup: Locator) {
  await expect(popup).toBeVisible()
  await expect
    .poll(() =>
      popup.evaluate((surface) => {
        const { left, right } = surface.getBoundingClientRect()
        return Math.max(
          -left,
          right - innerWidth,
          document.documentElement.scrollWidth - innerWidth
        )
      })
    )
    .toBeLessThanOrEqual(1)
}

async function openAddressFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 820 })
  await prepareIsolatedSession(page)
  const writes: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().endsWith('/tms_update_customer_address_secure')) {
      writes.push(route.request().postDataJSON().p_payload)
      return route.fulfill({ json: {} })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html')
  await page.getByRole('button', { name: '打开地址 half', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑常用地址' })
  const picker = dialog.locator('.art-address-picker .art-cascader')
  const region = picker.locator('input')
  await expect(region).toBeEnabled()
  return { dialog, picker, region, writes }
}

test('手机客户协议价可触控选择完整省市区而不撑宽页面', async ({ page }, info) => {
  await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'QA-REGION',
    customerName: '区划验收客户',
    enabled: true,
    tags: [],
    fieldAccess: {}
  }
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'tms_list_customers_secure')
      return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    return route.fulfill({
      json:
        name === 'tms_list_customer_prices_secure' ? { records: [], total: 0, fieldAccess: {} } : []
    })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html')
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '编辑客户' })
  await dialog.getByRole('tab', { name: '客户协议价', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 820 })
  await expect(page.locator('html')).toHaveClass(/dark/)

  const origin = dialog.locator('[data-art-form-item-key="originRegionPath"] .art-cascader')
  const originInput = origin.locator('input')
  await expect(originInput).toBeEnabled()
  await origin.tap()
  const popup = page.locator('.el-cascader__dropdown:visible')
  const panel = popup.locator('.el-cascader-panel')
  const menus = panel.locator('.el-cascader-menu')
  for (const [index, name] of regionLabels.slice(0, 2).entries()) {
    await expect(menus).toHaveCount(index + 1)
    await expectPopupWithinScreen(popup)
    await menus.nth(index).getByText(name, { exact: true }).tap()
  }

  await expect(menus).toHaveCount(3)
  await expectPopupWithinScreen(popup)
  const district = menus.last().getByRole('menuitem').filter({ hasText: regionLabels[2] })
  const districtLabel = district.getByText(regionLabels[2], { exact: true })
  await expect(districtLabel).toHaveCSS('white-space', 'nowrap')
  await expect(districtLabel).toBeInViewport({ ratio: 0.95 })
  await expect(district.locator('.el-radio__inner')).toBeInViewport({ ratio: 0.95 })

  // A trackpad can revisit earlier levels without moving the workspace.
  await panel.hover()
  await page.mouse.wheel(-700, 0)
  await expect.poll(() => panel.evaluate((element) => element.scrollLeft)).toBe(0)
  await expect(menus.first()).toBeInViewport({ ratio: 0.95 })
  await page.mouse.wheel(700, 0)
  await expect(districtLabel).toBeInViewport({ ratio: 0.95 })
  await page.screenshot({ path: info.outputPath('customer-price-region-390-dark.png') })

  await district.locator('.el-radio').tap()
  await expect(originInput).toHaveValue(regionText)
  await expect(origin).toHaveAttribute('title', regionText)
  const search = page.waitForRequest(
    (request) =>
      request.url().endsWith('/tms_list_customer_prices_secure') &&
      request.postDataJSON().p_origin_region === regionValue
  )
  await dialog.getByRole('button', { name: '查询', exact: true }).click()
  expect((await search).postDataJSON().p_customer_id).toBe(customer.id)
  await dialog.getByRole('button', { name: '重置', exact: true }).click()
  await expect(originInput).toHaveValue('')
  await expect(origin).not.toHaveAttribute('title', regionText)
})

test('常用地址可用键盘辨认完整地区建议并留存区划路径', async ({ page }, info) => {
  const { dialog, picker, region, writes } = await openAddressFixture(page)
  await region.fill(regionLabels[2])
  const popup = page.locator('.el-cascader__dropdown:visible')
  const suggestion = popup.locator('.el-cascader__suggestion-item').filter({ hasText: regionText })
  await expect(suggestion).toHaveCount(1)
  await expectPopupWithinScreen(popup)
  const text = suggestion.getByText(regionText, { exact: true })
  await expect(text).toHaveCSS('white-space', 'nowrap')
  await expect
    .poll(() => text.evaluate((line) => line.closest('[title]')?.getAttribute('title')))
    .toBe(regionText)

  await region.press('ArrowDown')
  await expect(suggestion).toBeFocused()
  await popup.screenshot({ path: info.outputPath('address-region-keyboard-390.png') })
  await page.keyboard.press('Enter')
  await expect(region).toHaveValue(regionText)
  await expect(picker).toHaveAttribute('title', regionText)
  await expect(popup).toHaveCount(0)
  expect(writes).toEqual([])
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '保存地址', exact: true }).click()
  await expect.poll(() => writes.at(-1)?.region).toBe(regionValue)
})

test('常用地址回显旧上海区划且未改地区仍按原路径保存', async ({ page }, info) => {
  const { dialog, picker, region, writes } = await openAddressFixture(page)
  const storedRegion = '上海市/上海市/黄浦区'
  const displayedRegion = '上海市 / 市辖区 / 黄浦区'

  await expect(region).toHaveValue(displayedRegion)
  await expect(picker).toHaveAttribute('title', displayedRegion)
  await picker.screenshot({ path: info.outputPath('legacy-address-region-390.png') })

  await region.click()
  const popup = page.locator('.el-cascader__dropdown:visible')
  await expectPopupWithinScreen(popup)
  const district = popup.getByRole('menuitem').filter({ hasText: '黄浦区' })
  await expect(district.getByRole('radio')).toBeChecked()
  await region.press('Escape')
  await expect(popup).toHaveCount(0)

  expect(writes).toEqual([])
  await dialog.getByRole('button', { name: '保存地址', exact: true }).click()
  await expect.poll(() => writes.at(-1)?.region).toBe(storedRegion)
  await expect(dialog).toBeHidden()
})
