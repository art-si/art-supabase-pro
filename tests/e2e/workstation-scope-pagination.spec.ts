import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['all', 'selected', 'error'] as const) {
  test(`工位范围完整分页与唯一排序 ${mode}`, async ({ page }) => {
    const calls: Record<string, number[]> = {}
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const table = url.pathname.split('/').pop() ?? ''
      expect(['mdm_production_department', 'mdm_work_center']).toContain(table)
      expect(url.searchParams.get('order')).toBe('sort.asc,code.asc,id.asc')
      expect(url.searchParams.get('tenant_id')).toBe(mode === 'selected' ? 'eq.tenant-a' : null)
      const offset = Number(url.searchParams.get('offset'))
      expect(url.searchParams.get('limit')).toBe('500')
      ;(calls[table] ??= []).push(offset)
      if (mode === 'error' && table === 'mdm_work_center' && offset === 500)
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      return route.fulfill({
        json: Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => ({
          id: `${table}-${offset + index}`,
          tenant_id: mode === 'selected' ? 'tenant-a' : index % 2 ? 'tenant-a' : 'tenant-b',
          sort: 1,
          code: `CODE-${offset + index}`,
          name: '合成分页测试记录'
        }))
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/production-pagination.html${mode === 'selected' ? '?scopeTenant=tenant-a' : ''}`
    )
    await page.getByRole('button', { name: '加载工位范围' }).click()
    const output = page.getByTestId('result')
    if (mode === 'error') {
      await expect(output).toHaveText('范围查询失败，未返回部分结果')
    } else {
      await expect(output).toContainText('mdm_work_center-500')
      const result = JSON.parse((await output.textContent()) ?? '{}')
      for (const [key, table] of [
        ['departments', 'mdm_production_department'],
        ['workCenters', 'mdm_work_center']
      ]) {
        expect(result[key]).toEqual(Array.from({ length: 501 }, (_, index) => `${table}-${index}`))
      }
    }
    expect(calls).toEqual({ mdm_production_department: [0, 500], mdm_work_center: [0, 500] })
  })
}
