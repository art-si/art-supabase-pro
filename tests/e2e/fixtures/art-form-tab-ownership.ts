import { createApp } from 'vue'
import { ElConfigProvider } from 'element-plus'
import { h } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import Fixture from './art-form-tab-ownership.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(Fixture)) })
app.use(store)
app.use(language)
setupGlobDirectives(app)
initializeTheme()
app.mount('#app')
