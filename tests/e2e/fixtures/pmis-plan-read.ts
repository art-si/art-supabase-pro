import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import PmisPlanWorkspace from '@pmis/views/components/plan-workspace.vue'
import PmisTaskEditorDialog, {
  type TaskEditorOpenData
} from '@pmis/views/components/task-editor-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const scope = useTenantScopeStore(store)
const editorRef = ref<{ handleOpen: (data: TaskEditorOpenData) => Promise<void> }>()
const editorMode = new URLSearchParams(location.search).get('view') === 'editor'

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h('button', { type: 'button', onClick: () => scope.setTenantScope(tenantB) }, '切换租户 B'),
      editorMode
        ? [
            h(
              'button',
              {
                type: 'button',
                onClick: () => void editorRef.value?.handleOpen({ kind: 'inspection' })
              },
              '打开任务编辑弹窗'
            ),
            h(PmisTaskEditorDialog, { ref: editorRef })
          ]
        : h(PmisPlanWorkspace, { kind: 'inspection' })
    ])
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
  userId: 'pmis-plan-read-test',
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
