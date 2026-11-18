import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '41af026c-116d-43cb-987a-0dc400000001'
const treeItem = (tree: Locator, label: string) =>
  tree.getByText(label, { exact: true }).locator('xpath=ancestor::*[@role="treeitem"][1]')

async function prepareWorkspace(
  page: Page,
  path: string,
  name: string,
  title: string,
  permissions: string[]
) {
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
      ...['View', ...permissions].map((action) => ({
        ...menu,
        id: `${name}-${action}`,
        parentId: name,
        name: `${name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
}

test('SMIS复杂树 四色图取消后保留原画布及树选中态，确认才切换', async ({ page }) => {
  const path = '/smis/dual-control-system/risk-control/risk-four-color-map'
  await prepareWorkspace(page, path, 'SmisDualControlRiskFourColorMap', '风险四色图', ['Save'])
  const primary = {
    id: '41af026c-116d-43cb-987a-0dc400000002',
    tenantId,
    parentId: null,
    sceneName: '验收装配车间',
    canvasWidth: 800,
    canvasHeight: 480,
    sort: 1,
    shapes: [],
    createTime: '2026-08-01T00:00:00Z',
    updateTime: '2026-08-01T00:00:00Z'
  }
  const secondary = {
    ...primary,
    id: '41af026c-116d-43cb-987a-0dc400000003',
    parentId: primary.id,
    sceneName: '验收质检工位',
    sort: 2,
    shapes: [
      {
        id: '41af026c-116d-43cb-987a-0dc400000004',
        shapeType: 'rectangle',
        label: '质检工位初始图形',
        x: 40,
        y: 40,
        width: 140,
        height: 90,
        rotation: 0,
        fillColor: '#2563eb',
        fillOpacity: 0.45,
        borderColor: '#2563eb',
        borderOpacity: 1,
        borderWidth: 2,
        points: [],
        sort: 0
      }
    ]
  }
  let sceneRequests = 0
  await page.route('**/rest/v1/rpc/smis_list_risk_map_scenes_secure', (route) => {
    sceneRequests++
    return route.fulfill({ json: [primary, secondary] })
  })
  await page.route('**/rest/v1/rpc/smis_list_risk_map_points_secure', (route) =>
    route.fulfill({ json: [] })
  )
  const writes: string[] = []
  await page.route(/\/rpc\/smis_(save|delete)_risk_map_/, (route) => {
    writes.push(route.request().url())
    return route.abort()
  })
  await page.goto(`#${path}`)
  const workspace = page.locator('.risk-four-map-page')
  const tree = workspace.getByRole('tree')
  const parent = treeItem(tree, primary.sceneName)
  const child = treeItem(tree, secondary.sceneName)
  const originalCanvas = workspace.getByRole('application', {
    name: `${primary.sceneName}风险四色图拖拽画布`
  })
  const nextCanvas = workspace.getByRole('application', {
    name: `${secondary.sceneName}风险四色图拖拽画布`
  })
  await expect(originalCanvas).toBeVisible({ timeout: 60_000 })
  await expect(parent).toHaveClass(/\bis-current\b/)
  await workspace.getByRole('button', { name: '添加矩形' }).click()
  const draft = originalCanvas.getByRole('button', { name: '矩形，按方向键移动' })
  const confirm = page.getByRole('dialog').filter({ hasText: '切换场景将放弃当前未保存的图形更改' })
  await expect(draft).toBeVisible()
  await expect(workspace.getByRole('button', { name: '保存配置' })).toBeEnabled()

  // 先走现有鼠标路径，以独立复现取消后的选中状态。
  await child.getByText(secondary.sceneName, { exact: true }).click()
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(originalCanvas).toBeVisible()
  await expect(draft).toBeVisible()
  await expect(parent).toHaveClass(/\bis-current\b/)
  await expect(child).not.toHaveClass(/\bis-current\b/)

  await parent.press('ArrowRight')
  await expect(child).toBeFocused()
  await expect(confirm).toHaveCount(0)
  await expect(parent).toHaveClass(/\bis-current\b/)
  await child.press('Enter')
  await confirm.getByRole('button', { name: '取消', exact: true }).press('Enter')
  await expect(confirm).toBeHidden()
  await expect(draft).toBeVisible()
  await expect(workspace.getByRole('button', { name: '保存配置' })).toBeEnabled()
  await expect(parent).toHaveClass(/\bis-current\b/)
  await expect(child).toBeFocused()

  await child.press('Space')
  await expect(originalCanvas).toBeVisible()
  await confirm.getByRole('button', { name: '确定', exact: true }).press('Enter')
  await expect(
    nextCanvas.getByRole('button', { name: '质检工位初始图形，按方向键移动' })
  ).toBeVisible()
  await expect(draft).toHaveCount(0)
  await expect(workspace.getByRole('button', { name: '已保存' })).toBeDisabled()
  await expect(child).toHaveClass(/\bis-current\b/)
  await expect(child.getByRole('button', { name: '编辑场景' })).toHaveCount(0)
  expect(sceneRequests).toBe(1)
  expect(writes).toEqual([])
})

for (const manager of [false, true]) {
  test(`SMIS复杂树 排查标准${manager ? '行内按钮键盘操作不切换范围' : '无管理权限时仍可键盘筛选'}`, async ({
    page
  }) => {
    const path = '/smis/dual-control-system/risk-control/inspection-standard'
    await prepareWorkspace(
      page,
      path,
      'SmisDualControlInspectionStandard',
      '排查标准',
      manager ? ['Add', 'Edit', 'Delete'] : []
    )
    const primary = {
      id: 'standard-root',
      tenant_id: tenantId,
      parent_id: null,
      standard_code: 'STD-ROOT',
      standard_name: '验收根标准',
      sort: 1,
      status: 'enabled'
    }
    const secondary = {
      ...primary,
      id: 'standard-child',
      parent_id: primary.id,
      standard_code: 'STD-CHILD',
      standard_name: '验收子标准',
      sort: 2
    }
    const voided = {
      ...primary,
      id: 'standard-voided',
      standard_code: 'STD-VOIDED',
      standard_name: '验收作废标准',
      sort: 3,
      status: 'voided'
    }
    const writes: string[] = []
    await page.route(/\/rest\/v1\/smis_inspection_(standard|item)(?:\?|$)/, (route) => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method())
        return route.abort()
      }
      return route.fallback()
    })
    await page.route('**/rest/v1/smis_inspection_standard?*', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [primary, secondary, voided] })
        : route.fallback()
    )
    const scopes: Array<string | null> = []
    await page.route('**/rest/v1/smis_inspection_item?*', (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      scopes.push(new URL(route.request().url()).searchParams.get('standard_id'))
      return route.fulfill({
        headers: { 'content-range': '0-0/1' },
        json: [
          {
            id: 'inspection-item',
            tenant_id: tenantId,
            standard_id: secondary.id,
            item_code: 'CHECK-01',
            inspection_content: '验收排查内容',
            status: 'enabled',
            sort: 1
          }
        ]
      })
    })
    const dependencyRequests: unknown[] = []
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details*', (route) => {
      const payload = route.request().postDataJSON()
      dependencyRequests.push([payload.p_table, payload.p_ids])
      return route.fulfill({ json: [] })
    })
    await page.goto(`#${path}`)
    const workspace = page.locator('.inspection-standard-page')
    const navigator = workspace.locator('.inspection-standard-page__navigation-card')
    const parent = treeItem(navigator, primary.standard_name)
    const child = treeItem(navigator, secondary.standard_name)
    await expect(navigator).toBeVisible({ timeout: 60_000 })
    await expect(navigator).toHaveAttribute('aria-busy', 'false')
    await expect(workspace.getByText('CHECK-01', { exact: true })).toBeVisible()
    await navigator.getByText(primary.standard_name, { exact: true }).click()
    const parentScope = `in.(${primary.id},${secondary.id})`
    await expect.poll(() => scopes.at(-1)).toBe(parentScope)

    const initialRequests = scopes.length
    const add = child.getByRole('button', { name: '新增下级标准', exact: true })
    const edit = child.getByRole('button', { name: '编辑标准', exact: true })
    const remove = child.getByRole('button', { name: '删除标准', exact: true })
    // 让真实键盘聚焦未选中的行；不能依赖鼠标悬停才能看到有权限的操作。
    await page.mouse.move(0, 0)
    await child.focus()
    await expect(child).toBeFocused()
    if (manager) {
      await expect(add).toBeVisible()
      const rowActions = child.locator('.inspection-standard-page__tree-actions')
      await expect(rowActions).toHaveCSS('opacity', '1')
      await page.keyboard.press('Tab')
      await expect(add).toBeFocused()
      await add.press('Enter')
      const createDialog = page.getByRole('dialog', { name: '新增排查标准' })
      await expect(createDialog.locator('[data-art-form-item-key="parentId"]')).toContainText(
        secondary.standard_name
      )
      await createDialog.getByRole('button', { name: '取消', exact: true }).press('Enter')
      await expect(createDialog).toBeHidden()
      await expect(add).toBeFocused()
      await expect(rowActions).toHaveCSS('opacity', '1')
      await edit.press('Space')
      const editDialog = page.getByRole('dialog', { name: '编辑排查标准' })
      await expect(
        editDialog.locator('[data-art-form-item-key="standardName"]').getByRole('textbox')
      ).toHaveValue(secondary.standard_name)
      await editDialog.getByRole('button', { name: '取消', exact: true }).press('Enter')
      await expect(editDialog).toBeHidden()
      await expect(edit).toBeFocused()
      await remove.press('Enter')
      const deleteDialog = page
        .getByRole('dialog')
        .filter({ hasText: `确认删除排查标准“${secondary.standard_name}”` })
      await expect(deleteDialog).toBeVisible()
      await expect
        .poll(() => dependencyRequests)
        .toEqual([['smis_inspection_standard', [secondary.id]]])
      await deleteDialog.getByRole('button', { name: '取消', exact: true }).press('Enter')
      await expect(deleteDialog).toBeHidden()
      await expect(remove).toBeFocused()
      const voidedNode = treeItem(navigator, voided.standard_name)
      await voidedNode.focus()
      await expect(voidedNode.getByRole('button', { name: '编辑标准', exact: true })).toBeDisabled()
    } else {
      await expect(child.locator('.inspection-standard-page__tree-actions button')).toHaveCount(0)
      await expect(navigator.getByRole('button', { name: '新增一级标准' })).toHaveCount(0)
    }
    await expect(parent).toHaveClass(/\bis-current\b/)
    await expect(child).not.toHaveClass(/\bis-current\b/)
    expect(scopes).toHaveLength(initialRequests)

    await parent.press('ArrowLeft')
    await expect(parent).toHaveAttribute('aria-expanded', 'false')
    await parent.press('ArrowRight')
    await expect(child).toBeVisible()
    await parent.press('ArrowRight')
    await expect(child).toBeFocused()
    expect(scopes).toHaveLength(initialRequests)
    await child.press('Enter')
    await expect.poll(() => scopes.at(-1)).toBe(`in.(${secondary.id})`)
    await parent.press('Space')
    await expect.poll(() => scopes.at(-1)).toBe(parentScope)
    expect(writes).toEqual([])
  })
}
