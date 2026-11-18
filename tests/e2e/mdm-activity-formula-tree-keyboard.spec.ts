import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('活动公式参数树键盘：单次插入且不提交表单', async ({ page }) => {
  await prepareIsolatedSession(page)
  const purpose = 'report_preparation'
  const parameters = [
    {
      id: 'parameter-group',
      parent_id: null,
      node_type: 'group',
      code: 'GROUP',
      name: '加工参数',
      related_field: '',
      enabled: true
    },
    {
      id: 'parameter-valid',
      parent_id: 'parameter-group',
      node_type: 'parameter',
      code: 'PROCESS_QTY',
      name: '加工数量',
      related_field: 'process_qty',
      enabled: true
    },
    {
      id: 'parameter-disabled',
      parent_id: 'parameter-group',
      node_type: 'parameter',
      code: 'DISABLED_QTY',
      name: '停用数量',
      related_field: 'disabled_qty',
      enabled: false
    },
    {
      id: 'parameter-unmapped',
      parent_id: 'parameter-group',
      node_type: 'parameter',
      code: 'UNMAPPED',
      name: '未映射参数',
      related_field: '',
      enabled: true
    }
  ].map((parameter, sort) => ({
    ...parameter,
    tenant_id: 'test-tenant',
    sort,
    purpose,
    activity_unit: parameter.node_type === 'parameter' ? 'minute' : null,
    remark: ''
  }))
  const writes: string[] = []
  const reads: Array<string | null> = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      url.pathname.includes('activity_formula') &&
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())
    )
      writes.push(`${request.method()} ${url.pathname}`)
    if (url.pathname.endsWith('/mdm_activity_formula_parameter') && request.method() === 'GET') {
      reads.push(url.searchParams.get('purpose'))
      return route.fulfill({ json: parameters })
    }
    if (url.pathname.endsWith('/sys_dictionary')) {
      const value = url.search.includes('mdmFormulaPurpose')
        ? purpose
        : url.search.includes('commonBoolean')
          ? 'true'
          : url.search.includes('mdmActivityType')
            ? 'machine'
            : 'minute'
      return route.fulfill({ json: [{ value, label: value, status: '1' }] })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/engineering-dictionary-options.html?mode=activity-formula')
  await page.getByRole('button', { name: '打开表单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增活动公式', exact: true })
  await expect(dialog).toBeVisible({ timeout: 90_000 })
  await dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('用途', { exact: true }) })
    .locator('.el-select')
    .click()
  await page.getByRole('option', { name: '汇报 · 准备活动', exact: true }).click()
  await expect.poll(() => reads.at(-1)).toBe(`eq.${purpose}`)

  const tree = dialog.locator('.parameter-panel__tree')
  const group = tree.locator('[role="treeitem"][data-key="parameter-group"]')
  const parameter = tree.locator('[role="treeitem"][data-key="parameter-valid"]')
  const tokens = dialog.locator('.formula-canvas .formula-token')
  await expect(parameter).toBeVisible()
  await dialog.evaluate((element) => {
    element.setAttribute('data-submit-count', '0')
    element.addEventListener(
      'submit',
      () => {
        element.setAttribute(
          'data-submit-count',
          String(Number(element.getAttribute('data-submit-count')) + 1)
        )
      },
      { capture: true }
    )
  })

  await group.press('ArrowLeft')
  await expect(parameter).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(parameter).toBeVisible()
  await page.keyboard.press('Enter')
  await tree.locator('[role="treeitem"][data-key="parameter-disabled"]').press('Enter')
  await tree.locator('[role="treeitem"][data-key="parameter-unmapped"]').press('Space')
  await expect(tokens).toHaveCount(0)

  await parameter.press('Space')
  await expect(tokens).toHaveText(['加工数量'])
  await expect(dialog.locator('.formula-editor__preview-grid')).toContainText('process_qty')
  await page.keyboard.down('Enter')
  await page.keyboard.down('Enter')
  await page.keyboard.up('Enter')
  await expect(tokens).toHaveText(['加工数量', '加工数量'])

  await parameter.getByRole('button', { name: '编辑参数节点', exact: true }).press('Enter')
  const edit = page.getByRole('dialog', { name: '编辑参数节点', exact: true })
  await expect(edit.getByRole('textbox', { name: /节点编码$/ })).toHaveValue('PROCESS_QTY')
  await edit.getByRole('button', { name: '取消', exact: true }).click()
  await expect(edit).toBeHidden()
  await group.getByRole('button', { name: '新增下级参数', exact: true }).press('Space')
  const add = page.getByRole('dialog', { name: '新增参数节点', exact: true })
  await expect(add).toBeVisible()
  await add.getByRole('button', { name: '取消', exact: true }).click()
  await expect(add).toBeHidden()
  await expect(tokens).toHaveText(['加工数量', '加工数量'])
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-submit-count', '0')
  await expect(dialog.locator('.el-form-item.is-error')).toHaveCount(0)
  expect(writes).toEqual([])
})
