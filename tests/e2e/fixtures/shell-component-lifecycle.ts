import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { mittBus } from '@/utils/sys'
import { globalComponentsConfig, type GlobalComponentModule } from '@/config/modules/component'
import GlobalComponent from '@/components/core/layouts/art-global-component/index.vue'
import GlobalSearch from '@/components/core/layouts/art-global-search/index.vue'
import Notification from '@/components/core/layouts/art-notification/index.vue'
import HeaderBar from '@/components/core/layouts/art-header-bar/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const params = new URLSearchParams(location.search)
const mode = params.get('mode')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => h('div') } },
    { path: '/notice-target', component: { render: () => h('div') } }
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
    if (mode === 'header') setting.showSettingGuide = true
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
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'shell-lifecycle-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#app')
