import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import Capability from '@/views/data-center/supabase-ai-assistant/modules/capability-center-drawer.vue'
import Simulator from '@/views/workflow/definition/modules/workflow-simulator-dialog.vue'
import Versions from '@/views/workflow/definition/modules/workflow-version-history-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

declare global {
  interface Window {
    mainOverlayInput?: {
      simulator?: {
        businessType: string
        businessTypeLabel: string
        config: Api.Workflow.WorkflowConfig
      }
      definition?: Api.Workflow.WorkflowDefinitionRecord
      definitionB?: Api.Workflow.WorkflowDefinitionRecord
    }
  }
}
const params = new URLSearchParams(location.search),
  mode = params.get('mode'),
  input = window.mainOverlayInput || {},
  capability = ref<InstanceType<typeof Capability>>(),
  simulator = ref<InstanceType<typeof Simulator>>(),
  versions = ref<InstanceType<typeof Versions>>(),
  error = ref(''),
  analyzed = ref(''),
  successes = ref(0)
const open = async () => {
  error.value = ''
  try {
    if (mode === 'capability') await capability.value?.handleOpen({ edgeFunctions: null })
    else if (mode === 'simulator' && input.simulator)
      await simulator.value?.handleOpen(input.simulator)
    else if ((mode === 'versions' || mode === 'versions-context') && input.definition)
      await versions.value?.handleOpen(input.definition, { canManage: true })
  } catch (cause) {
    error.value = String(cause)
  }
}
const app = createApp({
  render: () =>
    h('main', { class: 'min-h-screen min-w-0 p-4' }, [
      h('button', { onClick: open }, '打开公开入口'),
      ...(mode === 'versions-context'
        ? [
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'open-definition-b',
                onClick: () => {
                  if (input.definitionB)
                    void versions.value?.handleOpen(input.definitionB, { canManage: true })
                }
              },
              '打开流程 B'
            ),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'mutate-caller-definition',
                onClick: () => {
                  if (!input.definition) return
                  input.definition.name = '外部已修改流程'
                  if (input.definition.versions?.[1]?.config.nodes[0])
                    input.definition.versions[1].config.nodes[0].name = '外部已修改节点'
                }
              },
              '外部更新原流程对象'
            ),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'switch-version-route',
                onClick: () => void router.replace('/other')
              },
              '切换路由'
            ),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'switch-version-tenant',
                onClick: () =>
                  useUserStore(store).setUserInfo({
                    userId: '22222222-2222-4222-8222-222222222222',
                    tenantId: '33333333-3333-4333-8333-333333333333',
                    platformSuper: false
                  })
              },
              '切换租户'
            ),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'revoke-version-edit',
                onClick: () => useMenuStore(store).setButtonList([])
              },
              '撤销编辑权限'
            ),
            h(
              'output',
              { 'data-testid': 'version-context' },
              `${router.currentRoute.value.path}:${useTenantScopeStore(store).effectiveTenantId ?? 'all'}:${useMenuStore(store).buttonList.length}`
            )
          ]
        : []),
      h('output', { 'data-testid': 'open-error' }, error.value),
      h('output', { 'data-testid': 'analyze' }, analyzed.value),
      h('output', { 'data-testid': 'successes' }, String(successes.value)),
      mode === 'capability'
        ? h(Capability, {
            ref: capability,
            onAnalyze: (value: string) => {
              analyzed.value = value
            }
          })
        : mode === 'simulator'
          ? h(Simulator, { ref: simulator })
          : h(Versions, {
              ref: versions,
              onSuccess: () => {
                successes.value++
              }
            })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/other', component: {} }
  ]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useTenantScopeStore(store).selectedTenantId = '11111111-1111-4111-8111-111111111111'
useMenuStore(store).setButtonList([
  { name: 'WorkflowDefinition:Edit', path: '', type: 'button', meta: { title: '恢复版本' } }
])
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#main-overlay-fixture')
