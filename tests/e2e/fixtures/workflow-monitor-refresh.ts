import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import WorkflowMonitor from '@/views/workflow/monitor/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dictionaryMode = new URLSearchParams(location.search).get('mode') === 'dictionary'
const app = createApp({
  render: () =>
    dictionaryMode
      ? h('main', { class: 'art-page-view h-screen p-4' }, [
          h(
            'button',
            { type: 'button', onClick: () => useUserStore(store).clearDictionaryCache() },
            '测试清空字典缓存'
          ),
          h(WorkflowMonitor)
        ])
      : h(WorkflowMonitor)
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#monitor-preview')
