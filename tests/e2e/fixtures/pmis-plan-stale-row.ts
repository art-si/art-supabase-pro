import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import PmisPlanItemEditor from '@pmis/views/components/plan-item-editor.vue'
import type { PmisPlanItem } from '@pmis/api'
import { captureRenderedRowAction } from './capture-rendered-row-action'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const items = ref<PmisPlanItem[]>([
  {
    itemName: '旧项目一',
    requirement: '旧要求一',
    judgmentRule: '',
    requirePhoto: false,
    sort: 10
  },
  { itemName: '旧项目二', requirement: '旧要求二', judgmentRule: '', requirePhoto: false, sort: 20 }
])
const editorRef = ref<InstanceType<typeof PmisPlanItemEditor>>()
let staleDownAction: (() => void) | undefined
const staleButtonCaptured = ref(false)
const staleActionInvoked = ref(0)

const app = createApp({
  setup() {
    const replace = async (): Promise<void> => {
      staleDownAction = captureRenderedRowAction(editorRef.value, 'ArtButtonTable', '下移')
      staleButtonCaptured.value = Boolean(staleDownAction)
      items.value = [
        {
          itemName: '新项目一',
          requirement: '新要求一',
          judgmentRule: '',
          requirePhoto: false,
          sort: 10
        },
        {
          itemName: '新项目二',
          requirement: '新要求二',
          judgmentRule: '',
          requirePhoto: false,
          sort: 20
        }
      ]
      await nextTick()
    }
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        h('button', { type: 'button', onClick: replace }, '替换项目并保留旧下移按钮'),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              if (!staleDownAction) return
              staleActionInvoked.value += 1
              staleDownAction()
            }
          },
          '触发旧下移按钮'
        ),
        h('pre', { 'data-testid': 'stale-button-captured' }, String(staleButtonCaptured.value)),
        h('pre', { 'data-testid': 'stale-action-invoked' }, String(staleActionInvoked.value)),
        h('pre', { 'data-testid': 'plan-items' }, JSON.stringify(items.value)),
        h(PmisPlanItemEditor, {
          ref: editorRef,
          modelValue: items.value,
          'onUpdate:modelValue': (value: PmisPlanItem[]) => (items.value = value)
        })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'pmis-plan-test',
  tenantId: 'tenant-test',
  platformSuper: false
})
app.mount('#app')
