import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import FavoriteRouteDialog from '@tms/views/basic-data/favorite-route/modules/favorite-route-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'route-fixture',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
} as Api.Auth.UserInfo)

const app = createApp(FavoriteRouteDialog)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
const dialog = app.mount('#favorite-route-waypoints') as unknown as {
  handleOpen: () => Promise<void>
}
void dialog.handleOpen()
