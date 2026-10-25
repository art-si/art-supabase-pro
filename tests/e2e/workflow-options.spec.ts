import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['users', 'roles', 'delegations']) {
  for (const missing of [false, true]) {
    test(`流程 ${mode} ${missing ? '缺页拒绝部分数据' : '完整读取 1001 条'}`, async ({ page }) => {
      const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `option-${index}` }))
      const offsets: number[] = []
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        expect(url.pathname).toBe(
          `/rest/v1/${mode === 'delegations' ? 'wf_delegation' : mode === 'users' ? 'sys_user' : 'sys_role'}`
        )
        if (mode !== 'delegations') expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
        expect(url.searchParams.get('order')).toBe(
          mode === 'delegations'
            ? 'create_time.desc,id.asc'
            : `${mode === 'users' ? 'user_name' : 'role_name'}.asc,id.asc`
        )
        if (mode === 'users') {
          expect(url.searchParams.get('status')).toBe('eq.1')
          expect(url.searchParams.get('deleted_at')).toBe('is.null')
        } else if (mode === 'roles') expect(url.searchParams.get('enabled')).toBe('eq.true')
        else
          expect(url.searchParams.get('or')).toBe(
            '(delegator_user_id.eq.user-a,delegate_user_id.eq.user-a)'
          )
        expect(route.request().headers().prefer).toContain('count=exact')
        expect(url.searchParams.get('limit')).toBe('500')
        const offset = Number(url.searchParams.get('offset'))
        offsets.push(offset)
        const data = missing && offset === 1000 ? [] : rows.slice(offset, offset + 500)
        return route.fulfill({
          headers: {
            'content-range': data.length ? `${offset}-${offset + data.length - 1}/1001` : '*/1001',
            'access-control-expose-headers': 'content-range'
          },
          json: data
        })
      })
      await page.goto(`/tests/e2e/fixtures/workflow-options.html?mode=${mode}`)
      await page.getByRole('button', { name: '查询流程选项' }).click()
      if (missing) await expect(page.getByTestId('option-result')).toHaveText('查询失败')
      else {
        await expect(page.getByTestId('option-result')).toContainText('option-1000')
        const response = JSON.parse(await page.getByTestId('option-result').innerText())
        expect(response.data).toEqual(rows)
        expect(response.total).toBe(1001)
        expect(response.error).toBeNull()
      }
      expect(offsets).toEqual([0, 500, 1000])
    })
  }
}
