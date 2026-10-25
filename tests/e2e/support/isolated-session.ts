import type { Page } from '@playwright/test'
import { loadEnv } from 'vite'

const appVersion = loadEnv('e2e', process.cwd(), '').VITE_VERSION

/** 隔离测试身份与后台读取；调用方随后注册自己的业务接口。 */
export async function prepareIsolatedSession(page: Page) {
  await page.addInitScript((version) => {
    const now = Math.floor(Date.now() / 1000)
    const user = { id: 'permission-test-auth', aud: 'authenticated', role: 'authenticated' }
    const encode = (value: object) =>
      btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    // HS256 sends identity verification to the mocked /auth/v1/user endpoint.
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: user.id,
      aud: user.aud,
      role: user.role,
      iat: now,
      exp: now + 3600
    })}.test-signature`
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: token,
        refresh_token: 'isolated-permission-test',
        token_type: 'bearer',
        expires_at: now + 3600,
        expires_in: 3600,
        user
      })
    )
    localStorage.setItem('sys-version', version)
    localStorage.setItem(
      `sys-v${version}-user`,
      JSON.stringify({
        accessToken: token,
        refreshToken: 'isolated-permission-test',
        isLogin: true,
        dictMap: {},
        info: { userId: 'permission-test-user', email: 'test@example.invalid' }
      })
    )
  }, appVersion)
  // 使用合成身份隔离网络延迟；真实认证与权限边界由独立集成测试验证。
  const tenant = { id: 'permission-test-tenant', tenant_code: 'test', tenant_name: '测试租户' }
  // 默认拦截外壳后台读取，业务测试随后注册更具体的响应。
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_param?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'permission-test-user',
        user_name: '测试用户',
        user_email: 'test@example.invalid',
        status: '1',
        tenant_id: tenant.id,
        tenant
      }
    })
  )
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: {
        id: 'permission-test-auth',
        aud: 'authenticated',
        role: 'authenticated'
      }
    })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/sys_tenant?*', (route) => route.fulfill({ json: [tenant] }))
  await page.route('**/rest/v1/rpc/get_organization_list_secure', (route) =>
    route.fulfill({ json: [] })
  )
  return tenant
}
