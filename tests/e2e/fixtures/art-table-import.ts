import { createApp, h } from 'vue'
import { ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { useSupabase } from '@/hooks/core/useSupabase'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import ArtTableQuery, {
  type ArtTableQueryHeaderAction
} from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(window.location.search).get('mode')
const revokePermission = mode === 'revoke-permission'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
useUserStore(store).setUserInfo({
  userId: 'import-test-user',
  tenantId: tenantA,
  platformSuper: !revokePermission
})
if (revokePermission) {
  useMenuStore(store).setButtonList([
    {
      name: 'TmsContract:Import',
      path: '',
      type: 'button',
      meta: { title: '导入合同' }
    }
  ])
}
const tenantScope = useTenantScopeStore(store)
tenantScope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '测试租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '测试租户 B' }
]
tenantScope.selectedTenantId = tenantA
const importAction: ArtTableQueryHeaderAction = {
  key: revokePermission ? undefined : 'import-preview',
  type: 'import',
  label: '导入测试数据',
  importColumns: [{ key: 'name', title: '名称', required: true }],
  importApi: async (rows) => {
    document.body.dataset.receivedRows = String(rows.length)
    document.body.dataset.receivedRecords = JSON.stringify(rows)
    document.body.dataset.receivedTenant = tenantScope.effectiveTenantId ?? 'all'
    if (mode === 'reject') {
      await new Promise<void>((resolve) => {
        document.addEventListener('release-import', () => resolve(), { once: true })
      })
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 300))
    }
    if (mode === 'reject') throw new Error('请先在顶部选择导入目标租户')
    if (mode === 'reported') {
      const { responseHandle } = useSupabase()
      await responseHandle(
        async () => ({ data: null, error: { code: '23514', message: '站点编码重复' } }),
        { showMessage: true, breakReturn: true }
      )
    }
  },
  onImportSuccess: () => {
    document.body.dataset.importStatus = 'success'
    ElMessage.success('导入成功')
  },
  onImportError: () => {
    document.body.dataset.importStatus = 'parse-error'
    ElMessage.error('导入文件解析失败')
  }
}

document.body.dataset.receivedRows = '0'
if (mode === 'records' || mode === 'records-invalid') {
  importAction.importRecordTransformer = (rows) => rows.map((row) => ({ ...row, remark: 'mapped' }))
} else if (mode === 'raw') {
  importAction.importTransformer = (rows) =>
    rows.map((row) => ({ name: row['名称'], remark: 'raw' }))
} else if (revokePermission) {
  importAction.importRecordTransformer = async (rows) => {
    document.body.dataset.transformStatus = 'pending'
    await new Promise<void>((resolve) => {
      document.addEventListener('release-transform', () => resolve(), { once: true })
    })
    document.body.dataset.transformStatus = 'released'
    return rows
  }
}

const app = createApp({
  render: () =>
    h('main', { class: 'p-6' }, [
      h('h1', { class: 'mb-4 text-xl' }, '表格导入反馈验收'),
      h(
        'button',
        {
          type: 'button',
          'data-testid': 'import-scope-b',
          onClick: () => tenantScope.setTenantScope(tenantB)
        },
        '切换到租户 B'
      ),
      ...(revokePermission
        ? [
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'revoke-import-permission',
                onClick: () => useMenuStore(store).setButtonList([])
              },
              '撤销导入权限'
            )
          ]
        : []),
      h(ArtTableQuery, {
        data: [],
        tableColumns: [{ prop: 'name', label: '名称' }],
        headerActions: [importAction],
        showSearchBar: false
      })
    ])
})
app.use(store)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    {
      path: '/tms/basic-data/contract',
      name: 'TmsContract',
      component: { template: '<div />' }
    }
  ]
})
app.use(router)
app.use(language)
setupGlobDirectives(app)
if (revokePermission) await router.push('/tms/basic-data/contract')
app.mount('#table-import-preview')
