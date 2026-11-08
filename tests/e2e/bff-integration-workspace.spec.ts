import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const catalog = [
  {
    interfaceId: '10000000-0000-4000-8000-000000000001',
    code: 'platform-health',
    name: '平台健康检查',
    method: 'GET',
    path: '/platform/health',
    environment: 'production',
    version: 2,
    applicationCode: 'platform',
    applicationName: '线上接入验证',
    inputs: [],
    resultKind: 'scalar',
    outputs: [{ key: 'status', label: '服务状态', type: 'string' }]
  },
  {
    interfaceId: '10000000-0000-4000-8000-000000000002',
    code: 'java-orders',
    name: 'Java 订单列表',
    method: 'GET',
    path: '/examples/java/orders',
    environment: 'development',
    version: 1,
    applicationCode: 'java-demo',
    applicationName: 'Java 服务',
    inputs: [
      { key: 'current', label: '当前页', location: 'query', type: 'number', required: true },
      { key: 'size', label: '每页条数', location: 'query', type: 'number', required: true }
    ],
    resultKind: 'page',
    outputs: [
      { key: 'id', label: '订单编号', type: 'string' },
      { key: 'name', label: '订单名称', type: 'string' }
    ],
    pagination: { currentInputKey: 'current', sizeInputKey: 'size' }
  }
]

async function mockBridge(page: Page) {
  let fail = false
  await page.route('**/__bff_bridge', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    if (payload.operation === 'catalog') {
      await route.fulfill({ json: { records: catalog } })
      return
    }
    if (fail) {
      fail = false
      await route.fulfill({ status: 503, json: { code: 'GATEWAY_UNAVAILABLE' } })
      return
    }
    const paged = payload.applicationCode === 'java-demo'
    await route.fulfill({
      json: {
        code: 200,
        msg: '成功',
        requestId: '20000000-0000-4000-8000-000000000001',
        version: paged ? 1 : 2,
        data: paged
          ? {
              records: [{ id: 'J-001', name: '订单一' }],
              total: 1,
              current: 1,
              size: 20
            }
          : { status: '正常' }
      }
    })
  })
  return { failNext: () => (fail = true) }
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1)
  expect(
    await page.evaluate(() => {
      const main = document.querySelector('.bff-integration')
      if (!main) return false
      const style = getComputedStyle(main)
      return style.overflowY !== 'scroll' && style.overflowY !== 'auto'
    })
  ).toBe(true)
}

test('BFF 目录、指南和调用抽屉保持工作区布局', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await prepareIsolatedSession(page)
  await mockBridge(page)
  await page.goto('/tests/e2e/fixtures/bff-integration-workspace.html')
  if (errors.length) throw new Error(errors.join('\n'))
  await expect(page.getByRole('heading', { name: 'BFF 接入中心' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('row').filter({ hasText: '平台健康检查' })).toBeVisible()
  await expect(page.getByPlaceholder('搜索接口、应用或路径')).toBeVisible()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('catalog-light-1440.png') })

  const header = page.locator('.business-workspace-header')
  const guide = page.getByRole('button', { name: '响应格式说明' })
  await expect(header.getByRole('button', { name: '响应格式说明' })).toBeVisible()

  await page.getByPlaceholder('搜索接口、应用或路径').fill('没有的接口')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('没有符合条件的已发布接口')).toBeVisible()
  await page.screenshot({ path: info.outputPath('catalog-empty-1440.png') })
  await page.getByRole('button', { name: '重置', exact: true }).click()

  await guide.click()
  await expect(page.getByText('Java 服务响应示例')).toBeVisible()
  await page.screenshot({ path: info.outputPath('response-guide-1440.png') })
  await page.keyboard.press('Escape')

  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(header).toBeHidden()
  await expect(guide).toBeVisible()
  await page.screenshot({ path: info.outputPath('catalog-focus-1440.png') })
  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()

  await page
    .getByRole('row')
    .filter({ hasText: '平台健康检查' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await expect(page.getByText('此接口无需填写参数，可直接运行。')).toBeVisible()
  await page.getByRole('button', { name: '运行接口' }).click()
  await expect(page.getByText('正常', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'JSON 响应' }).click()
  await expect(page.getByText('已校验的接口响应')).toBeVisible()
  await page.screenshot({ path: info.outputPath('invocation-json-light-1440.png') })
  await expectNoPageOverflow(page)
  await page.keyboard.press('Escape')

  await page
    .getByRole('row')
    .filter({ hasText: 'Java 订单列表' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText('J-001', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'JSON 响应' }).click()
  await expect(page.locator('.el-drawer').getByText('"J-001"', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('invocation-paged-json-light-1440.png') })
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('row').filter({ hasText: '平台健康检查' })).toBeVisible()
  const narrowSelect = page
    .getByRole('row')
    .filter({ hasText: '平台健康检查' })
    .getByRole('button', { name: '选择接口' })
  await expect(narrowSelect).toBeVisible()
  await narrowSelect.scrollIntoViewIfNeeded()
  await expect(narrowSelect).toBeInViewport()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('catalog-narrow-390.png') })
  await guide.click()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('response-guide-narrow-390.png') })
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('html').evaluate((element) => element.classList.add('dark'))
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('catalog-dark-1280.png') })
  expect(errors).toEqual([])
})

test('BFF 调用失败在抽屉内显示可重试状态', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const bridge = await mockBridge(page)
  await page.goto('/tests/e2e/fixtures/bff-integration-workspace.html')
  await page
    .getByRole('row')
    .filter({ hasText: '平台健康检查' })
    .getByRole('button', { name: '选择接口' })
    .click()
  bridge.failNext()
  await page.getByRole('button', { name: '运行接口' }).click()
  await expect(page.getByText('BFF 接入服务暂时不可用，请稍后重试')).toBeVisible()
  await page.screenshot({ path: info.outputPath('invocation-error-1440.png') })
  await page.getByRole('button', { name: '运行接口' }).click()
  await expect(page.getByText('正常', { exact: true })).toBeVisible()
})
