import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

async function openWorkCenter(page: Page) {
  // Browser-only route/permission fixtures; never grant privileges in the database.
  const meta = { title: '工作中心', is_enable: true, is_hide: false }
  const child = {
    id: 'test-center-menu',
    parentId: 'test-mdm-root',
    name: 'MdmWorkCenter',
    path: 'production/work-center',
    component: '/mdm/production/work-center',
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
  const buttons = ['View', 'Personnel'].map((action) => ({
    id: `test-${action}`,
    parentId: child.id,
    name: `MdmWorkCenter:${action}`,
    type: 'button',
    path: '',
    component: '',
    meta
  }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  const flat = [root, child, ...buttons]
  await mockApplicationMenus(page, { platform: flat, mdm: flat })
  await page.goto('#/mdm/production/work-center', { waitUntil: 'domcontentloaded' })
}

test('work-center people use the minimal RPC and preserve arbitrary range offsets', async ({
  page
}) => {
  test.setTimeout(90_000)
  const requests: URL[] = []
  const failures: number[] = []
  page.on('response', (response) => {
    if (response.url().includes('/rpc/mdm_work_center_people')) {
      requests.push(new URL(response.url()))
      if (response.status() >= 400) failures.push(response.status())
    }
  })
  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('字典目录', { exact: true })).toBeVisible({ timeout: 60_000 })
  const result = await page.evaluate(async () => {
    const modulePath = '/modules/art-supabase-mdm/src/api/modules/workspaces.ts'
    const api = await import(/* @vite-ignore */ modulePath)
    const menuPath = '/src/api/system-manage.ts'
    const { fetchCurrentUserMenus } = await import(/* @vite-ignore */ menuPath)
    const menu = await fetchCurrentUserMenus(['mdm'])
    const granted = menu.data.mdm.some((row: { name: string }) => row.name === 'MdmWorkCenter:View')
    try {
      const result = await api.fetchProductionPersonSelector({ from: 5, to: 8 })
      // Do not print or persist actual personnel data.
      return {
        granted,
        denied: false,
        hasError: !!result.error,
        hasPrivateFields: result.data.some((row: object) =>
          ['phone', 'gender', 'remark', 'hireDate'].some((key) => key in row)
        ),
        fieldAccess: result.fieldAccess
      }
    } catch {
      return { granted, denied: true }
    }
  })
  expect(result.denied).toBe(!result.granted)
  expect(failures).toEqual(result.denied ? [403] : [])
  expect(
    requests.some(
      (url) => url.searchParams.get('offset') === '5' && url.searchParams.get('limit') === '4'
    )
  ).toBe(true)
  if (!result.denied) {
    expect(result.hasError).toBe(false)
    expect(result.hasPrivateFields).toBe(false)
    expect(result.fieldAccess).toEqual({ contactDetails: false, identityDetails: false })
  }
})

test('personnel arrangement displays synthetic identity references without fetching archives', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000)
  const personId = '00000000-0000-4000-8000-000000000123'
  let archiveRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/mdm_production_personnel')) archiveRequests++
  })
  await page.route('**/rest/v1/mdm_work_center?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: '00000000-0000-4000-8000-000000000456',
          code: 'TEST-CENTER',
          name: '测试工作中心',
          personnel_mode: '指定人员',
          person_ids: [personId],
          department: null,
          main_center: null,
          qr_token: 'test-only',
          policy: {}
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/mdm_work_center_people*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: personId,
          tenant_id: '00000000-0000-4000-8000-000000000789',
          name: '测试人员',
          employee_no: 'TEST-001',
          job_title: new URL(route.request().url()).searchParams.get('or')?.includes('缺省')
            ? undefined
            : new URL(route.request().url()).searchParams.get('or')?.includes('空值')
              ? null
              : '测试岗位',
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_work_center_adjustment?*', (route) =>
    route.fulfill({ json: [] })
  )
  await openWorkCenter(page)
  await expect(page.getByRole('button', { name: '临时调整', exact: true })).toBeVisible({
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
  await page.getByRole('button', { name: '临时调整', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '工作中心人员安排', exact: true })
  await expect(dialog.getByText('测试人员 · TEST-001', { exact: false })).toBeVisible()
  await expect(dialog.getByText('暂无临时调整', { exact: true })).toBeVisible()
  expect(archiveRequests).toBe(0)
  await dialog.screenshot({ path: testInfo.outputPath('personnel-identity-only.png') })
  await dialog.getByRole('textbox').click()
  const selector = page.getByRole('dialog', { name: '选择生产人员', exact: true })
  await expect(
    selector.getByText('仅显示姓名、工号等排人所需信息，不读取人员隐私档案')
  ).toBeVisible()
  await expect(selector.getByRole('textbox', { name: '姓名 / 工号' })).toBeVisible()
  await expect(selector.getByText('测试岗位', { exact: true }).first()).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '所属组织', exact: true })).toHaveCount(0)
  await expect(selector.getByRole('columnheader', { name: '手机号码', exact: true })).toHaveCount(0)
  await expect(selector.getByText('未分配组织', { exact: true })).toHaveCount(0)
  const pager = selector.locator('.art-data-select-dialog__pager')
  await expect(pager).toBeInViewport({ ratio: 1 })
  const pagerBox = await pager.boundingBox()
  const footerBox = await selector.locator('.el-dialog__footer').boundingBox()
  expect(pagerBox).not.toBeNull()
  expect(footerBox).not.toBeNull()
  expect(pagerBox!.y + pagerBox!.height).toBeLessThanOrEqual(footerBox!.y + 1)
  await expect(selector.getByRole('button', { name: '确定', exact: true })).toBeInViewport({
    ratio: 1
  })
  expect(archiveRequests).toBe(0)
  await selector.screenshot({ path: testInfo.outputPath('personnel-selector-safe.png') })
  const search = selector.getByRole('textbox', { name: '姓名 / 工号' })
  await search.fill('缺省')
  await search.press('Enter')
  await expect(selector.getByText('未提供岗位信息', { exact: true })).toBeVisible()
  await search.fill('空值')
  await search.press('Enter')
  await expect(selector.getByText('未分配岗位', { exact: true })).toBeVisible()
})
