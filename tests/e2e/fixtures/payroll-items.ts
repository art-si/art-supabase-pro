import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import Dialog from '@fms/views/specialized-accounting/payroll/modules/payroll-line-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const run: Api.Fms.PayrollRunRecord = {
  id: 'payroll-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  accountSetId: 'test-book',
  accountingPeriodId: 'test-period',
  runNo: '薪酬验收批次',
  payrollMonth: '2026-09-01',
  status: 'draft',
  createTime: '2026-10-25',
  fieldAccess: { employeeIdentity: 'edit', salaryAmounts: 'edit' }
}
const line: Api.Fms.PayrollLineRecord = {
  id: 'line-test',
  runId: run.id,
  employeeId: 'employee-test',
  employeeNameSnapshot: '验收司机',
  employeeNoSnapshot: 'QA001',
  createTime: '2026-10-25',
  earningItems: { 基本工资: 6000, 提成: 1800, 历史补助: 200 },
  deductionItems: { 违章扣款: 100, 事故扣款: 50 },
  employerCostItems: { 社保: 1200 },
  grossAmount: 8000,
  deductionAmount: 150,
  employerCostAmount: 1200,
  netAmount: 7850,
  fieldAccess: run.fieldAccess
}
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof Dialog>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { onClick: () => dialog.value?.handleOpen(run, line) }, '编辑薪酬'),
        h(Dialog, { ref: dialog })
      ])
  }
})
app
  .use(store)
  .use(language)
  .use(createRouter({ history: createMemoryHistory(), routes: [] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'payroll-preview',
  tenantId: run.tenantId,
  platformSuper: true
})
const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? SystemThemeEnum.DARK
    : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
app.mount('#app')
