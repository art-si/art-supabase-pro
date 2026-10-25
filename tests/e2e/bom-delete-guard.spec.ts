import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

for (const mode of ['row', 'bulk']) {
  for (const state of [
    'referenced',
    'failed',
    'clear',
    'concurrent',
    'cancel',
    'scope',
    'permission',
    ...(mode === 'bulk' ? ['zero', 'missing', 'partial'] : [])
  ]) {
    test(`BOM 删除 ${mode} ${state}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const ids =
        mode === 'bulk'
          ? ['11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102']
          : ['11111111-1111-4111-8111-111111111101']
      const events: string[] = []
      let deleted = false
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        const path = url.pathname
        if (path.endsWith('/mdm_accessory_processing_list')) {
          events.push('inspect')
          expect(url.searchParams.get('bom_id')).toBe(`in.(${ids.join(',')})`)
          if (state === 'failed')
            return route.fulfill({
              status: 403,
              json: { code: '42501', message: 'permission denied' }
            })
          const referenced =
            state === 'referenced' || (state === 'concurrent' && events.includes('delete'))
          return route.fulfill({
            headers: {
              'content-range': `*/${referenced ? 1 : 0}`,
              'access-control-expose-headers': 'content-range'
            },
            json: referenced
              ? [
                  {
                    id: '22222222-2222-4222-8222-222222222201',
                    bom_id: ids[0],
                    source_name: '测试图纸',
                    project_name: '测试项目',
                    drawing_name: 'DRAW-001',
                    status: 'generated',
                    create_time: '2026-10-01'
                  }
                ]
              : []
          })
        }
        if (path.endsWith('/rpc/mdm_delete_bom') || path.endsWith('/rpc/mdm_delete_boms')) {
          events.push('delete')
          expect(route.request().postDataJSON()).toEqual(
            mode === 'row' ? { p_bom_id: ids[0] } : { p_bom_ids: ids }
          )
          if (state === 'concurrent')
            return route.fulfill({
              status: 409,
              json: { code: '23503', message: '该 BOM 已被配件加工清单引用，请先解除关联' }
            })
          deleted = state === 'clear'
          return route.fulfill({
            json:
              mode === 'row' || state === 'missing'
                ? null
                : state === 'zero'
                  ? 0
                  : state === 'partial'
                    ? 1
                    : ids.length
          })
        }
        if (path.endsWith('/mdm_bom'))
          return route.fulfill({
            headers: {
              'content-range': `*/${deleted ? 0 : ids.length}`,
              'access-control-expose-headers': 'content-range'
            },
            json: deleted
              ? []
              : ids.map((id, index) => ({
                  id,
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  bom_code: `BOM-00${index + 1}`,
                  version: 'A',
                  status: 'design',
                  material: null,
                  items: [],
                  sort: index
                }))
          })
        return route.fulfill({
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
          json: []
        })
      })
      await page.goto(
        `/tests/e2e/fixtures/bom-workspace-scope.html?deleteTest&scope=${state === 'permission' ? 'ordinary' : 'all'}`
      )
      const rows = page.locator('.el-table__body-wrapper tr')
      await expect(rows.first()).toContainText('BOM-001')
      if (mode === 'row') {
        await rows.first().getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      } else {
        await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
        await page
          .getByLabel('批量操作')
          .getByRole('button', { name: '批量删除', exact: true })
          .click()
      }
      const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
      if (state === 'referenced' || state === 'failed') {
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(confirmation).toHaveCount(0)
        expect(events).toEqual(['inspect'])
        if (state === 'referenced') {
          await expect(dialog).toContainText('DRAW-001')
          await expect(dialog).toContainText('工单已生成')
          await expect(dialog.getByRole('button', { name: '查看清单', exact: true })).toBeEnabled()
          await dialog.screenshot({ path: info.outputPath('references.png') })
          if (mode === 'bulk')
            await expect(rows.first().locator('input[type="checkbox"]')).toBeChecked()
          await dialog.getByRole('button', { name: '查看清单', exact: true }).click()
          await expect(page.getByTestId('bom-reference-navigation')).toContainText(
            '/mdm/engineering/accessory-processing'
          )
          await expect(page.getByTestId('bom-reference-navigation')).toContainText(
            '22222222-2222-4222-8222-222222222201'
          )
          await expect(page.getByTestId('bom-reference-navigation')).toContainText('DRAW-001')
        } else await expect(dialog).toHaveAccessibleName('删除检查未完成')
      } else {
        await expect(confirmation).toBeVisible()
        expect(events).toEqual(['inspect'])
        if (state === 'scope')
          await page.evaluate(() => {
            sessionStorage.setItem('art-platform-tenant-scope-active', '1')
            sessionStorage.setItem(
              'art-platform-tenant-scope-id',
              '22222222-2222-4222-8222-222222222222'
            )
          })
        if (state === 'permission')
          await page.evaluate(() => document.dispatchEvent(new Event('revoke-bom-delete')))
        await confirmation
          .getByRole('button', { name: state === 'cancel' ? '取消' : '删除', exact: true })
          .click()
        if (state === 'clear') {
          await expect(rows).toHaveCount(0)
          expect(events).toEqual(['inspect', 'delete'])
          await expect(page.locator('.el-message--success')).toHaveCount(1)
        } else if (state === 'concurrent') {
          const dialog = page.getByRole('dialog')
          await expect(dialog).toHaveCount(1)
          await expect(dialog).toContainText('DRAW-001')
          expect(events).toEqual(['inspect', 'delete', 'inspect'])
          await expect(page.locator('.el-message--error')).toHaveCount(0)
        } else if (['zero', 'missing', 'partial'].includes(state)) {
          await expect.poll(() => events).toEqual(['inspect', 'delete', 'inspect'])
          await expect(page.locator('.el-message--success')).toHaveCount(0)
          await expect(page.locator('.el-message--error')).toHaveCount(1)
        } else {
          await expect(confirmation).toBeHidden()
          expect(events).toEqual(['inspect'])
          if (state !== 'cancel')
            await expect(
              page.getByText(
                state === 'scope'
                  ? '租户范围已变化，请刷新后重试'
                  : '删除权限已变化，请刷新页面后重试',
                { exact: true }
              )
            ).toBeVisible()
        }
      }
      if (mode === 'bulk' && !['clear', 'permission', 'referenced'].includes(state))
        await expect(rows.first().locator('input[type="checkbox"]')).toBeChecked()
    })
  }
}
