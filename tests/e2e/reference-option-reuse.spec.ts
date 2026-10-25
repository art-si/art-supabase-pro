import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const scenario of [
  {
    feature: 'attendance',
    entity: 'record',
    kind: 'shift',
    field: '执行班次',
    title: '新增日考勤记录'
  },
  {
    feature: 'mobility',
    entity: 'opportunity',
    kind: 'position',
    field: '目标岗位',
    title: '新增内部机会'
  }
]) {
  test(`${scenario.field}使用统一名称编码并保留可选身份`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const kind = route.request().postDataJSON()?.p_kind
      return route.fulfill({
        json:
          kind === scenario.kind
            ? [
                {
                  id: '22222222-2222-4222-8222-222222222222',
                  name: '测试关联项',
                  code: 'REF-001',
                  status: 'active'
                },
                {
                  id: '33333333-3333-4333-8333-333333333333',
                  name: '未编码关联项',
                  code: null,
                  status: 'active'
                }
              ]
            : []
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-talent-dialogs.html?feature=${scenario.feature}&entity=${scenario.entity}`,
      { waitUntil: 'domcontentloaded', timeout: 120_000 }
    )
    const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(dialog).toBeVisible()
    const field = dialog.getByRole('combobox', { name: new RegExp(`${scenario.field}$`) })
    await field.click()
    await expect(
      page.getByRole('option', { name: '测试关联项 · REF-001', exact: true })
    ).toBeVisible()
    await page.getByRole('option', { name: '未编码关联项', exact: true }).click()
    await expect(dialog.getByText('未编码关联项', { exact: true })).toBeVisible()
    await field.click()
    await expect(page.getByRole('option', { name: '未编码关联项', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.keyboard.press('Escape')
    await page.screenshot({
      path: testInfo.outputPath('reference-selected.png'),
      animations: 'disabled'
    })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath('reference-mobile.png'),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}
