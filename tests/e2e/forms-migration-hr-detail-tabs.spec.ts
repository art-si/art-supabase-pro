import { expect, test, type Locator } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const serviceIdentity = {
  requester: { name: '艾力江·阿卜杜热合曼·穆罕默德', code: 'HR-EMP-2026-0000123456789' },
  assignee: { name: '古丽娜尔·阿不都热依木·阿卜杜拉' },
  service: {
    name: '跨区域员工岗位与人事服务',
    routingGroup: '华东区域生产装配与运输保障联合人力资源服务交付组'
  },
  reason: '员工申请核对跨区域岗位安排与人事服务记录。',
  resolution: '已核对岗位安排与服务记录，并向员工说明办理结果。',
  status: 'resolved'
}
const actionIdentity = {
  ownerEmployee: {
    employeeName: '阿依古丽·阿卜杜热合曼·买买提',
    jobTitle: '生产装配与运输保障联合岗位人力资源服务交付主管'
  },
  successMeasure: '完成跨区域员工服务交付流程复核，并归档可核验的改进记录。',
  status: 'planned'
}
const surveyIdentity = {
  audienceOrganization: {
    organizationName: '华东区域生产装配与运输保障联合运营中心人力资源服务部'
  }
}

async function measureSummaryValue(summary: Locator, text: string) {
  const value = summary.getByText(text, { exact: true })
  await expect(value).toBeVisible()
  await value.scrollIntoViewIfNeeded()
  const geometry = await value.evaluate((element) => {
    const cell = element.parentElement!.getBoundingClientRect()
    const card = element.closest('section')!.getBoundingClientRect()
    const scrollport = element.closest('.el-scrollbar__wrap')!.getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = Array.from(range.getClientRects())
    const fits = (boundary: { left: number; right: number; top: number; bottom: number }) =>
      lines.every(
        (line) =>
          line.left >= boundary.left - 1 &&
          line.right <= boundary.right + 1 &&
          line.top >= boundary.top - 1 &&
          line.bottom <= boundary.bottom + 1
      )
    return {
      text: element.textContent,
      lines: lines.length,
      fitsValue: fits(bounds),
      fitsCell: fits(cell),
      fitsCard: fits(card),
      fitsScrollport: fits(scrollport),
      fitsViewport: fits({ left: 0, right: innerWidth, top: 0, bottom: innerHeight })
    }
  })
  expect(geometry.text).toBe(text)
  expect(geometry.lines).toBeGreaterThan(0)
  for (const [boundary, fits] of Object.entries(geometry).filter(([key]) => key.startsWith('fits')))
    expect.soft(fits, `${text} 应完整显示于 ${boundary}`).toBe(true)
  return geometry
}

const scenarios = [
  { feature: 'benefits', entity: 'plan', tabs: 2 },
  { feature: 'benefits', entity: 'enrollment', tabs: 2 },
  { feature: 'benefits', entity: 'event', tabs: 2 },
  { feature: 'compliance', entity: 'contract', tabs: 2 },
  { feature: 'compliance', entity: 'qualification', tabs: 2 },
  { feature: 'relations', entity: 'case', tabs: 4 },
  { feature: 'relations', entity: 'restricted', tabs: 3 },
  { feature: 'service', entity: 'request', tabs: 2 },
  { feature: 'experience', entity: 'survey', tabs: 2 },
  { feature: 'experience', entity: 'insight', tabs: 4 },
  { feature: 'experience', entity: 'action', tabs: 2 },
  { feature: 'experience', entity: 'my', tabs: 0 }
]
for (const scenario of scenarios) {
  test(`HR ${scenario.feature}/${scenario.entity} 详情分类可见且切页不丢内容`, async ({
    page
  }, testInfo) => {
    const summaryTexts =
      scenario.feature === 'service'
        ? [
            serviceIdentity.requester.name,
            serviceIdentity.requester.code,
            serviceIdentity.assignee.name,
            serviceIdentity.service.routingGroup
          ]
        : scenario.feature === 'experience' && scenario.entity === 'action'
          ? [actionIdentity.ownerEmployee.employeeName, actionIdentity.ownerEmployee.jobTitle]
          : scenario.feature === 'experience' && scenario.entity === 'survey'
            ? [surveyIdentity.audienceOrganization.organizationName]
            : []
    const narrow =
      scenario.entity === 'event' ||
      scenario.entity === 'qualification' ||
      scenario.entity === 'insight'
    const appearances = summaryTexts.length
      ? ([
          { width: 1440, theme: 'light', boxBorderMode: true },
          { width: 390, theme: 'dark', boxBorderMode: false },
          { width: 320, theme: 'light', boxBorderMode: true }
        ] as const)
      : [{ width: narrow ? 570 : 1440, theme: narrow ? ('dark' as const) : ('light' as const) }]
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const appearance of appearances) {
      await prepareIsolatedSession(page)
      if ('boxBorderMode' in appearance) await prepareAppearance(page, appearance)
      await page.setViewportSize({ width: appearance.width, height: 900 })
      let detailReads = 0
      await page.route('**/rest/v1/**', (route) => {
        const request = route.request()
        const isDetail = request.url().includes('_detail_secure')
        if (isDetail) detailReads++
        else if (request.method() !== 'GET' && /\/rest\/v1\/(?:rpc\/)?hr_/.test(request.url()))
          writes.push(request.url())
        return route.fulfill({
          json: isDetail
            ? {
                id: 'detail-record',
                tenantId: 'test-tenant',
                planName: '验收福利计划',
                planCode: 'BEN-001',
                title: '验收详情事项',
                caseNo: 'CASE-001',
                contractNo: 'CONTRACT-001',
                qualificationName: '验收员工资质',
                surveyName: '验收员工调查',
                surveyCode: 'SURVEY-001',
                status: 'draft',
                availability: 'available',
                severity: 'low',
                minimumGroupSize: 5,
                currencyCode: 'CNY',
                eventType: 'marriage',
                eventDate: '2026-11-01',
                enrollmentWindowEnd: '2026-12-01',
                employee: {
                  id: 'employee-1',
                  tenantId: 'test-tenant',
                  employeeName: '验收员工',
                  employeeNo: 'EMP-001'
                },
                options: [],
                actions: [],
                events: [],
                questions: [],
                questionCount: 0,
                questionScores: [],
                organizationScores: [],
                comments: [],
                attachmentUrls: [],
                respondentCount: 8,
                scorePercent: 75,
                dimension: 'engagement',
                description: '业务上下文说明。'.repeat(90),
                sensitiveRestricted: scenario.entity === 'restricted',
                ...(scenario.feature === 'service' ? serviceIdentity : {}),
                ...(scenario.feature === 'experience' && scenario.entity === 'action'
                  ? actionIdentity
                  : {}),
                ...(scenario.feature === 'experience' && scenario.entity === 'survey'
                  ? surveyIdentity
                  : {})
              }
            : []
        })
      })
      await page.goto(
        `/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}&entity=${scenario.entity}&theme=${appearance.theme}`
      )
      if ('boxBorderMode' in appearance) await assertAppearance(page, appearance)
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer).toBeVisible({ timeout: 60_000 })
      await expect(drawer.locator('h3')).toBeVisible()
      const tabs = drawer.getByRole('tab')
      await expect(tabs).toHaveCount(scenario.tabs)
      await expect(drawer.getByText('详情记录不可用', { exact: true })).toHaveCount(0)
      if (scenario.tabs) {
        const panes = drawer.locator('.el-tab-pane')
        await expect(panes).toHaveCount(scenario.tabs)
        for (let index = 0; index < scenario.tabs; index++) {
          await tabs.nth(index).click()
          await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true')
          await expect(panes.nth(index)).toBeVisible()
          expect((await panes.nth(index).innerText()).trim().length).toBeGreaterThan(0)
          expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true
          )
          const scroll = drawer.locator('.el-scrollbar__wrap').first()
          await scroll.evaluate((node) => {
            node.scrollTop = node.scrollHeight
          })
          if (index === scenario.tabs - 1)
            await page.screenshot({
              path: testInfo.outputPath('detail-last-tab.png'),
              animations: 'disabled'
            })
        }
        await tabs.first().click()
        await expect(panes.first()).toBeVisible()
      } else {
        await page.screenshot({
          path: testInfo.outputPath('detail-compact.png'),
          animations: 'disabled'
        })
      }
      if (summaryTexts.length) {
        await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
        const cardShadow = await drawer
          .locator('.art-overlay-tab-card')
          .evaluate((element) => getComputedStyle(element).boxShadow)
        if ('boxBorderMode' in appearance && !appearance.boxBorderMode)
          expect(cardShadow).not.toBe('none')
        else expect(cardShadow).toBe('none')
        const summary = drawer.locator(
          scenario.feature === 'service'
            ? '.service-request-drawer__summary'
            : '.experience-detail__summary'
        )
        await expect(summary.locator('dl > div')).toHaveCount(4)
        const geometry = []
        for (const text of summaryTexts) geometry.push(await measureSummaryValue(summary, text))
        await testInfo.attach(`summary-values-${appearance.width}-${appearance.theme}`, {
          body: JSON.stringify(geometry, null, 2),
          contentType: 'application/json'
        })
        if (scenario.feature === 'service') {
          const status = drawer.locator('.service-request-drawer__hero-status .el-tag').first()
          await expect(status).toHaveText('待核对')
          await expect(status).toHaveClass(/el-tag--success/)
          await expect(drawer.getByText(serviceIdentity.reason, { exact: true })).toBeVisible()
          await expect(drawer.getByText(serviceIdentity.resolution, { exact: true })).toBeVisible()
        } else if (scenario.entity === 'action') {
          const status = drawer.locator('.experience-detail__status .el-tag')
          await expect(status).toHaveText('待核对')
          await expect(status).toHaveClass(/el-tag--primary/)
          await expect(
            drawer.getByText(actionIdentity.successMeasure, { exact: true })
          ).toBeVisible()
        } else {
          const status = drawer.locator('.experience-detail__status .el-tag')
          await expect(status).toHaveText('待核对')
          await expect(status).toHaveClass(/el-tag--primary/)
          await expect(drawer.getByText('尚未配置题目', { exact: true })).toBeVisible()
        }
        await page.screenshot({
          path: testInfo.outputPath(`summary-values-${appearance.width}-${appearance.theme}.png`),
          animations: 'disabled'
        })
        expect(detailReads).toBe(1)
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBe(true)
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
