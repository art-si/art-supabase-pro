import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElButton, ElConfigProvider, ElTableColumn } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { useTableColumns } from '@/hooks/core/useTableColumns'
import { invalidateTableColumnConfig } from '@/hooks/core/useConfiguredTableColumns'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import ColumnConfig from '@/views/system/column-config/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const parameters = new URLSearchParams(location.search)
const realPage = parameters.get('real')
const realPath =
  realPage === 'dict'
    ? '/data-center/dict'
    : realPage === 'receivable'
      ? '/fms/accounts-receivable/estimated-receivable'
      : '/system/user'
const realComponent =
  realPage === 'dict'
    ? (await import('@/views/data-center/dict/index.vue')).default
    : realPage === 'receivable'
      ? (await import('@fms/views/accounts-receivable/estimated-receivable/index.vue')).default
      : realPage === 'user'
        ? (await import('@/views/system/user/index.vue')).default
        : undefined
const runtimeRows = parameters.has('filters')
  ? [
      { name: 'Alpha', code: 'A', amount: 0, createTime: '2026-10-23 12:00:00' },
      { name: 'Beta', code: 'B', amount: 200, createTime: '2026-10-24 18:00:00' },
      { name: 'ALPINE', code: 'A', amount: 300, createTime: null }
    ]
  : [{ name: '测试业务记录', code: 'DEMO-001', amount: 128 }]
const runtimePage = defineComponent({
  setup() {
    const allowed = ref(true)
    const { columns } = useTableColumns(() => [
      { prop: 'name', label: '名称' },
      { prop: 'code', label: '编码' },
      ...(parameters.has('filters') ? [{ prop: 'createTime', label: '创建时间' }] : []),
      ...(allowed.value ? [{ prop: 'amount', label: '金额' }] : [])
    ])
    return () =>
      h('div', { class: 'h-full flex flex-col gap-4' }, [
        h('div', { class: 'flex gap-4' }, [
          h(ElButton, { onClick: invalidateTableColumnConfig }, () => '重新读取配置'),
          h(
            ElButton,
            {
              onClick: () => {
                allowed.value = false
              }
            },
            () => '撤销金额权限'
          )
        ]),
        parameters.has('slots')
          ? h(
              ArtTable,
              {
                data: runtimeRows,
                pagination: false
              },
              () => [
                h(ElTableColumn, { prop: 'name', label: '名称' }),
                h(ElTableColumn, { prop: 'code', label: '编码' }),
                ...(parameters.has('filters')
                  ? [h(ElTableColumn, { prop: 'createTime', label: '创建时间' })]
                  : []),
                ...(allowed.value ? [h(ElTableColumn, { prop: 'amount', label: '金额' })] : [])
              ]
            )
          : h(ArtTable, {
              data: runtimeRows,
              columns: columns.value,
              pagination: false
            })
      ])
  }
})
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
      h(ElConfigProvider, { locale: zhCn }, () => h(RouterView))
    ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/system/column-config', component: ColumnConfig },
    {
      path: '/system/user',
      component:
        realPage === 'user' && realComponent
          ? realComponent
          : parameters.has('picker')
            ? defineComponent({ ...runtimePage, name: 'ColumnPickerDialog' })
            : runtimePage
    },
    ...(realComponent && realPath !== '/system/user'
      ? [{ path: realPath, component: realComponent }]
      : [])
  ]
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'column-test-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: parameters.get('ordinary') !== '1'
})
useTenantScopeStore(store).selectedTenantId = null
const setting = useSettingStore(store)
const theme = parameters.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
setting.boxBorderMode = parameters.get('box') !== 'shadow'
document.documentElement.dataset.boxMode = setting.boxBorderMode ? 'border-mode' : 'shadow-mode'
initializeTheme()
await router.push(
  realComponent ? realPath : parameters.has('runtime') ? '/system/user' : '/system/column-config'
)
await router.isReady()
app.use(router)
app.mount('#app')
