import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const failed of [false, true]) {
  test(`BOM 分组离开页面后忽略旧保存${failed ? '失败' : '成功'}`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let saving = false
    let returned = false
    let groupReads = 0
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/rpc/mdm_save_bom_group_secure')) {
        saving = true
        await held
        await route.fulfill(
          failed
            ? { status: 500, json: { code: 'XX000', message: 'synthetic stale failure' } }
            : { json: 'old-group' }
        )
        returned = true
      } else {
        if (path.endsWith('/mdm_master_group')) groupReads += 1
        await route.fulfill({
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
          json: []
        })
      }
    })
    await page.goto('/tests/e2e/fixtures/bom-workspace-scope.html?scope=all')
    await page.getByRole('button', { name: '新增 BOM 分组', exact: true }).click()
    await page.getByRole('textbox', { name: /分组编码/ }).fill('OLD_GROUP')
    await page.getByRole('textbox', { name: /分组名称$/ }).fill('过期请求')
    await page.getByRole('button', { name: '创建分组', exact: true }).click()
    await expect.poll(() => saving).toBe(true)
    const readsBefore = groupReads
    // 触发内存路由变化，模拟全局导航；弹窗遮罩下不是指针可达性验收。
    await page.getByRole('button', { name: '离开 BOM 页面' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    release()
    await expect.poll(() => returned).toBe(true)
    // ArtDialog closes on navigation; the stale save must neither reopen it nor refresh groups.
    await expect(page.getByRole('button', { name: '创建分组', exact: true })).toHaveCount(0)
    await expect(page.locator('.el-message')).toHaveCount(0)
    expect(groupReads).toBe(readsBefore)
    await page.getByRole('button', { name: '新增 BOM 分组', exact: true }).click()
    await expect(page.getByRole('button', { name: '创建分组', exact: true })).toBeEnabled()
    await expect(page.getByRole('textbox', { name: /分组编码/ })).toHaveValue('')
  })
}

test('BOM 分组保存失败只提示一次并保留表单', async ({ page }) => {
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/rpc/mdm_save_bom_group_secure')) {
      writes += 1
      return route.fulfill({
        status: 500,
        json: { code: 'XX000', message: 'synthetic internal failure' }
      })
    }
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/bom-workspace-scope.html?scope=all')
  await page.getByRole('button', { name: '新增 BOM 分组', exact: true }).click()
  await page.getByRole('textbox', { name: /分组编码/ }).fill('KEEP_GROUP')
  await page.getByRole('textbox', { name: /分组名称$/ }).fill('保留填写内容')
  await page.getByRole('button', { name: '创建分组', exact: true }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).toContainText('BOM 分组保存失败')
  await expect(page.getByRole('textbox', { name: /分组编码/ })).toHaveValue('KEEP_GROUP')
  await expect(page.getByRole('textbox', { name: /分组名称$/ })).toHaveValue('保留填写内容')
  expect(writes).toBe(1)
})

for (const scope of ['all', 'selected', 'ordinary', 'ordinary-forged']) {
  test(`BOM 分组新增 ${scope} 使用明确写入租户`, async ({ page }) => {
    let payload: { p_payload: { tenant_id: string; code: string; name: string } } | undefined
    await page.route('**/rest/v1/**', (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/rpc/mdm_save_bom_group_secure')) {
        payload = route.request().postDataJSON()
        return route.fulfill({ json: 'group-test' })
      }
      return route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    })
    await page.goto(`/tests/e2e/fixtures/bom-workspace-scope.html?scope=${scope}`)
    await page.getByRole('button', { name: '新增 BOM 分组', exact: true }).click()
    await page.getByRole('textbox', { name: /分组编码/ }).fill('GROUP_TEST', { timeout: 10_000 })
    await page.getByRole('textbox', { name: /分组名称$/ }).fill('验收分组')
    await page.getByRole('button', { name: '创建分组', exact: true }).click()
    await expect
      .poll(() => payload?.p_payload.tenant_id)
      .toBe(
        scope === 'selected'
          ? '22222222-2222-4222-8222-222222222222'
          : '11111111-1111-4111-8111-111111111111'
      )
    expect(payload?.p_payload.code).toBe('GROUP_TEST')
    expect(payload?.p_payload.name).toBe('验收分组')
  })
}

test('BOM 专注模式隐藏概览并支持两种退出方式', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  )
  await page.goto('/tests/e2e/fixtures/bom-workspace-scope.html')
  const hero = page.locator('.business-workspace-header')
  const groups = page.locator('.bom-group-panel')
  const query = page.locator('.bom-maintenance-page .art-table-query')
  await expect(hero).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(query).toHaveClass(/is-focus-mode/)
  await expect(hero).toBeHidden()
  await expect(groups).toBeHidden()
  await expect
    .poll(async () => {
      const box = await query.boundingBox()
      return box ? box.y + box.height : 0
    })
    .toBeGreaterThan((page.viewportSize()?.height ?? 0) - 36)
  await expect(page.getByPlaceholder('BOM 编码、版本或说明')).toBeVisible()
  await expect(page.getByText('暂无 BOM', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('bom-focus.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(query).not.toHaveClass(/is-focus-mode/)
  await expect(hero).toBeVisible()
  await expect(groups).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click({ timeout: 10_000 })
  await expect(hero).toBeVisible()
  await expect(groups).toBeVisible()
})

test('BOM 分组切换租户后忽略旧响应', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let oldPending = false
  let oldReturned = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/mdm_master_group')) {
      const old = url.searchParams.get('tenant_id') === 'eq.11111111-1111-4111-8111-111111111111'
      if (old) {
        oldPending = true
        await held
      }
      await route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: old ? 'group-a' : 'group-b',
            tenant_id: old
              ? '11111111-1111-4111-8111-111111111111'
              : '22222222-2222-4222-8222-222222222222',
            code: old ? 'A' : 'B',
            name: old ? '旧租户分组 A' : '当前租户分组 B',
            sort: 1,
            enabled: true
          }
        ]
      })
      if (old) oldReturned = true
    } else
      await route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
  })
  await page.goto('/tests/e2e/fixtures/bom-workspace-scope.html')
  await expect.poll(() => oldPending).toBe(true)
  await page.getByRole('button', { name: '切换租户 B', exact: true }).click()
  await expect(page.getByText('当前租户分组 B', { exact: true })).toBeVisible()
  release()
  await expect.poll(() => oldReturned).toBe(true)
  await expect(page.getByText('当前租户分组 B', { exact: true })).toBeVisible()
  await expect(page.getByText('旧租户分组 A', { exact: true })).toHaveCount(0)
})

for (const holdOld of [false, true]) {
  test(`BOM 工作区切换租户后${holdOld ? '忽略旧单位响应' : '重新加载单位'}`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let oldReturned = false
    const units: string[] = []
    const groups: string[] = []
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const tenant = url.searchParams.get('tenant_id') || ''
      if (url.pathname.endsWith('/mdm_unit_of_measure')) {
        units.push(tenant)
        const other = tenant === 'eq.22222222-2222-4222-8222-222222222222'
        if (holdOld && !other) await held
        await route.fulfill({
          json: [
            {
              id: other ? 'unit-b' : 'unit-a',
              tenant_id: tenant.replace('eq.', ''),
              unit_code: other ? 'B' : 'A',
              unit_name: other ? '单位 B' : '单位 A',
              symbol: other ? 'B' : 'A',
              status: 'enabled',
              sort: 1
            }
          ]
        })
        if (!other) oldReturned = true
        return
      }
      if (url.pathname.endsWith('/mdm_master_group')) {
        expect(url.searchParams.get('domain')).toBe('eq.bom')
        groups.push(tenant)
      }
      return route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    })
    await page.goto('/tests/e2e/fixtures/bom-workspace-scope.html')
    await expect.poll(() => units.includes('eq.11111111-1111-4111-8111-111111111111')).toBe(true)
    await page.getByRole('button', { name: '切换租户 B', exact: true }).click()
    await page.getByRole('button', { name: '新增 BOM', exact: true }).click()
    await expect.poll(() => units.includes('eq.22222222-2222-4222-8222-222222222222')).toBe(true)
    await expect.poll(() => groups.includes('eq.22222222-2222-4222-8222-222222222222')).toBe(true)
    await page.getByRole('combobox', { name: '生产单位' }).click()
    await expect(page.getByRole('option', { name: '单位 B · B', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '单位 A · A', exact: true })).toHaveCount(0)
    if (holdOld) {
      release()
      await expect.poll(() => oldReturned).toBe(true)
      await expect(page.getByRole('option', { name: '单位 B · B', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '单位 A · A', exact: true })).toHaveCount(0)
    }
  })
}
