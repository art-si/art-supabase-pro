import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of [
  'create',
  'edit',
  'failure',
  'revoked',
  'child',
  'denied',
  'selectable',
  'accounting',
  'group-reset',
  'parent-exclusion',
  'blank'
] as const) {
  test(`费用项目保存 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const dictionaryItems: Record<string, Array<[string, string]>> = {
      commonBoolean: [
        ['true', '是'],
        ['false', '否']
      ],
      commonEnabledStatus: [
        ['enabled', '启用'],
        ['disabled', '停用']
      ],
      fmsExpenseItemAccountingMode: [
        ['false', '分组'],
        ['true', '可记账项目']
      ],
      tmsWaybillCostType: [
        ['toll', '路桥费'],
        ['driver_payroll', '司机薪酬'],
        ['vehicle_insurance', '车辆保险'],
        ['vehicle_depreciation', '车辆折旧'],
        ['vehicle_maintenance', '维修保养'],
        ['traffic_fine', '违章罚款']
      ]
    }
    await page.route('**/rest/v1/sys_dictionary?*', (route) => {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      return route.fulfill({
        json: Object.entries(dictionaryItems)
          .filter(([type]) => !code || code === type)
          .flatMap(([type, rows]) =>
            rows.map(([value, label], index) => ({
              id: `${type}-${value}`,
              type_id: type,
              code: value,
              value,
              label,
              sort: index,
              status: '1',
              dict_type_table: { code: type, name: type }
            }))
          )
      })
    })
    const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const writes: Record<string, unknown>[] = []
    await page.route('**/rest/v1/tms_expense_item?*', (route) => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().postDataJSON())
        expect(route.request().method()).toBe(
          mode === 'create' || mode === 'child' ? 'POST' : 'PATCH'
        )
        if (mode !== 'create' && mode !== 'child')
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${id}`)
        if (mode === 'failure')
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({
          headers: { 'content-range': '0-0/1' },
          json: { id, ...writes.at(-1) }
        })
      }
      return route.fulfill({
        headers: { 'content-range': '0-0/1' },
        json: [
          {
            id,
            item_code: 'EXP-001',
            item_name: '测试费用项目',
            parent_id: null,
            tenant_id: 'context-test-tenant',
            is_selectable: false,
            reimbursement_allowed: true,
            is_enabled: true,
            sort: 0,
            remark: '旧备注',
            create_by: '测试审计人',
            create_time: '2026-10-07T00:00:00Z'
          },
          ...(mode === 'parent-exclusion'
            ? [
                {
                  id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
                  parent_id: id,
                  item_code: 'CHILD001',
                  item_name: '当前项目的下级',
                  is_selectable: false,
                  sort: 1
                },
                {
                  id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
                  parent_id: null,
                  item_code: 'OTHER001',
                  item_name: '可选上级项目',
                  is_selectable: false,
                  sort: 2
                }
              ]
            : [])
        ]
      })
    })
    const permission =
      mode === 'create'
        ? 'Add'
        : mode === 'child'
          ? 'AddChild'
          : mode === 'denied'
            ? 'View'
            : 'Edit'
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?target=expense-item&expensePermission=${permission}`
    )
    await expect(page.locator('.el-table__body-wrapper')).toContainText('EXP-001')
    if (mode === 'denied') {
      await expect(page.getByRole('button', { name: '新增一级项目', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
      expect(writes).toEqual([])
      return
    }
    if (mode === 'child') {
      await page.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '新增下级', exact: true }).click()
    } else
      await page
        .getByRole('button', { name: mode === 'create' ? '新增一级项目' : '编辑', exact: true })
        .first()
        .click()
    const dialog = page.getByRole('dialog', {
      name:
        mode === 'create'
          ? '新增一级费用项目'
          : mode === 'child'
            ? '新增下级费用项目'
            : '编辑费用项目'
    })
    await expect(
      dialog.getByRole('button', {
        name: mode === 'create' || mode === 'child' ? '确认新增' : '保存修改',
        exact: true
      })
    ).toBeEnabled()
    if (mode === 'parent-exclusion') {
      await dialog.getByRole('combobox', { name: '上级项目', exact: true }).click()
      await expect(page.getByRole('treeitem', { name: '测试费用项目', exact: true })).toHaveCount(0)
      await expect(page.getByRole('treeitem', { name: '当前项目的下级', exact: true })).toHaveCount(
        0
      )
      await page.getByRole('treeitem', { name: '可选上级项目', exact: true }).click()
    }
    await dialog.getByRole('textbox', { name: /项目编码/ }).fill('EXP-NEW')
    await dialog.getByRole('textbox', { name: /项目名称/ }).fill('  新费用分组  ')
    if (mode === 'blank') {
      await dialog.getByRole('textbox', { name: /项目名称/ }).fill('   ')
      await dialog.getByRole('button', { name: '保存修改', exact: true }).click()
      await expect(dialog.getByText('请输入费用项目名称', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue('   ')
      expect(writes).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath('blank-required.png'),
        animations: 'disabled'
      })
      return
    }
    await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('   ')
    if (mode === 'selectable' || mode === 'group-reset' || mode === 'accounting') {
      await dialog.getByText('可记账项目', { exact: true }).click()
      await expect(dialog.getByRole('radio', { name: '可记账项目', exact: true })).toBeChecked()
      await dialog.getByRole('combobox', { name: /业务分类/ }).click()
      await page.getByRole('option', { name: '路桥费', exact: true }).click()
      if (mode === 'accounting') {
        for (const label of ['司机薪酬', '车辆保险', '车辆折旧', '维修保养', '违章罚款']) {
          await dialog.getByRole('combobox', { name: /业务分类/ }).click()
          await page.getByRole('option', { name: label, exact: true }).click()
        }
      }
      await dialog.getByText('是', { exact: true }).click()
      await expect(dialog.getByRole('radio', { name: '是', exact: true })).toBeChecked()
      if (mode === 'group-reset') {
        await dialog.getByText('分组', { exact: true }).click()
        await expect(dialog.getByRole('radio', { name: '分组', exact: true })).toBeChecked()
        await expect(dialog.getByRole('combobox', { name: /业务分类/ })).toHaveCount(0)
      }
    }
    await page.screenshot({
      path: testInfo.outputPath('expense-item-save-form.png'),
      animations: 'disabled'
    })
    if (mode === 'revoked')
      await page
        .getByTestId('revoke-delete-permission')
        .evaluate((button: HTMLButtonElement) => button.click())
    await dialog
      .getByRole('button', {
        name: mode === 'create' || mode === 'child' ? '确认新增' : '保存修改',
        exact: true
      })
      .click()
    if (mode === 'revoked') {
      await expect(
        page.getByText('费用项目操作权限已变化，请刷新页面后重试', { exact: true })
      ).toBeVisible()
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue('  新费用分组  ')
      expect(writes).toEqual([])
      return
    }
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toEqual({
      parent_id:
        mode === 'child'
          ? id
          : mode === 'parent-exclusion'
            ? 'cccccccc-cccc-4ccc-accc-cccccccccccc'
            : null,
      item_code: 'EXP-NEW',
      item_name: '新费用分组',
      business_category:
        mode === 'accounting' ? 'traffic_fine' : mode === 'selectable' ? 'toll' : null,
      is_selectable: mode === 'selectable' || mode === 'accounting',
      reimbursement_allowed: mode === 'selectable' || mode === 'accounting',
      is_enabled: true,
      sort: mode === 'create' || mode === 'child' ? 100 : 0,
      remark: null
    })
    if (mode === 'failure') {
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue('  新费用分组  ')
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
      await page.screenshot({
        path: testInfo.outputPath('expense-item-save-failure.png'),
        animations: 'disabled'
      })
    } else await expect(dialog).not.toBeVisible()
  })
}
