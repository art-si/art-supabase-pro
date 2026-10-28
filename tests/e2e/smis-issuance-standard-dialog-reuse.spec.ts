import { expect, test, type Page } from '@playwright/test'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'

async function mockStandardReads(page: Page, kind: 'tool' | 'ppe') {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const body = request.postDataJSON() ?? {}
    calls.push({ path, body })
    if (path.endsWith(`/smis_list_${kind}_scope_options_secure`)) {
      await route.fulfill({
        json:
          body.p_kind === 'position'
            ? [{ id: 'position-test', code: 'POS-001', name: '测试岗位' }]
            : [{ id: 'org-test', code: 'ORG-001', name: '测试组织', parentId: null }]
      })
      return
    }
    if (path.endsWith('/smis_list_materials_secure')) {
      await route.fulfill({
        json: {
          records: [
            {
              id: 'material-test',
              tenantId: tenantA,
              materialCode: 'MAT-001',
              materialName: '测试物料',
              materialType: kind === 'tool' ? 'tool' : 'protective_equipment',
              category: { id: 'category-test', categoryCode: 'CAT-001', categoryName: '测试类别' },
              basicUnit: '件',
              specificationModel: 'M 型',
              imageUrls: [],
              status: 'enabled'
            }
          ],
          total: 1
        }
      })
      return
    }
    if (path.endsWith(`/smis_save_${kind}_issuance_standard_secure`)) {
      await route.fulfill({ json: 'standard-saved' })
      return
    }
    await route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })
  return calls
}

for (const kind of ['tool', 'ppe'] as const) {
  const title = kind === 'tool' ? '工器具' : '防护用品'
  const open = kind === 'tool' ? '打开工具标准' : '打开用品标准'
  const edit = kind === 'tool' ? '编辑工具标准' : '编辑用品标准'

  test(`${title}标准新增、校验、材料选择和业务保存`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    const calls = await mockStandardReads(page, kind)
    await page.goto('/tests/e2e/fixtures/warehouse-selector-reuse.html')
    await page.getByRole('button', { name: open, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `新增${title}发放标准` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`${title}明细标准`, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '保存标准', exact: true }).click()
    await expect(dialog.getByText('请输入发放标准名称', { exact: true })).toBeVisible()
    expect(calls.filter((call) => call.path.includes('/smis_save_'))).toHaveLength(0)

    await dialog.getByPlaceholder('例如：焊接岗位基础防护标准').fill(`${title}测试发放标准`)
    await dialog.getByRole('button', { name: '保存标准', exact: true }).click()
    await expect(page.getByText('适用岗位和适用公司/部门至少选择一项')).toBeVisible()
    await dialog.getByPlaceholder('请选择适用岗位').click()
    const positionPicker = page.getByRole('dialog', { name: '选择适用工种 / 岗位' })
    await expect(positionPicker.getByText('测试岗位', { exact: true })).toBeVisible()
    await positionPicker.locator('.el-table__body-wrapper .el-checkbox').first().click()
    await positionPicker.getByRole('button', { name: '确定', exact: true }).click()
    await dialog.getByRole('button', { name: '保存标准', exact: true }).click()
    await expect(page.getByText(`请至少添加一条${title}明细`)).toBeVisible()

    await dialog.getByPlaceholder('新增明细').click()
    const materialPicker = page.getByRole('dialog', { name: `选择${title}物料` })
    await expect(materialPicker.getByText('测试物料', { exact: true })).toBeVisible()
    await materialPicker.locator('.el-table__body-wrapper .el-checkbox').first().click()
    await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog.getByText('MAT-001', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '保存标准', exact: true }).click()
    await expect
      .poll(
        () =>
          calls.filter((call) => call.path.endsWith(`/smis_save_${kind}_issuance_standard_secure`))
            .length
      )
      .toBe(1)
    const save = calls.find((call) =>
      call.path.endsWith(`/smis_save_${kind}_issuance_standard_secure`)
    )!
    expect(save.body.p_id).toBeNull()
    expect(save.body.p_payload).toMatchObject({
      standard_name: `${title}测试发放标准`,
      position_ids: ['position-test'],
      details: [{ material_id: 'material-test', quota_quantity: 1 }]
    })
    expect(
      calls.find((call) => call.path.endsWith('/smis_list_materials_secure'))?.body.p_material_type
    ).toBe(kind === 'tool' ? 'tool' : 'protective_equipment')
    await dialog.screenshot({ path: info.outputPath(`${kind}-standard-add.png`) })
    expect(errors).toEqual([])
  })

  test(`${title}标准编辑保持既有范围和明细，切换租户后新增清空表单`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
    const calls = await mockStandardReads(page, kind)
    await page.goto('/tests/e2e/fixtures/warehouse-selector-reuse.html')
    await page.getByRole('button', { name: edit, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `编辑${title}发放标准` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByPlaceholder('例如：焊接岗位基础防护标准')).toHaveValue('现有发放标准')
    await expect(dialog.getByText('现有物料', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '保存标准', exact: true }).click()
    await expect
      .poll(
        () =>
          calls.filter((call) => call.path.endsWith(`/smis_save_${kind}_issuance_standard_secure`))
            .length
      )
      .toBe(1)
    const save = calls.find((call) =>
      call.path.endsWith(`/smis_save_${kind}_issuance_standard_secure`)
    )!
    expect(save.body.p_id).toBe('standard-test')
    expect(save.body.p_payload).toMatchObject({
      position_ids: ['position-test'],
      details: [{ material_id: 'material-test', quota_quantity: 2 }]
    })
    await page.getByRole('button', { name: '切换租户 B' }).click()
    await page.getByRole('button', { name: open, exact: true }).click()
    const fresh = page.getByRole('dialog', { name: `新增${title}发放标准` })
    await expect(fresh.getByPlaceholder('例如：焊接岗位基础防护标准')).toHaveValue('')
    await expect(fresh.getByText('暂无明细', { exact: true })).toBeVisible()
    await fresh.screenshot({ path: info.outputPath(`${kind}-standard-dark-narrow.png`) })
    expect(errors).toEqual([])
  })
}
