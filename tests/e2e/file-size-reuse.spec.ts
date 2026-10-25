import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import type { ProjectCapabilitySnapshot } from '../../src/types/supabase-ai-assistant'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
const snapshot: ProjectCapabilitySnapshot = {
  projectRef: 'test-project',
  capturedAt: '2026-10-09T00:00:00Z',
  database: {
    version: '17',
    sizeBytes: 2 * 1024 ** 3,
    activeConnections: 1,
    maxConnections: 100,
    publicTables: 1,
    publicViews: 0,
    estimatedRows: 1,
    cacheHitPercent: 99
  },
  security: {
    publicTables: 1,
    rlsEnabledTables: 1,
    forceRlsTables: 0,
    rlsCoveragePercent: 100,
    policyCount: 1,
    invalidIndexes: 0,
    unindexedForeignKeys: 0,
    views: 0,
    securityInvokerViews: 0,
    tablesWithoutRls: [],
    unindexedForeignKeyTables: []
  },
  performance: {
    sequentialScans: 0,
    indexScans: 1,
    deadRows: 0,
    statements: { enabled: false, trackedStatements: 0 }
  },
  auth: { enabled: true, users: 1, confirmedUsers: 1, active30d: 1 },
  storage: {
    enabled: true,
    buckets: 1,
    publicBuckets: 0,
    objects: 1,
    totalBytes: 1024 ** 3,
    policies: 1
  },
  realtime: { enabled: false, publishedTables: 0 },
  cron: { enabled: false, jobs: 0, activeJobs: 0 },
  queues: { enabled: false, queues: 0 },
  vectors: { enabled: false, columns: 0, indexes: 0 },
  extensions: { installed: [], vaultEnabled: false }
}
for (const mode of ['tms', 'capability', 'documents']) {
  test(`业务文件大小公共格式 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/smis_list_documents_secure')
          ? {
              records: [
                {
                  id: 'test-document',
                  title: '测试空文件',
                  categoryId: null,
                  categoryName: '未分类',
                  status: 'published',
                  fileName: 'empty.pdf',
                  fileType: 'pdf',
                  fileSize: 0,
                  versionNo: 1,
                  scopes: []
                }
              ],
              total: 1,
              overview: { total: 1, published: 1, draft: 0, scheduled: 0 }
            }
          : []
      })
    })
    await page.route('**/functions/v1/ai-project-assistant', (route) =>
      route.fulfill({ json: { data: snapshot } })
    )
    await page.goto(`/tests/e2e/fixtures/file-size-reuse.html?mode=${mode}`)
    if (mode === 'capability') {
      await page.getByRole('button', { name: '打开能力中心', exact: true }).click()
      await expect(page.getByText('2.0 GB', { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('database-size.png') })
      await page.getByText('1.0 GB', { exact: true }).scrollIntoViewIfNeeded()
    } else if (mode === 'documents') {
      const list = page.getByRole('radio', { name: '列表视图', exact: true })
      await page.locator('.el-segmented__item').filter({ has: list }).click()
      await expect(page.getByText('0 B', { exact: true })).toBeVisible()
      await page.getByText('0 B', { exact: true }).scrollIntoViewIfNeeded()
      const actions = page
        .locator(
          '.el-table__fixed-right .business-table-row-actions, .el-table__body .business-table-row-actions'
        )
        .first()
      await expect(actions).toHaveCount(1)
      await expect(actions.locator('.art-button-table')).toHaveCount(1)
      await expect(actions.locator('.el-dropdown')).toHaveCount(1)
      await actions.scrollIntoViewIfNeeded()
      const layout = await actions.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const cell = element.closest('td')!.getBoundingClientRect()
        return { gap: getComputedStyle(element).gap, right: box.right, cellRight: cell.right }
      })
      expect(layout.gap).toBe('8px')
      expect(layout.right).toBeLessThanOrEqual(layout.cellRight)
    }
    if (mode !== 'documents') {
      const size = page.getByText('1.0 GB', { exact: true })
      await expect(size).toBeVisible()
      await size.scrollIntoViewIfNeeded()
      if (mode === 'capability') {
        expect(
          await size.evaluate((element) => element.scrollWidth - element.clientWidth)
        ).toBeLessThanOrEqual(1)
      }
    }
    if (mode === 'tms') {
      const bounds = await page.locator('.waybill-document-panel__gallery').evaluate((gallery) => {
        const card = gallery.querySelector('article')!.getBoundingClientRect()
        const section = gallery.parentElement!.getBoundingClientRect()
        return { cardBottom: card.bottom, sectionBottom: section.bottom }
      })
      expect(bounds.cardBottom).toBeLessThanOrEqual(bounds.sectionBottom)
    }
    await page.screenshot({ path: info.outputPath('business-file-size.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
test('公共文件大小格式与上传文案一致', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/file-size-reuse.html')
  await expect(page.getByText('0 B', { exact: true })).toBeVisible()
  await expect(page.getByText('大小未知', { exact: true })).toBeVisible()
  await expect(page.getByText('1.0 GB', { exact: true })).toBeVisible()
  await expect(page.getByText(/^单个文件不超过 20 MB/)).toBeVisible()
  await expect(page.getByText(/^单个文件不超过 1 GB/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('file-size.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
