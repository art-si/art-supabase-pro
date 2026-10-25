import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import HolidayDialog from '@mdm/views/production/statutory-holiday/modules/statutory-holiday-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof HolidayDialog>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              dialog.value?.handleOpen({ organizations: [], selectedDate: '2026-10-01' })
          },
          '打开假期'
        ),
        h(HolidayDialog, { ref: dialog })
      ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
await router.isReady()
app.mount('#app')
