import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import GovernanceDialog from '../../../modules/art-supabase-mdm/src/views/governance-center/modules/governance-config-dialog.vue'
import GovernancePage from '@mdm/views/governance-center/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof GovernanceDialog>>()
const view = new URLSearchParams(location.search).get('view')
const initialView =
  view === 'quality' || view === 'changes' || view === 'matches' || view === 'outbox'
    ? view
    : undefined
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    initialView
      ? h(GovernancePage, { initialView })
      : h('main', [
          h('button', { onClick: () => dialog.value?.handleOpen('steward') }, '配置责任人'),
          h('button', { onClick: () => dialog.value?.handleOpen('rule') }, '配置质量规则'),
          h(GovernanceDialog, { ref: dialog })
        ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
if (initialView) {
  useUserStore(store).setUserInfo({
    userId: 'governance-options-test',
    tenantId: 'test-tenant',
    platformSuper: false
  })
  useMenuStore(store).setButtonList([
    { name: 'MdmGovernance:View', path: '', type: 'button', meta: { title: '测试权限' } }
  ])
}
await router.isReady()
app.mount('#governance-user-state')
