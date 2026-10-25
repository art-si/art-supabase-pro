import { expect, test, type Page, type Request } from '@playwright/test'
import { readDemoCredentials } from './support/demo-credentials'

interface RequestTiming {
  method: string
  url: string
  startedAt: number
  finishedAt?: number
  failure?: string | null
}

const roleComponentAssetPattern =
  /(?:\/src\/views\/system\/role\/index\.vue|\/assets\/role-[^/]+\.js)(?:\?.*)?$/

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'no-preference' })

async function logInFromNewBrowser(
  page: Page,
  alreadyOnLogin = false,
  dashboardTimeout = 90_000
): Promise<number> {
  const credentials = readDemoCredentials()
  if (!alreadyOnLogin) await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /^欢迎使用/ })).toBeVisible({
    timeout: 30_000
  })
  await page.getByRole('textbox', { name: '邮箱或手机号' }).fill(credentials.email)
  await page.locator('input[name="password"]').fill(credentials.password)

  const loginStartedAt = Date.now()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/dashboard\/console$/, { timeout: dashboardTimeout })
  await expect(page.getByRole('heading', { name: '今日运营概览' })).toBeVisible({
    timeout: dashboardTimeout
  })
  return Date.now() - loginStartedAt
}

test('全新浏览器首次登录后可以立即切换到另一个菜单', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const requestTimings = new Map<Request, RequestTiming>()
  const pageErrors: string[] = []
  const hostedApplicationRequests: string[] = []
  const roleComponentRequests: string[] = []

  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (roleComponentAssetPattern.test(request.url())) {
      roleComponentRequests.push(request.url())
    }
    if (/bootstrap-hosted-applications(?:-|\.ts)/.test(pathname)) {
      hostedApplicationRequests.push(request.url())
    }
    if (!request.url().includes('supabase.co')) return
    requestTimings.set(request, {
      method: request.method(),
      url: request.url(),
      startedAt: Date.now()
    })
  })
  page.on('requestfinished', (request) => {
    const timing = requestTimings.get(request)
    if (timing) timing.finishedAt = Date.now()
  })
  page.on('requestfailed', (request) => {
    const timing = requestTimings.get(request)
    if (!timing) return
    timing.finishedAt = Date.now()
    timing.failure = request.failure()?.errorText
  })

  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  expect(hostedApplicationRequests).toEqual([])
  const loginToDashboardMs = await logInFromNewBrowser(page, true)
  expect(hostedApplicationRequests.length).toBeGreaterThan(0)

  await page.getByRole('menuitem', { name: '系统管理', exact: true }).click()
  const targetMenu = page.locator('.el-menu-item').filter({ hasText: '角色管理' }).first()
  await expect(targetMenu).toBeVisible({ timeout: 30_000 })
  expect(roleComponentRequests).toEqual([])
  const navigationStartedAt = Date.now()
  await targetMenu.click()
  await expect(page).toHaveURL(/#\/system\/role$/, { timeout: 90_000 })
  await expect(page.getByRole('heading', { name: '角色与权限', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await expect(page.getByRole('heading', { name: '今日运营概览' })).toBeHidden()
  await expect(page.getByRole('tab', { name: '角色管理' })).toHaveAttribute('aria-selected', 'true')
  expect(roleComponentRequests.length).toBeGreaterThan(0)
  const targetReadyAt = Date.now()
  await expect(page.getByText('正在加载表格数据…')).toBeHidden({ timeout: 30_000 })
  const guideDismiss = page.getByText('知道了', { exact: true })
  if (await guideDismiss.isVisible()) await guideDismiss.click()
  await page.screenshot({ path: testInfo.outputPath('role-navigation.png') })

  const slowRequests = [...requestTimings.values()]
    .filter((timing) => timing.finishedAt)
    .map((timing) => ({
      method: timing.method,
      pathname: new URL(timing.url).pathname,
      durationMs: timing.finishedAt! - timing.startedAt,
      failure: timing.failure
    }))
    .filter((timing) => timing.durationMs >= 500)
    .sort((left, right) => right.durationMs - left.durationMs)

  console.info(
    JSON.stringify(
      {
        loginToDashboardMs,
        firstMenuNavigationMs: targetReadyAt - navigationStartedAt,
        slowRequests
      },
      null,
      2
    )
  )

  expect(pageErrors).toEqual([])
})

test('无痕首次访问多个业务模块的菜单时地址、标签和页面保持一致', async ({ page }) => {
  test.setTimeout(300_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await logInFromNewBrowser(page)

  const targets = [
    {
      parents: ['MDM主数据', '物料主数据'],
      leaf: '物料编码',
      application: 'mdm',
      view: '.material-archive-page'
    },
    {
      parents: ['TMS智慧运输', '运单管理'],
      leaf: '运单列表',
      application: 'tms',
      view: '.order-list'
    },
    {
      parents: ['WMS仓储管理'],
      leaf: '仓储工作台',
      application: 'wms',
      view: '.business-workspace-page',
      heading: '仓储运营工作台'
    },
    {
      parents: ['MES制造执行'],
      leaf: '制造工作台',
      application: 'mes',
      view: '.mes-workbench'
    }
  ] as const

  for (const target of targets) {
    for (const parentName of target.parents) {
      await page
        .locator('#app-sidebar')
        .getByRole('menuitem', { name: parentName, exact: true })
        .click()
    }
    const navigationStartedAt = Date.now()
    await page
      .locator('#app-sidebar')
      .getByRole('menuitem', { name: target.leaf, exact: true })
      .click()

    await expect(page).toHaveURL(new RegExp(`#/${target.application}/`), { timeout: 90_000 })
    await expect(page.locator(target.view)).toBeVisible({ timeout: 90_000 })
    if ('heading' in target) {
      await expect(page.getByRole('heading', { name: target.heading, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: '今日运营概览' })).toBeHidden()
    await expect(page.getByRole('tab', { name: target.leaf })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    console.info(
      `首次打开 ${target.parents[0]} → ${target.leaf}: ${new URL(page.url()).hash}，${Date.now() - navigationStartedAt}ms`
    )
  }

  expect(pageErrors).toEqual([])
})

test('首次打开角色管理时组件请求失败会自动重试并落到正确页面', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await logInFromNewBrowser(page)
  await page.getByRole('menuitem', { name: '系统管理', exact: true }).click()

  let failedFirstRequest = false
  let recoveryDocumentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      recoveryDocumentRequests += 1
    }
  })
  await page.route(roleComponentAssetPattern, async (route) => {
    if (!failedFirstRequest) {
      failedFirstRequest = true
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  const targetMenu = page.locator('.el-menu-item').filter({ hasText: '角色管理' }).first()
  await expect(targetMenu).toBeVisible()
  await targetMenu.evaluate((element: HTMLElement) => element.click())

  await expect(page).toHaveURL(/#\/system\/role$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: '角色与权限', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await expect(page.getByRole('heading', { name: '今日运营概览' })).toBeHidden()
  await expect(page.getByRole('tab', { name: '角色管理' })).toHaveAttribute('aria-selected', 'true')
  expect(failedFirstRequest).toBe(true)
  expect(recoveryDocumentRequests).toBeGreaterThan(0)
  expect(new URL(page.url()).searchParams.has('__route_reload')).toBe(false)
  expect(pageErrors).toEqual([])
})

test('工程报价规则在销售报价单录入，项目报价页不再提供独立配置', async ({ page }) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    '工程报价页面需具备 SCM 权限的 E2E_EMAIL / E2E_PASSWORD；默认演示账号无权访问'
  )
  test.setTimeout(300_000)
  await logInFromNewBrowser(page, false, 240_000)

  await page.goto('#/scm/sales-quotation/sales-quotation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '销售报价单', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await page.getByRole('button', { name: '新增销售报价单' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('报价场景', { exact: true })).toBeVisible()
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '报价场景' })
    .locator('.el-select')
    .click()
  await page.getByRole('option', { name: '项目工程报价' }).click()
  await expect(dialog.getByText('工程报价联动', { exact: true })).toBeVisible()
  await expect(dialog.getByText('施工号', { exact: true })).toBeVisible()
  await expect(dialog.getByText('自动创建项目', { exact: true })).toBeVisible()
  await expect(dialog.getByText('自动创建物料', { exact: true })).toBeVisible()
  await expect(dialog.getByText('自动搭建 BOM', { exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/playwright/sales-quotation-engineering-form.png' })

  await page.keyboard.press('Escape')
  await page.goto('#/scm/sales-quotation/project-quotation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '项目报价', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await expect(page.getByRole('button', { name: '项目工程报价配置' })).toHaveCount(0)
})
