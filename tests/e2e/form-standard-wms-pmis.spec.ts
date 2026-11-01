import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { dictionaries } from './fixtures/form-standard-wms-pmis-dictionaries'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

function providerModule(directory: string): string {
  const names = readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) =>
      [
        ...readFileSync(join(directory, file), 'utf8').matchAll(
          /^export (?:async )?function (\w+)/gm
        )
      ].map((match) => match[1])
    )
  const exports = [...new Set(names)]
    .map((name) => `export const ${name} = (...args) => window.__formStandardApi('${name}', args);`)
    .join('\n')
  return (
    exports +
    "\nexport const planKindLabel = (kind) => ({inspection:'点检',patrol:'巡检',maintenance:'保养',preventive:'预防维修'})[kind] || '设备';"
  )
}
async function open(page: Page, entry: string, query = '') {
  await prepareIsolatedSession(page)
  await page.route('**/modules/art-supabase-wms/src/api/index.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: providerModule('modules/art-supabase-wms/src/api')
    })
  )
  await page.route('**/modules/art-supabase-pmis/src/api/index.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: providerModule('modules/art-supabase-pmis/src/api')
    })
  )
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const rows = Object.entries(dictionaries).flatMap(([type, options]) =>
        options.map((option, sort) => ({
          ...option,
          id: `${type}-${option.value}`,
          code: option.value,
          status: '1',
          sort,
          dict_type_table: { code: type, name: type }
        }))
      )
      return route.fulfill({
        json: code ? rows.filter((row) => row.dict_type_table.code === code) : rows
      })
    }
    return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } })
  })
  await page.goto(`/tests/e2e/fixtures/form-standard-wms-pmis.html?entry=${entry}${query}`)
  await page.getByTestId('open').click()
  await expect(page.getByTestId('ready')).toHaveText('ready')
  await expect(page.locator('.art-dialog:visible, .art-drawer:visible')).toHaveCount(1)
  await expect(
    page.locator('.art-dialog__viewport.is-loading, .art-drawer__viewport.is-loading')
  ).toHaveCount(0)
}

for (const [entry, tabs] of [
  ['plan', ['方案信息', '执行对象', '检查项目']],
  ['repair', ['报修信息', '维修处置']],
  ['count', ['基本信息', '盘点参数', '盘点范围']],
  ['stock', ['单据表头', '物料明细']],
  ['sales', ['单据表头', '物料明细']],
  ['gain', ['单据表头', '物料明细']],
  ['transfer', ['单据表头', '物料明细']],
  ['assembly', ['来源组件', '成品入库']]
] as const) {
  test(`${entry} 真实组件横向页签与渲染`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, entry)
    for (const name of tabs) {
      await page.getByRole('tab', { name, exact: true }).click()
      await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
    }
    expect(errors).toEqual([])
    mkdirSync('.artifacts/forms-standard-migration/wms-pmis', { recursive: true })
    await page.screenshot({ path: `.artifacts/forms-standard-migration/wms-pmis/${entry}.png` })
  })
}

test('初始库存隐藏明细校验切页、红框、具体数字规则与保存', async ({ page }) => {
  await open(page, 'stock')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('tab', { name: '物料明细', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(
    page.getByText('第 10 行期初数量必须为大于零的有效数字', { exact: true }).last()
  ).toBeVisible()
  const input = page.locator('[data-art-edit-field="openingQuantity"] input').first()
  await expect(input).toBeFocused()
  await expect(page.locator('[data-art-edit-field="openingQuantity"]').first()).toHaveClass(
    /is-validation-error/
  )
  await input.fill('2')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__formStandardCalls.filter((call) => call.name === 'saveWmsInitialStock').length
      )
    )
    .toBe(1)
})

function calls(page: Page, name: string) {
  return page.evaluate(
    (method) => window.__formStandardCalls.filter((call) => call.name === method),
    name
  )
}
function item(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"el-form-item")][1]')
}

for (const kind of ['maintenance', 'repair']) {
  test(`部门${kind}设置保持紧凑单页并可保存`, async ({ page }, info) => {
    await open(page, 'setting', `&kind=${kind}`)
    await expect(page.getByRole('tab')).toHaveCount(0)
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await expect.poll(async () => (await calls(page, 'savePmisDepartmentSetting')).length).toBe(1)
    await expect(page.locator('.art-dialog:visible')).toHaveCount(0)
    await page.getByTestId('open').click()
    await expect(page.getByRole('tab')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`setting-${kind}-single-page.png`) })
  })
}

test('部门保养设置通过配置化员工多选保存两名执行人并保留姓名', async ({ page }, info) => {
  await open(page, 'setting', '&kind=maintenance')
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const employees = [
    {
      id: 'employee-one',
      tenantId,
      employeeNo: 'EMP-ONE',
      employeeName: '验收员工甲',
      employmentStatus: 'active'
    },
    {
      id: 'employee-two',
      tenantId,
      employeeNo: 'EMP-TWO',
      employeeName: '验收员工乙',
      employmentStatus: 'active'
    }
  ]
  await page.route('**/rest/v1/rpc/hr_list_employee_selector_secure', (route) =>
    route.fulfill({ json: { records: employees, total: employees.length, fieldAccess: {} } })
  )
  const dialog = page.locator('.art-dialog:visible').first()
  const responsible = dialog.locator('[data-art-form-item-key="responsibleEmployeeIds"]')
  await responsible.getByRole('textbox').click()
  const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
  for (const employee of employees) {
    const checkbox = picker
      .getByRole('row')
      .filter({ hasText: employee.employeeName })
      .getByRole('checkbox')
    await checkbox.locator('..').click()
    await expect(checkbox).toBeChecked()
  }
  await picker.locator('.art-dialog__footer-actions button').last().click()
  await expect(responsible).toContainText('验收员工甲')
  await expect(responsible).toContainText('验收员工乙')
  await dialog.screenshot({
    path: info.outputPath('multiple-employees.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect.poll(async () => (await calls(page, 'savePmisDepartmentSetting')).length).toBe(1)
  const saved = (await calls(page, 'savePmisDepartmentSetting'))[0].args[0] as {
    responsibleEmployeeIds: string[]
  }
  expect(saved.responsibleEmployeeIds).toEqual(employees.map((employee) => employee.id))
})

for (const kind of ['inspection', 'maintenance']) {
  test(`执行${kind}保留短字段公共区、结果与相册，提交校验并可保存`, async ({ page }) => {
    await open(page, 'execution', `&kind=${kind}`)
    const resultTab = page.getByRole('tab', { name: '逐项检查', exact: true })
    if (kind === 'inspection') await expect(page.getByRole('tab')).toHaveCount(0)
    else {
      await expect(page.getByRole('tab')).toHaveCount(2)
      await page.getByRole('tab', { name: '作业相册', exact: true }).click()
    }
    const submit = page.getByRole('button', { name: '提交并完成', exact: true })
    await submit.click()
    if (kind === 'maintenance') await expect(resultTab).toHaveAttribute('aria-selected', 'true')
    await expect.poll(async () => (await calls(page, 'completePmisTask')).length).toBe(0)
    await page.getByRole('radio', { name: '正常', exact: true }).locator('..').click()
    await expect(page.getByRole('radio', { name: '正常', exact: true })).toBeChecked()
    await submit.click()
    await expect.poll(async () => (await calls(page, 'completePmisTask')).length).toBe(1)
  })
}

for (const kind of ['inspection', 'patrol', 'maintenance', 'preventive']) {
  test(`${kind}方案首错定位与跨页保值后保存`, async ({ page }) => {
    await open(page, 'plan', `&kind=${kind}`)
    const name = item(
      page,
      `${({ inspection: '点检', patrol: '巡检', maintenance: '保养', preventive: '预防维修' } as Record<string, string>)[kind]}方案名称`
    ).getByRole('textbox')
    await name.clear()
    await page.getByRole('tab', { name: '执行对象', exact: true }).click()
    await page.getByRole('button', { name: '保存方案', exact: true }).click()
    await expect(page.getByRole('tab', { name: '方案信息', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(name).toBeFocused()
    await name.fill('跨页签方案验收')
    await page.getByRole('tab', { name: '执行对象', exact: true }).click()
    await page.getByRole('button', { name: '保存方案', exact: true }).click()
    await expect.poll(async () => (await calls(page, 'savePmisPlan')).length).toBe(1)
    const payload = (await calls(page, 'savePmisPlan'))[0].args[0] as { planName: string }
    expect(payload.planName).toBe('跨页签方案验收')
  })
}

test('维修工单必填首错定位、跨页保值和保存', async ({ page }) => {
  await open(page, 'repair')
  const symptom = item(page, '故障现象').getByRole('textbox')
  await symptom.clear()
  await page.getByRole('tab', { name: '维修处置', exact: true }).click()
  await page.getByRole('button', { name: '保存工单', exact: true }).click()
  await expect(page.getByRole('tab', { name: '报修信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(symptom).toBeFocused()
  await symptom.fill('跨页签故障现象')
  await page.getByRole('tab', { name: '维修处置', exact: true }).click()
  await item(page, '维修方案').getByRole('textbox').fill('更换组件后复测')
  await page.getByRole('button', { name: '保存工单', exact: true }).click()
  await expect.poll(async () => (await calls(page, 'savePmisRepairTask')).length).toBe(1)
})

for (const [entry, field, method] of [
  ['sales', 'quantity', 'saveWmsInitialSalesDocument'],
  ['gain', 'varianceQuantity', 'saveWmsCountAdjustment'],
  ['transfer', 'quantity', 'saveWmsTransferRequest']
] as const) {
  test(`${entry} 明细首错红框、隐藏页定位和修正保存`, async ({ page }) => {
    await open(page, entry)
    await page.getByRole('tab', { name: '物料明细', exact: true }).click()
    const cell = page.locator(`[data-art-edit-field="${field}"]`).first()
    const input = cell.locator('input')
    await input.clear()
    await input.press('Tab')
    await page.getByRole('tab', { name: '单据表头', exact: true }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('tab', { name: '物料明细', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(input).toBeFocused()
    await expect(cell).toHaveClass(/is-validation-error/)
    await input.fill('2')
    await input.press('Tab')
    await expect(cell).not.toHaveClass(/is-validation-error/)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await calls(page, method)).length).toBe(1)
  })
}

for (const entry of ['stock', 'sales', 'gain', 'transfer']) {
  test(`${entry} 详情分类页签只读且不触发保存`, async ({ page }, info) => {
    await open(page, entry, '&mode=view')
    for (const name of ['单据表头', '物料明细']) {
      await page.getByRole('tab', { name, exact: true }).click()
      await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
      await expect(
        page
          .getByRole('tabpanel')
          .filter({ visible: true })
          .locator('input:visible, textarea:visible')
      ).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`${entry}-readonly.png`) })
  })
}
