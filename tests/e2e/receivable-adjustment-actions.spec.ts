import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

test('两条调整提交部分失败后回读、混合状态阻断与审核终态', async ({ page }, info) => {
  const records = [1, 2].map((index) => ({
    id: `adjustment-${index}`,
    documentNo: `QA-ADJUSTMENT-${index}`,
    sourceNo: `QA-FINANCIAL-${index}`,
    customerName: '隔离调整客户',
    kind: 'increase',
    status: 'draft',
    amount: index * 10,
    currencyCode: 'CNY',
    businessDate: '2026-10-24',
    reason: '隔离调整验收'
  }))
  const actions: Array<{ p_id: string; p_action: string }> = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arDocumentStatus'
          ? [
              ['draft', '草稿'],
              ['submitted', '已提交'],
              ['approved', '已审核']
            ]
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
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({
        json: {
          records: body.p_kind === 'adjustment' ? records : [],
          total: body.p_kind === 'adjustment' ? 2 : 0
        }
      })
    if (name === 'fms_act_receivable_adjustment_secure') {
      actions.push(body)
      if (body.p_id === 'adjustment-2' && fail)
        return route.fulfill({
          status: 409,
          json: { code: '40001', message: '调整记录已变化，请刷新后重试' }
        })
      const record = records.find((row) => row.id === body.p_id)
      if (record) record.status = body.p_action === 'submit' ? 'submitted' : 'approved'
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=financial&theme=${theme}`)
  await page.getByRole('button', { name: '调整记录', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '应收调整记录', exact: true })
  const selectAll = dialog.locator('.el-table__header-wrapper label.el-checkbox')
  await expect(dialog.getByText('QA-ADJUSTMENT-2', { exact: true })).toBeVisible()
  await selectAll.click()
  await expect(dialog.getByRole('button', { name: '审核调整', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '提交调整', exact: true }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  const first = dialog.getByRole('row').filter({ hasText: 'QA-ADJUSTMENT-1' })
  const second = dialog.getByRole('row').filter({ hasText: 'QA-ADJUSTMENT-2' })
  await expect(first).toContainText('已提交')
  await expect(second).toContainText('草稿')
  await selectAll.click()
  await expect(dialog.getByRole('button', { name: '提交调整', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '审核调整', exact: true })).toBeDisabled()
  await selectAll.click()
  await second.locator('label.el-checkbox').click()
  fail = false
  await dialog.getByRole('button', { name: '提交调整', exact: true }).click()
  await expect(second).toContainText('已提交')
  await selectAll.click()
  await dialog.getByRole('button', { name: '审核调整', exact: true }).click()
  await expect(first).toContainText('已审核')
  await expect(second).toContainText('已审核')
  await selectAll.click()
  await expect(dialog.getByRole('button', { name: '提交调整', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '审核调整', exact: true })).toBeDisabled()
  expect(actions).toEqual([
    { p_id: 'adjustment-1', p_action: 'submit' },
    { p_id: 'adjustment-2', p_action: 'submit' },
    { p_id: 'adjustment-2', p_action: 'submit' },
    { p_id: 'adjustment-1', p_action: 'approve' },
    { p_id: 'adjustment-2', p_action: 'approve' }
  ])
  await expect(page.locator('.el-message')).toHaveCount(0)
  await dialog.screenshot({ path: info.outputPath('adjustment-approved.png') })
})
