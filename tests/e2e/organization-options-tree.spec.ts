import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

test('HR organization navigation loads only the fields needed for its tree', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000)
  const organizationRequests: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const tenant = { id: 'organization-test-tenant', tenant_code: 'test', tenant_name: '测试租户' }
  const pageMenu = {
    id: 'organization-test-page',
    parentId: 'organization-test-personnel',
    type: 'menu',
    name: 'HrOrganizationPosition',
    path: 'organization-position',
    component: '/hr/personnel/organization-position',
    meta: { title: '组织岗位人员', is_enable: true },
    children: []
  }
  const personnelMenu = {
    id: 'organization-test-personnel',
    parentId: 'organization-test-root',
    type: 'folder',
    name: 'HrPersonnel',
    path: 'personnel',
    component: '',
    meta: { title: '人事管理', is_enable: true },
    children: [pageMenu]
  }
  const rootMenu = {
    id: 'organization-test-root',
    parentId: null,
    type: 'folder',
    name: 'HrHumanResources',
    path: '/hr',
    component: '/index/index',
    meta: { title: 'HR人力资源', is_enable: true },
    children: [personnelMenu]
  }

  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: { id: 'organization-test-auth', aud: 'authenticated', role: 'authenticated' }
    })
  )
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'organization-test-user',
        user_name: '测试用户',
        user_email: 'test@example.invalid',
        status: '1',
        tenant_id: tenant.id,
        tenant
      }
    })
  )
  await page.route('**/rest/v1/sys_param?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_tenant?*', (route) => route.fulfill({ json: [tenant] }))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      { ...rootMenu, children: undefined },
      { ...personnelMenu, children: undefined },
      pageMenu
    ]
  })
  await page.route('**/rest/v1/mdm_organization?*', async (route) => {
    organizationRequests.push(route.request().url())
    await route.fulfill({
      json: [
        {
          id: 'organization-test-department',
          tenant_id: tenant.id,
          parent_id: null,
          organization_code: 'TEST-DEPT',
          organization_name: '测试部门',
          organization_type: 'department',
          status: '1',
          sort: 1,
          is_system: false,
          tenant
        }
      ]
    })
  })
  await page.route('**/rest/v1/rpc/hr_get_organization_position_directory_secure', (route) =>
    route.fulfill({ json: { positions: [], employees: [], employee_total: 0, truncated: false } })
  )

  await page.goto('#/hr/personnel/organization-position')
  const workspace = page.locator('main')
  await expect(page.getByRole('heading', { name: '组织岗位人员' })).toBeVisible({ timeout: 60_000 })
  await expect(workspace.getByText('测试部门', { exact: true }).first()).toBeVisible()

  await expect
    .poll(() =>
      organizationRequests.find((requestUrl) =>
        new URL(requestUrl).searchParams.get('select')?.includes('organization_code')
      )
    )
    .toBeTruthy()
  const treeRequest = organizationRequests.find((requestUrl) =>
    new URL(requestUrl).searchParams.get('select')?.includes('organization_code')
  )!
  const selection = new URL(treeRequest).searchParams.get('select') ?? ''
  expect(selection).toContain('parent_id')
  expect(selection).not.toMatch(/member|role_menu|menu_count/)
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  expect(pageErrors).toEqual([])
  await workspace.screenshot({ path: testInfo.outputPath('organization-options.png') })

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  await workspace.screenshot({ path: testInfo.outputPath('organization-options-narrow.png') })

  const employeeCard = page.locator('.organization-position-page__employee-card')
  await employeeCard.scrollIntoViewIfNeeded()
  await expect(employeeCard.getByText('员工', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      employeeCard.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= window.innerWidth
      })
    )
    .toBe(true)
  await workspace.screenshot({
    path: testInfo.outputPath('organization-options-employee-narrow.png')
  })
})
