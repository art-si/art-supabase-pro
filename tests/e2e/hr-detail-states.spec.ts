import { expect, test, type Locator } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { expectHrIdentityIconStyle } from './support/hr-identity-icon-style'
import { expectOverlayTabPanel } from './support/overlay-tab-card'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const longComplianceText =
  '验收合规记录：已按原始凭证核对责任与有效期限。HR-COMPLIANCE-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'

for (const scenario of [
  {
    feature: 'compliance',
    entity: 'qualification',
    rpc: 'hr_get_compliance_detail_secure',
    drawerTitle: '员工资质详情',
    title:
      '特种作业人员高处安装、维护、拆除作业资格证（生产装配与设备检修联合岗位适用 · HR-QUALIFICATION-2026-0000123456789）',
    icon: '.compliance-detail__hero-icon',
    status: ['有效', '正常'],
    historyTab: '审计轨迹',
    emptyHistory: '暂无合规审计记录'
  },
  {
    feature: 'benefits',
    entity: 'plan',
    rpc: 'hr_get_benefit_detail_secure',
    drawerTitle: '福利与参保详情',
    title:
      '华东生产与运输保障团队年度补充医疗及意外伤害综合保障计划（含设备检修与夜班岗位，2026年度）',
    icon: '.benefit-detail__identity > span',
    status: ['草稿'],
    historyTab: '变更轨迹',
    emptyHistory: '暂无审计记录'
  },
  {
    feature: 'relations',
    entity: 'case',
    rpc: 'hr_get_employee_relation_case_detail_secure',
    drawerTitle: '员工关系案件详情',
    title:
      '生产装配与运输保障联合岗位工作安排沟通及劳动关系协调案件（跨班组排班、设备维护和值班职责复核）',
    icon: '.employee-relation-detail__identity > span',
    status: ['低风险', '已受理'],
    historyTab: '案件轨迹',
    emptyHistory: '暂无案件审计记录'
  }
] as const) {
  test(`${scenario.feature} 长业务标题在详情内完整可读且保留身份与状态`, async ({ page }, info) => {
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const appearance of [
      { width: 1440, theme: 'light', boxBorderMode: true },
      { width: 390, theme: 'dark', boxBorderMode: false },
      { width: 320, theme: 'light', boxBorderMode: true }
    ] as const) {
      await prepareIsolatedSession(page)
      await prepareAppearance(page, appearance)
      await page.setViewportSize({ width: appearance.width, height: 900 })
      let detailReads = 0
      await page.route('**/rest/v1/**', (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith(`/rpc/${scenario.rpc}`)) {
          detailReads++
          expect(request.method()).toBe('POST')
          expect(request.postDataJSON().p_id).toBe('first-record')
          return route.fulfill({
            json: {
              ...record('first-record'),
              title: scenario.title,
              plan_name: scenario.title,
              qualification_name: scenario.title,
              employee: { employee_name: '验收员工', employee_no: 'EMP-001' },
              subject_employee: {
                employee_name: '验收员工',
                employee_no: 'EMP-001',
                position_name: '验收岗位'
              },
              status:
                scenario.feature === 'compliance'
                  ? 'valid'
                  : scenario.feature === 'relations'
                    ? 'reported'
                    : 'draft',
              risk_status: 'clear',
              verification_status: 'verified',
              amount_visible: false,
              provider_name: '验收福利服务机构',
              sensitive_restricted: false,
              events: []
            }
          })
        }
        if (request.method() !== 'GET' && /\/rest\/v1\/(?:rpc\/)?hr_/.test(path))
          writes.push(request.url())
        return route.fallback()
      })
      const query = new URLSearchParams({
        feature: scenario.feature,
        entity: scenario.entity,
        theme: appearance.theme
      })
      await page.goto(`/tests/e2e/fixtures/hr-detail-states.html?${query}`)
      await assertAppearance(page, appearance)
      const drawer = page.getByRole('dialog', { name: scenario.drawerTitle, exact: true })
      const heading = drawer.getByRole('heading', {
        name: scenario.title,
        level: 3,
        exact: true
      })
      await expect(heading).toBeVisible()
      await heading.scrollIntoViewIfNeeded()
      const geometry = await heading.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const hero = element.closest('section')!.getBoundingClientRect()
        const scrollport = element.closest('.el-scrollbar__wrap')!.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        const lines = Array.from(range.getClientRects())
        return {
          textFitsHeading: lines.every(
            (line) =>
              line.left >= bounds.left - 1 &&
              line.right <= bounds.right + 1 &&
              line.top >= bounds.top - 1 &&
              line.bottom <= bounds.bottom + 1
          ),
          textFitsHero: lines.every(
            (line) =>
              line.left >= hero.left - 1 &&
              line.right <= hero.right + 1 &&
              line.top >= hero.top - 1 &&
              line.bottom <= hero.bottom + 1
          ),
          textFitsViewport: lines.every(
            (line) =>
              line.left >= Math.max(scrollport.left, 0) - 1 &&
              line.right <= Math.min(scrollport.right, innerWidth) + 1 &&
              line.top >= Math.max(scrollport.top, 0) - 1 &&
              line.bottom <= Math.min(scrollport.bottom, innerHeight) + 1
          ),
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth
        }
      })
      await info.attach(`hero-title-${appearance.width}-${appearance.theme}`, {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json'
      })
      await drawer.screenshot({
        path: info.outputPath(`hero-title-${appearance.width}-${appearance.theme}.png`)
      })
      expect(geometry.textFitsHeading).toBe(true)
      expect(geometry.textFitsHero).toBe(true)
      expect(geometry.textFitsViewport).toBe(true)
      expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1)
      const regionGaps = await heading.evaluate((element) => {
        const root = element.closest('section')!.parentElement!
        const regions = Array.from(root.children).filter(
          (region) => region instanceof HTMLElement && region.offsetHeight > 0
        )
        return regions
          .slice(1)
          .map(
            (region, index) =>
              region.getBoundingClientRect().top - regions[index].getBoundingClientRect().bottom
          )
      })
      expect(regionGaps.length).toBeGreaterThan(0)
      for (const gap of regionGaps) expect(gap).toBeCloseTo(16, 0)
      await expectHrIdentityIconStyle(
        drawer.locator(scenario.icon),
        scenario.feature === 'compliance'
          ? {
              backgroundColor:
                'color-mix(in srgb, var(--theme-color) 11%, var(--default-box-color))',
              borderRadius: 'var(--art-surface-radius)'
            }
          : undefined
      )
      const hero = heading.locator('xpath=ancestor::section[1]')
      for (const status of scenario.status)
        await expect(hero.getByText(status, { exact: true })).toBeVisible()
      await expect(drawer.getByRole('button', { name: '关闭抽屉', exact: true })).toBeInViewport()
      await drawer.getByRole('tab', { name: scenario.historyTab, exact: true }).click()
      await expect(drawer.getByText(scenario.emptyHistory, { exact: true })).toBeVisible()
      expect(detailReads).toBe(1)
      await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      await expect(drawer).toBeHidden()
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

async function expectComplianceFacts(
  drawer: Locator,
  expected: Record<string, string>,
  longLabel: string,
  labelWidth: number
) {
  const panel = await expectOverlayTabPanel(drawer, '合规资料')
  await expect(panel.locator('.art-descriptions')).toHaveCount(1)
  const value = (label: string) =>
    panel
      .getByText(label, { exact: true })
      .locator('xpath=following-sibling::*[1]')
      .locator('.art-descriptions__value')
  for (const [label, text] of Object.entries(expected)) await expect(value(label)).toHaveText(text)
  const content = value(longLabel)
  await content.scrollIntoViewIfNeeded()
  await expect(content).toBeInViewport()
  const geometry = await content.evaluate((element) => {
    const cell = element.closest('.el-descriptions__content')!
    const boundary = cell.getBoundingClientRect()
    const scrollport = element.closest('.el-scrollbar__wrap')!.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      labelWidth: cell.previousElementSibling!.getBoundingClientRect().width,
      valueWidth: boundary.width,
      left: Math.max(boundary.left, 0),
      right: Math.min(boundary.right, innerWidth),
      top: Math.max(scrollport.top, 0),
      bottom: Math.min(scrollport.bottom, innerHeight),
      lines: Array.from(range.getClientRects(), ({ left, right, top, bottom }) => ({
        left,
        right,
        top,
        bottom
      }))
    }
  })
  expect(geometry.labelWidth).toBeCloseTo(labelWidth, 0)
  expect(geometry.valueWidth).toBeGreaterThan(geometry.labelWidth)
  expect(geometry.lines.length).toBeGreaterThan(0)
  for (const line of geometry.lines) {
    expect(line.left).toBeGreaterThanOrEqual(geometry.left - 1)
    expect(line.right).toBeLessThanOrEqual(geometry.right + 1)
    expect(line.top).toBeGreaterThanOrEqual(geometry.top - 1)
    expect(line.bottom).toBeLessThanOrEqual(geometry.bottom + 1)
  }
  return geometry
}

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
    const compliance = scenario.feature === 'compliance'
    if (compliance) await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
    await page.setViewportSize({ width: compliance ? 390 : 570, height: 900 })
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
              description: '业务说明'.repeat(80),
              ...(compliance
                ? {
                    qualification_type: '',
                    certificate_no: '',
                    issuer: longComplianceText,
                    issue_date: '2026-11-01',
                    expiry_date: null,
                    verified_at: '2026-11-02T08:30:00Z',
                    verification_note: longComplianceText,
                    revoked_at: null,
                    attachment_url: 'https://example.invalid/compliance-proof.pdf'
                  }
                : {})
            }
          : []
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}&entity=${scenario.entity}&theme=${compliance ? 'dark' : 'light'}`
    )
    const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(drawer.locator('h3')).toBeVisible()
    await expect(drawer.getByText('详情记录不可用', { exact: true })).toHaveCount(0)
    if (scenario.feature === 'benefits') {
      await expectOverlayTabPanel(drawer, '福利资料')
      await drawer.getByRole('tab', { name: '变更轨迹' }).click()
      await expectOverlayTabPanel(drawer, '变更轨迹')
    }
    if (compliance) {
      await expect(page.locator('html')).toHaveClass(/dark/)
      const geometry = await expectComplianceFacts(
        drawer,
        {
          资质类别: '',
          证书编号: '--',
          发证机构: longComplianceText,
          发证日期: '2026-11-01',
          有效期至: '--',
          核验时间: '2026-11-02 16:30:00',
          核验说明: longComplianceText,
          撤销信息: '未撤销'
        },
        '核验说明',
        96
      )
      await testInfo.attach('qualification-fact-geometry', {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json'
      })
      await page.screenshot({ path: testInfo.outputPath('qualification-facts-dark390.png') })
      const attachment = drawer.getByRole('link', { name: '查看授权附件', exact: true })
      await expect(attachment).toHaveAttribute(
        'href',
        'https://example.invalid/compliance-proof.pdf'
      )
      await drawer.getByRole('tab', { name: '审计轨迹', exact: true }).click()
      await expect(drawer.getByText('暂无合规审计记录', { exact: true })).toBeVisible()
      await drawer.getByRole('tab', { name: '合规资料', exact: true }).click()
    }
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
    const compliance = scenario.feature === 'compliance'
    if (compliance) await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    await page.setViewportSize({ width: compliance ? 1440 : 570, height: 900 })
    let requests = 0
    await page.route('**/rest/v1/**', (route) => {
      if (!route.request().url().includes(scenario.rpc)) return route.fulfill({ json: [] })
      requests++
      return requests === 1
        ? route.fulfill({
            status: 503,
            json: { code: 'temporary_unavailable', message: 'temporary unavailable' }
          })
        : route.fulfill({
            json: {
              ...record('当前测试记录'),
              ...(compliance
                ? {
                    contract_type: '',
                    sign_date: '2026-10-30',
                    start_date: '2026-11-01',
                    end_date: null,
                    probation_end_date: null,
                    renewal_reminder_days: 0,
                    termination_date: '2026-11-04',
                    termination_reason: longComplianceText
                  }
                : {})
            }
          })
    })
    await page.goto(`/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}`)
    const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(drawer.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByRole('heading', { name: '当前测试记录', exact: true })).toBeVisible()
    expect(requests).toBe(2)
    if (compliance) {
      await expect(page.locator('html')).not.toHaveClass(/dark/)
      const geometry = await expectComplianceFacts(
        drawer,
        {
          合同编号: '当前测试记录',
          合同类型: '',
          签订日期: '2026-10-30',
          生效日期: '2026-11-01',
          结束日期: '--',
          试用期结束: '--',
          续签提醒: '0 天前',
          终止信息: `2026-11-04 · ${longComplianceText}`
        },
        '终止信息',
        108
      )
      await testInfo.attach('contract-fact-geometry', {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json'
      })
      for (const [width, rowCount] of [
        [768, 4],
        [767, 8]
      ]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(drawer.locator('.art-descriptions').getByRole('row')).toHaveCount(rowCount)
      }
      await page.setViewportSize({ width: 1440, height: 900 })
    }
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

for (const scenario of [
  {
    feature: 'benefits',
    rpc: 'hr_get_benefit_detail_secure',
    title: '福利与参保详情',
    selector: '.benefit-detail__identity > span'
  },
  {
    feature: 'relations',
    rpc: 'hr_get_employee_relation_case_detail_secure',
    title: '员工关系案件详情',
    selector: '.employee-relation-detail__identity > span'
  }
]) {
  for (const variant of [
    { name: 'light', width: 1440 },
    { name: 'dark', width: 570 }
  ]) {
    test(`${scenario.feature} 图标 ${variant.width}px ${variant.name} 保持原尺寸与主题色`, async ({
      page
    }, testInfo) => {
      await prepareIsolatedSession(page)
      await page.setViewportSize({ width: variant.width, height: 900 })
      await page.route('**/rest/v1/**', (route) =>
        route.fulfill({
          json: route.request().url().includes(scenario.rpc) ? record('测试业务详情') : []
        })
      )
      await page.goto(
        `/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}&theme=${variant.name}`
      )
      const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
      await expect(drawer.locator('h3')).toBeVisible()
      await expect
        .poll(() =>
          page.evaluate(() => ({
            dark: document.documentElement.classList.contains('dark'),
            colorScheme: getComputedStyle(document.documentElement).colorScheme
          }))
        )
        .toEqual({ dark: variant.name === 'dark', colorScheme: variant.name })
      await expectHrIdentityIconStyle(drawer.locator(scenario.selector))
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: testInfo.outputPath(`${scenario.feature}-${variant.name}-${variant.width}.png`),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      await expect(drawer).toBeHidden()
      await expect(page.getByRole('button', { name: '切换测试记录', exact: true })).toBeVisible()
    })
  }
}
