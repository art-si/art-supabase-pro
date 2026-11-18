import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { MenuTypeEnum } from '@/enums/app-enum'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { mittBus } from '@/utils/sys'
import { globalComponentsConfig, type GlobalComponentModule } from '@/config/modules/component'
import GlobalComponent from '@/components/core/layouts/art-global-component/index.vue'
import GlobalSearch from '@/components/core/layouts/art-global-search/index.vue'
import Notification from '@/components/core/layouts/art-notification/index.vue'
import HeaderBar from '@/components/core/layouts/art-header-bar/index.vue'
import ArtBreadcrumb from '@/components/core/layouts/art-breadcrumb/index.vue'
import { initializeTheme } from '@/hooks/core/useTheme'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const params = new URLSearchParams(location.search)
const mode = params.get('mode')
const mixedHeader = mode === 'header' && params.has('mixed')
const breadcrumbTitles = [
  '安全生产综合管理工作台',
  '风险分级管控与隐患排查',
  '岗位安全生产责任考核',
  '现场隐患整改与复核',
  '岗位安全责任制'
]
const emptyView = { render: () => h('div') }
const breadcrumbRoutes = breadcrumbTitles.reduceRight<RouteRecordRaw[]>(
  (children, title, index) => [
    {
      path: index === 0 ? '/breadcrumb' : `section-${index}`,
      component: emptyView,
      meta: { title, icon: 'ri:shield-check-line' },
      children:
        index === 2
          ? [{ path: '/breadcrumb-stable-detail', component: emptyView }, ...children]
          : children
    }
  ],
  []
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: emptyView },
    { path: '/notice-target', component: emptyView },
    ...breadcrumbRoutes
  ]
})
const loads = ref(0)
const replayed = ref(0)
const pending: Array<{
  resolve: (module: GlobalComponentModule) => void
  reject: (reason: Error) => void
}> = []
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
if (mode === 'global') {
  globalComponentsConfig.splice(0, globalComponentsConfig.length, {
    key: 'global-search',
    name: '全局搜索',
    enabled: true,
    activationEvent: 'openSearchDialog',
    loader: () => {
      loads.value++
      return new Promise((resolve, reject) => pending.push({ resolve, reject }))
    }
  })
  mittBus.on('openSearchDialog', () => replayed.value++)
}
const app = createApp({
  setup() {
    const setting = useSettingStore()
    if (mode === 'header') setting.showSettingGuide = !mixedHeader
    if (mixedHeader) {
      setting.menuType = MenuTypeEnum.TOP_LEFT
      setting.showFastEnter = true
      setting.showRefreshButton = true
      useMenuStore().setMenuList(
        [
          '组件示例',
          '系统管理',
          '数据中心',
          '流程审批中心',
          'AI智能识别',
          'MDM主数据',
          'HR人力资源',
          '运输管理',
          '仓储管理',
          '采购管理'
        ].map((title, index) => ({
          path: `/module-${index}`,
          name: `TestModule${index}`,
          meta: { title, icon: 'ri:apps-line' }
        }))
      )
    }
    if (mode === 'breadcrumb') {
      setting.setBreadcrumbStyle(params.get('style') === 'background' ? 'background' : 'regular')
      setting.showBreadcrumbIcon = true
    }
    const mounted = ref(true)
    const open = ref(params.has('open'))
    const unread = ref(0)
    return () =>
      h('main', { style: { minHeight: '100dvh' } }, [
        h(
          'div',
          {
            style: {
              position: 'fixed',
              bottom: '16px',
              left: '16px',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap'
            }
          },
          [
            h(
              'button',
              {
                onClick: () => {
                  mounted.value = !mounted.value
                }
              },
              '切换组件'
            ),
            mode === 'global'
              ? [
                  h(
                    'button',
                    { onClick: () => pending.shift()?.resolve({ default: GlobalSearch }) },
                    '完成组件加载'
                  ),
                  h(
                    'button',
                    { onClick: () => pending.shift()?.reject(new Error('test loader failure')) },
                    '加载失败'
                  )
                ]
              : [
                  h(
                    'button',
                    {
                      onClick: () => {
                        open.value = true
                      }
                    },
                    '打开通知'
                  ),
                  h(
                    'button',
                    {
                      onClick: () => {
                        open.value = false
                      }
                    },
                    '关闭通知'
                  )
                ],
            h('output', { 'aria-label': '加载次数' }, String(loads.value)),
            h('output', { 'aria-label': '重放次数' }, String(replayed.value)),
            h('output', { 'aria-label': '未读数量' }, String(unread.value)),
            h('output', { 'aria-label': '当前路径' }, router.currentRoute.value.path),
            mode === 'header'
              ? h('output', { 'aria-label': '设置引导状态' }, String(setting.showSettingGuide))
              : null
          ]
        ),
        mounted.value
          ? mode === 'global'
            ? h(GlobalComponent)
            : mode === 'header'
              ? h(HeaderBar, { showWorkTab: false })
              : mode === 'breadcrumb'
                ? h(
                    'section',
                    { id: 'breadcrumb-fixture', style: { display: 'flex', width: '270px' } },
                    [h(ArtBreadcrumb)]
                  )
                : h(Notification, {
                    value: open.value,
                    'onUpdate:value': (value: boolean) => {
                      open.value = value
                    },
                    onUnreadChange: (value: number) => {
                      unread.value = value
                    }
                  })
          : null
      ])
  }
})
app.use(store)
app.use(i18n)
app.use(router)
if (mode === 'breadcrumb') {
  initializeTheme()
  document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
  await router.push('/breadcrumb/section-1/section-2/section-3/section-4')
}
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'shell-lifecycle-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#app')
