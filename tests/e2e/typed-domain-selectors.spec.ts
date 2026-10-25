import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const cases = [
  {
    kind: 'site',
    title: '选择违章地点',
    placeholder: '从场所维护中选择',
    label: '零号场所',
    context: '测试组织',
    multiple: false
  },
  {
    kind: 'standard',
    title: '选择违章项目',
    placeholder: '选择一个或多个违章项目',
    label: 'STD-0',
    context: '测试分类',
    multiple: true
  },
  {
    kind: 'accident',
    title: '选择关联事故',
    placeholder: '点击选择事故名称',
    label: 'ACC-0',
    context: '测试事故地点',
    multiple: false
  },
  {
    kind: 'inspection',
    title: '选择排查标准',
    placeholder: '选择一条或多条排查标准',
    label: 'ITEM-0',
    context: '测试排查标准',
    multiple: true
  },
  {
    kind: 'equipment',
    title: '选择设备',
    placeholder: '请选择一台生产设备',
    label: 'EQ-0',
    context: '测试产线',
    multiple: false
  },
  {
    kind: 'equipment-multiple',
    title: '选择适用设备',
    placeholder: '选择一台或多台生产设备',
    label: 'EQ-0',
    context: '测试产线',
    multiple: true
  }
]

for (const scenario of cases) {
  test(`${scenario.kind} 复用泛型选择并保留业务记录`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const inspectionRanges: Array<{ offset: number; limit: number }> = []
    const ids =
      scenario.kind === 'inspection' ? Array.from({ length: 12 }, (_, i) => String(i)) : ['0', '1']
    const records = ids.map((id) => ({
      id,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      business_marker: `marker-${id}`,
      accident_no: `ACC-${id}`,
      accident_name: id === '0' ? '零号事故' : '一号事故',
      accident_time: '2026-10-09T08:00:00+08:00',
      accident_location: '测试事故地点',
      item_code: `ITEM-${id}`,
      inspection_content: id === '0' ? '零号排查项' : '一号排查项',
      status: 'enabled',
      standard: { id: 'standard-test', standard_name: '测试排查标准', standard_code: 'STD-001' },
      equipment_code: `EQ-${id}`,
      equipment_name: id === '0' ? '零号设备' : '一号设备',
      operation_status: 'normal',
      department: { id: 'department-test', department_code: 'DEP-001', department_name: '测试产线' }
    }))
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const supported =
        /(?:smis_list_accident_report_options_secure|smis_inspection_item|mdm_equipment)$/.test(
          url.pathname
        )
      const filtered =
        url.searchParams.get('or')?.includes('零') ||
        route.request().postDataJSON()?.p_keyword === '零'
      const matches = supported ? (filtered ? records.slice(0, 1) : records) : []
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? matches.length)
      const isInspection = url.pathname.endsWith('/smis_inspection_item')
      if (isInspection) inspectionRanges.push({ offset, limit })
      const data = isInspection ? matches.slice(offset, offset + limit) : matches
      await route.fulfill({
        json: data,
        headers: {
          'content-range': data.length
            ? `${offset}-${offset + data.length - 1}/${matches.length}`
            : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/typed-domain-selectors.html?kind=${scenario.kind}`)
    const trigger = page.getByRole('textbox', { name: scenario.placeholder, exact: true })
    await expect(trigger).toBeVisible({ timeout: 60_000 })
    await trigger.click()
    const picker = page.getByRole('dialog', { name: scenario.title, exact: true })
    const row = picker.getByRole('row').filter({ hasText: scenario.label })
    await expect(row).toContainText(scenario.context)
    if (scenario.multiple) await row.locator('label.el-checkbox').click()
    else await row.click()
    await picker.getByRole('button', { name: /确.*定/ }).click()
    await expect(page.getByTestId('model')).toHaveText(scenario.multiple ? '["0"]' : '"0"')
    const selected = JSON.parse(await page.getByTestId('records').innerText())
    expect(selected).toMatchObject([{ id: '0', businessMarker: 'marker-0' }])
    if (scenario.kind === 'site') expect(selected[0].organization.organizationName).toBe('测试组织')
    if (scenario.kind === 'inspection')
      expect(selected[0].standard.standardName).toBe('测试排查标准')
    if (scenario.kind.startsWith('equipment'))
      expect(selected[0].department.departmentName).toBe('测试产线')
    if (scenario.multiple) await expect(trigger).toHaveAccessibleName(scenario.placeholder)
    await trigger.click()
    await expect(picker).toBeVisible()
    await expect(picker.locator('.art-data-select-dialog__selected')).toHaveCount(
      scenario.multiple ? 1 : 0
    )
    if (scenario.multiple) await expect(row.getByRole('checkbox')).toBeChecked()
    if (scenario.kind === 'inspection') {
      expect(inspectionRanges).toContainEqual({ offset: 0, limit: 10 })
      await picker.locator('.el-pagination .btn-next').click()
      await expect(picker.getByRole('row').filter({ hasText: 'ITEM-10' })).toBeVisible()
      expect(inspectionRanges).toContainEqual({ offset: 10, limit: 10 })
      await expect(picker.locator('.art-data-select-dialog__selected')).toContainText('ITEM-0')
      await picker.locator('.el-pagination .btn-prev').click()
      await expect(row.getByRole('checkbox')).toBeChecked()
    }
    const search = picker.locator('.art-data-select-dialog__search input').first()
    await search.fill('零')
    await search.press('Enter')
    await expect(row).toBeVisible()
    const secondLabel = scenario.kind === 'site' ? '一号场所' : scenario.label.replace(/0$/, '1')
    await expect(picker.getByRole('row').filter({ hasText: secondLabel })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('picker-record.png'), animations: 'disabled' })
    if (scenario.kind === 'equipment-multiple') {
      for (const theme of ['light', 'dark']) {
        for (const box of ['border-mode', 'shadow-mode']) {
          await page.evaluate(
            ({ theme, box }) => {
              document.documentElement.classList.toggle('dark', theme === 'dark')
              document.documentElement.dataset.boxMode = box
            },
            { theme, box }
          )
          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
            .toBeLessThanOrEqual(1)
          await page.screenshot({
            path: info.outputPath(`equipment-${theme}-${box}.png`),
            animations: 'disabled'
          })
        }
      }
    }
    await picker.getByRole('button', { name: /取.*消/ }).click()
    await expect(picker).toBeHidden()
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await expect(page.getByTestId('model')).toHaveText(scenario.multiple ? '[]' : 'null')
    await expect(page.getByTestId('records')).toHaveText('[]')
    if (scenario.kind.startsWith('equipment')) {
      await page.getByRole('button', { name: '移除设备租户上下文', exact: true }).click()
      await expect(trigger).toBeDisabled()
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
