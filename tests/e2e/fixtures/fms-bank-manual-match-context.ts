import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import BankLineMatchDialog from '../../../modules/art-supabase-fms/src/views/treasury/bank-reconciliation/modules/bank-line-match-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const tenantId = '11111111-1111-4111-8111-111111111111'
const otherTenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const accountSetId = '33333333-3333-4333-8333-333333333333'
const batchId = '55555555-5555-4555-8555-555555555555'
const fundAccountId = '66666666-6666-4666-8666-666666666666'

const line = (id: string, lineNo: number): Api.Fms.BankStatementLineRecord => ({
  id,
  tenantId,
  accountSetId,
  batchId,
  fundAccountId,
  lineNo,
  transactionDate: '2026-10-02',
  direction: 'inflow',
  amount: 100,
  matchedAmount: 20,
  remainingAmount: 80,
  matchCount: 1,
  status: 'partial_matched',
  counterpartyName: `测试对方 ${lineNo}`,
  fieldAccess: { statementAmounts: 'read' }
})
const lineA = line('77777777-7777-4777-8777-777777777777', 1)
const lineB = line('88888888-8888-4888-8888-888888888888', 2)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/other', component: { template: '<div />' } }
  ]
})

const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof BankLineMatchDialog>>()
    const changed = ref(0)
    const tenantScope = useTenantScopeStore()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'output',
          { 'data-testid': 'manual-context' },
          `${router.currentRoute.value.path}:${tenantScope.effectiveTenantId ?? 'all'}`
        ),
        h('output', { 'data-testid': 'manual-changed' }, String(changed.value)),
        h(
          'output',
          { 'data-testid': 'manual-grants' },
          String(useMenuStore(store).buttonList.length)
        ),
        h(
          'output',
          { 'data-testid': 'manual-identity' },
          params.has('platform') ? 'platform' : 'ordinary'
        ),
        h(
          'button',
          { type: 'button', onClick: () => void dialog.value?.handleOpen(lineA) },
          '打开手工匹配 A'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'open-manual-b',
            onClick: () => void dialog.value?.handleOpen(lineB)
          },
          '打开手工匹配 B'
        ),
        h('button', { type: 'button', onClick: () => void router.push('/other') }, '切换测试路由'),
        h(
          'button',
          { type: 'button', onClick: () => tenantScope.setTenantScope(otherTenantId) },
          '切换测试租户'
        ),
        h(BankLineMatchDialog, { ref: dialog, onSuccess: () => (changed.value += 1) })
      ])
  }
})

app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const settings = useSettingStore(store)
settings.systemThemeType =
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.systemThemeMode = settings.systemThemeType
settings.boxBorderMode = params.get('box') !== 'shadow'
initializeTheme()
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'

useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId,
  tenant: { tenantCode: 'manual-test', tenantName: '手工匹配测试租户' },
  platformSuper: params.has('platform')
})
const tenantScope = useTenantScopeStore(store)
tenantScope.selectedTenantId = tenantId
if (params.has('platform')) {
  tenantScope.tenantOptions = [
    { id: tenantId, tenantCode: 'A', tenantName: '测试租户 A' },
    { id: otherTenantId, tenantCode: 'B', tenantName: '测试租户 B' }
  ]
}
useMenuStore(store).setButtonList([
  {
    name: 'FinanceBankReconciliation:Match',
    path: '',
    type: 'button',
    meta: { title: '手工匹配' }
  }
])
app.mount('#fms-bank-manual-match-preview')
