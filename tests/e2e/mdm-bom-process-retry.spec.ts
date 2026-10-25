import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('BOM 连续编辑不同租户保留父项和工艺路线', async ({ page }, info) => {
  const seen: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/mdm_process_route')) {
      const tenant = url.searchParams.get('tenant_id')
      const other = tenant === 'eq.22222222-2222-4222-8222-222222222222'
      expect(tenant).toBe(
        other
          ? 'eq.22222222-2222-4222-8222-222222222222'
          : 'eq.11111111-1111-4111-8111-111111111111'
      )
      expect(url.searchParams.get('material_id')).toBe(other ? 'eq.material-b' : 'eq.material-a')
      seen.push(tenant!)
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: other ? 'route-b' : 'route-a',
            code: other ? 'ROUTE-B' : 'ROUTE-A',
            name: other ? '另一租户路线' : '当前路线',
            version: 'V1',
            is_default: true,
            enabled: true
          }
        ]
      })
    }
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
  await page.getByRole('button', { name: '打开 BOM', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V1')
  await page
    .getByRole('button', { name: 'Close this dialog', exact: true })
    .click({ timeout: 10_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '打开另一租户 BOM', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'BOM 编码', exact: true })).toHaveValue(
    'BOM-OTHER'
  )
  await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V2')
  await expect(
    page
      .getByRole('dialog', { name: '编辑 BOM', exact: true })
      .getByText('另一租户路线 · ROUTE-B（默认）', { exact: true })
  ).toBeVisible()
  expect(seen).toEqual([
    'eq.11111111-1111-4111-8111-111111111111',
    'eq.22222222-2222-4222-8222-222222222222'
  ])
  await page.screenshot({
    path: info.outputPath('bom-route-selection.png'),
    animations: 'disabled'
  })
})

test('BOM 引用选项失败重试后保留填写', async ({ page }) => {
  let failed = true
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/rpc/mdm_save_bom_with_assignments')) writes++
    if (path.endsWith('/mdm_material_category') && failed) {
      return route.fulfill({ status: 503, json: { code: 'XX000', message: 'unavailable' } })
    }
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
  await page.getByRole('button', { name: '打开 BOM', exact: true }).click()
  await expect(page.getByText('BOM 选项加载失败', { exact: true })).toBeVisible()
  await page
    .getByRole('textbox', { name: '版本', exact: true })
    .fill('V-REF-KEEP', { timeout: 10_000 })
  await page.getByRole('button', { name: '保存 BOM', exact: true }).click()
  await expect(page.getByText('请先等待 BOM 选项加载成功后再保存')).toBeVisible()
  expect(writes).toBe(0)
  failed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('BOM 选项加载失败', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V-REF-KEEP')
})

for (const leave of [false, true]) {
  test(`BOM 保存${leave ? '离开页面后不显示迟到成功' : '失败只提示一次并保留填写'}`, async ({
    page
  }) => {
    let saving = false
    let returned = false
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/rpc/mdm_save_bom_with_assignments')) {
        saving = true
        if (leave) await held
        await route.fulfill(
          leave
            ? { json: 'bom-a' }
            : { status: 503, json: { code: 'XX000', message: 'unavailable' } }
        )
        returned = true
      } else
        await route.fulfill({
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
          json: []
        })
    })
    await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
    await page.getByRole('button', { name: '打开 BOM', exact: true }).click()
    await page
      .getByRole('textbox', { name: '版本', exact: true })
      .fill('V-SAVE', { timeout: 10_000 })
    await page.getByRole('button', { name: '保存 BOM', exact: true }).click()
    await expect.poll(() => saving).toBe(true)
    if (leave) {
      await page
        .getByRole('button', { name: '离开 BOM 页面' })
        .evaluate((button) => (button as HTMLButtonElement).click())
      release()
      await expect.poll(() => returned).toBe(true)
      await expect(page.getByText('BOM 保存成功', { exact: true })).toHaveCount(0)
    } else {
      await expect(page.locator('.el-message').filter({ hasText: 'BOM 保存失败' })).toHaveCount(1)
      await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V-SAVE')
    }
    await expect(page.getByTestId('success-count')).toHaveText('0')
  })
}

test('BOM 关闭重开后旧工序失败不覆盖当前数据', async ({ page }) => {
  let stepRequests = 0
  let releaseOld: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let oldReturned = false
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const headers = { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    if (path.endsWith('/mdm_process_route')) {
      await route.fulfill({
        headers,
        json: [
          { id: 'route-a', code: 'ROUTE-A', name: '当前路线', is_default: true, enabled: true }
        ]
      })
    } else if (path.endsWith('/mdm_process_route_step')) {
      stepRequests++
      if (stepRequests === 1) {
        await held
        await route.fulfill({ status: 503, json: { code: 'XX000', message: 'old failure' } })
        oldReturned = true
      } else {
        await route.fulfill({
          headers,
          json: [{ id: 'step-current', route_id: 'route-a', code: '10', name: '当前工序', sort: 1 }]
        })
      }
    } else await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
  await page.getByRole('button', { name: '打开 BOM', exact: true }).click()
  await expect.poll(() => stepRequests).toBe(1)
  await page
    .getByRole('button', { name: 'Close this dialog', exact: true })
    .click({ timeout: 10_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '打开 BOM', exact: true }).click()
  await expect.poll(() => stepRequests).toBe(2)
  await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V1')
  releaseOld()
  await expect.poll(() => oldReturned).toBe(true)
  await expect(page.getByText('工艺数据加载失败', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V1')
})

test('BOM 工序失败原地重试并保留填写', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  let failed = true
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'GET' && !url.pathname.includes('/rpc/')) writes++
    if (url.pathname.endsWith('/mdm_process_route')) {
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'route-a',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            code: 'ROUTE-A',
            name: '验收路线',
            version: 'V1',
            is_default: true,
            enabled: true
          }
        ]
      })
    }
    if (url.pathname.endsWith('/mdm_process_route_step')) {
      if (failed)
        return route.fulfill({ status: 503, json: { code: 'XX000', message: 'unavailable' } })
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'step-a',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            route_id: 'route-a',
            code: '10',
            name: '验收工序',
            sort: 1
          }
        ]
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
  await page.getByRole('button', { name: '打开 BOM', exact: true }).click()
  await expect(page.getByText('工艺数据加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('该父项物料尚未维护可用工艺路线')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'BOM 编码', exact: true })).toHaveValue('BOM-TEST')
  await page.getByRole('textbox', { name: '版本', exact: true }).fill('V-KEEP', { timeout: 10_000 })
  await page.getByRole('button', { name: '重新加载', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('bom-process-error.png'), fullPage: true })
  await page.getByRole('button', { name: '保存 BOM', exact: true }).click()
  await expect(page.getByText('请先等待工艺数据加载成功后再保存')).toBeVisible()
  expect(writes).toBe(0)
  failed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('工艺数据加载失败', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '版本', exact: true })).toHaveValue('V-KEEP')
  await page.screenshot({ path: testInfo.outputPath('bom-process-recovered.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})
