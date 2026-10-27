import { createApp, h, KeepAlive, type VNode } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { managementReports } from '@tms/views/components/management-reports/catalog'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const pages = import.meta.glob(
  '../../../modules/art-supabase-tms/src/views/{business-decision,operations-analysis}/*/index.vue'
)
const params = new URLSearchParams(location.search)
const definition =
  managementReports.find((item) => item.slug === params.get('report')) ?? managementReports[0]
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view p-4',
        style: { height: '100vh', '--art-full-height': 'calc(100vh - 32px)' }
      },
      h(
        ElConfigProvider,
        { locale: zhCn },
        {
          default: () =>
            params.has('keepAlive')
              ? h(RouterView, null, {
                  default: ({ Component }: { Component: VNode }) =>
                    h(KeepAlive, null, { default: () => Component })
                })
              : h(RouterView, { key: String(router.currentRoute.value.name) })
        }
      )
    )
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    ...managementReports.map((item) => ({
      path: `/tms/${item.group}/${item.slug}`,
      name: item.name,
      component:
        pages[`../../../modules/art-supabase-tms/src/views/${item.group}/${item.slug}/index.vue`]
    })),
    {
      path: '/tms/waybill-management/detail/:id',
      name: 'TmsWaybillDetail',
      component: { render: () => h('h1', '验收运输任务详情') }
    },
    {
      path: '/tms/order/detail/:id',
      name: 'TmsOrderDetail',
      component: { render: () => h('h1', '验收订单详情') }
    }
  ]
})
app.use(store).use(router).use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'report-preview',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
const settings = useSettingStore(store)
useUserStore(store).setDictMap({
  tmsCustomerLevel: [{ label: '验收重点客户', value: 'key', tagType: 'primary' }]
})
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
settings.boxBorderMode = params.get('box') !== 'shadow-mode'
initializeTheme()
await router.push({
  name: definition.name,
  query: {
    ...(params.get('keyword') ? { keyword: params.get('keyword') } : {}),
    ...(params.get('start') ? { start: params.get('start') } : {}),
    ...(params.get('end') ? { end: params.get('end') } : {})
  }
})
await router.isReady()
app.mount('#report-preview')
