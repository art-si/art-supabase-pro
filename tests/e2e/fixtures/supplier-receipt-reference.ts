import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { useAuth } from '@/hooks/core/useAuth'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
import { getRecordReferenceMeta } from '@/components/business/master-data-delete-guard/record-meta'
import { createRecordReferenceNavigation } from '@/components/business/master-data-delete-guard/record-navigation'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const parameters = new URLSearchParams(location.search)
const fixture = defineComponent({
  setup() {
    const guard = ref<InstanceType<typeof MasterDataDeleteGuard>>()
    const { hasAuth } = useAuth()
    const inspect = () =>
      guard.value?.inspect({
        resourceLabel: '付款用途',
        resources: [{ id: 'purpose', label: '退采购付款 · 205' }],
        fetchDependencies: async () =>
          [1, 2].map((index) => ({
            resourceId: 'purpose',
            dependencyCode: 'fms_receipt_document',
            sourceTable: 'fms_receipt_document',
            recordId: `receipt-${index}`,
            targetId: `receipt-${index}`,
            recordNo: `SK-QA-${index}`,
            recordStatus: index === 1 ? 'approved' : 'confirmed',
            createdAt: '2026-10-24T00:00:00Z',
            recordSummary: `虚构供应商收款${index}`,
            cleanupAllowed: false
          })),
        dependencyMeta: {
          fms_receipt_document: {
            ...getRecordReferenceMeta('fms_receipt_document'),
            ...createRecordReferenceNavigation(hasAuth).fms_receipt_document,
            label: '收款单',
            unit: '张',
            description: '用途已有收款记录引用，应保留业务历史，可停用后新增用途。',
            actionLabel: '查看关联',
            order: 1
          }
        }
      })
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        h(ElButton, { onClick: inspect }, () => '检查用途引用'),
        h(MasterDataDeleteGuard, { ref: guard })
      ])
  }
})
const destination = defineComponent({
  setup() {
    const route = useRoute()
    return () =>
      h(
        'main',
        { class: 'p-4', 'data-record-id': String(route.query.recordId || '') },
        `收款单定位：${String(route.query.recordNo || '')}`
      )
  }
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: fixture },
    { path: '/fms/accounts-receivable/receipt', name: 'FinanceReceipt', component: destination }
  ]
})
const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(RouterView)) })
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'reference-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  parameters.has('withView')
    ? [
        {
          name: 'FinanceReceipt:View',
          path: 'FinanceReceipt:View',
          type: 'button',
          meta: { title: '查看收款单' }
        }
      ]
    : []
)
const setting = useSettingStore(store)
const theme = parameters.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#supplier-receipt-reference')
