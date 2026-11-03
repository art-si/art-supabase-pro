import { expect, test, type Page, type Request, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const organization = (id: 'a' | 'b' | 'c', sort: number, tenant = tenantId) => ({
  id: `org-${id}`,
  tenant_id: tenant,
  parent_id: null,
  organization_code: `ORG-${id.toUpperCase()}`,
  organization_name: `组织 ${id.toUpperCase()}`,
  organization_type: 'department',
  status: '1',
  sort,
  is_system: false
})
const directory = (id: 'a' | 'b' | 'c') => ({
  positions: [
    {
      id: `position-${id}`,
      organization_id: `org-${id}`,
      position_code: `POS-${id.toUpperCase()}`,
      position_name: `${id.toUpperCase()} 岗位`,
      job_profile_id: `profile-${id}`,
      headcount_limit: 1,
      multiple_incumbents_allowed: false,
      enabled: true,
      sort: 10,
      employee_count: 1
    }
  ],
  employees: [
    {
      id: `employee-${id}`,
      organization_id: `org-${id}`,
      position_id: `position-${id}`,
      employee_no: `EMP-${id.toUpperCase()}`,
      employee_name: `${id.toUpperCase()} 员工`,
      job_title: `${id.toUpperCase()} 岗位`,
      employment_status: 'active',
      employment_type: 'full_time'
    }
  ],
  employee_total: 1,
  truncated: false
})

function requestedOrganization(request: Request): string | undefined {
  const body: unknown = request.postDataJSON()
  return body && typeof body === 'object' && 'p_organization_id' in body
    ? String(body.p_organization_id)
    : undefined
}

async function openDirectory(
  page: Page,
  handleDirectory: (route: Route) => Promise<void>,
  fixtureQuery = ''
) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({ json: [organization('b', 1), organization('a', 2)] })
  )
  await page.route('**/rest/v1/rpc/hr_get_organization_position_directory_secure', handleDirectory)
  await page.goto(
    `/tests/e2e/fixtures/hr-all-pages.html?page=personnel/organization-position${fixtureQuery}`,
    { waitUntil: 'domcontentloaded' }
  )
  const organizationCard = page.locator('.organization-position-page__organization-card')
  const positionCard = page.locator('.organization-position-page__position-card')
  const employeeCard = page.locator('.organization-position-page__employee-card')
  await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 B' })).toBeVisible({
    timeout: 90_000
  })
  await expect(positionCard.getByRole('button', { name: /B 岗位/ })).toBeVisible()
  await expect(employeeCard.getByText('B 员工', { exact: true })).toBeVisible()
  return { organizationCard, positionCard, employeeCard }
}

for (const lateOutcome of ['success', 'failure'] as const) {
  test(`组织 A 迟到${lateOutcome === 'success' ? '成功' : '失败'}不能覆盖已选组织 B`, async ({
    page
  }, info) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    let releaseA!: () => void
    const delayedA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    let markAStarted!: () => void
    const aStarted = new Promise<void>((resolve) => {
      markAStarted = resolve
    })
    let aRequests = 0
    const { organizationCard, positionCard, employeeCard } = await openDirectory(
      page,
      async (route) => {
        const id = requestedOrganization(route.request())
        if (id === 'org-a') {
          aRequests += 1
          markAStarted()
          await delayedA
          if (lateOutcome === 'failure') {
            await route.fulfill({
              status: 503,
              json: { code: 'temporary_unavailable', message: 'temporary unavailable' }
            })
            return
          }
        }
        await route.fulfill({ json: directory(id === 'org-a' ? 'a' : 'b') })
      }
    )
    await page.evaluate(() => {
      document.documentElement.dataset.hrErrorToastSeen = 'false'
      new MutationObserver(() => {
        if (document.querySelector('.el-message--error'))
          document.documentElement.dataset.hrErrorToastSeen = 'true'
      }).observe(document.body, { childList: true, subtree: true })
    })

    await organizationCard.getByRole('treeitem').filter({ hasText: '组织 A' }).click()
    await aStarted
    await organizationCard.getByRole('treeitem').filter({ hasText: '组织 B' }).click()
    await expect(positionCard.getByRole('button', { name: /B 岗位/ })).toBeVisible()
    await expect(employeeCard.getByText('B 员工', { exact: true })).toBeVisible()
    await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 B' })).toHaveClass(
      /is-current/
    )
    await page.screenshot({
      path: info.outputPath(`before-release-a-${lateOutcome}.png`),
      animations: 'disabled'
    })

    const lateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('hr_get_organization_position_directory_secure') &&
        requestedOrganization(response.request()) === 'org-a'
    )
    releaseA()
    await lateResponse
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: info.outputPath(`late-a-${lateOutcome}.png`),
      animations: 'disabled'
    })
    expect(aRequests).toBe(1)
    await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 B' })).toHaveClass(
      /is-current/
    )
    await expect(positionCard.getByRole('button', { name: /B 岗位/ })).toBeVisible()
    await expect(employeeCard.getByText('B 员工', { exact: true })).toBeVisible()
    await expect(positionCard.getByText('A 岗位', { exact: false })).toHaveCount(0)
    await expect(positionCard.getByText('组织岗位人员关系加载失败', { exact: false })).toHaveCount(
      0
    )
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-hr-error-toast-seen', 'false')
    expect(pageErrors).toEqual([])
  })
}

test('正常切换组织后岗位与员工都跟随当前组织', async ({ page }) => {
  const requests: string[] = []
  const { organizationCard, positionCard, employeeCard } = await openDirectory(
    page,
    async (route) => {
      const id = requestedOrganization(route.request())
      requests.push(id ?? '')
      await route.fulfill({ json: directory(id === 'org-a' ? 'a' : 'b') })
    }
  )
  await organizationCard.getByRole('treeitem').filter({ hasText: '组织 A' }).click()
  await expect(positionCard.getByRole('button', { name: /A 岗位/ })).toBeVisible()
  await expect(employeeCard.getByText('A 员工', { exact: true })).toBeVisible()
  await organizationCard.getByRole('treeitem').filter({ hasText: '组织 B' }).click()
  await expect(positionCard.getByRole('button', { name: /B 岗位/ })).toBeVisible()
  await expect(employeeCard.getByText('B 员工', { exact: true })).toBeVisible()
  expect(requests).toEqual(['org-b', 'org-a', 'org-b'])
})

test('同路径查询变化保留当前组织并以最新目录结果为准', async ({ page }, info) => {
  let releaseA!: () => void
  const delayedA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  let markAStarted!: () => void
  const aStarted = new Promise<void>((resolve) => {
    markAStarted = resolve
  })
  let aRequests = 0
  const freshA = directory('a')
  freshA.positions[0].position_name = 'A 新岗位'
  freshA.employees[0].employee_name = 'A 新员工'
  freshA.employees[0].job_title = 'A 新岗位'
  const { organizationCard, positionCard, employeeCard } = await openDirectory(
    page,
    async (route) => {
      const id = requestedOrganization(route.request())
      if (id === 'org-a') {
        aRequests += 1
        if (aRequests === 1) {
          markAStarted()
          await delayedA
          await route.fulfill({ json: directory('a') })
          return
        }
        await route.fulfill({ json: freshA })
        return
      }
      await route.fulfill({ json: directory('b') })
    },
    '&route-test'
  )
  try {
    await organizationCard.getByRole('textbox', { name: '搜索组织' }).fill('组织 A')
    await organizationCard.getByRole('treeitem').filter({ hasText: '组织 A' }).click()
    await aStarted
    await page.getByRole('button', { name: '切换同页查询' }).click()
    await expect(page.getByTestId('hr-route-full-path')).toContainText('race=1')
    await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 A' })).toHaveClass(
      /is-current/,
      { timeout: 15_000 }
    )
    await expect(positionCard.getByRole('button', { name: /A 新岗位/ })).toBeVisible({
      timeout: 15_000
    })
    await expect(employeeCard.getByText('A 新员工', { exact: true })).toBeVisible()
    await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 B' })).toBeHidden()
    expect(aRequests).toBe(2)
    const lateA = page.waitForResponse(
      (response) =>
        response.url().includes('hr_get_organization_position_directory_secure') &&
        requestedOrganization(response.request()) === 'org-a'
    )
    releaseA()
    await lateA
    await page.waitForLoadState('networkidle')
    await expect(positionCard.getByRole('button', { name: /A 新岗位/ })).toBeVisible()
    await expect(employeeCard.getByText('A 新员工', { exact: true })).toBeVisible()
    await expect(positionCard.getByText('A 岗位', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('query-current-a.png'), animations: 'disabled' })
    await expect(page.locator('.el-message--error')).toHaveCount(0)
  } finally {
    releaseA()
  }
})

test('当前组织目录503显示卡片错误，重试后恢复岗位与员工', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  let directoryRequests = 0
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({ json: [organization('b', 1), organization('a', 2)] })
  )
  await page.route('**/rest/v1/rpc/hr_get_organization_position_directory_secure', (route) => {
    expect(requestedOrganization(route.request())).toBe('org-b')
    directoryRequests += 1
    return route.fulfill(
      directoryRequests === 1
        ? { status: 503, json: { code: 'temporary_unavailable', message: 'temporary unavailable' } }
        : { json: directory('b') }
    )
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/hr-all-pages.html?page=personnel/organization-position&theme=${theme}`,
    { waitUntil: 'domcontentloaded' }
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)

  const positionCard = page.locator('.organization-position-page__position-card')
  const employeeCard = page.locator('.organization-position-page__employee-card')
  const errorMessage = '组织岗位人员关系加载失败，请稍后重试'
  await expect(positionCard.getByText(errorMessage, { exact: true })).toBeVisible({
    timeout: 90_000
  })
  await expect(positionCard.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await expect(employeeCard.getByText(errorMessage, { exact: true })).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  const retryBounds = await Promise.all(
    [positionCard, employeeCard].map((card) =>
      card.getByRole('button', { name: '重新加载', exact: true }).evaluate((button) => {
        const viewport = button.closest('.el-scrollbar__wrap')
        if (!viewport) throw new Error('错误态应继续使用卡片滚动区域')
        const control = button.getBoundingClientRect()
        const clip = viewport.getBoundingClientRect()
        const inset = Number.parseFloat(getComputedStyle(viewport).scrollPaddingBottom) || 0
        return {
          top: control.top,
          bottom: control.bottom,
          clipTop: clip.top,
          clipBottom: clip.bottom - inset
        }
      })
    )
  )
  await info.attach('error-retry-bounds', {
    body: JSON.stringify(retryBounds, null, 2),
    contentType: 'application/json'
  })
  for (const bounds of retryBounds) {
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.clipTop - 1)
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.clipBottom + 1)
  }
  expect(
    await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
    )
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: info.outputPath('directory-current-error.png'),
    animations: 'disabled',
    fullPage: true
  })

  await positionCard.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(positionCard.getByRole('button', { name: /B 岗位/ })).toBeVisible()
  await expect(employeeCard.getByText('B 员工', { exact: true })).toBeVisible()
  await expect(positionCard.getByText('组织岗位人员关系加载失败', { exact: false })).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(directoryRequests).toBe(2)
  expect(pageErrors).toEqual([])
  await page.screenshot({
    path: info.outputPath('directory-retry-restored.png'),
    animations: 'disabled',
    fullPage: true
  })
})

test('平台全部租户切到业务租户时迟到目录失败不覆盖新租户或弹提示', async ({ page }, info) => {
  const businessTenantId = '22222222-2222-4222-8222-222222222222'
  await prepareIsolatedSession(page)
  const unexpectedApi: string[] = []
  const writes: string[] = []
  const organizationScopes: (string | undefined)[] = []
  const directoryIds: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  let releaseA!: () => void
  const delayedA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  let markAStarted!: () => void
  const aStarted = new Promise<void>((resolve) => {
    markAStarted = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const selectedTenant = request.headers()['x-art-tenant-scope']
    if (
      ['PATCH', 'PUT', 'DELETE'].includes(request.method()) ||
      (request.method() === 'POST' && !url.pathname.includes('/rpc/'))
    )
      writes.push(`${request.method()} ${url.pathname}`)
    if (url.pathname.endsWith('/mdm_organization')) {
      organizationScopes.push(selectedTenant)
      const filter = url.searchParams.get('tenant_id')
      if (selectedTenant === businessTenantId) {
        // Platform reads use the authenticated scope header after URL normalization.
        expect(filter).toBeNull()
        return route.fulfill({ json: [organization('c', 1, businessTenantId)] })
      }
      expect(selectedTenant).toBeUndefined()
      expect(filter).toBeNull()
      return route.fulfill({ json: [organization('b', 1), organization('a', 2)] })
    }
    if (url.pathname.endsWith('/rpc/hr_get_organization_position_directory_secure')) {
      const id = requestedOrganization(request)
      directoryIds.push(id ?? '')
      if (id === 'org-a') {
        expect(selectedTenant).toBeUndefined()
        markAStarted()
        await delayedA
        return route.fulfill({
          status: 503,
          json: { code: 'temporary_unavailable', message: 'temporary unavailable' }
        })
      }
      if (id === 'org-c') {
        expect(selectedTenant).toBe(businessTenantId)
        return route.fulfill({ json: directory('c') })
      }
      expect(id).toBe('org-b')
      expect(selectedTenant).toBeUndefined()
      return route.fulfill({ json: directory('b') })
    }
    if (url.pathname.endsWith('/sys_dictionary')) return route.fulfill({ json: [] })
    unexpectedApi.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 503, json: { code: 'unexpected_api' } })
  })
  await page.route('**/functions/v1/**', (route) => {
    unexpectedApi.push(`function ${new URL(route.request().url()).pathname}`)
    return route.fulfill({ status: 503, json: { code: 'unexpected_function' } })
  })
  await page.goto(
    '/tests/e2e/fixtures/hr-all-pages.html?page=personnel/organization-position&scope-test',
    {
      waitUntil: 'domcontentloaded'
    }
  )
  const organizationCard = page.locator('.organization-position-page__organization-card')
  const positionCard = page.locator('.organization-position-page__position-card')
  const employeeCard = page.locator('.organization-position-page__employee-card')
  await expect(positionCard.getByRole('button', { name: /B 岗位/ })).toBeVisible({
    timeout: 90_000
  })
  await page.evaluate(() => {
    document.documentElement.dataset.hrErrorToastSeen = 'false'
    new MutationObserver(() => {
      if (document.querySelector('.el-message--error'))
        document.documentElement.dataset.hrErrorToastSeen = 'true'
    }).observe(document.body, { childList: true, subtree: true })
  })
  await organizationCard.getByRole('treeitem').filter({ hasText: '组织 A' }).click()
  await aStarted
  await page.getByRole('button', { name: '切换业务租户' }).click()
  await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 C' })).toHaveClass(
    /is-current/
  )
  await expect(positionCard.getByRole('button', { name: /C 岗位/ })).toBeVisible()
  await expect(employeeCard.getByText('C 员工', { exact: true })).toBeVisible()
  const lateA = page.waitForResponse(
    (response) =>
      response.url().includes('hr_get_organization_position_directory_secure') &&
      requestedOrganization(response.request()) === 'org-a'
  )
  releaseA()
  await lateA
  await page.waitForLoadState('networkidle')
  await expect(organizationCard.getByRole('treeitem').filter({ hasText: '组织 C' })).toHaveClass(
    /is-current/
  )
  await expect(positionCard.getByRole('button', { name: /C 岗位/ })).toBeVisible()
  await expect(employeeCard.getByText('C 员工', { exact: true })).toBeVisible()
  await expect(positionCard.getByText('组织岗位人员关系加载失败', { exact: false })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-hr-error-toast-seen', 'false')
  expect(unexpectedApi).toEqual([])
  expect(writes).toEqual([])
  expect(organizationScopes).toEqual([undefined, businessTenantId])
  expect(directoryIds).toEqual(['org-b', 'org-a', 'org-c'])
  expect(pageErrors).toEqual([])
  await page.screenshot({ path: info.outputPath('scope-selected-c.png'), animations: 'disabled' })
})
