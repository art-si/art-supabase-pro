import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
for (const incomplete of [false, true]) {
  test(`AI 安全统计${incomplete ? '缺页拒绝少计' : '覆盖 1001 条事件'}`, async ({ page }) => {
    const offsets: number[] = []
    await page.route('**/rest/v1/rpc/ai_operations_overview', (route) =>
      route.fulfill({
        json: {
          total_runs: 0,
          success_rate: 100,
          daily_trend: [{ date: '2026-10-06', total: 0 }],
          feature_breakdown: [],
          top_errors: []
        }
      })
    )
    await page.route('**/rest/v1/rpc/ai_quality_feedback_overview', (route) =>
      route.fulfill({ json: null })
    )
    await page.route('**/rest/v1/ai_security_event?**', (route) => {
      const url = new URL(route.request().url())
      const offset = Number(url.searchParams.get('offset') ?? 0)
      offsets.push(offset)
      expect(url.searchParams.get('limit')).toBe('500')
      expect(url.searchParams.get('order')).toBe('detected_at.desc,id.asc')
      expect(url.searchParams.get('detected_at')).toMatch(/^gte\./)
      expect(route.request().headers().prefer).toContain('count=exact')
      const length = incomplete && offset === 1000 ? 0 : Math.min(500, 1001 - offset)
      return route.fulfill({
        headers: {
          'content-range': length ? `${offset}-${offset + length - 1}/1001` : '*/1001',
          'access-control-expose-headers': 'content-range'
        },
        json: Array.from({ length }, (_, index) => ({
          id: `event-${offset + index}`,
          decision: 'blocked',
          status: offset + index < 500 ? 'closed' : 'open',
          severity: 'high',
          title: '测试事件',
          detail: '',
          detected_at: '2026-10-06T08:00:00+08:00'
        }))
      })
    })
    await page.goto('/tests/e2e/fixtures/ai-safety-counts.html')
    await page.getByRole('button', { name: '读取统计', exact: true }).click()
    const output = page.getByTestId('result')
    if (incomplete) await expect(output).toHaveText('加载失败')
    else {
      await expect(output).toContainText('安全事件')
      const result = JSON.parse(await output.innerText())
      expect(result.risk).toBe(501)
      expect(
        result.metrics.find((item: { label: string }) => item.label === '安全事件').value
      ).toBe(1001)
      expect(
        result.metrics.find((item: { label: string }) => item.label === '自动阻断').value
      ).toBe(1001)
      expect(result.trend[0].secondary).toBe(1001)
      expect(result.alerts).toBe(5)
    }
    expect(offsets).toEqual([0, 500, 1000])
  })
}
