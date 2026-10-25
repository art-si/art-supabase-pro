import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
// The fixture starts the complete business page through Vite before exercising deletion.
test.setTimeout(120_000)

for (const entry of ['bulk', 'row'] as const) {
  for (const state of [
    'clear',
    'zero',
    'missing-count',
    ...(entry === 'bulk' ? ['partial'] : []),
    'concurrent',
    'scope',
    'permission'
  ]) {
    test(`${entry} 工位删除 ${state} 先核验，失败与取消保留选择`, async ({ page }) => {
      await prepareIsolatedSession(page)
      const ids = entry === 'bulk' ? ['station', 'station-two'] : ['station']
      let failInspection = true
      let deleted = false
      let deleteCalls = 0
      let finalPhase = false
      const events: string[] = []
      await page.route('**/rest/v1/mdm_production_department?**', (route) =>
        route.fulfill({
          json: [
            {
              id: 'root',
              tenant_id: 'permission-test-tenant',
              code: 'ROOT',
              name: '测试工厂',
              enabled: true
            },
            {
              id: 'shop',
              parent_id: 'root',
              tenant_id: 'permission-test-tenant',
              code: 'SHOP',
              name: '测试车间',
              enabled: true
            }
          ]
        })
      )
      await page.route('**/rest/v1/mdm_work_center?**', (route) =>
        route.fulfill({
          json: [
            {
              id: 'center',
              department_id: 'shop',
              tenant_id: 'permission-test-tenant',
              code: 'WC',
              name: '测试中心',
              sort: 1
            }
          ]
        })
      )
      await page.route('**/rest/v1/mdm_workstation?**', (route) => {
        if (route.request().method() === 'DELETE') {
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(
            `in.(${ids.join(',')})`
          )
          events.push('delete')
          deleteCalls++
          if (state === 'concurrent')
            return route.fulfill({
              status: 409,
              json: {
                code: '23503',
                message:
                  'update or delete on table "mdm_workstation" violates foreign key constraint "mes_workstation_fkey" on table "mes_job_order"',
                details: 'Key (id)=(station) is still referenced from table "mes_job_order".'
              }
            })
          deleted = state === 'clear'
          return route.fulfill({
            headers: {
              ...(state === 'missing-count'
                ? {}
                : { 'content-range': `*/${deleted ? ids.length : state === 'partial' ? 1 : 0}` }),
              'access-control-expose-headers': 'content-range'
            },
            json: [{ id: 'station' }]
          })
        }
        return route.fulfill({
          headers: {
            'content-range': deleted ? '*/0' : `0-${ids.length - 1}/${ids.length}`,
            'access-control-expose-headers': 'content-range'
          },
          json: deleted
            ? []
            : ids.map((id, index) => ({
                id,
                tenant_id: 'permission-test-tenant',
                department_id: 'shop',
                work_center_id: 'center',
                workstation_code: `WS-00${index + 1}`,
                workstation_name: '测试工位',
                enabled: true
              }))
        })
      })
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
        events.push('inspect')
        expect(route.request().postDataJSON()).toMatchObject({
          p_table: 'mdm_workstation',
          p_ids: ids
        })
        return failInspection
          ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
          : route.fulfill({
              json:
                finalPhase && state === 'concurrent' && deleteCalls
                  ? [
                      {
                        resource_id: 'station',
                        source_table: 'mes_job_order',
                        record_id: 'job',
                        target_id: 'job',
                        record_no: 'JOB-001',
                        record_summary: '测试工位生产任务',
                        record_status: 'draft',
                        created_at: '2026-10-01'
                      }
                    ]
                  : []
            })
      })
      await page.goto(
        `/tests/e2e/fixtures/workstation-delete.html${state === 'permission' ? '?ordinary' : ''}`
      )
      await expect(page.getByText('测试工位', { exact: true }).first()).toBeVisible()
      await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
      const remove = page.getByLabel('批量操作').getByRole('button', { name: '删除', exact: true })
      const clickDelete = async () => {
        if (entry === 'bulk') await remove.click()
        else {
          await page.getByRole('button', { name: '更多操作', exact: true }).click()
          await page.getByRole('menuitem', { name: '删除工位' }).click()
        }
      }
      await clickDelete()
      await expect(
        page.getByRole('dialog', { name: '删除检查未完成', exact: true }).getByRole('alert')
      ).toContainText('关联资料未完成核验')
      expect(deleteCalls).toBe(0)
      await expect(page.getByRole('dialog', { name: '删除确认', exact: true })).toHaveCount(0)
      await page.screenshot({
        path: test.info().outputPath('inspection-error.png'),
        fullPage: true,
        animations: 'disabled'
      })
      failInspection = false
      await page.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect(page.getByRole('button', { name: '重新检查', exact: true })).toHaveCount(0)
      await clickDelete()
      const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
      await expect(confirmation).toContainText('工位')
      await confirmation.getByRole('button', { name: '取消', exact: true }).click()
      expect(deleteCalls).toBe(0)
      await expect(remove).toBeVisible()
      await clickDelete()
      await expect(confirmation).toBeVisible()
      finalPhase = true
      if (state === 'scope')
        await page.evaluate(() => {
          sessionStorage.setItem('art-platform-tenant-scope-active', '1')
          sessionStorage.setItem(
            'art-platform-tenant-scope-id',
            '22222222-2222-4222-a222-222222222222'
          )
        })
      if (state === 'permission')
        await page.evaluate(() => document.dispatchEvent(new Event('revoke-workstation-delete')))
      await confirmation.getByRole('button', { name: '删除', exact: true }).click()
      if (state === 'scope' || state === 'permission') {
        await expect(
          page.getByText(
            state === 'scope' ? '租户范围已变化，请刷新后重试' : '删除权限已变化，请刷新页面后重试',
            { exact: true }
          )
        ).toBeVisible()
        expect(deleteCalls).toBe(0)
        expect(events).toEqual(['inspect', 'inspect', 'inspect', 'inspect'])
        return
      }
      await expect.poll(() => deleteCalls).toBe(1)
      if (state === 'clear') {
        await expect(page.getByText('测试工位', { exact: true })).toHaveCount(0)
        expect(events).toEqual(['inspect', 'inspect', 'inspect', 'inspect', 'delete'])
      } else {
        await expect
          .poll(() => events)
          .toEqual(['inspect', 'inspect', 'inspect', 'inspect', 'delete', 'inspect'])
        await expect(page.locator('.el-message--success')).toHaveCount(0)
        await expect(
          page.locator('.el-table__body-wrapper input[type="checkbox"]').first()
        ).toBeChecked()
        if (state === 'concurrent') {
          const references = page.getByRole('dialog')
          await expect(references).toHaveCount(1)
          await expect(references).toContainText('JOB-001')
          await references.screenshot({ path: test.info().outputPath('concurrent-references.png') })
        } else await expect(page.locator('.el-message--error')).toHaveCount(1)
      }
    })
  }
}
