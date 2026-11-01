import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const typeId = '33333333-3333-4333-8333-333333333333'
const materialId = '44444444-4444-4444-8444-444444444444'
const manualId = '77777777-7777-4777-8777-777777777777'
const componentTypes = [
  '88888888-8888-4888-8888-888888888881',
  '88888888-8888-4888-8888-888888888882',
  '88888888-8888-4888-8888-888888888883'
]
const componentIds = (tenant: string) =>
  [1, 2, 3].map(
    (index) => `${tenant === tenantA ? 'a' : 'b'}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`
  )
const fixture = '/tests/e2e/fixtures/work-order-bom-extension.html'

function bomRows(tenant: string) {
  const suffix = tenant === tenantA ? 'A' : 'B'
  const names = ['芯材', '外板', '内板']
  return [
    {
      items: componentIds(tenant).map((id, index) => ({
        id: `bom-item-${index}`,
        sequence_no: index + 1,
        component_type_id: componentTypes[index],
        component: {
          id,
          material_code: `BOM-${index}-${suffix}`,
          material_name: `BOM${names[index]}${suffix}`
        }
      }))
    }
  ]
}

function materialOptions(tenant: string) {
  const suffix = tenant === tenantA ? 'A' : 'B'
  return [
    { id: materialId, code: 'PANEL-TEST', name: 'BOM 验证板材' },
    { id: manualId, code: 'MANUAL', name: '人工芯材' },
    ...componentIds(tenant).map((id, index) => ({
      id,
      code: `BOM-${index}-${suffix}`,
      name: `BOM${['芯材', '外板', '内板'][index]}${suffix}`
    }))
  ]
}

const extensionFields = [
  ...['芯材', '外板', '内板'].map((label, index) => ({
    key: ['core', 'outer', 'inner'][index],
    label,
    valueType: 'material',
    sourceComponentTypeId: componentTypes[index]
  })),
  { key: 'width', label: '宽度 mm', valueType: 'number', sourceComponentTypeId: null },
  { key: 'film', label: '覆膜', valueType: 'text', sourceComponentTypeId: null }
]

async function mockApi(page: Page, options: { finishedMaterial?: boolean } = {}) {
  await prepareIsolatedSession(page)
  const state = {
    bomRequests: [] as Array<{ url: URL; tenant: string }>,
    held: [] as Route[],
    delayTenant: '',
    failBom: false,
    saves: [] as Record<string, unknown>[]
  }
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const params: Record<string, unknown> =
      route.request().method() === 'POST' ? route.request().postDataJSON() : {}
    const tenant = String(
      params.p_tenant_id ??
        url.searchParams.get('tenant_id')?.replace(/^eq\./, '') ??
        route.request().headers()['x-art-tenant-scope'] ??
        tenantA
    )
    let body: unknown = []
    if (name === 'mes_work_order_references')
      body = {
        materials: materialOptions(tenant),
        customers: [],
        projects: [],
        employees: [],
        workCenters: [],
        documentTypes: [
          {
            id: typeId,
            code: 'PANEL',
            name: '板材生产工单',
            packingEnabled: true,
            projectRequired: false,
            extensionFields
          }
        ]
      }
    else if (name === 'mdm_document_type') body = [{ id: typeId }]
    else if (name === 'mdm_material')
      body = [
        {
          id: materialId,
          description: 'BOM 验证板材',
          width: 1000,
          thickness: 50,
          attribute_group_id: null,
          attribute_values: {}
        }
      ]
    else if (name === 'mes_work_order_material_options')
      body = {
        data: [
          {
            id: materialId,
            tenantId: tenant,
            materialCode: 'PANEL-TEST',
            materialName: 'BOM 验证板材',
            materialType: options.finishedMaterial ? 'FERT' : 'HALB',
            code: 'PANEL-TEST',
            name: 'BOM 验证板材',
            categoryId: '',
            productionUnitName: '平方米'
          }
        ],
        total: 1
      }
    else if (name === 'mdm_bom') {
      state.bomRequests.push({ url, tenant })
      if (state.delayTenant === tenant) {
        state.held.push(route)
        return
      }
      if (state.failBom)
        return route.fulfill({
          status: 503,
          json: { code: 'PGRST000', message: 'connection unavailable' }
        })
      body = bomRows(tenant)
    } else if (name === 'mes_save_work_order_with_details') {
      state.saves.push(params)
      body = '55555555-5555-4555-8555-555555555555'
    }
    return route.fulfill({
      json: body,
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  return state
}

function field(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"el-form-item")][1]')
}

async function open(page: Page, mode: string, theme: 'light' | 'dark' = 'light') {
  await prepareAppearance(page, { theme, boxBorderMode: true })
  await page.goto(fixture)
  await page.getByTestId(`open-${mode}`).click()
  await expect(page.getByRole('dialog').first()).toBeVisible()
}

async function expectBom(page: Page, suffix: 'A' | 'B') {
  await page.getByRole('tab', { name: '专用参数', exact: true }).click()
  for (const label of ['芯材', '外板', '内板'])
    await expect(field(page, label)).toContainText(`BOM${label}${suffix}`)
}

for (const mode of ['edit', 'copy', 'reference'])
  test(`${mode}：空的组件参数按 BOM 类型补齐，并随保存提交`, async ({ page }, info) => {
    const state = await mockApi(page)
    await open(page, mode)
    await expectBom(page, 'A')
    expect(state.bomRequests).toHaveLength(1)
    expect(state.bomRequests[0].tenant).toBe(tenantA)
    expect(state.bomRequests[0].url.searchParams.get('material_id')).toBe(`eq.${materialId}`)
    expect(state.bomRequests[0].url.searchParams.getAll('or')).toContain(
      '(effective_from.is.null,effective_from.lte.2026-10-31)'
    )
    if (mode === 'copy') {
      mkdirSync(join(process.cwd(), '.artifacts', 'work-order-bom'), { recursive: true })
      await field(page, '芯材').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: join(
          process.cwd(),
          '.artifacts',
          'work-order-bom',
          `${info.project.name}-copy-filled.png`
        )
      })
    }
    await page.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect.poll(() => state.saves.length).toBe(1)
    expect(state.saves[0].p_header).toMatchObject({
      extension_values: {
        core: componentIds(tenantA)[0],
        outer: componentIds(tenantA)[1],
        inner: componentIds(tenantA)[2]
      }
    })
  })

test('已有人工组件、宽度和覆膜保持原值，仅补空缺组件', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'manual')
  await page.getByRole('tab', { name: '专用参数', exact: true }).click()
  await expect(field(page, '芯材')).toContainText('人工芯材')
  await expect(field(page, '外板')).toContainText('BOM外板A')
  await expect(field(page, '内板')).toContainText('BOM内板A')
  await expect(field(page, '宽度 mm').getByRole('spinbutton')).toHaveValue('888.0000')
  await expect(field(page, '覆膜').getByRole('textbox')).toHaveValue('人工覆膜')
  await page.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => state.saves.length).toBe(1)
  expect(state.saves[0].p_header).toMatchObject({
    extension_values: { core: manualId, width: 888, film: '人工覆膜' }
  })
})

test('只读查看不重新读取 BOM 或改变历史参数', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'readonly')
  await expect(page.getByRole('heading', { name: '工单详情', exact: true })).toBeVisible()
  await expect(page.locator('.art-dialog__viewport.is-loading')).toHaveCount(0)
  expect(state.bomRequests).toHaveLength(0)
  await expect(page.getByRole('button', { name: '保存更改', exact: true })).toHaveCount(0)
  for (const name of ['基本信息', '产品与计划', '销售协同', '生产明细']) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
    await expect(page.getByRole('tabpanel').filter({ visible: true }).locator('input, textarea')).toHaveCount(0)
    await page.screenshot({ path: join(process.cwd(), '.artifacts', 'work-order-tabs', `readonly-${name}.png`) })
  }
  expect(state.saves).toHaveLength(0)
})

test('关闭后重新打开另一租户，迟到 BOM 响应不串入新工单', async ({ page }) => {
  const state = await mockApi(page)
  state.delayTenant = tenantA
  await open(page, 'copy')
  await expect.poll(() => state.held.length).toBe(1)
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByTestId('open-tenant-b').click()
  await expectBom(page, 'B')
  const response = page.waitForResponse((value) => value.url() === state.held[0].request().url())
  await state.held[0].fulfill({ json: bomRows(tenantA) })
  await (await response).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expectBom(page, 'B')
  await expect(field(page, '芯材')).not.toContainText('BOM芯材A')
})

test('关闭后新增空工单，迟到响应不回填上张单的组件', async ({ page }) => {
  const state = await mockApi(page)
  state.delayTenant = tenantA
  await open(page, 'edit')
  await expect.poll(() => state.held.length).toBe(1)
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByTestId('open-add').click()
  await page.getByRole('tab', { name: '专用参数', exact: true }).click()
  await expect(field(page, '芯材')).toContainText('请选择芯材')
  const response = page.waitForResponse((value) => value.url() === state.held[0].request().url())
  await state.held[0].fulfill({ json: bomRows(tenantA) })
  await (await response).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(field(page, '芯材')).toContainText('请选择芯材')
  expect(state.bomRequests).toHaveLength(1)
})

test('读取失败提供中文反馈，仍允许手动选择组件', async ({ page }) => {
  const state = await mockApi(page)
  state.failBom = true
  await open(page, 'reference')
  await expect(
    page.getByText('BOM 组件带入失败，请手动填写工单专用参数', { exact: true })
  ).toBeVisible()
  await page.getByRole('tab', { name: '专用参数', exact: true }).click()
  await field(page, '芯材').locator('.el-select').click()
  await page.getByRole('option', { name: /人工芯材/ }).click()
  await expect(field(page, '芯材')).toContainText('人工芯材')
})

test('新增选择物料仍带入组件，切换工单类型后可重新带入', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'add')
  await page.getByRole('tab', { name: '产品与计划', exact: true }).click()
  await page.getByPlaceholder('请选择物料描述').click()
  await page.getByRole('cell', { name: 'BOM 验证板材', exact: true }).first().click()
  await page.getByRole('button', { name: '确定', exact: true }).last().click()
  await expectBom(page, 'A')
  expect(state.bomRequests).toHaveLength(1)
  await page.getByRole('tab', { name: '基本信息', exact: true }).click()
  await field(page, '工单类型').locator('.el-select').hover()
  await field(page, '工单类型').locator('.el-select__clear').click()
  await expect(field(page, '芯材')).toHaveCount(0)
  await field(page, '工单类型').locator('.el-select').click()
  await page.getByRole('option', { name: /板材生产工单/ }).click()
  await expect.poll(() => state.bomRequests.length).toBe(2)
  await expectBom(page, 'A')
  expect(state.bomRequests).toHaveLength(2)
})

test('物料缺少成品仓时，提示与物料选择框保留可见间距', async ({ page }) => {
  await mockApi(page, { finishedMaterial: true })
  await open(page, 'add')
  await page.getByRole('tab', { name: '产品与计划', exact: true }).click()
  await page.getByPlaceholder('请选择物料描述').click()
  await page.getByRole('cell', { name: 'BOM 验证板材', exact: true }).first().click()
  await page.getByRole('button', { name: '确定', exact: true }).last().click()
  const item = field(page, '物料描述')
  await expect(item.getByRole('alert')).toBeVisible()
  const pickerBounds = await item.locator('.art-data-select').boundingBox()
  const alertBounds = await item.getByRole('alert').boundingBox()
  expect(pickerBounds).not.toBeNull()
  expect(alertBounds).not.toBeNull()
  expect(
    (alertBounds?.y ?? 0) - ((pickerBounds?.y ?? 0) + (pickerBounds?.height ?? 0))
  ).toBeGreaterThanOrEqual(11)
  await page.screenshot({
    path: join(process.cwd(), '.artifacts', 'work-order-tabs', 'material-warning-spacing.png')
  })
})

test('工单横向页签保留填写值，隐藏页签必填校验可定位，明细错误返回对应页签', async ({
  page
}, info) => {
  const state = await mockApi(page)
  await open(page, 'add')
  const names = ['基本信息', '产品与计划', '销售协同', '专用参数', '生产明细']
  for (const name of names) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.getByRole('tab', { name: '销售协同', exact: true }).click()
  await field(page, '备注').getByRole('textbox').fill('页签切换后保留的备注')
  await page.getByRole('tab', { name: '基本信息', exact: true }).click()
  await page.getByRole('tab', { name: '销售协同', exact: true }).click()
  await expect(field(page, '备注').getByRole('textbox')).toHaveValue('页签切换后保留的备注')
  await page.getByRole('button', { name: '创建工单', exact: true }).click()
  await expect(page.getByRole('tab', { name: '产品与计划', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByText('请选择物料描述', { exact: true }).last()).toBeVisible()
  await expect(field(page, '物料描述').getByRole('textbox')).toBeFocused()
  expect(state.saves).toHaveLength(0)
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByTestId('open-edit').click()
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  let navTop: number | undefined
  for (const name of names) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
    const nav = page.getByRole('tablist')
    const bounds = await nav.boundingBox()
    expect(bounds?.height).toBeLessThan(65)
    if (navTop !== undefined) expect(Math.abs((bounds?.y ?? 0) - navTop)).toBeLessThan(2)
    navTop = bounds?.y
    mkdirSync(join(process.cwd(), '.artifacts', 'work-order-tabs'), { recursive: true })
    await page.screenshot({
      path: join(process.cwd(), '.artifacts', 'work-order-tabs', `${info.project.name}-${name}.png`)
    })
  }
  await page.getByRole('button', { name: '新增明细', exact: true }).click()
  await page.getByRole('tab', { name: '基本信息', exact: true }).click()
  await page.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(page.getByRole('tab', { name: '生产明细', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(
    page.getByText('生产单明细第 1 行：请填写区域', { exact: true }).first()
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: '区域', exact: true })).toBeFocused()
  expect(state.saves).toHaveLength(0)
})

test('生产明细复用表格红框与必填星号，尺寸为零定位错误，修正后可保存', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'edit')
  await page.getByRole('tab', { name: '生产明细', exact: true }).click()
  await expect(page.locator('.work-order-details .art-table__required-marker')).toHaveCount(5)
  const lengthHelp = page.getByLabel('长度 mm填写说明', { exact: true })
  await lengthHelp.hover()
  await expect(page.getByRole('tooltip').filter({ hasText: '长度必须大于 0 mm' })).toBeVisible()
  await page.getByRole('button', { name: '新增明细', exact: true }).click()
  await page.getByRole('textbox', { name: '区域', exact: true }).fill('1轴')
  await page.getByRole('textbox', { name: '编号', exact: true }).fill('1轴-1')
  const length = page.getByRole('spinbutton', { name: '长度毫米', exact: true })
  const width = page.getByRole('spinbutton', { name: '宽度毫米', exact: true })
  await width.fill('0')
  await width.press('Tab')
  await page.getByRole('tab', { name: '基本信息', exact: true }).click()
  await page.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(page.getByRole('tab', { name: '生产明细', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(length).toBeFocused()
  await expect(page.locator('.work-order-details .is-validation-error')).toHaveCount(2)
  await expect(
    page.locator('.el-message').filter({ hasText: '生产单明细第 1 行：长度必须大于 0 mm' })
  ).toBeVisible()
  await page.screenshot({
    path: join(process.cwd(), '.artifacts', 'work-order-tabs', 'detail-invalid-dimensions.png')
  })
  await length.fill('1000')
  await length.press('Tab')
  await expect(page.locator('.work-order-details .is-validation-error')).toHaveCount(1)
  await page.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(width).toBeFocused()
  await expect(
    page.locator('.el-message').filter({ hasText: '生产单明细第 1 行：宽度必须大于 0 mm' })
  ).toBeVisible()
  await width.fill('800')
  await width.press('Tab')
  await expect(page.locator('.work-order-details .is-validation-error')).toHaveCount(0)
  await page.screenshot({
    path: join(process.cwd(), '.artifacts', 'work-order-tabs', 'detail-valid-dimensions.png')
  })
  await page.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.saves).toHaveLength(1)
  const details = state.saves[0].p_details as Array<Record<string, unknown>>
  expect(details[0]).toMatchObject({ area: '1轴', number: '1轴-1', length_mm: 1000, width_mm: 800 })
})

test('复制工单在窄屏深色下仍完整显示自动带入参数', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 768, height: 900 })
  await open(page, 'copy', 'dark')
  await expectBom(page, 'A')
  await field(page, '芯材').scrollIntoViewIfNeeded()
  expect(
    await page.getByRole('dialog').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return (
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        element.scrollWidth <= element.clientWidth + 1
      )
    })
  ).toBe(true)
  mkdirSync(join(process.cwd(), '.artifacts', 'work-order-tabs'), { recursive: true })
  for (const name of ['基本信息', '产品与计划', '销售协同', '专用参数', '生产明细']) {
    await page.getByRole('tab', { name, exact: true }).click()
    expect(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    ).toBe(true)
    await page.screenshot({
      path: join(process.cwd(), '.artifacts', 'work-order-tabs', `dark-768-${name}.png`)
    })
  }
})
