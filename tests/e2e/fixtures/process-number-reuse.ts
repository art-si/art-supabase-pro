import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import StepsDialog from '@mdm/views/process-master/process-route/modules/steps-dialog.vue'
import { fetchProcessRoutes } from '@mdm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const dialog = ref<InstanceType<typeof StepsDialog>>()
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
