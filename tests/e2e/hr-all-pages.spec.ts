import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

const dictionaryTenant = '11111111-1111-4111-8111-111111111111'
const dictionaryCases = [
  {
    entity: 'request',
    tab: '服务工单',
    columnLabel: '状态',
    rowIdentity: 'DICT-REQ-1',
    code: 'hrServiceRequestStatus',
    known: 'resolved',
    historical: 'closed',
    label: '已解决配置',
    historicalLabel: '已关闭历史'
  },
  {
    entity: 'cycle',
    tab: '考核周期',
    columnLabel: '状态',
    rowIdentity: '字典验收周期1',
    code: 'hrPerformanceCycleStatus',
    known: 'active',
    historical: 'cancelled',
    label: '周期进行',
    historicalLabel: '周期取消'
  },
  {
    entity: 'review',
    tab: '员工考核',
    columnLabel: '阶段',
    rowIdentity: '字典验收员工1',
    code: 'hrPerformanceReviewStatus',
    known: 'self_review',
    historical: 'completed',
    label: '员工自评',
    historicalLabel: '考核完成'
  },
  {
    entity: 'goal',
    tab: '绩效目标',
    columnLabel: '状态',
    rowIdentity: '字典验收目标1',
    code: 'hrPerformanceGoalStatus',
    known: 'in_progress',
    historical: 'completed',
    label: '目标进行',
    historicalLabel: '目标完成'
  },
  {
    entity: 'check_in',
    tab: '持续沟通',
    columnLabel: '风险',
    rowIdentity: '字典验收员工1',
    code: 'hrPerformanceCheckInRisk',
    known: 'on_track',
    historical: 'off_track',
    label: '进度正常',
    historicalLabel: '进度偏离'
  },
  {
    entity: 'calibration',
    tab: '校准会议',
    columnLabel: '状态',
    rowIdentity: '字典验收校准1',
    code: 'hrPerformanceCalibrationStatus',
    known: 'in_progress',
    historical: 'approved',
    label: '校准进行',
    historicalLabel: '校准通过'
  }
] as const
const statusDictionaryItems = dictionaryCases.flatMap((item) =>
  [
    { value: item.known, label: item.label, status: '1', tag_type: 'warning' },
    { value: item.historical, label: item.historicalLabel, status: '0', tag_type: 'info' }
  ].map((value) => ({
    ...value,
    id: `${item.code}-${value.value}`,
    dict_type_table: { code: item.code, name: item.code }
  }))
)
function statusRecord(entity: string, status: string, index: number) {
  const reference = {
    id: 'dictionary-reference',
    name: `字典验收员工${index + 1}`,
    code: 'EMP-001'
  }
  const fields: Record<string, Record<string, unknown>> = {
    request: {
      requestNo: `DICT-REQ-${index + 1}`,
      title: `字典验收工单${index + 1}`,
      reason: '只读核对员工服务状态',
      priority: 'normal',
      channel: 'self_service',
      requester: reference,
      attachmentUrls: [],
      reopenCount: 0,
      slaStatus: 'clear'
    },
    cycle: {
      cycleCode: `DICT-CYCLE-${index + 1}`,
      cycleName: `字典验收周期${index + 1}`,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      checkInFrequencyDays: 0,
      reviewCount: 0,
      completedCount: 0,
      pendingCalibrationCount: 0
    },
    review: {
      cycleId: 'dictionary-cycle',
      employeeId: reference.id,
      employee: reference,
      cycle: { ...reference, name: '字典验收周期' },
      goalCount: 0,
      goalWeight: 0,
      totalScore: 0
    },
    goal: {
      reviewId: 'dictionary-review',
      goalName: `字典验收目标${index + 1}`,
      targetDescription: '保留绩效目标的业务事实',
      goalType: 'business',
      employee: reference,
      weight: 0,
      progressPercent: 0
    },
    check_in: {
      reviewId: 'dictionary-review',
      employee: reference,
      checkInDate: '2026-11-18',
      progressPercent: 0,
      nextAction: '按原周期跟踪目标'
    },
    calibration: {
      cycleId: 'dictionary-cycle',
      sessionNo: `DICT-CAL-${index + 1}`,
      sessionName: `字典验收校准${index + 1}`,
      scheduledAt: '2026-11-18T08:30:00+08:00',
      itemCount: 0,
      adjustedCount: 0
    }
  }
  return {
    id: `dictionary-${entity}-${index}`,
    tenantId: dictionaryTenant,
    ...fields[entity],
    [entity === 'check_in' ? 'riskStatus' : 'status']: status
  }
}

const pages = [
  'operations/absence',
  'operations/attendance',
  'operations/benefits',
  'operations/compensation',
  'operations/compensation-review',
  'operations/contingent-workforce',
  'operations/employee-experience',
  'operations/employee-relations',
  'operations/headcount',
  'operations/people-analytics',
  'operations/policy-acknowledgement',
  'operations/self-service',
  'operations/workforce-risk',
  'personnel/compliance',
  'personnel/employee-detail',
  'personnel/employee-profile',
  'personnel/employee-roster',
  'personnel/job-architecture',
  'personnel/lifecycle',
  'personnel/organization-design',
  'personnel/organization-position',
  'personnel/personnel-change',
  'personnel/position',
  'recruitment/workbench',
  'talent/development',
  'talent/internal-mobility',
  'talent/performance',
  'talent/skill-matrix',
  'talent/succession',
  'talent/talent-inventory'
] as const

const lifecyclePages = new Set<string>([
  'operations/contingent-workforce',
  'operations/policy-acknowledgement',
  'personnel/organization-design'
])

test.use({ storageState: { cookies: [], origins: [] } })

test('假勤员工余额在年度输入框按 Enter 后按新年度查询', async ({ page }) => {
  test.setTimeout(90_000)
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const years: unknown[] = []
  await page.route('**/rest/v1/rpc/hr_list_absence_records_secure', (route) => {
    const { p_kind, p_balance_year } = route.request().postDataJSON()
    if (p_kind === 'balance') years.push(p_balance_year)
    return route.fulfill({ json: { records: [], total: 0 } })
  })
  await page.goto('/tests/e2e/fixtures/hr-all-pages.html?page=operations/absence', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('tab', { name: /员工余额/ }).click({ timeout: 60_000 })
  await expect.poll(() => years.length).toBeGreaterThan(0)
  const initialCount = years.length
  const year = page.getByRole('spinbutton', { name: '年度' })
  await year.fill('2035')
  await year.press('Enter')
  await expect.poll(() => years.slice(initialCount).map(String)).toEqual(['2035'])
})

for (const name of pages) {
  for (const width of [1440, 570]) {
    test(`HR ${name} ${width}px 渲染且无页面溢出`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      const dictionaryPage = name === 'operations/self-service' || name === 'talent/performance'
      await prepareIsolatedSession(
        page,
        dictionaryPage ? { tenantId: dictionaryTenant, platformSuper: false } : {}
      )
      const appearance = {
        theme: width === 570 ? ('dark' as const) : ('light' as const),
        boxBorderMode: width !== 570
      }
      if (dictionaryPage) await prepareAppearance(page, appearance)
      await page.setViewportSize({ width, height: 900 })
      const errors: string[] = []
      const writes: string[] = []
      const displayReads: string[] = []
      const listBodies: Record<string, unknown>[] = []
      let dictionaryPreloaded = false
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      if (dictionaryPage)
        await page.route('**/rest/v1/**', (route) => {
          const request = route.request()
          const url = new URL(request.url())
          const endpoint = url.pathname.split('/').pop()
          if (endpoint === 'sys_dictionary') {
            const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
            const value = url.searchParams.get('value')?.replace(/^eq\./, '')
            if (value !== undefined) {
              expect(url.searchParams.has('status')).toBe(false)
              displayReads.push(`${code}:${value}`)
            } else {
              expect(url.searchParams.get('status')).toBe('eq.1')
              if (!code) dictionaryPreloaded = true
            }
            return route.fulfill({
              json: statusDictionaryItems.filter(
                (item) =>
                  (!code || item.dict_type_table.code === code) &&
                  (value === undefined ? item.status === '1' : item.value === value)
              )
            })
          }
          if (
            endpoint === 'hr_list_service_delivery_records_secure' ||
            endpoint === 'hr_list_performance_records_secure'
          ) {
            const body: Record<string, unknown> = request.postDataJSON()
            listBodies.push(body)
            if (endpoint === 'hr_list_service_delivery_records_secure')
              expect(body.p_scope).toBe('mine')
            else expect(body.p_tenant_id).toBe(dictionaryTenant)
            const family = dictionaryCases.find((item) => item.entity === body.p_kind)
            const records = family
              ? [family.known, family.historical, '', `legacy-${family.entity}-status`].map(
                  (status, index) => statusRecord(family.entity, status, index)
                )
              : []
            return route.fulfill({ json: { records, total: records.length } })
          }
          if (endpoint === 'hr_service_delivery_overview_secure')
            return route.fulfill({
              json: {
                availableServiceCount: 0,
                openRequestCount: 0,
                slaRiskCount: 0,
                unassignedCount: 0,
                resolvedMonthCount: 0,
                responseOnTimeRate: 0,
                managerView: false
              }
            })
          if (endpoint === 'hr_performance_overview_secure') return route.fulfill({ json: {} })
          if (endpoint === 'hr_list_performance_options_secure') return route.fulfill({ json: [] })
          if (endpoint === 'material_unit_compatibility_options') return route.fulfill({ json: [] })
          if (request.method() !== 'GET' && endpoint !== 'current_is_super')
            writes.push(request.url())
          return route.fallback()
        })
      if (name === 'personnel/employee-detail') {
        await page.route('**/rest/v1/rpc/hr_get_employee_profile_secure**', (route) =>
          route.fulfill({
            json: {
              id: '11111111-1111-4111-8111-111111111113',
              employee_name: '测试员工',
              employee_no: 'EMP-001',
              employment_status: 'active',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              field_access: {}
            }
          })
        )
      }
      await page.goto(
        `/tests/e2e/fixtures/hr-all-pages.html?page=${name}${dictionaryPage ? `&role=ordinary&theme=${appearance.theme}` : ''}`
      )
      const workspace = page.locator('main.art-page-view')
      await expect(workspace).toBeVisible({ timeout: 60_000 })
      await expect
        .poll(async () => (await workspace.textContent())?.trim().length ?? 0, { timeout: 60_000 })
        .toBeGreaterThan(80)
      await expect(workspace.getByText('暂无查看权限', { exact: true })).toHaveCount(0)
      await expect
        .poll(() => workspace.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
        .toBe(true)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true)
      expect(errors).toEqual([])
      await workspace.screenshot({ path: testInfo.outputPath('page.png'), animations: 'disabled' })
      if (dictionaryPage) {
        await assertAppearance(page, appearance)
        expect(dictionaryPreloaded).toBe(true)
        await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
        const families = dictionaryCases.filter((item) =>
          name === 'operations/self-service' ? item.entity === 'request' : item.entity !== 'request'
        )
        if (name === 'talent/performance') await expect(workspace.getByRole('tab')).toHaveCount(6)
        for (const family of families) {
          const tab = workspace.getByRole('tab', { name: new RegExp(family.tab) })
          if ((await tab.getAttribute('aria-selected')) !== 'true') {
            const loaded = page.waitForResponse(
              (response) =>
                response.url().endsWith('/rpc/hr_list_performance_records_secure') &&
                response.request().postDataJSON().p_kind === family.entity
            )
            await tab.click()
            await loaded
          }
          await expect(tab).toHaveAttribute('aria-selected', 'true')
          await expect.poll(() => listBodies.at(-1)?.p_kind).toBe(family.entity)
          const table = workspace.locator('.el-table').first()
          await expect(table.locator('tbody tr')).toHaveCount(4)
          await expect(table.getByText(family.rowIdentity, { exact: true })).toBeVisible()
          const header = table.getByRole('columnheader', { name: family.columnLabel, exact: true })
          await expect(header).toBeVisible()
          const column = await header.evaluate(
            (element) => (element as HTMLTableCellElement).cellIndex
          )
          const cells = table.locator('tbody tr')
          const known = cells.nth(0).locator('td').nth(column).locator('.cell')
          const historical = cells.nth(1).locator('td').nth(column).locator('.cell')
          await known.scrollIntoViewIfNeeded()
          await expect(known).toHaveText(family.label)
          expect
            .soft(await known.locator('.el-tag').getAttribute('class'))
            .toContain('el-tag--warning')
          await historical.scrollIntoViewIfNeeded()
          await expect.soft(historical).toHaveText(family.historicalLabel)
          expect
            .soft(await historical.locator('.el-tag').getAttribute('class'))
            .toContain('el-tag--info')
          expect.soft((await cells.nth(2).locator('td').nth(column).innerText()).trim()).toBe('--')
          const unknown = cells.nth(3).locator('td').nth(column)
          await expect(unknown).toHaveText(family.entity === 'request' ? '待核对' : '未识别状态')
          await expect(unknown).not.toContainText(`legacy-${family.entity}-status`)
          expect.soft(displayReads).toContain(`${family.code}:${family.historical}`)
          if (family.entity !== 'request') {
            const filter = workspace.locator('.art-search-bar').getByRole('combobox', {
              name: family.entity === 'check_in' ? '风险' : '状态',
              exact: true
            })
            await filter.click()
            const options = page.locator('.el-select-dropdown:visible')
            await expect(
              options.getByRole('option', { name: family.label, exact: true })
            ).toBeVisible()
            await expect(
              options.getByRole('option', { name: family.historicalLabel, exact: true })
            ).toHaveCount(0)
            await page.keyboard.press('Escape')
          }
          const geometry = await workspace.evaluate((element) => ({
            workspace: element.getBoundingClientRect().toJSON(),
            viewport: { width: innerWidth, height: innerHeight },
            client: { width: element.clientWidth, height: element.clientHeight },
            scroll: { width: element.scrollWidth, height: element.scrollHeight }
          }))
          await testInfo.attach(`dictionary-${family.entity}-${width}-geometry`, {
            body: JSON.stringify(geometry, null, 2),
            contentType: 'application/json'
          })
          await page.screenshot({
            path: testInfo.outputPath(`dictionary-${family.entity}-${width}.png`),
            animations: 'disabled'
          })
        }
        const keyword = workspace
          .locator('.art-search-bar')
          .getByRole('textbox', { name: '关键字', exact: true })
        await keyword.fill('字典')
        await keyword.press('Enter')
        await expect.poll(() => listBodies.at(-1)?.p_keyword).toBe('字典')
        await workspace
          .getByRole('switch', { name: '进入专注模式', exact: true })
          .locator('..')
          .click()
        await expect(workspace.locator('.business-workspace-header')).toBeHidden()
        await expect(workspace.locator('.el-table').first().locator('tbody tr')).toHaveCount(4)
        await page.keyboard.press('Escape')
        await expect(workspace.locator('.business-workspace-header')).toBeVisible()
        await expect(workspace.getByRole('button', { name: /新增|删除|编辑/ })).toHaveCount(0)
        expect(writes).toEqual([])
        expect(errors).toEqual([])
      }
      if (lifecyclePages.has(name)) {
        const commandIcon = workspace.locator('[class$="__command-icon"]').first()
        const stageIcon = workspace.locator('[class$="__stage-icon"]').first()
        for (const theme of ['light', 'dark'] as const) {
          for (const boxMode of ['border-mode', 'shadow-mode'] as const) {
            await page.evaluate(
              ({ theme, boxMode }) => {
                document.documentElement.classList.toggle('dark', theme === 'dark')
                document.documentElement.dataset.boxMode = boxMode
              },
              { theme, boxMode }
            )
            await expect(commandIcon).toBeVisible()
            await expect(stageIcon).toBeVisible()
            await expect(commandIcon).toHaveCSS('width', '42px')
            await expect(commandIcon).toHaveCSS('height', '42px')
            await expect(stageIcon).toHaveCSS('width', '30px')
            await expect(stageIcon).toHaveCSS('height', '30px')
            await workspace.screenshot({
              path: testInfo.outputPath(`page-${theme}-${boxMode}.png`),
              animations: 'disabled'
            })
          }
        }
      }
    })
  }
}
