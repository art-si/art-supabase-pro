import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import PermitPage from '../../../modules/art-supabase-smis/src/views/special-operation-management/shared/special-operation-permit-page.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(PermitPage, {
  class: 'art-page-view',
  title: '测试作业票',
  description: '批量作废与失败后刷新验收',
  pageIcon: 'ri:file-list-3-line',
  permissions: Object.fromEntries(
    [
      'view',
      'add',
      'copy',
      'edit',
      'delete',
      'export',
      'void',
      'start',
      'requestAcceptance',
      'accept',
      'print',
      'aiPrecheck'
    ].map((key) => [key, `TestPermit:${key}`])
  )
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
} as Api.Auth.UserInfo)
app.mount('#permit-preview')
