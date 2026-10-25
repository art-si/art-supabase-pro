import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const feature of [
  { page: 'favorite-route', title: '常用线路', table: 'tms_favorite_route' },
  { page: 'insurance-company', title: '保险公司', table: 'mdm_insurance_company' },
  { page: 'supplier', title: '供应厂商', table: 'mdm_supplier' },
  { page: 'parts', title: '零部件', table: 'mdm_part' },
  { page: 'parts-category', title: '零部件类别', table: 'mdm_part_category' }
])
  for (const mode of ['single', 'bulk'] as const)
    for (const state of (['supplier', 'parts', 'parts-category'].includes(feature.page)
      ? ['clear', 'referenced', 'failed', 'zero']
      : ['clear', 'referenced', 'failed']) as ('clear' | 'referenced' | 'failed' | 'zero')[]) {
      test(`${feature.title}删除 ${mode} ${state}`, async ({ page }, info) => {
        const ids = ['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']
        const events: string[] = []
        let checkedIds: string[] = []
        await page.route('**/rest/v1/**', async (route) => {
          const url = route.request().url()
          if (
            feature.page === 'parts-category' &&
            new URL(url).pathname.endsWith('/mdm_part_category') &&
            route.request().method() === 'GET'
          )
            return route.fulfill({
              json: ids.map((id, i) => ({
                id,
                category_name: `测试类别 ${i + 1}`,
                category_code: `LB-${i + 1}`,
                parent_id: null,
                status: '1',
                tenant_id: '11111111-1111-4111-a111-111111111111'
              })),
              headers: {
                'content-range': '0-1/2',
                'access-control-expose-headers': 'content-range'
              }
            })
          if (feature.page === 'parts' && new URL(url).pathname.endsWith('/sys_dictionary'))
            return route.fulfill({
              json: [
                {
                  code: 'normal',
                  label: '正常',
                  value: 'normal',
                  status: '1',
                  sort: 1,
                  dict_type_table: { code: 'vehiclePartUsageStatus', name: '零部件使用状态' }
                }
              ]
            })
          if (
            feature.page === 'parts' &&
            new URL(url).pathname.endsWith('/mdm_part') &&
            route.request().method() === 'GET'
          )
            return route.fulfill({
              json: ids.map((id, i) => ({
                id,
                part_name: `测试零部件 ${i + 1}`,
                part_code: `BJ-${i + 1}`,
                status: '1',
                tenant_id: '11111111-1111-4111-a111-111111111111'
              })),
              headers: {
                'content-range': '0-1/2',
                'access-control-expose-headers': 'content-range'
              }
            })
          if (url.includes('vms_list_vehicle_suppliers_secure'))
            return route.fulfill({
              json: {
                records: ids.map((id, i) => ({
                  id,
                  supplier_name: `测试厂商 ${i + 1}`,
                  supplier_code: `GY-${i + 1}`,
                  tenant_id: '11111111-1111-4111-a111-111111111111'
                })),
                total: 2
              }
            })
          if (url.includes('vms_delete_vehicle_suppliers_secure')) {
            events.push('delete')
            return route.fulfill({ json: state === 'zero' ? 0 : mode === 'single' ? 1 : 2 })
          }
          if (
            feature.page === 'insurance-company' &&
            url.includes('/mdm_insurance_company') &&
            route.request().method() === 'GET'
          )
            return route.fulfill({
              json: ids.map((id, i) => ({
                id,
                company_name: `测试保险公司 ${i + 1}`,
                tenant_id: '11111111-1111-4111-a111-111111111111'
              })),
              headers: { 'content-range': '0-1/2' }
            })
          if (url.includes('tms_list_favorite_routes_secure'))
            return route.fulfill({
              json: {
                records: ids.map((id, i) => ({
                  id,
                  route_name: `测试线路 ${i + 1}`,
                  tenant_id: '11111111-1111-4111-a111-111111111111',
                  tenant: { tenant_name: '测试租户' },
                  enabled: true,
                  origin_address: { region: '北京', address_detail: '装货地点' },
                  destination_address: { region: '上海', address_detail: '卸货地点' }
                })),
                total: 2
              }
            })
          if (url.includes('get_record_delete_dependency_details')) {
            events.push('inspect')
            checkedIds = route.request().postDataJSON().p_ids
            expect(route.request().postDataJSON().p_table).toBe(feature.table)
            if (state === 'failed')
              return route.fulfill({
                status: 500,
                json: { code: 'XX000', message: 'inspection unavailable' }
              })
            return route.fulfill({
              json:
                state === 'referenced'
                  ? [
                      {
                        resource_id: ids[0],
                        source_table:
                          feature.page === 'supplier'
                            ? 'scm_purchase_document'
                            : feature.page === 'parts'
                              ? 'vehicle_part_usage'
                              : 'tms_order',
                        record_id: ids[0],
                        target_id: ids[0],
                        record_no: 'YD-ROUTE-001',
                        record_status: feature.page === 'parts' ? 'normal' : 'completed',
                        created_at: '2026-10-01'
                      }
                    ]
                  : []
            })
          }
          if (url.includes(`/${feature.table}`) && route.request().method() === 'DELETE') {
            events.push('delete')
            return route.fulfill({
              json: null,
              headers: {
                'content-range': `*/${state === 'zero' ? 0 : mode === 'single' ? 1 : 2}`,
                'access-control-expose-headers': 'content-range'
              }
            })
          }
          return route.fulfill({ json: [] })
        })
        await page.goto(`/tests/e2e/fixtures/scrollbar-workspace.html?page=${feature.page}`)
        const rows = page.locator('.el-table__body-wrapper tr')
        await expect(rows).toHaveCount(2)
        if (mode === 'single') {
          const more = rows.first().getByRole('button', { name: '更多操作', exact: true })
          await expect(more).toHaveCount(1)
          await expect(rows.first().getByRole('button', { name: '删除', exact: true })).toHaveCount(
            0
          )
          await more.focus()
          await page.keyboard.press('Enter')
          await page.getByRole('menuitem', { name: '删除', exact: true }).click()
        } else {
          await page.locator('.el-table__header-wrapper .el-checkbox').click()
          await page.getByRole('button', { name: '批量删除', exact: true }).click()
        }
        if (state === 'clear' || state === 'zero') {
          const dialog = page.locator('.el-message-box')
          await expect(dialog).toBeVisible()
          expect(events).toEqual(['inspect'])
          await dialog.getByRole('button', { name: /删除|确定/ }).click()
          await expect
            .poll(() => events)
            .toEqual(state === 'zero' ? ['inspect', 'delete', 'inspect'] : ['inspect', 'delete'])
          if (state === 'zero') {
            await expect(page.getByText(/操作成功|删除成功/, { exact: true })).toHaveCount(0)
            await expect(page.locator('.el-message--error')).toBeVisible()
          }
        } else {
          await expect(
            page.getByText(state === 'referenced' ? 'YD-ROUTE-001' : '删除检查未完成', {
              exact: true
            })
          ).toBeVisible()
          if (feature.page === 'parts' && state === 'referenced') {
            await expect(page.getByText('零部件使用记录', { exact: true })).toBeVisible()
            await expect(page.getByText('正常', { exact: true })).toBeVisible()
            await expect(page.locator('.master-delete-guard__record-copy')).not.toContainText(
              '待处理'
            )
          }
          expect(events).toEqual(['inspect'])
        }
        expect(checkedIds).toEqual(mode === 'single' ? [ids[0]] : ids)
        await page.screenshot({ path: info.outputPath('record-delete.png') })
      })
    }
