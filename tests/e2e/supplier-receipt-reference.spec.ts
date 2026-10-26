import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const withView of [true, false])
  test(`两张收款引用${withView ? '可联查' : '无权限不联查'}且不可删除历史`, async ({
    page
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/sys_dictionary?**', (route) =>
      route.fulfill({
        json: [
          {
            id: 'approved',
            code: 'approved',
            value: 'approved',
            label: '已审核',
            status: '1',
            dict_type_table: { code: 'arDocumentStatus', name: '单据状态' }
          },
          {
            id: 'confirmed',
            code: 'confirmed',
            value: 'confirmed',
            label: '已确认',
            status: '1',
            dict_type_table: { code: 'arDocumentStatus', name: '单据状态' }
          }
        ]
      })
    )
    const theme = info.project.name.includes('dark') ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/supplier-receipt-reference.html?theme=${theme}${withView ? '&withView' : ''}`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 }
    )
    await page.getByRole('button', { name: '检查用途引用', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('SK-QA-1')
    await expect(dialog).toContainText('SK-QA-2')
    await expect(dialog).toContainText('已审核')
    await expect(dialog).toContainText('已确认')
    await expect(dialog).toContainText('保留业务历史')
    await expect(dialog.getByRole('button', { name: '查看关联', exact: true })).toHaveCount(
      withView ? 2 : 0
    )
    await captureBusinessEvidence(dialog, {
      path: info.outputPath('receipt-purpose-reference.png')
    })
    if (withView) {
      await dialog.getByRole('button', { name: '查看关联', exact: true }).nth(1).click()
      await expect(page.locator('main[data-record-id="receipt-2"]')).toBeVisible()
      await expect(page.getByText('收款单定位：SK-QA-2', { exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
  })
