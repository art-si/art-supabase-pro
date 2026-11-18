import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('开单在窄屏按实际站点编码区分同区同名发货站', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const stationName = '验收国际联运综合仓配华东区域多式联运集散中心临港发货站'
  const regionCode = '310115'
  const stations = [
    { id: 'station-1', stationCode: 'QA-ST-001', stationName },
    { id: 'station-2', stationCode: 'QA-ST-002', stationName },
    { id: 'station-no-code', stationCode: '  ', stationName: '历史无编号站' }
  ].map((station) => ({ ...station, stationType: 'shipping', regionCode }))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (
      url.pathname.endsWith('/mdm_station') &&
      url.searchParams.get('stationRoleFilter.role_type') === 'eq.shipping'
    ) {
      return route.fulfill({
        json: stations,
        headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' }
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/order-numeric.html?role=ordinary')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()
  const field = page.locator('[data-art-form-item-key="originStationId"]')
  const editor = field.getByRole('combobox')
  await editor.press('ArrowDown')
  const options = page.getByRole('option').filter({ hasText: stationName })
  await expect(options).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('same-name-shipping-stations-390.png') })
  const codes = stations.slice(0, 2).map(({ stationCode }) => stationCode)
  const readableCodes = await options.evaluateAll(
    (items, codes) =>
      items.map((item, index) => {
        const label = item.querySelector('span')?.firstChild
        if (!(label instanceof Text)) return false
        const offset = label.data.indexOf(codes[index])
        if (offset < 0) return false
        const code = new Range()
        code.setStart(label, offset)
        code.setEnd(label, offset + codes[index].length)
        const right =
          item.getBoundingClientRect().right -
          Number.parseFloat(getComputedStyle(item).paddingRight)
        return code.getBoundingClientRect().right <= Math.min(right, innerWidth)
      }),
    codes
  )
  expect(readableCodes).toEqual([true, true])
  await expect(page.getByRole('option', { name: `历史无编号站（${regionCode}）` })).toBeVisible()

  const station = stations[1]
  const selectedLabel = `${station.stationCode} · ${stationName}（${regionCode}）`
  await editor.fill(station.stationCode)
  await expect(options).toHaveCount(1)
  await editor.press('ArrowDown')
  await editor.press('Enter')
  await expect(editor).toBeFocused()
  await expect(field.locator('.el-select__placeholder:not(.is-transparent) span')).toHaveAttribute(
    'title',
    selectedLabel
  )
  await editor.press('ArrowDown')
  await expect(page.getByRole('option', { name: selectedLabel, selected: true })).toBeVisible()
  await editor.press('Escape')
  await expect(editor).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('开单完整表单在桌面和窄屏的深浅主题下保持可用', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        tmsOrderTransportMode: [['road', '公路运输']],
        tmsOrderDeliveryMethod: [['door', '送货上门']]
      }
      return route.fulfill({
        json: (labels[code || ''] || []).map(([value, label], index) => ({
          id: `${code}-${index}`,
          code: value,
          label,
          value,
          sort: index,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()
  await expect(page.locator('.order-open__section--route')).toBeVisible()
  const addWaypoint = page.getByRole('button', { name: /添加途经点/ })
  await expect(addWaypoint).toBeVisible()
  await addWaypoint.click()
  await expect(page.getByText('途经点', { exact: true })).toBeVisible()

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`order-open-top-${viewport.width}-${theme}.png`),
        animations: 'disabled'
      })
      const note = page.getByPlaceholder('请输入订单备注')
      await note.click()
      await expect
        .poll(() =>
          page.evaluate(() => {
            const input = document.querySelector<HTMLTextAreaElement>(
              'textarea[placeholder="请输入订单备注"]'
            )
            const footer = document.querySelector<HTMLElement>('.order-open__footer')
            return input && footer
              ? input.getBoundingClientRect().bottom - footer.getBoundingClientRect().top
              : Number.POSITIVE_INFINITY
          })
        )
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`order-open-bottom-${viewport.width}-${theme}.png`),
        animations: 'disabled'
      })
      await page.evaluate(() => window.scrollTo(0, 0))
    }
  }
  expect(errors).toEqual([])
})
