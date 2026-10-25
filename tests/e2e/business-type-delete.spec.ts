import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
// The fixture boots the full business page and shared feedback components through Vite.
test.setTimeout(120_000)
test('未配置本地守卫的调用保留全局引用反馈', async ({ page }) => {
  await prepareIsolatedSession(page)
  let inspections = 0
  await page.route('**/rest/v1/mdm_business_type?**', (route) =>
    route.fulfill({
      status: 409,
      json: {
        code: '23503',
        message:
          'update or delete on table "mdm_business_type" violates foreign key constraint "scm_purchase_document_business_type_id_fkey" on table "scm_purchase_document"',
        details: 'Key (id)=(1) is still referenced from table "scm_purchase_document".'
      }
    })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    inspections++
    return route.fulfill({
      json: [
        {
          resource_id: '1',
          source_table: 'scm_purchase_document',
          record_id: 'reference-test',
          target_id: 'reference-test',
          record_no: 'GLOBAL-REF-001',
          record_summary: '测试全局引用',
          record_status: 'draft',
          created_at: '2026-10-01'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/business-type-delete.html?global')
  await page.getByRole('button', { name: '验证全局引用反馈', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog')).toContainText('GLOBAL-REF-001')
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(inspections).toBe(1)
})

for (const entry of ['row', 'bulk'] as const) {
  for (const affected of [
    1,
    0,
    null,
    'blocked' as const,
    'blocked-purchase' as const,
    'blocked-issue' as const,
    'concurrent' as const,
    'scope' as const,
    'permission' as const,
    ...(entry === 'bulk' ? ['partial' as const] : [])
  ]) {
    test(`业务类型 ${entry} 删除检查与计数 affected=${affected}`, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      let failInspection = true
      let deleted = false
      let concurrentRejected = false
      const ids =
        affected === 'concurrent'
          ? entry === 'bulk'
            ? ['1', '2']
            : ['1']
          : entry === 'bulk'
            ? ['type-1', 'type-2']
            : ['type-1']
      const events: string[] = []
      await page.route('**/rest/v1/scm_purchase_document?**', (route) => {
        const params = new URL(route.request().url()).searchParams
        expect(params.get('select')).toBe('kind')
        expect(params.get('id')).toBe('eq.dependent-type')
        return route.fulfill({ json: { kind: 'purchase_order' } })
      })
      await page.route('**/rest/v1/mdm_business_type?**', (route) => {
        if (route.request().method() === 'DELETE') {
          events.push('delete')
          expect(route.request().headers().prefer).toContain('count=exact')
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(
            `in.(${ids.join(',')})`
          )
          if (affected === 'concurrent') {
            concurrentRejected = true
            return route.fulfill({
              status: 409,
              json: {
                code: '23503',
                message:
                  'update or delete on table "mdm_business_type" violates foreign key constraint "scm_purchase_document_business_type_id_fkey" on table "scm_purchase_document"',
                details: `Key (id)=(${ids[0]}) is still referenced from table "scm_purchase_document".`
              }
            })
          }
          deleted = affected === 1
          return route.fulfill({
            headers:
              affected === null
                ? {}
                : {
                    'content-range': `*/${affected === 1 ? ids.length : affected === 'partial' ? 1 : affected}`,
                    'access-control-expose-headers': 'content-range'
                  },
            json: []
          })
        }
        return route.fulfill({
          headers: {
            'content-range': deleted ? '*/0' : `0-${ids.length - 1}/${ids.length}`,
            'access-control-expose-headers': 'content-range'
          },
          json: deleted
            ? []
            : [
                {
                  id: 'type-1',
                  tenant_id: 'permission-test-tenant',
                  business_type_code: 'BT-001',
                  business_type_name: '测试业务类型',
                  document_type_id: 'doc-1',
                  document_type_ids: ['doc-1'],
                  menu_ids: [],
                  enabled: true,
                  is_default: false,
                  stock_movement: 'inbound',
                  update_time: '2026-10-01T00:00:00Z',
                  documentType: { id: 'doc-1', document_type_name: '测试单据', menu_ids: [] }
                }
              ].flatMap((row) =>
                ids.map((id, index) => ({
                  ...row,
                  id,
                  business_type_code: `BT-00${index + 1}`,
                  business_type_name: index ? '第二业务类型' : row.business_type_name
                }))
              )
        })
      })
      await page.route('**/rest/v1/mdm_document_type?**', (route) =>
        route.fulfill({ json: [{ id: 'doc-1', document_type_name: '测试单据', menu_ids: [] }] })
      )
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
        events.push('inspect')
        expect(route.request().postDataJSON()).toMatchObject({
          p_table: 'mdm_business_type',
          p_ids: ids
        })
        if (
          affected === 'blocked' ||
          affected === 'blocked-purchase' ||
          affected === 'blocked-issue' ||
          concurrentRejected
        )
          return route.fulfill({
            json: [
              {
                resourceId: ids[0],
                sourceTable:
                  affected === 'blocked-issue'
                    ? 'wms_issue_request'
                    : affected === 'blocked-purchase' || concurrentRejected
                      ? 'scm_purchase_document'
                      : 'mdm_business_type',
                recordId: 'dependent-type',
                targetId: 'dependent-type',
                recordNo: 'BT-REF-001',
                recordSummary: '引用该类型的业务口径',
                recordStatus: 'enabled',
                createdAt: '2026-10-01T00:00:00Z'
              }
            ]
          })
        return failInspection
          ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
          : route.fulfill({ json: [] })
      })
      await page.goto('/tests/e2e/fixtures/business-type-delete.html')
      await expect(page.getByText('测试业务类型', { exact: true }).first()).toBeVisible()
      if (entry === 'bulk')
        await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
      const clickDelete = async () => {
        if (entry === 'bulk')
          await page
            .getByLabel('批量操作')
            .getByRole('button', { name: '批量删除', exact: true })
            .click()
        else {
          const row = page.locator('.el-table__body-wrapper tr').first()
          await expect(row.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
          await row.getByRole('button', { name: '更多操作', exact: true }).click()
          await page.getByRole('menuitem', { name: '删除', exact: true }).click()
        }
      }
      await clickDelete()
      if (
        affected === 'blocked' ||
        affected === 'blocked-purchase' ||
        affected === 'blocked-issue'
      ) {
        const dialog = page.getByRole('dialog')
        await expect(dialog).toContainText('BT-REF-001')
        await expect(dialog).toContainText('引用该类型的业务口径')
        await expect(page.locator('.el-message-box')).toHaveCount(0)
        expect(events).toEqual(['inspect'])
        await page.screenshot({
          path: testInfo.outputPath('blocked-reference.png'),
          fullPage: true,
          animations: 'disabled'
        })
        await dialog.getByRole('button', { name: '查看关联' }).click()
        await expect(page.getByTestId('navigation')).toContainText('BT-REF-001')
        const navigation = JSON.parse((await page.getByTestId('navigation').textContent()) ?? '{}')
        expect(navigation).toMatchObject({
          fromMasterDelete: '1',
          referencedRecordId: 'type-1',
          recordId: 'dependent-type',
          dependencyCode:
            affected === 'blocked-issue'
              ? 'wms_issue_request'
              : affected === 'blocked-purchase'
                ? 'scm_purchase_document'
                : 'mdm_business_type',
          recordNo: 'BT-REF-001'
        })
        if (affected === 'blocked-purchase')
          await expect(page.getByTestId('navigation-path')).toHaveText('/scm/purchase/order')
        if (affected === 'blocked-issue') {
          expect(navigation.resourceType).toBe('wms_issue_request')
          await expect(page.getByTestId('navigation-path')).toHaveText(
            '/wms/outbound-business/outbound-request'
          )
        }
        expect(events).not.toContain('delete')
        return
      }
      await expect(page.getByRole('alert')).toContainText('关联资料未完成核验')
      expect(events).toEqual(['inspect'])
      await expect(page.locator('.el-message-box')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('inspection-error.png'),
        fullPage: true,
        animations: 'disabled'
      })
      failInspection = false
      await page.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect(page.getByRole('button', { name: '重新检查', exact: true })).toHaveCount(0)
      await clickDelete()
      await page
        .locator('.el-message-box')
        .getByRole('button', { name: '取消', exact: true })
        .click()
      expect(events).not.toContain('delete')
      await clickDelete()
      if (affected === 'scope' || affected === 'permission') {
        await expect(page.locator('.el-message-box')).toBeVisible()
        if (affected === 'scope')
          await page.evaluate(() => {
            sessionStorage.setItem('art-platform-tenant-scope-active', '1')
            sessionStorage.setItem(
              'art-platform-tenant-scope-id',
              '22222222-2222-4222-a222-222222222222'
            )
          })
        else
          await page.evaluate(() =>
            document.dispatchEvent(new Event('revoke-business-type-delete'))
          )
        await page
          .locator('.el-message-box')
          .getByRole('button', { name: '删除', exact: true })
          .click()
        await expect(
          page.getByText(
            affected === 'scope'
              ? '租户范围已变化，请刷新后重试'
              : '删除权限已变化，请刷新页面后重试',
            { exact: true }
          )
        ).toBeVisible()
        expect(events).not.toContain('delete')
        return
      }
      await page
        .locator('.el-message-box')
        .getByRole('button', { name: '删除', exact: true })
        .click()
      if (affected === 'concurrent') {
        const dialog = page.getByRole('dialog', { name: '暂时无法删除业务类型', exact: true })
        await expect(dialog).toContainText('BT-REF-001')
        await expect(page.getByRole('dialog', { name: '删除确认', exact: true })).toHaveCount(0)
        await expect(dialog).toContainText('引用该类型的业务口径')
        await expect.poll(() => events.filter((event) => event === 'inspect').length).toBe(5)
        expect(events.filter((event) => event === 'delete')).toHaveLength(1)
        await expect(page.getByRole('alert').filter({ hasText: '已删除' })).toHaveCount(0)
        await expect(page.getByRole('alert').filter({ hasText: '删除受阻' })).toHaveCount(0)
        await expect(page.getByText('测试业务类型', { exact: true }).first()).toBeVisible()
        await page.screenshot({
          path: testInfo.outputPath('concurrent-reference.png'),
          fullPage: true,
          animations: 'disabled'
        })
        await dialog.getByRole('button', { name: '查看关联' }).click()
        await expect(page.getByTestId('navigation-path')).toHaveText('/scm/purchase/order')
        const navigation = JSON.parse((await page.getByTestId('navigation').textContent()) ?? '{}')
        expect(navigation).toMatchObject({
          referencedRecordId: ids[0],
          recordId: 'dependent-type',
          dependencyCode: 'scm_purchase_document'
        })
        expect(events.filter((event) => event === 'delete')).toHaveLength(1)
        return
      }
      if (affected === 1) {
        await expect(page.getByText('测试业务类型', { exact: true })).toHaveCount(0)
        expect(events).toEqual(['inspect', 'inspect', 'inspect', 'inspect', 'delete'])
      } else {
        await expect.poll(() => events.filter((event) => event === 'inspect').length).toBe(5)
        await expect(page.getByText('测试业务类型', { exact: true }).first()).toBeVisible()
        await expect(page.getByRole('alert').filter({ hasText: '已删除' })).toHaveCount(0)
        await expect(
          page.getByRole('alert').filter({
            hasText: affected === 0 ? '所选业务类型未删除' : '删除结果与所选记录不一致'
          })
        ).toHaveCount(1)
        if (entry === 'bulk')
          await expect(
            page.getByLabel('批量操作').getByRole('button', { name: '批量删除', exact: true })
          ).toBeEnabled()
      }
    })
  }
}
