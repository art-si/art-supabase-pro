import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import CargoDialog from '../../../modules/art-supabase-tms/src/views/basic-data/cargo/modules/cargo-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'fixture-user',
  tenantId: 'tenant-a',
  platformSuper: false
})
const dialog = ref<InstanceType<typeof CargoDialog>>()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', [
      h('button', { onClick: () => dialog.value?.handleOpen({ groups: [] }) }, '打开货物'),
      h('button', { onClick: () => dialog.value?.handleClose() }, '关闭货物'),
      h(CargoDialog, { ref: dialog })
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#cargo-material-options')
