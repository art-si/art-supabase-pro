import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import Workspace from '../../../modules/art-supabase-scm/src/views/sales-quotation/project-quotation/modules/project-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const user = useUserStore(store)
user.setUserInfo({ userId: 'project-test-user', tenantId: 'tenant-a', platformSuper: true })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view p-4 h-screen flex flex-col',
        style: { '--art-full-height': 'calc(100dvh - 32px)' }
      },
      h(ElConfigProvider, { locale: zhCn }, { default: () => h(Workspace) })
    )
})
app.use(store)
const setting = useSettingStore(store)
document.documentElement.dataset.boxMode = setting.boxBorderMode ? 'border-mode' : 'shadow-mode'
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
app.use(language)
app.use(router)
setupGlobDirectives(app)
app.mount('#project-preview')
