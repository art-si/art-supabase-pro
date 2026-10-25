import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
for (const feature of ['cargo', 'customer-address', 'driver', 'carrier']) {
  for (const state of ['cancel', 'concurrent', 'zero', 'scope', 'permission'])
    test(`${feature} 删除顺序 ${state}`, async ({ page }, info) => {
      const events: string[] = []
      const id = '00000000-0000-4000-a000-000000000001'
      await page.route('**/rest/v1/**', async (route) => {
        const url = route.request().url()
        const row = {
          id,
          cargo_name: '测试货物',
          cargo_code: 'HW-001',
          driver_name: '测试司机',
          company_name: '测试承运商',
          region: '北京',
          address_detail: '测试地址',
          tenant_id: '11111111-1111-4111-a111-111111111111'
        }
        if (url.includes('get_governed_delete_dependency_details')) {
          events.push('inspect')
          return route.fulfill({
            json:
              state === 'concurrent' && events.includes('delete')
                ? [
                    {
                      resource_id: id,
                      dependency_code:
                        feature === 'cargo'
                          ? 'cargo_waybill'
                          : feature === 'driver'
                            ? 'driver_waybill'
                            : feature === 'carrier'
                              ? 'carrier_statement'
                              : 'address_waybill',
                      record_id: id,
                      record_no: 'YD-CONCURRENT-001',
                      record_status: 'completed'
                    }
                  ]
                : []
          })
        }
        if (
          route.request().method() === 'DELETE' ||
          url.includes('tms_delete_customer_address_secure') ||
          url.includes('tms_delete_customer_addresses_secure') ||
          /tms_delete_(drivers?|carriers?)_secure/.test(url)
        ) {
          events.push('delete')
          if (state === 'zero')
            return route.fulfill({
              json: 0,
              headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
            })
          return route.fulfill({
            status: 409,
            json: { code: '23503', message: 'foreign key reference' }
          })
        }
        if (/tms_list_(customer_addresses|drivers|carriers)_secure/.test(url))
          return route.fulfill({ json: { records: [row], total: 1 } })
        if (new URL(url).pathname.endsWith('/mdm_cargo'))
          return route.fulfill({
            json: [row],
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
          })
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/scrollbar-workspace.html?page=${feature}${state === 'permission' ? '&ordinary=true&governedDelete=true' : ''}`
      )
      await expect(page.locator('.el-table__body-wrapper tr')).toHaveCount(1)
      await expect(
        page.locator('.el-table__body-wrapper').getByText('undefined', { exact: true })
      ).toHaveCount(0)
      if (state === 'cancel' || state === 'scope') {
        await page.locator('.el-table__header-wrapper .el-checkbox').click()
        await page.getByRole('button', { name: '批量删除', exact: true }).click()
      } else {
        await page
          .locator('.el-table__body-wrapper tr')
          .first()
          .getByRole('button', { name: '更多操作', exact: true })
          .click()
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      }
      const confirmation = page.locator('.el-message-box')
      await expect(confirmation).toBeVisible()
      if (feature === 'driver' || feature === 'carrier')
        await page.screenshot({ path: info.outputPath('confirmation.png') })
      expect(events).toEqual(['inspect'])
      if (state === 'permission') {
        await page.evaluate(() => document.dispatchEvent(new Event('revoke-governed-delete')))
        await confirmation.getByRole('button', { name: '删除', exact: true }).click()
        await expect(
          page.getByText('删除权限已变化，请刷新页面后重试', { exact: true })
        ).toBeVisible()
        expect(events).toEqual(['inspect'])
        return
      }
      if (state === 'scope') {
        await page.evaluate(() => {
          sessionStorage.setItem('art-platform-tenant-scope-active', '1')
          sessionStorage.setItem(
            'art-platform-tenant-scope-id',
            '22222222-2222-4222-a222-222222222222'
          )
        })
        await confirmation.getByRole('button', { name: '删除', exact: true }).click()
        await expect(page.getByText('租户范围已变化，请刷新后重试', { exact: true })).toBeVisible()
        expect(events).toEqual(['inspect'])
        return
      }
      if (state === 'concurrent') {
        await confirmation.getByRole('button', { name: '删除', exact: true }).click()
        await expect(page.getByText('YD-CONCURRENT-001', { exact: true })).toBeVisible()
        await expect(page.getByText('已完成', { exact: true })).toBeVisible()
        await expect(page.getByText('completed', { exact: true })).toHaveCount(0)
        expect(events).toEqual(['inspect', 'delete', 'inspect'])
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        if (feature === 'driver' || feature === 'carrier')
          await page.screenshot({ path: info.outputPath('references.png') })
        return
      }
      if (state === 'zero') {
        await confirmation.getByRole('button', { name: '删除', exact: true }).click()
        await expect.poll(() => events).toEqual(['inspect', 'delete', 'inspect'])
        await expect(page.locator('.el-message--success')).toHaveCount(0)
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        return
      }
      await confirmation.getByRole('button', { name: '取消', exact: true }).click()
      await expect(confirmation).toBeHidden()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await expect(page.locator('.el-table__body-wrapper input[type="checkbox"]')).toBeChecked()
      expect(events).toEqual(['inspect'])
    })
}
