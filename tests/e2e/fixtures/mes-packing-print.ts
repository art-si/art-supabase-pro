import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import PackingPage from '../../../modules/art-supabase-mes/src/views/production-plan/packing/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const setting = useSettingStore()
    const theme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? SystemThemeEnum.DARK
      : SystemThemeEnum.LIGHT
    setting.setGlobalTheme(theme, theme)
    initializeTheme()
    document.documentElement.dataset.boxMode = 'border-mode'
    return () =>
      h(
        'main',
        { class: 'h-screen min-w-0 p-6', style: { '--art-full-height': 'calc(100dvh - 48px)' } },
        h(PackingPage)
      )
  }
})
app.use(store)
useUserStore().setDictMap({
  wmsPackInboundStatus: [
    {
      name: '包入库状态',
      code: 'wmsPackInboundStatus',
      label: '未入库',
      value: 'pending',
      status: '1'
    },
    {
      name: '包入库状态',
      code: 'wmsPackInboundStatus',
      label: '已入库',
      value: 'received',
      status: '1'
    },
    {
      name: '包入库状态',
      code: 'wmsPackInboundStatus',
      label: '已退库',
      value: 'returned',
      status: '1'
    }
  ],
  wmsFinishedInboundMode: [
    {
      name: '入库模式',
      code: 'wmsFinishedInboundMode',
      label: '按工单汇总',
      value: 'order',
      status: '1'
    },
    {
      name: '入库模式',
      code: 'wmsFinishedInboundMode',
      label: '按排包明细',
      value: 'pack',
      status: '1'
    }
  ]
})
useUserStore().info = { userId: 'packing-test-user', tenantId: 'packing-test-tenant' }
useMenuStore().setButtonList(
  [
    'View',
    'Print',
    'Manual',
    'Spec',
    ...(new URLSearchParams(location.search).get('edit') === '1' ? ['Auto', 'Save'] : [])
  ]
    .filter(
      (action) => action !== 'Print' || new URLSearchParams(location.search).get('print') !== '0'
    )
    .map((action) => ({
      name: `MesPacking:${action}`,
      path: '',
      type: 'button'
    }))
)
useMenuStore().buttonList.push({ name: 'MesWorkOrder:View', path: '', type: 'button' })
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#packing-preview')
