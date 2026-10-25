import { createApp, defineComponent, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ArtPageContent from '@/components/core/layouts/art-page-content/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const page = (name: string) => defineComponent({ setup: () => () => h('h1', name) })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'RegularLifecycle', component: page('普通页面') },
    {
      path: '/full',
      name: 'FullLifecycle',
      component: page('全屏页面'),
      meta: { isFullPage: true }
    }
  ]
})
const app = createApp({
  setup() {
    const mounted = ref(true)
    return () =>
      h('main', [
        h(
          'nav',
          {
            id: 'app-header',
            style: { position: 'fixed', height: '40px', zIndex: 3000, top: '8px', right: '8px' }
          },
          [
            h('button', { onClick: () => router.push('/') }, '普通页'),
            h('button', { onClick: () => router.push('/full') }, '全屏页'),
            h(
              'button',
              {
                onClick: () => {
                  mounted.value = false
                }
              },
              '卸载页面容器'
            )
          ]
        ),
        mounted.value ? h(ArtPageContent) : null
      ])
  }
})
app.use(createPinia())
app.use(router)
await router.isReady()
app.mount('#app')
