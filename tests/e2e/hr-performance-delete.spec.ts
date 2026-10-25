import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['blocked', 'clear', 'valid'] as const) {
  test(`绩效周期删除：${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const events: string[] = []
    let deleted = false
    await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/rpc/hr_performance_overview_secure**', (route) =>
      route.fulfill({ json: {} })
    )
    await page.route('**/rest/v1/rpc/hr_list_performance_records_secure**', (route) =>
      route.fulfill({
        json: {
          records: deleted
            ? []
            : route.request().postDataJSON().p_kind === 'review'
              ? route.request().postDataJSON().p_keyword === 'REVIEW-001'
                ? [
                    {
                      id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                      status: 'draft',
                      employee: { name: '测试员工考核', code: 'REVIEW-001' },
                      cycle: { name: '测试绩效周期', code: 'CYCLE-001' }
                    }
                  ]
                : []
              : [
                  {
                    id,
                    cycle_name: '测试绩效周期',
                    cycle_code: 'CYCLE-001',
                    status: 'draft',
                    ...(mode === 'valid'
                      ? {
                          start_date: '2026-10-01',
                          end_date: '2026-10-31',
                          check_in_frequency_days: 7
                        }
                      : {})
                  }
                ],
          total: deleted ? 0 : 1
        }
      })
    )
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      events.push('inspect')
      expect(route.request().postDataJSON()).toMatchObject({
        p_table: 'hr_performance_cycle',
        p_ids: [id]
      })
      return route.fulfill({
        json:
          mode === 'blocked'
            ? [
                {
                  resourceId: id,
                  sourceTable: 'hr_performance_review',
                  recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                  targetId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                  recordNo: 'REVIEW-001',
                  recordSummary: '测试员工考核',
                  recordStatus: 'draft'
                }
              ]
            : []
      })
    })
    await page.route('**/rest/v1/rpc/hr_delete_performance_record_secure**', (route) => {
      events.push('delete')
      expect(route.request().postDataJSON()).toMatchObject({ p_kind: 'cycle', p_id: id })
      deleted = true
      return route.fulfill({ json: true })
    })
    await page.goto('/tests/e2e/fixtures/hr-delete-workflows.html?page=performance')
    await expect(page.locator('.el-table__body-wrapper')).toContainText('CYCLE-001')
    await expect(page.locator('.el-table__body-wrapper')).toContainText(
      mode === 'valid' ? '2026-10-01 → 2026-10-31' : '-- → --'
    )
    await expect(page.locator('.el-table__body-wrapper')).toContainText(
      mode === 'valid' ? '每 7 天沟通' : '未设置沟通节奏'
    )
    await expect(page.locator('.el-table__body-wrapper')).not.toContainText(/undefined|null/)
    await page.locator('.el-table__body-wrapper').getByRole('button', { name: '更多操作' }).click()
    await page.getByRole('menuitem', { name: '删除当前记录' }).click()
    if (mode === 'blocked') {
      await expect(page.getByRole('dialog', { name: '暂时无法删除考核周期' })).toContainText(
        'REVIEW-001'
      )
      expect(events).toEqual(['inspect'])
      await page.screenshot({
        path: testInfo.outputPath('performance-reference-blocked.png'),
        animations: 'disabled'
      })
      await page.getByRole('dialog').getByRole('button', { name: '查看关联', exact: true }).click()
      await expect(page.getByTestId('navigation-full-path')).toContainText(
        'dependencyCode=hr_performance_review'
      )
      await expect(page.locator('.el-table__body-wrapper')).toContainText('REVIEW-001')
      await expect(page.getByText('已找到关联记录', { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('performance-reference-located.png'),
        animations: 'disabled'
      })
    } else {
      const confirmation = page.getByRole('dialog', { name: '删除确认' })
      await expect(confirmation).toContainText('测试绩效周期')
      await confirmation.getByRole('button', { name: '删除', exact: true }).click()
      await expect(page.locator('.el-table__body-wrapper')).not.toContainText('CYCLE-001')
      expect(events).toEqual(['inspect', 'delete'])
    }
  })
}
