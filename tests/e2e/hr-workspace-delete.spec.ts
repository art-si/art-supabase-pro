import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['blocked', 'error', 'clear', 'concurrent'] as const) {
  test(`培训工作区删除：${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const events: string[] = []
    let blocked = mode === 'blocked'
    let deleted = false
    await page.route('**/rest/v1/hr_training_plan**', (route) => {
      if (route.request().method() === 'DELETE') {
        events.push('delete')
        expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${id}`)
        if (mode === 'concurrent') {
          blocked = true
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '培训计划新增了关联记录，请重新检查' }
          })
        }
        deleted = true
        return route.fulfill({ status: 204, body: '' })
      }
      return route.fulfill({
        headers: { 'content-range': deleted ? '*/0' : '0-0/1' },
        json: deleted ? [] : [{ id, plan_name: '测试培训', plan_code: 'PLAN-001', status: 'draft' }]
      })
    })
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      events.push('inspect')
      expect(route.request().postDataJSON()).toMatchObject({
        p_table: 'hr_training_plan',
        p_ids: [id]
      })
      if (mode === 'error')
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      return route.fulfill({
        json: blocked
          ? [
              {
                resourceId: id,
                sourceTable: 'hr_training_enrollment',
                recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                recordNo: 'ENROLL-001',
                recordSummary: '测试员工培训参与',
                recordStatus: 'active'
              }
            ]
          : []
      })
    })
    await page.goto('/tests/e2e/fixtures/hr-delete-workflows.html?page=workspace')
    await expect(page.locator('.el-table__body-wrapper')).toContainText('PLAN-001')
    await page.locator('.el-table__body-wrapper').getByRole('button', { name: '更多操作' }).click()
    await page.getByRole('menuitem', { name: '删除培训计划', exact: true }).click()
    if (mode === 'error') {
      const dialog = page.getByRole('dialog', { name: '删除检查未完成' })
      await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
      await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect.poll(() => events.length).toBe(2)
      expect(events).toEqual(['inspect', 'inspect'])
      return
    }
    if (mode !== 'blocked') {
      const confirmation = page.getByRole('dialog', { name: '删除培训计划' })
      await expect(confirmation).toContainText('测试培训')
      await confirmation.getByRole('button', { name: '确认删除', exact: true }).click()
    }
    if (mode === 'clear') {
      await expect(page.locator('.el-table__body-wrapper')).not.toContainText('PLAN-001')
      expect(events).toEqual(['inspect', 'delete'])
    } else {
      await expect(page.getByRole('dialog', { name: '暂时无法删除培训计划' })).toContainText(
        'ENROLL-001'
      )
      expect(events).toEqual(mode === 'blocked' ? ['inspect'] : ['inspect', 'delete', 'inspect'])
      if (mode === 'blocked')
        await page.screenshot({
          path: testInfo.outputPath('training-delete-reference-blocked.png'),
          animations: 'disabled'
        })
    }
  })
}
