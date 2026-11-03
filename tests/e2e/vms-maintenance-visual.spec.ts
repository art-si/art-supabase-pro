import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(45_000)
const fixture = '/tests/e2e/fixtures/vms-maintenance-visual.html'

async function setup(page: Page) {
  const unexpected: string[] = []
  page.on('pageerror', (error) => console.error('maintenance fixture page error:', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('maintenance fixture console:', message.text())
  })
  page.on('requestfailed', (request) =>
    console.error(
      'maintenance fixture request failed:',
      request.url(),
      request.failure()?.errorText
    )
  )
  await page.route('**/rest/v1/**', (route) => {
    unexpected.push(route.request().url())
    return route.fulfill({ status: 400, json: { message: 'unexpected request' } })
  })
  await page.route('**/rest/v1/sys_document_number_rule?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  await page.route('**/rest/v1/rpc/vms_list_maintenance_workshops_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            supplierName: '验收维修厂',
            supplierCode: 'WX-001'
          }
        ]
      }
    })
  )
  return unexpected
}

test('维保新建默认、必填字段和提醒规则在真实对话框中生效', async ({ page }, testInfo) => {
  const unexpected = await setup(page)
  await page.goto(fixture)
  await page.getByRole('button', { name: '新增维保' }).click()
  const dialog = page.getByRole('dialog', { name: '新增维修保养记录' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('故障维修', { exact: true })).toBeVisible()
  await dialog.getByText('里程与保养提醒', { exact: true }).click()
  await expect(dialog.getByText('保养维修日期', { exact: true })).toBeVisible()
  const date = dialog.locator('.el-form-item').filter({ hasText: '保养维修日期' }).locator('input')
  const odometer = dialog
    .locator('.el-form-item')
    .filter({ hasText: '当前里程（公里）' })
    .locator('input')
  await expect(date).toHaveValue('2026-11-02')
  await odometer.fill('12000')
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '下次保养日期' }).locator('input')
  ).toHaveValue('2027-02-02')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '提醒方式' })
    .locator('.el-select')
    .click()
  await page.getByRole('option', { name: '按里程（10,000 公里）' }).click()
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '下次保养里程' }).locator('input')
  ).toHaveValue('22000')
  await date.fill('')
  await odometer.fill('')
  await dialog.getByRole('button', { name: '确定' }).click()
  await dialog.getByText('里程与保养提醒', { exact: true }).click()
  await expect(dialog.getByText('请选择保养维修日期', { exact: true })).toBeVisible()
  await expect(dialog.getByText('请填写当前里程', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('maintenance-required.png'), fullPage: true })
  expect(unexpected).toEqual([])
})

test('历史记录编辑须补齐日期与里程，维修厂和附件布局完整', async ({ page }, testInfo) => {
  const unexpected = await setup(page)
  await page.goto(fixture)
  await page.getByRole('button', { name: '编辑历史维保' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑维修保养记录' })
  await expect(dialog).toBeVisible()
  await dialog.getByText('里程与保养提醒', { exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: '* 保养维修日期' })).toBeVisible()
  await page.waitForTimeout(1000)
  await dialog.getByRole('button', { name: '确定' }).click()
  await dialog.getByText('里程与保养提醒', { exact: true }).click()
  await expect(dialog.getByText('请选择保养维修日期', { exact: true })).toBeVisible()
  await expect(dialog.getByText('请填写当前里程', { exact: true })).toBeVisible()
  await dialog.getByText('费用与票据', { exact: true }).click()
  await expect(dialog.getByText('维修厂', { exact: true })).toBeVisible()
  await expect(dialog.getByText('发票号', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('maintenance-cost.png'), fullPage: true })
  await dialog.getByPlaceholder('选择维修厂（选填）').click()
  const workshopDialog = page.getByRole('dialog', { name: '选择维修厂' })
  await expect(workshopDialog.getByText('验收维修厂', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('maintenance-workshop.png'), fullPage: true })
  await workshopDialog.getByRole('button', { name: '取消' }).click()
  await dialog.getByText('维保附件', { exact: true }).click()
  await expect(dialog.getByText('维修单.jpg', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 900, height: 800 })
  await page.screenshot({ path: testInfo.outputPath('maintenance-attachment.png'), fullPage: true })
  expect(unexpected).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})
