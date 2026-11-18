import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

const tenantId = '791aa102-fff1-4222-8bbb-6bd800000001'
const assembly = {
  id: '791aa102-fff1-4222-8bbb-6bd800000002',
  parentId: null,
  organizationCode: 'ASM',
  organizationName: '验收装配中心',
  organizationType: 'department',
  sort: 1
}
const quality = {
  ...assembly,
  id: '791aa102-fff1-4222-8bbb-6bd800000003',
  parentId: assembly.id,
  organizationCode: 'QC',
  organizationName: '验收质检组'
}

const originalPosition = {
  id: '791aa102-fff1-4222-8bbb-6bd800000004',
  positionName: '验收原岗位',
  positionCode: 'OLD',
  positionKind: 'standard',
  employeeCount: 1,
  sort: 2
}
const inspector = {
  ...originalPosition,
  id: '791aa102-fff1-4222-8bbb-6bd800000005',
  positionName: '验收质检岗',
  positionCode: 'QC-01',
  sort: 1
}

async function prepareReadOnlyWorkspace(page: Page, name: string, title: string, path: string) {
  await prepareIsolatedSession(page, { tenantId, platformSuper: false })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  const menu = {
    id: name,
    parentId: null,
    name,
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title, is_enable: true, is_hide: false }
  }
  await mockApplicationMenus(page, {
    smis: [
      menu,
      {
        ...menu,
        id: `${name}-view`,
        name: `${name}:View`,
        parentId: name,
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
}

const treeNode = (tree: Locator, name: string) =>
  tree.getByText(name, { exact: true }).locator('xpath=ancestor::*[@role="treeitem"][1]')

async function navigateWithoutSelecting(parent: Locator, child: Locator) {
  await parent.press('ArrowLeft')
  await expect(parent).toHaveAttribute('aria-expanded', 'false')
  await parent.press('ArrowRight')
  await expect(child).toBeVisible()
  await parent.press('ArrowRight')
  await expect(child).toBeFocused()
  await child.press('ArrowLeft')
  await expect(parent).toBeFocused()
}

async function mockOrganizationTree(page: Page) {
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      json: [assembly, quality].map((organization) => ({
        id: organization.id,
        tenant_id: tenantId,
        parent_id: organization.parentId,
        organization_code: organization.organizationCode,
        organization_name: organization.organizationName,
        organization_type: organization.organizationType,
        status: '1',
        sort: organization.sort
      }))
    })
  )
}

test('岗位职责键盘选择重置旧岗位并保留子组织查询范围', async ({ page }) => {
  const path = '/smis/basic-data/position-safety-responsibility'
  await prepareReadOnlyWorkspace(page, 'SmisPositionSafetyResponsibility', '岗位安全责任制', path)
  await mockOrganizationTree(page)
  const positionScopes: unknown[] = []
  await page.route('**/rest/v1/rpc/smis_list_positions_secure', (route) => {
    const scope = route.request().postDataJSON().p_organization_id
    positionScopes.push(scope)
    // 有意让旧岗位仍可见，以区分选中组织后重置和只是删除旧岗位选项。
    const records = scope ? [inspector, originalPosition] : [originalPosition]
    return route.fulfill({ json: { records, total: records.length } })
  })
  const responsibilityScopes: Array<(string | null)[]> = []
  const writes: string[] = []
  await page.route(/\/rest\/v1\/smis_position_safety_responsibility(?:\?|$)/, (route) => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method())
      return route.abort()
    }
    const params = new URL(route.request().url()).searchParams
    responsibilityScopes.push([params.get('position_id'), params.get('organization_id')])
    return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })

  await page.goto(`#${path}`)
  const workspace = page.locator('.position-safety-page')
  await expect(workspace.getByRole('heading', { name: '岗位安全责任制' })).toBeVisible({
    timeout: 120_000
  })
  await expect.poll(() => responsibilityScopes.at(-1)).toEqual([`eq.${originalPosition.id}`, null])
  const tree = workspace.getByRole('tree')
  const parent = treeNode(tree, assembly.organizationName)
  const child = treeNode(tree, quality.organizationName)
  const requestCounts = [positionScopes.length, responsibilityScopes.length]
  await navigateWithoutSelecting(parent, child)
  expect([positionScopes.length, responsibilityScopes.length]).toEqual(requestCounts)

  await child.press('Enter')
  await expect.poll(() => positionScopes.at(-1)).toBe(quality.id)
  await expect
    .poll(() => responsibilityScopes.at(-1))
    .toEqual([`eq.${inspector.id}`, `in.(${quality.id})`])
  await expect(workspace.locator('.position-safety-page__positions tr.current-row')).toContainText(
    inspector.positionName
  )
  await parent.press('Space')
  await expect.poll(() => positionScopes.at(-1)).toBe(assembly.id)
  await expect
    .poll(() => responsibilityScopes.at(-1))
    .toEqual([`eq.${inspector.id}`, `in.(${assembly.id},${quality.id})`])
  await expect(workspace.getByRole('button', { name: '新增标准', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})

test('岗位风险清单键盘切换组织时重置岗位并保留后代范围', async ({ page }) => {
  const path = '/smis/basic-data/position-risk-list'
  await prepareReadOnlyWorkspace(page, 'SmisPositionRiskList', '岗位风险清单', path)
  await mockOrganizationTree(page)
  const positionScopes: unknown[] = []
  await page.route('**/rest/v1/rpc/smis_list_risk_positions_secure', (route) => {
    const scope = route.request().postDataJSON().p_organization_id
    positionScopes.push(scope)
    const records =
      scope === quality.id ? [inspector, originalPosition] : [originalPosition, inspector]
    return route.fulfill({ json: { records, total: records.length } })
  })
  const riskScopes: Array<[string | null, string | null]> = []
  const writes: string[] = []
  const qualityRisk = '验收质检作业风险'
  const assemblyRisk = '验收装配作业风险'
  await page.route(/\/rest\/v1\/smis_position_risk_control(?:\?|$)/, (route) => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method())
      return route.abort()
    }
    const params = new URL(route.request().url()).searchParams
    const position = params.get('position_id')
    const organization = params.get('organization_id')
    riskScopes.push([position, organization])
    const childScope = position === `eq.${inspector.id}`
    return route.fulfill({
      headers: { 'content-range': '0-0/1' },
      json: [
        {
          id: childScope
            ? '791aa102-fff1-4222-8bbb-6bd800000006'
            : '791aa102-fff1-4222-8bbb-6bd800000007',
          organization_id: childScope ? quality.id : assembly.id,
          position_id: childScope ? inspector.id : originalPosition.id,
          hazard_factor: childScope ? qualityRisk : assemblyRisk,
          control_measure: '验收隔离管控措施'
        }
      ]
    })
  })

  await page.goto(`#${path}`)
  const workspace = page.locator('.position-risk-page')
  await expect(workspace.getByRole('heading', { name: '岗位风险清单' })).toBeVisible({
    timeout: 120_000
  })
  const navigator = workspace.locator('.risk-organization')
  await expect(navigator).toHaveAttribute('aria-busy', 'false')
  await expect(workspace.getByText(assemblyRisk, { exact: true })).toBeVisible()
  const parent = treeNode(navigator, assembly.organizationName)
  const child = treeNode(navigator, quality.organizationName)
  await expect.poll(() => positionScopes.at(-1)).toBe(assembly.id)
  await expect
    .poll(() => riskScopes.at(-1))
    .toEqual([`eq.${originalPosition.id}`, `in.(${assembly.id},${quality.id})`])
  const requestCounts = [positionScopes.length, riskScopes.length]
  await navigateWithoutSelecting(parent, child)
  expect([positionScopes.length, riskScopes.length]).toEqual(requestCounts)

  await child.press('Enter')
  await expect.poll(() => positionScopes.at(-1)).toBe(quality.id)
  await expect.poll(() => riskScopes.at(-1)).toEqual([`eq.${inspector.id}`, `in.(${quality.id})`])
  await expect(workspace.getByText(qualityRisk, { exact: true })).toBeVisible()
  await expect(child).toBeFocused()
  await parent.press('Space')
  await expect.poll(() => positionScopes.at(-1)).toBe(assembly.id)
  await expect
    .poll(() => riskScopes.at(-1))
    .toEqual([`eq.${originalPosition.id}`, `in.(${assembly.id},${quality.id})`])
  await expect(workspace.getByText(assemblyRisk, { exact: true })).toBeVisible()
  await expect(parent).toBeFocused()
  await expect(workspace.getByRole('button', { name: '新增措施', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})

test('岗位作业指导书用键盘提交岗位或仅组织范围', async ({ page }) => {
  const path = '/smis/basic-data/position-work-instruction'
  await page.setViewportSize({ width: 720, height: 900 })
  await prepareReadOnlyWorkspace(page, 'SmisPositionWorkInstruction', '岗位作业指导书', path)
  await page.route('**/rest/v1/rpc/smis_get_work_instruction_position_tree_secure', (route) =>
    route.fulfill({
      json: {
        organizations: [assembly],
        positions: [
          {
            scopeKey: `position:${inspector.id}`,
            organizationId: assembly.id,
            positionId: inspector.id,
            positionCode: inspector.positionCode,
            positionName: inspector.positionName,
            sort: inspector.sort,
            employeeCount: inspector.employeeCount,
            instructionCount: 1
          }
        ]
      }
    })
  )
  const scopes: unknown[][] = []
  await page.route('**/rest/v1/rpc/smis_list_position_work_instructions_secure', (route) => {
    const payload = route.request().postDataJSON()
    scopes.push([payload.p_organization_id, payload.p_position_id])
    return route.fulfill({ json: { records: [], total: 0 } })
  })
  const writes: string[] = []
  await page.route(/\/rpc\/smis_(save|delete)_position_work_instruction/, (route) => {
    writes.push(route.request().url())
    return route.abort()
  })

  await page.goto(`#${path}`)
  const workspace = page.locator('.work-instruction-page')
  await expect(workspace.getByRole('heading', { name: '岗位作业指导书' })).toBeVisible({
    timeout: 120_000
  })
  const navigator = workspace.locator('.work-instruction-page__tree-panel .art-section-card')
  await expect(navigator).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => scopes.at(-1)).toEqual([null, null])
  const tree = navigator.getByRole('tree')
  const parent = treeNode(tree, assembly.organizationName)
  const child = treeNode(tree, inspector.positionName)
  const initialRequests = scopes.length
  await navigateWithoutSelecting(parent, child)
  expect(scopes).toHaveLength(initialRequests)
  await child.press('Enter')
  await expect.poll(() => scopes.at(-1)).toEqual([assembly.id, inspector.id])
  await parent.press('Space')
  await expect.poll(() => scopes.at(-1)).toEqual([assembly.id, null])
  await expect(workspace.getByRole('button', { name: '新增指导书', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})
