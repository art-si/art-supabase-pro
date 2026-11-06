import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const operation of ['create', 'update'] as const) {
  test(`共享菜单定义保持 pro 原有${operation}请求契约`, async ({ page }) => {
    const writes: Array<{ method: string; body: unknown }> = []
    await page.route('**/rest/v1/sys_menu*', async (route) => {
      writes.push({ method: route.request().method(), body: route.request().postDataJSON() })
      await route.fulfill({
        status: 204,
        headers: { 'content-range': '*/1', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto('/tests/e2e/fixtures/menu-sort-query.html')
    await page
      .getByRole('button', { name: operation === 'create' ? '新增定义' : '编辑定义', exact: true })
      .click()
    await expect(page.getByTestId('menu-sort-result')).toHaveText('定义保存成功')
    expect(writes).toHaveLength(operation === 'create' ? 1 : 2)
    expect(writes[0].method).toBe(operation === 'create' ? 'POST' : 'PATCH')
    expect(writes[0].body).toMatchObject({
      name: 'DefinitionExample',
      path: '/definition',
      meta: { title: '定义示例' }
    })
    expect(writes[0].body).not.toHaveProperty('version')
    expect(writes[0].body).not.toHaveProperty('collection_version')
    if (operation === 'update') expect(writes[1]).toEqual({ method: 'PATCH', body: { sort: 2 } })
  })
}
