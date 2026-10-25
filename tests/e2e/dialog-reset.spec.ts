import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of ['mdm', 'pmis', 'smis'] as const) {
  test(`${scenario} 编辑后新增使用新记录身份`, async ({ page }, info) => {
    const errors: string[] = []
    const saves: Array<{ method: string; body: Record<string, unknown> }> = []
    let employeeListScans = 0
    let referenceFailure = false
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const resource = url.pathname.split('/').at(-1)
      if (resource === 'hr_list_employee_selector_secure') {
        employeeListScans++
        expect(request.postDataJSON().p_tenant_id).toBe('test-tenant')
        if (referenceFailure) {
          return route.fulfill({
            status: 403,
            json: { code: '42501', message: 'permission denied' }
          })
        }
        return route.fulfill({
          json: {
            records: [
              {
                id: 'historical-employee',
                tenant_id: 'test-tenant',
                employee_no: 'EMP-OLD',
                employee_name: '历史通知人员',
                employment_status: 'active'
              }
            ],
            total: 1
          }
        })
      }
      if (
        [
          'mdm_save_esop_category',
          'pmis_save_department_setting_secure',
          'smis_risk_assessment_criterion'
        ].includes(resource ?? '') &&
        request.method() !== 'GET'
      ) {
        saves.push({ method: request.method(), body: request.postDataJSON() })
        return route.fulfill({
          json: resource === 'smis_risk_assessment_criterion' ? [] : 'new-record'
        })
      }
      return route.fulfill({
        json:
          resource === 'mdm_production_department'
            ? [
                {
                  id: 'department-test',
                  tenant_id: 'test-tenant',
                  parent_id: null,
                  department_name: '测试车间',
                  department_code: 'TEST'
                }
              ]
            : resource === 'sys_dictionary'
              ? [{ name: '启用', label: '启用', value: 'enabled', status: '1' }]
              : []
      })
    })
    await page.goto(`/tests/e2e/fixtures/dialog-reset.html?scenario=${scenario}`)
    await page.getByRole('button', { name: '打开已有记录', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    if (scenario === 'mdm') {
      await expect(dialog.getByRole('textbox', { name: /分类编码/ })).toHaveValue('OLD', {
        timeout: 60_000
      })
    } else if (scenario === 'pmis') {
      const notifier = dialog.getByText('历史通知人员 · EMP-OLD', { exact: false })
      await expect(notifier).toBeVisible()
      await notifier.scrollIntoViewIfNeeded()
      await expect(notifier).toBeInViewport()
      await page.screenshot({ path: info.outputPath('pmis-existing-reference.png') })
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: '新增记录', exact: true }).click()
    await expect(dialog).toBeVisible()
    if (scenario === 'mdm') {
      await expect(dialog.getByRole('textbox', { name: /分类编码/ })).toHaveValue('')
      await dialog.getByRole('textbox', { name: /分类编码/ }).fill('NEW')
      await dialog.getByRole('textbox', { name: /分类名称/ }).fill('新建分类')
    } else if (scenario === 'pmis') {
      const department = dialog.getByRole('combobox', { name: /部门 \/ 产线/ })
      await expect(department).toBeEnabled()
      await department.click()
      await page.getByRole('treeitem').filter({ hasText: '测试车间' }).click()
    } else {
      const content = dialog.getByRole('textbox', { name: /判定标准/ })
      await expect(content).toHaveValue('')
      await content.fill('新建判定标准')
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`${scenario}-new-after-edit.png`) })
    if (scenario === 'pmis') {
      await dialog.getByText('升级通知人员', { exact: true }).scrollIntoViewIfNeeded()
      await expect(dialog.getByText('历史通知人员 · EMP-OLD', { exact: false })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('pmis-new-lower-content.png') })
    }
    await dialog
      .getByRole('button', {
        name: scenario === 'mdm' ? '新增分类' : scenario === 'pmis' ? '保存设置' : '保存判定标准',
        exact: true
      })
      .click()
    await expect.poll(() => saves.length).toBe(1)
    if (scenario === 'pmis') expect(saves[0].body.p_id).toBeNull()
    else if (scenario === 'mdm') expect(saves[0].body.p_payload).not.toHaveProperty('id')
    else expect(saves[0].method).toBe('POST')
    if (scenario === 'pmis') {
      expect(employeeListScans).toBeGreaterThan(0)
      await expect(dialog).toBeHidden()
      referenceFailure = true
      await page.getByRole('button', { name: '打开已有记录', exact: true }).click()
      await expect(dialog).toBeVisible()
      await expect(page.locator('.el-message--error')).toBeVisible()
      await expect(page.getByText('permission denied', { exact: false })).toHaveCount(0)
      await expect(dialog.locator('.el-loading-mask:visible')).toHaveCount(0)
    } else expect(employeeListScans).toBe(0)
    expect(errors).toEqual([])
  })
}
