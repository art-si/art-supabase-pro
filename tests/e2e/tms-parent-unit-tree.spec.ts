import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const selectedTenantId = '22222222-2222-4222-8222-222222222222'
type ParentScope = 'ordinary' | 'all' | 'selected'

const carrierRows = [
  {
    id: 'root',
    parent_unit_id: null,
    carrier_code: 'ROOT',
    company_name: '集团单位',
    enabled: true
  },
  {
    id: 'child',
    parent_unit_id: 'root',
    carrier_code: 'CHILD',
    company_name: '可选单位',
    enabled: true
  },
  {
    id: 'carrier-1',
    parent_unit_id: 'root',
    carrier_code: 'SELF',
    company_name: '当前单位',
    enabled: true
  },
  {
    id: 'descendant',
    parent_unit_id: 'carrier-1',
    carrier_code: 'DESCENDANT',
    company_name: '当前单位下级',
    enabled: true
  }
]
const selectedCarrierRows = [
  {
    id: 'root-b',
    parent_unit_id: null,
    carrier_code: 'ROOT-B',
    company_name: '其他租户根单位',
    enabled: true
  },
  {
    id: 'carrier-b',
    parent_unit_id: 'root-b',
    carrier_code: 'SELF-B',
    company_name: '其他租户承运商',
    enabled: true
  }
]

async function mockParents(
  page: Page,
  kind: 'customer' | 'carrier',
  options: { scope?: ParentScope; large?: boolean } = {}
) {
  const observed = {
    writes: [] as Record<string, unknown>[],
    parentRequests: [] as Record<string, unknown>[],
    blockedTableReads: 0
  }
  const scope = options.scope ?? 'ordinary'
  const ownRows = options.large
    ? [
        ...carrierRows,
        ...Array.from({ length: 495 }, (_, index) => ({
          id: `zz-${String(index).padStart(3, '0')}`,
          parent_unit_id: 'root',
          carrier_code: `EXTRA-${index}`,
          company_name: `补充单位 ${index}`,
          enabled: true
        })),
        {
          id: 'zz-495',
          parent_unit_id: null,
          carrier_code: 'DISABLED',
          company_name: '停用祖先',
          enabled: false
        },
        {
          id: 'zz-496',
          parent_unit_id: 'zz-495',
          carrier_code: 'LATE-CHILD',
          company_name: '跨页子单位',
          enabled: true
        }
      ]
    : carrierRows
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === `tms_update_${kind}${kind === 'carrier' ? '_multi' : ''}_secure`) {
      observed.writes.push(route.request().postDataJSON().p_payload)
      return route.fulfill({ json: {} })
    }
    if (name === 'mdm_carrier') {
      observed.blockedTableReads += 1
      return route.fulfill({
        status: 403,
        json: { code: '42501', message: 'permission denied for table mdm_carrier' }
      })
    }
    if (name === 'tms_list_carrier_parent_options_secure') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      observed.parentRequests.push({ ...body })
      const recordId = typeof body.p_record_id === 'string' ? body.p_record_id : null
      const requestedTenant =
        typeof body.p_target_tenant_id === 'string' ? body.p_target_tenant_id : null
      const recordTenant = recordId === 'carrier-b' ? selectedTenantId : tenantId
      const scopedTenant = scope === 'selected' ? selectedTenantId : tenantId
      const targetTenant = recordId
        ? recordTenant
        : scope === 'all'
          ? requestedTenant || tenantId
          : scopedTenant
      if (
        (recordId && requestedTenant && requestedTenant !== recordTenant) ||
        (scope !== 'all' && targetTenant !== scopedTenant) ||
        (scope !== 'all' && requestedTenant && requestedTenant !== scopedTenant)
      )
        return route.fulfill({
          status: 403,
          json: { code: '42501', message: '无法读取承运商上级单位，请刷新后重试' }
        })
      // Fixtures are constructed in the existing create_time DESC, id order.
      const rows = targetTenant === selectedTenantId ? selectedCarrierRows : ownRows
      const from = Number(body.p_from ?? 0)
      const to = Number(body.p_to ?? 499)
      return route.fulfill({
        json: { records: rows.slice(from, Math.min(to + 1, from + 500)), total: rows.length }
      })
    }
    if (name === `tms_list_${kind === 'customer' ? 'customers' : 'carriers'}_secure`) {
      const makeRow = (id: string, parentId: string | null, title: string, code: string) => ({
        id,
        parent_unit_id: parentId,
        ...(kind === 'customer' ? { tenant_id: tenantId } : {}),
        [kind === 'customer' ? 'customer_name' : 'company_name']: title,
        [kind === 'customer' ? 'customer_code' : 'carrier_code']: code,
        enabled: true
      })
      const records = [
        makeRow('root', null, '集团单位', 'ROOT'),
        makeRow('child', 'root', '可选单位', 'CHILD'),
        makeRow(`${kind}-1`, 'root', '当前单位', 'SELF'),
        makeRow('descendant', `${kind}-1`, '当前单位下级', 'DESCENDANT'),
        {
          ...makeRow('foreign', null, '其他租户单位', 'FOREIGN'),
          ...(kind === 'customer' ? { tenant_id: 'foreign-tenant' } : {})
        }
      ]
      return route.fulfill({ json: { records, total: records.length } })
    }
    return route.fulfill({ json: [] })
  })
  return observed
}

for (const kind of ['customer', 'carrier'] as const) {
  test(`${kind}上级单位保留层级并排除自身、后代及其他租户`, async ({ page }, info) => {
    const observed = await mockParents(page, kind)
    await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?parentTree', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.locator('#app > main.art-page-view')).toBeVisible()
    await page
      .getByRole('button', {
        name: kind === 'customer' ? '打开客户 negative' : '打开承运商',
        exact: true
      })
      .click()
    const dialog = page.getByRole('dialog', {
      name: kind === 'customer' ? '编辑客户' : '编辑承运商'
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
      timeout: 120_000
    })
    const parent = dialog
      .locator('.el-form-item')
      .filter({ hasText: '上级单位' })
      .locator('.el-select')
    await parent.click()
    const tree = page.locator('.el-select__popper:visible .el-tree')
    await expect(tree.getByText('集团单位（ROOT）', { exact: true })).toBeVisible()
    await expect(tree.getByText('可选单位（CHILD）', { exact: true })).toBeHidden()
    await tree
      .locator('.el-tree-node[data-key="root"] > .el-tree-node__content .el-tree-node__expand-icon')
      .click()
    await expect(tree.getByText('可选单位（CHILD）', { exact: true })).toBeVisible()
    await expect(tree.getByText('当前单位（SELF）', { exact: true })).toHaveCount(0)
    await expect(tree.getByText('当前单位下级（DESCENDANT）', { exact: true })).toHaveCount(0)
    await expect(tree.getByText('其他租户单位（FOREIGN）', { exact: true })).toHaveCount(0)
    await dialog.screenshot({ path: info.outputPath(`${kind}-parent-unit-tree.png`) })
    await tree.getByText('可选单位（CHILD）', { exact: true }).click()
    await expect(parent).toContainText('可选单位（CHILD）')
    const saveButton = dialog.getByRole('button', {
      name: kind === 'customer' ? '保存客户' : '确定',
      exact: true
    })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()
    await expect.poll(() => observed.writes.length).toBe(1)
    expect(observed.writes[0].parent_unit_id).toBe('child')
    await expect(dialog).toBeHidden()
    if (kind === 'carrier') {
      expect(observed.blockedTableReads).toBe(0)
      expect(observed.parentRequests).toHaveLength(1)
      expect(observed.parentRequests[0].p_record_id).toBe('carrier-1')
      expect(observed.parentRequests[0].p_target_tenant_id).toBeNull()
    }
  })
}

test('全部租户中新建承运商的上级选项跟随默认写入租户', async ({ page }) => {
  const observed = await mockParents(page, 'carrier', { scope: 'all' })
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?scope=all&parentTree', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '新增承运商', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增承运商' })
  await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
    timeout: 120_000
  })
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '上级单位' })
    .locator('.el-select')
    .click()
  const tree = page.locator('.el-select__popper:visible .el-tree')
  await expect(tree.getByText('集团单位（ROOT）', { exact: true })).toBeVisible()
  await expect(tree.getByText('其他租户单位（FOREIGN）', { exact: true })).toHaveCount(0)
  expect(observed.blockedTableReads).toBe(0)
  expect(observed.parentRequests).toHaveLength(1)
  expect(observed.parentRequests[0].p_record_id).toBeNull()
  expect(observed.parentRequests[0].p_target_tenant_id).toBe(tenantId)
})

test('承运商上级目录跨页完整，停用祖先保留且自身与后代排除', async ({ page }, info) => {
  const observed = await mockParents(page, 'carrier', { large: true })
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?parentTree', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开承运商', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑承运商' })
  await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
    timeout: 120_000
  })
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '上级单位' })
    .locator('.el-select')
    .click()
  const tree = page.locator('.el-select__popper:visible .el-tree')
  await expect(tree.getByText('停用祖先（DISABLED） · 已停用', { exact: true })).toBeVisible()
  await tree
    .locator('.el-tree-node[data-key="zz-495"] > .el-tree-node__content .el-tree-node__expand-icon')
    .click()
  await expect(tree.getByText('跨页子单位（LATE-CHILD）', { exact: true })).toBeVisible()
  await expect(tree.getByText('当前单位（SELF）', { exact: true })).toHaveCount(0)
  await expect(tree.getByText('当前单位下级（DESCENDANT）', { exact: true })).toHaveCount(0)
  await tree
    .locator('.el-tree-node[data-key="root"] > .el-tree-node__content .el-tree-node__expand-icon')
    .click()
  await expect(tree.getByText('可选单位（CHILD）', { exact: true })).toBeVisible()
  await expect(tree.locator('.el-tree-node')).toHaveCount(499)
  await page.screenshot({ path: info.outputPath('carrier-parent-paged-expanded.png') })
  expect(observed.blockedTableReads).toBe(0)
  expect(observed.parentRequests).toHaveLength(2)
  expect(observed.parentRequests.map((request) => [request.p_from, request.p_to])).toEqual([
    [0, 499],
    [500, 999]
  ])
  expect(observed.parentRequests.every((request) => request.p_record_id === 'carrier-1')).toBe(true)
  expect(observed.parentRequests.every((request) => request.p_target_tenant_id === null)).toBe(true)
})

test('平台全部租户编辑其他租户承运商由记录决定父级归属', async ({ page }, info) => {
  const observed = await mockParents(page, 'carrier', { scope: 'all' })
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?scope=all&parentTree', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开其他租户承运商', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑承运商' })
  await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
    timeout: 120_000
  })
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '上级单位' })
    .locator('.el-select')
    .click()
  const tree = page.locator('.el-select__popper:visible .el-tree')
  await expect(tree.getByText('其他租户根单位（ROOT-B）', { exact: true })).toBeVisible()
  await expect(tree.getByText('集团单位（ROOT）', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('carrier-parent-platform-all.png') })
  expect(observed.blockedTableReads).toBe(0)
  expect(observed.parentRequests).toHaveLength(1)
  expect(observed.parentRequests[0].p_record_id).toBe('carrier-b')
  expect(observed.parentRequests[0].p_target_tenant_id).toBeNull()
})

for (const scope of ['selected', 'ordinary'] as const) {
  test(`${scope} 承运商父级目录按当前租户读取`, async ({ page }, info) => {
    const observed = await mockParents(page, 'carrier', { scope })
    await page.goto(
      `/tests/e2e/fixtures/tms-customer-coordinate-write.html${scope === 'selected' ? '?scope=selected&parentTree' : '?parentTree'}`,
      { waitUntil: 'domcontentloaded' }
    )
    await page
      .getByRole('button', {
        name: scope === 'selected' ? '打开其他租户承运商' : '打开承运商',
        exact: true
      })
      .click()
    const dialog = page.getByRole('dialog', { name: '编辑承运商' })
    await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
      timeout: 120_000
    })
    await dialog
      .locator('.el-form-item')
      .filter({ hasText: '上级单位' })
      .locator('.el-select')
      .click()
    const tree = page.locator('.el-select__popper:visible .el-tree')
    await expect(
      tree.getByText(scope === 'selected' ? '其他租户根单位（ROOT-B）' : '集团单位（ROOT）', {
        exact: true
      })
    ).toBeVisible()
    if (scope === 'selected')
      await page.screenshot({ path: info.outputPath('carrier-parent-platform-selected.png') })
    expect(observed.blockedTableReads).toBe(0)
    expect(observed.parentRequests).toHaveLength(1)
    expect(observed.parentRequests[0].p_record_id).toBe(
      scope === 'selected' ? 'carrier-b' : 'carrier-1'
    )
    expect(observed.parentRequests[0].p_target_tenant_id).toBeNull()
  })
}

test('平台全部租户显式目标与空目标分别从安全RPC读取', async ({ page }) => {
  const observed = await mockParents(page, 'carrier', { scope: 'all' })
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?scope=all&parentTree', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '加载显式租户上级单位' }).click()
  await expect(page.getByTestId('explicit-carrier-parent-ids')).toContainText('root-b')
  await page.getByRole('button', { name: '加载默认租户上级单位' }).click()
  await expect(page.getByTestId('default-carrier-parent-ids')).toContainText('root')
  expect(observed.blockedTableReads).toBe(0)
  expect(observed.parentRequests.map((request) => request.p_target_tenant_id)).toEqual([
    selectedTenantId,
    null
  ])
  expect(observed.parentRequests.every((request) => request.p_record_id === null)).toBe(true)
})
