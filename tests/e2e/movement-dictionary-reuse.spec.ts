import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

for (const width of [1440, 1280]) {
  test(`移动类型应用外壳普通与专注模式填满内容区 ${width}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    await mockMovement(page)
    await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=movement-type')
    const card = page.locator('.art-table-card')
    const header = page.locator('.business-workspace-header')
    await expect(card).toBeVisible()
    await expect(page.getByRole('textbox', { name: '综合查询', exact: true })).toBeVisible()
    const expectFilled = async () => {
      await expect
        .poll(() => card.evaluate((el) => innerHeight - el.getBoundingClientRect().bottom))
        .toBeLessThanOrEqual(17)
      await expect(page.locator('.el-pagination')).toBeInViewport()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
    }
    await expectFilled()
    await page.screenshot({ path: info.outputPath('movement-shell-normal.png') })
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(header).toBeHidden()
    await expectFilled()
    await page.screenshot({ path: info.outputPath('movement-shell-focus.png') })
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await expectFilled()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await expectFilled()
  })
}

test('布尔字典区分真、假、空值与缺失字段', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await mockMovement(page)
  await page.route('**/rest/v1/mdm_stock_movement_type?*', (route) =>
    route.fulfill({
      json: [true, false, null, undefined].map((value, index) => ({
        id: `boolean-${index}`,
        tenant_id: 'test-tenant',
        movement_code: `BOOL-${index}`,
        movement_name: `布尔显示 ${index}`,
        direction: 'inbound',
        reversal: value,
        other_io: value,
        status: 'enabled'
      })),
      headers: { 'content-range': '0-3/4', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/movement-dictionary-reuse.html?mode=list')
  for (const [index, label] of ['公共肯定', '公共否定', '--', '--'].entries()) {
    const row = page.locator('.el-table__body-wrapper tr').filter({ hasText: `BOOL-${index}` })
    await expect(row).toBeVisible()
    await expect(row.locator('td').nth(6)).toHaveText(label)
    await expect(row.locator('td').nth(7)).toHaveText(label)
    await expect(row.getByText('undefined', { exact: true })).toHaveCount(0)
    await expect(row.getByText('null', { exact: true })).toHaveCount(0)
  }
  await expect(page.getByRole('textbox', { name: '综合查询', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '出入标志', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('boolean-values.png') })
})

async function mockMovement(page: Page, gate: Promise<void> = Promise.resolve()) {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    let json: unknown
    if (url.pathname.endsWith('/sys_dictionary')) {
      if (!url.searchParams.has('dict_type_table.code')) {
        await route.fallback()
        return
      }
      await gate
      json = url.search.includes('commonBoolean')
        ? [
            { label: '公共肯定', value: 'true', status: '1' },
            { label: '公共否定', value: 'false', status: '1' }
          ]
        : url.search.includes('mdmInventoryMovementType')
          ? [{ label: '', name: '采购入库名称', value: 'purchase_in', status: '0' }]
          : [
              { label: '', name: '公共入库名称', value: 'inbound', status: '1' },
              { label: '历史出库名称', value: 'outbound', status: '0' }
            ]
    } else if (url.pathname.endsWith('/mdm_stock_movement_type')) {
      json = ['inbound', 'outbound', 'transfer'].map((direction, index) => ({
        id: `movement-${index}`,
        tenant_id: 'test-tenant',
        movement_code: `MOVE-${index}`,
        movement_name: `公共字典测试移动-${index}`,
        direction,
        reversal: index === 0,
        other_io: index !== 0,
        status: 'enabled',
        reverse_type_id: null
      }))
    } else {
      await route.fallback()
      return
    }
    const requestedValue = url.searchParams.get('value')?.replace(/^eq\./, '')
    if (url.pathname.endsWith('/sys_dictionary') && requestedValue && Array.isArray(json))
      json = json.filter((item) => item.value === requestedValue)
    await route.fulfill({
      json,
      headers: {
        'content-range': url.pathname.endsWith('/mdm_stock_movement_type') ? '0-2/3' : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
}

for (const mode of ['single', 'bulk']) {
  for (const state of [
    'referenced',
    'failed',
    'clear',
    'concurrent',
    'zero',
    'cancel',
    'scope',
    'permission'
  ]) {
    test(`出入库类型删除守卫 ${mode} ${state}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      await mockMovement(page)
      const id = '00000000-0000-4000-a000-000000000001'
      const events: string[] = []
      await page.route('**/rest/v1/mdm_stock_movement_type?*', (route) =>
        route.fulfill({
          json: [
            {
              id,
              movement_code: 'MOVE-TEST-001',
              movement_name: '测试入库类型',
              direction: 'inbound',
              status: 'enabled',
              tenant_id: '11111111-1111-4111-a111-111111111111'
            }
          ],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      )
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
        expect(route.request().postDataJSON().p_table).toBe('mdm_stock_movement_type')
        expect(route.request().postDataJSON().p_ids).toEqual([id])
        events.push('inspect')
        if (state === 'failed')
          return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
        return route.fulfill({
          json:
            state === 'referenced' || (state === 'concurrent' && events.includes('delete'))
              ? [
                  {
                    resource_id: id,
                    source_table: 'mdm_stock_movement_type',
                    record_id: id,
                    target_id: id,
                    record_no: 'MOVE-REF-001',
                    record_summary: '测试反向类型',
                    record_status: 'enabled',
                    created_at: '2026-10-01'
                  }
                ]
              : []
        })
      })
      await page.route('**/rest/v1/rpc/mdm_delete_stock_movement_types_secure', (route) => {
        expect(route.request().postDataJSON().p_ids).toEqual([id])
        events.push('delete')
        return state === 'concurrent'
          ? route.fulfill({
              status: 409,
              json: { code: '23503', message: '出入库类型已被其他类型引用，不能删除' }
            })
          : route.fulfill({ json: state === 'zero' ? 0 : 1 })
      })
      await page.goto(
        `/tests/e2e/fixtures/scrollbar-workspace.html?page=movement-type&governedDelete=true${state === 'permission' ? '&ordinary=true' : ''}`
      )
      const row = page.locator('.el-table__body-wrapper tr').first()
      await expect(row).toContainText('MOVE-TEST-001')
      if (mode === 'single') {
        await expect(row.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(1)
        await expect(row.getByRole('button', { name: '删除类型', exact: true })).toHaveCount(0)
        await row.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除类型', exact: true }).click()
      } else {
        await page.locator('.el-table__header-wrapper .el-checkbox').click()
        await page.getByRole('button', { name: '批量删除', exact: true }).click()
      }
      const confirmation = page.locator('.el-message-box')
      if (state === 'referenced' || state === 'failed') {
        await expect(
          page.getByText(state === 'referenced' ? 'MOVE-REF-001' : '删除检查未完成', {
            exact: true
          })
        ).toBeVisible()
        expect(events).toEqual(['inspect'])
        await expect(confirmation).toHaveCount(0)
        if (state === 'referenced') {
          await page.screenshot({ path: info.outputPath('references.png') })
          await page.getByRole('button', { name: '查看关联', exact: true }).click()
          await expect(page.getByRole('textbox', { name: '综合查询', exact: true })).toHaveValue(
            'MOVE-REF-001'
          )
        }
      } else {
        await expect(confirmation).toBeVisible()
        expect(events).toEqual(['inspect'])
        if (state === 'scope')
          await page.evaluate(() => {
            sessionStorage.setItem('art-platform-tenant-scope-active', '1')
            sessionStorage.setItem(
              'art-platform-tenant-scope-id',
              '22222222-2222-4222-a222-222222222222'
            )
          })
        if (state === 'permission')
          await page.evaluate(() => document.dispatchEvent(new Event('revoke-governed-delete')))
        await confirmation
          .getByRole('button', { name: state === 'cancel' ? '取消' : '删除', exact: true })
          .click()
        if (state === 'concurrent') {
          await expect(page.getByText('MOVE-REF-001', { exact: true })).toBeVisible()
          expect(events).toEqual(['inspect', 'delete', 'inspect'])
          await expect(page.locator('.el-message--error')).toHaveCount(0)
        } else if (state === 'zero') {
          await expect.poll(() => events).toEqual(['inspect', 'delete', 'inspect'])
          await expect(page.locator('.el-message--success')).toHaveCount(0)
          await expect(page.locator('.el-message--error')).toHaveCount(1)
        } else if (state === 'clear') {
          await expect.poll(() => events).toEqual(['inspect', 'delete'])
          await expect(page.getByText('出入库类型已删除', { exact: true })).toBeVisible()
        } else if (state === 'scope' || state === 'permission') {
          await expect(
            page.getByText(
              state === 'scope'
                ? '租户范围已变化，请刷新后重试'
                : '删除权限已变化，请刷新页面后重试',
              { exact: true }
            )
          ).toBeVisible()
          expect(events).toEqual(['inspect'])
        } else {
          await expect(confirmation).toBeHidden()
          await expect(page.locator('.el-message--error')).toHaveCount(0)
          expect(events).toEqual(['inspect'])
        }
      }
      if (mode === 'bulk' && state !== 'permission' && state !== 'referenced') {
        if (state === 'clear') await expect(row.locator('input[type="checkbox"]')).not.toBeChecked()
        else await expect(row.locator('input[type="checkbox"]')).toBeChecked()
      }
    })
  }
}

for (const mode of ['type', 'inventory']) {
  test(`${mode}弹窗使用公共字典并正确显示延迟返回的名称`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    await mockMovement(
      page,
      new Promise<void>((resolve) => {
        release = resolve
      })
    )
    await page.goto(`/tests/e2e/fixtures/movement-dictionary-reuse.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开表单' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    release()
    if (mode === 'type') {
      const field = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText('出入库类型', { exact: true }) })
      await expect(field.getByRole('radio', { name: '公共入库名称', exact: true })).toHaveCount(1)
      await expect(field.getByRole('radio', { name: '历史出库名称', exact: true })).toHaveCount(0)
      await field.getByRole('radio', { name: '公共入库名称', exact: true }).locator('..').click()
    } else {
      await expect(dialog).toHaveAccessibleName('采购入库名称 · 测试仓库')
      const field = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText('业务类型', { exact: true }) })
      await expect(field).toContainText('采购入库名称')
      await expect(field.locator('.el-select')).toHaveCount(0)
      await expect(dialog.locator('.art-entity-summary__content strong')).toContainText(
        '采购入库名称'
      )
    }
    await dialog.screenshot({ path: info.outputPath('movement-form.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('移动类型列表、搜索与导出统一字典显示并保留历史值', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockMovement(page)
  await page.goto('/tests/e2e/fixtures/movement-dictionary-reuse.html?mode=list')
  const table = page.locator('.el-table')
  await expect(table.getByText('公共入库名称', { exact: true })).toHaveCount(1)
  await expect(table.getByText('历史出库名称', { exact: true })).toHaveCount(1)
  await expect(table.getByText('transfer', { exact: true })).toHaveCount(1)
  const select = page
    .locator('.el-form-item')
    .filter({ has: page.getByText('出入标志', { exact: true }) })
    .locator('.el-select')
  await select.click()
  await expect(page.getByRole('option', { name: '历史出库名称', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '公共入库名称', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('移动类型导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  for (const [index, label] of ['公共入库名称', '历史出库名称', 'transfer'].entries()) {
    expect(sheet.getRow(index + 2).getCell(3).value).toBe(label)
    expect(sheet.getRow(index + 2).getCell(5).value).toBe(index === 0 ? '公共肯定' : '公共否定')
    expect(sheet.getRow(index + 2).getCell(6).value).toBe(index === 0 ? '公共否定' : '公共肯定')
  }
  const header = page.locator('.business-workspace-header')
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(header).toBeHidden()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(header).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()
  await page.screenshot({ path: info.outputPath('movement-list.png'), fullPage: true })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('库存业务字典失败后重新打开能够恢复名称', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockMovement(page)
  let unavailable = true
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      status: unavailable ? 503 : 200,
      json: unavailable
        ? { message: '测试字典暂不可用' }
        : [{ label: '', name: '采购入库名称', value: 'purchase_in', status: '0' }]
    })
  )
  await page.goto('/tests/e2e/fixtures/movement-dictionary-reuse.html?mode=inventory')
  await page.getByRole('button', { name: '打开表单' }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    page.getByText('库存基础数据加载失败，请关闭弹窗后重试', { exact: true })
  ).toBeVisible()
  await expect(
    dialog.locator('.el-form-item').filter({ has: page.getByText('业务类型', { exact: true }) })
  ).toContainText('purchase_in')
  await dialog.screenshot({ path: info.outputPath('movement-dictionary-error.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  unavailable = false
  await page.getByRole('button', { name: '打开表单' }).click()
  await expect(dialog).toHaveAccessibleName('采购入库名称 · 测试仓库')
  await expect(dialog.locator('.art-entity-summary__content strong')).toContainText('采购入库名称')
  await dialog.screenshot({ path: info.outputPath('movement-dictionary-retry.png') })
  expect(errors).toEqual([])
})

test('关闭并重开后旧请求不能覆盖新库存弹窗', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockMovement(page)
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requestCount = 0
  await page.route('**/rest/v1/mdm_warehouse?*', async (route) => {
    if (++requestCount === 1) await gate
    await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/movement-dictionary-reuse.html?mode=race')
  await page.getByRole('button', { name: '打开表单' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect.poll(() => requestCount).toBe(1)
  await dialog.getByRole('button', { name: 'Close this dialog', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '打开表单' }).click()
  await expect(dialog).toHaveAccessibleName('采购入库名称 · 测试仓库 2')
  const oldResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/mdm_warehouse')
  )
  release()
  await (await oldResponse).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  await expect(dialog).toHaveAccessibleName('采购入库名称 · 测试仓库 2')
})
