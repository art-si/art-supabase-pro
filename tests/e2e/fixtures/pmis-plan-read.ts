import { KeepAlive, createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { useMenuStore } from '@/store/modules/menu'
import PmisPlanWorkspace from '@pmis/views/components/plan-workspace.vue'
import type { PmisPlanKind } from '@pmis/api'
import { pmisPlanPermissions } from '@pmis/views/components/business-permissions'
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
const writeMode = new URLSearchParams(location.search).get('view') === 'write'
const initialScope = new URLSearchParams(location.search).get('scope')
const workspaceKind = ref<PmisPlanKind>('inspection')
const workspaceActive = ref(true)
const InactivePage = defineComponent({
  name: 'PmisFixtureInactivePage',
  render: () => h('p', { 'data-testid': 'workspace-inactive' }, '其他页面')
})
const user = useUserStore(store)
const menu = useMenuStore(store)
const importGrants = [
  ...Object.values(pmisPlanPermissions.inspection),
  ...Object.values(pmisPlanPermissions.patrol)
]
const grantImport = () =>
  menu.setButtonList(
    importGrants.map((name) => ({
      name,
      path: '',
      type: 'button',
      meta: { title: name }
    }))
  )

const app = createApp({
  render: () => {
    const writeView = [
      h('div', { class: 'flex min-w-0 flex-wrap gap-2' }, [
        h(
          'button',
          { type: 'button', 'data-testid': 'scope-all', onClick: () => scope.setTenantScope(null) },
          '全部租户'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'scope-b',
            onClick: () => scope.setTenantScope(tenantB)
          },
          '选择租户 B'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'kind-patrol',
            onClick: () => (workspaceKind.value = 'patrol')
          },
          '切换巡检方案'
        ),
        h(
          'button',
          { type: 'button', 'data-testid': 'revoke-import', onClick: () => menu.setButtonList([]) },
          '撤销导入权限'
        ),
        h(
          'button',
          { type: 'button', 'data-testid': 'restore-import', onClick: grantImport },
          '恢复导入权限'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'deactivate-workspace',
            onClick: () => (workspaceActive.value = false)
          },
          '离开方案工作区'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'activate-workspace',
            onClick: () => (workspaceActive.value = true)
          },
          '返回方案工作区'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'route-other',
            onClick: () => void router.replace('/other')
          },
          '切换路由'
        )
      ]),
      h('output', { 'data-testid': 'workspace-kind' }, workspaceKind.value),
      h(KeepAlive, null, {
        default: () =>
          workspaceActive.value
            ? h(PmisPlanWorkspace, { kind: workspaceKind.value })
            : h(InactivePage)
      })
    ]
    const editorView = [
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
    return h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h('button', { type: 'button', onClick: () => scope.setTenantScope(tenantB) }, '切换租户 B'),
      ...(writeMode
        ? writeView
        : editorMode
          ? editorView
          : [h(PmisPlanWorkspace, { kind: 'inspection' })])
    ])
  }
})

app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
user.setUserInfo({
  userId: 'pmis-plan-read-test',
  tenantId: tenantA,
  platformSuper: initialScope !== 'ordinary'
})
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
if (writeMode) {
  grantImport()
  if (initialScope === 'ordinary')
    scope.selectedTenantId = tenantB // Forged persisted header; effective scope remains actor A.
  else scope.setTenantScope(initialScope === 'selected' ? tenantB : null)
} else scope.setTenantScope(tenantA)
const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? SystemThemeEnum.DARK
    : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
useTheme().switchThemeStyles(theme)
await router.push('/')
await router.isReady()
app.mount('#app')
