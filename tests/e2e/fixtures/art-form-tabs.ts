import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import Fixture from './art-form-tabs.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const settings = useSettingStore(store)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
settings.boxBorderMode = params.get('box') !== 'shadow-mode'
initializeTheme()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
const app = createApp(Fixture)
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#form-tabs-preview')
