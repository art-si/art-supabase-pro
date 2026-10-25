import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const trigger of ['打开用品发放', '打开工具发放', '打开用品标准', '打开工具标准']) {
  test(`${trigger}通过公共字典列显示单位并保留未知值`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/material_unit_compatibility_options')
          ? [
              {
                value: 'unit-test',
                label: '测试单位',
                sort: 0,
                dictTypeTable: { code: 'smisMaterialUnit', name: '计量单位' }
              }
            ]
          : path.endsWith('/smis_list_materials_secure')
            ? {
                records: ['unit-test', '未知单位'].map((basicUnit, index) => ({
                  id: `material-${index}`,
                  categoryId: 'category-test',
                  materialCode: `MAT-${index}`,
                  materialName: `测试物料${index}`,
                  basicUnit,
                  materialType: 'tool',
                  materialSource: 'purchased',
                  imageUrls: [],
                  status: 'enabled',
                  sort: index,
                  category: { id: 'category-test', categoryCode: 'CAT', categoryName: '测试分类' }
                })),
                total: 2
              }
            : [],
        headers: { 'content-range': '0-1/2' }
      })
    })
    await page.goto('/tests/e2e/fixtures/warehouse-selector-reuse.html')
    await page.getByRole('button', { name: trigger, exact: true }).click()
    const owner = page.getByRole('dialog').first()
    await owner.getByPlaceholder('新增明细', { exact: true }).click()
    const picker = page.getByRole('dialog').last()
    const known = picker.getByRole('row').filter({ hasText: 'MAT-0' })
    await expect(known).toContainText('测试单位')
    await expect(known).not.toContainText('unit-test')
    await expect(picker.getByRole('row').filter({ hasText: 'MAT-1' })).toContainText('未知单位')
    await known.locator('label.el-checkbox').click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(owner.getByRole('row').filter({ hasText: '测试物料0' })).toContainText('测试单位')
    await page.screenshot({ path: info.outputPath('material-unit-column.png') })
    expect(errors).toEqual([])
  })
}
