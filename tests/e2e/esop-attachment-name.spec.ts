import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

test('ESOP 导入保留完整附件名、清除签名 token，坏编码使用逐行回退', async ({ page }) => {
  await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  const savedDocuments: Array<Record<string, unknown>> = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/rpc/mdm_save_esop_document')) {
      const body = route.request().postDataJSON() as { p_document: Record<string, unknown> }
      savedDocuments.push(body.p_document)
      return route.fulfill({ json: null })
    }
    if (path.endsWith('/mdm_esop_category')) {
      return route.fulfill({
        json: [
          {
            id: 'test-category',
            tenant_id: 'test-tenant',
            parent_id: null,
            category_code: 'ESOP-TEST',
            category_name: '测试分类',
            status: 'enabled',
            sort: 0,
            create_time: '2026-10-01T00:00:00Z',
            update_time: '2026-10-01T00:00:00Z'
          }
        ]
      })
    }
    return route.fulfill({
      json: [],
      headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' }
    })
  })

  await page.goto('/tests/e2e/fixtures/esop-attachment-name.html')
  await expect(page.getByText('测试分类', { exact: true }).first()).toBeVisible()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('ESOP')
  sheet.addRow(['分类编码', '文档编号', '文档名称', '附件地址'])
  sheet.addRow([
    'ESOP-TEST',
    'ESOP-SIGNED',
    '签名附件',
    'https://example.invalid/docs/%E4%BD%9C%E4%B8%9A%E6%8C%87%E5%AF%BC.PDF?token=must-not-save#preview'
  ])
  sheet.addRow(['ESOP-TEST', 'ESOP-BAD', '坏编码附件', 'https://example.invalid/docs/%ZZ.pdf'])
  const longName = `${'长'.repeat(124)}.pdf`
  sheet.addRow([
    'ESOP-TEST',
    'ESOP-LONG',
    '长附件名',
    `https://example.invalid/docs/${encodeURIComponent(longName)}?token=must-not-save`
  ])
  sheet.addRow(['ESOP-TEST', 'ESOP-NOEXT', '无扩展名', 'https://example.invalid/docs/README'])
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ESOP导入.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer())
  })
  await expect.poll(() => savedDocuments.length).toBe(4)
  expect(savedDocuments.map((document) => document.attachment_name)).toEqual([
    '作业指导.PDF',
    'ESOP-BAD.pdf',
    longName,
    'README'
  ])
  expect(savedDocuments.map((document) => document.attachment_type)).toEqual([
    'pdf',
    'pdf',
    'pdf',
    ''
  ])
  expect(savedDocuments[0].attachment_url).toContain('token=must-not-save')
  expect(
    savedDocuments.every((document) => !String(document.attachment_name).includes('must-not-save'))
  ).toBe(true)
  expect(pageErrors).toEqual([])
})
