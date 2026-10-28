import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const fixture = '/tests/e2e/fixtures/upload-source-label.html'

for (const file of [
  { name: 'README', bytes: 'extensionless content', suffix: '' },
  { name: 'REPORT.PDF', bytes: 'PDF bytes differ', suffix: 'pdf' }
]) {
  test(`默认附件上传保留 ${file.name} 原名并生成规范对象名`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await prepareIsolatedSession(page)
    const unknownBackend: string[] = []
    const storagePaths: string[] = []
    const inserts: Record<string, unknown>[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (
        ['sys_param', 'sys_dictionary', 'sys_tenant'].includes(url.pathname.split('/').at(-1) || '')
      )
        return route.fulfill({ json: [] })
      unknownBackend.push(url.pathname)
      return route.abort('blockedbyclient')
    })
    await page.route('**/rest/v1/sys_attachment?*', (route: Route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: null })
      const payload: unknown = route.request().postDataJSON()
      const inserted = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown>
      inserts.push(inserted)
      return route.fulfill({ json: { ...inserted, id: `attachment-${file.name}` } })
    })
    await page.route('**/storage/v1/**', (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname)
      if (route.request().method() !== 'POST' || !path.includes('/object/attachments/')) {
        unknownBackend.push(path)
        return route.abort('blockedbyclient')
      }
      storagePaths.push(path.split('/object/attachments/')[1] || '')
      return route.fulfill({ json: { Key: storagePaths.at(-1) } })
    })

    await page.goto(fixture, { waitUntil: 'domcontentloaded' })
    const normal = page.locator('[data-mode="normal"]')
    await normal.locator('input[type="file"]').setInputFiles({
      name: file.name,
      mimeType: file.suffix === 'pdf' ? 'application/pdf' : 'text/plain',
      buffer: Buffer.from(file.bytes)
    })
    await expect(normal.locator('.art-upload-file__item')).toContainText(file.name)
    await expect.poll(() => inserts.length).toBe(1)

    const inserted = inserts[0]
    expect(inserted.tenant_id).toBe(tenantId)
    expect(inserted.origin_name).toBe(file.name)
    expect(inserted.suffix).toBe(file.suffix)
    expect(inserted.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(inserted.object_name).toBe(
      file.suffix ? `${inserted.hash}.${file.suffix}` : inserted.hash
    )
    expect(storagePaths).toEqual([`${inserted.storage_path}/${inserted.object_name}`])
    expect(storagePaths[0]).not.toMatch(/\.$/)
    expect(unknownBackend).toEqual([])
    expect(pageErrors).toEqual([])
    if (file.suffix === 'pdf')
      await page.screenshot({
        path: info.outputPath('attachment-upload-final.png'),
        fullPage: true
      })
  })
}
