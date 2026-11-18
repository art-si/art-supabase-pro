import { expect, test } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { installDictionaryOptions } from './support/dictionary-options'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('常用地址的地址类型在 1920px 单行显示并按所选类型查询', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 878 })
  await prepareIsolatedSession(page, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformSuper: false
  })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  await installDictionaryOptions(page, {
    tmsAddressType: [
      { value: 'shipping', label: '发货地址' },
      { value: 'receiving', label: '收货地址' }
    ]
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'tms', name: 'TMS智慧运输', baseUrl: '/tms/' }] })
  )
  const columnRuntime = '**/rest/v1/rpc/get_table_column_runtime'
  const fallbackNotice = '已使用前端默认列'
  await page.addInitScript((notice) => {
    const observer = new MutationObserver(() => {
      const titles = [...document.querySelectorAll('.el-notification__title')]
      if (!titles.some((title) => title.textContent?.trim() === notice)) return
      document.documentElement.dataset.columnFallbackNoticeSeen = 'true'
      observer.disconnect()
    })
    observer.observe(document, { childList: true, characterData: true, subtree: true })
  }, fallbackNotice)
  await page.route(columnRuntime, (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'PGRST000', message: 'isolated column configuration outage' }
    })
  )
  const path = '/tms/basic-data/customer-address'
  await mockApplicationMenus(page, {
    tms: [
      {
        id: 'tms-customer-address',
        parentId: null,
        name: 'TmsCustomerAddress',
        path,
        component: `${path}/index`,
        type: 'menu',
        sort: 1,
        meta: { title: '常用地址', is_enable: true, is_hide: false, roles: [] }
      }
    ]
  })
  const requests: Array<{ p_address_type: string | null; p_keyword: string | null }> = []
  await page.route('**/rest/v1/rpc/tms_list_customer_addresses_secure', (route) => {
    const { p_address_type, p_keyword } = route.request().postDataJSON()
    requests.push({ p_address_type, p_keyword })
    return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
  })
  const unavailableColumns = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/get_table_column_runtime') && response.status() === 503,
    { timeout: 90_000 }
  )
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '常用地址', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await unavailableColumns
  await expect(page.getByRole('columnheader', { name: '地址简称', exact: true })).toBeVisible()
  await expect(page.getByText(fallbackNotice, { exact: true })).toHaveCount(0)
  const field = page.locator('[data-art-form-item-key="addressType"]')
  const group = field.getByRole('radiogroup')
  await expect(group.locator('.el-segmented__item-label')).toHaveText(
    ['全部', '发货地址', '收货地址'],
    { timeout: 30_000 }
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  const measureAddressTypes = () =>
    field.evaluate((element) => {
      const fieldLabel = element.querySelector('.el-form-item__label')!
      const content = element.querySelector('.art-form-item__content')!
      const contentBounds = content.getBoundingClientRect()
      const segmented = element.querySelector('.el-segmented')!
      const centerY = ({ top, height }: DOMRect) => top + height / 2
      const items = Array.from(segmented.querySelectorAll('.el-segmented__item'), (item) => {
        const label = item.querySelector('.el-segmented__item-label')!
        const range = document.createRange()
        range.selectNodeContents(label)
        const textRects = Array.from(range.getClientRects())
        const text = range.getBoundingClientRect()
        const option = item.getBoundingClientRect()
        const labelBox = label.getBoundingClientRect()
        return {
          label: label.textContent?.trim(),
          lines: textRects.length,
          width: text.width,
          labelWidth: labelBox.width,
          fits: text.left >= labelBox.left - 1 && text.right <= labelBox.right + 1,
          visible: text.left >= contentBounds.left - 1 && text.right <= contentBounds.right + 1,
          centerY: centerY(option),
          textOffset: Math.abs(centerY(option) - centerY(text)),
          radius: getComputedStyle(item).borderTopLeftRadius
        }
      })
      const selected = segmented.querySelector('.el-segmented__item-selected')!
      return {
        viewport: innerWidth,
        overflow: content.scrollWidth - content.clientWidth,
        fieldLabelAlignment: getComputedStyle(fieldLabel).textAlign,
        fieldLabelOffset: Math.abs(
          centerY(fieldLabel.getBoundingClientRect()) - centerY(segmented.getBoundingClientRect())
        ),
        groupRadius: getComputedStyle(segmented).borderTopLeftRadius,
        selectedRadius: getComputedStyle(selected).borderTopLeftRadius,
        items
      }
    })
  const geometry = await measureAddressTypes()
  await info.attach('address-type geometry', {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json'
  })
  console.log(JSON.stringify(geometry))
  expect(geometry.viewport).toBe(1920)
  expect(geometry.fieldLabelAlignment).toBe('right')
  expect(geometry.fieldLabelOffset).toBeLessThanOrEqual(1)
  expect(Number.parseFloat(geometry.groupRadius)).toBeGreaterThan(0)
  for (const item of geometry.items) {
    expect(item.lines, item.label).toBe(1)
    expect(item.fits, item.label).toBe(true)
    expect(item.textOffset, item.label).toBeLessThanOrEqual(2)
    expect(Math.abs(item.centerY - geometry.items[0].centerY), item.label).toBeLessThanOrEqual(1)
    expect(item.radius, item.label).toBe(geometry.selectedRadius)
    expect(Number.parseFloat(item.radius), item.label).toBeGreaterThan(0)
  }
  for (const [name, type] of [
    ['发货地址', 'shipping'],
    ['收货地址', 'receiving']
  ] as const) {
    const option = group.getByRole('radio', { name, exact: true })
    await option.locator('..').click()
    await expect(option).toBeChecked()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => requests.at(-1)?.p_address_type).toBe(type)
  }
  await expect(page.getByRole('columnheader', { name: '地址简称', exact: true })).toBeVisible()
  const search = page.locator('.art-table-query .art-search-bar')
  const keyword = search.getByRole('textbox', { name: '关键词', exact: true })
  const measureKeyword = () =>
    keyword.evaluate((input: HTMLInputElement) => {
      const field = getComputedStyle(input)
      const text = getComputedStyle(input, '::placeholder')
      const owner = input.closest('.el-form-item')
      const label = owner?.querySelector('.el-form-item__label')?.getBoundingClientRect()
      const control = input.closest('.el-input')?.getBoundingClientRect()
      const canvas = document.createElement('canvas').getContext('2d')
      if (!label || !control || !canvas) throw new Error('无法测量地址查询提示')
      canvas.font = `${text.fontStyle} ${text.fontWeight} ${text.fontSize} ${text.fontFamily}`
      const letterSpacing = Number.parseFloat(text.letterSpacing) || 0
      return {
        available:
          input.clientWidth - parseFloat(field.paddingLeft) - parseFloat(field.paddingRight),
        required:
          canvas.measureText(input.placeholder).width + letterSpacing * input.placeholder.length,
        labelOffset: Math.abs((label.top + label.bottom - control.top - control.bottom) / 2)
      }
    })
  expect((await measureKeyword()).labelOffset).toBeLessThanOrEqual(1)
  await search.screenshot({ path: info.outputPath('tms-address-type-1920.png') })

  await page.setViewportSize({ width: 320, height: 844 })
  await expect(keyword).toBeEmpty()
  await expect(keyword).toHaveAttribute('placeholder', '地址/收发方/姓名')
  await keyword.scrollIntoViewIfNeeded()
  const narrowTypes = await measureAddressTypes()
  expect(narrowTypes.overflow).toBeLessThanOrEqual(1)
  expect(narrowTypes.fieldLabelOffset).toBeLessThanOrEqual(1)
  for (const item of narrowTypes.items) {
    expect(item.lines, item.label).toBe(1)
    expect(item.visible, item.label).toBe(true)
    expect(item.textOffset, item.label).toBeLessThanOrEqual(2)
  }
  const placeholder = await measureKeyword()
  expect(placeholder.available).toBeGreaterThanOrEqual(placeholder.required)
  expect(placeholder.labelOffset).toBeLessThanOrEqual(1)
  await search.screenshot({ path: info.outputPath('tms-address-keyword-320.png') })

  const street = '示例工业园区西门12号'
  await keyword.fill(street)
  await keyword.press('Enter')
  await expect
    .poll(() => requests.at(-1))
    .toEqual({
      p_address_type: 'receiving',
      p_keyword: street
    })
  await expect(page.getByText(fallbackNotice, { exact: true })).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveAttribute('data-column-fallback-notice-seen', 'true')
})
