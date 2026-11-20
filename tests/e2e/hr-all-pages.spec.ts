import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

const dictionaryTenant = '11111111-1111-4111-8111-111111111111'
const dictionaryCases = [
  {
    page: 'operations/self-service',
    entity: 'request',
    valueField: 'status',
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
    page: 'talent/performance',
    entity: 'cycle',
    valueField: 'status',
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
    page: 'talent/performance',
    entity: 'review',
    valueField: 'status',
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
    page: 'talent/performance',
    entity: 'goal',
    valueField: 'status',
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
    page: 'talent/performance',
    entity: 'check_in',
    valueField: 'riskStatus',
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
    page: 'talent/performance',
    entity: 'calibration',
    valueField: 'status',
    tab: '校准会议',
    columnLabel: '状态',
    rowIdentity: '字典验收校准1',
    code: 'hrPerformanceCalibrationStatus',
    known: 'in_progress',
    historical: 'approved',
    label: '校准进行',
    historicalLabel: '校准通过'
  },
  {
    page: 'talent/development',
    entity: 'plan',
    valueField: 'status',
    tab: '培养计划',
    columnLabel: '状态',
    rowIdentity: '字典验收培养计划1',
    code: 'hrTrainingPlanStatus',
    known: 'published',
    historical: 'cancelled',
    label: '已发布',
    historicalLabel: '已取消'
  },
  {
    page: 'talent/development',
    entity: 'course',
    valueField: 'status',
    tab: '课程目录',
    columnLabel: '状态',
    rowIdentity: '字典验收课程1',
    code: 'hrLearningCourseStatus',
    known: 'published',
    historical: 'retired',
    label: '已发布',
    historicalLabel: '已退役'
  },
  {
    page: 'talent/development',
    entity: 'session',
    valueField: 'status',
    tab: '培训班次',
    columnLabel: '状态',
    rowIdentity: '字典验收课程1',
    code: 'hrLearningSessionStatus',
    known: 'open',
    historical: 'cancelled',
    label: '开放报名',
    historicalLabel: '已取消'
  },
  {
    page: 'talent/development',
    entity: 'enrollment',
    valueField: 'status',
    tab: '学习结果',
    columnLabel: '状态',
    rowIdentity: '字典验收员工1',
    code: 'hrLearningEnrollmentStatus',
    known: 'passed',
    historical: 'withdrawn',
    label: '已通过',
    historicalLabel: '已撤回'
  },
  {
    page: 'talent/development',
    entity: 'certificate',
    valueField: 'status',
    tab: '学习证书',
    columnLabel: '状态',
    rowIdentity: '字典验收证书1',
    code: 'hrLearningCertificateStatus',
    known: 'valid',
    historical: 'revoked',
    label: '有效',
    historicalLabel: '已撤销'
  },
  {
    page: 'talent/internal-mobility',
    entity: 'opportunity',
    valueField: 'opportunityType',
    tab: '内部机会',
    columnLabel: '类型 / 安排',
    rowIdentity: '字典验收机会1',
    code: 'hrMobilityOpportunityType',
    known: 'permanent',
    historical: 'gig',
    label: '永久岗位',
    historicalLabel: '短期任务'
  },
  {
    page: 'talent/internal-mobility',
    entity: 'opportunity',
    valueField: 'status',
    tab: '内部机会',
    columnLabel: '状态',
    rowIdentity: '字典验收机会1',
    code: 'hrMobilityOpportunityStatus',
    known: 'open',
    historical: 'closed',
    label: '开放中',
    historicalLabel: '已关闭'
  },
  {
    page: 'talent/internal-mobility',
    entity: 'application',
    valueField: 'managerAwareness',
    tab: '流动申请',
    columnLabel: '经理知会',
    rowIdentity: '字典验收员工1',
    code: 'hrMobilityManagerAwareness',
    known: 'supported',
    historical: 'informed',
    label: '明确支持',
    historicalLabel: '已知会'
  },
  {
    page: 'talent/internal-mobility',
    entity: 'application',
    valueField: 'status',
    tab: '流动申请',
    columnLabel: '阶段',
    rowIdentity: '字典验收员工1',
    code: 'hrMobilityApplicationStatus',
    known: 'accepted',
    historical: 'withdrawn',
    label: '已接受',
    historicalLabel: '已撤回'
  },
  {
    page: 'talent/succession',
    entity: 'plan',
    valueField: 'status',
    tab: '识别关键岗位',
    columnLabel: '状态',
    rowIdentity: '字典验收继任计划1',
    code: 'hrSuccessionPlanStatus',
    known: 'active',
    historical: 'closed',
    label: '执行中',
    historicalLabel: '已关闭'
  },
  {
    page: 'talent/succession',
    entity: 'candidate',
    valueField: 'status',
    tab: '建立继任梯队',
    columnLabel: '状态',
    rowIdentity: '字典验收员工1',
    code: 'hrSuccessionCandidateStatus',
    known: 'active',
    historical: 'withdrawn',
    label: '培养中',
    historicalLabel: '已撤回'
  },
  {
    page: 'talent/succession',
    entity: 'action',
    valueField: 'status',
    tab: '推动发展行动',
    columnLabel: '状态',
    rowIdentity: '字典验收发展行动1',
    code: 'hrSuccessionActionStatus',
    known: 'in_progress',
    historical: 'cancelled',
    label: '进行中',
    historicalLabel: '已取消'
  }
] as const
const dictionaryRpcByPage: Record<string, string> = {
  'operations/self-service': 'hr_list_service_delivery_records_secure',
  'talent/performance': 'hr_list_performance_records_secure',
  'talent/development': 'hr_list_learning_records_secure',
  'talent/internal-mobility': 'hr_list_internal_mobility_records_secure',
  'talent/succession': 'hr_list_succession_records_secure'
}
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
function statusRecord(pageName: string, entity: string, index: number) {
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
    },
    plan: {
      planCode: `DICT-PLAN-${index + 1}`,
      planName: `字典验收培养计划${index + 1}`,
      trainingType: 'internal',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      budget: 0,
      actualCost: 0,
      mandatory: false,
      owner: reference,
      targetAudience: '验收员工',
      sessionCount: 0,
      learnerCount: 0
    },
    course: {
      courseCode: `DICT-COURSE-${index + 1}`,
      courseName: `字典验收课程${index + 1}`,
      category: 'professional',
      deliveryMode: 'classroom',
      durationHours: 1,
      creditHours: 1,
      passingScore: 60,
      minimumAttendancePercent: 80,
      certificateEnabled: true,
      sessionCount: 0,
      competencyCount: 0
    },
    session: {
      sessionCode: `DICT-SESSION-${index + 1}`,
      planId: 'dictionary-plan',
      courseId: 'dictionary-course',
      startAt: '2026-11-18T08:30:00+08:00',
      endAt: '2026-11-18T09:30:00+08:00',
      capacity: 10,
      instructorName: '验收讲师',
      location: '培训教室',
      estimatedCost: 0,
      actualCost: 0,
      plan: { ...reference, name: '字典验收培养计划' },
      course: { ...reference, name: `字典验收课程${index + 1}` },
      enrollmentCount: 0,
      passedCount: 0
    },
    enrollment: {
      planId: 'dictionary-plan',
      sessionId: 'dictionary-session',
      employeeId: reference.id,
      employee: reference,
      course: { ...reference, name: '字典验收课程' },
      session: { ...reference, startAt: '2026-11-18T08:30:00+08:00' },
      attendancePercent: 100,
      score: 90,
      certificateNo: `DICT-CERT-${index + 1}`
    },
    certificate: {
      enrollmentId: 'dictionary-enrollment',
      employeeId: reference.id,
      courseId: 'dictionary-course',
      certificateNo: `DICT-CERT-${index + 1}`,
      certificateName: `字典验收证书${index + 1}`,
      issuedOn: '2026-11-01',
      expiresOn: '2027-11-01',
      employee: reference,
      course: { ...reference, name: '字典验收课程' }
    },
    opportunity: {
      opportunityCode: `DICT-MOB-${index + 1}`,
      opportunityTitle: `字典验收机会${index + 1}`,
      organizationId: 'dictionary-organization',
      organizationName: '验收组织',
      positionName: '验收岗位',
      hiringManagerEmployeeId: reference.id,
      hiringManagerName: '验收经理',
      capacity: 1,
      workMode: 'onsite',
      workLocation: '验收现场',
      expectedStartDate: '2026-12-01',
      applicationOpenDate: '2026-11-01',
      applicationCloseDate: '2026-11-30',
      minTenureMonths: 0,
      roleSummary: '核对内部机会的字典显示',
      requiredSkills: '按岗位要求',
      version: 1,
      applicationCount: 0,
      acceptedCount: 0
    },
    application: {
      opportunityId: 'dictionary-opportunity',
      opportunityCode: 'DICT-MOB',
      opportunityTitle: '字典验收机会',
      opportunityType: 'permanent',
      targetOrganizationName: '验收目标组织',
      targetPositionName: '验收目标岗位',
      employeeId: reference.id,
      employeeNo: reference.code,
      employeeName: reference.name,
      currentOrganizationName: '验收原组织',
      currentPositionName: '验收原岗位',
      currentJobTitle: '验收职务',
      motivation: '核对申请阶段与经理知会',
      assessmentScore: 90,
      assessmentNote: '验收评估记录'
    },
    candidate: {
      planId: 'dictionary-succession-plan',
      employeeId: reference.id,
      readiness: 'one_to_two_years',
      potentialLevel: 'high',
      retentionRisk: 'low',
      priority: 1,
      nominationSource: 'manager',
      aspirationConfirmed: true,
      nominatedOn: '2026-11-01',
      plan: { ...reference, name: '字典验收继任计划', positionName: '验收关键岗位' },
      employee: { ...reference, jobTitle: '验收职务' },
      openActionCount: 0
    },
    action: {
      candidateId: 'dictionary-candidate',
      actionType: 'mentoring',
      actionTitle: `字典验收发展行动${index + 1}`,
      actionDescription: '保持继任发展任务的原始事实',
      startDate: '2026-11-01',
      dueDate: '2026-12-01',
      candidate: { ...reference, employeeName: reference.name, positionName: '验收关键岗位' },
      owner: reference
    }
  }
  return {
    id: `dictionary-${entity}-${index}`,
    tenantId: dictionaryTenant,
    ...fields[entity],
    ...(pageName === 'talent/succession' && entity === 'plan'
      ? {
          planCode: `DICT-SUCCESSION-${index + 1}`,
          planName: `字典验收继任计划${index + 1}`,
          positionId: 'dictionary-position',
          criticality: 'high',
          vacancyRisk: 'medium',
          businessImpact: 'high',
          targetSuccessors: 1,
          reviewCycleMonths: 3,
          nextReviewDate: '2026-12-01',
          position: { ...reference, name: '验收关键岗位', organizationName: '验收组织' },
          activeCandidateCount: 0,
          readyNowCount: 0
        }
      : {}),
    ...Object.fromEntries(
      dictionaryCases
        .filter((item) => item.page === pageName && item.entity === entity)
        .map((item) => [
          item.valueField,
          [item.known, item.historical, '', `legacy-${item.code}-status`][index]
        ])
    )
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
      const dictionaryRpc = dictionaryRpcByPage[name]
      const dictionaryPage = Boolean(dictionaryRpc)
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
          if (endpoint === dictionaryRpc) {
            const body: Record<string, unknown> = request.postDataJSON()
            listBodies.push(body)
            if (endpoint === 'hr_list_service_delivery_records_secure')
              expect(body.p_scope).toBe('mine')
            else if (
              name === 'talent/development' ||
              name === 'talent/internal-mobility' ||
              name === 'talent/succession'
            ) {
              // These pages leave the optional tenant filter empty for ordinary users;
              // the authenticated RPC boundary determines their tenant scope.
              expect(body.p_tenant_id).toBeNull()
              expect(request.headers()['x-art-tenant-scope']).toBeUndefined()
            } else expect(body.p_tenant_id).toBe(dictionaryTenant)
            const family = dictionaryCases.find(
              (item) => item.page === name && item.entity === body.p_kind
            )
            const records = family
              ? [0, 1, 2, 3].map((index) => statusRecord(name, family.entity, index))
              : []
            return route.fulfill({
              json: {
                records,
                total: records.length,
                ...(name === 'talent/internal-mobility'
                  ? { manageAccess: false, myEmployeeId: null }
                  : {})
              }
            })
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
          if (endpoint === 'hr_learning_overview_secure')
            return route.fulfill({
              json: {
                publishedCourseCount: 0,
                openSessionCount: 0,
                activeLearnerCount: 0,
                completionRate: 0,
                expiringCertificateCount: 0,
                budgetExecutionRate: 0
              }
            })
          if (endpoint === 'hr_list_learning_options_secure') return route.fulfill({ json: [] })
          if (endpoint === 'hr_internal_mobility_overview_secure')
            return route.fulfill({
              json: {
                openOpportunityCount: 0,
                closingSoonCount: 0,
                applicationCount: 0,
                activeApplicationCount: 0,
                offerCount: 0,
                convertedCount: 0,
                myEmployeeId: null,
                manageAccess: false
              }
            })
          if (endpoint === 'hr_list_internal_mobility_options_secure')
            return route.fulfill({ json: [] })
          if (endpoint === 'hr_succession_overview_secure')
            return route.fulfill({
              json: {
                activePlanCount: 0,
                criticalPositionCount: 0,
                readyNowCount: 0,
                uncoveredPlanCount: 0,
                overdueActionCount: 0,
                dueReviewCount: 0
              }
            })
          if (endpoint === 'hr_list_succession_options_secure') return route.fulfill({ json: [] })
          if (endpoint === 'material_unit_compatibility_options') return route.fulfill({ json: [] })
          if (endpoint === 'get_table_column_runtime')
            return route.fulfill({ json: { enabled: false, profiles: [] } })
          if (request.method() !== 'GET' && endpoint !== 'current_is_super') {
            writes.push(request.url())
            return route.fulfill({ status: 403, json: { message: '测试不允许业务写入' } })
          }
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
        if (
          name === 'talent/development' ||
          name === 'talent/internal-mobility' ||
          name === 'talent/succession'
        )
          await expect(
            workspace
              .locator('.art-search-bar')
              .getByRole('combobox', { name: '租户', exact: true })
          ).toHaveCount(0)
        const families = dictionaryCases.filter((item) => item.page === name)
        if (name === 'talent/performance' || name === 'talent/development')
          await expect(workspace.getByRole('tab')).toHaveCount(6)
        if (name === 'talent/internal-mobility')
          await expect(workspace.getByRole('tab')).toHaveCount(2)
        const stageNavigation = workspace.getByRole('navigation', { name: '继任管理工作视图' })
        if (name === 'talent/succession')
          await expect(stageNavigation.getByRole('button')).toHaveCount(3)
        for (const family of families) {
          const isStageNavigation = name === 'talent/succession'
          const tab = isStageNavigation
            ? stageNavigation.getByRole('button', { name: new RegExp(family.tab) })
            : workspace.getByRole('tab', { name: new RegExp(family.tab) })
          const selectedAttribute = isStageNavigation ? 'aria-current' : 'aria-selected'
          const selectedValue = isStageNavigation ? 'step' : 'true'
          if ((await tab.getAttribute(selectedAttribute)) !== selectedValue) {
            const loaded = page.waitForResponse(
              (response) =>
                response.url().endsWith(`/rpc/${dictionaryRpc}`) &&
                response.request().postDataJSON().p_kind === family.entity
            )
            await tab.click()
            await loaded
          }
          await expect(tab).toHaveAttribute(selectedAttribute, selectedValue)
          if (isStageNavigation) await expect(tab).toHaveClass(/is-active/)
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
          const knownLabel =
            family.valueField === 'opportunityType' ? known.locator('.el-tag') : known
          const historicalLabel =
            family.valueField === 'opportunityType' ? historical.locator('.el-tag') : historical
          await known.scrollIntoViewIfNeeded()
          await expect(knownLabel).toHaveText(family.label)
          expect
            .soft(await known.locator('.el-tag').getAttribute('class'))
            .toContain('el-tag--warning')
          await historical.scrollIntoViewIfNeeded()
          await expect.soft(historicalLabel).toHaveText(family.historicalLabel)
          expect
            .soft(await historical.locator('.el-tag').getAttribute('class'))
            .toContain('el-tag--info')
          const empty = cells.nth(2).locator('td').nth(column)
          const unknown = cells.nth(3).locator('td').nth(column)
          await expect
            .soft(family.valueField === 'opportunityType' ? empty.locator('.el-tag') : empty)
            .toHaveText(family.page === 'talent/succession' ? '待核对' : '--')
          await expect
            .soft(family.valueField === 'opportunityType' ? unknown.locator('.el-tag') : unknown)
            .toHaveText(
              family.page === 'talent/performance' || family.page === 'talent/development'
                ? '未识别状态'
                : '待核对'
            )
          await expect.soft(unknown).not.toContainText(`legacy-${family.code}-status`)
          expect.soft(displayReads).toContain(`${family.code}:${family.historical}`)
          if (family.entity !== 'request' && ['status', 'riskStatus'].includes(family.valueField)) {
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
          await testInfo.attach(`dictionary-${family.code}-${width}-geometry`, {
            body: JSON.stringify(geometry, null, 2),
            contentType: 'application/json'
          })
          await page.screenshot({
            path: testInfo.outputPath(`dictionary-${family.code}-${width}.png`),
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
        if (name === 'talent/internal-mobility')
          await expect(
            workspace.getByRole('button', { name: /创建内部机会|发起内部申请|发布|录用/ })
          ).toHaveCount(0)
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
