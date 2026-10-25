import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/linked', name: 'Linked', component: {} }]
})
await router.push('/linked?documentId=original')
const app = createApp({
  setup() {
    const failOpen = ref(true)
    const opened = ref('')
    const reads = ref(0)
    const state = useRouteDocumentDrawer({
      routeName: 'Linked',
      canOpen: () => true,
      fetchDocument: async (id) => {
        reads.value += 1
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
        )
      ])
  }
})
app.use(router)
app.mount('#app')
