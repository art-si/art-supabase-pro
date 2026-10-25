import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

for (const feature of [
  {
    mode: 'project',
    label: '项目',
    table: 'mdm_project',
    permission: 'MdmSalesProject:Delete',
    code: 'project_code',
    name: 'project_name',
    referenceTable: 'mdm_bom',
    referenceLabel: 'BOM'
  },
  {
    mode: 'operation',
    label: '工序集',
    table: 'mdm_operation',
    permission: 'MdmOperationSet:Delete',
    code: 'code',
    name: 'name',
    referenceTable: 'mdm_process_route_step',
    referenceLabel: '工艺路线工序'
  },
  {
    mode: 'formula',
    label: '活动公式',
    table: 'mdm_activity_formula',
    permission: 'MdmActivityFormula:Delete',
    code: 'code',
    name: 'name',
    referenceTable: 'mdm_work_center_activity',
    referenceLabel: '工作中心活动配置'
  },
  {
    mode: 'control',
    label: '工序控制码',
    table: 'mdm_operation_control_code',
    permission: 'MdmOperationControlCode:Delete',
    code: 'control_code',
    name: 'control_code_name',
    referenceTable: 'mes_operation_task',
    referenceLabel: '生产工序任务'
  },
  {
    mode: 'workstation',
    label: '工位配置',
    table: 'mdm_workstation',
    permission: 'MdmWorkstation:Delete',
    code: 'workstation_code',
    name: 'workstation_name',
    // No real inbound FK was found; retain an explicitly synthetic association.
    referenceTable: 'synthetic_reference',
    referenceLabel: '关联业务记录'
  }
]) {
  for (const entry of ['single', 'bulk']) {
    for (const state of [
      'referenced',
      'failed',
      'clear',
      'cancel',
      'concurrent',
      'permission',
      'scope',
      'zero',
      'missing',
      ...(entry === 'bulk' ? ['partial'] : [])
    ]) {
      test(`${feature.label}主记录删除 ${entry} ${state}`, async ({ page }, info) => {
        await prepareIsolatedSession(page)
        const ids =
          entry === 'bulk'
            ? ['11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102']
            : ['11111111-1111-4111-8111-111111111101']
        const events: string[] = []
        let deleted = false
        await page.route(`**/rest/v1/${feature.table}?*`, (route) => {
          if (route.request().method() === 'DELETE') {
            events.push('delete')
            expect(new URL(route.request().url()).searchParams.get('id')).toBe(
              `in.(${ids.join(',')})`
            )
            if (state === 'concurrent')
              return route.fulfill({
                status: 409,
                json: { code: '23503', message: '项目存在业务引用' }
              })
            deleted = state === 'clear'
          }
          return route.fulfill({
            headers: {
              'content-range':
                route.request().method() === 'DELETE' && state === 'missing'
                  ? '*'
                  : `*/${route.request().method() === 'DELETE' ? (state === 'zero' ? 0 : state === 'partial' ? 1 : ids.length) : deleted ? 0 : ids.length}`,
              'access-control-expose-headers': 'content-range'
            },
            json:
              deleted && route.request().method() !== 'DELETE'
                ? []
                : ids.map((id, index) => ({
                    id,
                    tenant_id: '11111111-1111-4111-8111-111111111111',
                    [feature.code]: `PROJECT-00${index + 1}`,
                    [feature.name]: `测试主记录${index + 1}`,
                    enabled: true
                  }))
          })
        })
        await page.route('**/rest/v1/rpc/get_record_delete_dependency_details*', (route) => {
          events.push('inspect')
          expect(route.request().postDataJSON()).toMatchObject({
            p_table: feature.table,
            p_ids: ids
          })
          if (state === 'failed')
            return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test' } })
          return route.fulfill({
            json:
              state === 'referenced' || (state === 'concurrent' && events.includes('delete'))
                ? [
                    {
                      resource_id: ids[0],
                      source_table: feature.referenceTable,
                      record_id: 'bom-ref',
                      target_id: 'bom-ref',
                      record_no: 'REF-001',
                      record_summary: `${feature.referenceLabel}引用测试记录`,
                      record_status: 'design',
                      created_at: '2026-10-01'
                    }
                  ]
                : []
          })
        })
        await page.goto(`/tests/e2e/fixtures/master-group-reuse.html?mode=${feature.mode}`)
        await expect(page.getByText('测试主记录1', { exact: true })).toBeVisible()
        if (entry === 'bulk') {
          await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
          await page
            .getByLabel('批量操作')
            .getByRole('button', { name: '批量删除', exact: true })
            .click()
        } else {
          await page
            .locator('.el-table__body-wrapper')
            .getByRole('button', { name: '更多操作', exact: true })
            .first()
            .click()
          await page.getByRole('menuitem', { name: '删除', exact: true }).click()
        }
        const confirm = page.getByRole('dialog', { name: '删除确认', exact: true })
        if (state === 'referenced' || state === 'failed') {
          await expect(page.getByRole('dialog')).toBeVisible()
          await expect(confirm).toHaveCount(0)
          expect(events).toEqual(['inspect'])
          if (state === 'referenced') {
            await expect(page.getByRole('dialog')).toContainText('REF-001')
            await expect(page.getByRole('dialog')).toContainText(feature.referenceLabel)
            await page.getByRole('dialog').screenshot({ path: info.outputPath('references.png') })
          } else await expect(page.getByRole('dialog')).toHaveAccessibleName('删除检查未完成')
        } else {
          await expect(confirm).toBeVisible()
          expect(events).toEqual(['inspect'])
          if (state === 'permission')
            await page.evaluate(async (permission) => {
              const modulePath = '/src/store/modules/menu.ts'
              const { useMenuStore } = await import(/* @vite-ignore */ modulePath)
              const menuStore = useMenuStore()
              menuStore.setButtonList(
                menuStore.buttonList.filter((item: { name?: string }) => item.name !== permission)
              )
            }, feature.permission)
          if (state === 'scope')
            await page.evaluate(() => {
              sessionStorage.setItem('art-platform-tenant-scope-active', '1')
              sessionStorage.setItem(
                'art-platform-tenant-scope-id',
                '22222222-2222-4222-8222-222222222222'
              )
            })
          await confirm
            .getByRole('button', { name: state === 'cancel' ? '取消' : '删除', exact: true })
            .click()
          if (state === 'clear') {
            await expect(page.getByText(`${feature.label}已删除`, { exact: true })).toBeVisible()
            await expect(page.getByText('测试主记录1', { exact: true })).toHaveCount(0)
            expect(events).toEqual(['inspect', 'delete'])
          } else if (state === 'concurrent') {
            await expect(page.getByRole('dialog')).toHaveCount(1)
            await expect(page.getByRole('dialog')).toContainText('REF-001')
            await expect(page.getByRole('dialog')).toContainText(feature.referenceLabel)
            expect(events).toEqual(['inspect', 'delete', 'inspect'])
          } else if (['zero', 'missing', 'partial'].includes(state)) {
            await expect(page.locator('.el-message--error')).toHaveCount(1)
            await expect(page.locator('.el-message--success')).toHaveCount(0)
            expect(events).toEqual(['inspect', 'delete', 'inspect'])
          } else {
            expect(events).toEqual(['inspect'])
            if (state !== 'cancel')
              await expect(
                page.getByText(
                  state === 'permission'
                    ? '删除权限已变化，请刷新页面后重试'
                    : '租户范围已变化，请刷新后重试',
                  { exact: true }
                )
              ).toBeVisible()
          }
        }
        if (entry === 'bulk' && state !== 'clear')
          await expect(page.locator('.el-table__body-wrapper .el-checkbox.is-checked')).toHaveCount(
            2
          )
      })
    }
  }
}
