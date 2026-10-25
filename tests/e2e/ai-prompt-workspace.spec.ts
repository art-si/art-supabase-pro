import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

test('Prompt 空集合显示零统计和共享空状态', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/ai_prompt_template?**', (route) =>
    route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      ...(route.request().method() === 'HEAD' ? { body: '' } : { json: [] })
    })
  )
  await page.goto('/tests/e2e/fixtures/ai-prompt-workspace.html?ordinary=true')
  await expect(page.getByLabel('业务概览').locator('strong')).toHaveText([
    '0 个',
    '0 个',
    '0 个',
    '0 个'
  ])
  await expect(page.locator('.art-table-query .art-empty-state')).toBeVisible()
  await expect(page.getByText('版本概览加载失败', { exact: true })).toHaveCount(0)
})

test('Prompt 切换租户后迟到的全部租户统计不覆盖新概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let waiting = 0
  let completed = 0
  await page.route('**/rest/v1/ai_prompt_template?**', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'HEAD')
      return route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    const selected = Boolean(route.request().headers()['x-art-tenant-scope'])
    if (!selected) {
      waiting++
      await held
    }
    const total = selected ? 7 : 1001
    const statusIndex = ['eq.published', 'eq.draft', 'eq.archived'].indexOf(
      url.searchParams.get('status') ?? ''
    )
    const count = statusIndex < 0 ? total : Math.floor((total + 2 - statusIndex) / 3)
    await route.fulfill({
      headers: { 'content-range': `*/${count}`, 'access-control-expose-headers': 'content-range' },
      body: ''
    })
    if (!selected) completed++
  })
  await page.goto('/tests/e2e/fixtures/ai-prompt-workspace.html')
  await expect.poll(() => waiting).toBe(4)
  await page.getByRole('button', { name: '指定租户测试' }).click()
  await expect(page.getByLabel('业务概览').getByText('7 个', { exact: true })).toBeVisible()
  release()
  await expect.poll(() => completed).toBe(4)
  await expect(page.getByLabel('业务概览').getByText('7 个', { exact: true })).toBeVisible()
  await expect(page.getByText('版本概览加载失败', { exact: true })).toHaveCount(0)
})

for (const ordinary of [false, true]) {
  test(`Prompt 完整概览与租户范围 ordinary=${ordinary}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const requests: { tenant: string | null; offset: number; limit: number; method: string }[] = []
    await page.route('**/rest/v1/ai_prompt_template?**', (route) => {
      const url = new URL(route.request().url())
      const tenant =
        url.searchParams.get('tenant_id') ??
        (route.request().headers()['x-art-tenant-scope']
          ? `eq.${route.request().headers()['x-art-tenant-scope']}`
          : null)
      const offset = Number(url.searchParams.get('offset'))
      const limit = Number(url.searchParams.get('limit'))
      const method = route.request().method()
      requests.push({ tenant, offset, limit, method })
      const total = tenant ? 7 : 1001
      if (method === 'HEAD') {
        expect(url.searchParams.get('select')).toBe('id')
        expect(route.request().headers().prefer).toContain('count=exact')
        expect(url.searchParams.get('offset')).toBeNull()
        const statusIndex = ['eq.published', 'eq.draft', 'eq.archived'].indexOf(
          url.searchParams.get('status') ?? ''
        )
        const count = statusIndex < 0 ? total : Math.floor((total + 2 - statusIndex) / 3)
        return route.fulfill({
          headers: {
            'content-range': `*/${count}`,
            'access-control-expose-headers': 'content-range'
          },
          body: ''
        })
      }
      expect(limit).toBeLessThanOrEqual(20)
      const length = Math.min(limit, Math.max(total - offset, 0))
      return route.fulfill({
        headers: {
          'content-range': length ? `${offset}-${offset + length - 1}/${total}` : `*/${total}`,
          'access-control-expose-headers': 'content-range'
        },
        json: Array.from({ length }, (_, index) => ({
          id: `prompt-${offset + index}`,
          tenant_id: '00000000-0000-4000-8000-000000000002',
          feature: 'ocr',
          name: '测试系统指令',
          version: `v${offset + index}`,
          system_prompt: '测试内容',
          status: ['published', 'draft', 'archived'][(offset + index) % 3],
          update_time: '2026-10-01T00:00:00Z'
        }))
      })
    })
    await page.goto(`/tests/e2e/fixtures/ai-prompt-workspace.html?ordinary=${ordinary}`)
    const metrics = page.getByLabel('业务概览')
    await expect(metrics.getByText(ordinary ? '7 个' : '1001 个', { exact: true })).toBeVisible()
    expect(requests.filter((request) => request.method === 'HEAD')).toHaveLength(4)
    if (ordinary) {
      expect(
        requests.every((request) => request.tenant === 'eq.00000000-0000-4000-8000-000000000002')
      ).toBe(true)
      await expect(page.getByRole('button', { name: '指定租户测试' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '新建版本' })).toHaveCount(0)
    } else {
      expect(requests.every((request) => request.tenant === null)).toBe(true)
      await page.getByRole('button', { name: '指定租户测试' }).click()
      await expect(metrics.getByText('7 个', { exact: true })).toBeVisible()
      expect(
        requests.some((request) => request.tenant === 'eq.00000000-0000-4000-8000-000000000002')
      ).toBe(true)
    }
    await page.screenshot({
      path: testInfo.outputPath('prompt-scope.png'),
      fullPage: true,
      animations: 'disabled'
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await assertTableFocusContract(page, testInfo)
  })
}

for (const failure of ['missing-count', 'inconsistent', 'denied']) {
  test(`Prompt 统计失败 ${failure} 不显示假零，原位重试恢复`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    let missing = true
    await page.route('**/rest/v1/ai_prompt_template?**', (route) => {
      const url = new URL(route.request().url())
      const offset = Number(url.searchParams.get('offset'))
      const limit = Number(url.searchParams.get('limit'))
      if (route.request().method() === 'HEAD') {
        const status = url.searchParams.get('status')
        if (missing && !status && failure === 'denied')
          return route.fulfill({ status: 403, body: '' })
        if (missing && !status && failure === 'missing-count') return route.fulfill({ body: '' })
        const count = !status
          ? 501
          : status === 'eq.draft'
            ? missing && failure === 'inconsistent'
              ? 500
              : 501
            : 0
        return route.fulfill({
          headers: {
            'content-range': `*/${count}`,
            'access-control-expose-headers': 'content-range'
          },
          body: ''
        })
      }
      const length = Math.min(limit, Math.max(501 - offset, 0))
      return route.fulfill({
        headers: {
          'content-range': length ? `${offset}-${offset + length - 1}/501` : '*/501',
          'access-control-expose-headers': 'content-range'
        },
        json: Array.from({ length }, (_, index) => ({
          id: `prompt-${offset + index}`,
          feature: 'ocr',
          version: `v${offset + index}`,
          name: '测试版本',
          system_prompt: '测试指令',
          status: 'draft',
          update_time: '2026-10-01T00:00:00Z'
        }))
      })
    })
    await page.goto('/tests/e2e/fixtures/ai-prompt-workspace.html')
    await expect(page.getByText('版本概览加载失败', { exact: true })).toBeVisible()
    await expect(page.getByLabel('业务概览').locator('strong')).toHaveText(['—', '—', '—', '—'])
    await expect(
      page.getByLabel('业务概览').getByText('概览暂不可用，请重新加载', { exact: true })
    ).toHaveCount(4)
    await page.screenshot({
      path: testInfo.outputPath('prompt-error.png'),
      fullPage: true,
      animations: 'disabled'
    })
    missing = false
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(
      page.getByLabel('业务概览').getByText('501 个', { exact: true }).first()
    ).toBeVisible()
    await expect(page.getByText('版本概览加载失败', { exact: true })).toHaveCount(0)
  })
}
