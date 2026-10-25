import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import DelegationDialog from '@/views/workflow/workbench/modules/workflow-delegation-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof DelegationDialog>>()
const successes = ref(0)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', [
      h('button', { onClick: () => dialog.value?.handleOpen('user-a', 'tenant-a') }, '打开委托'),
      h(
        'button',
        { onClick: () => dialog.value?.handleOpen('user-b', 'tenant-b') },
        '打开另一用户委托'
      ),
      h(DelegationDialog, {
        ref: dialog,
        onSuccess: () => {
          successes.value += 1
        }
      }),
      h('output', { 'data-testid': 'success-count' }, String(successes.value))
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#workflow-delegation')
