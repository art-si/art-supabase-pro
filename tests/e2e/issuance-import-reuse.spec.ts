import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
for (const mode of ['ppe', 'tool']) {
  for (const scope of ['all', 'selected', 'ordinary', 'ordinary-forged', 'ambiguous']) {
    test(`${mode} ${scope} 导入分页查找只使用目标租户并复用本批查询`, async ({ page }, info) => {
      const tenantId = scope === 'all' ? platformTenantId : businessTenantId
      const foreignTenantId = tenantId === platformTenantId ? businessTenantId : platformTenantId
      const calls = { employee: 0, warehouse: 0, material: 0 }
      const writes: Record<string, unknown>[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        const body = route.request().postDataJSON() ?? {}
        if (/smis_save_(ppe|tool)_issuance_record_secure$/.test(path)) {
          writes.push(body.p_payload)
          await route.fulfill({ json: 'saved-record' })
          return
        }
        const employee =
          path.endsWith('/hr_list_employee_selector_secure') && body.p_keyword === 'EMP-001'
        const warehouse =
          path.endsWith('/smis_list_storage_locations_secure') && body.p_keyword === 'WH-001'
        const material =
          path.endsWith('/smis_list_materials_secure') && body.p_material_code === 'MAT-001'
        if (employee || warehouse || material) {
          const key = employee ? 'employee' : warehouse ? 'warehouse' : 'material'
          calls[key] += 1
          if (employee) expect(body.p_tenant_id).toBe(tenantId)
          const codeKey = employee ? 'employeeNo' : warehouse ? 'locationCode' : 'materialCode'
          const code = employee ? 'EMP-001' : warehouse ? 'WH-001' : 'MAT-001'
          const row = {
            id: `${key}-${tenantId}`,
            tenantId,
            employeeNo: 'EMP-001',
            employeeName: '测试员工',
            employmentStatus: 'active',
            locationCode: 'WH-001',
            locationName: '测试仓库',
            organizationId: 'org-test',
            materialCode: 'MAT-001',
            materialName: '测试物料',
            categoryId: 'category-test',
            basicUnit: '件',
            materialType: mode === 'tool' ? 'tool' : 'protective_equipment',
            status: 'enabled'
          }
          const records = [
            { ...row, id: 'foreign-record', tenantId: foreignTenantId },
            ...Array.from({ length: 500 }, (_, index) => ({
              ...row,
              id: `${key}-near-${index}`,
              [codeKey]: `${code}-${index}`
            })),
            row,
            ...(scope === 'ambiguous' && warehouse ? [{ ...row, id: 'second-warehouse' }] : [])
          ]
          await route.fulfill({
            json: { records: records.slice(body.p_from, body.p_to + 1), total: records.length }
          })
        } else {
          await route.fulfill({
            json:
              route.request().method() === 'GET' ||
              path.endsWith('/material_unit_compatibility_options')
                ? []
                : { records: [], total: 0, organizations: [], employees: [] },
            headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
          })
        }
      })
      await page.goto(`/tests/e2e/fixtures/issuance-import-reuse.html?mode=${mode}&scope=${scope}`)
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('发放导入')
      sheet.addRow([
        '领用人工号',
        '发放仓库编码',
        '发放人工号',
        mode === 'tool' ? '工器具编码' : '防护用品编码',
        '发放数量',
        '发放日期'
      ])
      for (let index = 0; index < 2; index += 1)
        sheet.addRow(['EMP-001', 'WH-001', 'EMP-001', 'MAT-001', 1, '2026-10-08'])
      await page.locator('input[type="file"]').setInputFiles({
        name: '发放.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer())
      })
      if (scope === 'ambiguous') {
        await expect(
          page.getByText('启用仓库编码：WH-001存在多个匹配记录，请核对编号后重新导入', {
            exact: true
          })
        ).toBeVisible()
        expect(writes).toEqual([])
      } else {
        await expect.poll(() => writes.length).toBe(2)
        for (const row of writes) {
          expect(row).toMatchObject({
            employee_id: `employee-${tenantId}`,
            issuer_employee_id: `employee-${tenantId}`,
            warehouse_id: `warehouse-${tenantId}`
          })
          expect(row.items).toEqual([{ material_id: `material-${tenantId}`, issue_quantity: 1 }])
        }
      }
      expect(calls).toEqual({ employee: 2, warehouse: 2, material: 2 })
      await page.screenshot({ path: info.outputPath('issuance-import.png') })
      expect(errors).toEqual([])
    })
  }
}
