import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
for (const value of ['known', 'future', '']) {
  test(`供应商详情公共字典展示 value=${value || 'empty'}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const fields = [
      ['supplier_category', 'supplierCategory', '供应商类别'],
      ['supplier_type', 'supplierType', '供应商类型'],
      ['enterprise_nature', 'enterpriseNature', '企业性质'],
      ['industry', 'supplierIndustry', '行业']
    ]
    await page.route('**/rest/v1/sys_dictionary?**', (route) => {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace('eq.', '')
      return route.fulfill({
        json: [
          {
            value: 'known',
            label: `配置${code === 'sex' ? '性别' : fields.find((field) => field[1] === code)?.[2]}`,
            status: '1'
          }
        ]
      })
    })
    await page.route('**/rest/v1/mdm_supplier?**', (route) =>
      route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'supplier-test',
            tenant_id: 'test-tenant',
            supplier_name: '字典验证供应商',
            supplier_code: 'SUP-TEST',
            ...Object.fromEntries(fields.map(([key]) => [key, value]))
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_supplier_bank?**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/mdm_supplier_contact?**', (route) =>
      route.fulfill({
        json: ['known', 'future', null].map((gender, index) => ({
          id: `contact-${index}`,
          supplier_id: 'supplier-test',
          name: `测试联系人${index + 1}`,
          gender
        }))
      })
    )
    await page.goto('/tests/e2e/fixtures/supplier-dictionary-reuse.html')
    await page.getByRole('button', { name: '查看测试供应商' }).click()
    const detail = page.locator('.supplier-detail')
    for (const [, , label] of fields) {
      const cell = detail
        .locator('td.el-descriptions__label')
        .filter({ hasText: label })
        .locator('xpath=following-sibling::td[1]')
      await expect(cell).toHaveText(value === 'known' ? `配置${label}` : value || '—')
    }
    await page.screenshot({
      path: info.outputPath('supplier-overview.png'),
      animations: 'disabled'
    })
    await detail.getByRole('tab', { name: '联系人', exact: true }).click()
    const table = detail.locator('.art-table:visible')
    const rows = table.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(3)
    for (const [index, expected] of ['配置性别', 'future', '--'].entries())
      await expect(rows.nth(index).locator('td').nth(4)).toContainText(expected)
    await rows.first().locator('td').nth(4).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath('supplier-contacts.png'),
      animations: 'disabled'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
