import { createApp, h } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import Preview from './table-style-parity.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const settings = useSettingStore(store)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
settings.boxBorderMode = params.get('box') !== 'shadow-mode'
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
document.documentElement.dataset.uiScope = 'workspace'
initializeTheme()

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(Preview)) })
app.use(store)
app.use(language)
setupGlobDirectives(app)
app.mount('#table-style-parity-preview')
