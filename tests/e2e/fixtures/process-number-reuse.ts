import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import StepsDialog from '@mdm/views/process-master/process-route/modules/steps-dialog.vue'
import { fetchProcessRoutes } from '@mdm/api'
import { captureRenderedRowAction } from './capture-rendered-row-action'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const dialog = ref<InstanceType<typeof StepsDialog>>()
let staleDelete: (() => void) | undefined
let staleDown: (() => void) | undefined
const captured = ref({ delete: false, down: false })
const invoked = ref({ delete: 0, down: 0 })
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: async () => {
            const result = await fetchProcessRoutes({
              tenantId: 'test-tenant',
              current: 1,
              size: 10
            })
            if (result.data[0])
              await dialog.value?.handleOpen(
                result.data[0],
                !new URLSearchParams(location.search).has('edit')
              )
          }
        },
        '查看工艺数量'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            staleDelete = captureRenderedRowAction(dialog.value, 'ArtIconButton', '删除活动')
            staleDown = captureRenderedRowAction(dialog.value, 'ArtIconButton', '下移活动')
            captured.value = { delete: Boolean(staleDelete), down: Boolean(staleDown) }
          }
        },
        '捕获工艺旧活动操作'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            if (!staleDelete) return
            invoked.value = { ...invoked.value, delete: invoked.value.delete + 1 }
            staleDelete()
          }
        },
        '触发工艺旧删除'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            if (!staleDown) return
            invoked.value = { ...invoked.value, down: invoked.value.down + 1 }
            staleDown()
          }
        },
        '触发工艺旧下移'
      ),
      h('pre', { 'data-testid': 'mdm-stale-captured' }, JSON.stringify(captured.value)),
      h('pre', { 'data-testid': 'mdm-stale-invoked' }, JSON.stringify(invoked.value)),
      h(StepsDialog, { ref: dialog })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'process-number-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#process-number')
