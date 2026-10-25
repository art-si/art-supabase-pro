import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
for (const state of ['referenced', 'failed', 'clear', 'concurrent', 'zero'] as const) {
  for (const mode of ['single', 'bulk'] as const)
    test(`运输合同删除引用校验 ${mode} ${state}`, async ({ page }, info) => {
      const events: string[] = []
      const id = '00000000-0000-4000-a000-000000000001'
      await page.route('**/rest/v1/**', async (route) => {
        const url = route.request().url()
        if (url.includes('tms_list_contracts_secure'))
          return route.fulfill({
            json: {
              records: [
                {
                  id,
                  contract_no: 'HT-TEST-001',
                  contract_name: '测试运输合同',
                  contract_status: 'draft',
                  business_contract_type: 'transport',
                  carrier_id: id,
                  carrier: { company_name: '测试承运商' },
                  origin_region: '北京',
                  destination_region: '上海',
                  transport_mode: '汽运'
                }
              ],
              total: 1
            }
          })
        if (url.includes('get_record_delete_dependency_details')) {
          events.push('inspect')
          if (state === 'failed')
            return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
          return route.fulfill({
            json:
              state === 'referenced' || (state === 'concurrent' && events.includes('delete'))
                ? [
                    {
                      resource_id: id,
                      source_table: 'tms_order',
                      record_id: id,
                      target_id: id,
                      record_no: 'YD-TEST-001',
                      record_summary: '测试引用运单',
                      record_status: 'completed',
                      created_at: '2026-10-01'
                    }
                  ]
                : []
          })
        }
        if (
          url.includes('tms_delete_contract_secure') ||
          url.includes('tms_delete_contracts_secure')
        ) {
          events.push('delete')
          if (state === 'concurrent')
            return route.fulfill({
              status: 409,
              json: {
                code: '23503',
                message: 'foreign key reference',
                details: 'Key (id) is still referenced',
                hint: null
              }
            })
          return route.fulfill({
            json: mode === 'single' ? state !== 'zero' : state === 'zero' ? 0 : 1
          })
        }
        return route.fulfill({ json: [] })
      })
      await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=contract')
      const row = page.locator('.el-table__body-wrapper tr').first()
      await expect(row).toContainText('HT-TEST-001')
      await expect(row.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(1)
      await expect(row.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
      if (mode === 'single') {
        await row.getByRole('button', { name: '更多操作', exact: true }).focus()
        await page.keyboard.press('Enter')
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      } else {
        await page.locator('.el-table__header-wrapper .el-checkbox').click()
        await page.getByRole('button', { name: '批量删除', exact: true }).click()
      }
      if (state === 'clear' || state === 'concurrent' || state === 'zero') {
        const confirmation = page.locator('.el-message-box')
        await expect(confirmation).toBeVisible()
        expect(events).toEqual(['inspect'])
        await confirmation.getByRole('button', { name: /删除|确定/ }).click()
        await expect
          .poll(() => events)
          .toEqual(
            state === 'concurrent' || state === 'zero'
              ? ['inspect', 'delete', 'inspect']
              : ['inspect', 'delete']
          )
        if (state === 'concurrent')
          await expect(page.getByText('YD-TEST-001', { exact: true })).toBeVisible()
        if (state === 'zero') {
          await expect(page.getByText(/操作成功|删除成功/, { exact: true })).toHaveCount(0)
          await expect(page.locator('.el-message--error')).toBeVisible()
        }
      } else {
        await expect(
          page.getByText(state === 'referenced' ? 'YD-TEST-001' : '删除检查未完成', { exact: true })
        ).toBeVisible()
        expect(events).toEqual(['inspect'])
        await expect(page.locator('.el-message-box')).toHaveCount(0)
      }
      if (mode === 'bulk' && state !== 'clear')
        await expect(page.locator('.el-table__body-wrapper input[type="checkbox"]')).toBeChecked()
      if (mode === 'bulk' && state === 'clear')
        await expect(
          page.locator('.el-table__body-wrapper input[type="checkbox"]')
        ).not.toBeChecked()
      await page.screenshot({ path: info.outputPath('delete-guard.png') })
    })
}
