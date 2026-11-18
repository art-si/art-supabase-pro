import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

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
    const verifySaveLock = mode === 'create' || mode === 'edit' || mode === 'failure'
    const narrow = (page.viewportSize()?.width ?? 1440) <= 640
    const appearance: Parameters<typeof prepareAppearance>[1] = {
      theme: narrow || testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light',
      boxBorderMode: !narrow && !testInfo.project.name.includes('shadow')
    }
    if (verifySaveLock) await prepareAppearance(page, appearance)
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
    let releaseSave = () => {}
    const firstSave = new Promise<void>((resolve) => (releaseSave = resolve))
    await page.route('**/rest/v1/tms_expense_item?*', async (route) => {
      if (route.request().method() !== 'GET') {
        const payload = route.request().postDataJSON()
        writes.push(payload)
        const firstWrite = writes.length === 1
        expect(route.request().method()).toBe(
          mode === 'create' || mode === 'child' ? 'POST' : 'PATCH'
        )
        if (mode !== 'create' && mode !== 'child')
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${id}`)
        if (verifySaveLock && firstWrite) await firstSave
        if (mode === 'failure' && firstWrite)
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({
          headers: { 'content-range': '0-0/1' },
          json: { id, ...payload }
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
    if (verifySaveLock) {
      await assertAppearance(page, appearance)
      await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
      await expect
        .poll(() =>
          page.locator('.el-table__body-wrapper').evaluate((element) => element.clientHeight)
        )
        .toBeGreaterThan(80)
      const tableCard = page.locator('.art-table-card').first()
      if (appearance.boxBorderMode)
        await expect
          .poll(() => tableCard.evaluate((element) => getComputedStyle(element).boxShadow))
          .toBe('none')
      else
        await expect
          .poll(() => tableCard.evaluate((element) => getComputedStyle(element).boxShadow))
          .not.toBe('none')
    }
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
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toBeEditable()
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toBeFocused()
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
    if (verifySaveLock) {
      const name = dialog.locator('[data-art-form-item-key="itemName"] input')
      const viewport = dialog.locator('.art-dialog__viewport')
      const content = dialog.locator('.art-dialog__content')
      const confirm = dialog.getByRole('button', {
        name: mode === 'create' ? '确认新增' : '保存修改',
        exact: true
      })
      try {
        await testInfo.attach('pending-save-overlay-state', {
          body: JSON.stringify(
            await name.evaluate((element: HTMLInputElement) => ({
              value: element.value,
              inert: element.closest('.art-dialog__content')?.hasAttribute('inert'),
              busy: element
                .closest('.art-dialog')
                ?.querySelector('.art-dialog__viewport')
                ?.getAttribute('aria-busy')
            })),
            null,
            2
          ),
          contentType: 'application/json'
        })
        await dialog.screenshot({
          path: testInfo.outputPath('expense-item-pending-save.png'),
          animations: 'disabled'
        })
        await expect(viewport).toHaveAttribute('aria-busy', 'true')
        await expect(content).toHaveJSProperty('inert', true)
        await expect(content).toHaveAttribute('aria-hidden', 'true')
        await expect(viewport.locator(':scope > .art-overlay-loading')).toHaveCount(1)
        await expect(dialog.locator('.art-overlay-loading')).toHaveCount(1)
        await expect(dialog.getByText('正在保存费用项目…', { exact: true })).toBeVisible()
        await expect(dialog.getByText('请稍候，完成后即可继续操作', { exact: true })).toBeVisible()
        await expect(confirm).toBeDisabled()
        await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
        expect(
          await name.evaluate((element: HTMLInputElement) => {
            element.focus()
            return document.activeElement === element
          })
        ).toBe(false)
        await page.keyboard.type('保存期间不能改写')
        await expect(name).toHaveValue('  新费用分组  ')
        await confirm.dispatchEvent('click')
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        expect(writes).toHaveLength(1)
      } finally {
        releaseSave()
      }
    }
    const expectedPayload = {
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
    }
    expect(writes[0]).toEqual(expectedPayload)
    if (mode === 'failure') {
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
      await expect(dialog.locator('.art-dialog__content')).toHaveJSProperty('inert', false)
      await expect(dialog.locator('.art-overlay-loading')).toHaveCount(0)
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue('  新费用分组  ')
      await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toBeEditable()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
      await page.screenshot({
        path: testInfo.outputPath('expense-item-save-failure.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('textbox', { name: /项目名称/ }).fill('  费用分组重试  ')
      await dialog.getByRole('button', { name: '保存修改', exact: true }).click()
      await expect.poll(() => writes.length).toBe(2)
      expect(writes[1]).toEqual({ ...expectedPayload, item_name: '费用分组重试' })
      await expect(dialog).toBeHidden()
    } else await expect(dialog).not.toBeVisible()
  })
}
