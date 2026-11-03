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
import PackRulesPage from '../../../modules/art-supabase-mes/src/views/production-plan/pack-rules/index.vue'
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
    document.documentElement.dataset.boxMode =
      new URLSearchParams(location.search).get('box') || 'border-mode'
    return () =>
      h(
        'main',
        { class: 'h-screen min-w-0 p-6', style: { '--art-full-height': 'calc(100dvh - 48px)' } },
        h(PackRulesPage)
      )
  }
})
app.use(store)
const dictionary = (code: string, values: Array<[string, string]>) =>
  values.map(([value, label]) => ({ name: code, code, label, value, status: '1' }))
useUserStore().setDictMap({
  mesPackRuleBoardType: dictionary('mesPackRuleBoardType', [
    ['ROCK_BOARD', '岩棉夹芯板'],
    ['PU_BOARD', '聚氨酯夹芯板']
  ]),
  mesPackRuleSmallPackMode: dictionary('mesPackRuleSmallPackMode', [
    ['separate', '独立小包'],
    ['merge', '尝试并包'],
    ['manual', '人工处理']
  ]),
  mesPackRuleLengthDirection: dictionary('mesPackRuleLengthDirection', [
    ['asc', '升序'],
    ['desc', '降序']
  ]),
  mesPackRuleLengthMode: dictionary('mesPackRuleLengthMode', [
    ['true', '混合式打包'],
    ['false', '分开打包']
  ])
})
useUserStore().info = { userId: 'packing-test-user', tenantId: 'packing-test-tenant' }
useMenuStore().setButtonList(
  ['View', 'Add', 'Edit'].map((action) => ({
    name: `MesPackRule:${action}`,
    path: '',
    type: 'button'
  }))
)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#pack-rules-preview')
