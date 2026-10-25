import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of [
  'blocked',
  'error',
  'clear',
  'concurrent',
  'revoked',
  'failure',
  'cancel',
  'busy'
] as const) {
  test(`费用项目删除 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const events: string[] = []
    let deleted = false
    let blocked = mode === 'blocked'
    let releaseDelete: (() => void) | undefined
    const pendingDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve
    })
    await page.route('**/rest/v1/tms_expense_item?*', async (route) => {
      if (route.request().method() === 'DELETE') {
        events.push('delete')
        expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${id}`)
        if (mode === 'concurrent') {
          blocked = true
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '费用项目新增了关联业务，请重新检查' }
          })
        }
        if (mode === 'failure')
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        if (mode === 'busy') await pendingDelete
        deleted = true
        return route.fulfill({ status: 200, headers: { 'content-range': '*/1' }, json: null })
      }
      return route.fulfill({
        headers: { 'content-range': deleted ? '*/0' : '0-0/1' },
        json: deleted
          ? []
          : [
              {
                id,
                item_code: 'EXP-001',
                item_name: '测试费用项目',
                parent_id: null,
                tenant_id: 'context-test-tenant',
                tenant: { tenant_code: 'TEST', tenant_name: '测试租户' },
                is_selectable: true,
                reimbursement_allowed: true,
                business_category: 'toll',
                is_enabled: true,
                sort: 1
              }
            ]
      })
    })
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      events.push('inspect')
      expect(route.request().postDataJSON()).toMatchObject({
        p_table: 'tms_expense_item',
        p_ids: [id]
      })
      if (mode === 'error')
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({
        json: blocked
          ? [
              {
                resourceId: id,
                sourceTable: 'tms_waybill_cost',
                recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                recordNo: 'COST-001',
                recordSummary: '测试运单费用',
                recordStatus: 'approved'
              }
            ]
          : []
      })
    })
    await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=expense-item')
    const body = page.locator('.el-table__body-wrapper').first()
    await expect(body).toContainText('EXP-001')
    await body.getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    if (mode === 'error') {
      const dialog = page.getByRole('dialog', { name: '删除检查未完成' })
      await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
      await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect.poll(() => events.length).toBe(2)
      expect(events).toEqual(['inspect', 'inspect'])
      return
    }
    if (mode !== 'blocked') {
      const confirmation = page.getByRole('dialog', { name: '删除确认' })
      await expect(confirmation).toContainText('测试费用项目')
      await expect(confirmation).toContainText('测试租户')
      if (mode === 'revoked')
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((button: HTMLButtonElement) => button.click())
      await confirmation
        .getByRole('button', { name: mode === 'cancel' ? '取消' : '删除', exact: true })
        .click()
    }
    if (mode === 'busy') {
      await expect.poll(() => events.includes('delete')).toBe(true)
      await expect(body.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: '新增一级项目', exact: true })).toBeDisabled()
      await body.getByRole('button', { name: '更多操作', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: '新增下级', exact: true })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await page.screenshot({
        path: testInfo.outputPath('expense-item-delete-busy.png'),
        animations: 'disabled'
      })
      releaseDelete?.()
      await expect(page.getByText('暂无费用项目', { exact: true })).toBeVisible()
      expect(events).toEqual(['inspect', 'delete'])
    } else if (mode === 'blocked' || mode === 'concurrent') {
      await expect(page.getByRole('dialog', { name: '暂时无法删除费用项目' })).toContainText(
        'COST-001'
      )
      expect(events).toEqual(mode === 'blocked' ? ['inspect'] : ['inspect', 'delete', 'inspect'])
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('expense-item-references.png'),
        animations: 'disabled'
      })
    } else if (mode === 'clear') {
      await expect(page.getByText('暂无费用项目', { exact: true })).toBeVisible()
      expect(events).toEqual(['inspect', 'delete'])
    } else if (mode === 'failure') {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
      await expect(body).toContainText('EXP-001')
      expect(events).toEqual(['inspect', 'delete', 'inspect'])
    } else {
      if (mode === 'revoked')
        await expect(
          page.getByText('删除权限已变化，请刷新页面后重试', { exact: true })
        ).toBeVisible()
      await expect(body).toContainText('EXP-001')
      expect(events).toEqual(['inspect'])
    }
  })
}
