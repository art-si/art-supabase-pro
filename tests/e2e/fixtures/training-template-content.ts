import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import CoursePage from '@smis/views/qualification-training/course-management/index.vue'
import ExamPage from '@smis/views/qualification-training/exam-management/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const course = new URLSearchParams(location.search).get('mode') === 'course'
const app = createApp({ render: () => (course ? h(CoursePage) : h(ExamPage)) })
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
app.mount('#app')
