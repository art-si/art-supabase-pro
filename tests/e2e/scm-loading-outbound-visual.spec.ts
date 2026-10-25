import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'

test('装车出库沿用销售单据查询表格风格', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const state = JSON.parse(readFileSync('playwright/.auth/user.json', 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[]
  }
  await page.addInitScript(
    (entries) => {
      for (const entry of entries) localStorage.setItem(entry.name, entry.value)
      for (const key of Object.keys(localStorage)) {
        if (!/^sb-.*-auth-token$/.test(key)) continue
        const session = JSON.parse(localStorage.getItem(key) || '{}')
        session.expires_at = Math.floor(Date.now() / 1000) + 3600
        session.expires_in = 3600
        const [header, payload, signature] = String(session.access_token || '').split('.')
        if (header && payload && signature) {
          const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
          claims.iat = Math.floor(Date.now() / 1000)
          claims.exp = claims.iat + 3600
          const freshPayload = btoa(JSON.stringify(claims))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
          session.access_token = `${header}.${freshPayload}.${signature}`
        }
        localStorage.setItem(key, JSON.stringify(session))
      }
    },
    state.origins.flatMap((origin) => origin.localStorage)
  )

  const tenant = { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
  const meta = (title: string) => ({ title, roles: ['R_SUPER'], is_enable: true, is_hide: false })
  const root = {
    id: 'scm-outbound-root',
    parentId: null,
    name: 'ScmSupplyChainManagement',
    path: '/scm',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('SCM供应链管理')
  }
  const folder = {
    id: 'scm-outbound-folder',
    parentId: root.id,
    name: 'ScmSalesManagement',
    path: 'sales-management',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('销售管理')
  }
  const menu = {
    id: 'scm-outbound-menu',
    parentId: folder.id,
    name: 'ScmLoadingOutbound',
    path: 'loading-outbound',
    component: '/scm/sales-management/loading-outbound',
    type: 'menu',
    sort: 1,
    meta: meta('装车出库')
  }
  const buttons = ['View', 'Issue'].map((action) => ({
    id: `scm-outbound-${action}`,
    parentId: menu.id,
    name: `ScmLoadingOutbound:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action)
  }))

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: {
        id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        aud: 'authenticated',
        role: 'authenticated'
      }
    })
  )
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'scm-test-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '测试用户',
        user_email: 'scm@example.invalid',
        user_type: '1',
        user_roles: ['R_SUPER'],
        status: '1',
        tenant_id: tenantId,
        tenant
      }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) => route.fulfill({ json: [tenant] }))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '测试平台', baseUrl: '/' },
        { code: 'scm', name: 'SCM供应链管理', baseUrl: '/scm/' }
      ]
    })
  )
  await mockApplicationMenus(page, { scm: [root, folder, menu, ...buttons] })
  let failRows = false
  await page.route('**/rest/v1/scm_sales_document?*', (route) =>
    failRows
      ? route.fulfill({ status: 500, json: { message: 'temporary test failure' } })
      : route.fulfill({ headers: { 'content-range': '*/0' }, json: [] })
  )

  await page.goto('#/scm/sales-management/loading-outbound', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '装车出库', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await expect(page.locator('.art-table-query')).toHaveCount(1)
  await expect(page.getByText('暂无符合条件的装车明细')).toBeVisible()
  await expect(page.getByText('组合查询', { exact: true })).toHaveCount(0)
  await expect(page.getByText('装车出库清单', { exact: true })).toHaveCount(0)
  const focusToggle = page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
  await expect(focusToggle).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true)

  const visualDir = join(process.cwd(), '.artifacts', 'scm-outbound-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  const themeTip = page.getByRole('button', { name: '知道了' })
  if (await themeTip.isVisible()) await themeTip.click()
  await page.screenshot({ path: join(visualDir, 'empty-list.png'), fullPage: true })

  await focusToggle.click()
  await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
  await expect(page.getByText('暂无符合条件的装车明细')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.art-table-query')).not.toHaveClass(/is-focus-mode/)

  const toolbarToggle = page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '显示工具栏' })
    .locator('.el-switch')
  await toolbarToggle.click()
  failRows = true
  await page.getByRole('button', { name: '刷新表格' }).click()
  await expect(page.getByText('数据加载失败')).toBeVisible()
  failRows = false
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('数据加载失败')).toHaveCount(0)
  await expect(page.getByText('暂无符合条件的装车明细')).toBeVisible()
})
