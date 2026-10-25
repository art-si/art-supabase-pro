import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)
for (const populated of [false, true]) {
  test(`AI 总览和详情复用公共数值格式化 ${populated ? 'loaded' : 'empty'}`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/rpc/ai_operations_overview')
          ? {
              days: 30,
              totalRuns: 12345,
              succeededRuns: 12345,
              failedRuns: 0,
              runningRuns: 0,
              successRate: 100,
              averageLatencyMs: 0,
              p95LatencyMs: 0,
              inputTokens: 123456,
              outputTokens: 0,
              positiveFeedback: 0,
              negativeFeedback: 0,
              dailyTrend: [],
              featureBreakdown: populated
                ? [
                    {
                      feature: 'test',
                      total: 12345,
                      succeeded: 12345,
                      failed: 0,
                      averageLatencyMs: 0
                    }
                  ]
                : [],
              topErrors: []
            }
          : path.endsWith('/ai_run')
            ? {
                id: 'numeric-run',
                feature: 'test',
                status: 'succeeded',
                model: '测试模型',
                input_tokens: 345678,
                output_tokens: null,
                latency_ms: 0,
                metadata: {}
              }
            : path.endsWith('/rpc/ai_quality_feedback_overview')
              ? null
              : []
      })
    })
    await page.goto('/tests/e2e/fixtures/ai-numeric-reuse.html')
    await expect(page.getByText('12,345', { exact: true })).toBeVisible()
    await expect(page.getByText('12.3万', { exact: true })).toBeVisible()
    const features = page.locator('.ai-operations__features')
    if (populated) {
      await expect(features.locator('.ai-operations__feature-chart')).toBeVisible()
      await expect(features.getByText('12,345 次', { exact: true })).toBeVisible()
      await expect(features.getByText('暂无可用 AI 能力', { exact: true })).toHaveCount(0)
    } else {
      await expect(features.getByText('暂无可用 AI 能力', { exact: true })).toHaveCount(1)
      await expect(features.locator('.ai-operations__feature-chart')).toHaveCount(0)
      if (info.project.name === 'mobile-390') {
        expect(await features.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(
          500
        )
      }
    }
    await page.screenshot({ path: info.outputPath('overview.png') })
    await features.screenshot({ path: info.outputPath('features.png') })
    await page.getByRole('button', { name: '查看数值详情', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'AI 运行详情', exact: true })
    await expect(
      drawer.locator('.ai-run-detail__metrics').getByText('345,678', { exact: true })
    ).toBeVisible()
    const output = drawer
      .locator('.ai-run-detail__metrics > div')
      .filter({ has: page.getByText('输出 Token', { exact: true }) })
    await expect(output.locator('strong')).toHaveText('0')
    expect(await drawer.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
    expect(errors).toEqual([])
    await drawer.screenshot({ path: info.outputPath('detail.png') })
  })
}
