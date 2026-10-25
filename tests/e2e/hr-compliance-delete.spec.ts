import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const entity of ['contract', 'qualification'] as const) {
  test(`${entity} 确认期间撤权阻止删除`, async ({ page }) => {
    const events = await prepareComplianceRecord(page, 'clear', entity)
    const confirmation = page.getByRole('dialog', { name: '删除合规草稿' })
    await expect(confirmation).toBeVisible()
    await page
      .getByTestId('revoke-delete-permission')
      .evaluate((button: HTMLButtonElement) => button.click())
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByText('合规草稿删除权限已变化', { exact: true })).toBeVisible()
    expect(events).toEqual(['inspect'])
  })
}

async function prepareComplianceRecord(
  page: Page,
  mode: 'blocked' | 'error' | 'clear' | 'concurrent',
  entity: 'contract' | 'qualification' = 'contract'
) {
  await prepareIsolatedSession(page)
  const record = {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    contract_no: 'CONTRACT-001',
    contract_status: 'draft',
    qualification_name: '测试资质',
    certificate_no: 'QUAL-001',
    verification_status: 'pending',
    status: 'active',
    tenant_id: 'permission-test-tenant',
    employee: { employee_name: '测试员工', employee_no: 'EMP-001' }
  }
  await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/hr_compliance_overview_secure**', (route) =>
    route.fulfill({ json: {} })
  )
  let deleted = false
  await page.route('**/rest/v1/rpc/hr_list_compliance_records_secure**', (route) =>
    route.fulfill({ json: { records: deleted ? [] : [record], total: deleted ? 0 : 1 } })
  )
  await page.route('**/rest/v1/rpc/hr_get_compliance_detail_secure**', (route) =>
    route.fulfill({ json: record })
  )
  const events: string[] = []
  let blocked = mode === 'blocked'
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    events.push('inspect')
    expect(route.request().postDataJSON()).toMatchObject({
      p_table: entity === 'contract' ? 'hr_employee_contract' : 'hr_employee_qualification',
      p_ids: [record.id]
    })
    if (mode === 'error')
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    return route.fulfill({
      json: blocked
        ? [
            {
              resourceId: record.id,
              sourceTable: 'hr_employee_contract',
              recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
              targetId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
              recordNo: 'CONTRACT-002',
              recordSummary: '续签关联版本',
              recordStatus: 'active'
            }
          ]
        : []
    })
  })
  await page.route('**/rest/v1/rpc/hr_delete_compliance_record_secure**', (route) => {
    events.push('delete')
    expect(route.request().postDataJSON()).toMatchObject({ p_kind: entity, p_id: record.id })
    if (mode === 'concurrent') {
      blocked = true
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '合同新增了关联版本，请重新检查' }
      })
    }
    deleted = true
    return route.fulfill({ json: true })
  })
  await page.goto(`/tests/e2e/fixtures/hr-delete-workflows.html?page=compliance&entity=${entity}`)
  await expect(page.locator('.el-table__body-wrapper')).toContainText(
    entity === 'contract' ? 'CONTRACT-001' : '测试资质'
  )
  await page.locator('.el-table__body-wrapper').getByRole('button', { name: '更多操作' }).click()
  await page
    .getByRole('menuitem', {
      name: entity === 'contract' ? '删除合同草稿' : '删除未核验记录'
    })
    .click()
  return events
}

test('合同草稿存在引用时停止删除并显示引用编号', async ({ page }) => {
  const events = await prepareComplianceRecord(page, 'blocked')
  const dialog = page.getByRole('dialog', { name: '暂时无法删除劳动合同' })
  await expect(dialog).toContainText('CONTRACT-002')
  await expect(dialog).toContainText('续签关联版本')
  await expect(page.getByRole('dialog', { name: '删除合规草稿' })).toHaveCount(0)
  expect(events).toEqual(['inspect'])
})

test('合同引用校验失败提供重试且不删除', async ({ page }) => {
  const events = await prepareComplianceRecord(page, 'error')
  const dialog = page.getByRole('dialog', { name: '删除检查未完成' })
  await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
  await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect.poll(() => events.length).toBe(2)
  expect(events).toEqual(['inspect', 'inspect'])
})

for (const mode of ['clear', 'concurrent'] as const) {
  test(`合同删除${mode === 'clear' ? '先校验再确认成功' : '并发拒绝后重检引用'}`, async ({
    page
  }) => {
    const events = await prepareComplianceRecord(page, mode)
    const dialog = page.getByRole('dialog', { name: '删除合规草稿' })
    await expect(dialog).toContainText('CONTRACT-001')
    await dialog.getByRole('button', { name: '删除', exact: true }).click()
    if (mode === 'clear') {
      await expect(page.getByText('合规草稿记录已删除', { exact: true })).toBeVisible()
      await expect(page.locator('.el-table__body-wrapper')).not.toContainText('CONTRACT-001')
      expect(events).toEqual(['inspect', 'delete'])
    } else {
      await expect(page.getByRole('dialog', { name: '暂时无法删除劳动合同' })).toContainText(
        'CONTRACT-002'
      )
      expect(events).toEqual(['inspect', 'delete', 'inspect'])
    }
  })
}

for (const mode of ['blocked', 'error', 'clear', 'concurrent'] as const) {
  test(`资质删除：${mode}`, async ({ page }) => {
    const events = await prepareComplianceRecord(page, mode, 'qualification')
    if (mode === 'error') {
      const dialog = page.getByRole('dialog', { name: '删除检查未完成' })
      await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
      await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect.poll(() => events.length).toBe(2)
      expect(events).toEqual(['inspect', 'inspect'])
      return
    }
    if (mode !== 'blocked') {
      const confirmation = page.getByRole('dialog', { name: '删除合规草稿' })
      await expect(confirmation).toContainText('测试资质')
      await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    }
    if (mode === 'clear') {
      await expect(page.getByText('合规草稿记录已删除', { exact: true })).toBeVisible()
      await expect(page.locator('.el-table__body-wrapper')).not.toContainText('测试资质')
      expect(events).toEqual(['inspect', 'delete'])
    } else {
      await expect(page.getByRole('dialog', { name: '暂时无法删除员工资质' })).toContainText(
        'CONTRACT-002'
      )
      expect(events).toEqual(mode === 'blocked' ? ['inspect'] : ['inspect', 'delete', 'inspect'])
    }
  })
}
