import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import ProductionDrawer from '../../../modules/art-supabase-wms/src/views/production-inout/shared/production-material-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const requestedKind = new URLSearchParams(location.search).get('kind')
const kind =
  requestedKind === 'finished_inbound'
    ? 'finished_inbound'
    : requestedKind === 'return'
      ? 'return'
      : 'issue'
const pageName =
  kind === 'issue'
    ? 'WmsProductionIssue'
    : kind === 'return'
      ? 'WmsProductionReturn'
      : 'WmsFinishedInbound'
const app = createApp({
  setup() {
    const drawer = ref<InstanceType<typeof ProductionDrawer>>()
    document.documentElement.dataset.boxMode = 'border-mode'
    return () =>
      h(
        ElConfigProvider,
        { locale: zhCn },
        {
          default: () =>
            h('main', { class: 'min-w-0 p-6' }, [
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    drawer.value?.handleOpen({ mode: 'edit', documentId: 'production-test' })
                },
                '测试生产单据 edit'
              ),
              h(ProductionDrawer, { ref: drawer, kind })
            ])
        }
      )
  }
})
app.use(store)
useUserStore().setUserInfo({ userId: 'user-test', tenantId: 'tenant-test', platformSuper: false })
useMenuStore().setButtonList(
  ['View', 'Select', 'Add', 'Edit', 'Copy', 'Delete', 'Import'].map((action) => ({
    name: `${pageName}:${action}`,
    path: '',
    type: 'button'
  }))
)
const dictionaries: Record<string, [string, string][]> = {
  wmsFinishedInboundMode: [
    ['order', '按工单汇总'],
    ['pack', '按排包明细']
  ],
  wmsProductionReturnType: [
    ['good', '良品'],
    ['incoming_defect', '来料不良']
  ],
  wmsInitialStockType: [['normal', '普通']],
  wmsInitialStockCondition: [['available', '可用']],
  wmsFinishedQualityStatus: [
    ['available', '合格品'],
    ['defective', '不合格品'],
    ['scrapped', '报废品']
  ],
  mdmBusinessOwnerType: [
    ['self', '自有'],
    ['supplier', '供应商'],
    ['customer', '客户']
  ]
}
useUserStore().setDictMap(
  Object.fromEntries(
    Object.entries(dictionaries).map(([code, entries]) => [
      code,
      entries.map(([value, label]) => ({ name: code, code, label, value, status: '1' }))
    ])
  )
)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#production-preview')
