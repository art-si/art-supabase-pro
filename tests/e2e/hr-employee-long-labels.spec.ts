import { expect, test } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('长员工姓名和所属组织可核对全文，窄屏标签不越界', async ({ page, hasTouch }, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 320, height: 700 })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const tenant = await prepareIsolatedSession(page, {
    platformSuper: false,
    tenantId: '11111111-1111-4111-8111-111111111111'
  })
  const employeeName = 'Alejandra María Fernández-Montenegro'
  const organizationName = '华东供应链区域国际采购与跨境物流协同运营中心'
  const employee = {
    id: '11111111-1111-4111-8111-111111111112',
    employee_name: employeeName,
    employee_no: 'EMP-LONG-001',
    employment_status: 'active',
    job_title: '跨境采购合同履约与多式联运协同运营负责人',
    tenant_id: tenant.id,
    organization_id: '11111111-1111-4111-8111-111111111124',
    organization: { organization_name: organizationName, organization_code: 'EAST-OPS' },
    field_access: {}
  }
  const path = '/hr/personnel/employee-roster'
  const roster = {
    id: 'employee-roster',
    parentId: null,
    name: 'HrEmployeeRoster',
    path,
    component: `${path}/index`,
    type: 'menu',
    sort: 1,
    meta: { title: '员工花名册', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'hr', name: 'HR人力资源', baseUrl: '/hr/' }] })
  )
  await mockApplicationMenus(page, {
    hr: [
      roster,
      {
        ...roster,
        id: 'employee-detail',
        name: 'HrEmployeeDetail',
        path: '/hr/personnel/employee-detail/:id',
        component: '/hr/personnel/employee-detail/index',
        meta: { ...roster.meta, title: '员工档案详情', is_hide: true }
      },
      {
        ...roster,
        id: 'employee-view',
        name: 'Hr:Employee:View',
        parentId: roster.id,
        type: 'button',
        path: '',
        component: ''
      }
    ]
  })
  await page.route('**/rest/v1/rpc/hr_list_employees_secure**', (route) =>
    route.fulfill({ json: { records: [employee], total: 1, field_access: {} } })
  )
  await page.route('**/rest/v1/rpc/hr_get_employee_profile_secure**', (route) =>
    route.fulfill({ json: employee })
  )
  await page.goto(`#${path}`, { waitUntil: 'commit' })

  const row = page.locator('.el-table__body-wrapper tbody tr').filter({ hasText: 'EMP-LONG-001' })
  await expect(row).toHaveCount(1, { timeout: 90_000 })
  const employeeLink = row.getByRole('button', { name: new RegExp(employeeName) })
  await expect
    .soft(employeeLink)
    .toHaveAttribute('title', new RegExp(employeeName), { timeout: 1_000 })
  await employeeLink.press('Enter')
  const summary = page.locator('.employee-detail-page__summary')
  await expect(summary.getByRole('heading', { name: employeeName, exact: true })).toBeVisible()
  const organization = summary.locator('.el-tag').filter({ hasText: organizationName })
  const tooltip = page.getByRole('tooltip').filter({ hasText: organizationName })

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const bounds = await organization.evaluate((tag) => {
      const content = tag.querySelector('.el-tag__content')!
      const container = tag.parentElement!
      const text = document.createRange()
      text.selectNodeContents(content)
      const textRight = text.getBoundingClientRect().right
      const { left, right } = tag.getBoundingClientRect()
      const { right: contentRight } = content.getBoundingClientRect()
      const css = getComputedStyle(content)
      const visibleRight =
        css.overflowX === 'hidden' ? Math.min(contentRight, textRight) : textRight
      return {
        tagWidth: right - left,
        containerRight: container.getBoundingClientRect().right,
        tagRight: right,
        textRight,
        contentRight,
        visibleOverflow: Math.max(0, visibleRight - right),
        whiteSpace: css.whiteSpace,
        documentWidth: document.documentElement.scrollWidth
      }
    })
    console.log(JSON.stringify({ width, ...bounds }))
    expect.soft(bounds.tagRight).toBeLessThanOrEqual(bounds.containerRight + 1)
    expect.soft(bounds.visibleOverflow).toBeLessThanOrEqual(1)
    expect.soft(bounds.whiteSpace).toBe('nowrap')
    expect(bounds.documentWidth).toBe(width)
    await page.screenshot({ path: info.outputPath(`employee-detail-${width}.png`) })
  }

  await page.setViewportSize({ width: 320, height: 700 })
  await organization.focus()
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(tooltip).toBeHidden()
  if (hasTouch) {
    await organization.tap()
    await expect(tooltip).toBeVisible()
  }
  const back = page.locator('.employee-detail-page').getByRole('button', { name: /返回/ }).first()
  await back.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(row).toHaveCount(1)
})
