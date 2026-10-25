import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('施工号空白校验、编辑失败重试与新增草稿重置', async ({ page }, testInfo) => {
  const writes: unknown[] = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/wms_save_project_construction_secure', (route) => {
    writes.push(route.request().postDataJSON())
    return route.fulfill(
      fail
        ? { status: 400, json: { code: 'P0001', message: '测试保存失败，请重试' } }
        : { json: 'section-test' }
    )
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试施工号创建', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  await dialog.getByRole('textbox', { name: /施工号/, exact: false }).fill('   ')
  await dialog.getByRole('textbox', { name: /施工分项名称/ }).fill('   ')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.locator('.el-form-item__error')).toContainText([
    '请选择项目',
    '请输入施工号',
    '请输入施工分项名称'
  ])
  expect(writes).toHaveLength(0)
  await page.screenshot({
    path: testInfo.outputPath('section-whitespace.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '测试施工号编辑', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: /所属项目/ })).toBeDisabled()
  await expect(dialog.getByRole('textbox', { name: /施工号/ })).toBeDisabled()
  const name = dialog.getByRole('textbox', { name: /施工分项名称/ })
  await name.fill('修改后的施工分项')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('测试保存失败，请重试', { exact: false })).toBeVisible()
  await expect(name).toHaveValue('修改后的施工分项')
  expect(writes).toHaveLength(1)
  fail = false
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(2)
  expect(writes[1]).toEqual(writes[0])
  await page.getByRole('button', { name: '测试施工号创建', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: /施工号/ })).toHaveValue('')
  await expect(name).toHaveValue('')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html?sectionProjects=true')
  await page.getByRole('button', { name: '测试施工号创建', exact: true }).click()
  await dialog.getByRole('combobox', { name: /所属项目/ }).click()
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('option', { name: '测试项目 active · PROJECT-ACTIVE', exact: true }).click()
  await dialog.getByRole('textbox', { name: /施工号/ }).fill('  SECTION-NEW-001  ')
  await name.fill('  新增施工分项  ')
  await dialog.getByRole('textbox', { name: '说明', exact: true }).fill('  测试说明  ')
  await page.screenshot({
    path: testInfo.outputPath('section-create-valid.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(3)
  expect(writes[2]).toEqual({
    p_payload: {
      project_id: 'project-active',
      construction_no: 'SECTION-NEW-001',
      section_name: '新增施工分项',
      status: 'active',
      remark: '测试说明'
    }
  })
  await page.getByRole('button', { name: '测试施工号创建', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: /施工号/ })).toHaveValue('')
  await expect(name).toHaveValue('')
  await dialog.getByRole('combobox', { name: /所属项目/ }).click()
  await page.getByRole('option', { name: '测试项目 active · PROJECT-ACTIVE', exact: true }).click()
  await dialog.getByRole('textbox', { name: /施工号/ }).fill('SECTION-NEW-002')
  await name.fill('第二张新增施工分项')
  await dialog.getByRole('textbox', { name: '说明', exact: true }).fill('第二张测试说明')
  await page.screenshot({
    path: testInfo.outputPath('section-create-second.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(4)
  expect(writes[3]).toEqual({
    p_payload: {
      project_id: 'project-active',
      construction_no: 'SECTION-NEW-002',
      section_name: '第二张新增施工分项',
      status: 'active',
      remark: '第二张测试说明'
    }
  })
})
