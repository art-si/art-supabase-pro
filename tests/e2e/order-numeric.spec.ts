import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)
test('开单费用输入使用公共数值规范化后正确汇总', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const dictionaries: Record<string, [string, string][]> = {
    commonBoolean: [
      ['是', 'true'],
      ['否', 'false']
    ],
    tmsOrderLoadType: [
      ['零担', 'ltl'],
      ['整车', 'ftl']
    ],
    tmsOrderCargoCategory: [['普通货物', 'general']],
    tmsOrderPackaging: [['散装', 'bulk']],
    tmsCargoUnit: [['件', 'piece']],
    tmsOrderDeliveryMethod: [['送货上门', 'door']],
    tmsOrderTransportMode: [['公路运输', 'road']],
    tmsOrderPaymentMethod: [['到付', 'collect']],
    tmsOrderTransportRequirement: [['易碎', 'fragile']]
  }
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const isUnitOptions = url.pathname.endsWith('/rpc/material_unit_compatibility_options')
    const code = isUnitOptions
      ? route.request().postDataJSON().p_source_code
      : (url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '') ?? '')
    return route.fulfill({
      json:
        url.pathname.endsWith('/sys_dictionary') || isUnitOptions
          ? [...(dictionaries[code] ?? []), ['已停用选项', 'disabled-option']].map(
              ([label, value], index) => ({
                id: `${code}-${index}`,
                code: value,
                label,
                value,
                status: value === 'disabled-option' ? '0' : '1',
                sort: index,
                dict_type_table: { code, name: code }
              })
            )
          : []
    })
  })
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '完整表单', exact: true })).toBeChecked()
  const delivery = page
    .locator('.el-form-item')
    .filter({ has: page.getByText('配送方式', { exact: true }) })
  await expect(delivery.getByText('送货上门', { exact: true })).toBeVisible()
  await delivery.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: '送货上门', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '已停用选项', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page
    .locator('.order-open__section--route')
    .screenshot({ path: info.outputPath('route.png') })
  const payment = page
    .locator('.el-form-item')
    .filter({ has: page.getByText('付款方式', { exact: true }) })
  await expect(payment.getByRole('radio', { name: '到付', exact: true })).toBeChecked()
  await expect(payment.getByRole('radio', { name: '已停用选项', exact: true })).toHaveCount(0)
  const pickup = page
    .locator('.el-form-item')
    .filter({ has: page.getByText('是否自提', { exact: true }) })
  await expect(pickup.getByRole('radio', { name: '否', exact: true })).toBeChecked()
  await pickup.getByText('是', { exact: true }).click()
  await expect(pickup.getByRole('radio', { name: '是', exact: true })).toBeChecked()
  await page.locator('.order-config').screenshot({ path: info.outputPath('config.png') })
  const cargoUnit = page.getByRole('combobox', { name: '计量单位', exact: true })
  await cargoUnit.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'center' })
  )
  await page.locator('.el-select').filter({ has: cargoUnit }).locator('.el-select__wrapper').click()
  await expect(page.getByRole('option', { name: '件', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '已停用选项', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '件', exact: true }).click()
  const fee = page
    .locator('.el-form-item')
    .filter({ has: page.getByText('配送费', { exact: true }) })
    .getByRole('spinbutton')
  await fee.fill('12.5')
  await fee.press('Tab')
  const total = page.getByText('应收运费合计', { exact: true }).locator('..')
  await expect(total).toContainText('12.5')
  await fee.fill('0')
  await fee.press('Tab')
  await expect(total).toContainText('￥0')
  expect(errors).toEqual([])
  await total.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('order.png'), fullPage: true })
})
