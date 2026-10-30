import { createApp, h } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import Preview from './table-editing.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(Preview)) })
app.use(store)
app.use(language)
initializeTheme()
setupGlobDirectives(app)
app.mount('#table-editing-preview')
