import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const trigger of ['打开用品发放', '打开工具发放', '打开用品下推', '打开工具下推']) {
  test(`${trigger}直接接收公共选择器的仓库记录`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith(
          '/smis_list_storage_locations_secure'
        )
          ? {
              records: [
                {
                  id: 'warehouse-test',
                  tenantId: '11111111-1111-4111-8111-111111111111',
                  organizationId: 'org-test',
                  locationCode: 'WH-001',
                  locationName: '测试复用仓库',
                  detailLocation: '测试区域',
                  status: 'enabled',
                  childCount: 0,
                  organization: {
                    id: 'org-test',
                    organizationCode: 'ORG-001',
                    organizationName: '测试组织'
                  }
                }
              ],
              total: 1
            }
          : [],
        headers: { 'content-range': '0-0/1' }
      })
    )
    await page.goto('/tests/e2e/fixtures/warehouse-selector-reuse.html')
    await page.getByRole('button', { name: trigger, exact: true }).click()
    const owner = page.getByRole('dialog').first()
    await owner.getByPlaceholder('请选择发放仓库', { exact: true }).click()
    let picker = page.getByRole('dialog', { name: '选择发放仓库', exact: true })
    await picker.getByRole('row').filter({ hasText: '测试复用仓库' }).click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(owner.getByPlaceholder('请选择发放仓库', { exact: true })).toHaveValue(
      '测试复用仓库'
    )
    await owner.getByPlaceholder('请选择发放仓库', { exact: true }).click()
    picker = page.getByRole('dialog', { name: '选择发放仓库', exact: true })
    await expect(picker.getByRole('row').filter({ hasText: '测试复用仓库' })).toHaveClass(
      /is-selected-row/
    )
    await page.screenshot({ path: info.outputPath('warehouse-selected.png') })
    expect(errors).toEqual([])
  })
}
