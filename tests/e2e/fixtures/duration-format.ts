import { createApp, h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import type { AiProviderModel, AiModelBenchmark } from '@/api/ai-configuration'
import type { ProjectAssistantConversationSummary } from '@/types/supabase-ai-assistant'
import ModelSelector from '@/views/system/ai-configuration/modules/ai-model-selector.vue'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import HistoryDrawer from '@/components/core/layouts/art-assistant-history-drawer/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const models: AiProviderModel[] = [
  {
    id: 'test-model',
    label: '测试模型',
    kind: 'text',
    capability: '文本推理',
    strengths: ['业务问答'],
    recommendedFor: ['运营分析'],
    performanceProfile: 'balanced',
    performanceHint: '已完成测速',
    benchmarkable: true,
    description: '验证跨组件耗时格式一致性'
  }
]
const benchmark: AiModelBenchmark = {
  model: 'test-model',
  connectionMs: 34.6,
  firstResponseMs: 1234,
  totalMs: 12345,
  responseBytes: 1024,
  streaming: true,
  measuredAt: '2026-10-08T08:00:00Z'
}
const items: ProjectAssistantConversationSummary[] = [0, 34.6, 1234, 12345, Number.NaN].map(
  (latencyMs, index) => ({
    id: `conversation-${index}`,
    title: `会话${index + 1}`,
    context: {},
    createTime: '2026-10-08T08:00:00Z',
    updateTime: '2026-10-08T08:00:00Z',
    lastMessage: {
      role: 'assistant',
      content: '本次运行的耗时摘要',
      createTime: '2026-10-08T08:00:00Z'
    },
    lastRun: {
      id: `run-${index}`,
      status: 'succeeded',
      model: 'test-model',
      latencyMs,
      startedAt: '2026-10-08T08:00:00Z'
    }
  })
)
const app = createApp({
  setup() {
    const drawer = shallowRef<Pick<ArtDrawerExpose, 'handleOpen' | 'handleClose'>>()
    const state = ref('ready')
    useEventListener(window, 'duration-fixture-state', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string')
        state.value = event.detail
    })
    return () =>
      h('main', { class: 'mx-auto max-w-4xl p-4' }, [
        h(ModelSelector, {
          modelValue: 'test-model',
          models,
          benchmarkResults: new Map([['test-model', benchmark]]),
          showDetails: true
        }),
        h('button', { onClick: () => void drawer.value?.handleOpen() }, '查看会话历史'),
        h(HistoryDrawer, {
          ref: drawer,
          query: '',
          loading: state.value === 'loading',
          error: state.value === 'error' ? '测试读取失败' : '',
          items: state.value === 'empty' ? [] : items,
          onRetry: () => {
            state.value = 'ready'
          }
        })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#duration-preview')
