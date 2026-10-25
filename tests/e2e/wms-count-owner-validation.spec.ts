import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
for (const kind of ['gain', 'loss']) {
  for (const ownerType of ['supplier', 'customer']) {
    const ownerLabel = ownerType === 'supplier' ? '供应商' : '客户'
    test(`${kind}-${ownerType}编辑盘点非自有货主缺失阻止保存`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      let writes = 0
      const savedPayloads: unknown[] = []
      await page.route('**/rest/v1/**', async (route) => {
        if (route.request().method() !== 'GET') writes++
        const path = new URL(route.request().url()).pathname
        const json = path.endsWith('/sys_menu')
          ? { id: 'menu-test' }
          : path.endsWith('/mdm_document_type')
            ? [
                {
                  id: 'type-test',
                  document_type_name: '测试单据类型',
                  menu_ids: ['menu-test'],
                  enabled: true,
                  is_default: true
                }
              ]
            : path.endsWith('/mdm_business_type')
              ? [
                  {
                    id: 'business-test',
                    business_type_name: '测试业务类型',
                    document_type_ids: ['type-test'],
                    menu_ids: ['menu-test'],
                    enabled: true,
                    is_default: true
                  }
                ]
              : path.endsWith('/wms_count_adjustment_list')
                ? [
                    {
                      document_id: 'document-test',
                      document_no: 'COUNT-TEST',
                      organization_id: 'org-test',
                      document_type_id: 'type-test',
                      business_type_id: 'business-test',
                      business_date: '2026-10-06',
                      material_id: 'material-test',
                      material_description: `测试${ownerLabel}物料`,
                      inventory_unit_id: 'unit-test',
                      variance_quantity: kind === 'gain' ? 2 : -2,
                      warehouse_id: 'warehouse-test',
                      owner_type: ownerType,
                      owner_id: null,
                      unit_price: 0,
                      stock_type: 'normal',
                      stock_status: 'available'
                    }
                  ]
                : []
        await route.fulfill({ json })
      })
      await page.route(`**/rest/v1/mdm_${ownerType}?*`, (route) =>
        route.fulfill({
          json: [
            {
              id: 'owner-test',
              [`${ownerType}_name`]: `测试${ownerLabel}货主`,
              [`${ownerType}_code`]: 'OWNER-TEST'
            }
          ]
        })
      )
      await page.route('**/rpc/wms_save_count_adjustment_secure', (route) => {
        writes++
        savedPayloads.push(route.request().postDataJSON())
        return route.fulfill(
          writes === 1
            ? { status: 400, json: { code: 'P0001', message: '测试保存失败' } }
            : { json: 'saved-count-test' }
        )
      })
      await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind}`)
      await page.getByRole('button', { name: '测试盘点调整 edit', exact: true }).click()
      const drawer = page.getByRole('dialog', {
        name: kind === 'gain' ? '编辑盘盈单' : '编辑盘亏单',
        exact: true
      })
      await expect(drawer.getByText(`测试${ownerLabel}物料`, { exact: true })).toBeVisible()
      await expect(drawer.locator('.el-table__body').getByRole('spinbutton').first()).toHaveValue(
        '2.0000'
      )
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(page.getByText(`第 10 行请选择${ownerLabel}货主`, { exact: true })).toBeVisible()
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      expect(writes).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath('owner-required.png'),
        animations: 'disabled'
      })
      const header = drawer.locator('.el-table__header th').filter({ hasText: /^货主$/ })
      const columnClass = (await header.getAttribute('class'))!
        .split(' ')
        .find((value) => /el-table_.*_column_/.test(value))!
      const ownerSelect = drawer.locator(`.el-table__body td.${columnClass} .el-select`)
      await ownerSelect.scrollIntoViewIfNeeded()
      await ownerSelect.click()
      await page.getByRole('option', { name: `测试${ownerLabel}货主`, exact: true }).click()
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(page.getByText('测试保存失败', { exact: true })).toBeVisible()
      await expect(ownerSelect).toContainText(`测试${ownerLabel}货主`)
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).toBeHidden()
      expect(writes).toBe(2)
      expect(savedPayloads[0]).toEqual(savedPayloads[1])
      expect(savedPayloads[1]).toMatchObject({
        p_payload: {
          id: 'document-test',
          tenant_id: 'tenant-test',
          kind,
          lines: [{ owner_type: ownerType, owner_id: 'owner-test', variance_quantity: 2 }]
        }
      })
    })
  }
}
