import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
test('岗位指导书复用公共行操作', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      json: path.endsWith('/smis_list_position_work_instructions_secure')
        ? {
            records: [
              {
                id: 'test-instruction',
                tenantId: 'test-tenant',
                instructionName: '测试岗位指导书',
                fileNumber: 'WI-TEST',
                fileType: 'pdf',
                scopes: []
              }
            ],
            total: 1
          }
        : path.endsWith('/smis_get_work_instruction_position_tree_secure')
          ? { organizations: [], positions: [] }
          : []
    })
  })
  await page.goto('/tests/e2e/fixtures/work-instruction-actions.html')
  const actions = page
    .locator('tbody tr')
    .filter({ hasText: 'WI-TEST' })
    .first()
    .locator('.business-table-row-actions')
  await expect(actions).toHaveCount(1)
  await expect(actions.locator('.art-button-table')).toHaveCount(2)
  await expect(actions.locator('.business-table-row-actions')).toHaveCount(0)
  await actions.scrollIntoViewIfNeeded()
  expect(await actions.evaluate((element) => getComputedStyle(element).gap)).toBe('8px')
  expect(
    await actions.evaluate((element) => {
      const cell = element.closest('td')
      if (!cell) throw new Error('行操作缺少所属单元格')
      const boundary = cell.getBoundingClientRect()
      return [...element.querySelectorAll('.art-button-table')].every((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left >= boundary.left && rect.right <= boundary.right
      })
    })
  ).toBe(true)
  await page.screenshot({ path: info.outputPath('row-actions.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
