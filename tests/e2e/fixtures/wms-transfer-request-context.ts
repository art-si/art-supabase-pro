import { createApp, getCurrentInstance, h, KeepAlive, ref, watch, type VNode } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import { writePlatformTenantScopeActive } from '@/utils/tenant-scope-context'
import { isPlainObjectRecord } from '@/utils/type-guards'
import ArtForm from '@/components/core/forms/art-form/index.vue'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import TransferRequestDrawer from '@wms/views/transfer-business/transfer-request/modules/transfer-request-drawer.vue'
import { transferContextIds as ids } from './wms-transfer-request-context-data'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const entry = params.get('entry')
const mode = entry === 'copy' || entry === 'view' || entry === 'create' ? entry : 'edit'
const drawer = ref<InstanceType<typeof TransferRequestDrawer>>()
const successes = ref(0)
const user = useUserStore(store)
user.setUserInfo({ userId: ids.user, tenantId: ids.tenant, platformSuper: params.has('platform') })
const permissions = (params.get('permissions') || 'View,Create,Edit,Copy,Import').split(',')
const setPermissions = (actions: string[]) =>
  useMenuStore(store).setButtonList(
    actions.map((action) => ({
      name: `WmsTransfer:${action}`,
      path: '',
      type: 'button',
      meta: { title: action }
    }))
  )
setPermissions(permissions)
const tenantScope = useTenantScopeStore(store)
tenantScope.scopeOwnerUserId = ids.user
tenantScope.tenantOptions = [
  { id: ids.tenant, tenantCode: 'A', tenantName: '合成租户 A' },
  { id: ids.tenantB, tenantCode: 'B', tenantName: '合成租户 B' }
]
tenantScope.selectedTenantId = null
writePlatformTenantScopeActive(params.has('platform'))
if (params.has('selectedScope')) tenantScope.setTenantScope(ids.tenant)
const page = {
  path: '/wms/transfer-business/transfer-request',
  name: 'WmsTransfer',
  component: {
    render: () => h(TransferRequestDrawer, { ref: drawer, onSuccess: () => successes.value++ })
  }
}
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: page.path },
    page,
    { path: '/away', component: { render: () => h('p', '已离开调拨申请页面') } }
  ]
})
const open = (documentId: string) =>
  drawer.value?.handleOpen({
    mode,
    tenantId: ids.tenant,
    documentId: mode === 'create' ? undefined : documentId,
    importIntent: params.has('importIntent')
  })
const controls = [
  ['open-a', '打开申请 A', () => void open(ids.documentA)],
  ['open-b', '打开申请 B', () => void open(ids.documentB)],
  ['revoke', '撤销当前操作权限', () => setPermissions(['View'])],
  ['scope', '切换租户范围', () => tenantScope.setTenantScope(ids.tenantB)],
  [
    'actor',
    '更新认证租户',
    () => user.setUserInfo({ ...user.getUserInfo, tenantId: ids.actorTenantC })
  ],
  ['demote', '取消平台能力', () => user.setUserInfo({ ...user.getUserInfo, platformSuper: false })],
  ['away', '离开页面', () => void router.push('/away')],
  ['back', '返回页面', () => void router.push(page.path)]
] as const
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'art-page-view h-screen p-4' }, [
        ...controls.map(([id, label, click]) =>
          h('button', { type: 'button', 'data-testid': `transfer-${id}`, onClick: click }, label)
        ),
        h('output', { hidden: true, 'data-testid': 'transfer-successes' }, successes.value),
        h(
          'output',
          { hidden: true, 'data-testid': 'transfer-effective-scope' },
          String(tenantScope.effectiveTenantId)
        ),
        h(
          'output',
          { hidden: true, 'data-testid': 'transfer-scope-revision' },
          String(tenantScope.revision)
        ),
        h(RouterView, null, {
          default: ({ Component }: { Component?: VNode }) =>
            h(KeepAlive, null, { default: () => Component })
        })
      ])
    )
})

if (params.has('deferHeader') || params.has('deferTable')) {
  let hold = true
  const augmentedColumns = new WeakSet<object>()
  const wait = () => {
    document.documentElement.dataset.transferValidation = 'pending'
    return new Promise<void>((resolve) =>
      document.addEventListener(
        'transfer-validation-result',
        () => {
          document.documentElement.dataset.transferValidation = 'resolved'
          resolve()
        },
        { once: true }
      )
    )
  }
  app.mixin({
    beforeMount() {
      const instance = getCurrentInstance()
      if (!instance) return
      if (params.has('deferHeader') && instance.type === ArtForm) {
        const rules: unknown = instance.props.rules
        if (!isPlainObjectRecord(rules) || !rules.organizationId) return
        const previous: unknown = rules.organizationId
        rules.organizationId = [
          ...(Array.isArray(previous) ? previous : [previous]),
          {
            trigger: 'submit',
            validator: async () => {
              if (hold) {
                hold = false
                await wait()
              }
            }
          }
        ]
      }
      if (params.has('deferTable') && instance.type === ArtTable) {
        watch(
          () => instance.props.columns,
          (columns: unknown) => {
            if (!Array.isArray(columns)) return
            const quantity = columns.find(
              (column: unknown): column is Record<string, unknown> =>
                isPlainObjectRecord(column) && column.prop === 'quantity'
            )
            if (!quantity || augmentedColumns.has(quantity)) return
            augmentedColumns.add(quantity)
            const previous: unknown = quantity.rules
            quantity.rules = [
              ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
              {
                validator: async () => {
                  if (hold) {
                    hold = false
                    await wait()
                  }
                  return true
                }
              }
            ]
          },
          { immediate: true, flush: 'sync' }
        )
      }
    }
  })
}
app.use(store)
app.use(router)
app.use(language)
const dictionary = (code: string, value: string, label: string) => ({
  code,
  name: label,
  value,
  label,
  status: '1'
})
user.setDictMap({
  wmsCountStockType: [dictionary('wmsCountStockType', 'normal', '普通')],
  wmsInitialStockType: [dictionary('wmsInitialStockType', 'normal', '普通')],
  wmsStockStatus: [dictionary('wmsStockStatus', 'available', '可用')],
  mdmBusinessOwnerType: [dictionary('mdmBusinessOwnerType', 'self', '自有')]
})
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
setupGlobDirectives(app)
await router.isReady()
app.mount('#wms-transfer-context')
