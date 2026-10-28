import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import PmisTaskWorkspace from '@pmis/views/components/task-workspace.vue'
import PmisRepairTaskWorkspace from '@pmis/views/components/repair-task-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const scope = useTenantScopeStore(store)
const repair = new URLSearchParams(location.search).get('view') === 'repair'

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h('button', { type: 'button', onClick: () => scope.setTenantScope(tenantB) }, '切换租户 B'),
      repair
        ? h(PmisRepairTaskWorkspace)
        : h(PmisTaskWorkspace, { kind: 'inspection', mode: 'task' })
    ])
})

app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'pmis-task-read-test',
  tenantId: tenantA,
  platformSuper: true
})
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.setTenantScope(tenantA)
await router.push('/')
await router.isReady()
app.mount('#app')
