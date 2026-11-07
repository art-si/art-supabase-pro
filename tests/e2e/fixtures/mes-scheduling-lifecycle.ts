import { createApp, defineComponent, h, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElScrollbar } from 'element-plus'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import SchedulingPage from '../../../modules/art-supabase-mes/src/views/production-plan/scheduling/index.vue'
import GanttPage from '@mes/views/production-plan/gantt-scheduling/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const ordinary = new URLSearchParams(location.search).has('ordinary')
const subscriptions = reactive<string[]>([])
const removals = reactive<string[]>([])
const callbacks = new Map<string, () => void>()

// 观察实际轮询计时器；保留生产订阅、可见性检查与停止逻辑。
const pollingTimers = new Map<number, string>()
const startInterval = window.setInterval
const stopInterval = window.clearInterval
Object.defineProperty(window, 'setInterval', {
  value: (handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    const id: unknown = Reflect.apply(startInterval, window, [handler, delay, ...args])
    if (typeof id === 'number' && delay === 15_000 && typeof handler === 'function') {
      const page = new URLSearchParams(location.search).has('gantt') ? 'gantt' : 'scheduling'
      const name = `mes-${page}-${tenantScope.effectiveTenantId ?? 'all'}-${id}`
      pollingTimers.set(id, name)
      subscriptions.push(name)
      callbacks.set(name, () => Reflect.apply(handler, window, args))
    }
    return id
  }
})
Object.defineProperty(window, 'clearInterval', {
  value: (id: unknown) => {
    const name = typeof id === 'number' ? pollingTimers.get(id) : undefined
    if (name && typeof id === 'number') {
      removals.push(name)
      callbacks.delete(name)
      pollingTimers.delete(id)
    }
    return Reflect.apply(stopInterval, window, [id])
  }
})

useUserStore(store).setUserInfo({
  userId: '33333333-3333-4333-8333-333333333333',
  tenantId: tenantA,
  platformSuper: !ordinary
} as Api.Auth.UserInfo)
const menuStore = useMenuStore(store)
function setSchedulePermission(allowed: boolean): void {
  menuStore.setButtonList(
    ['MesScheduling:View', ...(allowed ? ['MesOperationTask:Schedule'] : [])].map((name) => ({
      name,
      type: 'button',
      path: '',
      meta: { title: name }
    }))
  )
}
setSchedulePermission(true)
const tenantScope = useTenantScopeStore(store)
await tenantScope.loadTenantOptions()
tenantScope.setTenantScope(tenantA)

const app = createApp(
  defineComponent({
    setup() {
      const visible = ref(true)
      return () =>
        h('div', { style: { display: 'flex', flexDirection: 'column', height: '100dvh' } }, [
          h(
            'nav',
            {
              'aria-label': '测试驱动',
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                padding: '8px',
                flexShrink: 0
              }
            },
            [
              h('button', { onClick: () => tenantScope.setTenantScope(tenantB) }, '切换测试租户'),
              h('button', { onClick: () => tenantScope.setTenantScope(null) }, '切换全部租户'),
              h('button', { onClick: () => setSchedulePermission(false) }, '撤销排产权限'),
              h('button', { onClick: () => setSchedulePermission(true) }, '恢复排产权限'),
              h(
                'button',
                {
                  onClick: () =>
                    useUserStore(store).setUserInfo({
                      ...useUserStore(store).getUserInfo,
                      tenantId: tenantB
                    } as Api.Auth.UserInfo)
                },
                '变更认证租户'
              ),
              h(
                'output',
                { 'data-testid': 'effective-tenant', hidden: true },
                tenantScope.effectiveTenantId ?? 'all'
              ),
              h(
                'button',
                { onClick: () => callbacks.forEach((callback) => callback()) },
                '模拟实时变化'
              ),
              h('button', { onClick: () => (visible.value = false) }, '离开排程页面'),
              h('button', { onClick: () => (visible.value = true) }, '返回排程页面'),
              h(
                'output',
                { 'data-testid': 'subscriptions', hidden: true },
                JSON.stringify(subscriptions)
              ),
              h('output', { 'data-testid': 'removals', hidden: true }, JSON.stringify(removals))
            ]
          ),
          h(ElScrollbar, { style: { flex: '1', minHeight: 0 }, viewClass: 'art-page-view' }, () =>
            visible.value
              ? h(new URLSearchParams(location.search).has('gantt') ? GanttPage : SchedulingPage)
              : null
          )
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
