import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

for (const state of [
  'child',
  'bom',
  'failed',
  'concurrent',
  'clear',
  'zero',
  'missing',
  'cancel',
  'scope',
  'permission'
]) {
  test(`BOM 分组删除 ${state}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    if (state === 'child') await page.setViewportSize({ width: 1280, height: 900 })
    const id = '11111111-1111-4111-8111-111111111101'
    const childId = '11111111-1111-4111-8111-111111111102'
    const bomId = '11111111-1111-4111-8111-111111111103'
    const events: string[] = []
    let deleted = false
    const groups = [
      {
        id,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        code: 'GROUP-001',
        name: '测试 BOM 分组',
        sort: 0,
        enabled: true
      },
      ...(state === 'child'
        ? [
            {
              id: childId,
              tenant_id: '11111111-1111-4111-8111-111111111111',
              code: 'CHILD-001',
              name: '下级测试分组',
              parent_id: id,
              sort: 0,
              enabled: true
            },
            ...Array.from({ length: 17 }, (_, index) => ({
              id: `dummy-${index}`,
              code: `DUMMY-${index}`,
              name: `其他分组 ${index}`,
              sort: index + 1,
              enabled: true
            }))
          ]
        : [])
    ]
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      if (path.endsWith('/rpc/get_record_delete_dependency_details')) {
        events.push('inspect')
        expect(route.request().postDataJSON()).toMatchObject({
          p_table: 'mdm_master_group',
          p_ids: [id]
        })
        if (state === 'failed')
          return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
        const referenced =
          state === 'child' ||
          state === 'bom' ||
          (state === 'concurrent' && events.includes('delete'))
        return route.fulfill({
          json: referenced
            ? [
                {
                  resource_id: id,
                  source_table: state === 'child' ? 'mdm_master_group' : 'mdm_bom',
                  record_id: state === 'child' ? childId : bomId,
                  target_id: state === 'child' ? childId : bomId,
                  record_no: state === 'child' ? 'CHILD-001' : 'BOM-REF-001',
                  record_summary: state === 'child' ? '下级测试分组' : '测试关联 BOM',
                  record_status: state === 'child' ? 'enabled' : 'design',
                  created_at: '2026-10-01'
                }
              ]
            : []
        })
      }
      if (path.endsWith('/rpc/mdm_delete_bom_group_secure')) {
        events.push('delete')
        expect(route.request().postDataJSON()).toEqual({ p_id: id })
        if (state === 'concurrent')
          return route.fulfill({
            status: 409,
            json: { code: '23503', message: '该分组仍有 BOM，请先调整 BOM 分组' }
          })
        deleted = state === 'clear'
        return route.fulfill({ json: state === 'missing' ? null : deleted ? 1 : 0 })
      }
      if (path.endsWith('/mdm_master_group'))
        return route.fulfill({
          headers: {
            'content-range': `*/${deleted ? 0 : groups.length}`,
            'access-control-expose-headers': 'content-range'
          },
          json: deleted ? [] : groups
        })
      if (path.endsWith('/mdm_bom') && state === 'child')
        expect(url.searchParams.get('id')).toBeNull()
      return route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/bom-workspace-scope.html?deleteTest&scope=${state === 'permission' ? 'ordinary' : 'all'}`
    )
    const node = page
      .locator('.bom-group-panel .el-tree-node__content')
      .filter({ hasText: 'GROUP-001' })
    await expect(node).toBeVisible()
    await expect(node.getByRole('button', { name: '删除分组', exact: true })).toHaveCount(0)
    if (state === 'clear') {
      const more = node.getByRole('button', { name: '更多操作', exact: true })
      await more.focus()
      await expect
        .poll(() =>
          node
            .locator('.bom-group-panel__node-actions')
            .evaluate((element) => Number(getComputedStyle(element).opacity))
        )
        .toBe(1)
      await more.press('Enter')
      await page.getByRole('menuitem', { name: '编辑分组', exact: true }).click()
      const edit = page.getByRole('dialog')
      await expect(edit.getByRole('textbox', { name: /分组编码/ })).toHaveValue('GROUP-001')
      await edit.getByRole('button', { name: '取消', exact: true }).click()
      await more.click()
      await page.getByRole('menuitem', { name: '新增下级分组', exact: true }).click()
      const add = page.getByRole('dialog')
      await expect(add.getByRole('textbox', { name: /分组编码/ })).toHaveValue('')
      await expect(add).toContainText('上级分组：测试 BOM 分组 · GROUP-001')
      await add.getByRole('button', { name: '取消', exact: true }).click()
      expect(events).toEqual([])
    }
    if (state === 'child')
      await expect(page.getByText('下级测试分组', { exact: true })).toBeHidden()
    await node.getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '删除分组', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
    if (['child', 'bom', 'failed'].includes(state)) {
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(confirmation).toHaveCount(0)
      expect(events).toEqual(['inspect'])
      if (state === 'failed') await expect(dialog).toHaveAccessibleName('删除检查未完成')
      else {
        await expect(dialog).toContainText(state === 'child' ? '下级 BOM 分组' : 'BOM-REF-001')
        await dialog.screenshot({ path: info.outputPath('references.png') })
        await dialog
          .getByRole('button', { name: state === 'child' ? '查看分组' : '查看 BOM', exact: true })
          .click()
        await expect(page.getByTestId('bom-reference-navigation')).toContainText(
          state === 'child' ? childId : bomId
        )
        if (state === 'child') {
          await expect(
            page
              .locator('.bom-group-panel .el-tree-node.is-current')
              .getByText('下级测试分组', { exact: true })
          ).toBeVisible()
          await page
            .locator('.bom-group-panel')
            .screenshot({ path: info.outputPath('located-group.png') })
        }
      }
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
        await page.evaluate(() => document.dispatchEvent(new Event('revoke-bom-group-delete')))
      await confirmation
        .getByRole('button', { name: state === 'cancel' ? '取消' : '删除', exact: true })
        .click()
      if (state === 'clear') {
        await expect(node).toHaveCount(0)
        await expect(page.getByText('BOM 分组已删除', { exact: true })).toBeVisible()
        expect(events).toEqual(['inspect', 'delete'])
      } else if (state === 'concurrent') {
        await expect(page.getByRole('dialog')).toHaveCount(1)
        await expect(page.getByRole('dialog')).toContainText('BOM-REF-001')
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        expect(events).toEqual(['inspect', 'delete', 'inspect'])
      } else if (state === 'zero' || state === 'missing') {
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
  })
}
