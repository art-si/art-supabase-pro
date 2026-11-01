import { createApp, h, onMounted, ref, shallowRef, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

declare global {
  interface Window {
    formsMigrationInput?: {
      args: unknown[]
      permissions?: string[]
      admin?: boolean
      dicts?: Parameters<ReturnType<typeof useUserStore>['setDictMap']>[0]
    }
  }
}
const params = new URLSearchParams(location.search)
const loaders: Record<string, () => Promise<{ default: Component }>> = {
  'modules/art-supabase-fms/src/views/accounting/voucher-template/modules/voucher-template-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounting/voucher-template/modules/voucher-template-dialog.vue'),
  'modules/art-supabase-hr/src/views/talent/development/modules/learning-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/talent/development/modules/learning-dialog.vue'),
  'modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-record-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-record-dialog.vue'),
  'modules/art-supabase-hr/src/views/recruitment/workbench/modules/recruitment-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/recruitment/workbench/modules/recruitment-dialog.vue'),
  'modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-detail-drawer.vue'),
  'modules/art-supabase-hr/src/views/operations/self-service/modules/service-request-drawer.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/self-service/modules/service-request-drawer.vue'),
  'modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-action-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/personnel/compliance/modules/compliance-action-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/self-service/modules/service-delivery-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/self-service/modules/service-delivery-dialog.vue'),
  'modules/art-supabase-hr/src/views/talent/performance/modules/performance-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/talent/performance/modules/performance-dialog.vue'),
  'modules/art-supabase-hr/src/views/personnel/personnel-change/modules/personnel-change-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/personnel/personnel-change/modules/personnel-change-dialog.vue'),
  'modules/art-supabase-hr/src/views/talent/succession/modules/succession-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/talent/succession/modules/succession-dialog.vue'),
  'modules/art-supabase-hr/src/views/talent/internal-mobility/modules/internal-mobility-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/talent/internal-mobility/modules/internal-mobility-dialog.vue'),
  'modules/art-supabase-fms/src/views/treasury/fund-transfer/modules/fund-transfer-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/treasury/fund-transfer/modules/fund-transfer-detail-drawer.vue'),
  'modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-survey-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-survey-dialog.vue'),
  'modules/art-supabase-fms/src/views/everyone-expense/travel-application/modules/travel-application-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/everyone-expense/travel-application/modules/travel-application-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounts-receivable/modules/receivable-document-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounts-receivable/modules/receivable-document-drawer.vue'),
  'modules/art-supabase-fms/src/views/treasury/fund-account/modules/fund-account-dialog.vue': () =>
    import('../../../modules/art-supabase-fms/src/views/treasury/fund-account/modules/fund-account-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/policy-acknowledgement/modules/policy-document-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/policy-acknowledgement/modules/policy-document-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounting/auto-posting/modules/posting-rule-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounting/auto-posting/modules/posting-rule-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-detail-drawer.vue'),
  'modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-action-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-action-dialog.vue'),
  'modules/art-supabase-hr/src/views/personnel/lifecycle/modules/lifecycle-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/personnel/lifecycle/modules/lifecycle-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounting/auto-posting/modules/posting-event-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounting/auto-posting/modules/posting-event-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/treasury/bank-reconciliation/modules/bank-reconciliation-import-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/treasury/bank-reconciliation/modules/bank-reconciliation-import-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/headcount/modules/workforce-planning-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/headcount/modules/workforce-planning-dialog.vue'),
  'modules/art-supabase-fms/src/views/treasury/bank-reconciliation/modules/bank-reconciliation-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/treasury/bank-reconciliation/modules/bank-reconciliation-detail-drawer.vue'),
  'modules/art-supabase-hr/src/views/operations/contingent-workforce/modules/contingent-workforce-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/contingent-workforce/modules/contingent-workforce-dialog.vue'),
  'modules/art-supabase-fms/src/views/everyone-expense/repayment/modules/repayment-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/everyone-expense/repayment/modules/repayment-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/benefits/modules/benefit-record-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/operations/benefits/modules/benefit-record-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounting/accounting-subject/modules/subject-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounting/accounting-subject/modules/subject-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounting/voucher-center/modules/voucher-dialog.vue': () =>
    import('../../../modules/art-supabase-fms/src/views/accounting/voucher-center/modules/voucher-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/attendance/modules/attendance-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/operations/attendance/modules/attendance-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/employee-relations/modules/employee-relation-record-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/employee-relations/modules/employee-relation-record-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/compensation-review/modules/compensation-review-dialog.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/compensation-review/modules/compensation-review-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/benefits/modules/benefit-detail-drawer.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/operations/benefits/modules/benefit-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/accounting/voucher-center/modules/voucher-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounting/voucher-center/modules/voucher-detail-drawer.vue'),
  'modules/art-supabase-hr/src/views/operations/employee-relations/modules/employee-relation-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-hr/src/views/operations/employee-relations/modules/employee-relation-detail-drawer.vue'),
  'modules/art-supabase-hr/src/views/operations/absence/modules/absence-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/operations/absence/modules/absence-dialog.vue'),
  'modules/art-supabase-hr/src/views/operations/compensation/modules/compensation-dialog.vue': () =>
    import('../../../modules/art-supabase-hr/src/views/operations/compensation/modules/compensation-dialog.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/tax-management/modules/tax-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/tax-management/modules/tax-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/everyone-expense/payee-information/modules/payee-information-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/everyone-expense/payee-information/modules/payee-information-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounting/account-set/modules/account-set-dialog.vue': () =>
    import('../../../modules/art-supabase-fms/src/views/accounting/account-set/modules/account-set-dialog.vue'),
  'modules/art-supabase-fms/src/views/everyone-expense/expense-reimbursement/modules/travel-reimbursement-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/everyone-expense/expense-reimbursement/modules/travel-reimbursement-dialog.vue'),
  'modules/art-supabase-fms/src/views/everyone-expense/loan-application/modules/travel-loan-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/everyone-expense/loan-application/modules/travel-loan-dialog.vue'),
  'modules/art-supabase-fms/src/views/accounting/financial-reports/modules/statement-rule-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/accounting/financial-reports/modules/statement-rule-dialog.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-dialog.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/payroll/modules/payroll-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/payroll/modules/payroll-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/settlement/carrier-settlement/modules/carrier-statement-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/carrier-settlement/modules/carrier-statement-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/payroll/modules/payroll-line-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/payroll/modules/payroll-line-dialog.vue'),
  'modules/art-supabase-fms/src/views/settlement/invoice-management/modules/invoice-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/invoice-management/modules/invoice-dialog.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/fixed-asset/modules/fixed-asset-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/fixed-asset/modules/fixed-asset-dialog.vue'),
  'modules/art-supabase-fms/src/views/settlement/payment-application/modules/payment-application-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/payment-application/modules/payment-application-dialog.vue'),
  'modules/art-supabase-fms/src/views/settlement/waybill-cost/modules/waybill-expense-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/waybill-cost/modules/waybill-expense-dialog.vue'),
  'modules/art-supabase-fms/src/views/settlement/invoice-management/modules/invoice-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/invoice-management/modules/invoice-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/settlement/payment-application/modules/payment-application-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/payment-application/modules/payment-application-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/settlement/customer-settlement/modules/customer-statement-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/customer-settlement/modules/customer-statement-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/specialized-accounting/period-close/modules/period-close-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/specialized-accounting/period-close/modules/period-close-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/customer-receipt-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/customer-receipt-dialog.vue'),
  'modules/art-supabase-fms/src/views/settlement/waybill-cost/modules/reimbursement-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/waybill-cost/modules/reimbursement-dialog.vue'),
  'modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/cash-transaction-detail-drawer.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/cash-transaction-detail-drawer.vue'),
  'modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/carrier-payment-dialog.vue':
    () =>
      import('../../../modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/carrier-payment-dialog.vue')
}
const path = params.get('entry') || ''
if (!loaders[path]) throw Error('未知迁移入口：' + path)
const target = (await loaders[path]()).default
const input = window.formsMigrationInput || { args: [] }
const tenantId = '11111111-1111-4111-8111-111111111111'
const app = createApp({
  setup() {
    const component = shallowRef<{ handleOpen: (...args: unknown[]) => Promise<void> }>()
    const successes = ref(0),
      error = ref('')
    const open = async () => {
      error.value = ''
      try {
        await component.value?.handleOpen(...input.args)
      } catch (cause) {
        error.value = String(cause)
      }
    }
    onMounted(() => void open())
    return () =>
      h('main', { class: 'min-h-screen min-w-0 p-4' }, [
        h('button', { 'data-testid': 'open-entry', onClick: open }, '重新打开当前业务入口'),
        h('output', { 'data-testid': 'successes' }, String(successes.value)),
        h('output', { 'data-testid': 'open-error' }, error.value),
        h(target, { ref: component, onSuccess: () => successes.value++ })
      ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId,
  platformSuper: Boolean(input.admin),
  hrEmployeeId: '33333333-3333-4333-8333-333333333333'
})
useTenantScopeStore(store).selectedTenantId = tenantId
useMenuStore(store).setButtonList(
  (input.permissions || []).map((name) => ({ name, path: '', type: 'button' }))
)
const values = [
  'skill',
  'internal',
  'professional',
  'classroom',
  'draft',
  'enabled',
  'normal',
  'high',
  'medium',
  'low',
  'onboarding',
  'transfer',
  'hr',
  'manager',
  'employee',
  'business',
  'on_track',
  'general',
  'manual',
  'case',
  'salary',
  'base',
  'fixed',
  'monthly',
  'all',
  'annual',
  'calendar',
  'accrual',
  'hours',
  'days',
  'pending',
  'outsourced',
  'dispatch',
  'full_time',
  'part_time',
  'contractor',
  'open',
  'nominated',
  'ready_now',
  'immediate',
  'self',
  'HR',
  'hr_admin',
  'office',
  'contract',
  'limited',
  'restricted',
  'CNY',
  'general',
  'self_service',
  'planned',
  'not_started',
  'standard',
  'pulse',
  'monthly',
  'anonymous',
  'fixed_amount',
  'medical',
  'statutory',
  'custom',
  'fixed_term',
  'labor_contract',
  'standard',
  'employee',
  'required',
  'certificate',
  'test',
  'pass',
  'crtd',
  'normal',
  'PP10'
]
const dictionaryOptions = [...new Set(values)].map((value, sort) => ({
  id: value,
  label: value,
  name: value,
  value,
  code: value,
  status: '1',
  sort
}))
user.setDictMap(
  Object.assign(
    Object.fromEntries(
      [
        'commonActionProgressStatus',
        'commonBoolean',
        'commonCompetencyLevel',
        'commonEnabledStatus',
        'commonRiskLevel',
        'hrBenefitCoverageLevel',
        'hrBenefitCoverageScope',
        'hrBenefitEnrollmentMethod',
        'hrBenefitEnrollmentStatus',
        'hrBenefitLifeEventStatus',
        'hrBenefitLifeEventType',
        'hrBenefitPayrollSyncStatus',
        'hrBenefitPlanStatus',
        'hrBenefitPlanType',
        'hrCandidateConsentStatus',
        'hrCandidateSource',
        'hrCompensationComponentCategory',
        'hrComplianceEventType',
        'hrComplianceRiskStatus',
        'hrContingentBillingUnit',
        'hrContingentControlStatus',
        'hrContingentControlType',
        'hrContingentVendorRiskLevel',
        'hrContingentWorkerType',
        'hrContractRenewalDecision',
        'hrContractStatus',
        'hrContractType',
        'hrEmployeeRelationActionType',
        'hrEmployeeRelationCaseStatus',
        'hrEmployeeRelationCaseType',
        'hrEmployeeRelationConfidentiality',
        'hrEmployeeRelationEventType',
        'hrEmployeeRelationSeverity',
        'hrEmployeeRelationSource',
        'hrEmploymentStatus',
        'hrEmploymentType',
        'hrExperienceAnswerType',
        'hrExperienceAudienceType',
        'hrExperienceCadence',
        'hrExperienceDimension',
        'hrExperienceSurveyStatus',
        'hrExperienceSurveyType',
        'hrInterviewType',
        'hrLearningCourseCategory',
        'hrLearningDeliveryMode',
        'hrLeaveCategory',
        'hrLeaveEntitlementMethod',
        'hrLeavePolicyScope',
        'hrLeavePolicyStatus',
        'hrLeaveSession',
        'hrLeaveUnit',
        'hrMobilityManagerAwareness',
        'hrMobilityOpportunityType',
        'hrMobilityWorkMode',
        'hrOnboardingTaskCategory',
        'hrPerformanceCheckInRisk',
        'hrPerformanceGoalStatus',
        'hrPerformanceGoalType',
        'hrPerformanceLevel',
        'hrPolicyAudienceEmploymentType',
        'hrPolicyAudienceType',
        'hrPolicyCategory',
        'hrQualificationStatus',
        'hrQualificationType',
        'hrQualificationVerificationStatus',
        'hrServiceChannel',
        'hrServiceDeliveryMode',
        'hrServicePriority',
        'hrServiceRequestStatus',
        'hrSuccessionActionStatus',
        'hrSuccessionActionType',
        'hrSuccessionCriticality',
        'hrSuccessionNominationSource',
        'hrSuccessionPlanStatus',
        'hrSuccessionPotential',
        'hrSuccessionReadiness',
        'hrTrainingType',
        'hrWorkforcePlanPriority',
        'hrWorkforcePlanScenario'
      ].map((code) => [code, dictionaryOptions])
    ),
    input.dicts || {}
  )
)
const setting = useSettingStore(store),
  theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#forms-migration-preview')
