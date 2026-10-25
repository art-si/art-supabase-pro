import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

for (const mode of ['single', 'bulk']) {
  for (const state of [
    'referenced',
    'status-failed',
    'failed',
    'clear',
    'concurrent',
    'zero',
    'missing-count',
    ...(mode === 'bulk' ? ['partial'] : []),
    'cancel',
    'scope',
    'permission'
  ]) {
    test(`单据类型删除 ${mode} ${state}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const events: string[] = []
      const id = '00000000-0000-4000-a000-000000000001'
      const ids = mode === 'bulk' ? [id, '00000000-0000-4000-a000-000000000003'] : [id]
      const referenceId = '00000000-0000-4000-a000-000000000002'
      let deleted = false
      await page.route('**/rest/v1/mdm_document_type?**', (route) => {
        if (route.request().method() === 'DELETE') {
          events.push('delete')
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(
            `in.(${ids.join(',')})`
          )
          if (state === 'concurrent')
            return route.fulfill({
              status: 409,
              json: {
                code: '23503',
                message:
                  'update or delete on table "mdm_document_type" violates foreign key constraint "mdm_business_type_document_type_fkey" on table "mdm_business_type"',
                details: `Key (id)=(${id}) is still referenced from table "mdm_business_type".`
              }
            })
          deleted = state === 'clear'
          return route.fulfill({
            json: deleted ? ids.map((id) => ({ id })) : [],
            headers: {
              ...(state === 'missing-count'
                ? {}
                : { 'content-range': `*/${deleted ? ids.length : state === 'partial' ? 1 : 0}` }),
              'access-control-expose-headers': 'content-range'
            }
          })
        }
        return route.fulfill({
          json: deleted
            ? []
            : ids.map((recordId, index) => ({
                id: recordId,
                tenant_id: 'permission-test-tenant',
                document_type_code: `DOC-TEST-00${index + 1}`,
                document_type_name: '测试单据类型',
                menu_ids: [],
                enabled: true,
                is_default: false,
                update_time: '2026-10-01T00:00:00Z'
              })),
          headers: {
            'content-range': `0-${ids.length - 1}/${deleted ? 0 : ids.length}`,
            'access-control-expose-headers': 'content-range'
          }
        })
      })
      await page.route('**/rest/v1/mdm_business_type?**', (route) => {
        events.push('status')
        expect(new URL(route.request().url()).searchParams.get('select')).toBe('id,enabled')
        return state === 'status-failed'
          ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
          : route.fulfill({ json: [{ id: referenceId, enabled: false }] })
      })
      await page.route(
        '**/rest/v1/rpc/get_mdm_document_type_delete_dependencies_secure**',
        (route) => {
          events.push('inspect')
          expect(route.request().postDataJSON()).toMatchObject({
            p_ids: ids
          })
          if (state === 'failed')
            return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
          return route.fulfill({
            json:
              ['referenced', 'status-failed'].includes(state) ||
              (state === 'concurrent' && events.includes('delete'))
                ? [
                    {
                      resource_id: id,
                      source_table: 'mdm_business_type',
                      record_id: referenceId,
                      target_id: referenceId,
                      record_no: 'BUSINESS-REF-001',
                      record_summary: '测试引用业务类型',
                      record_status: 'enabled',
                      created_at: '2026-10-01'
                    }
                  ]
                : []
          })
        }
      )
      await page.goto('/tests/e2e/fixtures/business-type-delete.html?page=document')
      const row = page.locator('.el-table__body-wrapper tr').first()
      await expect(row).toContainText('DOC-TEST-001')
      if (mode === 'single') {
        await expect(row.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
        await row.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      } else {
        await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
        await page.getByRole('button', { name: '批量删除', exact: true }).click()
      }
      const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
      if (['referenced', 'status-failed', 'failed'].includes(state)) {
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(confirmation).toHaveCount(0)
        if (state === 'referenced') {
          await expect(dialog).toContainText('BUSINESS-REF-001')
          await expect(dialog).toContainText('停用')
          expect(events).toEqual(['inspect', 'status'])
          await dialog.screenshot({ path: info.outputPath('references.png') })
        } else {
          await expect(dialog).toHaveAccessibleName('删除检查未完成')
          expect(events).toEqual(state === 'status-failed' ? ['inspect', 'status'] : ['inspect'])
        }
      } else {
        await expect(confirmation).toBeVisible()
        expect(events).toEqual(['inspect'])
        if (state === 'scope')
          await page.evaluate(() => {
            sessionStorage.setItem('art-platform-tenant-scope-active', '1')
            sessionStorage.setItem(
              'art-platform-tenant-scope-id',
              '22222222-2222-4222-a222-222222222222'
            )
          })
        if (state === 'permission')
          await page.evaluate(() =>
            document.dispatchEvent(new Event('revoke-document-type-delete'))
          )
        await confirmation
          .getByRole('button', { name: state === 'cancel' ? '取消' : '删除', exact: true })
          .click()
        if (state === 'concurrent') {
          const dialog = page.getByRole('dialog')
          await expect(dialog).toHaveCount(1)
          await expect(dialog).toContainText('BUSINESS-REF-001')
          await expect(dialog).toContainText('停用')
          expect(events).toEqual(['inspect', 'delete', 'inspect', 'status'])
          await expect(page.locator('.el-message--error')).toHaveCount(0)
        } else if (state === 'clear') {
          await expect(row).toHaveCount(0)
          expect(events).toEqual(['inspect', 'delete'])
          await expect(
            page.getByText(mode === 'bulk' ? '已删除 2 条单据类型' : '单据类型已删除', {
              exact: true
            })
          ).toBeVisible()
        } else if (['zero', 'missing-count', 'partial'].includes(state)) {
          await expect.poll(() => events).toEqual(['inspect', 'delete', 'inspect'])
          await expect(page.locator('.el-message--success')).toHaveCount(0)
          await expect(page.locator('.el-message--error')).toHaveCount(1)
        } else if (state === 'scope' || state === 'permission') {
          await expect(
            page.getByText(
              state === 'scope'
                ? '租户范围已变化，请刷新后重试'
                : '删除权限已变化，请刷新页面后重试',
              { exact: true }
            )
          ).toBeVisible()
          expect(events).toEqual(['inspect'])
        } else {
          await expect(confirmation).toBeHidden()
          expect(events).toEqual(['inspect'])
        }
      }
      if (mode === 'bulk' && state !== 'clear' && state !== 'permission')
        await expect(row.locator('input[type="checkbox"]')).toBeChecked()
    })
  }
}
