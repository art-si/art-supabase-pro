import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const scenarios = [
  { feature: 'service', rpc: 'hr_get_service_request_detail_secure', title: '员工服务工单' },
  { feature: 'benefits', rpc: 'hr_get_benefit_detail_secure', title: '福利与参保详情' },
  { feature: 'compliance', rpc: 'hr_get_compliance_detail_secure', title: '劳动合同详情' },
  {
    feature: 'relations',
    rpc: 'hr_get_employee_relation_case_detail_secure',
    title: '员工关系案件详情'
  },
  { feature: 'experience', rpc: 'hr_get_employee_experience_detail_secure', title: '我的调查状态' }
]
function record(id: string) {
  return {
    id,
    tenant_id: 'test-tenant',
    plan_name: id,
    plan_code: 'PLAN-001',
    currency_code: 'CNY',
    contract_no: id,
    title: id,
    case_no: 'CASE-001',
    survey_name: id,
    survey_code: 'SURVEY-001',
    status: 'draft',
    availability: 'available',
    severity: 'low',
    minimum_group_size: 5,
    options: [],
    actions: [],
    events: [],
    attachment_urls: [],
    questions: [],
    question_count: 0
  }
}
const entityScenarios = [
  { feature: 'benefits', entity: 'enrollment', title: '福利与参保详情' },
  { feature: 'benefits', entity: 'event', title: '福利与参保详情' },
  { feature: 'compliance', entity: 'qualification', title: '员工资质详情' },
  { feature: 'experience', entity: 'survey', title: '员工体验调查详情' },
  { feature: 'experience', entity: 'insight', title: '匿名聚合洞察' },
  { feature: 'experience', entity: 'action', title: '改善行动详情' }
]
for (const scenario of entityScenarios) {
  test(`${scenario.feature}/${scenario.entity} 详情窄屏显示业务内容且可以滚动到底部`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 570, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const isDetail = route.request().url().includes('_detail_secure')
      return route.fulfill({
        json: isDetail
          ? {
              ...record('测试业务详情'),
              qualification_name: '测试业务详情',
              employee: {
                id: 'employee-1',
                tenant_id: 'test-tenant',
                employee_name: '测试员工',
                employee_no: 'EMP-001'
              },
              event_type: 'marriage',
              question_scores: [],
              organization_scores: [],
              comments: [],
              respondent_count: 8,
              score_percent: 75,
              dimension: 'engagement',
              description: '业务说明'.repeat(80)
            }
          : []
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}&entity=${scenario.entity}`
    )
    const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(drawer.locator('h3')).toBeVisible()
    await expect(drawer.getByText('详情记录不可用', { exact: true })).toHaveCount(0)
    expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    const scroll = drawer.locator('.el-scrollbar__wrap').first()
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(errors).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath('detail-bottom.png'),
      animations: 'disabled'
    })
  })
}
for (const scenario of scenarios) {
  test(`${scenario.feature} 详情加载失败可以原位重试`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 570, height: 900 })
    let requests = 0
    await page.route('**/rest/v1/**', (route) => {
      if (!route.request().url().includes(scenario.rpc)) return route.fulfill({ json: [] })
      requests++
      return requests === 1
        ? route.fulfill({
            status: 503,
            json: { code: 'temporary_unavailable', message: 'temporary unavailable' }
          })
        : route.fulfill({ json: record('当前测试记录') })
    })
    await page.goto(`/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}`)
    const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(drawer.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByRole('heading', { name: '当前测试记录', exact: true })).toBeVisible()
    expect(requests).toBe(2)
    expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    await page.screenshot({ path: testInfo.outputPath('detail-ready.png'), animations: 'disabled' })
  })

  test(`${scenario.feature} 记录不可用时保留返回说明`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ json: route.request().url().includes(scenario.rpc) ? null : [] })
    )
    await page.goto(`/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}`)
    await expect(
      page
        .getByRole('dialog', { name: scenario.title, exact: true })
        .getByText('详情记录不可用', { exact: true })
    ).toBeVisible()
  })

  test(`${scenario.feature} 较早请求不会覆盖新打开的记录`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let firstStarted!: () => void
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      if (!route.request().url().includes(scenario.rpc)) return route.fulfill({ json: [] })
      const id = route.request().postDataJSON().p_id
      if (id === 'first-record') {
        firstStarted()
        await firstPending
      }
      return route.fulfill({ json: record(id) })
    })
    await page.goto(`/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}`)
    await started
    await page.getByRole('button', { name: '切换测试记录', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(drawer.getByRole('heading', { name: 'second-record', exact: true })).toBeVisible()
    const oldResponse = page.waitForResponse(
      (response) =>
        response.url().includes(scenario.rpc) &&
        response.request().postDataJSON().p_id === 'first-record'
    )
    releaseFirst()
    await (await oldResponse).finished()
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    )
    await expect(drawer.getByRole('heading', { name: 'second-record', exact: true })).toBeVisible()
    await expect(drawer.getByRole('heading', { name: 'first-record', exact: true })).toHaveCount(0)
  })
}
