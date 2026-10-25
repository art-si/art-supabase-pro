import { keysToCamelDeep } from '../../src/utils/supabase/key-transform'
import { fetchAllRangePages } from '../../src/utils/supabase/pagination'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test as setup } from '@playwright/test'
import { loadEnv } from 'vite'
import { readDemoCredentials } from './support/demo-credentials'

const authFile = path.resolve(
  process.env.E2E_AUTH_STATE_FILE || path.join(process.cwd(), 'playwright', '.auth', 'user.json')
)
if (spawnSync('git', ['check-ignore', '-q', authFile], { windowsHide: true }).status !== 0)
  throw new Error('认证测试会话必须保存在 Git 忽略路径中')
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version as string

setup('登录并保存视觉回归会话', async ({ page }) => {
  setup.setTimeout(90_000)
  await mkdir(path.dirname(authFile), { recursive: true })

  const env = loadEnv('development', process.cwd(), '')
  const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_KEY')
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  })
  const { data, error } = await authClient.auth.signInWithPassword(readDemoCredentials())
  expect(error?.message, 'Supabase 测试账号登录失败').toBeUndefined()
  expect(data.session, 'Supabase 未返回测试会话').toBeTruthy()

  const session = data.session!
  const { data: identity, error: identityError } = await authClient.auth.getUser(
    session.access_token
  )
  expect(identityError, '服务器登录身份校验失败').toBeNull()
  expect(identity.user?.id, '登录会话与服务器身份不一致').toBe(session.user.id)
  const [{ data: userData, error: userError }, { data: dictionaryData, error: dictionaryError }] =
    await Promise.all([
      authClient
        .from('sys_user')
        .select('*, tenant:sys_tenant!sys_user_tenant_id_fkey(tenant_code, tenant_name)')
        .eq('auth_user_id', session.user.id)
        .single(),
      fetchAllRangePages(async ({ from, to }) => {
        const { data, error } = await authClient
          .from('sys_dictionary')
          .select(
            'id,type_id,code,label,value,sort,color,tag_type,remark,parent_id,cascade_parent_id,dict_type_table:sys_dict_type!inner(code,name)'
          )
          .eq('status', '1')
          .eq('dict_type_table.status', '1')
          .order('sort', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
        return { data, error }
      })
    ])
  expect(userError?.message, 'Supabase 测试账号资料加载失败').toBeUndefined()
  expect(dictionaryError, 'Supabase 测试字典加载失败').toBeNull()

  const camelUser = keysToCamelDeep(userData) as Record<string, unknown>
  const expectedTenantCode = process.env.E2E_EXPECTED_TENANT_CODE
  const tenant = camelUser.tenant
  if (
    expectedTenantCode &&
    (!tenant ||
      typeof tenant !== 'object' ||
      !('tenantCode' in tenant) ||
      tenant.tenantCode !== expectedTenantCode)
  )
    throw new Error('登录账号不属于指定验收租户，禁止继续真实数据测试')
  const { id: userId, userEmail: email, ...userInfo } = camelUser
  const dictionaryMap = Object.groupBy(
    keysToCamelDeep(dictionaryData) as Array<{
      dictTypeTable: { code: string }
      sort: number
    }>,
    (item) => item.dictTypeTable.code
  )
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  await page.addInitScript(
    ({
      appVersion,
      storageKey,
      userStoreKey,
      sessionData,
      hydratedUserInfo,
      hydratedDictionaryMap
    }) => {
      localStorage.setItem('sys-version', appVersion)
      localStorage.setItem(storageKey, JSON.stringify(sessionData))
      localStorage.setItem(
        userStoreKey,
        JSON.stringify({
          accessToken: sessionData.access_token,
          dictMap: hydratedDictionaryMap,
          info: hydratedUserInfo,
          isLogin: true,
          refreshToken: sessionData.refresh_token
        })
      )

      for (const key of Object.keys(localStorage)) {
        if (!/^sys-v.+-setting$/.test(key)) continue
        const setting = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
        localStorage.setItem(
          key,
          JSON.stringify({
            ...setting,
            pageTransition: '',
            showSettingGuide: false
          })
        )
      }
    },
    {
      appVersion: env.VITE_VERSION || packageVersion,
      storageKey: `sb-${projectRef}-auth-token`,
      userStoreKey: `sys-v${env.VITE_VERSION || packageVersion}-user`,
      sessionData: session,
      hydratedUserInfo: { userId, email, ...userInfo },
      hydratedDictionaryMap: dictionaryMap
    }
  )

  const landingPath = process.env.E2E_LANDING_PATH || '/dashboard/console'
  await page.goto(`#${landingPath}`, { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/(?:auth\/)?login/, { timeout: 30_000 })
  if (process.env.E2E_LANDING_HEADING)
    await expect(
      page.getByRole('heading', { name: process.env.E2E_LANDING_HEADING, exact: true })
    ).toBeVisible({ timeout: 60_000 })
  else await expect(page.locator('.operations-dashboard').first()).toBeVisible({ timeout: 60_000 })
  await page.context().storageState({ path: authFile })
})
