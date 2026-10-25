import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const kind of ['customer', 'carrier', 'contract']) {
  test(`${kind}详情复用公共格式化并保留精度和掩码`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (!/tms_get_(customer_price|carrier_price|contract)_secure$/.test(path)) {
        return route.fulfill({ json: [] })
      }
      await route.fulfill({
        json: {
          id: 'format-test',
          tenant_id: '11111111-1111-4111-8111-111111111111',
          contract_name: '格式化测试合同',
          contract_no: 'FORMAT-001',
          contract_status: 'draft',
          contract_amount: '***',
          transport_unit_price: 0,
          road_consumption_rate: 12.345678,
          loss_deduction_price: null,
          total_fee: '***',
          customer: { customer_name: '格式化测试客户', customer_code: 'C-001' },
          carrier: { company_name: '格式化测试承运商', carrier_code: 'T-001' },
          origin_region: '测试始发地',
          destination_region: '测试目的地',
          agreed_transport_quantity: 1234.56789,
          cargo_quantity_total: 0,
          cargo_volume_total: 1234.567,
          cargo_weight_total: null,
          create_time: '2026-10-09T00:30:00+08:00',
          field_access: {
            total_fee: 'masked',
            quote_amounts: 'masked',
            cost_amounts: 'read',
            transport_details_pricing: 'read',
            contract_amount: 'masked',
            transport_unit_price: 'read',
            road_consumption_rate: 'read',
            loss_deduction_price: 'read'
          },
          cargo_items: [
            {
              id: 'cargo-test',
              cargo_name: '零值及脱敏测试货物',
              quantity: 0,
              volume_m3: 1234.567,
              weight_kg: null,
              split_transport_fee: '***',
              loading_fee: 0,
              package_fee: null
            }
          ],
          transport_details: [
            {
              cargo_description: '四位精度测试货物',
              cargo_code: 'PRECISION',
              contract_quantity: 1234.56789,
              unit: '件',
              transport_unit_price: '***',
              freight: 0
            }
          ]
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/tms-detail-format.html?kind=${kind}`)
    const table = page.locator('.art-table')
    if (kind === 'contract') {
      await expect(page.getByRole('heading', { name: '格式化测试合同', exact: true })).toBeVisible({
        timeout: 120_000
      })
      await expect(page.locator('.contract-detail__summary')).toContainText('***')
      const billing = page
        .getByText('计费与履约', { exact: true })
        .locator('xpath=ancestor::section[1]')
      for (const [label, expected] of [
        ['合同金额', '***'],
        ['运输单价', '0.00'],
        ['路耗标准', '12.3457%'],
        ['亏扣价', '--']
      ]) {
        const cell = billing
          .getByRole('cell', { name: label, exact: true })
          .locator('xpath=following-sibling::td[1]')
        await expect(cell).toHaveText(expected)
      }
    }
    await expect(table).toContainText(
      kind === 'contract' ? '四位精度测试货物' : '零值及脱敏测试货物'
    )
    await expect(table).toContainText(kind === 'contract' ? '1,234.5679' : '1,234.57')
    if (kind === 'carrier') {
      await expect(table).toContainText('***')
      await expect(table).toContainText('0.00')
      await expect(table).toContainText('--')
    }
    if (kind !== 'contract') {
      await expect(
        page.locator('.rate-card-detail__summary article').last().locator('strong')
      ).toHaveText('***')
      await expect(page.locator('.rate-card-detail__content')).not.toContainText('¥ ***')
      await expect(page.locator('.rate-card-detail__content')).not.toContainText('¥ --')
      await expect(page.locator('.rate-card-detail__content')).toContainText('2026-10-09 00:30:00')
    }
    await table.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('formatted-detail.png'), animations: 'disabled' })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('承运商主档通过公共参数设置标签宽度', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/tms_get_carrier_secure', (route) =>
    route.fulfill({
      json: {
        id: 'format-test',
        company_name: '标签宽度测试承运商',
        carrier_code: 'CARRIER-WIDTH',
        field_access: {}
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/tms-detail-format.html?kind=carrier-master')
  await expect(page.getByRole('heading', { name: '标签宽度测试承运商', exact: true })).toBeVisible()
  await expect(page.locator('.art-descriptions .el-descriptions__label').first()).toHaveCSS(
    'width',
    '132px'
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('carrier-master-width.png'), fullPage: true })
})
