import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = '/tests/e2e/fixtures/smis-safety-write-tenant.html'
const evidenceDir = join(process.cwd(), '.artifacts', 'quality-audit', 'smis-safety-write-tenant')
const tenantName = (tenantId: string) => (tenantId === tenantA ? '租户 A' : '租户 B')
const suffix = (tenantId: string) => (tenantId === tenantA ? 'A' : 'B')

function body(route: Route): Record<string, unknown> {
  const value: unknown = route.request().postDataJSON()
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function row(tenantId: string) {
  const key = suffix(tenantId)
  return {
    id: `inspection-${key}`,
    tenant_id: tenantId,
    inspection_type_id: `type-${key}`,
    inspection_type_name: `类别 ${key}`,
    inspection_name: `安全检查 ${key}`,
    inspection_organization_id: `org-${key}`,
    inspection_organization_name: `组织 ${key}`,
    inspected_organization_id: `org-${key}`,
    inspected_organization_name: `组织 ${key}`,
    inspection_time: '2026-10-28T08:00:00Z',
    plan_attachment_urls: [],
    inspectors: [
      {
        id: `employee-${key}`,
        tenant_id: tenantId,
        organization_id: `org-${key}`,
        employee_no: `EMP-${key}`,
        employee_name: `员工 ${key}`,
        job_title: '安全员',
        employment_status: 'active'
      }
    ],
    inspector_names: `员工 ${key}`,
    remark: `原说明 ${key}`,
    create_time: '2026-10-28T08:00:00Z'
  }
}

function options(tenantIds: string[]) {
  return {
    inspectionTypes: tenantIds.map((tenantId) => ({
      id: `type-${suffix(tenantId)}`,
      tenantId,
      typeCode: `TYPE-${suffix(tenantId)}`,
      typeName: `类别 ${suffix(tenantId)}`
    })),
    organizations: tenantIds.map((tenantId) => ({
      id: `org-${suffix(tenantId)}`,
      tenantId,
      parentId: null,
      organizationCode: `ORG-${suffix(tenantId)}`,
      organizationName: `组织 ${suffix(tenantId)}`,
      organizationType: 'department',
      sort: 1
    }))
  }
}

interface Harness {
  saves: Record<string, unknown>[]
  employeeTenants: unknown[]
}

async function setup(page: Page, tenantIds: string[], rows: ReturnType<typeof row>[] = []) {
  await prepareIsolatedSession(page)
  const saves: Record<string, unknown>[] = []
  const employeeTenants: unknown[] = []
  await page.route('**/rest/v1/rpc/smis_list_safety_inspection_options_secure', (route) =>
    route.fulfill({ json: options(tenantIds) })
  )
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', (route) =>
    route.fulfill({
      json: {
        records: rows,
        total: rows.length,
        overview: {
          total: rows.length,
          this_month: rows.length,
          organization_count: rows.length,
          inspector_count: rows.length
        }
      }
    })
  )
  await page.route('**/rest/v1/rpc/hr_list_employee_selector_secure', (route) => {
    const tenantId = body(route).p_tenant_id
    employeeTenants.push(tenantId)
    const key = tenantId === tenantA ? 'A' : 'B'
    return route.fulfill({
      json: {
        records: [
          {
            id: `employee-${key}`,
            tenant_id: tenantId,
            organization_id: `org-${key}`,
            employee_no: `EMP-${key}`,
            employee_name: `员工 ${key}`,
            employment_status: 'active'
          }
        ],
        total: 1,
        field_access: {}
      }
    })
  })
  await page.route('**/rest/v1/rpc/smis_save_safety_inspection_secure', (route) => {
    saves.push(body(route))
    return route.fulfill({ json: 'saved-inspection' })
  })
  return { saves, employeeTenants } satisfies Harness
}

async function openCreate(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '新增安全检查' }).click()
  const dialog = page.getByRole('dialog', { name: '新增安全检查' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function chooseType(page: Page, dialog: Locator, key: 'A' | 'B') {
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '检查类别' })
    .locator('.el-select')
    .click()
  await page.getByRole('option', { name: `类别 ${key} · TYPE-${key}` }).click()
}

async function chooseOrganization(page: Page, dialog: Locator, label: string, key: 'A' | 'B') {
  await dialog.getByPlaceholder(`点击选择${label}`).click()
  const picker = page.getByRole('dialog', { name: `选择${label}` })
  await picker.getByText(`组织 ${key}`, { exact: true }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
}

async function chooseEmployee(page: Page, dialog: Locator, key: 'A' | 'B') {
  await dialog.getByPlaceholder('选择一名或多名检查人').click()
  const picker = page.getByRole('dialog', { name: '选择检查人' })
  await picker
    .getByRole('row')
    .filter({ hasText: `EMP-${key}` })
    .locator('label.el-checkbox')
    .click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
}

async function fillCreate(page: Page, dialog: Locator, key: 'A' | 'B') {
  await dialog.getByRole('textbox', { name: '检查名称' }).fill(`新检查 ${key}`)
  await chooseType(page, dialog, key)
  await chooseOrganization(page, dialog, '检查单位', key)
  await chooseOrganization(page, dialog, '被检查单位', key)
  await chooseEmployee(page, dialog, key)
}

async function save(dialog: Locator) {
  await dialog.getByRole('button', { name: '创建检查记录' }).click()
  await expect(dialog).toHaveCount(0)
}

function savedPayload(harness: Harness, index = 0): Record<string, unknown> {
  const payload = harness.saves[index]?.p_payload
  expect(payload).toBeTruthy()
  return payload as Record<string, unknown>
}

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
}

test('普通用户即使带伪造的 B 视角也只能建立本租户 A 记录', async ({ page }) => {
  const harness = await setup(page, [tenantA, tenantB])
  await page.goto(`${fixture}?role=ordinary&scope=b&forge=b`, { waitUntil: 'domcontentloaded' })
  const dialog = await openCreate(page)
  await expect(dialog.getByText('所属租户', { exact: true })).toHaveCount(0)
  await fillCreate(page, dialog, 'A')
  await save(dialog)
  expect(savedPayload(harness).tenant_id).toBe(tenantA)
  expect(harness.saves[0].p_inspector_ids).toEqual(['employee-A'])
  expect(harness.employeeTenants).toEqual([tenantA])
})

test('平台选中 B 时新增固定 B，编辑仍固定原行 B', async ({ page }) => {
  const harness = await setup(page, [tenantB], [row(tenantB)])
  await page.goto(`${fixture}?scope=b`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 B', { exact: true })).toBeVisible()
  const createDialog = await openCreate(page)
  await expect(createDialog.getByText('所属租户', { exact: true })).toHaveCount(0)
  await fillCreate(page, createDialog, 'B')
  await save(createDialog)
  expect(savedPayload(harness).tenant_id).toBe(tenantB)
  expect(harness.employeeTenants).toEqual([tenantB])

  const record = page.locator('.el-table__body-wrapper tr').filter({ hasText: '安全检查 B' })
  await record.getByRole('button', { name: '编辑' }).click()
  const editDialog = page.getByRole('dialog', { name: '编辑安全检查' })
  await expect(editDialog).toBeVisible()
  await expect(editDialog.getByText('所属租户', { exact: true })).toHaveCount(0)
  await editDialog.getByRole('button', { name: '保存更改' }).click()
  await expect(editDialog).toHaveCount(0)
  expect(savedPayload(harness, 1).tenant_id).toBe(tenantB)
  expect(harness.saves[1].p_inspector_ids).toEqual(['employee-B'])
})

test('平台全部租户默认 A，明确选择 B 后清理旧关联与附件', async ({ page }) => {
  const harness = await setup(page, [tenantA, tenantB])
  const attachmentTenants: string[] = []
  await page.route('**/rest/v1/sys_attachment?*', (route) => {
    const filter = new URL(route.request().url()).searchParams.get('tenant_id') || ''
    const tenantId = filter.replace(/^eq\./, '')
    attachmentTenants.push(tenantId)
    return route.fulfill({
      json: {
        id: `attachment-${suffix(tenantId)}`,
        tenant_id: tenantId,
        origin_name: `proof-${suffix(tenantId)}.pdf`,
        object_name: `proof-${suffix(tenantId)}.pdf`,
        url: `https://example.invalid/proof-${suffix(tenantId)}.pdf`
      }
    })
  })
  await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
  const dialog = await openCreate(page)
  const tenantSelect = dialog
    .locator('.el-form-item')
    .filter({ hasText: '所属租户' })
    .locator('.el-select')
  await expect(tenantSelect).toContainText(tenantName(tenantA))
  await fillCreate(page, dialog, 'A')
  await dialog.locator('.art-upload-file input[type="file"]').setInputFiles({
    name: 'proof-A.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('tenant A proof')
  })
  await expect(dialog.locator('.art-upload-file__item')).toContainText('proof-A.pdf')
  await tenantSelect.click()
  await page.getByRole('option', { name: /租户 B/ }).click()
  await expect(dialog.getByText('类别 A · TYPE-A', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('员工 A · EMP-A', { exact: true })).toHaveCount(0)
  await expect(dialog.locator('.art-upload-file__item')).toHaveCount(0)
  await fillCreate(page, dialog, 'B')
  await dialog.locator('.art-upload-file input[type="file"]').setInputFiles({
    name: 'proof-B.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('tenant B proof')
  })
  await expect(dialog.locator('.art-upload-file__item')).toContainText('proof-B.pdf')
  await save(dialog)
  const payload = savedPayload(harness)
  expect(payload).toMatchObject({
    tenant_id: tenantB,
    inspection_type_id: 'type-B',
    inspection_organization_id: 'org-B',
    inspected_organization_id: 'org-B',
    plan_attachment_urls: ['https://example.invalid/proof-B.pdf']
  })
  expect(harness.saves[0].p_inspector_ids).toEqual(['employee-B'])
  expect(harness.employeeTenants).toEqual([tenantA, tenantB])
  expect(attachmentTenants).toEqual([tenantA, tenantB])
})

test('平台全部租户创建默认认证租户 A，编辑 B 行始终沿用 B', async ({ page }) => {
  const harness = await setup(page, [tenantA, tenantB], [row(tenantB)])
  await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 B', { exact: true })).toBeVisible()
  const createDialog = await openCreate(page)
  await expect(
    createDialog.locator('.el-form-item').filter({ hasText: '所属租户' }).locator('.el-select')
  ).toContainText(tenantName(tenantA))
  await fillCreate(page, createDialog, 'A')
  await save(createDialog)
  expect(savedPayload(harness).tenant_id).toBe(tenantA)

  const record = page.locator('.el-table__body-wrapper tr').filter({ hasText: '安全检查 B' })
  await record.getByRole('button', { name: '编辑' }).click()
  const editDialog = page.getByRole('dialog', { name: '编辑安全检查' })
  await expect(editDialog).toBeVisible()
  await expect(editDialog.getByText('所属租户', { exact: true })).toHaveCount(0)
  await editDialog.getByRole('button', { name: '保存更改' }).click()
  await expect(editDialog).toHaveCount(0)
  expect(savedPayload(harness, 1).tenant_id).toBe(tenantB)
  expect(harness.saves[1].p_inspector_ids).toEqual(['employee-B'])
})

test('A 附件上传未完成时切至 B，迟到的 A 附件不能进入 B 载荷', async ({ page }) => {
  const harness = await setup(page, [tenantA, tenantB])
  let notifyA: (() => void) | undefined
  let releaseA: (() => void) | undefined
  const aRequested = new Promise<void>((resolve) => (notifyA = resolve))
  const aReleased = new Promise<void>((resolve) => (releaseA = resolve))
  await page.route('**/rest/v1/sys_attachment?*', async (route) => {
    const tenantId = (new URL(route.request().url()).searchParams.get('tenant_id') || '').replace(
      /^eq\./,
      ''
    )
    expect(tenantId).toBe(tenantA)
    notifyA?.()
    await aReleased
    await route.fulfill({
      json: {
        id: 'attachment-A-pending',
        tenant_id: tenantA,
        origin_name: 'pending-A.pdf',
        object_name: 'pending-A.pdf',
        url: 'https://example.invalid/pending-A.pdf'
      }
    })
  })
  await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
  const dialog = await openCreate(page)
  await dialog.locator('.art-upload-file input[type="file"]').setInputFiles({
    name: 'pending-A.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('pending tenant A proof')
  })
  await aRequested
  const tenantSelect = dialog
    .locator('.el-form-item')
    .filter({ hasText: '所属租户' })
    .locator('.el-select')
  await tenantSelect.click()
  await page.getByRole('option', { name: /租户 B/ }).click()
  const oldResponse = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/sys_attachment?')
  )
  releaseA?.()
  await oldResponse
  await expect(dialog.locator('.art-upload-file__spinner')).toHaveCount(0)
  await expect(dialog.locator('.art-upload-file__item')).toHaveCount(0)
  await fillCreate(page, dialog, 'B')
  await save(dialog)
  expect(savedPayload(harness).tenant_id).toBe(tenantB)
  expect(savedPayload(harness).plan_attachment_urls).toEqual([])
})

test('全部租户列表首次失败后重开可恢复，选择器不泄露原始租户 ID', async ({ page }) => {
  await setup(page, [tenantA, tenantB])
  let tenantCalls = 0
  let restored = false
  await page.route('**/rest/v1/sys_tenant?*', (route) => {
    tenantCalls++
    if (!restored)
      return route.fulfill({ status: 503, json: { code: 'PGRST000', message: 'temporary' } })
    return route.fulfill({
      json: [
        { id: tenantA, tenant_code: 'A', tenant_name: '租户 A', builtin_type: 'platform' },
        { id: tenantB, tenant_code: 'B', tenant_name: '租户 B', builtin_type: 'business' }
      ],
      headers: { 'content-range': '0-1/2' }
    })
  })
  await page.goto(`${fixture}?scope=all&tenantOptions=fetch`, { waitUntil: 'domcontentloaded' })
  const firstDialog = await openCreate(page)
  const tenantField = firstDialog.locator('.el-form-item').filter({ hasText: '所属租户' })
  await expect(tenantField).toContainText('可关闭后重新打开重试')
  await expect(tenantField).not.toContainText(tenantA)
  await firstDialog.getByRole('button', { name: '取消' }).click()
  await expect(firstDialog).toHaveCount(0)

  restored = true
  const secondDialog = await openCreate(page)
  await expect(secondDialog.locator('.el-form-item').filter({ hasText: '所属租户' })).toContainText(
    tenantName(tenantA)
  )
  await secondDialog.getByRole('button', { name: '取消' }).click()
  expect(tenantCalls).toBeGreaterThanOrEqual(2)
})

test('旧弹窗的迟到租户列表不能覆盖重开弹窗的可选目标', async ({ page }) => {
  await setup(page, [tenantA, tenantB])
  let calls = 0
  let notifyFirst: (() => void) | undefined
  let releaseFirst: (() => void) | undefined
  const firstRequested = new Promise<void>((resolve) => (notifyFirst = resolve))
  const firstReleased = new Promise<void>((resolve) => (releaseFirst = resolve))
  await page.route('**/rest/v1/sys_tenant?*', async (route) => {
    const call = ++calls
    if (call === 1) {
      notifyFirst?.()
      await firstReleased
    }
    await route.fulfill({
      json: (call === 1 ? [tenantA] : [tenantA, tenantB]).map((tenantId) => ({
        id: tenantId,
        tenant_code: suffix(tenantId),
        tenant_name: tenantName(tenantId),
        builtin_type: tenantId === tenantA ? 'platform' : 'business'
      })),
      headers: { 'content-range': call === 1 ? '0-0/1' : '0-1/2' }
    })
  })
  await page.goto(`${fixture}?scope=all&tenantOptions=fetch`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新增安全检查' }).click()
  await firstRequested
  const firstDialog = page.getByRole('dialog', { name: '新增安全检查' })
  await expect(firstDialog).toBeVisible()
  await firstDialog.getByRole('button', { name: '取消' }).click()
  await expect(firstDialog).toHaveCount(0)
  const secondDialog = await openCreate(page)
  const tenantSelect = secondDialog
    .locator('.el-form-item')
    .filter({ hasText: '所属租户' })
    .locator('.el-select')
  await tenantSelect.click()
  await expect(page.getByRole('option', { name: /租户 B/ })).toBeVisible()
  await page.keyboard.press('Escape')
  releaseFirst?.()
  await expect.poll(() => calls).toBe(2)
  await tenantSelect.click()
  await expect(page.getByRole('option', { name: /租户 B/ })).toBeVisible()
})

async function selectBothAndDelete(page: Page) {
  await expect(page.locator('.el-table__body-wrapper tr')).toHaveCount(2)
  await page.locator('.el-table__header-wrapper .el-checkbox').click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
}

test('混合租户批量删除先查引用，显示可识别记录并阻断写入', async ({ page }) => {
  await setup(page, [tenantA, tenantB], [row(tenantA), row(tenantB)])
  const checks: Record<string, unknown>[] = []
  let deletes = 0
  await page.route('**/rpc/get_record_delete_dependency_details**', (route) => {
    checks.push(body(route))
    return route.fulfill({
      json: [
        {
          resource_id: 'inspection-A',
          source_table: 'smis_position_risk_control',
          record_id: 'risk-control-1',
          target_id: 'risk-control-1',
          record_no: 'RISK-CONTROL-001',
          record_summary: '岗位风险管控关联记录',
          record_status: 'enabled',
          created_at: '2026-10-28'
        }
      ]
    })
  })
  await page.route('**/rest/v1/rpc/smis_delete_safety_inspections_secure', (route) => {
    deletes++
    return route.fulfill({ json: 2 })
  })
  await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
  await selectBothAndDelete(page)
  await expect.poll(() => checks.length).toBe(1)
  await expect(page.getByText('RISK-CONTROL-001', { exact: true })).toBeVisible()
  await expect(page.getByText('岗位风险管控', { exact: true })).toBeVisible()
  await expect(page.locator('.master-delete-guard__record').getByRole('button')).toBeVisible()
  expect(checks[0]).toMatchObject({
    p_table: 'smis_safety_inspection',
    p_ids: ['inspection-A', 'inspection-B']
  })
  expect(deletes).toBe(0)
})

for (const affected of [0, 1]) {
  test(`混合租户批量删除仅返回 ${affected} 条时复查且不提示成功`, async ({ page }) => {
    await setup(page, [tenantA, tenantB], [row(tenantA), row(tenantB)])
    let checks = 0
    let deletes = 0
    await page.route('**/rpc/get_record_delete_dependency_details**', (route) => {
      checks++
      return route.fulfill({ json: [] })
    })
    await page.route('**/rpc/smis_delete_safety_inspections_secure**', (route) => {
      deletes++
      expect(body(route).p_ids).toEqual(['inspection-A', 'inspection-B'])
      return route.fulfill({ json: affected })
    })
    await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
    await selectBothAndDelete(page)
    const confirmation = page.getByRole('dialog', { name: '删除确认' })
    await expect(confirmation).toBeVisible()
    expect(checks).toBe(1)
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    await expect.poll(() => checks).toBe(2)
    expect(deletes).toBe(1)
    await expect(page.locator('.el-message--success')).toHaveCount(0)
    await expect(page.locator('.el-message--error')).toBeVisible()
  })
}

test('删除确认期间切换租户范围会阻断后续删除请求', async ({ page }) => {
  await setup(page, [tenantA, tenantB], [row(tenantA), row(tenantB)])
  let deletes = 0
  await page.route('**/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rpc/smis_delete_safety_inspections_secure**', (route) => {
    deletes++
    return route.fulfill({ json: 2 })
  })
  await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
  await selectBothAndDelete(page)
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await page.getByTestId('change-scope-b').dispatchEvent('click')
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toContainText('租户范围已变化')
  expect(deletes).toBe(0)
})

test('删除确认期间撤销普通用户权限会阻断后续删除请求', async ({ page }) => {
  await setup(page, [tenantA], [row(tenantA)])
  let deletes = 0
  await page.route('**/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rpc/smis_delete_safety_inspections_secure**', (route) => {
    deletes++
    return route.fulfill({ json: 1 })
  })
  await page.goto(`${fixture}?role=ordinary&scope=a`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 A', { exact: true })).toBeVisible()
  await page.locator('.el-table__header-wrapper .el-checkbox').click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await page.getByTestId('revoke-delete').dispatchEvent('click')
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toContainText('删除权限已变化')
  expect(deletes).toBe(0)
})

test('删除 RPC 并发引用拒绝后重新检查并显示阻断记录', async ({ page }) => {
  await setup(page, [tenantA], [row(tenantA)])
  let checks = 0
  let deletes = 0
  await page.route('**/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    return route.fulfill({
      json:
        checks === 1
          ? []
          : [
              {
                resource_id: 'inspection-A',
                source_table: 'smis_position_risk_control',
                record_id: 'risk-control-2',
                target_id: 'risk-control-2',
                record_no: 'RISK-CONTROL-NEW',
                record_summary: '新建的岗位风险引用',
                record_status: 'enabled',
                created_at: '2026-10-28'
              }
            ]
    })
  })
  await page.route('**/rpc/smis_delete_safety_inspections_secure**', (route) => {
    deletes++
    return route.fulfill({
      status: 409,
      json: { code: '23503', message: 'foreign key reference', details: 'still referenced' }
    })
  })
  await page.goto(`${fixture}?scope=a`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 A', { exact: true })).toBeVisible()
  await page.locator('.el-table__header-wrapper .el-checkbox').click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('RISK-CONTROL-NEW', { exact: true })).toBeVisible()
  expect(checks).toBe(2)
  expect(deletes).toBe(1)
  await expect(page.locator('.el-message--success')).toHaveCount(0)
})

for (const scenario of [
  {
    name: 'light-border-1440',
    width: 1440,
    appearance: { theme: 'light' as const, boxBorderMode: true }
  },
  {
    name: 'dark-shadow-570',
    width: 570,
    appearance: { theme: 'dark' as const, boxBorderMode: false }
  }
]) {
  test(`写入租户与引用阻断外观 ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await prepareAppearance(page, scenario.appearance)
    await setup(page, [tenantA, tenantB], [row(tenantA), row(tenantB)])
    await page.route('**/rpc/get_record_delete_dependency_details**', (route) =>
      route.fulfill({
        json: [
          {
            resource_id: 'inspection-A',
            source_table: 'smis_position_risk_control',
            record_id: 'risk-control-visual',
            target_id: 'risk-control-visual',
            record_no: 'RISK-VISUAL-001',
            record_summary: '岗位风险管控关联记录',
            record_status: 'enabled',
            created_at: '2026-10-28'
          }
        ]
      })
    )
    await page.goto(`${fixture}?scope=all`, { waitUntil: 'domcontentloaded' })
    await assertAppearance(page, scenario.appearance)
    const dialog = await openCreate(page)
    await expect(dialog.locator('.el-form-item').filter({ hasText: '所属租户' })).toContainText(
      '租户 A'
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `write-dialog-${scenario.name}.png`)
    await dialog.getByRole('button', { name: '取消' }).click()
    await selectBothAndDelete(page)
    await expect(page.getByText('RISK-VISUAL-001', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `delete-blocked-${scenario.name}.png`)
  })
}
