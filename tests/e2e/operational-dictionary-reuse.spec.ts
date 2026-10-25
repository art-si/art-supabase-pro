import { expect, test } from '@playwright/test'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('活动公式数组字典复用公共标签并保留历史单值', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const dictCode = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
    return route.fulfill({
      json: url.pathname.endsWith('/sys_dictionary')
        ? dictCode === 'mdmActivityType'
          ? [
              { label: '测试活动类型', value: 'known', sort: 0 },
              { label: '零值活动', value: '0', sort: 1 }
            ]
          : dictCode === 'mdmFormulaPurpose'
            ? [{ label: '测试公式用途', value: 'execution', sort: 0 }]
            : []
        : url.pathname.endsWith('/mdm_activity_formula')
          ? [
              {
                id: 'formula-array',
                code: 'FORM-001',
                name: '数组公式测试',
                enabled: true,
                purpose: 'execution',
                activity_types: ['known', 'unknown', '0'],
                formula_tokens: [
                  { type: 'parameter', parameter_id: 'param-test', value: 'P', label: '参数' }
                ]
              },
              {
                id: 'formula-legacy',
                code: 'FORM-002',
                name: '历史单值公式',
                enabled: true,
                purpose: 'execution',
                activity_types: [],
                activity_type: 'known'
              }
            ]
          : [],
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/operational-master-model.html?formula=1')
  const first = page.getByRole('row').filter({ hasText: 'FORM-001' })
  await expect(first).toContainText('测试活动类型、unknown、零值活动')
  await expect(first).not.toContainText('[object Object]')
  await expect(page.getByRole('row').filter({ hasText: 'FORM-002' })).toContainText('测试活动类型')
  await expect(page.locator('.el-pagination__total')).toContainText('2')
  await assertTableFocusContract(page, info)
  await page.screenshot({ path: info.outputPath('formula-dictionary.png'), animations: 'disabled' })
  expect(errors).toEqual([])
})
