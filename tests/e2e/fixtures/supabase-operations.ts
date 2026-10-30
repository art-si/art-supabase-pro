import { createApp, h, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import { mittBus } from '@/utils/sys'
import OperationsPage from '@/views/data-center/supabase-operations/index.vue'
import ArtChatWindow from '@/components/core/layouts/art-chat-window/index.vue'
import ProjectChatPanel from '@/views/data-center/supabase-ai-assistant/modules/project-assistant-chat-panel.vue'
import type { ProjectAssistantChatState } from '@/views/data-center/supabase-ai-assistant/modules/use-project-assistant-chat'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const theme = query.get('theme') || 'light'
document.documentElement.classList.toggle('dark', theme === 'dark')
document.documentElement.dataset.theme = theme
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = query.get('box') || 'border-mode'
document.documentElement.style.setProperty('--art-full-height', 'calc(100dvh - 32px)')
document.documentElement.style.setProperty('--custom-radius', '0.75rem')
const chat = reactive<ProjectAssistantChatState>({
  input: '',
  sending: false,
  startedAt: 0,
  elapsedMs: 0,
  contextLocked: false,
  contextObject: null,
  messages: []
})
const app = createApp({
  render: () =>
    query.get('mode') === 'assistant'
      ? h('main', { class: 'art-page-view h-screen p-4 flex flex-col gap-3' }, [
          h(
            'button',
            { type: 'button', class: 'self-start p-2', onClick: () => mittBus.emit('openChat') },
            '打开业务助手'
          ),
          h(
            'section',
            { class: 'min-h-0 flex-1' },
            h(ProjectChatPanel, {
              chat,
              activeChatObject: null,
              assistantStatus: { loading: false, online: true, capabilities: null },
              assistantStatusLabel: 'AI 在线',
              assistantMode: 'read_only',
              canUseControlledWrite: false,
              chatPhase: '',
              chatSuggestions: ['概览当前 Supabase 项目'],
              quickActions: [],
              'onUpdate-input': (value: string) => {
                chat.input = value
              }
            })
          ),
          h(ArtChatWindow)
        ])
      : h('main', { class: 'art-page-view h-screen min-h-0 p-4' }, h(OperationsPage))
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'operations-preview',
  tenantId: 'operations-preview-tenant',
  platformSuper: query.get('ordinary') !== 'true'
})
await router.isReady()
app.mount('#app')
