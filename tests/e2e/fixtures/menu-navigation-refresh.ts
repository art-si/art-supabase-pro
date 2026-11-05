import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import MenuPage from '@/views/system/menu/index.vue'
import { useMenuStore } from '@/store/modules/menu'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/system/menu', component: MenuPage }]
})

const store = createPinia()
const app = createApp(MenuPage)
app.use(store)
app.use(language)
app.use(router)
useMenuStore(store).setButtonList([
  { name: 'System:Menu:View', path: '', type: 'button', meta: { title: '查看' } },
  { name: 'System:Menu:Edit', path: '', type: 'button', meta: { title: '编辑' } }
])
await router.push('/system/menu')
await router.isReady()
app.mount('#app')
