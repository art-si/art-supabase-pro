import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)

function response(mode: string, name: string, empty = false) {
  if (mode === 'routes')
    return {
      generatedAt: '2026-10-09 12:00:00',
      records: empty
        ? []
        : [
            {
              id: name,
              originCity: name,
              destinationCity: '测试终点',
              completedTrips: 2,
              scheduledTrips: 2,
              onTimeTrips: 2,
              onTimeRate: 100,
              averageDurationHours: 3,
              averageDelayHours: 0,
              cargoWeightTon: 4,
              activeTrips: 0,
              delayedActiveTrips: 0
            }
          ]
    }
  return {
    generatedAt: '2026-10-09 12:00:00',
    fleetCapacityTon: 20,
    activeFleetCount: 4,
    backlogCount: empty ? 0 : 1,
    daily: empty
      ? []
      : [
          {
            date: '2026-10-10',
            demandTrips: 2,
            demandTon: 4,
            assignedVehicles: 1,
            unassignedTrips: 0,
            fleetCapacityTon: 20,
            loadRate: 20
          }
        ],
    backlog: empty
      ? []
      : [
          {
            id: name,
            waybillNo: name,
            status: 'pending',
            originCity: '测试起点',
            destinationCity: '测试终点',
            waitingHours: 3
          }
        ]
  }
}

for (const mode of ['routes', 'capacity']) {
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      test(`${mode} ${theme} ${box} 公共状态、重试和周期请求顺序`, async ({ page }, info) => {
        await prepareIsolatedSession(page)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        let stage: 'initial' | 'error' | 'empty' | 'matched' | 'race' = 'initial'
        let releaseInitial: (() => void) | undefined
        let releaseOld: (() => void) | undefined
        const initialGate = new Promise<void>((resolve) => {
          releaseInitial = resolve
        })
        const oldGate = new Promise<void>((resolve) => {
          releaseOld = resolve
        })
        let oldReceived = false
        let oldFinished = false
        await page.route('**/rest/v1/**', async (route) => {
          const path = new URL(route.request().url()).pathname
          if (
            !path.endsWith(
              mode === 'routes'
                ? 'tms_get_route_performance_secure'
                : 'tms_get_capacity_planning_secure'
            )
          ) {
            await route.fulfill({ json: [] })
            return
          }
          const days = route.request().postDataJSON().p_days
          if (stage === 'initial') await initialGate
          if (stage === 'error') {
            await route.fulfill({ status: 400, json: { message: '统计数据加载失败，请重新加载' } })
            return
          }
          if (stage === 'race' && days === (mode === 'routes' ? 30 : 7)) {
            oldReceived = true
            await oldGate
            await route.fulfill({ json: response(mode, '旧周期') })
            oldFinished = true
            return
          }
          await route.fulfill({
            json: response(mode, stage === 'race' ? '最新周期' : '测试线路', stage === 'empty')
          })
        })
        await page.goto(
          `/tests/e2e/fixtures/transport-overview-states.html?mode=${mode}&theme=${theme}&box=${box}`
        )
        const root = page.locator(
          mode === 'routes' ? '.route-performance-page' : '.capacity-planning-page'
        )
        await expect(root.locator('.art-async-state__skeleton')).toBeVisible({ timeout: 120_000 })
        releaseInitial?.()
        await expect(root).toContainText('测试线路')
        const refresh = page.getByRole('button', {
          name: mode === 'routes' ? '刷新线路效能' : '刷新运力容量',
          exact: true
        })
        stage = 'error'
        await refresh.click()
        await expect(root.locator('.art-async-state__result')).toBeVisible()
        await expect(root).not.toContainText('测试线路')
        stage = 'empty'
        await page.getByRole('button', { name: '重新加载', exact: true }).click()
        await expect(root).toContainText(
          mode === 'routes' ? '当前周期暂无可分析的线路数据' : '当前周期暂无运输需求'
        )
        if (mode === 'capacity') await expect(root).toContainText('当前没有未配车任务')
        stage = 'matched'
        await refresh.click()
        await expect(root).toContainText('测试线路')
        stage = 'race'
        await page.getByText(mode === 'routes' ? '近 30 天' : '7 天', { exact: true }).click()
        await expect.poll(() => oldReceived).toBe(true)
        await expect(root.locator('.art-async-state__skeleton')).toBeVisible()
        await page.getByText(mode === 'routes' ? '近 180 天' : '30 天', { exact: true }).click()
        await expect(root).toContainText('最新周期')
        releaseOld?.()
        await expect.poll(() => oldFinished).toBe(true)
        await expect(root).toContainText('最新周期')
        await expect(root).not.toContainText('旧周期')
        await expect(root.locator('.art-async-state__skeleton')).toHaveCount(0)
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        await root.screenshot({ path: info.outputPath('overview.png') })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
        expect(errors).toEqual([])
      })
    }
  }
}
