import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
const cases = [
  {
    entity: 'family',
    label: '职族',
    code: '职族编码',
    name: '职族名称',
    list: 'hr_list_job_families_secure',
    save: 'hr_save_job_family_secure',
    codeKey: 'family_code',
    nameKey: 'family_name'
  },
  {
    entity: 'grade',
    label: '职级',
    code: '职级编码',
    name: '职级名称',
    list: 'hr_list_grades_secure',
    save: 'hr_save_grade_secure',
    codeKey: 'grade_code',
    nameKey: 'grade_name'
  },
  {
    entity: 'profile',
    label: '标准职务',
    code: '职务编码',
    name: '职务名称',
    list: 'hr_list_job_profiles_secure',
    save: 'hr_save_job_profile_secure',
    codeKey: 'job_code',
    nameKey: 'job_name'
  }
] as const

for (const item of cases) {
  test(`${item.label} 从主列表编辑保留记录租户并保存可识别名称`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 570, height: 900 })
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const id = '11111111-1111-4111-8111-111111111113'
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let saved: { p_id: string; p_payload: Record<string, unknown> } | undefined
    let checkedTable = ''
    let deletions = 0
    const record = {
      id,
      tenant_id: tenantId,
      [item.codeKey]: 'ARCH-001',
      [item.nameKey]: '测试架构记录',
      enabled: true,
      sort: 1,
      grade_level: 3,
      family_id: 'family-1',
      responsibilities: '负责组织协作',
      requirements: '具备专业经验'
    }
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('get_record_delete_dependency_details')) {
        const request = route.request().postDataJSON()
        checkedTable = request.p_table
        expect(request.p_ids).toEqual([id])
        return route.fulfill({
          json: [
            {
              resourceId: id,
              sourceTable: 'mdm_position',
              recordId: 'position-1',
              recordNo: 'POS-001',
              recordSummary: '调度岗位',
              recordStatus: 'active'
            }
          ]
        })
      }
      if (url.includes('hr_delete_job_architecture_record_secure')) {
        deletions++
        return route.fulfill({ json: true })
      }
      if (url.includes(item.list)) return route.fulfill({ json: { records: [record], total: 1 } })
      if (url.includes(item.save)) {
        saved = route.request().postDataJSON()
        return route.fulfill({ json: id })
      }
      if (url.includes('hr_list_job_architecture_options_secure'))
        return route.fulfill({
          json: [{ id: 'family-1', tenant_id: tenantId, code: 'FAMILY-001', name: '测试职族' }]
        })
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/hr-all-pages.html?page=personnel/job-architecture')
    await page.getByRole('tab', { name: new RegExp(`^${item.label}`) }).click()
    const row = page.locator('.el-table__body tr').filter({ hasText: 'ARCH-001' }).first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `编辑${item.label}`, exact: true })
    await expect(dialog.getByRole('textbox', { name: new RegExp(`${item.code}$`) })).toHaveValue(
      'ARCH-001'
    )
    const name = dialog.getByRole('textbox', { name: new RegExp(`${item.name}$`) })
    await expect(name).toHaveValue('测试架构记录')
    await name.fill('调整后的架构名称')
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('edit-record.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect.poll(() => saved?.p_id).toBe(id)
    expect(saved?.p_payload.tenant_id).toBe(tenantId)
    expect(saved?.p_payload[item.nameKey]).toBe('调整后的架构名称')
    await expect(dialog).not.toBeVisible()
    await row.getByRole('button', { name: '删除', exact: true }).click()
    const guard = page.getByRole('dialog', { name: `暂时无法删除${item.label}`, exact: true })
    await expect(guard).toContainText('POS-001')
    await expect(guard).toContainText('调度岗位')
    expect(checkedTable).toBe(
      item.entity === 'profile'
        ? 'mdm_job_profile'
        : item.entity === 'family'
          ? 'mdm_job_family'
          : 'mdm_grade'
    )
    expect(deletions).toBe(0)
    expect(errors).toEqual([])
  })
}
