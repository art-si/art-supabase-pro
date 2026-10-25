import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtIconPicker from '@/components/core/forms/art-icon-picker/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const prefix = new URLSearchParams(window.location.search).get('prefix') ?? 'ri'
const icon = ref(prefix === 'ri' ? 'ri:home-line' : '')
const app = createApp({
  render: () =>
    h('main', { class: 'p-4', style: { maxWidth: '480px' } }, [
      h('h1', '图标选择器数据验收'),
      h(ArtIconPicker, {
        prefix,
        modelValue: icon.value,
        'onUpdate:modelValue': (value: string) => {
          icon.value = value
        }
      }),
      h('output', icon.value)
    ])
})
app.use(store)
setupGlobDirectives(app)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }]
  })
)
app.mount('#picker-preview')
