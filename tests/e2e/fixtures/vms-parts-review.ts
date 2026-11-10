import { createApp, getCurrentInstance, h, KeepAlive, ref, type VNode } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { writePlatformTenantScopeActive } from '@/utils/tenant-scope-context'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import PartIssueDialog from '@vms/views/vehicle-manage/part-manage/modules/part-issue-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const issuePermission = params.get('issuePermission')
const issueContext = params.has('issueContext')
const issue = ref<InstanceType<typeof PartIssueDialog>>()
const successes = ref(0)
const page = {
  name: 'VehiclePartsManage',
  path: '/vms/vehicle-manage/part-manage',
  component: issueContext
    ? {
        name: 'VmsIssueContextFixture',
        render: () => h(PartIssueDialog, { ref: issue, onSuccess: () => successes.value++ })
      }
    : () => import('@vms/views/vehicle-manage/part-manage/index.vue')
}
useUserStore(store).setUserInfo({
  userId: 'vms-parts-review',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: params.has('platformScope')
})
useMenuStore(store).setButtonList(
  (issuePermission
    ? issuePermission.split(',').map((name) => `VmsPartIssue:${name}`)
    : [
        'VmsPartIssue:View',
        'VmsPartIssue:Add',
        'VmsPartInventory:View',
        'VmsPartInventory:Receipt',
        'VehiclePartUsage:View'
      ]
  ).map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const scope = useTenantScopeStore(store)
scope.scopeOwnerUserId = 'vms-parts-review'
scope.selectedTenantId = null
scope.tenantOptions = [
  { id: '11111111-1111-4111-8111-111111111111', tenantCode: 'A', tenantName: '合成租户 A' },
  { id: '22222222-2222-4222-8222-222222222222', tenantCode: 'B', tenantName: '合成租户 B' }
]
writePlatformTenantScopeActive(params.has('platformScope'))
if (params.has('selectedScope')) scope.setTenantScope('11111111-1111-4111-8111-111111111111')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [page, { path: '/away', component: { render: () => h('p', '已离开领用页面') } }]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view h-screen p-4',
          style: {
            background: 'var(--el-bg-color-page)',
            '--art-full-height': 'calc(100dvh - 32px)'
          }
        },
        issueContext
          ? [
              h(
                'button',
                { 'data-testid': 'issue-open', onClick: () => void issue.value?.handleOpen() },
                '打开领用表单'
              ),
              h(
                'button',
                {
                  'data-testid': 'issue-revoke',
                  onClick: () => useMenuStore(store).setButtonList([])
                },
                '撤销领用权限'
              ),
              h(
                'button',
                {
                  'data-testid': 'issue-actor',
                  onClick: () => {
                    const user = useUserStore(store)
                    user.setUserInfo({
                      ...user.getUserInfo,
                      tenantId: '33333333-3333-4333-8333-333333333333'
                    })
                  }
                },
                '更新认证租户'
              ),
              h(
                'button',
                {
                  'data-testid': 'issue-demote',
                  onClick: () => {
                    const user = useUserStore(store)
                    user.setUserInfo({ ...user.getUserInfo, platformSuper: false })
                  }
                },
                '取消平台权限'
              ),
              h(
                'button',
                {
                  'data-testid': 'issue-scope',
                  onClick: () => scope.setTenantScope('22222222-2222-4222-8222-222222222222')
                },
                '切换租户 B'
              ),
              h(
                'button',
                { 'data-testid': 'issue-away', onClick: () => void router.push('/away') },
                '离开页面'
              ),
              h(
                'button',
                { 'data-testid': 'issue-back', onClick: () => void router.push(page.path) },
                '返回领用页面'
              ),
              h(
                'output',
                { 'data-testid': 'issue-successes', hidden: true },
                String(successes.value)
              ),
              h(
                'output',
                { 'data-testid': 'issue-effective-scope', hidden: true },
                scope.effectiveTenantId ?? 'all'
              ),
              h(
                'output',
                { 'data-testid': 'issue-scope-revision', hidden: true },
                String(scope.revision)
              ),
              h(RouterView, null, {
                default: ({ Component }: { Component?: VNode }) =>
                  h(KeepAlive, null, { default: () => (Component ? [Component] : []) })
              })
            ]
          : [h(RouterView)]
      )
    )
})
if (params.has('deferIssueValidation')) {
  let hold = true
  app.mixin({
    beforeMount() {
      const instance = getCurrentInstance()
      if (instance?.type !== ArtTable) return
      const columns: unknown = instance.props.columns
      if (!Array.isArray(columns)) return
      const quantity = columns.find(
        (column: unknown): column is Record<string, unknown> =>
          typeof column === 'object' &&
          column !== null &&
          'prop' in column &&
          column.prop === 'issuedQty'
      )
      if (!quantity) return
      const rules: unknown = quantity.rules
      quantity.rules = [
        ...(Array.isArray(rules) ? rules : rules ? [rules] : []),
        {
          validator: () => {
            if (!hold) return true
            hold = false
            document.documentElement.dataset.issueValidation = 'pending'
            return new Promise<boolean>((resolve) =>
              document.addEventListener(
                'issue-validation-result',
                () => {
                  document.documentElement.dataset.issueValidation = 'resolved'
                  resolve(true)
                },
                { once: true }
              )
            )
          }
        }
      ]
    }
  })
}
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push(page.path)
await router.isReady()
app.mount('#vms-parts-review')
