import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import ExecutionAnalytics from '@mes/views/production-execution/modules/execution-analytics.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const requestedMode = new URLSearchParams(location.search).get('mode')
const mode =
  requestedMode === 'shift' || requestedMode === 'machine' || requestedMode === 'line'
    ? requestedMode
    : 'person'
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view min-w-0 p-4', style: { '--art-full-height': 'calc(100dvh - 32px)' } },
      h(ExecutionAnalytics, { mode })
    )
})
app.use(store)
const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? SystemThemeEnum.DARK
    : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'mes-person-efficiency-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
if (new URLSearchParams(location.search).has('scope-test')) {
  Object.assign(window, {
    __mesPersonTest: {
      switchTenant(tenantId: string) {
        userStore.setUserInfo({
          userId: 'mes-person-efficiency-test',
          tenantId,
          platformSuper: false
        })
      }
    }
  })
}
useMenuStore(store).setButtonList(
  [
    'MesLaborEfficiency:View',
    'MesLaborEfficiency:Export',
    'MesShiftAchievement:View',
    'MesShiftAchievement:Export',
    'MesMachineAchievement:View',
    'MesMachineAchievement:Export',
    'MesLineAchievement:View',
    'MesLineAchievement:Export'
  ].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: 'MES 人工效率验收权限' }
  }))
)
app.mount('#app')
