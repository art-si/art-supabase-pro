import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import SocketChat from '@/views/examples/socket-chat/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({ render: () => h('main', { style: { padding: '24px' } }, h(SocketChat)) })
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#socket-chat-preview')
