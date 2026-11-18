import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

async function mockInventory(page: Page, dictionaryGate: Promise<void>) {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const dictionary = url.pathname.endsWith('/sys_dictionary')
    if (dictionary) await dictionaryGate
    let json: unknown = []
    if (dictionary) {
      const code = url.search
      const value = code.includes('commonBoolean')
        ? 'true'
        : code.includes('mdmWarehouseType')
          ? 'raw_material'
          : code.includes('mdmWarehouseBusinessScope')
            ? 'picking'
            : code.includes('mdmWarehouseBinType')
              ? 'floor'
              : code.includes('mdmWarehouseBinStatus')
                ? 'available'
                : code.includes('commonEnabled')
                  ? 'enabled'
                  : 'in_stock'
      json = code.includes('mdmMaterialSource')
        ? [{ label: '停用历史物料来源', value: 'legacy-source', status: '0' }]
        : [
            { label: '', name: '公共名称选项', value, status: '1' },
            { label: '停用选项', value: 'pending_in', status: '0' },
            { label: '不可流转选项', value: 'out', status: '1' }
          ]
    } else if (url.pathname.endsWith('/wms_list_serials_secure')) {
      json = {
        data: [
          {
            id: 'serial-test',
            tenant_id: 'test-tenant',
            serial_no: 'SN-TEST',
            material_id: 'material-test',
            material_source: 'legacy-source',
            status: 'pending_in',
            warehouse_id: 'warehouse-test',
            create_time: '2026-10-09'
          }
        ],
        total: 1
      }
    } else if (url.pathname.endsWith('/wms_list_reservations_secure')) {
      json = { data: [], total: 0 }
    }
    await route.fulfill({ json })
  })
}

const forms = [
  {
    mode: 'warehouse',
    title: '新增仓库',
    fields: [
      { label: '仓库类型', tab: '仓库身份' },
      { label: '业务应用范围', tab: '业务控制' },
      { label: '一位一品', tab: '业务控制' }
    ]
  },
  {
    mode: 'zone',
    title: '新增库区',
    fields: [
      { label: '库区用途', tab: '库区身份' },
      { label: '启用状态', tab: '存放控制' }
    ]
  },
  {
    mode: 'bin',
    title: '新增库位',
    fields: [
      { label: '库位类型', tab: '库位身份' },
      { label: '库位状态', tab: '存放控制' }
    ]
  },
  { mode: 'serial', title: '新增序列号', fields: [{ label: '序列号状态', tab: undefined }] }
]
for (const form of forms) {
  test(`${form.title}公共字典延迟更新、名称回退和停用过滤`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    await mockInventory(
      page,
      new Promise<void>((resolve) => {
        release = resolve
      })
    )
    await page.goto(`/tests/e2e/fixtures/inventory-dictionary-options.html?mode=${form.mode}`)
    await page.getByRole('button', { name: '打开表单' }).click()
    const dialog = page.getByRole('dialog', { name: form.title, exact: true })
    await expect(dialog).toBeVisible()
    release()
    if (form.mode === 'warehouse') {
      await dialog.getByRole('tab', { name: '业务控制', exact: true }).click()
      await dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText('启用库位', { exact: true }) })
        .getByRole('switch')
        .locator('..')
        .click()
    }
    for (const { label, tab } of form.fields) {
      if (tab) await dialog.getByRole('tab', { name: tab, exact: true }).click()
      const select = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      const option = page.getByRole('option', { name: '公共名称选项', exact: true })
      await expect(option).toBeVisible()
      await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
      if (form.mode === 'serial')
        await expect(page.getByRole('option', { name: '不可流转选项', exact: true })).toHaveCount(0)
      if ((await option.getAttribute('aria-selected')) !== 'true') await option.click()
      await page.keyboard.press('Escape')
      await expect(select).toContainText('公共名称选项')
    }
    await dialog.screenshot({ path: info.outputPath('inventory-form-options.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

for (const mode of ['serial-list', 'reservation-list']) {
  test(`${mode}公共搜索字典及专注模式`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await mockInventory(page, Promise.resolve())
    await page.goto(`/tests/e2e/fixtures/inventory-dictionary-options.html?mode=${mode}`)
    const select = page
      .locator('.el-form-item')
      .filter({
        has: page.getByText(mode === 'serial-list' ? '状态' : '预留状态', { exact: true })
      })
      .locator('.el-select')
    await expect(select).toBeVisible()
    await select.click()
    await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共名称选项', exact: true }).click()
    await expect(select).toContainText('公共名称选项')
    if (mode === 'serial-list') {
      await expect(
        page.locator('.el-table').getByText('停用历史物料来源', { exact: true })
      ).toHaveCount(1)
      await expect(page.locator('.el-table').getByText('停用选项', { exact: true })).toHaveCount(1)
    }
    const header = page.locator('.business-workspace-header')
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(header).toBeHidden()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await page.screenshot({ path: info.outputPath('inventory-list-options.png'), fullPage: true })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('普通用户释放库存预留使用明确确认，取消零写入并可键盘释放', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await mockInventory(page, Promise.resolve())
  const reservationId = '11111111-1111-4111-8111-111111111111'
  const workOrderNo = 'WO-RELEASE-001'
  let released = false
  const reads: Array<Record<string, unknown>> = []
  const writes: Array<{ method: string; filters: Record<string, string>; payload: unknown }> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    if (!route.request().url().includes('mdmInventoryReservationStatus')) return route.fallback()
    return route.fulfill({
      json: [
        { code: 'active', value: 'active', label: '预留中', status: '1' },
        { code: 'released', value: 'released', label: '已释放', status: '1' }
      ]
    })
  })
  await page.route('**/rest/v1/rpc/wms_list_reservations_secure', (route) => {
    reads.push(route.request().postDataJSON())
    return route.fulfill({
      json: {
        data: [
          {
            id: reservationId,
            tenantId: 'test-tenant',
            workOrderId: 'work-order-release',
            workOrderNo,
            materialId: 'material-release',
            materialCode: 'RAW-RELEASE-001',
            materialName: '验收原料板',
            warehouseId: 'warehouse-test',
            warehouseName: '验收原料仓',
            binCode: 'RAW-A-01',
            reservedQuantity: 3,
            status: released ? 'released' : 'active',
            createTime: '2026-11-01T08:00:00Z'
          }
        ],
        total: 1
      }
    })
  })
  await page.route('**/rest/v1/wms_inventory_reservation?*', (route) => {
    const request = route.request()
    writes.push({
      method: request.method(),
      filters: Object.fromEntries(new URL(request.url()).searchParams),
      payload: request.postDataJSON()
    })
    released = true
    return route.fulfill({ json: [{ id: reservationId }] })
  })
  await page.goto(
    '/tests/e2e/fixtures/inventory-dictionary-options.html?mode=reservation-list&release=1'
  )
  const row = page.locator('.el-table__body tr').filter({ hasText: workOrderNo })
  const trigger = row.getByRole('button', { name: '释放预留', exact: true })
  await expect(row).toContainText('验收原料板')
  await expect(row).toContainText('预留中')
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const confirmation = page.getByRole('dialog', { name: '释放预留', exact: true })
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText(workOrderNo)
  const confirm = confirmation.getByRole('button', { name: '释放预留', exact: true })
  await expect(confirm).toHaveClass(/\bel-button--primary\b/)
  await expect(confirm).not.toHaveClass(/\bel-button--danger\b/)
  await expect(confirmation.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  await confirmation.screenshot({ path: info.outputPath('reservation-release-confirm.png') })
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirmation).toBeHidden()
  expect(writes).toEqual([])
  await expect(trigger).toBeEnabled()
  const readsBeforeRelease = reads.length
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(confirmation).toBeVisible()
  await confirm.focus()
  await page.keyboard.press('Enter')
  await expect(confirmation).toBeHidden()
  await expect.poll(() => reads.length).toBe(readsBeforeRelease + 1)
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('已释放')
  await expect(trigger).toHaveCount(0)
  expect(writes).toEqual([
    {
      method: 'PATCH',
      filters: { id: `eq.${reservationId}`, status: 'eq.active', select: 'id' },
      payload: { status: 'released' }
    }
  ])
  expect(errors).toEqual([])
})

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`公共筛选隐藏展开按钮时所有字段可用，保留正常展开收起 ${theme} ${box}`, async ({
      page
    }, info) => {
      await prepareIsolatedSession(page)
      await mockInventory(page, Promise.resolve())
      await page.goto(
        `/tests/e2e/fixtures/inventory-dictionary-options.html?mode=search-contract&theme=${theme}&box=${box}`
      )
      const complete = page.getByTestId('complete-search')
      await expect(complete.getByRole('textbox', { name: '筛选丙', exact: true })).toBeVisible()
      await expect(complete.locator('button.art-form__filter-toggle')).toHaveCount(0)
      await complete.getByRole('textbox', { name: '筛选丙', exact: true }).fill('第三项筛选值')
      await complete.locator('button.submit-button').click()
      await expect(page.getByTestId('submitted-filter')).toHaveText('第三项筛选值')
      const expandable = page.getByTestId('expandable-search')
      await expect(expandable.getByRole('textbox', { name: '筛选丙', exact: true })).toHaveCount(0)
      await expandable.locator('button.art-form__filter-toggle').click()
      await expect(expandable.getByRole('textbox', { name: '筛选丙', exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('search-expand-open.png'), fullPage: true })
      await expandable.locator('button.art-form__filter-toggle').click()
      await expect(expandable.getByRole('textbox', { name: '筛选丙', exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('search-expand-contract.png'), fullPage: true })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
    })
  }
}
