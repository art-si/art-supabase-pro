import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'

async function installFixtures(page: import('@playwright/test').Page): Promise<void> {
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
          session.access_token = `${header}.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${signature}`
        }
        localStorage.setItem(key, JSON.stringify(session))
      }
    },
    state.origins.flatMap((origin) => origin.localStorage)
  )

  const menu = {
    id: 'test-mes-root',
    parentId: null,
    name: 'MesRoot',
    path: '/mes',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: { title: 'MES制造执行', roles: ['R_SUPER'], is_enable: true },
    children: [
      {
        id: 'test-mes-plan',
        parentId: 'test-mes-root',
        name: 'MesProductionPlan',
        path: 'production-plan',
        component: '',
        type: 'folder',
        sort: 1,
        meta: { title: '生产计划', roles: ['R_SUPER'], is_enable: true },
        children: [
          {
            id: 'test-mes-work-order',
            parentId: 'test-mes-plan',
            name: 'MesWorkOrder',
            path: 'work-order',
            component: '/mes/production-plan/work-order',
            type: 'menu',
            sort: 1,
            meta: { title: '生产工单', roles: ['R_SUPER'], is_enable: true },
            children: []
          }
        ]
      }
    ]
  }
  const flat = [
    { ...menu, children: undefined },
    { ...menu.children[0], children: undefined },
    menu.children[0].children[0]
  ]
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ json: { id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a', role: 'authenticated' } })
  )
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'mes-test-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '测试用户',
        user_type: '1',
        user_roles: ['R_SUPER'],
        status: '1',
        tenant_id: tenantId,
        tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
      }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({ json: [{ id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }] })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'mes', name: 'MES制造执行', baseUrl: '/mes/' }] })
  )
  await mockApplicationMenus(page, { mes: flat })
  await page.route('**/rest/v1/rpc/mes_work_order_material_options', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: '53c25e5e-7c44-4adb-80d5-96127d774c0d',
            tenantId,
            categoryId: 'test-category',
            materialCode: 'C00-0030',
            materialName: '1000*50新型聚氨酯墙面板',
            code: 'C00-0030',
            name: '1000*50新型聚氨酯墙面板',
            materialType: 'FERT',
            inboundWarehouseName: ''
          }
        ],
        total: 1
      }
    })
  )
}

test('成品工单在缺少可用成品仓时给出配置提示', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  await page.goto('#/mes/production-plan/work-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '生产工单', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.getByRole('button', { name: '新增工单' }).click()
  await expect(page.getByRole('combobox', { name: /所属租户/ })).toHaveCount(0)
  await page.getByPlaceholder('请选择物料描述').click()
  await page.getByText('1000*50新型聚氨酯墙面板', { exact: true }).first().click()
  await page.getByRole('button', { name: '确定', exact: true }).last().click()
  await expect(page.getByText('暂无可用成品仓；请先启用成品仓并设置业务应用范围。')).toBeVisible()
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({
    path: join(visualDir, 'mes-finished-warehouse-prompt.png'),
    fullPage: true
  })
})
