import { createApp, defineComponent, h, ref } from 'vue'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobDirectives } from '@/directives'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useAssistantPage } from '@/hooks/core/useAssistantPage'
import ArtChatWindow from '@/components/core/layouts/art-chat-window/index.vue'
import { mittBus } from '@/utils/sys'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const PreviewPage = defineComponent({
  setup() {
    const filter = ref('')
    useAssistantPage(() => ({
      label: '演示业务',
      filters: { 项目: filter.value },
      filterFields: ['项目'],
      applyFilters: async (filters) => {
        filter.value = filters['项目']
      }
    }))
    return () => h('p', { 'data-testid': 'page-filter' }, `项目：${filter.value}`)
  }
})
const routes = [
  {
    path: '/system/column-config',
    name: 'ColumnConfig',
    meta: { title: '列配置' },
    component: PreviewPage
  },
  { path: '/dashboard/console', name: 'Console', meta: { title: '工作台' }, component: PreviewPage }
]
const router = createRouter({ history: createWebHashHistory(), routes })
const app = createApp({
  render: () =>
    h(
      ElConfigProvider,
      { locale: zhCn },
      {
        default: () => [
          h(ElButton, { onClick: () => mittBus.emit('openChat') }, () => '打开智能助手'),
          h(
            ElButton,
            {
              onClick: () =>
                useUserStore(store).setUserInfo({
                  userId: 'another-preview',
                  tenantId: '22222222-2222-4222-8222-222222222222',
                  platformSuper: false
                })
            },
            () => '切换验收账号'
          ),
          h(RouterView),
          h(ArtChatWindow)
        ]
      }
    )
})
app.use(store).use(router).use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'assistant-preview',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setMenuList(routes.map((route) => ({ ...route, component: undefined })))
if (!location.hash) await router.push('/system/column-config')
await router.isReady()
app.mount('#assistant-preview')
