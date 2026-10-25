import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
const record = (name: string) => ({
  id: '00000000-0000-4000-a000-000000000001',
  category_name: name,
  category_code: 'LB-001',
  status: '1',
  parent_id: null
})

for (const scope of [
  { name: '平台全部', query: '', tenant: '11111111-1111-4111-a111-111111111111' },
  {
    name: '平台指定',
    query: '&tenant=22222222-2222-4222-a222-222222222222',
    tenant: '22222222-2222-4222-a222-222222222222'
  },
  { name: '普通本人', query: '&ordinary=true', tenant: '11111111-1111-4111-a111-111111111111' },
  {
    name: '普通伪造范围',
    query: '&ordinary=true&tenant=22222222-2222-4222-a222-222222222222',
    tenant: '11111111-1111-4111-a111-111111111111'
  }
]) {
  test(`类别根记录新增租户默认 ${scope.name}`, async ({ page }) => {
    let submitted: Record<string, unknown> | undefined
    const ruleTenants: Array<string | null> = []
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname.endsWith('/sys_document_number_rule'))
        ruleTenants.push(url.searchParams.get('tenant_id'))
      if (url.pathname.endsWith('/mdm_part_category') && request.method() === 'POST')
        submitted = request.postDataJSON()
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/scrollbar-workspace.html?page=category-tree${scope.query}`)
    await page.getByRole('button', { name: '新增一级类别', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增零部件类别', exact: true })
    await expect(dialog.getByText('当前租户尚未配置编号规则。', { exact: true })).toBeVisible()
    await dialog.getByRole('combobox', { name: '上级类别', exact: true }).click()
    await expect(page.getByText('暂无可选数据', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await dialog.getByRole('textbox', { name: /类别名称/ }).fill('新增测试类别')
    await dialog.getByRole('textbox', { name: /类别编码/ }).fill('LB-NEW')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => submitted).toMatchObject({ tenant_id: scope.tenant, parent_id: null })
    expect(ruleTenants).toContain(`eq.${scope.tenant}`)
  })
}

test('类别树保留最新搜索结果并取消旧请求', async ({ page }, info) => {
  let releaseOld: (() => void) | undefined
  let oldSettled = false
  const aborted: string[] = []
  page.on('requestfailed', (request) => aborted.push(request.url()))
  await page.route('**/rest/v1/**', async (route) => {
    if (!route.request().url().includes('/mdm_part_category')) return route.fulfill({ json: [] })
    const filter = new URL(route.request().url()).searchParams.get('category_name') ?? ''
    if (filter.includes('旧搜索')) {
      await new Promise<void>((resolve) => {
        releaseOld = resolve
      })
      try {
        await route.fulfill({ json: [record('旧结果')] })
      } catch {
        /* 浏览器已取消旧请求。 */
      }
      oldSettled = true
      return
    }
    return route.fulfill({ json: [record(filter.includes('新搜索') ? '新结果' : '初始类别')] })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=category-tree')
  await expect(page.getByText('初始类别', { exact: true })).toBeVisible()
  const search = page.getByPlaceholder('请输入类别名称')
  await search.fill('旧搜索')
  await expect.poll(() => Boolean(releaseOld)).toBe(true)
  await search.fill('新搜索')
  await expect(page.getByText('新结果', { exact: true })).toBeVisible()
  releaseOld!()
  await expect.poll(() => oldSettled).toBe(true)
  await expect(page.getByText('旧结果', { exact: true })).toHaveCount(0)
  expect(aborted.some((url) => decodeURIComponent(url).includes('旧搜索'))).toBe(true)
  await page.screenshot({ path: info.outputPath('latest-result.png') })
})

test('平台全部下新增子类别继承父类别租户', async ({ page }, info) => {
  const parentTenant = '33333333-3333-4333-a333-333333333333'
  let submitted: Record<string, unknown> | undefined
  const ruleTenants: Array<string | null> = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/sys_document_number_rule'))
      ruleTenants.push(url.searchParams.get('tenant_id'))
    if (url.pathname.endsWith('/mdm_part_category')) {
      if (request.method() === 'POST') {
        submitted = request.postDataJSON()
        return route.fulfill({ json: [] })
      }
      return route.fulfill({ json: [{ ...record('父类别'), tenant_id: parentTenant }] })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=category-tree')
  const parent = page.locator('.el-tree-node__content').filter({ hasText: '父类别' }).first()
  await parent.hover()
  await parent.getByRole('button', { name: '新增子类别', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增子类别', exact: true })
  await expect(dialog.getByText('当前租户尚未配置编号规则。', { exact: true })).toBeVisible()
  await dialog.getByRole('combobox', { name: '上级类别', exact: true }).click()
  await expect(
    page.locator('.el-select-dropdown').getByText('父类别', { exact: true })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await dialog.getByRole('textbox', { name: /类别名称/ }).fill('测试子类别')
  await dialog.getByRole('textbox', { name: /类别编码/ }).fill('LB-CHILD')
  await dialog.screenshot({ path: info.outputPath('child.png') })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect
    .poll(() => submitted)
    .toMatchObject({ tenant_id: parentTenant, parent_id: record('').id })
  expect(ruleTenants).toContain(`eq.${parentTenant}`)
})

test('类别树失败可重试，离开页面取消待执行搜索', async ({ page }, info) => {
  let calls = 0
  await page.route('**/rest/v1/**', async (route) => {
    if (!route.request().url().includes('/mdm_part_category')) return route.fulfill({ json: [] })
    calls++
    return calls === 1
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'database unavailable' } })
      : route.fulfill({ json: [record('重试成功类别')] })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=category-tree')
  await expect(page.getByText('类别树加载失败，请重试', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('retry.png') })
  await page.getByRole('button', { name: /重新加载|重试/ }).click()
  await expect(page.getByText('重试成功类别', { exact: true })).toBeVisible()
  await page.getByPlaceholder('请输入类别名称').fill('不应发起请求')
  await page.getByRole('button', { name: '离开类别树' }).click()
  await page.waitForTimeout(500) // 超过组件防抖窗口，核验卸载后无尾随请求。
  expect(calls).toBe(2)
})

for (const affected of [true, false]) {
  test(`类别编辑仅提交可编辑字段，更新结果 ${affected ? '成功' : '零条失败'}`, async ({
    page
  }, info) => {
    let submitted: Record<string, unknown> | undefined
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const tenantId = '11111111-1111-4111-a111-111111111111'
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      if (!request.url().includes('/mdm_part_category')) return route.fulfill({ json: [] })
      if (request.method() === 'PATCH') {
        submitted = request.postDataJSON()
        return route.fulfill({
          json: affected ? [{ id: record('').id }] : [],
          headers: {
            'content-range': affected ? '0-0/1' : '*/0',
            'access-control-expose-headers': 'content-range'
          }
        })
      }
      return route.fulfill({
        json: [
          {
            ...record('父类别'),
            tenant_id: tenantId,
            create_by: '只读审计人',
            create_time: '2026-10-01T00:00:00Z'
          },
          {
            ...record('子类别'),
            id: '00000000-0000-4000-a000-000000000002',
            parent_id: record('').id,
            tenant_id: tenantId
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=category-tree')
    const node = page.locator('.el-tree-node__content').filter({ hasText: '父类别' }).first()
    await node.hover()
    await node.getByRole('button', { name: '编辑类别', exact: true }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: '编辑零部件类别' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('当前租户尚未配置编号规则。', { exact: true })).toBeVisible()
    await dialog.getByRole('combobox', { name: '上级类别', exact: true }).click()
    await expect(page.getByText('暂无可选数据', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => submitted).toBeTruthy()
    expect(submitted).toMatchObject({
      category_name: '父类别',
      category_code: 'LB-001',
      parent_id: null
    })
    for (const key of [
      'children',
      'tenant_id',
      'create_by',
      'create_time',
      'update_by',
      'update_time',
      'id'
    ]) {
      expect(submitted).not.toHaveProperty(key)
    }
    if (affected) await expect(dialog).not.toBeVisible()
    else {
      await expect(dialog).toBeVisible()
      await expect(page.getByText('操作成功', { exact: true })).toHaveCount(0)
    }
    await page.screenshot({ path: info.outputPath('category-edit.png') })
    expect(pageErrors).toEqual([])
  })
}
