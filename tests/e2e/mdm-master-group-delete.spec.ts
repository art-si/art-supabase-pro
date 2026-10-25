import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

for (const feature of [
  {
    name: '供应商',
    menu: 'MdmPurchaseSupplier',
    path: '/mdm/purchase-master/supplier',
    domain: 'supplier',
    table: 'mdm_supplier',
    placeholder: '编码、名称、联系人或地址',
    action: '查看供应商'
  },
  {
    name: '工艺路线',
    menu: 'MdmProcessRoute',
    path: '/mdm/process-master/process-route',
    domain: 'process-route',
    table: 'mdm_process_route',
    placeholder: '编码 / 名称 / 版本 / 路径',
    action: '查看路线'
  },
  {
    name: '项目',
    menu: 'MdmSalesProject',
    path: '/mdm/sales-master/project',
    domain: 'project',
    table: 'mdm_project',
    placeholder: '编码、名称或业务说明',
    action: '查看项目'
  },
  {
    name: '客户',
    menu: 'MdmSalesCustomer',
    path: '/mdm/sales-master/customer',
    domain: 'customer',
    table: 'mdm_customer',
    placeholder: '编码、名称或业务说明',
    action: '查看客户'
  },
  {
    name: '工序',
    menu: 'MdmOperationSet',
    path: '/mdm/process-master/operation',
    domain: 'operation',
    table: 'mdm_operation',
    placeholder: '编码、名称或业务说明',
    action: '查看工序'
  }
]) {
  for (const state of [
    'referenced',
    'child',
    'failed',
    'concurrent',
    'clear',
    'zero',
    'cancel',
    'missing',
    'permission',
    'scope'
  ]) {
    test(`${feature.name}分组删除 ${state}`, async ({ page }, info) => {
      const tenant = await prepareIsolatedSession(page)
      const id = '11111111-1111-4111-8111-111111111101'
      const childId = '11111111-1111-4111-8111-111111111102'
      if (state === 'child') await page.setViewportSize({ width: 1280, height: 900 })
      const events: string[] = []
      let deleted = false
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      const menu = {
        id: 'supplier-menu',
        parentId: null,
        name: feature.menu,
        path: feature.path,
        component: feature.path,
        type: 'menu',
        sort: 1,
        meta: { title: '供应商', is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({ json: [{ code: 'mdm', name: '测试主数据', baseUrl: '/mdm/' }] })
      )
      await mockApplicationMenus(page, {
        mdm: [
          menu,
          ...['View', 'ManageGroup'].map((action) => ({
            ...menu,
            id: `${menu.id}-${action}`,
            parentId: menu.id,
            name: `${menu.name}:${action}`,
            path: '',
            component: '',
            type: 'button'
          }))
        ]
      })
      await page.route('**/rest/v1/mdm_master_group?*', (route) => {
        if (route.request().method() === 'DELETE') {
          events.push('delete')
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${id}`)
          if (state === 'concurrent')
            return route.fulfill({
              status: 409,
              json: { code: '23503', message: '分组仍有供应商引用' }
            })
          deleted = state === 'clear'
          return route.fulfill({
            headers: {
              'content-range': state === 'missing' ? '*' : `*/${deleted ? 1 : 0}`,
              'access-control-expose-headers': 'content-range'
            },
            json: deleted ? [{ id }] : []
          })
        }
        return route.fulfill({
          headers: {
            'content-range': `*/${deleted ? 0 : state === 'child' ? 2 : 1}`,
            'access-control-expose-headers': 'content-range'
          },
          json: deleted
            ? []
            : [
                {
                  id,
                  tenant_id: tenant.id,
                  domain: feature.domain,
                  name: '测试供应商分组',
                  code: 'GROUP-001',
                  enabled: true,
                  sort: 0
                },
                ...(state === 'child'
                  ? [
                      {
                        id: childId,
                        parent_id: id,
                        tenant_id: tenant.id,
                        domain: feature.domain,
                        name: '下级供应商分组',
                        code: 'CHILD-001',
                        enabled: true,
                        sort: 0
                      }
                    ]
                  : [])
              ]
        })
      })
      await page.route(`**/rest/v1/${feature.table}?*`, (route) =>
        route.fulfill({
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
          json: []
        })
      )
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details*', (route) => {
        events.push('inspect')
        expect(route.request().postDataJSON()).toMatchObject({
          p_table: 'mdm_master_group',
          p_ids: [id]
        })
        if (state === 'failed' && events.length === 1)
          return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test' } })
        return route.fulfill({
          json:
            state === 'referenced' ||
            state === 'child' ||
            (state === 'concurrent' && events.includes('delete'))
              ? [
                  {
                    resource_id: id,
                    source_table: state === 'child' ? 'mdm_master_group' : feature.table,
                    record_id: state === 'child' ? childId : 'supplier-ref',
                    target_id: state === 'child' ? childId : 'supplier-ref',
                    record_no: state === 'child' ? 'CHILD-001' : 'SUP-001',
                    record_summary: state === 'child' ? '下级供应商分组' : '关联供应商',
                    record_status: 'enabled',
                    created_at: '2026-10-01'
                  }
                ]
              : []
        })
      })
      await page.goto(`#${feature.path}`)
      const node = page
        .locator('.master-group-panel .el-tree-node__content')
        .filter({ hasText: 'GROUP-001' })
      await expect(node).toBeVisible({ timeout: 60_000 })
      if (state === 'child') {
        await node.locator('.el-tree-node__expand-icon').click()
        await expect(page.getByText('下级供应商分组', { exact: true })).toBeHidden()
      }
      await expect(node.getByRole('button', { name: '删除分组', exact: true })).toHaveCount(0)
      await node.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '删除分组', exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
      if (['referenced', 'child', 'failed'].includes(state)) {
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(confirmation).toHaveCount(0)
        expect(events).toEqual(['inspect'])
        if (state === 'referenced' || state === 'child') {
          await expect(dialog).toContainText(state === 'child' ? 'CHILD-001' : 'SUP-001')
          await dialog.screenshot({ path: info.outputPath('references.png') })
          await dialog
            .getByRole('button', {
              name: state === 'child' ? '查看分组' : feature.action,
              exact: true
            })
            .click()
          if (state === 'child') {
            const target = page
              .locator('.master-group-panel .el-tree-node.is-current')
              .filter({ hasText: 'CHILD-001' })
            await expect(target).toBeVisible()
            await expect(page).toHaveURL(new RegExp(`recordId=${childId}`))
            await page
              .locator('.master-group-panel')
              .screenshot({ path: info.outputPath('located-group.png') })
          } else await expect(page.getByPlaceholder(feature.placeholder)).toHaveValue('SUP-001')
        } else {
          await expect(dialog).toHaveAccessibleName('删除检查未完成')
          await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
          await expect(page.getByText('关联已解除，请再次点击删除', { exact: true })).toBeVisible()
          expect(events).toEqual(['inspect', 'inspect'])
          await expect(confirmation).toHaveCount(0)
          await node.getByRole('button', { name: '更多操作', exact: true }).click()
          await page.getByRole('menuitem', { name: '删除分组', exact: true }).click()
          await expect(confirmation).toBeVisible()
          expect(events).toEqual(['inspect', 'inspect', 'inspect'])
          await confirmation.getByRole('button', { name: '取消', exact: true }).click()
          expect(events).not.toContain('delete')
        }
        return
      }
      await expect(confirmation).toBeVisible()
      expect(events).toEqual(['inspect'])
      if (state === 'permission') {
        await page.evaluate(async (permission) => {
          const modulePath = '/src/store/modules/menu.ts'
          const { useMenuStore } = await import(/* @vite-ignore */ modulePath)
          const menuStore = useMenuStore()
          menuStore.setButtonList(
            menuStore.buttonList.filter((item: { name?: string }) => item.name !== permission)
          )
        }, `${feature.menu}:ManageGroup`)
      }
      if (state === 'scope')
        await page.evaluate(() => {
          sessionStorage.setItem('art-platform-tenant-scope-active', '1')
          sessionStorage.setItem(
            'art-platform-tenant-scope-id',
            '22222222-2222-4222-8222-222222222222'
          )
        })
      await confirmation
        .getByRole('button', { name: state === 'cancel' ? '取消' : '删除', exact: true })
        .click()
      if (state === 'cancel') {
        expect(events).toEqual(['inspect'])
        return
      }
      if (state === 'permission' || state === 'scope') {
        await expect(
          page.getByText(
            state === 'permission'
              ? '删除权限已变化，请刷新页面后重试'
              : '租户范围已变化，请刷新后重试',
            { exact: true }
          )
        ).toBeVisible()
        expect(events).toEqual(['inspect'])
        return
      }
      if (state === 'concurrent') {
        await expect(page.getByRole('dialog')).toContainText('SUP-001')
        await expect(page.getByRole('dialog')).toHaveCount(1)
        expect(events).toEqual(['inspect', 'delete', 'inspect'])
      } else if (state === 'clear') {
        await expect(page.getByText(`${feature.name}分组已删除`, { exact: true })).toBeVisible()
        await expect(node).toHaveCount(0)
        expect(events).toEqual(['inspect', 'delete'])
      } else {
        await expect(page.locator('.el-message--error')).toBeVisible()
        await expect(page.getByText(`${feature.name}分组已删除`, { exact: true })).toHaveCount(0)
        expect(events).toEqual(['inspect', 'delete', 'inspect'])
      }
    })
  }
}
