import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('两条空白出差新增、组织树、行程和撤权失败恢复', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const saved: Array<{
    p_payload: Record<string, unknown>
    p_lines: Array<Record<string, unknown>>
  }> = []
  let attempts = 0
  let fail = true
  const organizations = [
    { id: 'group', parent_id: null, organization_type: 'group', organization_name: '验收集团' },
    {
      id: 'company',
      parent_id: 'group',
      organization_type: 'company',
      organization_name: '验收公司'
    },
    ...[1, 2].map((index) => ({
      id: `department-${index}`,
      parent_id: 'company',
      organization_type: 'department',
      organization_name: `验收部门${index}`
    }))
  ].map((row) => ({ ...row, tenant_id: tenant, organization_code: row.id, status: '1' }))
  await page.route('**/data/pca-code.json', (route) =>
    route.fulfill({
      json: [
        {
          code: '11',
          name: '验收省',
          children: [
            { code: '1101', name: '验收市', children: [{ code: '110101', name: '验收区' }] }
          ]
        }
      ]
    })
  )
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'fmsTravelTransportMode'
          ? [['high_speed_rail', '高铁']]
          : code === 'fmsTravelType'
            ? [['general', '一般出差']]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'mdm_organization') return route.fulfill({ json: organizations })
    if (name === 'fms_list_expense_applicants_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: 'employee',
              tenantId: tenant,
              employeeName: '验收员工',
              employeeNo: 'QA001',
              organizationId: 'department-1',
              organizationName: '验收部门1'
            }
          ],
          total: 1,
          fieldAccess: {}
        }
      })
    if (name === 'mdm_employee_assignment')
      return route.fulfill({
        json: [{ id: 'assignment', business_title: '验收职位', primary_assignment: true }]
      })
    if (name === 'tms_expense_item')
      return route.fulfill({
        json: [
          {
            id: 'expense',
            item_name: '验收差旅费',
            item_code: 'TRAVEL',
            sort: 1,
            is_enabled: true,
            is_selectable: true
          }
        ]
      })
    if (name === 'save_fms_travel_application_draft_secure') {
      attempts++
      if (fail)
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '出差草稿保存失败，请重试' }
        })
      saved.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: `new-${saved.length}`, status: 'draft' } })
    }
    if (name === 'fms_travel_application')
      return route.fulfill({
        json: saved.map((row, index) => ({
          id: `new-${index + 1}`,
          application_no: `QA-NEW-TRAVEL-${index + 1}`,
          status: 'draft',
          applicant_name: '验收员工',
          expense_department_name: `验收部门${index + 1}`,
          requested_amount: row.p_lines.reduce(
            (total, line) => total + Number(line.requested_amount),
            0
          ),
          ...row.p_payload
        })),
        headers: {
          'content-range': saved.length ? `0-${saved.length - 1}/${saved.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_travel&theme=${theme}&permissionControls=1&permissions=FinanceTravelApplication:View,FinanceTravelApplication:Add`
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: '新增出差申请', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增出差申请', exact: true })
    const save = dialog.getByRole('button', { name: '保存草稿', exact: true })
    await save.click()
    expect(attempts).toBe(index === 1 ? 0 : 2)
    await dialog.getByPlaceholder('选择申请人', { exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
    await picker.getByText('验收员工', { exact: true }).click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).toContainText('申请人公司：验收公司')
    await expect(dialog.locator('.el-form-item').filter({ hasText: '职位' })).toContainText(
      '验收职位'
    )
    await dialog.getByRole('combobox', { name: '费用承担部门' }).click()
    await page
      .getByRole('treeitem', { name: '验收集团' })
      .locator('.el-tree-node__expand-icon')
      .first()
      .click()
    await page
      .getByRole('treeitem', { name: '验收公司', exact: true })
      .locator('.el-tree-node__expand-icon')
      .first()
      .click()
    if (index === 2)
      await page.screenshot({
        path: info.outputPath('travel-organization-tree.png'),
        fullPage: true
      })
    await page.getByRole('treeitem', { name: `验收部门${index}`, exact: true }).click()
    await dialog.getByRole('textbox', { name: /事由/ }).fill(`新增出差事由${index}`)
    await dialog.getByRole('button', { name: '添加行程', exact: true }).click()
    const itinerary = page.getByRole('dialog', { name: '添加行程', exact: true })
    for (const label of ['出发地', '目的地']) {
      await itinerary.getByRole('textbox', { name: new RegExp(label) }).click()
      for (const place of ['验收省', '验收市', '验收区']) {
        await page.getByRole('menuitem', { name: place, exact: true }).click()
        if (index === 2 && place === '验收市' && label === '目的地') {
          const popper = page.locator('.travel-region-popper:visible')
          await expect
            .poll(() =>
              popper.evaluate((element) => {
                const rect = element.getBoundingClientRect()
                return rect.left >= 0 && rect.right <= innerWidth
              })
            )
            .toBe(true)
          await popper.screenshot({ path: info.outputPath('travel-region-options.png') })
        }
      }
    }
    await itinerary.getByRole('combobox', { name: '费用项目' }).click()
    await page.getByRole('treeitem', { name: '验收差旅费', exact: true }).click()
    const amount = itinerary.getByRole('spinbutton', { name: '申请金额（元）' })
    await amount.fill(String(index * 100))
    await amount.blur()
    await amount.scrollIntoViewIfNeeded()
    if (index === 2)
      await itinerary.screenshot({ path: info.outputPath('travel-itinerary-filled.png') })
    await itinerary.getByRole('button', { name: '添加行程', exact: true }).click()
    await expect(itinerary).not.toBeVisible()
    if (index === 2) await dialog.screenshot({ path: info.outputPath('travel-create-filled.png') })
    await page.keyboard.press('Alt+Shift+4')
    await save.click()
    await expect(page.locator('.el-message--warning')).toContainText('操作范围或权限已变化')
    expect(attempts).toBe(index === 1 ? 0 : 2)
    await page.keyboard.press('Alt+Shift+5')
    await save.click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toContainText('出差草稿保存失败')
      await expect(dialog.getByRole('textbox', { name: /事由/ })).toHaveValue('新增出差事由1')
      fail = false
      await save.click()
    }
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(`QA-NEW-TRAVEL-${index}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: `QA-NEW-TRAVEL-${index}` })).toContainText(
      `${index * 100}.00`
    )
    expect(saved[index - 1].p_payload).toMatchObject({
      tenant_id: tenant,
      applicant_employee_id: 'employee',
      expense_department_id: `department-${index}`,
      reason: `新增出差事由${index}`
    })
    expect(saved[index - 1].p_payload.id).toBeUndefined()
    expect(saved[index - 1].p_lines).toHaveLength(1)
    expect(saved[index - 1].p_lines[0]).toMatchObject({
      requested_amount: index * 100,
      departure_region_path: ['11', '1101', '110101'],
      destination_region_path: ['11', '1101', '110101']
    })
    await expect(page.locator('.el-message')).toHaveCount(0)
  }
  await expect(page.getByText('共 2 条', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('travel-new-two-records.png'), fullPage: true })
})
