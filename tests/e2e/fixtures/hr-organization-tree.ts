import { createApp, h, onMounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import RecruitmentDialog from '../../../modules/art-supabase-hr/src/views/recruitment/workbench/modules/recruitment-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const dialog = shallowRef<InstanceType<typeof RecruitmentDialog>>()
    onMounted(() => void dialog.value?.handleOpen('requisition'))
    return () => h(RecruitmentDialog, { ref: dialog })
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'hr-organization-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#hr-organization-tree')
