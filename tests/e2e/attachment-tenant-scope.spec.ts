import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('附件面板只跟随顶部租户范围，全部租户上传默认平台租户', async ({ page }) => {
  test.setTimeout(120_000)
  const listRequests: string[] = []
  await page.route('**/rest/v1/sys_attachment?*', (route) => {
    listRequests.push(route.request().url())
    return route.fulfill({ status: 200, json: [] })
  })

  await page.goto('/tests/e2e/fixtures/attachment-tenant-scope.html', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('combobox', { name: '资源所属租户' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '粘贴剪贴板文件并上传' })).toBeEnabled()
  await expect.poll(() => listRequests.length).toBeGreaterThan(0)
  expect(new URL(listRequests.at(-1)!).searchParams.get('tenant_id')).toBeNull()
  await page.screenshot({ path: '.artifacts/attachment-scope-desktop.png', animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '粘贴剪贴板文件并上传' })).toBeEnabled()
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
  await page.screenshot({ path: '.artifacts/attachment-scope-mobile.png', animations: 'disabled' })

  await page.getByRole('button', { name: '切换业务租户' }).click()
  await expect.poll(() => listRequests.length).toBeGreaterThan(1)
  expect(listRequests.at(-1)).toContain('11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('combobox', { name: '资源所属租户' })).toHaveCount(0)
})

test('只读资源权限隐藏上传与修改，两个私有资源可分页浏览', async ({ page }, info) => {
  test.setTimeout(120_000)
  const assets = [
    {
      id: 1,
      version: 1,
      tenant_id: '55555555-5555-4555-8555-555555555555',
      origin_name: '合成验收资源一.pdf',
      object_name: 'one.pdf',
      mime_type: 'application/pdf',
      suffix: 'pdf',
      size_byte: 1024,
      size_info: '1 KB',
      url: '/api/resources/1/content'
    },
    {
      id: 2,
      version: 3,
      tenant_id: '55555555-5555-4555-8555-555555555555',
      origin_name: '合成验收资源二.pdf',
      object_name: 'two.pdf',
      mime_type: 'application/pdf',
      suffix: 'pdf',
      size_byte: 2048,
      size_info: '2 KB',
      url: '/api/resources/2/content'
    }
  ]
  await page.route('**/rest/v1/sys_attachment?*', async (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('offset')) || 0
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': `${index}-${index}/2`,
        'access-control-expose-headers': 'content-range'
      },
      body: JSON.stringify(assets.slice(index, index + 1))
    })
  })
  await page.goto('/tests/e2e/fixtures/attachment-tenant-scope.html?resources=readonly', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('button', { name: '粘贴剪贴板文件并上传' })).toHaveCount(0)
  await expect(page.locator('.resource-dock')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '选择资源 合成验收资源一.pdf' })).toBeVisible()
  await page.locator('.resource-item').first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '复制链接' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '重命名' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '删除' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.el-pagination .btn-next')).toBeEnabled()
  await page.locator('.el-pagination .btn-next').click()
  await expect(page.getByRole('button', { name: '选择资源 合成验收资源二.pdf' })).toBeVisible()
  for (const scenario of [
    { name: 'light-1440', width: 1440, dark: false },
    { name: 'dark-1280', width: 1280, dark: true },
    { name: 'light-390', width: 390, dark: false }
  ]) {
    await page.setViewportSize({ width: scenario.width, height: 844 })
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = dark ? 'shadow-mode' : 'border-mode'
    }, scenario.dark)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      )
      .toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath(`resources-readonly-${scenario.name}.png`),
      animations: 'disabled'
    })
  }
})

test('资源面板清空文件输入后仍向上传处理器传递所选文件', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/sys_attachment?*', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/attachment-tenant-scope.html?resources=upload', {
    waitUntil: 'domcontentloaded'
  })
  const input = page.locator('input[name="local-file-upload"]')
  await input.evaluate((element) => {
    element.addEventListener(
      'change',
      (event) => {
        document.body.dataset.inputSeen = String(
          (event.target as HTMLInputElement).files?.length ?? 0
        )
      },
      { capture: true }
    )
  })
  await input.setInputFiles({
    name: '合成上传验收.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('synthetic resource fixture')
  })
  await expect(page.locator('body')).toHaveAttribute('data-input-seen', '1')
  await expect(page.locator('body')).toHaveAttribute('data-uploaded-names', '合成上传验收.pdf')
  await expect(page.locator('body')).toHaveAttribute(
    'data-uploaded-tenant-id',
    '55555555-5555-4555-8555-555555555555'
  )
  await expect(input).toHaveValue('')
})
