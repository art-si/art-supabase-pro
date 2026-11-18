import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import CoursePage from '@smis/views/qualification-training/course-management/index.vue'
import ExamPage from '@smis/views/qualification-training/exam-management/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const course = params.get('mode') === 'course'
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view h-screen min-w-0 p-4',
        style: { '--art-full-height': 'calc(100dvh - 32px)' }
      },
      [course ? h(CoursePage) : h(ExamPage)]
    )
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'training-template-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'SmisCourseManagement:View',
    'SmisCourseManagement:Learn',
    'SmisExamManagement:View',
    'SmisExamManagement:Preview',
    'SmisExamManagement:Take'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: '测试权限' } }))
)
await router.isReady()
initializeTheme()
useTheme().switchThemeStyles(
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
)
const settings = useSettingStore(store)
settings.boxBorderMode = params.get('box') !== 'shadow'
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
app.mount('#app')
