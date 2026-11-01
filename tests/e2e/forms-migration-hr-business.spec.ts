import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111'
const recordId = '44444444-4444-4444-8444-444444444444'
const employeeId = '33333333-3333-4333-8333-333333333333'
const referenceId = '55555555-5555-4555-8555-555555555555'
const organizationId = '66666666-6666-4666-8666-666666666666'
const positionId = '77777777-7777-4777-8777-777777777777'
const common = { id: recordId, tenantId, status: 'draft' }
const employee = { id: employeeId, tenantId, name: '验收员工', code: 'EMP-001' }
const compensationItems = [1, 2, 3].map((index) => ({
  componentId: '88888888-8888-4888-8888-88888888888' + index,
  componentCode: 'COMP-' + index,
  componentName: '验收项目' + index,
  category: 'allowance',
  amountType: 'fixed',
  defaultAmount: 100,
  defaultRate: null,
  required: false,
  sort: index,
  amount: 100,
  rate: null
}))
const path = (relative: string) => 'modules/art-supabase-hr/src/views/' + relative
interface Scenario {
  name: string
  path: string
  kind: string
  rpc: string
  separateEntityRpc?: boolean
  style: 'entity-row' | 'payload' | 'type-row' | 'plain-payload'
  row: Record<string, unknown>
  label: string
  key: string
  value?: string
  date?: boolean
  targetTab?: number
  expectedTabs: number
  markerLabel?: string
  markerKey?: string
  markerTab?: number
  permissions?: string[]
  args?: unknown[]
  clearFirst?: boolean
  noPayloadTenant?: boolean
}
const scenarios: Scenario[] = [
  {
    name: '学习计划',
    path: path('talent/development/modules/learning-dialog.vue'),
    kind: 'plan',
    rpc: 'hr_save_learning_record_secure',
    style: 'entity-row',
    row: {
      ...common,
      planCode: 'PLAN-001',
      planName: '',
      trainingType: 'skill',
      startDate: '2026-11-01',
      endDate: '2026-12-01',
      mandatory: false,
      objective: '学习目标',
      remark: '原补充说明'
    },
    label: '计划名称',
    key: 'plan_name',
    expectedTabs: 2
  },
  {
    name: '学习课程',
    path: path('talent/development/modules/learning-dialog.vue'),
    kind: 'course',
    rpc: 'hr_save_learning_record_secure',
    style: 'entity-row',
    row: {
      ...common,
      courseCode: 'COURSE-001',
      courseName: '',
      category: 'professional',
      deliveryMode: 'classroom',
      durationHours: 8,
      creditHours: 8,
      passingScore: 60,
      minimumAttendancePercent: 80,
      certificateEnabled: false,
      learningObjectives: '可验证学习目标',
      description: '课程说明'
    },
    label: '课程名称',
    key: 'course_name',
    expectedTabs: 2
  },
  {
    name: '培训班次',
    path: path('talent/development/modules/learning-dialog.vue'),
    kind: 'session',
    rpc: 'hr_save_learning_record_secure',
    style: 'entity-row',
    row: {
      ...common,
      sessionCode: '',
      planId: referenceId,
      courseId: referenceId,
      startAt: '2026-11-10 09:00:00',
      endAt: '2026-11-10 17:00:00',
      enrollmentDeadline: '2026-11-09 18:00:00',
      capacity: 30,
      location: '培训教室',
      instructorName: '验收讲师'
    },
    label: '班次编码',
    key: 'session_code',
    value: 'SESSION-MIGRATION',
    expectedTabs: 2
  },
  {
    name: '绩效目标',
    path: path('talent/performance/modules/performance-dialog.vue'),
    kind: 'goal',
    rpc: 'hr_save_performance_record_secure',
    style: 'payload',
    row: {
      ...common,
      reviewId: referenceId,
      goalName: '',
      goalType: 'business',
      weight: 100,
      dueDate: '2026-12-31',
      progressPercent: 0,
      goalStatus: 'draft',
      targetDescription: '验收目标标准',
      actualResult: '阶段结果',
      employeeScore: 80,
      managerScore: 85
    },
    label: '目标名称',
    key: 'goal_name',
    expectedTabs: 2
  },
  {
    name: '绩效沟通',
    path: path('talent/performance/modules/performance-dialog.vue'),
    kind: 'check_in',
    rpc: 'hr_save_performance_record_secure',
    style: 'payload',
    row: {
      ...common,
      reviewId: referenceId,
      checkInDate: '2026-11-01',
      progressPercent: 30,
      riskStatus: 'on_track',
      achievement: '完成阶段成果',
      blocker: '需要跨部门支持',
      nextAction: '',
      managerFeedback: '继续跟进'
    },
    label: '下一步行动',
    key: 'next_action',
    targetTab: 1,
    expectedTabs: 2
  },
  {
    name: '继任计划',
    path: path('talent/succession/modules/succession-dialog.vue'),
    kind: 'plan',
    rpc: 'hr_save_succession_plan_secure',
    separateEntityRpc: true,
    style: 'entity-row',
    row: {
      ...common,
      planCode: 'SUCCESSION-001',
      planName: '',
      positionId,
      criticality: 'high',
      vacancyRisk: 'medium',
      businessImpact: 'high',
      targetSuccessors: 2,
      reviewCycleMonths: 6,
      nextReviewDate: '2026-12-01',
      notes: '继任计划依据'
    },
    label: '计划名称',
    key: 'plan_name',
    expectedTabs: 2
  },
  {
    name: '继任候选人',
    path: path('talent/succession/modules/succession-dialog.vue'),
    kind: 'candidate',
    rpc: 'hr_save_succession_candidate_secure',
    separateEntityRpc: true,
    style: 'entity-row',
    row: {
      ...common,
      status: 'nominated',
      planId: referenceId,
      employeeId,
      employee,
      readiness: 'ready_now',
      potentialLevel: 'high',
      retentionRisk: 'low',
      priority: 1,
      nominationSource: 'manager',
      aspirationConfirmed: true,
      nominatedOn: '',
      strengths: '已有优势',
      developmentGaps: '发展差距',
      reviewComment: '原评审说明'
    },
    label: '提名日期',
    key: 'nominated_on',
    date: true,
    value: '2026-11-01',
    targetTab: 1,
    expectedTabs: 2,
    markerLabel: '评审意见',
    markerKey: 'review_comment',
    markerTab: 1
  },
  {
    name: '生命周期事项',
    path: path('personnel/lifecycle/modules/lifecycle-dialog.vue'),
    kind: 'case',
    rpc: 'hr_save_lifecycle_record_secure',
    style: 'payload',
    row: {
      ...common,
      caseNo: 'LC-001',
      caseType: 'onboarding',
      employeeId,
      employee,
      plannedEffectiveDate: '',
      priority: 'normal',
      templateId: referenceId,
      organizationId,
      positionId,
      ownerEmployeeId: employeeId,
      owner: employee,
      remark: '原事项说明'
    },
    label: '计划生效日期',
    key: 'planned_effective_date',
    date: true,
    value: '2026-11-15',
    expectedTabs: 2,
    markerLabel: '事项说明',
    markerKey: 'remark',
    markerTab: 1
  },
  {
    name: '执行任务',
    path: path('personnel/lifecycle/modules/lifecycle-dialog.vue'),
    kind: 'task',
    rpc: 'hr_save_lifecycle_record_secure',
    style: 'payload',
    row: {
      ...common,
      lifecycleCaseId: referenceId,
      taskType: 'other',
      taskName: '',
      dueDate: '2026-11-15',
      ownerRole: 'hr',
      ownerEmployeeId: employeeId,
      owner: employee,
      required: true,
      blocking: false,
      evidenceRequired: false,
      sort: 10,
      description: '任务验收标准'
    },
    label: '任务名称',
    key: 'task_name',
    expectedTabs: 2
  },
  {
    name: '考勤班次',
    path: path('operations/attendance/modules/attendance-dialog.vue'),
    kind: 'shift',
    rpc: 'hr_save_attendance_record_secure',
    style: 'payload',
    row: {
      ...common,
      shiftCode: 'SHIFT-001',
      shiftName: '',
      shiftType: 'standard',
      enabled: true,
      startTime: '09:00',
      endTime: '18:00',
      breakMinutes: 60,
      crossDay: false,
      lateGraceMinutes: 5,
      earlyLeaveGraceMinutes: 5,
      timeZone: 'Asia/Shanghai',
      remark: '班次说明'
    },
    label: '班次名称',
    key: 'shift_name',
    expectedTabs: 2
  },
  {
    name: '人力规划',
    path: path('operations/headcount/modules/workforce-planning-dialog.vue'),
    kind: 'cycle',
    rpc: 'hr_save_workforce_record_secure',
    style: 'entity-row',
    row: {
      ...common,
      planNo: 'WFP-001',
      planName: '',
      scenario: 'base',
      periodStart: '2026-11-01',
      periodEnd: '2027-10-31',
      baselineDate: '2026-11-01',
      budgetAmount: 120000,
      currencyCode: 'CNY',
      objective: '组织目标',
      assumptions: '测算假设',
      remark: '边界说明'
    },
    label: '规划名称',
    key: 'plan_name',
    expectedTabs: 2
  },
  {
    name: '休假政策',
    path: path('operations/absence/modules/absence-dialog.vue'),
    kind: 'policy',
    rpc: 'hr_save_absence_master_secure',
    style: 'entity-row',
    row: {
      ...common,
      leaveTypeId: referenceId,
      policyCode: 'POLICY-001',
      policyName: '',
      scopeType: 'all',
      entitlementMethod: 'annual',
      annualQuota: 10,
      monthlyAccrual: 0,
      carryoverLimit: 0,
      carryoverExpiryMonths: 3,
      allowNegative: false,
      negativeLimit: 0,
      probationEligible: true,
      effectiveFrom: '2026-11-01',
      effectiveTo: '2027-10-31',
      description: '政策边界'
    },
    label: '政策名称',
    key: 'policy_name',
    expectedTabs: 2
  },
  {
    name: '福利计划',
    path: path('operations/benefits/modules/benefit-record-dialog.vue'),
    kind: 'plan',
    rpc: 'hr_save_benefit_record_secure',
    style: 'payload',
    row: {
      ...common,
      planCode: 'BEN-001',
      planName: '',
      planType: 'commercial_insurance',
      enrollmentMethod: 'election',
      coverageScope: 'employee',
      currencyCode: 'CNY',
      effectiveFrom: '2026-11-01',
      effectiveTo: '2027-11-01'
    },
    label: '计划名称',
    key: 'plan_name',
    expectedTabs: 2
  },
  {
    name: '员工参保',
    path: path('operations/benefits/modules/benefit-record-dialog.vue'),
    kind: 'enrollment',
    rpc: 'hr_save_benefit_record_secure',
    style: 'payload',
    row: {
      ...common,
      employeeId,
      employee,
      planId: referenceId,
      optionId: referenceId,
      enrollmentNo: 'BEN-E-001',
      coverageFrom: '',
      coverageTo: '2027-11-01',
      employeeContribution: 50,
      employerContribution: 100,
      currencyCode: 'CNY'
    },
    label: '保障开始日',
    key: 'coverage_from',
    date: true,
    value: '2026-11-01',
    targetTab: 1,
    expectedTabs: 2
  },
  {
    name: '供应商合同',
    path: path('operations/contingent-workforce/modules/contingent-workforce-dialog.vue'),
    kind: 'vendor',
    rpc: 'hr_save_contingent_workforce_record_secure',
    style: 'payload',
    row: {
      ...common,
      vendorCode: 'VENDOR-001',
      vendorName: '',
      registrationNo: 'REG-001',
      riskLevel: 'low',
      contractStartDate: '2026-11-01',
      contractEndDate: '2027-11-01',
      vendorStatus: 'draft'
    },
    label: '供应商名称',
    key: 'vendor_name',
    expectedTabs: 2
  },
  {
    name: '外部用工任务',
    path: path('operations/contingent-workforce/modules/contingent-workforce-dialog.vue'),
    kind: 'engagement',
    rpc: 'hr_save_contingent_workforce_record_secure',
    style: 'payload',
    row: {
      ...common,
      engagementNo: 'ENG-001',
      workerId: referenceId,
      vendorId: referenceId,
      organizationId,
      positionId,
      sponsorEmployeeId: employeeId,
      serviceTitle: '',
      workLocation: '上海',
      startDate: '2026-11-01',
      endDate: '2027-01-01',
      accessExpiryDate: '2026-12-31',
      fte: 1,
      billingRate: 100,
      billingUnit: 'day',
      currencyCode: 'CNY',
      version: 1
    },
    label: '服务角色',
    key: 'service_title',
    expectedTabs: 2
  },
  {
    name: '政策签收版本',
    path: path('operations/policy-acknowledgement/modules/policy-document-dialog.vue'),
    kind: 'document',
    rpc: 'hr_save_policy_document_secure',
    separateEntityRpc: true,
    style: 'plain-payload',
    row: {
      ...common,
      policyCode: 'POL-001',
      policyTitle: '',
      category: 'conduct',
      versionNo: 1,
      effectiveDate: '2026-12-01',
      acknowledgementDueDays: 7,
      audienceType: 'all',
      documentReference: 'DOC-001',
      contentSummary: '政策依据',
      decisionNote: '制定说明'
    },
    label: '政策名称',
    key: 'policy_title',
    expectedTabs: 2
  },
  {
    name: '员工关系案件',
    path: path('operations/employee-relations/modules/employee-relation-record-dialog.vue'),
    kind: 'case',
    rpc: 'hr_save_employee_relations_record_secure',
    style: 'payload',
    row: {
      ...common,
      caseNo: 'CASE-001',
      caseType: 'workplace_conflict',
      title: '',
      subjectEmployeeId: employeeId,
      subjectEmployee: employee,
      anonymousReport: true,
      source: 'hr',
      severity: 'medium',
      confidentialityLevel: 'restricted',
      allegationSummary: '已核实的事实摘要',
      attachmentUrls: [],
      remark: '原记录'
    },
    label: '案件标题',
    key: 'title',
    expectedTabs: 2
  },
  {
    name: '调薪复核周期',
    path: path('operations/compensation-review/modules/compensation-review-dialog.vue'),
    kind: 'cycle',
    rpc: 'hr_save_compensation_review_record_secure',
    style: 'payload',
    row: {
      ...common,
      cycleCode: 'MERIT-2027',
      cycleName: '',
      reviewYear: 2027,
      effectiveDate: '2027-02-01',
      recommendationDueDate: '2027-01-01',
      calibrationDueDate: '2027-01-15',
      currencyCode: 'CNY',
      defaultBudgetPercent: 5,
      guidelineMinPercent: 0,
      guidelineMaxPercent: 10
    },
    label: '周期名称',
    key: 'cycle_name',
    expectedTabs: 2
  },
  {
    name: '服务目录人工受理',
    path: path('operations/self-service/modules/service-delivery-dialog.vue'),
    kind: 'service',
    rpc: 'hr_save_service_catalog_secure',
    separateEntityRpc: true,
    style: 'payload',
    row: {
      ...common,
      serviceCode: 'SVC-001',
      serviceName: '',
      category: 'certificate',
      serviceMode: 'case',
      routingGroup: '人事服务',
      firstResponseHours: 8,
      resolutionHours: 40,
      enabled: true,
      sort: 10,
      description: '服务说明'
    },
    label: '服务名称',
    key: 'service_name',
    expectedTabs: 2
  },
  {
    name: '服务目录跳转紧凑',
    path: path('operations/self-service/modules/service-delivery-dialog.vue'),
    kind: 'service',
    rpc: 'hr_save_service_catalog_secure',
    separateEntityRpc: true,
    style: 'payload',
    row: {
      ...common,
      serviceCode: 'SVC-002',
      serviceName: '',
      category: 'certificate',
      serviceMode: 'redirect',
      routePath: '/hr/operations/absence',
      enabled: true,
      sort: 10,
      description: '服务说明'
    },
    label: '服务名称',
    key: 'service_name',
    expectedTabs: 0
  },
  {
    name: '招聘候选人',
    path: path('recruitment/workbench/modules/recruitment-dialog.vue'),
    kind: 'candidate',
    rpc: 'hr_save_recruitment_record_secure',
    style: 'entity-row',
    row: {
      ...common,
      requisitionId: referenceId,
      candidateName: '',
      phone: '13800138000',
      email: 'candidate@example.test',
      source: 'referral',
      expectedSalary: 10000,
      consentStatus: 'granted',
      consentAt: '2026-11-01',
      retentionUntil: '2027-11-01',
      remark: '原备注'
    },
    label: '候选人姓名',
    key: 'candidate_name',
    expectedTabs: 2
  },
  {
    name: '员工体验调查紧凑',
    path: path('operations/employee-experience/modules/experience-survey-dialog.vue'),
    kind: 'survey',
    rpc: 'hr_save_employee_experience_record_secure',
    style: 'type-row',
    row: {
      ...common,
      surveyCode: 'SURV-001',
      surveyName: '',
      surveyType: 'pulse',
      cadence: 'one_time',
      audienceType: 'all_active',
      minimumGroupSize: 5,
      startDate: '2026-12-01',
      endDate: '2026-12-15',
      description: '调查目的'
    },
    label: '调查名称',
    key: 'survey_name',
    expectedTabs: 0
  },
  {
    name: '体验改进行动紧凑',
    path: path('operations/employee-experience/modules/experience-action-dialog.vue'),
    kind: 'action',
    rpc: 'hr_save_employee_experience_record_secure',
    style: 'plain-payload',
    row: {
      ...common,
      surveyId: referenceId,
      dimension: 'engagement',
      title: '',
      ownerEmployeeId: employeeId,
      owner: employee,
      dueDate: '2027-01-01',
      successMeasure: '完成业务复核',
      progressNote: '按期跟进'
    },
    label: '行动名称',
    key: 'title',
    expectedTabs: 0
  },
  {
    name: '内部人才机会',
    path: path('talent/internal-mobility/modules/internal-mobility-dialog.vue'),
    kind: 'opportunity',
    rpc: 'hr_save_internal_opportunity_secure',
    separateEntityRpc: true,
    style: 'payload',
    row: {
      ...common,
      opportunityCode: 'OPP-001',
      opportunityTitle: '',
      opportunityType: 'permanent',
      organizationId,
      positionId,
      hiringManagerEmployeeId: employeeId,
      hiringManagerName: '验收员工',
      capacity: 1,
      workLocation: '上海',
      workMode: 'onsite',
      expectedStartDate: '2027-01-01',
      applicationOpenDate: '2026-11-01',
      applicationCloseDate: '2026-12-01',
      minTenureMonths: 0,
      roleSummary: '角色职责',
      requiredSkills: '岗位技能',
      eligibilityNotes: '准入说明',
      version: 1
    },
    label: '机会名称',
    key: 'opportunity_title',
    expectedTabs: 3
  },
  {
    name: '内部申请紧凑',
    path: path('talent/internal-mobility/modules/internal-mobility-dialog.vue'),
    kind: 'application',
    rpc: 'hr_save_internal_mobility_application_secure',
    separateEntityRpc: true,
    style: 'payload',
    row: {
      ...common,
      opportunityId: referenceId,
      employeeId,
      employeeName: '验收员工',
      employeeNo: 'EMP-001',
      motivation: '',
      relevantExperience: '已有项目经验',
      managerAwareness: 'informed',
      preferredStartDate: '2027-01-01'
    },
    label: '申请动机',
    key: 'motivation',
    expectedTabs: 0
  },
  {
    name: '劳动合同',
    path: path('personnel/compliance/modules/compliance-record-dialog.vue'),
    kind: 'contract',
    rpc: 'hr_save_compliance_record_secure',
    style: 'payload',
    row: {
      ...common,
      employeeId,
      employee,
      contractNo: 'CONTRACT-001',
      contractType: 'fixed_term',
      contractStatus: 'draft',
      startDate: '',
      endDate: '2027-10-31',
      renewalReminderDays: 30,
      renewalOwnerId: employeeId
    },
    label: '开始日期',
    key: 'start_date',
    value: '2026-11-01',
    date: true,
    targetTab: 1,
    expectedTabs: 2
  },
  {
    name: '员工资质',
    path: path('personnel/compliance/modules/compliance-record-dialog.vue'),
    kind: 'qualification',
    rpc: 'hr_save_compliance_record_secure',
    style: 'payload',
    row: {
      ...common,
      employeeId,
      employee,
      qualificationType: 'professional',
      qualificationName: '',
      certificateNo: 'CERT-001',
      issueDate: '2026-11-01',
      expiryDate: '2027-10-31',
      reminderDays: 30,
      responsibleEmployeeId: employeeId
    },
    label: '资质名称',
    key: 'qualification_name',
    expectedTabs: 2
  },
  {
    name: '薪酬方案多构成',
    path: path('operations/compensation/modules/compensation-dialog.vue'),
    kind: 'plan',
    rpc: 'hr_save_compensation_master_secure',
    style: 'entity-row',
    row: {
      ...common,
      planCode: 'PAY-PLAN-001',
      planName: '',
      currencyCode: 'CNY',
      payFrequency: 'monthly',
      enabled: true,
      sort: 10,
      items: compensationItems
    },
    label: '方案名称',
    key: 'plan_name',
    expectedTabs: 2
  },
  {
    name: '薪酬方案少构成紧凑',
    path: path('operations/compensation/modules/compensation-dialog.vue'),
    kind: 'plan',
    rpc: 'hr_save_compensation_master_secure',
    style: 'entity-row',
    row: {
      ...common,
      planCode: 'PAY-PLAN-002',
      planName: '',
      currencyCode: 'CNY',
      payFrequency: 'monthly',
      enabled: true,
      sort: 10,
      items: compensationItems.slice(0, 1)
    },
    label: '方案名称',
    key: 'plan_name',
    expectedTabs: 0
  },
  {
    name: '员工薪酬多构成',
    path: path('operations/compensation/modules/compensation-dialog.vue'),
    kind: 'employee',
    rpc: 'hr_save_employee_compensation_secure',
    separateEntityRpc: true,
    style: 'entity-row',
    row: {
      ...common,
      employeeId,
      planId: referenceId,
      baseAmount: 6000,
      currencyCode: 'CNY',
      payFrequency: 'monthly',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
      changeReason: '',
      items: compensationItems
    },
    label: '调薪原因',
    key: 'change_reason',
    expectedTabs: 2
  },
  {
    name: '人事晋升异动',
    path: path('personnel/personnel-change/modules/personnel-change-dialog.vue'),
    kind: 'promotion',
    rpc: 'hr_save_personnel_change_secure',
    separateEntityRpc: true,
    style: 'payload',
    row: {
      ...common,
      changeNo: 'PC-001',
      employeeId,
      employee,
      changeType: 'promotion',
      effectiveDate: '2027-01-01',
      reason: '',
      beforeAssignmentSnapshot: {
        organizationId,
        organizationName: '验收组织',
        positionId,
        positionName: '验收岗位'
      },
      toOrganizationId: organizationId,
      toPositionId: positionId
    },
    label: '异动原因',
    key: 'reason',
    expectedTabs: 2,
    targetTab: 1,
    noPayloadTenant: true
  },
  {
    name: '合同续签',
    path: path('personnel/compliance/modules/compliance-action-dialog.vue'),
    kind: 'contract',
    rpc: 'hr_transition_compliance_record_secure',
    style: 'payload',
    args: [
      'contract',
      'renew',
      {
        ...common,
        employeeId,
        employee,
        contractNo: 'OLD-CONTRACT-001',
        contractType: 'fixed_term',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        renewalReminderDays: 30,
        renewalOwnerId: employeeId
      }
    ],
    row: {},
    label: '开始日期',
    key: 'start_date',
    value: '2027-01-01',
    date: true,
    clearFirst: true,
    expectedTabs: 2,
    noPayloadTenant: true
  }
]

function labelField(page: Page, label: string, date = false) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.getByRole(date ? 'combobox' : 'textbox', {
    name: new RegExp('^\\*?\\s*' + escaped + '$')
  })
}

async function openScenario(page: Page, scenario: Scenario, mutations: Record<string, unknown>[]) {
  await prepareIsolatedSession(page)
  const row = scenario.row
  const reference = {
    id: referenceId,
    tenantId,
    name: '验收参考记录',
    code: 'REF-001',
    status: 'enabled',
    planId: referenceId,
    courseId: referenceId,
    caseType: 'onboarding',
    plan: { id: referenceId, planName: '验收福利计划', planCode: 'BEN-001', currencyCode: 'CNY' },
    optionName: '验收覆盖方案',
    coverageLevel: 'employee',
    employeeContribution: 50,
    employerContribution: 100
  }
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url(),
      body = route.request().method() === 'POST' ? route.request().postDataJSON() : {}
    const rpc = new URL(url).pathname.split('/rpc/')[1]
    if (rpc === scenario.rpc) {
      mutations.push(body)
      return route.fulfill({ json: recordId })
    }
    if (rpc?.startsWith('hr_save_'))
      return route.fulfill({
        status: 400,
        json: { message: `未预期的 HR 保存入口：${rpc}` }
      })
    if (url.includes('current_is_super')) return route.fulfill({ json: true })
    if (rpc === 'hr_list_compensation_records_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: referenceId,
              tenantId,
              planCode: 'PAY-PLAN-001',
              planName: '验收薪酬方案',
              currencyCode: 'CNY',
              payFrequency: 'monthly',
              items: compensationItems
            }
          ],
          total: 1
        }
      })
    if (rpc === 'hr_list_business_organization_options_secure')
      return route.fulfill({
        json: [
          {
            id: organizationId,
            tenantId,
            organizationName: '验收组织',
            organizationCode: 'ORG-001',
            parentId: null,
            status: '1',
            sort: 10
          }
        ]
      })
    if (url.includes('options') || url.includes('organization'))
      return route.fulfill({
        json: [
          reference,
          { ...reference, id: positionId, name: '验收岗位', code: 'POS-001', organizationId },
          {
            ...reference,
            id: organizationId,
            name: '验收组织',
            organizationName: '验收组织',
            organizationCode: 'ORG-001',
            parentId: null,
            children: []
          },
          { ...reference, id: employeeId, name: '验收员工', code: 'EMP-001' }
        ]
      })
    if (url.includes('hr_get_')) return route.fulfill({ json: row })
    if (url.includes('employee_experience_records_secure'))
      return route.fulfill({
        json: {
          records: [
            { ...reference, surveyCode: 'SURV-001', surveyName: '验收调查', status: 'closed' }
          ],
          total: 1
        }
      })
    if (url.includes('records_secure')) return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  const args =
    scenario.args ??
    (scenario.style === 'entity-row'
      ? [scenario.kind, row]
      : scenario.style === 'type-row'
        ? ['edit', row]
        : [
            {
              ...(scenario.style === 'plain-payload' ? {} : { entity: scenario.kind }),
              type: 'edit',
              editData: row,
              managerView: true,
              manageAccess: true,
              ...(scenario.rpc === 'hr_save_personnel_change_secure' ? { record: row } : {})
            }
          ])
  await page.addInitScript(
    (input) => {
      window.formsMigrationInput = input
    },
    {
      args,
      permissions: scenario.permissions ?? [
        'Hr:Benefits:Amount:Edit',
        'Hr:ContingentWorkforce:Cost:Edit'
      ]
    }
  )
  await page.goto(
    '/tests/e2e/fixtures/forms-migration-business.html?entry=' + encodeURIComponent(scenario.path),
    { waitUntil: 'domcontentloaded', timeout: 120_000 }
  )
  const dialog = page.locator('.el-dialog:visible').first()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('open-error')).toBeEmpty()
  await expect(dialog.locator('.el-dialog__footer button').last()).toBeEnabled({ timeout: 30_000 })
  return dialog
}

for (const scenario of scenarios) {
  test(
    scenario.name + ' 隐藏页必填不可绕过，修正后真实业务提交并保留租户',
    async ({ page }, testInfo) => {
      const mutations: Record<string, unknown>[] = [],
        errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const dialog = await openScenario(page, scenario, mutations)
      const tabs = dialog.getByRole('tab')
      await expect(tabs).toHaveCount(scenario.expectedTabs)
      const field = labelField(page, scenario.label, scenario.date)
      if (scenario.expectedTabs) await tabs.nth(scenario.targetTab || 0).click()
      await expect(field).toBeVisible()
      if (scenario.clearFirst) {
        await field.fill('')
        await field.press('Tab')
        await field.press('Escape')
      }
      await field.evaluate((node) => node.setAttribute('data-migration-preserved', 'required'))
      for (let index = 0; index < scenario.expectedTabs; index++) {
        await tabs.nth(index).click()
        await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true')
      }
      if (scenario.expectedTabs)
        await tabs.nth(scenario.targetTab === 1 ? 0 : scenario.expectedTabs - 1).click()
      await expect(page.locator('[data-migration-preserved="required"]')).toHaveCount(1)
      if (scenario.expectedTabs) await expect(field).toBeHidden()
      await dialog.locator('.el-dialog__footer button').last().click()
      await expect(field).toBeVisible()
      await expect(field).toBeFocused()
      expect(mutations).toHaveLength(0)
      const value = scenario.value || '页签布局验收-' + scenario.name
      await field.fill(value)
      await field.press('Tab')
      let marker = value
      if (scenario.markerLabel) {
        await tabs.nth(scenario.markerTab || 0).click()
        marker = '跨页内容验收-' + scenario.name
        await labelField(page, scenario.markerLabel).fill(marker)
      }
      await page.screenshot({
        path: testInfo.outputPath('corrected-form.png'),
        animations: 'disabled'
      })
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      await dialog.locator('.el-dialog__footer button').last().click()
      await expect.poll(() => mutations.length).toBe(1)
      await expect(page.getByTestId('successes')).toHaveText('1')
      const payload = mutations[0].p_payload as Record<string, unknown>
      expect(payload[scenario.key]).toBe(value)
      expect(payload[scenario.markerKey || scenario.key]).toBe(marker)
      if (scenario.noPayloadTenant) expect(payload).not.toHaveProperty('tenant_id')
      else expect(payload.tenant_id).toBe(tenantId)
      if (
        [
          'hr_save_benefit_record_secure',
          'hr_save_employee_relations_record_secure',
          'hr_save_employee_experience_record_secure',
          'hr_save_compliance_record_secure',
          'hr_save_personnel_change_secure'
        ].includes(scenario.rpc)
      )
        expect(payload.id).toBe(recordId)
      else expect(mutations[0].p_id).toBe(recordId)
      if (scenario.separateEntityRpc) expect(mutations[0]).not.toHaveProperty('p_kind')
      else expect(mutations[0].p_kind).toBe(scenario.kind)
      expect(errors).toEqual([])
    }
  )
}
