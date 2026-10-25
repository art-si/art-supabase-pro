import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import ArtWorkTab from '@/components/core/layouts/art-work-tab/index.vue'
import { useWorktabStore } from '@/store/modules/worktab'
import { useSettingStore } from '@/store/modules/setting'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:id', component: { render: () => null } }]
})
await router.push('/tab-0')
const app = createApp({
  setup() {
    const store = useWorktabStore()
    const settings = useSettingStore()
    settings.showWorkTab = true
    store.opened = Array.from({ length: 12 }, (_, index) => ({
      path: `/tab-${index}`,
      name: `LifecycleTab${index}`,
      title: `业务页面${index}`,
      icon: 'ri:file-line',
      keepAlive: false,
      fixedTab: index === 0
    }))
    store.current = store.opened[0]
    const mounted = ref(true)
    return () =>
      h('main', [
        h(
          'section',
          { style: { width: '320px', maxWidth: '100%' } },
          mounted.value ? [h(ArtWorkTab)] : []
        ),
        h(
          'button',
          {
            onClick: () => {
              settings.showWorkTab = !settings.showWorkTab
            }
          },
          '切换标签栏显示'
        ),
        h(
          'button',
          {
            onClick: () => {
              mounted.value = false
            }
          },
          '卸载标签页'
        ),
        h('output', { 'data-testid': 'tab-count' }, String(store.opened.length))
      ])
  }
})
app.use(createPinia())
setupGlobDirectives(app)
app.use(i18n)
app.use(router)
await router.isReady()
app.mount('#app')
