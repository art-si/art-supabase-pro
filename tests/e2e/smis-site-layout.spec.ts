import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test('场所树箭头与图片上传保持公用布局', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const organization = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organization_code: 'OPS',
      organization_name: '业务部门',
      organization_type: 'department',
      status: '1',
      sort: 1
    }
    if (path.endsWith('/mdm_organization')) return route.fulfill({ json: [organization] })
    if (path.endsWith('/rpc/smis_list_sites_secure')) {
      const root = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organization_id: organization.id,
        organization,
        site_name: '新新社区',
        category_code: 'area',
        sort: 1,
        coordinate_system: 'gcj02',
        image_urls: []
      }
      return route.fulfill({
        json: [
          root,
          {
            ...root,
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            parent_id: root.id,
            site_name: '社区服务中心'
          }
        ]
      })
    }
    if (path.endsWith('/rpc/smis_list_site_employees_secure'))
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/smis-site-import.html?scope=selected&layout=1')
  const cell = page.locator('.site-tree-identity-cell').filter({ hasText: '新新社区' }).first()
  await expect(cell).toBeVisible()
  const arrow = cell.locator('.el-table__expand-icon')
  const identity = cell.locator('.site-page__identity')
  const a = await arrow.boundingBox()
  const b = await identity.boundingBox()
  expect(a).not.toBeNull()
  expect(b).not.toBeNull()
  expect(Math.abs(a!.y + a!.height / 2 - (b!.y + b!.height / 2))).toBeLessThan(2)
  await arrow.click()
  await expect(
    page.locator('.site-tree-identity-cell').filter({ hasText: '社区服务中心' })
  ).toBeVisible()
  await page
    .locator('.site-tree-row')
    .first()
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  const dialog = page.getByRole('dialog').filter({ hasText: '编辑场所' })
  const tile = dialog.locator('.art-upload .el-upload')
  const resource = dialog.getByRole('button', { name: '从资源库选择图片', exact: true })
  await expect(resource).toBeVisible()
  const t = await tile.boundingBox()
  const r = await resource.boundingBox()
  expect(t).not.toBeNull()
  expect(r).not.toBeNull()
  expect(r!.x).toBeGreaterThanOrEqual(t!.x)
  expect(r!.x + r!.width).toBeLessThanOrEqual(t!.x + t!.width + 1)
  expect(r!.y).toBeGreaterThanOrEqual(t!.y)
  expect(r!.y + r!.height).toBeLessThan(t!.y + t!.height)
  await page.screenshot({ path: info.outputPath('site-upload-layout.png'), fullPage: true })
})

test('场所部门树用键盘查询部门及下级并清除上次勾选', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 720, height: 900 })
  const tenantId = 'dd83daa3-d287-4100-a333-ef9000000001'
  await prepareIsolatedSession(page, { tenantId, platformSuper: false })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  const menu = {
    id: 'SmisSite',
    parentId: null,
    name: 'SmisSite',
    path: '/smis/basic-data/site',
    component: '/smis/basic-data/site',
    type: 'menu',
    sort: 1,
    meta: { title: '场所维护', is_enable: true, is_hide: false }
  }
  await mockApplicationMenus(page, {
    smis: [
      menu,
      {
        ...menu,
        id: 'SmisSite-View',
        parentId: menu.id,
        name: 'SmisSite:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const parentDepartment = {
    id: 'dd83daa3-d287-4100-a333-ef9000000002',
    tenant_id: tenantId,
    parent_id: null,
    organization_code: 'OPS',
    organization_name: '验收运行部门',
    organization_type: 'department',
    status: '1',
    sort: 1
  }
  const childDepartment = {
    ...parentDepartment,
    id: 'dd83daa3-d287-4100-a333-ef9000000003',
    parent_id: parentDepartment.id,
    organization_code: 'OPS-SVC',
    organization_name: '验收服务组'
  }
  const otherDepartment = {
    ...parentDepartment,
    id: 'dd83daa3-d287-4100-a333-ef9000000004',
    organization_code: 'QA',
    organization_name: '验收质量部门'
  }
  const departments = [parentDepartment, childDepartment, otherDepartment]
  await page.route('**/rest/v1/mdm_organization?*', (route) => route.fulfill({ json: departments }))
  const sites = ['验收运行场所', '验收服务场所', '验收质量场所'].map((siteName, index) => ({
    id: `dd83daa3-d287-4100-a333-ef900000000${index + 5}`,
    organization_id: departments[index].id,
    organization: departments[index],
    site_name: siteName,
    category_code: 'area',
    sort: 1,
    coordinate_system: 'gcj02',
    image_urls: []
  }))
  const reads: unknown[] = []
  await page.route('**/rest/v1/rpc/smis_list_sites_secure', (route) => {
    reads.push(route.request().postDataJSON() ?? {})
    return route.fulfill({ json: sites })
  })
  const writes: string[] = []
  await page.route(/\/rpc\/smis_(save|delete)_sites?_secure$/, (route) => {
    writes.push(route.request().url())
    return route.abort()
  })

  await page.goto(`#${menu.path}`)
  const workspace = page.locator('.site-page')
  await expect(workspace.getByRole('heading', { name: '场所维护' })).toBeVisible({
    timeout: 60_000
  })
  const navigator = workspace.locator('.site-department-navigator')
  await expect(navigator).toHaveAttribute('aria-busy', 'false')
  const row = (name: string) => workspace.locator('tbody tr').filter({ hasText: name })
  const currentRows = sites.map((site) => row(site.site_name))
  for (const item of currentRows) await expect(item).toBeVisible()
  const [parentRow, childRow, otherRow] = currentRows
  const childCheckbox = childRow.getByRole('checkbox')
  await childRow.locator('.el-checkbox').click()
  await expect(childCheckbox).toBeChecked()
  const treeNode = (name: string) =>
    navigator.getByText(name, { exact: true }).locator('xpath=ancestor::*[@role="treeitem"][1]')
  const parent = treeNode(parentDepartment.organization_name)
  const child = treeNode(childDepartment.organization_name)
  const initialReads = reads.length
  await parent.press('ArrowLeft')
  await expect(parent).toHaveAttribute('aria-expanded', 'false')
  await parent.press('ArrowRight')
  await expect(child).toBeVisible()
  await parent.press('ArrowRight')
  await expect(child).toBeFocused()
  await child.press('ArrowLeft')
  await expect(parent).toBeFocused()
  expect(reads).toHaveLength(initialReads)
  await expect(childCheckbox).toBeChecked()

  await child.press('Enter')
  await expect.poll(() => reads.length).toBe(initialReads + 1)
  await expect(childRow).toBeVisible()
  await expect(parentRow).toHaveCount(0)
  await expect(otherRow).toHaveCount(0)
  await expect(childCheckbox).not.toBeChecked()
  await expect(child).toBeFocused()
  await parent.press('Space')
  await expect.poll(() => reads.length).toBe(initialReads + 2)
  await expect(parentRow).toBeVisible()
  await expect(childRow).toBeVisible()
  await expect(otherRow).toHaveCount(0)
  await expect(parent).toBeFocused()
  expect(reads).toEqual(reads.map(() => ({})))
  await expect(workspace.getByRole('button', { name: '新增场所', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})
