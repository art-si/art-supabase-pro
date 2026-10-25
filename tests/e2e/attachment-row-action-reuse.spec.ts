import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('公共附件操作遵守移除权限并复用预览入口', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/date-format-reuse.html?attachmentActions=true')
  const actions = page.locator('.business-table-row-actions')
  await expect(actions).toHaveCount(1, { timeout: 120_000 })
  await expect(actions.getByRole('button')).toHaveCount(2)
  await expect(actions.getByRole('button', { name: '移除附件', exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    window.open = (url) => {
      document.body.dataset.previewUrl = String(url)
      return window
    }
  })
  await actions.getByRole('button', { name: '查看附件', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-preview-url', /file-preview\?key=/)
  await page.getByRole('button', { name: '切换附件编辑权限' }).click()
  await expect(actions.getByRole('button')).toHaveCount(3)
  await actions.getByRole('button', { name: '移除附件', exact: true }).click()
  await expect(page.getByTestId('attachment-remove-count')).toHaveText('1')
  await page.screenshot({ path: info.outputPath('editable-attachment-actions.png') })
  await page.getByRole('button', { name: '切换附件编辑权限' }).click()
  await expect(actions.getByRole('button')).toHaveCount(2)
})

for (const [name, rpc] of [
  ['accident', 'vms_get_vehicle_accident_secure'],
  ['maintenance', 'vms_get_vehicle_maintenance_secure'],
  ['inspection', 'vms_get_vehicle_routine_inspection_secure'],
  ['insurance', 'vms_get_vehicle_insurance_secure'],
  ['annual-inspection', 'vms_get_vehicle_inspection_secure']
] as const) {
  test(`车辆附件公共操作布局 ${name}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      if (!route.request().url().endsWith(`/rpc/${rpc}`)) return route.fulfill({ json: [] })
      return route.fulfill({
        json: {
          id: 'display-test',
          plateNo: '测试车辆',
          companyName: '测试公司',
          maintenanceItems: [],
          attachments: [
            {
              name: '测试附件.pdf',
              url: 'https://example.com/test.pdf',
              fileType: 'pdf',
              fileSize: '1 KB'
            }
          ],
          fieldAccess: {
            documents: 'read',
            maintenanceItems: 'read',
            maintenanceIdentifiers: 'read'
          }
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/date-format-reuse.html?vehicle=${name}`)
    const actions = page.locator('.business-table-row-actions')
    await expect(actions).toHaveCount(1, { timeout: 120_000 })
    await actions.scrollIntoViewIfNeeded()
    await expect(actions.getByRole('button', { name: '查看附件', exact: true })).toBeVisible()
    await expect(actions.getByRole('button', { name: '下载附件', exact: true })).toBeVisible()
    const geometry = await actions.evaluate((element) => {
      const buttons = [...element.querySelectorAll('button')].map((button) =>
        button.getBoundingClientRect()
      )
      const cell = element.closest('.cell')!.getBoundingClientRect()
      return {
        gap: buttons[1].left - buttons[0].right,
        sameRow: buttons[0].top === buttons[1].top,
        fits: buttons[1].right <= cell.right + 1,
        visible: buttons[0].left >= 0 && buttons[1].right <= innerWidth
      }
    })
    expect(geometry).toEqual({ gap: 8, sameRow: true, fits: true, visible: true })
    await page.screenshot({ path: info.outputPath('attachment-actions.png') })
    expect(errors).toEqual([])
  })
}
