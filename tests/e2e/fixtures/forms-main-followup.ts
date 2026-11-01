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
    else if (mode === 'versions' && input.definition)
      await versions.value?.handleOpen(input.definition, { canManage: true })
  } catch (cause) {
    error.value = String(cause)
  }
}
const app = createApp({
  render: () =>
    h('main', { class: 'min-h-screen min-w-0 p-4' }, [
      h('button', { onClick: open }, '打开公开入口'),
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
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useTenantScopeStore(store).selectedTenantId = '11111111-1111-4111-8111-111111111111'
useMenuStore(store).setButtonList([{ name: 'WorkflowDefinition:Edit', path: '', type: 'button' }])
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#main-overlay-fixture')
