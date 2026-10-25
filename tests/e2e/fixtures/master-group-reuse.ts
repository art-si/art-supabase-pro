import { createApp, h, ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import MasterGroupPanel from '@/components/business/master-group-panel/index.vue'
import type { MasterGroup } from '@/api/master-groups'
import Supplier from '@mdm/views/purchase-master/supplier/index.vue'
import OperationalMaster from '@mdm/views/components/operational-master/index.vue'
import ProcessRoute from '@mdm/views/process-master/process-route/index.vue'
import Customer from '@tms/views/basic-data/customer/index.vue'
import Cargo from '@tms/views/basic-data/cargo/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const mode = params.get('mode') || 'panel'
const pages = {
  supplier: { component: Supplier, path: '/mdm/purchase-master/supplier' },
  project: { component: OperationalMaster, path: '/mdm/sales-master/project' },
  operation: { component: OperationalMaster, path: '/mdm/process-master/operation' },
  formula: { component: OperationalMaster, path: '/mdm/process-master/activity-formula' },
  control: { component: OperationalMaster, path: '/mdm/process-master/operation-control-code' },
  workstation: { component: OperationalMaster, path: '/mdm/process-master/workstation' },
  route: { component: ProcessRoute, path: '/mdm/process-master/process-route' },
  customer: { component: Customer, path: '/tms/basic-data/customer' },
  cargo: { component: Cargo, path: '/tms/basic-data/cargo' }
}
const activePage = Object.entries(pages).find(([key]) => key === mode)?.[1]
const selectedId = ref('')
const state = ref('success')
const lastAction = ref('')
const readonly = ref(false)
const isNarrow = useMediaQuery('(max-width: 900px)')
const groups: MasterGroup[] = Array.from({ length: 24 }, (_, index) => ({
  id: `group-${index}`,
  tenantId: '11111111-1111-4111-8111-111111111111',
  domain: 'material',
  parentId: index === 1 ? 'group-0' : null,
  code: `G${String(index).padStart(2, '0')}`,
  name: index === 1 ? '下级测试分组' : `测试分组 ${index}`,
  enabled: true,
  sort: index,
  remark: ''
}))
useUserStore(store).setUserInfo({
  userId: 'master-group-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'MdmPurchaseSupplier',
    'MdmSalesProject',
    'MdmOperationSet',
    'MdmActivityFormula',
    'MdmOperationControlCode',
    'MdmWorkstation',
    'MdmProcessRoute',
    'TmsCustomer',
    'TmsCargo',
    'FixtureGroup'
  ]
    .flatMap((name) => [`${name}:View`, `${name}:ManageGroup`, `${name}:Delete`])
    .map((name) => ({ name, path: '', type: 'button', meta: { title: '测试权限' } }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/mdm/process-master/process-route',
      name: 'MdmProcessRoute',
      component: { template: '<div />' }
    },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        { class: 'art-page-view p-4', style: '--art-full-height: calc(100dvh - 32px)' },
        activePage
          ? h(activePage.component)
          : [
              h('nav', { class: 'flex flex-wrap gap-2 mb-4', 'aria-label': '测试状态' }, [
                ...['success', 'empty', 'error', 'loading'].map((value) =>
                  h('button', { type: 'button', onClick: () => (state.value = value) }, value)
                ),
                h(
                  'button',
                  { type: 'button', onClick: () => (readonly.value = !readonly.value) },
                  '只读切换'
                )
              ]),
              h(
                'div',
                { style: { height: isNarrow.value ? 'auto' : '520px' } },
                h(MasterGroupPanel, {
                  title: '物料分组',
                  groups: state.value === 'empty' ? [] : groups,
                  selectedId: selectedId.value,
                  loading: state.value === 'loading',
                  error: state.value === 'error' ? '分组服务暂不可用，请重试' : '',
                  managePermission: readonly.value ? undefined : 'FixtureGroup:ManageGroup',
                  onSelect: (id: string) => (selectedId.value = id),
                  onRefresh: () => {
                    state.value = 'success'
                    lastAction.value = '刷新'
                  },
                  onAdd: (row?: MasterGroup) =>
                    (lastAction.value = row ? `新增下级：${row.name}` : '新增分组'),
                  onEdit: (row: MasterGroup) => (lastAction.value = `编辑：${row.name}`),
                  onRemove: (row: MasterGroup) => (lastAction.value = `删除：${row.name}`)
                })
              ),
              h(
                'output',
                { 'data-testid': 'group-action', 'aria-live': 'polite' },
                lastAction.value
              )
            ]
      )
    )
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push(activePage?.path || '/')
app.mount('#master-group-preview')
