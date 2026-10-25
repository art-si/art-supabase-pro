import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/locales'
import ArtUserMenu from '@/components/core/layouts/art-header-bar/widget/art-user-menu.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }]
})
await router.push('/')
const app = createApp({
  setup() {
    const mounted = ref(true)
    return () =>
      h('main', { class: 'p-6' }, [
        h('section', { class: 'flex justify-end' }, mounted.value ? [h(ArtUserMenu)] : []),
        h('button', { onClick: () => (mounted.value = false) }, '卸载用户菜单')
      ])
  }
})
app.use(createPinia())
app.use(i18n)
app.use(router)
await router.isReady()
app.mount('#app')
