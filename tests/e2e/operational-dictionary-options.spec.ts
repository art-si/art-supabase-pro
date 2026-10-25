import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

for (const mode of [
  'operational-list',
  'master-group',
  'bom-group',
  'activity-formula',
  'formula-history'
]) {
  test(`运营及分组公共字典选项 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const boolean = url.search.includes('commonBoolean')
      const purpose = url.search.includes('mdmFormulaPurpose')
      return route.fulfill({
        json: url.pathname.endsWith('/sys_dictionary')
          ? [
              {
                label: '',
                name: '公共选项名称',
                value: boolean ? 'true' : purpose ? 'report_preparation' : 'minute',
                status: '1'
              },
              { label: '停用选项', value: boolean ? 'false' : 'obsolete', status: '0' }
            ]
          : []
      })
    })
    await page.goto(
      mode === 'operational-list'
        ? '/tests/e2e/fixtures/master-group-reuse.html?mode=project'
        : `/tests/e2e/fixtures/engineering-dictionary-options.html?mode=${mode}`
    )
    if (mode !== 'operational-list') await page.getByRole('button', { name: '打开表单' }).click()
    const scope =
      mode === 'operational-list'
        ? page.locator('.art-search-bar')
        : page.getByRole('dialog').first()
    if (mode === 'master-group' || mode === 'bom-group') {
      const enabled = scope.getByRole('radiogroup', { name: '启用状态', exact: true })
      await expect(enabled.getByText('公共选项名称', { exact: true })).toBeVisible()
      await expect(enabled.getByText('停用选项', { exact: true })).toHaveCount(0)
      await expect(enabled.getByRole('radio', { name: '公共选项名称', exact: true })).toBeChecked()
    } else {
      const fieldLabel = mode === 'operational-list' ? '启用状态' : '活动类型'
      await scope
        .locator('.el-form-item')
        .filter({ has: page.getByText(fieldLabel, { exact: true }) })
        .locator('.el-select')
        .click()
      await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
      await page.keyboard.press('Escape')
      if (mode === 'formula-history') {
        await scope
          .locator('.el-form-item')
          .filter({ has: page.getByText('用途', { exact: true }) })
          .locator('.el-select')
          .click()
        await expect(
          page.getByRole('option', { name: '历史用途（legacy-purpose）', exact: true })
        ).toBeVisible()
        await page.keyboard.press('Escape')
      } else if (mode === 'activity-formula') {
        await scope
          .locator('.el-form-item')
          .filter({ has: page.getByText('用途', { exact: true }) })
          .locator('.el-select')
          .click()
        await page.getByRole('option', { name: '汇报 · 准备活动', exact: true }).click()
        await scope.getByRole('button', { name: '新增参数分组', exact: true }).click()
        const parameter = page.getByRole('dialog', { name: '新增参数节点', exact: true })
        await parameter.getByText('参数', { exact: true }).click()
        await parameter
          .locator('.el-form-item')
          .filter({ has: page.getByText('活动单位', { exact: true }) })
          .locator('.el-select')
          .click()
        await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
        await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
        await parameter.screenshot({ path: info.outputPath('activity-unit.png') })
        await parameter.getByRole('button', { name: '取消', exact: true }).click()
      }
    }
    await page.screenshot({ path: info.outputPath(`${mode}.png`) })
    if (mode === 'master-group' || mode === 'bom-group') {
      await scope
        .getByRole('radiogroup', { name: '启用状态', exact: true })
        .scrollIntoViewIfNeeded()
      await scope.screenshot({ path: info.outputPath(`${mode}-options.png`) })
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
