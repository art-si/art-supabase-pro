import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const mode of ['customer', 'route', 'work-order']) {
  test(`${mode} 中文表头通过公共表格映射为业务字段`, async ({ page }, info) => {
    const writes: Record<string, unknown>[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const targetTable =
      mode === 'customer'
        ? 'mdm_customer'
        : mode === 'route'
          ? 'mdm_process_route'
          : 'mes_work_order'
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const isWrite =
        request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/${targetTable}`)
      if (isWrite) writes.push(...request.postDataJSON())
      await route.fulfill({
        json: isWrite ? [{ id: 'imported-row' }] : [],
        headers: {
          'content-range': isWrite ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/business-import-records.html?mode=${mode}`)
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('业务导入')
    if (mode === 'customer') {
      sheet.addRow(['客户编号', '客户名称', '启用状态'])
      sheet.addRow(['C-001', '测试映射客户', '启用'])
    } else if (mode === 'route') {
      sheet.addRow(['产品物料ID', '路线名称', '工艺版本', '批量从', '批量至'])
      sheet.addRow(['material-test', '测试映射路线', 'V1', 1, 10])
    } else {
      sheet.addRow(['产品物料ID', '工单数量', '计划结束日期', '销售订单号'])
      sheet.addRow(['material-test', 5, '2026-10-09', 'SO-001'])
    }
    await page.locator('input[type="file"]').setInputFiles({
      name: '业务导入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    })
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].tenant_id).toBe('11111111-1111-4111-8111-111111111111')
    if (mode === 'customer')
      expect(writes[0]).toMatchObject({
        customer_code: 'C-001',
        customer_name: '测试映射客户',
        enabled: true
      })
    else if (mode === 'route')
      expect(writes[0]).toMatchObject({
        material_id: 'material-test',
        name: '测试映射路线',
        version: 'V1',
        batch_from: 1,
        batch_to: 10
      })
    else
      expect(writes[0]).toMatchObject({
        material_id: 'material-test',
        order_quantity: 5,
        planned_end_date: '2026-10-09',
        sales_order_no: 'SO-001'
      })
    expect(Object.keys(writes[0]).some((key) => /[\u3400-\u9fff]/.test(key))).toBe(false)
    await page.screenshot({ path: info.outputPath('business-import-success.png') })
    expect(errors).toEqual([])
  })
}

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'

async function routeWorkbook(name = '测试路线'): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('工艺路线')
  sheet.addRow(['产品物料ID', '路线名称', '工艺版本'])
  sheet.addRow(['material-test', name, 'V1'])
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function mountRouteContext(
  page: Page,
  options: { role?: 'ordinary'; identity?: 'missing'; visual?: boolean } = {}
) {
  const writes: Record<string, unknown>[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const isWrite =
      request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/mdm_process_route')
    if (isWrite) writes.push(...(request.postDataJSON() as Record<string, unknown>[]))
    await route.fulfill({
      json: isWrite ? [{ id: 'imported-row' }] : [],
      headers: {
        'content-range': isWrite ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  const params = new URLSearchParams({ mode: 'route', context: 'true' })
  if (options.role) params.set('role', options.role)
  if (options.identity) params.set('identity', options.identity)
  if (options.visual) params.set('visual', 'true')
  await page.goto(`/tests/e2e/fixtures/business-import-records.html?${params}`)
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-import-tenant', tenantA)
  await installActionFeedbackHistory(page)
  return { writes, errors }
}

async function uploadRouteWorkbook(page: Page, buffer?: Buffer): Promise<void> {
  const workbookBuffer = buffer ?? (await routeWorkbook())
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles({
    name: '工艺路线.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbookBuffer
  })
}

async function holdSheetjs(page: Page) {
  let release: (() => void) | undefined
  let signal: (() => void) | undefined
  const requested = new Promise<void>((resolve) => (signal = resolve))
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/src/utils/file/sheetjs.ts*', async (route) => {
    signal?.()
    await held
    await route.continue()
  })
  return { requested, release: () => release?.() }
}

async function holdFirstRouteWrite(
  page: Page,
  writes: Record<string, unknown>[],
  outcome: 'success' | 'failure'
) {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  let first = true
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/mdm_process_route'),
    async (route) => {
      if (route.request().method() !== 'POST' || !first) return route.fallback()
      first = false
      writes.push(...(route.request().postDataJSON() as Record<string, unknown>[]))
      await held
      await route.fulfill(
        outcome === 'success'
          ? { json: [{ id: 'old-imported-row' }] }
          : { status: 400, json: { code: 'P0001', message: '旧上下文的工艺路线导入被拒绝' } }
      )
    }
  )
  return release
}

test('平台全部租户导入新工艺路线默认写认证租户', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page)
  await page.getByTestId('scope-all').click()
  await expect(page.locator('body')).toHaveAttribute('data-import-tenant', 'all')
  await uploadRouteWorkbook(page)
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].tenant_id).toBe(tenantA)
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '已导入 1 条工艺路线' }])
  expect(errors).toEqual([])
})

test('平台选择 B 租户后工艺路线导入写入 B', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page)
  await page.getByTestId('scope-b').click()
  await expect(page.locator('body')).toHaveAttribute('data-import-tenant', tenantB)
  await uploadRouteWorkbook(page)
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].tenant_id).toBe(tenantB)
  expect(errors).toEqual([])
})

test('普通用户伪造 B 租户状态后工艺路线仍写认证租户 A', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page, { role: 'ordinary' })
  await page.getByTestId('forge-scope-b').click()
  await expect(page.locator('body')).toHaveAttribute('data-import-selected-tenant', tenantB)
  await expect(page.locator('body')).toHaveAttribute('data-import-tenant', tenantA)
  await uploadRouteWorkbook(page)
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].tenant_id).toBe(tenantA)
  expect(errors).toEqual([])
})

test('登录身份缺失时工艺路线导入在转换阶段给出可读失败', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page, { identity: 'missing' })
  await uploadRouteWorkbook(page)
  await expect(
    page.getByText('登录信息不完整，无法确定导入目标租户，请重新登录后重试', { exact: true })
  ).toBeVisible()
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('工艺路线 XLSX 在 A 解析期间切 B 后旧文件丢弃且 B 可重选', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page)
  const { requested, release } = await holdSheetjs(page)
  const input = page.locator('input[type="file"]')
  try {
    const buffer = await routeWorkbook()
    await uploadRouteWorkbook(page, buffer)
    await requested
    await page.getByTestId('scope-b').click()
    await expect(page.locator('body')).toHaveAttribute('data-import-tenant', tenantB)
    await expect(input).toHaveValue('')
    const oldModuleResponse = page.waitForResponse('**/src/utils/file/sheetjs.ts*')
    release()
    await oldModuleResponse
    expect(writes).toEqual([])
    await uploadRouteWorkbook(page, buffer)
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].tenant_id).toBe(tenantB)
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

test('解析期间撤销 Import 权限后旧文件不能提交，恢复后可重选', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page, { role: 'ordinary' })
  const { requested, release } = await holdSheetjs(page)
  const buffer = await routeWorkbook('撤权前的旧路线')
  try {
    await uploadRouteWorkbook(page, buffer)
    await requested
    await page.getByTestId('revoke-import').click()
    await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0)
    const oldModuleResponse = page.waitForResponse('**/src/utils/file/sheetjs.ts*')
    release()
    await oldModuleResponse
    expect(writes).toEqual([])
    await page.getByTestId('restore-import').click()
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
    await uploadRouteWorkbook(page, await routeWorkbook('恢复权限后的新路线'))
    await expect.poll(() => writes.map((row) => row.name)).toEqual(['恢复权限后的新路线'])
    expect(writes[0].tenant_id).toBe(tenantA)
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

test('KeepAlive 停用时丢弃解析中的旧文件，恢复后可重选', async ({ page }) => {
  const { writes, errors } = await mountRouteContext(page)
  const { requested, release } = await holdSheetjs(page)
  const buffer = await routeWorkbook('停用前的旧路线')
  try {
    await uploadRouteWorkbook(page, buffer)
    await requested
    await page.getByTestId('deactivate-route').click()
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    const oldModuleResponse = page.waitForResponse('**/src/utils/file/sheetjs.ts*')
    release()
    await oldModuleResponse
    expect(writes).toEqual([])
    await page.getByTestId('activate-route').click()
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
    await uploadRouteWorkbook(page, await routeWorkbook('恢复页面后的新路线'))
    await expect.poll(() => writes.map((row) => row.name)).toEqual(['恢复页面后的新路线'])
    expect(writes[0].tenant_id).toBe(tenantA)
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

for (const scenario of [
  { context: 'tenant', outcome: 'success' },
  { context: 'tenant', outcome: 'failure' },
  { context: 'permission', outcome: 'success' },
  { context: 'deactivated', outcome: 'failure' }
] as const) {
  test(`工艺路线 POST 在途 ${scenario.context} 变化后丢弃旧 ${scenario.outcome} 反馈`, async ({
    page
  }) => {
    const { writes, errors } = await mountRouteContext(
      page,
      scenario.context === 'permission' ? { role: 'ordinary' } : {}
    )
    const release = await holdFirstRouteWrite(page, writes, scenario.outcome)
    try {
      await uploadRouteWorkbook(page, await routeWorkbook('旧上下文路线'))
      await expect.poll(() => writes.length).toBe(1)
      expect(writes[0].tenant_id).toBe(tenantA)
      if (scenario.context === 'tenant') {
        await page.getByTestId('scope-b').click()
        await expect(page.locator('body')).toHaveAttribute('data-import-tenant', tenantB)
      } else if (scenario.context === 'permission') {
        await page.getByTestId('revoke-import').click()
        await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0)
      } else {
        await page.getByTestId('deactivate-route').click()
        await expect(page.locator('input[type="file"]')).toHaveCount(0)
      }
      const oldResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith('/rest/v1/mdm_process_route') &&
          response.request().method() === 'POST'
      )
      release()
      await (await oldResponse).finished()
      if (scenario.context === 'permission') await page.getByTestId('restore-import').click()
      if (scenario.context === 'deactivated') await page.getByTestId('activate-route').click()
      await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
      await uploadRouteWorkbook(page, await routeWorkbook('当前上下文路线'))
      await expect
        .poll(() => writes.map((row) => row.name))
        .toEqual(['旧上下文路线', '当前上下文路线'])
      expect(writes[1].tenant_id).toBe(scenario.context === 'tenant' ? tenantB : tenantA)
      await expect
        .poll(() => readActionFeedbackHistory(page))
        .toEqual([{ kind: 'success', text: '已导入 1 条工艺路线' }])
      expect(errors).toEqual([])
    } finally {
      release()
    }
  })
}

test('当前上下文工艺路线导入失败仍给出一次可读反馈', async ({ page }) => {
  const { errors } = await mountRouteContext(page)
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/mdm_process_route'),
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '工艺路线导入校验未通过，请检查产品物料' }
          })
        : route.fallback()
  )
  await uploadRouteWorkbook(page)
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'error', text: '工艺路线导入校验未通过，请检查产品物料' }])
  expect(errors).toEqual([])
})

test('工艺路线导入工作区浅色桌面和深色窄屏完整使用专注模式', async ({ page }, info) => {
  const { errors } = await mountRouteContext(page, { visual: true })
  await expect(page.locator('.art-search-bar .el-skeleton')).toHaveCount(0)
  await expect(page.locator('.art-search-bar input').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('route-import-light-1440.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(async () => {
    const themeUrl = '/src/hooks/core/useTheme.ts'
    const enumUrl = '/src/enums/app-enum.ts'
    const { useTheme } = await import(themeUrl)
    const { SystemThemeEnum } = await import(enumUrl)
    useTheme().switchThemeStyles(SystemThemeEnum.DARK)
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('route-import-dark-390.png') })
  await assertTableFocusContract(page, info, ['.master-group-panel'])
  expect(errors).toEqual([])
})
