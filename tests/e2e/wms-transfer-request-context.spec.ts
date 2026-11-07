import { expect, test, type Page, type Route } from '@playwright/test'
import { keysToSnakeDeep } from '../../src/utils/supabase/key-transform'
import { isPlainObjectRecord } from '../../src/utils/type-guards'
import {
  transferContextIds as ids,
  transferContextRow
} from './fixtures/wms-transfer-request-context-data'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const fixture = '/tests/e2e/fixtures/wms-transfer-request-context.html'
const diagnostics = new WeakMap<Page, () => string>()
test.afterEach(async ({ page }, info) => {
  const capture = diagnostics.get(page)
  if (info.status !== info.expectedStatus && capture) {
    await info.attach('transfer-diagnostics', { body: capture(), contentType: 'application/json' })
  }
})

async function mockTransfer(page: Page) {
  const state = {
    writes: [] as Array<Record<string, unknown>>,
    writeReleases: [] as Array<() => void>,
    holdSave: false,
    holdMaterial: false,
    materialRelease: undefined as (() => void) | undefined,
    materialReads: 0,
    documentReads: 0,
    failDocument: false,
    unexpected: [] as string[],
    pageErrors: [] as string[]
  }
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  diagnostics.set(page, () => JSON.stringify(state, null, 2))
  await page.route('**/*', (route) => {
    if (route.request().method() === 'GET') return route.continue()
    state.unexpected.push(route.request().method() + ' ' + route.request().url())
    return route.fulfill({ status: 400, json: { message: 'unexpected isolated mutation' } })
  })
  await prepareIsolatedSession(page)
  const handle = async (route: Route) => {
    const url = new URL(route.request().url())
    const resource = url.pathname.split('/').at(-1)
    const rows = (data: unknown[]) =>
      route.fulfill({
        json: keysToSnakeDeep(data),
        headers: {
          'content-range': data.length ? `0-${data.length - 1}/${data.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    if (resource === 'wms_save_transfer_request_secure') {
      const body: unknown = route.request().postDataJSON()
      if (!isPlainObjectRecord(body) || !isPlainObjectRecord(body.p_payload))
        throw new Error('调拨夹具写请求结构错误')
      state.writes.push(body.p_payload)
      if (state.holdSave) await new Promise<void>((resolve) => state.writeReleases.push(resolve))
      return route.fulfill({ json: '77777777-7777-4777-8777-777777777777' })
    }
    if (resource === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (route.request().method() !== 'GET') {
      state.unexpected.push(resource || url.pathname)
      return route.fulfill({ status: 400, json: { message: 'unexpected isolated RPC' } })
    }
    if (resource === 'sys_menu') return route.fulfill({ json: { id: ids.menu } })
    if (resource === 'mdm_document_type')
      return rows([
        {
          id: ids.documentType,
          tenantId: ids.tenant,
          documentTypeCode: 'SYN-TR',
          documentTypeName: '合成调拨申请',
          menuIds: [ids.menu],
          enabled: true,
          isDefault: true
        }
      ])
    if (resource === 'mdm_business_type')
      return rows([
        {
          id: ids.businessType,
          tenantId: ids.tenant,
          businessTypeCode: 'SYN-BIZ',
          businessTypeName: '合成调拨业务',
          documentTypeIds: [ids.documentType],
          menuIds: [ids.menu],
          enabled: true,
          isDefault: true
        }
      ])
    if (resource === 'mdm_organization')
      return rows([
        {
          id: ids.organization,
          tenantId: ids.tenant,
          parentId: null,
          organizationCode: 'SYN-ORG',
          organizationName: '合成库存组织',
          organizationType: 'company',
          status: '1',
          sort: 1,
          initialization: { enabledOn: '2026-01-01', isDefault: true, initializationClosedAt: null }
        }
      ])
    if (resource === 'sys_user')
      return rows([
        {
          id: ids.user,
          tenantId: ids.tenant,
          userName: 'synthetic-applicant',
          nickName: '合成申请人',
          status: '1',
          organization: { id: ids.organization, organizationName: '合成库存组织' }
        }
      ])
    if (resource === 'mdm_unit_of_measure')
      return rows([{ id: ids.unit, tenantId: ids.tenant, unitCode: 'PC', unitName: '件' }])
    if (resource === 'mdm_warehouse')
      return rows([
        {
          id: ids.sourceWarehouse,
          tenantId: ids.tenant,
          organizationId: ids.organization,
          warehouseCode: 'SYN-S',
          warehouseName: '合成调出仓库',
          status: 'enabled',
          enableLocations: false
        },
        {
          id: ids.targetWarehouse,
          tenantId: ids.tenant,
          organizationId: ids.organization,
          warehouseCode: 'SYN-T',
          warehouseName: '合成调入仓库',
          status: 'enabled',
          enableLocations: false
        }
      ])
    if (resource === 'wms_transfer_request_list') {
      state.documentReads++
      if (state.failDocument)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'controlled detail failure' }
        })
      const documentId = url.searchParams.get('document_id')?.replace(/^eq\./, '') || ids.documentA
      return rows([transferContextRow(documentId)])
    }
    if (resource === 'mdm_material') {
      state.materialReads++
      if (state.holdMaterial)
        await new Promise<void>((resolve) => {
          state.materialRelease = resolve
        })
      return rows([
        {
          id: ids.material,
          tenantId: ids.tenant,
          materialCode: 'SYN-M001',
          materialName: '合成调拨物料',
          description: '合成调拨物料',
          specificationModel: '合成规格',
          status: 'enabled',
          inventoryUnitId: ids.unit,
          baseUnitId: ids.unit,
          unitConversions: [],
          serialManagementEnabled: false
        }
      ])
    }
    if (
      [
        'mdm_project',
        'mdm_supplier',
        'mdm_customer',
        'mdm_warehouse_bin',
        'mdm_warehouse_zone',
        'mdm_material_category'
      ].includes(resource || '')
    )
      return rows([])
    state.unexpected.push(resource || url.pathname)
    return route.fulfill({ status: 400, json: { message: 'unexpected isolated read' } })
  }
  await page.route('**/rest/v1/**', handle)
  await page.route('**/v1/rdb/rest/**', handle)
  return state
}

async function openTransfer(page: Page, query = '', title = '编辑调拨申请单') {
  await page.goto(`${fixture}${query ? '?' + query : ''}`)
  await page.getByTestId('transfer-open-a').click()
  const drawer = page.getByRole('dialog', { name: title, exact: true })
  await expect(drawer.getByRole('button', { name: /^保存(?:副本)?$/, exact: true })).toBeEnabled()
  return drawer
}
async function controller(page: Page, id: string) {
  // Exercise the existing public controller while the modal owns pointer focus.
  await page.getByTestId('transfer-' + id).evaluate((button: HTMLButtonElement) => button.click())
}
async function releaseValidation(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('transfer-validation-result'))
  })
  await expect(page.locator('html')).toHaveAttribute('data-transfer-validation', 'resolved')
  await page.waitForLoadState('networkidle')
}

test('普通用户编辑保存使用当前单据并锁定写入中的字段和操作', async ({ page }, info) => {
  const state = await mockTransfer(page)
  state.holdSave = true
  const drawer = await openTransfer(page)
  await expect(drawer.getByRole('textbox', { name: /单据编号/ })).toHaveValue('SYN-TR-001')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  await expect(drawer.getByRole('spinbutton').first()).toBeDisabled()
  for (const input of await drawer.locator('.transfer-line-table input:visible').all()) {
    await expect(input).toBeDisabled()
  }
  await expect(drawer.getByRole('button', { name: '添加物料', exact: true })).toBeDisabled()
  await expect(drawer.getByRole('button', { name: '移除', exact: true })).toBeDisabled()
  await drawer.screenshot({ path: info.outputPath('transfer-writing.png'), animations: 'disabled' })
  expect(state.writes[0]).toMatchObject({
    id: ids.documentA,
    tenant_id: ids.tenant,
    lines: [{ quantity: 1 }]
  })
  state.writeReleases[0]()
  await expect(page.getByTestId('transfer-successes')).toHaveText('1')
  await expect(drawer).toHaveCount(0)
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('真实表单校验等待时重新打开B不会由A提交B', async ({ page }, info) => {
  const state = await mockTransfer(page)
  const drawer = await openTransfer(page, 'deferHeader')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-transfer-validation', 'pending')
  await controller(page, 'open-b')
  await expect(drawer.getByRole('textbox', { name: /单据编号/ })).toHaveValue('SYN-TR-002')
  await releaseValidation(page)
  await expect(drawer).toBeVisible()
  expect(state.writes).toEqual([])
  await drawer.screenshot({
    path: info.outputPath('transfer-reopened-b.png'),
    animations: 'disabled'
  })
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('真实明细校验等待时修改数量必须重新确认', async ({ page }) => {
  const state = await mockTransfer(page)
  const drawer = await openTransfer(page, 'deferTable')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-transfer-validation', 'pending')
  await drawer.getByRole('spinbutton').first().fill('2')
  await drawer.getByRole('spinbutton').first().blur()
  await releaseValidation(page)
  await expect(
    page.getByText('调拨申请内容已变化，请重新确认后保存', { exact: true })
  ).toBeVisible()
  expect(state.writes).toEqual([])
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})

for (const change of ['revoke', 'scope', 'actor', 'demote'] as const) {
  test(`真实校验等待期间 ${change} 变化会阻止旧提交`, async ({ page }, info) => {
    const state = await mockTransfer(page)
    const query = `deferTable${change !== 'revoke' ? '&platform' : ''}${change === 'demote' ? '&selectedScope' : ''}`
    const drawer = await openTransfer(page, query)
    const effectiveBefore = await page.getByTestId('transfer-effective-scope').textContent()
    const revisionBefore = await page.getByTestId('transfer-scope-revision').textContent()
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-transfer-validation', 'pending')
    await controller(page, change)
    await expect(
      drawer.getByText('操作权限或租户范围已变化，请关闭后重新打开调拨申请单', { exact: true })
    ).toBeVisible()
    await expect(drawer.getByRole('button', { name: '添加物料', exact: true })).toBeDisabled()
    if (change === 'actor' || change === 'demote') {
      await expect(page.getByTestId('transfer-effective-scope')).toHaveText(effectiveBefore || '')
      await expect(page.getByTestId('transfer-scope-revision')).toHaveText(revisionBefore || '')
    }
    if (change === 'actor')
      await drawer.screenshot({
        path: info.outputPath('transfer-stale.png'),
        animations: 'disabled'
      })
    await releaseValidation(page)
    expect(state.writes).toEqual([])
    expect(state.unexpected).toEqual([])
    expect(state.pageErrors).toEqual([])
  })
}

test('关闭真实校验中的抽屉后旧操作不提交', async ({ page }) => {
  const state = await mockTransfer(page)
  const drawer = await openTransfer(page, 'deferHeader')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-transfer-validation', 'pending')
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await releaseValidation(page)
  expect(state.writes).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('旧A写入完成不解锁或关闭正在写入的B', async ({ page }) => {
  const state = await mockTransfer(page)
  state.holdSave = true
  const drawer = await openTransfer(page)
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  await controller(page, 'open-b')
  await expect(drawer.getByRole('textbox', { name: /单据编号/ })).toHaveValue('SYN-TR-002')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(2)
  state.writeReleases[0]()
  await expect(page.getByTestId('transfer-successes')).toHaveText('1')
  await expect(drawer.getByRole('spinbutton').first()).toBeDisabled()
  await expect(drawer).toBeVisible()
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  state.writeReleases[1]()
  await expect(page.getByTestId('transfer-successes')).toHaveText('2')
  await expect(drawer).toHaveCount(0)
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('控件加载完成前禁止保存且仅复制权限保留保存副本能力', async ({ page }) => {
  const state = await mockTransfer(page)
  let registryEntered = false
  let releaseRegistry: (() => void) | undefined
  await page.route('**/src/components/core/forms/art-form/components.ts*', async (route) => {
    registryEntered = true
    await new Promise<void>((resolve) => {
      releaseRegistry = resolve
    })
    await route.continue()
  })
  await page.goto(fixture + '?entry=copy&permissions=View,Copy', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('transfer-open-a').click()
  const drawer = page.getByRole('dialog', { name: '复制调拨申请单', exact: true })
  await expect.poll(() => registryEntered).toBe(true)
  await expect.poll(() => state.documentReads).toBe(1)
  await expect(drawer.locator('.art-drawer__viewport')).toHaveAttribute('aria-busy', 'false')
  await expect(drawer.getByRole('button', { name: '保存副本', exact: true })).toBeDisabled()
  releaseRegistry?.()
  await expect(drawer.getByRole('button', { name: '保存副本', exact: true })).toBeEnabled()
  await drawer.getByRole('button', { name: '保存副本', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).not.toHaveProperty('id')
  expect(state.writes[0]).toMatchObject({ tenant_id: ids.tenant, lines: [{ quantity: 1 }] })
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('仅导入权限打开并导入时保存保持忙碌直到真实引用加载结束', async ({ page }) => {
  const state = await mockTransfer(page)
  state.holdMaterial = true
  const drawer = await openTransfer(
    page,
    'entry=create&importIntent&permissions=View,Import',
    '新增调拨申请单'
  )
  await drawer.getByRole('tab', { name: '物料明细', exact: true }).click()
  await drawer.locator('input[type="file"]').setInputFiles({
    name: '合成调拨.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('物料编码,数量\nSYN-M001,2\n')
  })
  await expect.poll(() => state.materialReads).toBe(1)
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  state.materialRelease?.()
  await expect(drawer.getByText('合成调拨物料', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  expect(state.writes).toEqual([])
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('仅查看权限不能通过编辑公开入口打开', async ({ page }) => {
  const state = await mockTransfer(page)
  await page.goto(`${fixture}?permissions=View`)
  await page.getByTestId('transfer-open-a').click()
  await expect(
    page.getByText('当前账号没有该调拨申请操作权限，请联系管理员', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.documentReads).toBe(0)
  expect(state.writes).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('深色资料失败可见且可以原上下文重试', async ({ page }, info) => {
  const state = await mockTransfer(page)
  state.failDocument = true
  await page.goto(fixture + '?theme=dark')
  await page.getByTestId('transfer-open-a').click()
  const drawer = page.getByRole('dialog', { name: '编辑调拨申请单', exact: true })
  await expect(drawer.getByText('单据资料加载失败', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await drawer.screenshot({ path: info.outputPath('transfer-error.png'), animations: 'disabled' })
  const readsBeforeManualRetry = state.documentReads
  state.failDocument = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByRole('textbox', { name: /单据编号/ })).toHaveValue('SYN-TR-001')
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  expect(state.documentReads - readsBeforeManualRetry).toBe(1)
  expect(state.unexpected).toEqual([])
  expect(state.pageErrors).toEqual([])
})
