import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const target of ['item', 'type'] as const) {
  for (const mode of ['revoked', 'create', 'blank'] as const) {
    test(`辅助核算 ${target} ${mode}`, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      let writes = 0
      const dictionaryItems: Record<string, Array<[string, string]>> = {
        commonEnabledStatus: [
          ['enabled', '启用'],
          ['disabled', '停用']
        ],
        fmsAuxiliarySourceType: [
          ['manual', '手工维护'],
          ['project', '项目'],
          ['customer', '客户']
        ]
      }
      await page.route('**/rest/v1/sys_dictionary?*', (route) => {
        const code = new URL(route.request().url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '')
        return route.fulfill({
          json: Object.entries(dictionaryItems)
            .filter(([type]) => !code || code === type)
            .flatMap(([type, rows]) =>
              rows.map(([value, label], index) => ({
                id: `${type}-${value}`,
                type_id: type,
                code: value,
                value,
                label,
                sort: index,
                status: '1',
                dict_type_table: { code: type, name: type }
              }))
            )
        })
      })
      page.on('request', (request) => {
        if (
          /\/rest\/v1\/fms_auxiliary_(type|item)(\?|$)/.test(request.url()) &&
          request.method() === 'POST'
        ) {
          const payload = request.postDataJSON()
          expect(payload.account_set_id).toBe('cccccccc-cccc-4ccc-accc-cccccccccccc')
          expect(payload[target === 'item' ? 'item_code' : 'type_code']).toBe('TEST001')
          expect(payload[target === 'item' ? 'item_name' : 'type_name']).toBe('测试保存撤权')
          expect(payload.is_enabled).toBe(true)
          expect(payload.sort).toBe(0)
          expect(payload.remark).toBeNull()
          expect(payload).not.toHaveProperty('id')
          expect(payload).not.toHaveProperty('create_time')
        }
      })
      await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure**', (route) =>
        route.fulfill({
          json: {
            records: [
              {
                id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
                accountSetCode: 'TEST',
                accountSetName: '测试账套',
                status: 'active'
              }
            ],
            total: 1
          }
        })
      )
      await page.route('**/rest/v1/fms_auxiliary_type?*', (route) => {
        if (route.request().method() !== 'GET') {
          writes += 1
          return route.fulfill({
            json: { id: 'dddddddd-dddd-4ddd-addd-dddddddddddd', ...route.request().postDataJSON() }
          })
        }
        return route.fulfill({
          json: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              type_code: 'AUX001',
              type_name: '测试核算维度',
              source_type: 'manual',
              is_system: false,
              is_enabled: true,
              sort: 1
            }
          ]
        })
      })
      await page.route('**/rest/v1/fms_auxiliary_item?*', (route) => {
        if (route.request().method() !== 'GET') writes += 1
        return route.fulfill({
          json:
            route.request().method() === 'GET'
              ? []
              : { id: 'dddddddd-dddd-4ddd-addd-dddddddddddd', ...route.request().postDataJSON() }
        })
      })
      await page.goto(
        `/tests/e2e/fixtures/record-delete-context.html?target=accounting-auxiliary&auxiliaryPermission=${target === 'item' ? 'Add' : 'AddType'}`
      )
      await page
        .getByRole('button', { name: target === 'item' ? '新增项目' : '新增维度', exact: true })
        .click()
      const dialog = page.getByRole('dialog')
      const code = dialog.getByRole('textbox', {
        name: target === 'item' ? '* 项目编码' : '* 维度编码',
        exact: true
      })
      const name = dialog.getByRole('textbox', {
        name: target === 'item' ? '* 项目名称' : '* 维度名称',
        exact: true
      })
      await code.fill('TEST001')
      await name.fill('测试保存撤权')
      if (mode === 'blank') {
        await name.fill('   ')
        if (target === 'item') await code.fill('   ')
        await dialog
          .getByRole('button', { name: target === 'item' ? '创建项目' : '创建维度', exact: true })
          .click()
        await expect(
          dialog.getByText(target === 'item' ? '请输入项目名称' : '请输入维度名称', { exact: true })
        ).toBeVisible()
        if (target === 'item')
          await expect(dialog.getByText('请输入项目编码', { exact: true })).toBeVisible()
        await expect(name).toHaveValue('   ')
        expect(writes).toBe(0)
        await page.screenshot({
          path: testInfo.outputPath('blank-required.png'),
          animations: 'disabled'
        })
        return
      }
      if (mode === 'create') {
        await name.fill('  测试保存撤权  ')
        if (target === 'item') await code.fill('  TEST001  ')
        await dialog.getByRole('spinbutton', { name: '排序号', exact: true }).fill('0')
        await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('   ')
      }
      await expect(dialog.getByRole('radio', { name: '启用', exact: true })).toBeChecked()
      if (target === 'type')
        await expect(
          dialog.locator('.el-select__selected-item').filter({ hasText: '手工维护' })
        ).toBeVisible()
      if (mode === 'revoked')
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((element: HTMLButtonElement) => element.click())
      await dialog
        .getByRole('button', { name: target === 'item' ? '创建项目' : '创建维度', exact: true })
        .click()
      if (mode === 'create') {
        await expect(dialog).not.toBeVisible()
        expect(writes).toBe(1)
        return
      }
      await expect(
        page.getByText(
          `${target === 'item' ? '核算项目' : '核算维度'}操作权限已变化，请刷新页面后重试`,
          { exact: true }
        )
      ).toBeVisible()
      await expect(name).toHaveValue('测试保存撤权')
      await expect(dialog).toBeVisible()
      expect(writes).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath('permission-revoked.png'),
        animations: 'disabled'
      })
    })
  }
}
