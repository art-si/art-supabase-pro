import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('经营主数据删除核验去重目标和服务端实际数量', async ({ page }) => {
  await prepareIsolatedSession(page)
  const ids = ['11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102']
  let count: number | null = 2
  let writes = 0
  await page.route('**/rest/v1/mdm_project?*', (route) => {
    expect(route.request().method()).toBe('DELETE')
    const filter = new URL(route.request().url()).searchParams.get('id')
    expect(filter).toBe(`in.(${ids.join(',')})`)
    writes += 1
    return route.fulfill({
      headers: {
        'content-range': count === null ? '*' : `*/${count}`,
        'access-control-expose-headers': 'content-range'
      },
      json: count === 2 ? ids.map((id) => ({ id })) : []
    })
  })
  await page.goto('/tests/e2e/fixtures/master-group-reuse.html')
  await expect(page.getByRole('textbox', { name: '搜索分组', exact: true })).toBeVisible()
  const remove = (targets: string[]) =>
    page.evaluate(async (selectedIds) => {
      const modulePath = '/modules/art-supabase-mdm/src/api/modules/operational-master.ts'
      const { deleteOperationalMasters } = await import(/* @vite-ignore */ modulePath)
      try {
        await deleteOperationalMasters('project', selectedIds, {
          showMessage: false,
          showErrorMessage: false,
          showReferenceFeedback: false
        })
        return 'deleted'
      } catch (error) {
        return error instanceof Error ? error.message : '删除失败'
      }
    }, targets)
  expect(await remove([...ids, ids[0]])).toBe('deleted')
  for (const result of [0, null, 1]) {
    count = result
    expect(await remove(ids)).not.toBe('deleted')
    await expect(page.locator('.el-message--success')).toHaveCount(0)
  }
  expect(writes).toBe(4)
  expect(await remove([])).toBe('请选择需要删除的主数据')
  expect(writes).toBe(4)
})
