import { createApp, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import type { SmisPpeIssuanceStandard } from '@smis/api'
import IssuanceStandard from '@smis/views/safety-production/shared/issuance-standard-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const standardRow: SmisPpeIssuanceStandard = {
  id: 'standard-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  standardNo: 'STD-001',
  standardName: '现有发放标准',
  ratedQuantity: 2,
  issuanceCycle: 'month',
  issuanceFrequency: 2,
  status: 'enabled',
  description: '原有说明',
  positions: [{ id: 'position-test', code: 'POS-001', name: '测试岗位' }],
  organizations: [],
  details: [
    {
      materialId: 'material-test',
      materialCode: 'MAT-001',
      materialName: '现有物料',
      categoryName: '测试类别',
      basicUnit: '件',
      imageUrls: [],
      quotaQuantity: 2,
      issuanceCycle: 'month',
      issuanceFrequency: 2,
      status: 'enabled',
      remark: '',
      sort: 10
    }
  ]
}

const app = createApp({
  setup() {
    const ppeStandard = shallowRef<InstanceType<typeof IssuanceStandard>>()
    const toolStandard = shallowRef<InstanceType<typeof IssuanceStandard>>()
    const scope = useTenantScopeStore(store)
    return () =>
      h('main', { class: 'p-4 space-x-3' }, [
        h('button', { onClick: () => ppeStandard.value?.handleOpen({}) }, '打开用品标准'),
        h('button', { onClick: () => toolStandard.value?.handleOpen({}) }, '打开工具标准'),
        h(
          'button',
          { onClick: () => ppeStandard.value?.handleOpen({ row: standardRow }) },
          '编辑用品标准'
        ),
        h(
          'button',
          { onClick: () => toolStandard.value?.handleOpen({ row: standardRow }) },
          '编辑工具标准'
        ),
        h(
          'button',
          { onClick: () => scope.setTenantScope('22222222-2222-4222-8222-222222222222') },
          '切换租户 B'
        ),
        h(IssuanceStandard, { ref: ppeStandard, kind: 'ppe' }),
        h(IssuanceStandard, { ref: toolStandard, kind: 'tool' })
      ])
  }
})
app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'smis-standard-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tenantCode: 'A',
    tenantName: '租户 A',
    builtinType: 'platform'
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    tenantCode: 'B',
    tenantName: '租户 B',
    builtinType: 'business'
  }
]
scope.scopeOwnerUserId = 'smis-standard-test'
scope.setTenantScope('11111111-1111-4111-8111-111111111111')
app.mount('#smis-standard-preview')
