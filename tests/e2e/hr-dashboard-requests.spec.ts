import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const dashboards = {
  talent: { rpc: 'hr_get_talent_inventory_secure', refresh: '刷新人才盘点' },
  skills: { rpc: 'hr_get_skill_matrix_secure', refresh: '刷新技能矩阵' },
  risk: { rpc: 'hr_get_workforce_risk_secure', refresh: '刷新风险数据' }
} as const
type Mode = keyof typeof dashboards

function overview(mode: Mode, name?: string) {
  const record = { id: name || 'empty', employeeNo: 'TEST-01', employeeName: name }
  if (mode === 'risk')
    return {
      activeEmployeeCount: name ? 1 : 0,
      probationEmployees: name
        ? [{ ...record, probationEndDate: new Date().toISOString().slice(0, 10) }]
        : [],
      contracts: [],
      qualifications: [],
      headcounts: []
    }
  if (mode === 'talent')
    return {
      generatedAt: '2026-10-23T00:00:00Z',
      totalRecords: name ? 1 : 0,
      returnedRecords: name ? 1 : 0,
      truncated: false,
      records: name
        ? [
            {
              ...record,
              performanceLevel: 'a',
              competencyTotal: 1,
              competencyMet: 1,
              competencyGapCount: 0,
              readinessRate: 100
            }
          ]
        : []
    }
  return {
    generatedAt: '2026-10-23T00:00:00Z',
    totalRecords: name ? 1 : 0,
    returnedRecords: name ? 1 : 0,
    employeeCount: name ? 1 : 0,
    modelledEmployeeCount: name ? 1 : 0,
    assessedEmployeeCount: name ? 1 : 0,
    readyEmployeeCount: name ? 1 : 0,
    gapEmployeeCount: 0,
    unassessedEmployeeCount: 0,
    truncated: false,
    records: name
      ? [
          {
            ...record,
            requiredCount: 1,
            assessedCount: 1,
            metCount: 1,
            gapCount: 0,
            unassessedCount: 0,
            readinessRate: 100
          }
        ]
      : [],
    competencies: name
      ? [
          {
            id: 'skill-1',
            competencyCode: 'SK-01',
            competencyName: '测试技能',
            category: '测试',
            requiredEmployees: 1,
            assessedEmployees: 1,
            metEmployees: 1,
            gapEmployees: 0,
            unassessedEmployees: 0,
            readinessRate: 100
          }
        ]
      : []
  }
}

async function reply(page: Page, route: Route, mode: Mode, name?: string, failed = false) {
  const received = page.waitForResponse((response) => response.request() === route.request())
  await route.fulfill(
    failed
      ? { status: 500, json: { code: 'P0001', message: 'HR 服务暂不可用，请重试' } }
      : { json: overview(mode, name) }
  )
  await (await received).finished()
  // Drain the response handlers and Vue's queued render before inspecting a discarded response.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

async function prepare(page: Page, mode: Mode, initial: 'success' | 'pending' | 'failure') {
  const pending: Route[] = []
  let calls = 0
  await prepareIsolatedSession(page)
  await page.addInitScript(() => {
    const seen = new WeakSet<Element>()
    let count = 0
    const recordNotifications = (node: Node) => {
      if (!(node instanceof Element)) return
      const messages = node.matches('.el-message--error')
        ? [node]
        : Array.from(node.querySelectorAll('.el-message--error'))
      for (const message of messages) {
        if (seen.has(message)) continue
        seen.add(message)
        document.documentElement.dataset.hrErrorNotifications = String(++count)
      }
    }
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') recordNotifications(mutation.target)
        else mutation.addedNodes.forEach(recordNotifications)
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    })
  })
  await page.route('**/rest/v1/**', async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith(`/${dashboards[mode].rpc}`)) {
      await route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
      return
    }
    calls++
    if (calls === 1 && initial !== 'pending') {
      await route.fulfill(
        initial === 'failure'
          ? { status: 500, json: { code: 'P0001', message: 'HR 服务暂不可用，请重试' } }
          : { json: overview(mode, '基线员工') }
      )
    } else pending.push(route)
  })
  await page.goto(`/tests/e2e/fixtures/hr-dashboard-requests.html?mode=${mode}`, {
    waitUntil: 'domcontentloaded'
  })
  return pending
}

async function refreshTwice(page: Page, mode: Mode, pending: Route[]) {
  // Dispatch two requests in one event turn to exercise the loader independently of button debouncing.
  await page
    .getByRole('button', { name: dashboards[mode].refresh, exact: true })
    .evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  await expect.poll(() => pending.length).toBe(2)
}

for (const mode of Object.keys(dashboards) as Mode[]) {
  test(`${mode} 当前失败可重试且无重复弹窗`, async ({ page }, info) => {
    const pending = await prepare(page, mode, 'failure')
    await expect(page.locator('.art-async-state__result')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(
      await page.evaluate(() => Number(document.documentElement.dataset.hrErrorNotifications || 0))
    ).toBe(0)
    await page.screenshot({ path: info.outputPath(`${mode}-error.png`) })
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect.poll(() => pending.length).toBe(1)
    await reply(page, pending[0], mode)
    await expect(page.locator('.art-async-state__empty').first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${mode}-empty.png`) })
    if (mode === 'skills' && (page.viewportSize()?.width ?? 1440) <= 640) {
      const employeeState = page.locator('.art-async-state__empty').first()
      await employeeState.scrollIntoViewIfNeeded()
      await expect(employeeState).toBeInViewport()
      await page.screenshot({ path: info.outputPath('skills-empty-bottom.png') })
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  })

  test(`${mode} 旧成功不能覆盖最新结果`, async ({ page }) => {
    const pending = await prepare(page, mode, 'success')
    await expect(page.getByText('基线员工', { exact: true })).toBeVisible({ timeout: 60_000 })
    await refreshTwice(page, mode, pending)
    await expect(page.getByText('基线员工', { exact: true })).toBeVisible()
    await reply(page, pending[1], mode, '最新员工')
    await expect(page.getByText('最新员工', { exact: true })).toBeVisible()
    await reply(page, pending[0], mode, '过期员工')
    await expect(page.getByText('最新员工', { exact: true })).toBeVisible()
    await expect(page.getByText('过期员工', { exact: true })).toHaveCount(0)
  })

  test(`${mode} 旧失败不能终止当前加载或弹出错误`, async ({ page }) => {
    const pending = await prepare(page, mode, 'success')
    await expect(page.getByText('基线员工', { exact: true })).toBeVisible({ timeout: 60_000 })
    await refreshTwice(page, mode, pending)
    await reply(page, pending[0], mode, undefined, true)
    await expect(
      page.getByRole('button', { name: dashboards[mode].refresh, exact: true })
    ).toBeDisabled()
    await expect(page.locator('.art-async-state__result')).toHaveCount(0)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(
      await page.evaluate(() => Number(document.documentElement.dataset.hrErrorNotifications || 0))
    ).toBe(0)
    await reply(page, pending[1], mode, '最新员工')
    await expect(page.getByText('最新员工', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: dashboards[mode].refresh, exact: true })
    ).toBeEnabled()
  })

  test(`${mode} 离开看板后旧失败不打扰新页面`, async ({ page }) => {
    const pending = await prepare(page, mode, 'pending')
    await expect.poll(() => pending.length).toBe(1)
    await expect(
      page.getByRole('button', { name: dashboards[mode].refresh, exact: true })
    ).toBeDisabled()
    await page.getByRole('button', { name: '离开看板', exact: true }).click()
    await expect(page.getByText('已离开看板', { exact: true })).toBeVisible()
    await reply(page, pending[0], mode, undefined, true)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(
      await page.evaluate(() => Number(document.documentElement.dataset.hrErrorNotifications || 0))
    ).toBe(0)
  })
}
