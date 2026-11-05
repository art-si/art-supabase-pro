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
const issueMovementId = (index: number) => `movement-${String(index).padStart(2, '0')}`

function issueRows(start: number, count: number, suffix = 'A') {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset
    return {
      id: `issue-line-${index}`,
      tenant_id: suffix === 'A' ? tenantA : '22222222-2222-4222-8222-222222222222',
      fulfilled_quantity: index === 1 ? 3 : index === 2 ? -1 : 1,
      batch_no: `BATCH-${index}`,
      source_line_no: 'bom-line-a',
      return_type: index === 2 ? 'good' : null,
      remark: index === 1 ? '按单领料' : null,
      movement: {
        id: issueMovementId(index),
        work_order_id:
          suffix === 'A'
            ? '55555555-5555-4555-8555-555555555555'
            : '66666666-6666-4666-8666-666666666666',
        occurred_at: '2026-10-31T08:00:00Z'
      },
      document: {
        kind: index === 2 ? 'return' : 'issue',
        document_no: `PM-${suffix}-${String(index).padStart(3, '0')}`,
        business_date: '2026-10-31'
      },
      material: { material_code: `CORE-${suffix}`, material_name: `芯材 ${suffix}` },
      warehouse: { warehouse_name: '原料仓' },
      bin: { bin_name: 'A-01' },
      unit: { unit_name: '件' }
    }
  })
}

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
    failIssues: false,
    emptyIssues: false,
    heldIssues: [] as Route[],
    delayIssueTenant: '',
    issueRequests: [] as Array<{ url: URL; tenant: string }>,
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
    else if (name === 'mdm_component_type')
      body = [
        {
          id: componentTypes[0],
          component_type_code: 'CORE',
          component_type_name: '芯材',
          enabled: true
        }
      ]
    else if (name === 'wms_work_order_bom_issue_totals_secure') body = []
    else if (name === 'wms_production_material_line') {
      state.issueRequests.push({ url, tenant })
      if (state.delayIssueTenant === tenant) {
        state.heldIssues.push(route)
        return
      }
      if (state.failIssues)
        return route.fulfill({
          status: 503,
          json: { code: 'PGRST000', message: 'connection unavailable' }
        })
      const isSecondPage = url.searchParams.get('offset') === '10'
      const rows = state.emptyIssues
        ? []
        : issueRows(isSecondPage ? 11 : 1, isSecondPage ? 1 : 10, tenant === tenantA ? 'A' : 'B')
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': state.emptyIssues ? '*/0' : `${isSecondPage ? '10-10' : '0-9'}/11`,
          'access-control-expose-headers': 'content-range'
        }
      })
    } else if (name === 'mdm_material')
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
  await page.goto(fixture, { waitUntil: 'domcontentloaded', timeout: 30_000 })
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
    await expect(
      page.getByRole('tabpanel').filter({ visible: true }).locator('input, textarea')
    ).toHaveCount(0)
    await page.screenshot({
      path: join(process.cwd(), '.artifacts', 'work-order-tabs', `readonly-${name}.png`)
    })
  }
  expect(state.saves).toHaveLength(0)
})

test('新增工单的三个生产资料页签说明保存后生成，切回表单仍保留填写值', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'add')
  await page.getByRole('tab', { name: '销售协同', exact: true }).click()
  await field(page, '备注').getByRole('textbox').fill('资料页签前填写')
  for (const [name, title] of [
    ['BOM组件', '保存工单后生成生产资料'],
    ['工艺路线', '保存工单后生成生产资料'],
    ['领用流水', '保存工单后查看领用流水']
  ]) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
  }
  await page.getByRole('tab', { name: '销售协同', exact: true }).click()
  await expect(field(page, '备注').getByRole('textbox')).toHaveValue('资料页签前填写')
  expect(state.issueRequests).toHaveLength(0)
  expect(state.saves).toHaveLength(0)
})

test('已保存快照在编辑和只读页签呈现真实内容，编辑页签不会误提供快照操作', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'saved')
  const evidence = join(process.cwd(), '.artifacts', 'work-order-related-tabs')
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, 'desktop-1440-initial.png') })
  for (const [name, text] of [
    ['BOM组件', '快照芯材 A'],
    ['工艺路线', '板材标准路线']
  ]) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /新增组件|新增工序|编辑路线信息/ })).toHaveCount(
      0
    )
    await page.screenshot({ path: join(evidence, `desktop-1440-${name}.png`) })
  }
  await page.getByRole('tab', { name: '销售协同', exact: true }).click()
  await field(page, '备注').getByRole('textbox').fill('查看快照后仍可保存')
  await page.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => state.saves.length).toBe(1)
  await open(page, 'saved-readonly')
  for (const [name, text] of [
    ['BOM组件', '快照芯材 A'],
    ['工艺路线', '板材标准路线']
  ]) {
    await page.getByRole('tab', { name, exact: true }).click()
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
  }
  await expect(page.getByText('本次表单修改保存后生效', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存更改', exact: true })).toHaveCount(0)
})

test('已有工单无快照时显示资料空态；领用流水失败后可重试、翻页', async ({ page }) => {
  const state = await mockApi(page)
  await open(page, 'edit')
  await page.getByRole('tab', { name: 'BOM组件', exact: true }).click()
  await expect(page.getByText('当前工单没有 BOM 组件', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '工艺路线', exact: true }).click()
  await expect(page.getByText('当前工单没有工艺路线', { exact: true })).toBeVisible()
  state.failIssues = true
  await page.getByRole('tab', { name: '领用流水', exact: true }).click()
  await expect(
    page.getByText('领用流水加载失败，请检查网络和查看权限后重试。', { exact: true })
  ).toBeVisible({ timeout: 15_000 })
  state.failIssues = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('PM-A-001', { exact: true })).toBeVisible()
  await expect(page.getByText('PM-A-002', { exact: true })).toBeVisible()
  await expect(page.getByText('退料', { exact: false }).first()).toBeVisible()
  const scopedIssueRequest = state.issueRequests.find(({ url }) =>
    url.searchParams.has('movement.work_order_id')
  )
  expect(scopedIssueRequest?.url.searchParams.has('tenant_id')).toBe(false)
  expect(scopedIssueRequest?.tenant).toBe(tenantA)
  expect(scopedIssueRequest?.url.searchParams.get('movement.work_order_id')).toBe(
    'eq.55555555-5555-4555-8555-555555555555'
  )
  expect(scopedIssueRequest?.url.searchParams.get('document.kind')).toBe('in.(issue,return)')
  expect(scopedIssueRequest?.url.searchParams.get('fulfilled_quantity')).toBe('neq.0')
  expect(scopedIssueRequest?.url.searchParams.get('order')).toContain('movement(occurred_at).desc')
  await page.screenshot({
    path: join(process.cwd(), '.artifacts', 'work-order-related-tabs', 'desktop-1440-领用流水.png')
  })
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText('PM-A-011', { exact: true })).toBeVisible()
  expect(state.issueRequests.at(-1)?.url.searchParams.get('movement.work_order_id')).toBe(
    'eq.55555555-5555-4555-8555-555555555555'
  )
  expect(state.issueRequests.at(-1)?.url.searchParams.get('select')).toContain('document:')
})

test('1280 与 390 深色下三个生产资料页签和表格保留可读布局', async ({ page }) => {
  await mockApi(page)
  const evidence = join(process.cwd(), '.artifacts', 'work-order-related-tabs')
  mkdirSync(evidence, { recursive: true })
  for (const [width, height, theme] of [
    [1280, 800, 'light'],
    [390, 844, 'dark']
  ] as const) {
    await page.setViewportSize({ width, height })
    await open(page, 'saved', theme)
    for (const name of ['BOM组件', '工艺路线', '领用流水']) {
      await page.getByRole('tab', { name, exact: true }).click()
      await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
      expect(
        await page
          .getByRole('dialog')
          .first()
          .evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return rect.left >= 0 && rect.right <= window.innerWidth + 1
          })
      ).toBe(true)
      await page.screenshot({ path: join(evidence, `${theme}-${width}-${name}.png`) })
    }
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  }
})

test('领用流水空态与迟到旧工单结果保持隔离', async ({ page }) => {
  const state = await mockApi(page)
  state.emptyIssues = true
  await open(page, 'saved')
  await page.getByRole('tab', { name: '领用流水', exact: true }).click()
  await expect(page.getByText('暂无领退料流水', { exact: true })).toBeVisible()
  state.emptyIssues = false
  state.delayIssueTenant = tenantA
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect.poll(() => state.heldIssues.length).toBe(1)
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await page.getByTestId('open-tenant-b').click()
  await page.getByRole('tab', { name: '领用流水', exact: true }).click()
  await expect(page.getByText('PM-B-001', { exact: true })).toBeVisible()
  const oldRequest = state.heldIssues[0]
  const response = page.waitForResponse((value) => value.url() === oldRequest.request().url())
  await oldRequest.fulfill({ json: issueRows(1, 10), headers: { 'content-range': '0-9/11' } })
  await (await response).finished()
  await expect(page.getByText('PM-B-001', { exact: true })).toBeVisible()
  await expect(page.getByText('PM-A-001', { exact: true })).toHaveCount(0)
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
  const warehouseAlert = item
    .getByRole('alert')
    .filter({ hasText: '暂无可用成品仓；请先启用成品仓并设置业务应用范围。' })
  await expect(warehouseAlert).toBeVisible()
  const pickerBounds = await item.locator('.art-data-select').boundingBox()
  const alertBounds = await warehouseAlert.boundingBox()
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
