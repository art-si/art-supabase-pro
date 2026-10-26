import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/linked', name: 'Linked', component: {} },
    { path: '/other', name: 'Other', component: {} }
  ]
})
const parameters = new URLSearchParams(location.search)
await router.push('/linked?documentId=original')
const app = createApp({
  setup() {
    const failOpen = ref(!parameters.has('success'))
    const paused = ref(parameters.has('pause'))
    const authorized = ref(true)
    const pending: Array<() => void> = []
    const opened = ref('')
    const reads = ref(0)
    const state = useRouteDocumentDrawer({
      routeName: 'Linked',
      canOpen: () => authorized.value,
      fetchDocument: async (id) => {
        reads.value += 1
        if (paused.value) await new Promise<void>((resolve) => pending.push(resolve))
        return { id }
      },
      openDocument: async (document) => {
        if (failOpen.value) throw new Error('模拟详情打开失败')
        opened.value = document.id
      }
    })
    return () =>
      h('main', [
        h(
          'output',
          { 'data-testid': 'state' },
          JSON.stringify({
            error: state.error.value,
            loading: state.loading.value,
            documentId: router.currentRoute.value.query.documentId ?? null,
            opened: opened.value,
            reads: reads.value
          })
        ),
        h(
          'button',
          {
            disabled: state.loading.value,
            onClick: async () => {
              failOpen.value = false
              await state.retry()
            }
          },
          '恢复并重试'
        ),
        h(
          'button',
          { onClick: () => router.replace('/linked?documentId=second') },
          '切换到第二单据'
        ),
        h('button', { onClick: () => router.push('/other') }, '离开关联页面'),
        h(
          'button',
          {
            onClick: () => {
              paused.value = false
              pending.splice(0).forEach((resolve) => resolve())
            }
          },
          '继续读取'
        ),
        h(
          'button',
          {
            onClick: () => {
              authorized.value = false
            }
          },
          '撤回查看权限'
        ),
        h(
          'button',
          {
            onClick: () => {
              authorized.value = true
            }
          },
          '恢复查看权限'
        )
      ])
  }
})
app.use(router)
app.mount('#app')
