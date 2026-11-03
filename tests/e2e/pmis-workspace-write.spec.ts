import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertTableFocusContract } from './support/table-focus'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'
import { dictionaries } from './fixtures/form-standard-wms-pmis-dictionaries'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = (scope: 'all' | 'selected' | 'ordinary' = 'all') =>
  `/tests/e2e/fixtures/pmis-plan-read.html?view=write&scope=${scope}&theme=${test.info().project.name.includes('dark') ? 'dark' : 'light'}`
type Save = { p_id: string | null; p_payload: Record<string, unknown> }
type Capture = { writes: Save[]; unknownRest: string[]; pageErrors: string[] }
const captures = new WeakMap<Page, Capture>()
test.afterEach(async ({ page }, info) => {
  await info.attach('actual-import-state', {
    body: JSON.stringify(
      {
        capture: captures.get(page),
        feedback: await readActionFeedbackHistory(page).catch(() => [])
      },
      null,
      2
    ),
    contentType: 'application/json'
  })
})

async function workbook(
  rows: Array<{ name: string; tenant?: string; frequency?: string; duration?: string | number }>
): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('点检方案')
  sheet.addRow(['方案名称', '目标租户', '检查内容', '频次', '完成时长（天）'])
  rows.forEach(({ name, tenant, frequency, duration }) =>
    sheet.addRow([name, tenant ?? '', '温度检查', frequency ?? '每日', duration ?? ''])
  )
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function mount(page: Page, scope: 'all' | 'selected' | 'ordinary' = 'all') {
  const capture: Capture = { writes: [], unknownRest: [], pageErrors: [] }
  captures.set(page, capture)
  page.on('pageerror', (error) => capture.pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.unroute('**/rest/v1/**')
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/pmis_plan') && request.method() === 'GET')
      return route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    if (path.endsWith('/sys_dictionary') && request.method() === 'GET') {
      const code = new URL(request.url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      return route.fulfill({
        json: Object.entries(dictionaries)
          .filter(([name]) => !code || name === code)
          .flatMap(([name, options]) =>
            options.map((item, index) => ({
              id: `${name}-${item.value}`,
              type_id: name,
              code: item.value,
              value: item.value,
              label: item.label,
              sort: index,
              status: '1',
              dict_type_table: { code: name, name }
            }))
          )
      })
    }
    if (path.endsWith('/rpc/pmis_save_plan_secure') && request.method() === 'POST') {
      const payload = request.postDataJSON() as Save
      capture.writes.push(payload)
      return route.fulfill({
        json: `44444444-4444-4444-8444-${String(capture.writes.length).padStart(12, '0')}`
      })
    }
    capture.unknownRest.push(`${request.method()} ${path}`)
    return route.abort()
  })
  await page.goto(fixture(scope))
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
  await installActionFeedbackHistory(page)
  return capture
}

async function upload(page: Page, buffer: Buffer) {
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'pmis-plan.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  })
}

async function noDocumentOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
}

for (const width of [1440, 390]) {
  test(`全部租户新方案默认平台认证租户，仍可明确选 B (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const capture = await mount(page)
    await page.getByRole('button', { name: '新增点检方案' }).click()
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toContainText('新点检方案')
    const target = dialog.locator('[data-art-form-item-key="tenantId"] .el-select')
    await expect(target).toContainText('租户 A')
    await target.click()
    await expect(page.getByRole('option', { name: '租户 B' })).toBeVisible()
    await page.getByRole('option', { name: '租户 B' }).click()
    await expect(target).toContainText('租户 B')
    await noDocumentOverflow(page)
    await page.screenshot({
      path: info.outputPath(`all-root-target-${width}.png`),
      animations: 'disabled'
    })
    await dialog.locator('[data-art-form-item-key="remark"] textarea').scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: '保存方案' })).toBeInViewport()
    await noDocumentOverflow(page)
    await page.screenshot({
      path: info.outputPath(`all-root-lower-${width}.png`),
      animations: 'disabled'
    })
    expect(capture.writes).toEqual([])
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    await assertTableFocusContract(page, info)
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  })
}

for (const scope of ['selected', 'ordinary'] as const) {
  test(`${scope} 范围无目标列导入绑定其认证/选定租户`, async ({ page }) => {
    const capture = await mount(page, scope)
    await upload(page, await workbook([{ name: `${scope} 默认方案` }]))
    await expect.poll(() => capture.writes.length).toBe(1)
    expect(capture.writes[0].p_payload).toMatchObject({
      tenant_id: scope === 'selected' ? tenantB : tenantA,
      plan_kind: 'inspection',
      plan_name: `${scope} 默认方案`
    })
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  })
}

test('全部租户两行真实 XLSX：无目标回认证租户、显式 B，单一完成反馈', async ({ page }, info) => {
  const capture = await mount(page)
  await upload(page, await workbook([{ name: '默认 A' }, { name: '显式 B', tenant: '租户 B' }]))
  await expect.poll(() => capture.writes.length).toBe(2)
  expect(capture.writes.map(({ p_payload }) => [p_payload.tenant_id, p_payload.plan_name])).toEqual(
    [
      [tenantA, '默认 A'],
      [tenantB, '显式 B']
    ]
  )
  expect(capture.writes.map(({ p_payload }) => p_payload.plan_kind)).toEqual([
    'inspection',
    'inspection'
  ])
  await expect(page.getByText('方案导入完成', { exact: true })).toBeVisible()
  expect(await readActionFeedbackHistory(page)).toEqual([{ kind: 'success', text: '方案导入完成' }])
  await noDocumentOverflow(page)
  await page.screenshot({
    path: info.outputPath('two-row-import-desktop.png'),
    animations: 'disabled'
  })
  expect(capture.unknownRest).toEqual([])
  expect(capture.pageErrors).toEqual([])
})

for (const [scope, target] of [
  ['all', '不存在的租户'],
  ['selected', '租户 A']
] as const) {
  test(`${scope} 范围拒绝目标列 ${target} 且不写入`, async ({ page }) => {
    const capture = await mount(page, scope)
    await upload(page, await workbook([{ name: '拒绝方案', tenant: target }]))
    await expect(page.locator('.el-message--error')).toContainText(
      scope === 'all' ? '目标租户无效或不在可选范围内' : '目标租户与当前选择不一致'
    )
    expect(capture.writes).toEqual([])
    expect(
      (await readActionFeedbackHistory(page)).filter((event) => event.kind === 'success')
    ).toEqual([])
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  })
}

for (const control of [
  'scope-b',
  'kind-patrol',
  'revoke-import',
  'deactivate-workspace'
] as const) {
  test(`第一行 RPC 在途 ${control} 后不派发第二行或迟到反馈`, async ({ page }) => {
    const capture = await mount(page, control === 'revoke-import' ? 'ordinary' : 'all')
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/rest/v1/rpc/pmis_save_plan_secure', async (route) => {
      capture.writes.push(route.request().postDataJSON() as Save)
      await held
      await route.fulfill({ json: '44444444-4444-4444-8444-444444444441' })
    })
    try {
      await upload(
        page,
        await workbook([
          { name: '在途 A', tenant: '租户 A' },
          { name: '不得发 B', tenant: '租户 A' }
        ])
      )
      await expect.poll(() => capture.writes.length).toBe(1)
      await page.getByTestId(control).click()
      const response = page.waitForResponse('**/rest/v1/rpc/pmis_save_plan_secure')
      release?.()
      await response
      await page.waitForTimeout(200)
      expect(capture.writes).toHaveLength(1)
      expect(await readActionFeedbackHistory(page)).toEqual([])
      expect(capture.unknownRest).toEqual([])
      expect(capture.pageErrors).toEqual([])
    } finally {
      release?.()
    }
  })
}

test('真实 SheetJS 模块解析 A→B 丢弃旧文件，B 再选同文件成功', async ({ page }) => {
  const capture = await mount(page)
  let release: (() => void) | undefined
  let notify: (() => void) | undefined
  const requested = new Promise<void>((resolve) => (notify = resolve))
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/src/utils/file/sheetjs.ts*', async (route) => {
    notify?.()
    await held
    await route.continue()
  })
  try {
    const file = await workbook([{ name: '旧 A 文件' }])
    await upload(page, file)
    await requested // Real lazy import request, not an internal handler or fabricated parsed rows.
    await page.getByTestId('scope-b').click()
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
    await expect(page.locator('input[type="file"]').first()).toHaveValue('')
    expect(capture.writes).toEqual([])
    expect(await readActionFeedbackHistory(page)).toEqual([])
    await upload(page, file)
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeDisabled()
    release?.()
    await expect.poll(() => capture.writes.length).toBe(1)
    expect(capture.writes[0].p_payload).toMatchObject({
      tenant_id: tenantB,
      plan_name: '旧 A 文件'
    })
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  } finally {
    release?.()
  }
})

for (const invalid of [
  { name: '无效频次', frequency: 'toString', expected: '执行频次无效' },
  { name: '无效时长', duration: 'abc', expected: '完成时长必须是 1—365 的整数天' },
  { name: '负时长', duration: -1, expected: '完成时长必须是 1—365 的整数天' }
]) {
  test(`整批预校验：第二行${invalid.name} 时第一行也不提交`, async ({ page }) => {
    const capture = await mount(page, 'selected')
    await upload(page, await workbook([{ name: '有效但不得提交' }, invalid]))
    await expect(page.locator('.el-message--error')).toContainText(invalid.expected)
    expect(capture.writes).toEqual([])
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  })
}

for (const code of ['P0001', 'session_expired']) {
  test(`第二行 RPC ${code} 仅报一次部分导入并允许核对后重试`, async ({ page }) => {
    const capture = await mount(page, 'selected')
    await page.route('**/rest/v1/rpc/pmis_save_plan_secure', async (route) => {
      capture.writes.push(route.request().postDataJSON() as Save)
      if (capture.writes.length === 2)
        return route.fulfill({ status: 400, json: { message: '方案保存失败', code } })
      return route.fulfill({ json: '44444444-4444-4444-8444-444444444441' })
    })
    await upload(page, await workbook([{ name: '已写一行' }, { name: '失败二行' }]))
    await expect(page.locator('.el-message--error')).toContainText(
      '已导入 1 条方案，其余未完成；请刷新核对结果后重试'
    )
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
    expect(capture.writes).toHaveLength(2)
    expect(await readActionFeedbackHistory(page)).toEqual([
      { kind: 'error', text: '已导入 1 条方案，其余未完成；请刷新核对结果后重试' }
    ])
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  })
}
