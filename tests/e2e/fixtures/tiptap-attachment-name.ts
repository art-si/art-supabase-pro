import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import ArtTiptapEditor from '@/components/core/forms/art-tiptap-editor/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const dark = query.get('theme') === 'dark'
document.documentElement.classList.toggle('dark', dark)
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.dataset.boxMode = query.get('box') || 'border-mode'

const app = createApp({
  setup() {
    const html = ref('')
    return () =>
      h('main', { class: 'art-page-view mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-5' }, [
        h('h1', { class: 'text-xl font-semibold' }, '附件地址与名称验收'),
        h(ArtTiptapEditor, {
          modelValue: html.value,
          height: '360px',
          resourceTenantId: 'test-tenant',
          'onUpdate:modelValue': (value: string) => {
            html.value = value
          }
        }),
        h('output', { class: 'sr-only', 'data-testid': 'html' }, html.value)
      ])
  }
})

app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'tiptap-attachment-name-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
app.mount('#tiptap-attachment-name')
