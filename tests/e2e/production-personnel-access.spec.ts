import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

test('department workspace remains an organization table and never reads personnel', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  const meta = { title: '部门 / 产线', is_enable: true, is_hide: false }
  const child = {
    id: 'test-department-menu',
    parentId: 'test-mdm-root',
    name: 'MdmProductionDepartment',
    path: 'production/department',
    component: '/mdm/production/department',
    type: 'menu',
    meta,
    children: []
  }
  const root = {
    id: 'test-mdm-root',
    parentId: null,
    name: 'MdmMasterData',
    path: '/mdm',
    component: '/index/index',
    type: 'folder',
    meta: { ...meta, title: 'MDM主数据' },
    children: [child]
  }
  const buttons = ['View', 'Add', 'Edit'].map((action) => ({
    id: `test-dept-${action}`,
    parentId: child.id,
    name: `MdmProductionDepartment:${action}`,
    type: 'button',
    path: '',
    component: '',
    meta
  }))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, { platform: [root, child, ...buttons] })
  const department = {
    id: '00000000-0000-4000-8000-000000000321',
    parent_id: null,
    code: 'TEST-LINE',
    name: '测试产线',
    kind: '产线',
    factory: '测试工厂',
    enabled: true,
    sort: 0,
    tag_type: 'info'
  }
  await page.route('**/rest/v1/mdm_production_department?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [department]
    })
  )
  let personnelRequests = 0
  await page.route('**/rest/v1/mdm_production_personnel?*', (route) => {
    personnelRequests++
    return route.fulfill({ json: [] })
  })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/mdm/production/department', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '部门 / 产线', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.evaluate(
    (settings) => {
      document.documentElement.classList.toggle('dark', settings.dark)
      document.documentElement.classList.toggle('shadow-mode', settings.shadow)
      document.documentElement.classList.toggle('border-mode', !settings.shadow)
    },
    {
      dark: testInfo.project.name.includes('dark'),
      shadow: testInfo.project.name.includes('shadow')
    }
  )

  const workspace = page.locator('.production-workspace')
  await expect(workspace.getByText('测试产线', { exact: true }).first()).toBeVisible()
  await expect(workspace.getByText('TEST-LINE', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增部门', exact: true })).toBeVisible()
  await expect(page.getByText('筛选人员', { exact: true })).toHaveCount(0)
  await expect(page.getByText('人员信息需要单独授权', { exact: true })).toHaveCount(0)
  expect(personnelRequests).toBe(0)

  await page.getByRole('button', { name: '查看', exact: true }).click()
  await expect(page.getByText('部门 / 产线详情', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('编辑部门 / 产线', { exact: true })).toBeVisible()
  await expect(dialog.getByText('组织映射', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: '保存更改', exact: true })).toHaveCount(1)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()

  await page.evaluate(async () => {
    const path = '/src/store/modules/menu.ts'
    const { useMenuStore } = await import(/* @vite-ignore */ path)
    const store = useMenuStore()
    store.setButtonList([
      ...store.buttonList,
      {
        id: 'test-personnel-view',
        name: 'MdmProductionPersonnel:View',
        type: 'button',
        path: '',
        component: '',
        meta: { title: '查看' }
      }
    ])
  })
  await expect(workspace.getByText('测试产线', { exact: true }).first()).toBeVisible()
  expect(personnelRequests).toBe(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true)
  expect(pageErrors).toEqual([])
})
