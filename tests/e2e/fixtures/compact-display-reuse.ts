import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import language from '@/locales'
import { initializeTheme } from '@/hooks/core/useTheme'
import { fetchDomainCommandData } from '@/api/domain-command'
import EnterpriseBigScreen from '@/views/dashboard/modules/enterprise-big-screen.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const finance = new URLSearchParams(location.search).get('mode') === 'finance'
const app = createApp(
  defineComponent({
    setup() {
      const result = ref('尚未读取')
      return () =>
        finance
          ? h('main', [
              h(
                'button',
                {
                  type: 'button',
                  onClick: async () => {
                    try {
                      result.value = JSON.stringify(await fetchDomainCommandData('financial-risk'))
                    } catch {
                      result.value = '读取失败'
                    }
                  }
                },
                '读取财务指标'
              ),
              h('output', { 'aria-label': '财务指标' }, result.value)
            ])
          : h(EnterpriseBigScreen, { mode: 'business' })
    }
  })
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }]
})
app.use(store)
app.use(language)
app.use(router)
useUserStore(store).setUserInfo({
  userId: 'compact-test',
  tenantId: 'compact-test-tenant',
  platformSuper: false
})
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#app')
