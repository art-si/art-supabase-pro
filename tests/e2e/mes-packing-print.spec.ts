import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('排包表格铺满面板，小按钮与整包打印预览', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenant = { id: 'packing-test-tenant' }
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const board = (id: string, length: number) => ({
    id,
    tenant_id: tenant.id,
    work_order_id: 'order',
    area: 'A区',
    axis: 'A轴',
    number: id,
    length_mm: length,
    width_mm: 1000,
    pieces: 10,
    packed_pieces: 7,
    thickness_mm: 50,
    area_sqm: (length / 1000) * 10,
    remark: ''
  })
  const order = {
    id: 'order',
    tenant_id: tenant.id,
    work_order_no: 'QA-MO-001',
    material_code_snapshot: 'MAT-001',
    material_id: 'material',
    work_order_type_id: null,
    packing_enabled_snapshot: true,
    extension_schema_snapshot: [],
    order_status: 'REL',
    urgency: 'normal',
    source: 'manual',
    completed_quantity: 0,
    warehoused_quantity: 0,
    unit_snapshot: '㎡',
    planned_end_date: '2026-10-30',
    route_snapshot: null,
    bom_snapshot: null,
    production_fixed_lead_days_snapshot: 0,
    production_preprocess_days_snapshot: 0,
    self_made_production_days_snapshot: 0,
    production_postprocess_days_snapshot: 0,
    production_days_snapshot: 0,
    material_name_snapshot: '1000 × 50 聚氨酯墙面板',
    specification_snapshot: '1000 × 50 · 平面 / 方波',
    project_name_snapshot: '测试工程',
    planned_start_date: new Date().toISOString().slice(0, 10),
    order_quantity: 20,
    extension_values: {},
    packing_rule_id: 'rule',
    status: 'confirmed',
    packing_published_at: null,
    update_time: '2026-10-22T00:00:00Z',
    details: [{ pieces: 20, packed_pieces: 14 }]
  }
  const materialDescription =
    '1000 × 50 聚氨酯墙面板_墙面板_50_1000 聚氨酯_洛科威_方波_水波纹10mm装饰缝'
  await page.route('**/rest/v1/mdm_material?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'material',
          description: materialDescription,
          width: 1000,
          thickness: 50,
          attribute_group_id: null,
          attribute_values: {}
        }
      ]
    })
  )
  await page.route('**/rest/v1/mes_work_order?*', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams
        .get('select')
        ?.startsWith('extension_values')
        ? { extension_values: {} }
        : new URL(route.request().url()).searchParams.get('select')?.startsWith('*')
          ? [{ ...order, details: [board('A-1', 6000), board('A-2', 7000)] }]
          : [order]
    })
  )
  await page.route('**/rest/v1/mes_pack_rule?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'rule',
          tenant_id: tenant.id,
          rule_code: 'PU_BOARD',
          rule_name: '聚氨酯板规则',
          enabled: true,
          max_pieces: 20,
          max_stack_height: 1000,
          board_thickness_mm: null
        }
      ]
    })
  )
  await page.route('**/rest/v1/mes_work_order_detail?*', (route) =>
    route.fulfill({ json: [board('A-1', 6000), board('A-2', 7000)] })
  )
  await page.route('**/rest/v1/mes_work_order_pack?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'pack',
          pack_no: 'PK-0001',
          manually_adjusted: false,
          confirmed: false,
          remark: '',
          items: [
            { id: 'i-1', board_id: 'A-1', pieces: 7, remark: '' },
            { id: 'i-2', board_id: 'A-2', pieces: 7, remark: '' }
          ]
        }
      ]
    })
  )
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printCalled = 'true'
    }
  })
  await page.goto('/tests/e2e/fixtures/mes-packing-print.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  await page.getByText('包含已排包和已发布', { exact: true }).click()
  await page.getByRole('button', { name: /QA-MO-001/ }).click()
  const results = page.locator('.packing-page__results')
  await expect(results.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
  for (const label of ['排包', '参数', '移出']) {
    const button = page.getByRole('button', { name: label, exact: true }).first()
    await expect(button).toHaveClass(/el-button--small/)
  }
  const widths = await results.evaluate((root) => ({
    host: root.querySelector('.el-table__inner-wrapper')!.getBoundingClientRect().width,
    table: root.querySelector('.el-table__header')!.getBoundingClientRect().width
  }))
  expect(widths.table).toBeGreaterThanOrEqual(widths.host - 2)
  const printGroup = results.locator('.packing-page__toolbar > div')
  await expect(printGroup).toHaveCSS('display', 'flex')
  const groupBox = await printGroup.boundingBox()
  const toolbarBox = await results.locator('.packing-page__toolbar').boundingBox()
  expect(
    Math.abs(groupBox!.x + groupBox!.width - toolbarBox!.x - toolbarBox!.width)
  ).toBeLessThanOrEqual(2)
  await expect(results.getByRole('button', { name: '标签打印' })).toBeDisabled()
  await results.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await results.getByRole('button', { name: '标签打印' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByPlaceholder('按产品实际执行标准填写')).toBeVisible({ timeout: 60_000 })
  const paperWidth = dialog.getByRole('spinbutton', { name: '标签纸宽度 mm', exact: true })
  const paperHeight = dialog.getByRole('spinbutton', { name: '标签纸高度 mm', exact: true })
  await expect(paperWidth).toHaveValue('100.0')
  await expect(paperHeight).toHaveValue('150.0')
  await paperWidth.fill('106')
  await paperWidth.press('Tab')
  await expect(paperWidth).toHaveValue('105.0')
  await paperHeight.fill('80')
  await paperHeight.press('Tab')
  const previewPaper = dialog.locator('.packing-print-document__label')
  await expect
    .poll(async () => {
      const box = await previewPaper.boundingBox()
      return box ? Math.abs(box.width / box.height - 105 / 80) : 1
    })
    .toBeLessThan(0.02)
  await expect(dialog).toContainText('合 格 证')
  await expect(dialog).toContainText('区域/编号')
  await expect(dialog).toContainText('A区/A-1、A区/A-2')
  await expect(dialog).toContainText(materialDescription)
  await expect(dialog).toContainText('6000 × 1000 mm × 7 块')
  await expect(dialog).toContainText('7000 × 1000 mm × 7 块')
  await expect(dialog.locator('.packing-print-document__label')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('label-preview.png'), fullPage: true })
  await page.evaluate(() => {
    window.print = () => {
      throw new Error('test print failure')
    }
  })
  await dialog.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.locator('.el-message--error')).toContainText('打印失败')
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printCalled = 'true'
    }
  })
  await dialog.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.packing-print-batch')).toBeVisible()
  const labelPageStyles = page.locator('head style[id^="vueuse_styletag_"]')
  expect(
    await labelPageStyles.evaluateAll((styles) =>
      styles.map((style) => style.textContent).join('\n')
    )
  ).toContain('size: 105mm 80mm')
  const printedContentFits = await page
    .locator('.packing-print-batch article')
    .evaluate((paper) => {
      const bounds = paper.getBoundingClientRect()
      const content = paper
        .querySelector('.packing-print-document__label-content')!
        .getBoundingClientRect()
      return (
        content.bottom <= bounds.bottom + 1 &&
        content.right <= bounds.right + 1 &&
        content.left >= bounds.left - 1
      )
    })
  expect(printedContentFits).toBe(true)
  await page.pdf({
    path: testInfo.outputPath('label.pdf'),
    preferCSSPageSize: true,
    printBackground: true
  })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await expect(page.locator('.packing-print-batch')).toHaveCount(0)
  expect(
    await labelPageStyles.evaluateAll((styles) =>
      styles.map((style) => style.textContent).join('\n')
    )
  ).not.toContain('size: 105mm 80mm')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await results.getByRole('button', { name: '表单打印' }).click()
  await expect(dialog).toContainText('合计 1 包')
  await expect(dialog).toContainText('14 块')
  await dialog.getByRole('button', { name: '打印', exact: true }).click()
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ path: testInfo.outputPath('form.pdf'), preferCSSPageSize: true })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('packing-workspace.png'), fullPage: true })
  await page.getByRole('button', { name: /QA-MO-001 已排包/ }).dblclick()
  const workOrderDialog = page.getByRole('dialog', { name: '工单详情', exact: true })
  await expect(workOrderDialog).toBeVisible({ timeout: 60_000 })
  await expect(workOrderDialog.locator('.art-dialog__viewport')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30_000 }
  )
  await expect(workOrderDialog.getByText('工单识别', { exact: true })).toBeVisible({
    timeout: 30_000
  })
  await expect(workOrderDialog).toContainText('QA-MO-001')
  await expect(workOrderDialog.getByRole('button', { name: '保存更改' })).toHaveCount(0)
  await expect(workOrderDialog.locator('.el-loading-mask')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('work-order-detail.png'), fullPage: true })
  await workOrderDialog.getByRole('button', { name: 'Close this dialog' }).click()
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  )
  expect(pageOverflow).toBe(false)
  expect(errors).toEqual([])
  await page.goto('/tests/e2e/fixtures/mes-packing-print.html?print=0')
  await expect(page.getByRole('heading', { name: '排包单', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '标签打印' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '表单打印' })).toHaveCount(0)
})
