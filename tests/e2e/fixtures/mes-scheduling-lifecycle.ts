import { createApp, defineComponent, h, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { supabase } from '@/plugins/supabase'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import SchedulingPage from '../../../modules/art-supabase-mes/src/views/production-plan/scheduling/index.vue'
import GanttPage from '@mes/views/production-plan/gantt-scheduling/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const subscriptions = reactive<string[]>([])
const removals = reactive<string[]>([])
const callbacks = new Map<string, () => void>()

// 仅替换外部实时传输，页面与 API 的订阅/清理逻辑仍使用生产实现。
Object.defineProperty(supabase, 'channel', {
  value: (name: string) => {
    const channel = {
      name,
      on(_event: string, _filter: unknown, callback: () => void) {
        callbacks.set(name, callback)
        return channel
      },
      subscribe() {
        subscriptions.push(name)
        return channel
      }
    }
    return channel
  }
})
Object.defineProperty(supabase, 'removeChannel', {
  value: async (channel: { name: string }) => {
    removals.push(channel.name)
    callbacks.delete(channel.name)
    return 'ok'
  }
})

useUserStore(store).setUserInfo({
  userId: '33333333-3333-4333-8333-333333333333',
  tenantId: tenantA,
  platformSuper: true
} as Api.Auth.UserInfo)
const tenantScope = useTenantScopeStore(store)
await tenantScope.loadTenantOptions()
tenantScope.setTenantScope(tenantA)

const app = createApp(
  defineComponent({
    setup() {
      const visible = ref(true)
      return () =>
        h('div', [
          h('button', { onClick: () => tenantScope.setTenantScope(tenantB) }, '切换测试租户'),
          h(
            'button',
            { onClick: () => callbacks.forEach((callback) => callback()) },
            '模拟实时变化'
          ),
          h('button', { onClick: () => (visible.value = false) }, '离开排程页面'),
          h('output', { 'data-testid': 'subscriptions' }, JSON.stringify(subscriptions)),
          h('output', { 'data-testid': 'removals' }, JSON.stringify(removals)),
          visible.value
            ? h(new URLSearchParams(location.search).has('gantt') ? GanttPage : SchedulingPage)
            : null
        ])
    }
  })
)
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#scheduling-preview')
