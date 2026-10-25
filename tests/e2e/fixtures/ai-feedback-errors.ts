import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import ArtAiFeedback from '@/components/core/base/art-ai-feedback/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const Preview = defineComponent({
  setup() {
    const runId = ref('test-run-a')
    return () =>
      h('main', [
        h(
          'button',
          { type: 'button', onClick: () => (runId.value = 'test-run-b') },
          '切换 AI 结果'
        ),
        h(ArtAiFeedback, { runId: runId.value, contextLabel: '测试 AI 回答' })
      ])
  }
})

const app = createApp(Preview)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  tenant: { tenantCode: 'visual-test', tenantName: '视觉验收业务租户' },
  platformSuper: false
})
userStore.setDictMap({
  aiFeedbackIssueType: [
    { name: '答案不准确', code: 'incorrect', value: 'incorrect', label: '答案不准确', status: '1' }
  ]
})

app.mount('#ai-feedback-errors-preview')
