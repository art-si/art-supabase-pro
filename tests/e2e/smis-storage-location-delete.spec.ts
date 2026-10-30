import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession as prepareSession } from './support/isolated-session'
import { installDictionaryOptions } from './support/dictionary-options'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

const fixture = '/tests/e2e/fixtures/smis-storage-location-read.html'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const firstId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1'
const secondId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2'

async function prepareIsolatedSession(page: Page) {
  await prepareSession(page)
  await installDictionaryOptions(page, {
    commonEnabledStatus: [
      { value: 'enabled', label: '启用' },
      { value: 'disabled', label: '停用' }
    ],
    commonIssuancePostingStatus: [
      { value: 'draft', label: '草稿' },
      { value: 'posted', label: '已过账' },
      { value: 'voided', label: '已作废' }
    ]
  })
}

function location(id: string, index: number, tenantId = tenantA) {
  return {
    id,
    tenant_id: tenantId,
    parent_id: null,
    organization_id: 'organization-1',
    location_code: `LOC-${index}`,
    location_name: `测试位置 ${index}`,
    location_short_name: `位置${index}`,
    status: 'enabled',
    child_count: 0,
    organization: {
      id: 'organization-1',
      organization_code: 'ORG-1',
      organization_name: '测试生产部门'
    },
    responsible: null
  }
}

const first = location(firstId, 1)
const second = location(secondId, 2)
const childId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const child = { ...location(childId, 3), parent_id: firstId, location_code: 'LOC-CHILD' }

async function mockLocationList(
  page: Page,
  tree: object[] = [first, second],
  records: object[] = [first, second]
) {
  await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', (route) =>
    route.fulfill({
      json: {
        records,
        total: records.length,
        tree,
        overview: { total: 2, enabled: 2, root_count: 2, managed_count: 0 }
      }
    })
  )
}

function dependency(sourceTable: string, recordNo: string, recordSummary: string, index: number) {
  return {
    resourceId: firstId,
    sourceTable,
    recordId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
    targetId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
    recordNo,
    recordSummary,
    recordStatus:
      sourceTable === 'smis_ppe_issuance_record' || sourceTable === 'smis_tool_issuance_record'
        ? 'posted'
        : 'enabled',
    createdAt: '2026-01-01'
  }
}

const references = [
  dependency('mdm_storage_location', 'LOC-CHILD', '测试下级位置', 1),
  dependency('mdm_equipment', 'EQ-001', '测试设备', 2),
  dependency('mdm_material', 'MAT-001', '测试物料', 3),
  dependency('smis_ppe_issuance_record', 'PPE-001', '测试劳保发放', 4),
  dependency('smis_tool_issuance_record', 'TOOL-001', '测试工器具发放', 5)
]

const rowMore = (page: Page) =>
  page.locator('.el-table__body-wrapper').getByRole('button', { name: '更多操作' }).first()
async function openRowDelete(page: Page) {
  await rowMore(page).focus()
  await rowMore(page).press('ArrowDown')
  const remove = page.getByRole('menuitem', { name: '删除', exact: true })
  await expect(remove).toBeVisible()
  await remove.click()
}
async function openFixture(page: Page, path = fixture) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(rowMore(page)).toBeVisible({ timeout: 180_000 })
}
const confirmation = (page: Page) => page.getByRole('dialog', { name: '删除确认' })
const guardDialog = (page: Page) => page.locator('.master-delete-guard').locator('..')

function params(route: Route) {
  return route.request().postDataJSON() as {
    p_table?: string
    p_ids?: string[]
    p_constraint?: string
  }
}

test('单条先查引用；检查失败可重试，五类实名引用阻断删除', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  let checks = 0
  let deletes = 0
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    expect(params(route)).toMatchObject({ p_table: 'mdm_storage_location', p_ids: [firstId] })
    if (checks === 1)
      return route.fulfill({ status: 503, json: { code: 'XX000', message: 'secret SQL error' } })
    return route.fulfill({ json: references })
  })
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes++
    return route.fulfill({ json: 1 })
  })
  let equipmentReads = 0
  await page.route('**/rest/v1/rpc/smis_get_equipment_archive_secure', (route) => {
    equipmentReads++
    expect(route.request().postDataJSON().p_equipment_id).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    )
    return route.fulfill({
      json: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        sort: 1,
        categoryId: 'category-1',
        usingOrganizationId: 'organization-1',
        managingOrganizationId: 'organization-1',
        equipmentName: '测试设备',
        equipmentCode: 'EQ-001',
        equipmentKind: 'general',
        useStatus: 'in_use',
        operationStatus: 'normal',
        assetStatus: 'active',
        importanceLevel: 'normal',
        qrToken: 'test-equipment-token',
        isMajorHazardSource: false,
        isSpecialEquipment: false,
        status: 'enabled',
        pressureGaugeIds: [],
        safetyValveIds: [],
        attachmentCount: 0,
        inspectionCount: 0,
        usingOrganization: { id: 'organization-1', organizationName: '测试生产部门' },
        managingOrganization: { id: 'organization-1', organizationName: '测试生产部门' },
        category: { id: 'category-1', categoryName: '测试设备分类', profileType: 'general' }
      }
    })
  })
  await mockLocationList(page, [{ ...first, child_count: 1 }, child, second])
  await openFixture(page)
  await openRowDelete(page)
  await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
  await expect(confirmation(page)).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('secret SQL error')
  expect(deletes).toBe(0)
  await page.getByRole('button', { name: '重新检查', exact: true }).click()
  for (const recordNo of ['LOC-CHILD', 'EQ-001', 'MAT-001', 'PPE-001', 'TOOL-001'])
    await expect(guardDialog(page).getByText(recordNo, { exact: true })).toBeVisible()
  await expect(guardDialog(page).getByText('测试设备 · 启用', { exact: true })).toBeVisible()
  await expect(guardDialog(page).getByText('测试下级位置 · 启用', { exact: true })).toBeVisible()
  await expect(guardDialog(page).getByText('测试劳保发放 · 已过账', { exact: true })).toBeVisible()
  await expect(
    guardDialog(page).getByText('测试工器具发放 · 已过账', { exact: true })
  ).toBeVisible()
  await expect(confirmation(page)).toHaveCount(0)
  expect(checks).toBe(2)
  expect(deletes).toBe(0)
  expect(pageErrors).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('five-references.png'),
    animations: 'disabled'
  })
  await guardDialog(page).getByText('TOOL-001', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('five-references-lower.png'),
    animations: 'disabled'
  })
  await guardDialog(page)
    .locator('.master-delete-guard__group')
    .filter({ hasText: '下级存放位置' })
    .getByRole('button', { name: '查看关联', exact: true })
    .click()
  await expect(page.locator('.storage-location-navigator .is-current')).toContainText('测试位置 3')
  await openRowDelete(page)
  await guardDialog(page)
    .locator('.master-delete-guard__group')
    .filter({ hasText: '设备档案' })
    .getByRole('button', { name: '查看关联', exact: true })
    .click()
  await expect(page.locator('.equipment-archive-detail__identity')).toContainText('测试设备', {
    timeout: 120_000
  })
  expect(equipmentReads).toBe(1)
})

for (const target of [
  { kind: 'material', label: '物料编码', reference: references[2] },
  { kind: 'ppe', label: '劳保用品发放记录', reference: references[3] },
  { kind: 'tool', label: '工器具发放记录', reference: references[4] }
] as const) {
  test(`${target.label}引用导航精确定位目标记录`, async ({ page }, testInfo) => {
    const targetId = target.reference.targetId
    let targetReads = 0
    let clearingLocation = false
    await prepareIsolatedSession(page)
    await mockLocationList(page)
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
      route.fulfill({ json: [target.reference] })
    )
    if (target.kind === 'material') {
      await page.route('**/rest/v1/mdm_material?**', (route) => {
        const idFilter = new URL(route.request().url()).searchParams.get('id')
        if (!idFilter) return route.fulfill({ json: [] })
        targetReads++
        expect(idFilter).toBe(`in.(${targetId})`)
        return route.fulfill({
          headers: { 'content-range': '0-0/1' },
          json: [
            {
              id: targetId,
              tenant_id: tenantA,
              category_id: 'category-1',
              material_code: 'MAT-001',
              material_name: '测试物料',
              basic_unit: '件',
              material_type: 'standard',
              material_source: 'purchase',
              attribute_values: {},
              image_urls: [],
              allow_negative_inventory: false,
              min_stock_alert_enabled: false,
              safety_stock_alert_enabled: false,
              status: 'enabled',
              sort: 1
            }
          ]
        })
      })
    } else {
      const rpc =
        target.kind === 'ppe'
          ? 'smis_list_ppe_issuance_records_secure'
          : 'smis_list_tool_issuance_records_secure'
      await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
        targetReads++
        expect(route.request().postDataJSON().p_keyword).toBe(
          clearingLocation ? null : target.reference.recordNo
        )
        const record = {
          id: targetId,
          tenantId: tenantA,
          issuanceNo: target.reference.recordNo,
          employeeId: 'employee-target',
          employeeNo: 'EMP-001',
          employeeName: '目标领用人',
          warehouseId: firstId,
          warehouseName: '测试位置 1',
          issuerEmployeeId: 'employee-issuer',
          issuerName: '测试发放人',
          issueDate: '2026-10-01',
          status: 'draft',
          items: []
        }
        return route.fulfill({
          json: {
            records: [record, { ...record, id: 'other-record', employeeName: '同号其他记录' }],
            total: 2,
            overview: { total: 2, draft: 2, posted: 0, today: 0, quantity: 0 }
          }
        })
      })
    }
    await openFixture(page)
    await openRowDelete(page)
    const group = guardDialog(page)
      .locator('.master-delete-guard__group')
      .filter({ hasText: target.label })
    await expect(group.getByText(target.reference.recordNo, { exact: true })).toBeVisible()
    await group.getByRole('button', { name: '查看关联', exact: true }).click()
    await expect.poll(() => targetReads, { timeout: 120_000 }).toBeGreaterThan(0)
    if (target.kind === 'material') {
      await expect(page.locator('.el-table__body-wrapper')).toContainText('MAT-001')
      await expect(page.locator('.el-table__body-wrapper')).toContainText('测试物料')
    } else {
      await expect(page.locator('.el-table__body-wrapper')).toContainText('目标领用人')
      await expect(page.locator('.el-table__body-wrapper')).not.toContainText('同号其他记录')
      await expect(page.locator('.master-delete-notice')).toContainText('已找到关联记录')
      await expect(
        page.locator('.master-delete-notice').getByRole('button', { name: '返回存放位置管理' })
      ).toBeVisible()
    }
    await page.screenshot({
      path: testInfo.outputPath(`${target.kind}-reference-target.png`),
      animations: 'disabled'
    })
    if (target.kind !== 'material') {
      clearingLocation = true
      await page
        .locator('.master-delete-notice')
        .getByRole('button', { name: '清除定位', exact: true })
        .click()
      await expect(page.locator('.master-delete-notice')).toHaveCount(0)
      await expect(page.locator('.el-table__body-wrapper')).toContainText('同号其他记录')
    }
  })
}

for (const target of [
  {
    kind: 'ppe',
    label: '劳保用品发放记录',
    reference: references[3],
    rpc: 'smis_list_ppe_issuance_records_secure',
    error: '关联劳保用品发放记录定位失败，请返回存放位置重新检查引用。'
  },
  {
    kind: 'tool',
    label: '工器具发放记录',
    reference: references[4],
    rpc: 'smis_list_tool_issuance_records_secure',
    error: '关联工器具发放记录定位失败，请返回存放位置重新检查引用。'
  }
] as const) {
  test(`${target.label}同号但 ID 不符时停止定位并提示重检`, async ({ page }) => {
    let targetReads = 0
    await prepareIsolatedSession(page)
    await mockLocationList(page)
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
      route.fulfill({ json: [target.reference] })
    )
    await page.route(`**/rest/v1/rpc/${target.rpc}`, (route) => {
      targetReads++
      expect(route.request().postDataJSON().p_keyword).toBe(target.reference.recordNo)
      return route.fulfill({
        json: {
          records: [
            {
              id: 'different-record-id',
              tenantId: tenantA,
              issuanceNo: target.reference.recordNo,
              employeeId: 'employee-other',
              employeeNo: 'EMP-OTHER',
              employeeName: '同号其他记录',
              warehouseId: firstId,
              warehouseName: '测试位置 1',
              issuerEmployeeId: 'employee-issuer',
              issuerName: '测试发放人',
              issueDate: '2026-10-01',
              status: 'draft',
              items: []
            }
          ],
          total: 1,
          overview: { total: 1, draft: 1, posted: 0, today: 0, quantity: 0 }
        }
      })
    })
    await openFixture(page)
    await openRowDelete(page)
    await guardDialog(page)
      .locator('.master-delete-guard__group')
      .filter({ hasText: target.label })
      .getByRole('button', { name: '查看关联', exact: true })
      .click()
    await expect.poll(() => targetReads, { timeout: 120_000 }).toBeGreaterThan(0)
    await expect(page.getByText(target.error, { exact: true })).toBeVisible()
    await expect(page.getByText('同号其他记录', { exact: true })).toHaveCount(0)
  })
}

test('批量引用检查早于确认；并发拒绝后按同一批 ID 重新检查且保留选择', async ({
  page
}, testInfo) => {
  let checks = 0
  let deletes = 0
  let blocked = false
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    expect(params(route)).toMatchObject({
      p_table: 'mdm_storage_location',
      p_ids: [firstId, secondId]
    })
    expect(params(route).p_constraint).toBe(checks === 1 ? null : 'smis_equipment_location_fkey')
    return route.fulfill({
      json: blocked ? [dependency('mdm_equipment', 'EQ-NEW', '并发新增设备', 6)] : []
    })
  })
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes++
    expect(params(route).p_ids).toEqual([firstId, secondId])
    blocked = true
    return route.fulfill({
      status: 409,
      json: {
        code: '23503',
        message:
          'update or delete on table "mdm_storage_location" violates foreign key constraint "smis_equipment_location_fkey"',
        details: `Key (id)=(${firstId}) is still referenced from table "mdm_equipment".`
      }
    })
  })
  await mockLocationList(page)
  await openFixture(page)
  await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await page.locator('.el-table__body-wrapper .el-checkbox').nth(1).click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  expect(checks).toBe(1)
  expect(deletes).toBe(0)
  await confirmation(page).getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('EQ-NEW', { exact: true })).toBeVisible()
  expect(checks).toBe(2)
  expect(deletes).toBe(1)
  await expect(page.locator('.el-table__body-wrapper .el-checkbox input:checked')).toHaveCount(2)
  await page.screenshot({
    path: testInfo.outputPath('concurrent-reference.png'),
    animations: 'disabled'
  })
})

test('未选下级阻断；父子同时选中可进入一次确认', async ({ page }) => {
  let checks = 0
  let deletes = 0
  const parent = { ...first, child_count: 1 }
  await prepareIsolatedSession(page)
  await mockLocationList(page, [parent, child], [parent, child])
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    expect(params(route).p_ids).toEqual(checks === 1 ? [firstId] : [firstId, childId])
    return route.fulfill({ json: [references[0]] })
  })
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes++
    expect(params(route).p_ids).toEqual([firstId, childId])
    return route.fulfill({ json: 2 })
  })
  await openFixture(page)
  await openRowDelete(page)
  await expect(guardDialog(page).getByText('LOC-CHILD', { exact: true })).toBeVisible()
  await expect(confirmation(page)).toHaveCount(0)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await page.locator('.el-table__body-wrapper .el-checkbox').nth(1).click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  expect(checks).toBe(2)
  expect(deletes).toBe(0)
  await confirmation(page).getByRole('button', { name: '删除', exact: true }).click()
  await expect.poll(() => deletes).toBe(1)
})

test('零受影响不报成功，失败后保留树选择', async ({ page }) => {
  let deletes = 0
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes++
    return route.fulfill({ json: 0 })
  })
  await mockLocationList(page)
  await openFixture(page)
  await page.locator('.storage-location-navigator').getByText('测试位置 1', { exact: true }).click()
  await expect(page.locator('.storage-location-navigator .is-current')).toContainText('测试位置 1')
  await openRowDelete(page)
  await expect(confirmation(page)).toBeVisible()
  await confirmation(page).getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toBeVisible()
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  await expect(page.locator('.storage-location-navigator .is-current')).toContainText('测试位置 1')
  expect(deletes).toBe(1)
})

test('批量删除只影响部分行时不报成功并保留位置和勾选', async ({ page }) => {
  let deletes = 0
  await prepareIsolatedSession(page)
  await mockLocationList(page)
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes++
    expect(params(route).p_ids).toEqual([firstId, secondId])
    return route.fulfill({ json: 1 })
  })
  await openFixture(page)
  await page.locator('.storage-location-navigator').getByText('测试位置 1', { exact: true }).click()
  await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await page.locator('.el-table__body-wrapper .el-checkbox').nth(1).click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  await confirmation(page).getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toBeVisible()
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  await expect(page.locator('.storage-location-navigator .is-current')).toContainText('测试位置 1')
  await expect(page.locator('.el-table__body-wrapper .el-checkbox input:checked')).toHaveCount(2)
  expect(deletes).toBe(1)
})

for (const change of ['tenant', 'permission'] as const) {
  test(`确认期间${change === 'tenant' ? '切换租户' : '撤销权限'}阻止删除`, async ({ page }) => {
    let checks = 0
    let deletes = 0
    await prepareIsolatedSession(page)
    await mockLocationList(page)
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      checks++
      return route.fulfill({ json: [] })
    })
    await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
      deletes++
      return route.fulfill({ json: 1 })
    })
    await openFixture(page, change === 'permission' ? `${fixture}?ordinary` : fixture)
    await openRowDelete(page)
    await expect(confirmation(page)).toBeVisible()
    const control = page.getByRole('button', {
      name: change === 'tenant' ? '切换租户 B' : '撤销删除权限'
    })
    await control.evaluate((button: HTMLButtonElement) => button.click())
    await confirmation(page).getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('.el-message--error')).toBeVisible()
    expect(checks).toBe(1)
    expect(deletes).toBe(0)
  })
}

test('无关联查看权限时保留实名阻断信息且不提供跳转', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockLocationList(page)
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [references[1]] })
  )
  await openFixture(page, `${fixture}?ordinary`)
  await openRowDelete(page)
  await expect(guardDialog(page).getByText('EQ-001', { exact: true })).toBeVisible()
  await expect(guardDialog(page).getByText('测试设备 · 启用', { exact: true })).toBeVisible()
  await expect(guardDialog(page).getByRole('button', { name: '查看关联' })).toHaveCount(0)
})

test('普通用户无法通过夹具的租户切换控件跨租户读取和删除', async ({ page }) => {
  const scopes: string[] = []
  const deletes: string[][] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', (route) => {
    scopes.push(route.request().headers()['x-art-tenant-scope'] ?? '')
    return route.fulfill({
      json: {
        records: [first],
        total: 1,
        tree: [first],
        overview: { total: 1, enabled: 1, root_count: 1, managed_count: 0 }
      }
    })
  })
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes.push(params(route).p_ids ?? [])
    return route.fulfill({ json: 1 })
  })
  await openFixture(page, `${fixture}?ordinary`)
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await openRowDelete(page)
  await expect(confirmation(page)).toBeVisible()
  await confirmation(page).getByRole('button', { name: '删除', exact: true }).click()
  await expect.poll(() => deletes.length).toBe(1)
  expect(deletes).toEqual([[firstId]])
  expect(scopes.every((scope) => scope === tenantA || scope === '')).toBe(true)
  expect(scopes).not.toContain(tenantB)
})

test('引用阻断弹窗在深色窄屏可滚动并保留完整操作', async ({ page }, testInfo) => {
  const errors: string[] = []
  let deletes = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
  await page.setViewportSize({ width: 570, height: 900 })
  await mockLocationList(page, [{ ...first, child_count: 1 }, child, second])
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: references })
  )
  await page.route('**/rest/v1/rpc/smis_delete_storage_locations_secure', (route) => {
    deletes++
    return route.fulfill({ json: 1 })
  })
  await openFixture(page)
  await assertAppearance(page, { theme: 'dark', boxBorderMode: false })
  await openRowDelete(page)
  const dialog = page.getByRole('dialog', { name: '暂时无法删除存放位置', exact: true })
  await expect(dialog.getByText('LOC-CHILD', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '重新检查', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath('blocked-dark-narrow.png'),
    animations: 'disabled'
  })
  await dialog.getByText('TOOL-001', { exact: true }).scrollIntoViewIfNeeded()
  await expect(dialog.getByText('测试工器具发放 · 已过账', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('blocked-dark-narrow-lower.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(deletes).toBe(0)
  expect(errors).toEqual([])
})
