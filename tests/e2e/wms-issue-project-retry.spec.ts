import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const batch = {
  id: 'batch-test',
  tenant_id: 'tenant-test',
  organization_id: 'source-org',
  warehouse_id: 'source-warehouse',
  material_id: 'material-test',
  batch_no: 'BATCH-TEST-001',
  quantity: 2,
  project_id: 'project-test',
  construction_no: 'TEST-SECTION-001',
  status: 'normal',
  material: {
    material_code: 'MAT-TEST',
    material_name: '测试序列号物料',
    serial_management_enabled: true
  }
}
test('办理领料切换库存来源清空选择，过账失败重试保留选择', async ({ page }, testInfo) => {
  const payloads: Record<string, unknown>[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/wms_inventory_batch?*', (route) => {
    const { searchParams } = new URL(route.request().url())
    const availableBatch =
      searchParams.get('project_id') === 'is.null'
        ? {
            ...batch,
            id: 'public-batch-test',
            batch_no: 'BATCH-PUBLIC-001',
            project_id: null,
            construction_no: null
          }
        : batch
    return route.fulfill({ json: [availableBatch], headers: { 'content-range': '0-0/1' } })
  })
  await page.route('**/rest/v1/wms_serial_number?*', (route) =>
    route.fulfill({
      json: [1, 2].map((index) => ({
        id: `serial-${index}`,
        tenant_id: 'tenant-test',
        batch_id: 'batch-test',
        serial_no: `SN-POST-${index}`,
        status: 'in_stock',
        parent_serial_id: null,
        reserved_work_order_id: null
      }))
    })
  )
  await page.route('**/rest/v1/rpc/wms_post_issue_request_secure', (route) => {
    payloads.push(route.request().postDataJSON().p_payload)
    return payloads.length === 1
      ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试领料过账失败' } })
      : route.fulfill({ json: 'movement-test' })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试办理领料', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible').first()
  const scopeGroup = dialog.getByRole('radiogroup', { name: '库存来源' })
  const project = scopeGroup.getByRole('radio', { name: '本项目库存' })
  const publicStock = scopeGroup.getByRole('radio', { name: '公共库存' })
  const batchTrigger = dialog.getByPlaceholder('选择来源库存批次')
  const picker = page.getByRole('dialog', { name: '选择领料批次' })
  const projectBatch = picker.getByText('测试序列号物料 · BATCH-TEST-001', { exact: true })
  const openBatchPicker = async (scope: 'project' | 'public') => {
    const requested = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith('/wms_inventory_batch')
    )
    await batchTrigger.click()
    const { searchParams } = new URL((await requested).url())
    expect(searchParams.get('tenant_id')).toBe('eq.tenant-test')
    expect(searchParams.get('warehouse_id')).toBe('eq.source-warehouse')
    expect(searchParams.get('organization_id')).toBe('eq.source-org')
    expect(searchParams.get('material_id')).toBe('eq.material-test')
    expect(searchParams.get('project_id')).toBe(scope === 'project' ? 'eq.project-test' : 'is.null')
    expect(searchParams.get('construction_no')).toBe(
      scope === 'project' ? 'eq.TEST-SECTION-001' : null
    )
  }
  const selectProjectBatch = async () => {
    await openBatchPicker('project')
    await projectBatch.click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
  }

  await expect(project).toBeChecked()
  await expect(dialog.getByText('公共库存领用后，流水仍关联当前工单与施工号。')).toBeVisible()
  await scopeGroup.scrollIntoViewIfNeeded()
  await expect(scopeGroup).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeInViewport()
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await dialog.screenshot({ path: testInfo.outputPath('issue-stock-source-390.png') })
  await selectProjectBatch()
  const quantity = dialog.getByRole('spinbutton', { name: /本次领料数量/ })
  await quantity.fill('3')
  await quantity.press('Tab')
  await expect(quantity).toHaveValue('2.000')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('SN 件数必须与本次领料数量一致', { exact: true })).toBeVisible()
  expect(payloads).toHaveLength(0)
  const scan = dialog.getByPlaceholder('扫描当前批次的 SN，回车带入')
  await scan.fill('SN-POST-1')
  await scan.press('Enter')
  await expect(dialog.getByText(/已选 1 \/ 2 件/)).toBeVisible()
  await scan.fill('SN-POST-2')
  await scopeGroup.getByText('公共库存', { exact: true }).click()
  await expect(publicStock).toBeChecked()
  await expect(quantity).toHaveValue('1.000')
  await expect(scan).toBeEmpty()
  await expect(dialog.getByText(/已选 0 \/ 1 件/)).toBeVisible()
  await expect(batchTrigger).toBeEmpty()
  expect(payloads).toHaveLength(0)
  await openBatchPicker('public')
  await expect(picker.getByText('测试序列号物料 · BATCH-PUBLIC-001', { exact: true })).toBeVisible()
  await expect(projectBatch).toHaveCount(0)
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await scopeGroup.getByText('本项目库存', { exact: true }).click()
  await expect(project).toBeChecked()
  await selectProjectBatch()
  await quantity.fill('2')
  await quantity.press('Tab')
  await expect(quantity).toHaveValue('2.000')

  for (const serial of ['SN-POST-1', 'SN-POST-2']) {
    await scan.fill(serial)
    await dialog.getByRole('button', { name: '带入 SN', exact: true }).click()
  }
  await expect(
    dialog.getByText('已选 2 / 2 件；仅接受当前批次可领用的 SN。', { exact: true })
  ).toBeVisible()
  await dialog.getByRole('textbox', { name: '领料备注', exact: true }).fill('过账失败保留说明')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => payloads.length).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(quantity).toHaveValue('2.000')
  await expect(dialog.getByRole('textbox', { name: '领料备注', exact: true })).toHaveValue(
    '过账失败保留说明'
  )
  await scan.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('issue-post-save-failed.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
  expect(payloads).toHaveLength(2)
  expect(payloads[1]).toEqual(payloads[0])
  expect(payloads[1]).toMatchObject({
    line_id: 'line-test',
    batch_id: 'batch-test',
    quantity: 2,
    serial_ids: ['serial-1', 'serial-2'],
    remark: '过账失败保留说明'
  })
})

for (const mode of ['领料', '项目调拨']) {
  test(`${mode}序列号加载失败可原位重试且取消不提交`, async ({ page }, testInfo) => {
    let failure = true
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() !== 'GET') writes++
      return route.fulfill({ json: [] })
    })
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
      route.fulfill({
        json: [batch],
        headers: { 'content-range': '0-0/1' }
      })
    )
    await page.route('**/rest/v1/wms_serial_number?*', (route) =>
      failure
        ? route.fulfill({ status: 503, json: { message: '测试加载失败', code: 'XX000' } })
        : route.fulfill({
            json: [
              {
                id: 'serial-test',
                tenant_id: 'tenant-test',
                batch_id: 'batch-test',
                serial_no: 'SN-TEST-001',
                status: 'in_stock',
                parent_serial_id: null,
                reserved_work_order_id: null
              }
            ]
          })
    )
    await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
    await page
      .getByRole('button', { name: mode === '领料' ? '测试办理领料' : '测试项目调拨', exact: true })
      .click()
    const dialog = page.locator('.el-dialog:visible').first()
    if (mode === '领料') {
      await dialog.getByPlaceholder('选择来源库存批次').click()
      const picker = page.getByRole('dialog', { name: '选择领料批次' })
      await picker.getByText('测试序列号物料 · BATCH-TEST-001', { exact: true }).click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
    }
    await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
    failure = false
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
    await dialog
      .getByText(mode === '领料' ? '领用 SN' : '随批次调拨的序列号', { exact: true })
      .scrollIntoViewIfNeeded()
    const serialSelect = dialog.getByRole('combobox').last()
    await serialSelect.press('ArrowDown')
    await expect(page.getByRole('option', { name: 'SN-TEST-001', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath('wms-issue-project-retry.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
    expect(errors).toEqual([])
  })
}
