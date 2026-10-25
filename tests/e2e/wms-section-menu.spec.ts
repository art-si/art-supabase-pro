import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
for (const manage of [false, true]) {
  test(`施工号普通${manage ? '维护' : '查看'}权限菜单入口`, async ({ page }, testInfo) => {
    await installFixtures(page)
    await page.route('**/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/sys_user?*', (route) =>
      route.fulfill({
        json: {
          id: 'section-user',
          auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
          user_name: '施工号用户',
          user_type: '2',
          user_roles: ['R_USER'],
          status: '1',
          tenant_id: tenantId,
          tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
        }
      })
    )
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    await mockApplicationMenus(page, {
      wms: [
        {
          id: 'section-menu',
          parentId: null,
          name: 'WmsProjectSection',
          path: '/wms/project-warehouse/project-section',
          component: '/wms/project-warehouse/project-section',
          type: 'menu',
          sort: 1,
          meta: meta('项目施工号')
        },
        ...['View', ...(manage ? ['Manage'] : [])].map((action) => ({
          id: `section-${action}`,
          parentId: 'section-menu',
          name: `WmsProjectSection:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
      ]
    })
    let projectFailed = true
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/mdm_project?*', async (route) => {
      await pending
      return route.fulfill(
        projectFailed
          ? { status: 400, json: { code: 'P0001', message: '测试项目读取失败' } }
          : {
              json: [
                {
                  id: 'section-project',
                  tenant_id: tenantId,
                  project_code: 'PROJ-TEST',
                  project_name: '施工号测试项目',
                  project_status: 'active',
                  enabled: true
                },
                {
                  id: 'section-project-second',
                  tenant_id: tenantId,
                  project_code: 'PROJ-SECOND',
                  project_name: '第二施工项目',
                  project_status: 'active',
                  enabled: true
                }
              ]
            }
      )
    })
    let sectionStatus = 'active'
    let sectionName = '原施工分项'
    await page.route('**/rest/v1/sys_dictionary?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'section-active',
            label: '在用',
            value: 'active',
            status: '1',
            sort: 1,
            dict_type_table: { code: 'wmsProjectSectionStatus', name: '施工号状态' }
          },
          {
            id: 'section-closed',
            label: '关闭',
            value: 'closed',
            status: '1',
            sort: 2,
            dict_type_table: { code: 'wmsProjectSectionStatus', name: '施工号状态' }
          }
        ]
      })
    )
    const sectionQueries: string[] = []
    await page.route('**/rest/v1/mdm_project_construction?*', (route) => {
      sectionQueries.push(route.request().url())
      const projectFilter = new URL(route.request().url()).searchParams.get('project_id')
      const records = [
        {
          id: 'existing-section',
          tenant_id: tenantId,
          project_id: 'section-project',
          construction_no: 'SECTION-EXISTING',
          section_name: sectionName,
          status: sectionStatus,
          remark: '原说明',
          created_at: '2026-10-07T01:00:00Z',
          updated_at: '2026-10-07T01:00:00Z'
        },
        {
          id: 'second-section',
          tenant_id: tenantId,
          project_id: 'section-project-second',
          construction_no: 'SECTION-SECOND',
          section_name: '第二项目施工分项',
          status: 'active',
          remark: '',
          created_at: '2026-10-07T01:00:00Z',
          updated_at: '2026-10-07T01:00:00Z'
        }
      ].filter((row) => !projectFilter || projectFilter === `eq.${row.project_id}`)
      return route.fulfill({
        json: records,
        headers: {
          'content-range': `0-${records.length - 1}/${records.length}`,
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    const payloads: unknown[] = []
    await page.route('**/rpc/wms_save_project_construction_secure', (route) => {
      const payload = route.request().postDataJSON()
      payloads.push(payload)
      if (payloads.length !== 1 && payloads.length !== 3 && payload.p_payload.id) {
        sectionStatus = payload.p_payload.status
        sectionName = payload.p_payload.section_name
      }
      return route.fulfill(
        payloads.length === 1 || payloads.length === 3
          ? { status: 400, json: { code: 'P0001', message: '测试施工号保存失败' } }
          : { json: 'section-created' }
      )
    })
    await page.goto('#/wms/project-warehouse/project-section')
    await expect(page.getByRole('heading', { name: '项目施工号', exact: true })).toBeVisible()
    const create = page.getByRole('button', { name: '新建施工号', exact: true })
    if (manage) await expect(create).toBeDisabled()
    release()
    await expect(page.getByText('项目选项加载失败。', { exact: false })).toBeVisible()
    if (manage) await expect(create).toBeDisabled()
    projectFailed = false
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(page.getByText('项目选项加载失败。', { exact: false })).toHaveCount(0)
    if (!manage) {
      await expect(create).toHaveCount(0)
      await expect(page.getByRole('button', { name: '维护', exact: true })).toHaveCount(0)
      for (const query of sectionQueries)
        expect(new URL(query).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
      return
    }
    await create.click()
    const dialog = page.getByRole('dialog', { name: '新建施工号', exact: true })
    await dialog.getByRole('combobox', { name: /所属项目/ }).click()
    await page.getByRole('option', { name: '施工号测试项目 · PROJ-TEST', exact: true }).click()
    await dialog.getByRole('textbox', { name: /施工号/, exact: false }).fill('SECTION-TEST')
    await dialog.getByRole('textbox', { name: /施工分项名称/ }).fill('测试施工分项')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByText('测试施工号保存失败', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /施工分项名称/ })).toHaveValue('测试施工分项')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toEqual(payloads[0])
    const edit = page
      .getByRole('row')
      .filter({ hasText: 'SECTION-EXISTING' })
      .getByRole('button', { name: '维护', exact: true })
    await edit.click()
    const editing = page.getByRole('dialog', { name: '维护施工号', exact: true })
    await expect(editing.getByRole('combobox', { name: /所属项目/ })).toBeDisabled()
    await expect(editing.getByRole('textbox', { name: /施工号/ })).toBeDisabled()
    await editing.getByRole('textbox', { name: /施工分项名称/ }).fill('取消的草稿')
    await editing.getByRole('button', { name: '取消', exact: true }).click()
    expect(payloads).toHaveLength(2)
    await edit.click()
    await expect(editing.getByRole('textbox', { name: /施工分项名称/ })).toHaveValue('原施工分项')
    await editing.getByRole('textbox', { name: /施工分项名称/ }).fill('更新施工分项')
    await editing.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByText('测试施工号保存失败', { exact: false })).toBeVisible()
    await expect(editing.getByRole('textbox', { name: /施工分项名称/ })).toHaveValue('更新施工分项')
    await editing.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editing).toBeHidden()
    expect(payloads).toHaveLength(4)
    expect(payloads[3]).toEqual(payloads[2])
    expect(payloads[3]).toMatchObject({
      p_payload: {
        id: 'existing-section',
        project_id: 'section-project',
        construction_no: 'SECTION-EXISTING',
        section_name: '更新施工分项'
      }
    })
    await expect(page.getByTitle('更新施工分项', { exact: true })).toBeVisible()
    await edit.click()
    await editing.getByText('关闭', { exact: true }).click()
    await editing.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editing).toBeHidden()
    expect(payloads[4]).toMatchObject({ p_payload: { id: 'existing-section', status: 'closed' } })
    await edit.click()
    await expect(editing.getByRole('radio', { name: '关闭', exact: true })).toBeChecked()
    await editing.getByRole('textbox', { name: '说明', exact: true }).scrollIntoViewIfNeeded()
    await expect(editing.getByRole('button', { name: '确定', exact: true })).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath('section-closed-edit-bottom.png'),
      animations: 'disabled'
    })
    await editing.getByText('在用', { exact: true }).click()
    await editing.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editing).toBeHidden()
    expect(payloads[5]).toMatchObject({ p_payload: { id: 'existing-section', status: 'active' } })
    await page.getByRole('combobox', { name: '项目', exact: true }).click()
    await page.getByRole('option', { name: '施工号测试项目 · PROJ-TEST', exact: true }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect
      .poll(() => new URL(sectionQueries.at(-1)!).searchParams.get('project_id'))
      .toBe('eq.section-project')
    await expect(page.getByText('SECTION-EXISTING', { exact: true })).toBeVisible()
    await expect(page.getByText('SECTION-SECOND', { exact: true })).toHaveCount(0)
    await page.getByRole('combobox', { name: '项目', exact: true }).click()
    await page.getByRole('option', { name: '第二施工项目 · PROJ-SECOND', exact: true }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('SECTION-SECOND', { exact: true })).toBeVisible()
    await expect(page.getByText('SECTION-EXISTING', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect
      .poll(() => new URL(sectionQueries.at(-1)!).searchParams.get('project_id'))
      .toBeNull()
    await expect(page.getByText('SECTION-EXISTING', { exact: true })).toBeVisible()
    await expect(page.getByText('SECTION-SECOND', { exact: true })).toBeVisible()
    for (const query of sectionQueries)
      expect(new URL(query).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
  })
}
