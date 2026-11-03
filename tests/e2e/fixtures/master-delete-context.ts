import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import { mittBus } from '@/utils/sys'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import Guard from '@/components/business/master-data-delete-guard/index.vue'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/a', name: 'A', component: {} },
    { path: '/b', name: 'B', component: {} },
    { path: '/record', name: 'Record', component: {} }
  ]
})
const blockedRoutePending = ref(false)
let releaseBlockedRoute: (() => void) | undefined
router.beforeEach(async (to) => {
  if (to.name !== 'Record' || to.query.reject !== '1') return
  blockedRoutePending.value = true
  await new Promise<void>((resolve) => (releaseBlockedRoute = resolve))
  blockedRoutePending.value = false
  throw new Error('测试旧导航拒绝')
})
const user = useUserStore(store)
const scope = useTenantScopeStore(store)
const globalReferenceEvents = ref(0)
mittBus.on('deleteReferenceBlocked', () => {
  globalReferenceEvents.value += 1
})
user.setUserInfo({ userId: 'guard-user-a', tenantId: tenantA, platformSuper: true })
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.setTenantScope(tenantA)

const dependency = (
  owner: 'A' | 'B',
  cleanupAllowed = false
): MasterDataDeleteDependencyDetail => ({
  resourceId: `customer-${owner}`,
  dependencyCode: 'test',
  recordId: `record-${owner}`,
  targetId: `record-${owner}`,
  recordNo: `关联记录 ${owner}`,
  recordStatus: '草稿',
  createdAt: '2026-11-03T00:00:00Z',
  cleanupAllowed
})

const app = createApp({
  setup() {
    const guard = ref<InstanceType<typeof Guard>>()
    const aResult = ref('idle')
    const bResult = ref('idle')
    const cleanupCalls = ref(0)
    const cleanupSelected = ref('')
    const cleared = ref(0)
    const retryBlocked = ref(true)
    let releaseA: (() => void) | undefined
    let releaseCleanup: (() => void) | undefined
    let releaseNavigation: (() => void) | undefined
    const waitForRelease = (setRelease: (release: () => void) => void) =>
      new Promise<void>((resolve) => setRelease(resolve))
    const meta = {
      test: {
        label: '关联资料',
        unit: '条',
        description: '请核对关联记录。',
        actionLabel: '查看记录',
        routeNames: ['Record'],
        resolveRouteName: async () => {
          await waitForRelease((release) => (releaseNavigation = release))
          return 'Record'
        },
        order: 1
      }
    }
    const inspectA = (mode: 'blocked' | 'error' | 'empty' | 'resolve') => {
      aResult.value = 'pending'
      const pending = waitForRelease((release) => (releaseA = release))
      void guard.value
        ?.inspect({
          resourceLabel: '客户',
          resources: [{ id: 'customer-A', label: '客户 A' }],
          ...(mode === 'resolve'
            ? {
                resolveResources: async () => {
                  await pending
                  return [{ id: 'customer-A', label: '客户 A' }]
                }
              }
            : {}),
          fetchDependencies: async () => {
            if (mode !== 'resolve') await pending
            if (mode === 'error') throw new Error('测试关联读取失败')
            return mode === 'empty' ? [] : [dependency('A')]
          },
          dependencyMeta: meta
        })
        .then((blocked) => (aResult.value = String(blocked)))
    }
    const inspectB = () => {
      bResult.value = 'pending'
      void guard.value
        ?.inspect({
          resourceLabel: '客户',
          resources: [{ id: 'customer-B', label: '客户 B' }],
          fetchDependencies: async () => [dependency('B')],
          dependencyMeta: meta
        })
        .then((blocked) => (bResult.value = String(blocked)))
    }
    const inspectCleanupA = () => {
      aResult.value = 'pending'
      void guard.value
        ?.inspect({
          resourceLabel: '客户',
          resources: [{ id: 'customer-A', label: '客户 A' }],
          fetchDependencies: async () => [dependency('A', true)],
          dependencyMeta: meta,
          cleanup: {
            actionLabel: '清理选中项',
            confirmMessage: (count) => `清理 ${count} 项？`,
            run: async (selected) => {
              cleanupCalls.value += 1
              cleanupSelected.value = selected.map((item) => item.recordId).join(',')
              await waitForRelease((release) => (releaseCleanup = release))
              return 1
            }
          }
        })
        .then((blocked) => (aResult.value = String(blocked)))
    }
    const inspectGovernedA = () => {
      aResult.value = 'pending'
      void guard.value
        ?.inspect({
          resourceType: 'role',
          resourceLabel: '角色',
          resources: [{ id: 'role-A', label: '角色 A' }]
        })
        .then((blocked) => (aResult.value = String(blocked)))
    }
    const inspectBlockedResourceA = (rejectNavigation = false) => {
      aResult.value = 'pending'
      void guard.value
        ?.inspect({
          resourceLabel: '客户',
          resources: [
            {
              id: 'customer-A',
              label: '客户 A',
              blockReason: '测试单据仍在办理',
              to: {
                name: 'Record',
                query: { selected: 'A', ...(rejectNavigation ? { reject: '1' } : {}) }
              }
            }
          ],
          fetchDependencies: async () => []
        })
        .then((blocked) => (aResult.value = String(blocked)))
    }
    const inspectRetryA = () => {
      aResult.value = 'pending'
      void guard.value
        ?.inspect({
          resourceLabel: '客户',
          resources: [{ id: 'customer-A', label: '客户 A' }],
          fetchDependencies: async () => (retryBlocked.value ? [dependency('A')] : []),
          dependencyMeta: meta
        })
        .then((blocked) => (aResult.value = String(blocked)))
    }
    const openNavigationA = () => {
      aResult.value = 'pending'
      void guard.value
        ?.inspect({
          resourceLabel: '客户',
          resources: [{ id: 'customer-A', label: '客户 A' }],
          fetchDependencies: async () => [dependency('A')],
          dependencyMeta: meta
        })
        .then((blocked) => (aResult.value = String(blocked)))
    }
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        h('div', { class: 'flex flex-wrap gap-2' }, [
          ...(['blocked', 'error', 'empty', 'resolve'] as const).map((mode) =>
            h('button', { type: 'button', onClick: () => inspectA(mode) }, `检查 A ${mode}`)
          ),
          h(
            'button',
            { type: 'button', 'data-testid': 'guard-open-b', onClick: inspectB },
            '检查 B'
          ),
          h('button', { type: 'button', onClick: inspectCleanupA }, '检查 A 清理'),
          h('button', { type: 'button', onClick: inspectGovernedA }, '检查 A 内置清理'),
          h(
            'button',
            { type: 'button', onClick: () => inspectBlockedResourceA() },
            '检查 A 不可删单据'
          ),
          h(
            'button',
            { type: 'button', onClick: () => inspectBlockedResourceA(true) },
            '检查 A 旧导航失败'
          ),
          h('button', { type: 'button', onClick: () => releaseBlockedRoute?.() }, '释放路由拒绝'),
          h('button', { type: 'button', onClick: inspectRetryA }, '检查 A 可解除'),
          h(
            'button',
            { type: 'button', onClick: () => (retryBlocked.value = false) },
            '解除 A 引用'
          ),
          h('button', { type: 'button', onClick: openNavigationA }, '检查 A 导航'),
          h(
            'button',
            { type: 'button', onClick: () => scope.setTenantScope(tenantB) },
            '切换租户 B'
          ),
          h('button', { type: 'button', onClick: () => void router.push('/b') }, '切换路由 B'),
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                user.setUserInfo({ userId: 'guard-user-b', tenantId: tenantB, platformSuper: true })
            },
            '切换用户 B'
          ),
          h('button', { type: 'button', onClick: () => releaseA?.() }, '释放 A'),
          h('button', { type: 'button', onClick: () => releaseCleanup?.() }, '释放清理'),
          h('button', { type: 'button', onClick: () => releaseNavigation?.() }, '释放导航')
        ]),
        h('output', { 'data-testid': 'guard-route' }, router.currentRoute.value.fullPath),
        h('output', { 'data-testid': 'guard-route-pending' }, String(blockedRoutePending.value)),
        h('output', { 'data-testid': 'guard-tenant' }, scope.effectiveTenantId ?? ''),
        h('output', { 'data-testid': 'guard-user' }, user.getUserInfo.userId ?? ''),
        h('output', { 'data-testid': 'guard-a-result' }, aResult.value),
        h('output', { 'data-testid': 'guard-b-result' }, bResult.value),
        h('output', { 'data-testid': 'guard-cleanup-calls' }, String(cleanupCalls.value)),
        h('output', { 'data-testid': 'guard-cleanup-selected' }, cleanupSelected.value),
        h('output', { 'data-testid': 'guard-cleared' }, String(cleared.value)),
        h(
          'output',
          { 'data-testid': 'guard-global-reference-events' },
          String(globalReferenceEvents.value)
        ),
        h(Guard, { ref: guard, onCleared: () => (cleared.value += 1) })
      ])
  }
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/a')
await router.isReady()
initializeTheme()
app.mount('#app')
