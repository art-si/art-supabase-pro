import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
for (const mode of ['person', 'department', 'template', 'shift']) {
  test(`生产身份公共选项 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
          ? [
              {
                label: '',
                name: '公共身份选项',
                value: mode === 'shift' ? 'single' : 'test-option',
                status: '1'
              },
              { label: '停用字典项', value: 'obsolete', status: '0' }
            ]
          : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.goto(`/tests/e2e/fixtures/production-identity-options.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开编辑', exact: true }).click()
    const dialog = page.getByRole('dialog', {
      name: {
        person: '新增生产人员',
        department: '新增部门 / 产线',
        template: '新增作业模板',
        shift: '新增排班'
      }[mode],
      exact: true
    })
    if (mode === 'template')
      await dialog.getByRole('button', { name: '添加任务项', exact: true }).click()
    if (mode === 'shift') {
      const field = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText('有效方式', { exact: true }) })
      await field.scrollIntoViewIfNeeded()
      await field.getByText('公共身份选项', { exact: true }).click()
      await expect(field.getByRole('radio', { name: '公共身份选项', exact: true })).toBeChecked()
      await expect(field.getByText('停用字典项', { exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('有效方式.png') })
    }
    for (const label of mode === 'person'
      ? ['工作类型', '性别']
      : mode === 'department'
        ? ['类型']
        : mode === 'template'
          ? ['输入方式']
          : []) {
      if (mode === 'template') {
        const inputs = dialog.getByRole('combobox', { name: label, exact: true })
        await expect(inputs).toHaveCount(2)
        const select = dialog
          .locator('.el-select')
          .filter({
            has: page.getByRole('combobox', { name: label, exact: true })
          })
          .nth(1)
        await select.scrollIntoViewIfNeeded()
        await select.click()
        await expect(page.getByRole('option', { name: '公共身份选项', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
        await page.getByRole('option', { name: '公共身份选项', exact: true }).click()
        const copy = dialog.getByRole('button', { name: '复制任务项 2', exact: true })
        const remove = dialog.getByRole('button', { name: '删除任务项 2', exact: true })
        await copy.scrollIntoViewIfNeeded()
        for (const button of [copy, remove]) {
          expect(
            await button.evaluate((element) => {
              const cell = element.closest('td')
              if (!cell) throw new Error('行操作缺少所属表格单元格')
              const rect = element.getBoundingClientRect()
              const boundary = cell.getBoundingClientRect()
              return rect.left >= boundary.left && rect.right <= boundary.right
            })
          ).toBe(true)
        }
        await expect(
          dialog.locator('.business-table-row-actions .business-table-row-actions')
        ).toHaveCount(0)
        await page.screenshot({ path: info.outputPath(`${label}.png`) })
        continue
      }
      const field = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
      const select = field.locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      await expect(page.getByRole('option', { name: '公共身份选项', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共身份选项', exact: true }).click()
      await expect(field).toContainText('公共身份选项')
      expect(
        await select.evaluate((element) => {
          const parent = element.closest('.el-dialog')
          if (!parent) throw new Error('控件缺少所属弹窗')
          return element.getBoundingClientRect().right - parent.getBoundingClientRect().right
        })
      ).toBeLessThanOrEqual(0)
      await page.screenshot({ path: info.outputPath(`${label}.png`) })
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
