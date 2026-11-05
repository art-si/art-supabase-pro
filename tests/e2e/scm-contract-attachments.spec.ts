import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/scm-contract-attachments.html'

test('销售和采购合同附件展示空态、长文件名与只读操作', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto(fixture, { waitUntil: 'commit' })

  await expect(page.getByText('合同附件', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '上传附件' })).toBeVisible()
  await expect(page.getByText('暂无数据')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('sales-contract-attachments-empty.png'),
    animations: 'disabled'
  })

  await page.getByRole('button', { name: '注入长文件名' }).click()
  await expect(page.getByTestId('attachment-count')).toHaveText('1')
  await expect(page.getByRole('cell', { name: /合同附件名称很长需要保持可读/ })).toBeVisible()
  await page.getByRole('button', { name: '模拟保存并回显' }).click()
  await expect(page.getByTestId('attachment-count')).toHaveText('1')
  await expect(page.getByRole('button', { name: '移除附件' })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('sales-contract-attachments-filled.png'),
    animations: 'disabled'
  })

  await page.getByRole('button', { name: '切换只读' }).click()
  await expect(page.getByRole('button', { name: '上传附件' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '移除附件' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: /合同附件名称很长需要保持可读/ })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('sales-contract-attachments-readonly.png'),
    animations: 'disabled'
  })

  await page.getByRole('button', { name: '采购合同' }).click()
  await expect(page.getByTestId('contract-kind')).toHaveText('purchase')
  await expect(page.getByRole('cell', { name: /合同附件名称很长需要保持可读/ })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('purchase-contract-attachments-narrow.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

test('切换租户后忽略旧上传的迟到回调', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let releaseLookup: (() => void) | undefined
  let lookupStarted: (() => void) | undefined
  const lookupSeen = new Promise<void>((resolve) => (lookupStarted = resolve))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/storage/v1/object/**', (route) =>
    route.fulfill({ json: { Key: 'old-tenant-contract' } })
  )
  await page.route('**/rest/v1/sys_attachment?**', async (route) => {
    if (route.request().method() !== 'GET')
      return route.fulfill({
        json: {
          id: 'old-tenant-resource',
          tenant_id: '11111111-1111-4111-8111-111111111111',
          origin_name: '旧租户合同.pdf',
          object_name: 'old-tenant-contract.pdf',
          url: 'https://example.test/old-tenant-contract.pdf',
          suffix: 'pdf',
          size_byte: 27,
          size_info: '27 B'
        }
      })
    lookupStarted?.()
    await new Promise<void>((resolve) => (releaseLookup = resolve))
    await route.fulfill({ json: [] })
  })
  await page.goto(fixture, { waitUntil: 'commit' })
  await page.locator('input[type="file"]').setInputFiles({
    name: '旧租户合同.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('contract attachment fixture')
  })
  await lookupSeen
  await page.getByRole('button', { name: '读取上传状态' }).click()
  await expect(page.getByTestId('pending-upload')).toHaveText('true')
  await page.getByRole('button', { name: '切换租户' }).click()
  const storedResource = page.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/sys_attachment') && response.request().method() === 'POST'
  )
  releaseLookup?.()
  await storedResource
  await page.waitForTimeout(100)
  await expect(page.getByTestId('attachment-count')).toHaveText('0')
  await expect(page.getByText('暂无数据')).toBeVisible()
  expect(errors).toEqual([])
})
