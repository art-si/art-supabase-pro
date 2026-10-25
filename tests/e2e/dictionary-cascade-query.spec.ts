import { expect, test } from '@playwright/test'

// Read-only integration test: exercise the actual provider and PostgREST schema,
// not a mocked relationship. Never persist or print dictionary/business records.
test('dictionary types load their cascade parent even when the list is filtered', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000)
  const failedDictionaryRequests: number[] = []
  page.on('response', (response) => {
    if (response.url().includes('/rest/v1/sys_dict_type?') && response.status() >= 400) {
      failedDictionaryRequests.push(response.status())
    }
  })
  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })
  const result = await page.evaluate(async () => {
    // This source-provider regression runs against the existing E2E Vite server.
    const modulePath = '/src/api/data-center.ts'
    const { fetchDictionaryTypeList } = await import(/* @vite-ignore */ modulePath)
    const response = await fetchDictionaryTypeList()
    const rows: Array<{
      id: string
      name: string
      cascadeParentTypeId?: string | null
      cascadeParentType?: { id: string; name: string; code: string } | null
    }> = response.data ?? []
    const child = rows.find((row) => row.cascadeParentTypeId && row.cascadeParentType)
    if (!child) throw new Error('缺少可验证的级联字典类型，不能跳过关联回归')
    const filtered = await fetchDictionaryTypeList({ name: child.name })
    const match = filtered.data?.find((row: { id: string }) => row.id === child.id)
    return {
      hasRows: rows.length > 0,
      rootHasNoCascade: rows.some(
        (row) => !row.cascadeParentTypeId && row.cascadeParentType === null
      ),
      parentMatches: child.cascadeParentType?.id === child.cascadeParentTypeId,
      filteredParentMatches: match?.cascadeParentType?.id === child.cascadeParentTypeId,
      filteredNamePreserved: match?.cascadeParentType?.name === child.cascadeParentType?.name
    }
  })
  expect(result).toEqual({
    hasRows: true,
    rootHasNoCascade: true,
    parentMatches: true,
    filteredParentMatches: true,
    filteredNamePreserved: true
  })
  expect(failedDictionaryRequests).toEqual([])
  await expect(page.getByText('字典目录', { exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.dict-type-tree__viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000
  })
  await expect(page.locator('.dict-tree-panel .el-tree-node').first()).toBeVisible()
  expect(failedDictionaryRequests).toEqual([])
  await page
    .locator('.dict-page')
    .screenshot({ path: testInfo.outputPath('dictionary-loaded.png') })
})
