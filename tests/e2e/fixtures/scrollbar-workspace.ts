import { createApp, defineComponent, h, ref, type Component } from 'vue'
import { ElSelect, ElOption, ElTreeSelect } from 'element-plus'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { useMenuStore } from '@/store/modules/menu'
import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
import AppLayout from '@/views/index/index.vue'
import InsuranceCompany from '../../../modules/art-supabase-vms/src/views/basic-info/insurance-company/index.vue'
import Supplier from '../../../modules/art-supabase-vms/src/views/basic-info/supplier/index.vue'
import PartsCategoryTree from '../../../modules/art-supabase-vms/src/views/basic-info/parts-category/modules/parts-category-tree.vue'
import PartsCategory from '../../../modules/art-supabase-vms/src/views/basic-info/parts-category/index.vue'
import SupplierDialog from '../../../modules/art-supabase-vms/src/views/basic-info/supplier/modules/supplier-dialog.vue'
import { EDITABLE_SUPPLIER_ACCESS } from '../../../modules/art-supabase-vms/src/views/basic-info/supplier/modules/supplier-model'
import InsuranceCompanyDialog from '../../../modules/art-supabase-vms/src/views/basic-info/insurance-company/modules/insurance-company-dialog.vue'
import PartsDialog from '../../../modules/art-supabase-vms/src/views/basic-info/parts/modules/parts-dialog.vue'
import Parts from '../../../modules/art-supabase-vms/src/views/basic-info/parts/index.vue'
import FavoriteRoute from '../../../modules/art-supabase-tms/src/views/basic-data/favorite-route/index.vue'
import CarrierPrice from '../../../modules/art-supabase-tms/src/views/basic-data/carrier-price/index.vue'
import Contract from '../../../modules/art-supabase-tms/src/views/basic-data/contract/index.vue'
import Cargo from '../../../modules/art-supabase-tms/src/views/basic-data/cargo/index.vue'
import Driver from '../../../modules/art-supabase-tms/src/views/basic-data/driver/index.vue'
import Carrier from '../../../modules/art-supabase-tms/src/views/basic-data/carrier/index.vue'
import CustomerAddress from '../../../modules/art-supabase-tms/src/views/basic-data/customer-address/index.vue'
import ShippingNotice from '../../../modules/art-supabase-scm/src/views/sales-management/shipping-notice/index.vue'
import MovementType from '../../../modules/art-supabase-mdm/src/views/inventory-master/movement-type/index.vue'
import FavoriteRouteDialog from '../../../modules/art-supabase-tms/src/views/basic-data/favorite-route/modules/favorite-route-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const workspace = defineComponent({
  setup() {
    const selected = ref('0')
    const tree = ref('0')
    const focus = ref(false)
    const deletedRow = ref('')
    const dialog = ref<InstanceType<typeof FavoriteRouteDialog>>()
    const records = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      name: `线路 ${i + 1}`,
      description: '长地址及业务数据用于滚动验证'
    }))
    return () =>
      h('main', {}, [
        h('div', { class: 'business-workspace-page art-full-height' }, [
          h('output', { 'data-testid': 'deleted-row', hidden: true }, deletedRow.value),
          h(
            BusinessWorkspaceHeader,
            {
              title: '常用线路布局验收',
              description: '普通模式、滚动条与操作列',
              icon: 'ri:route-line',
              density: 'compact'
            },
            {
              actions: () => [
                h('button', { onClick: () => (focus.value = !focus.value) }, '切换专注模式'),
                h('button', { onClick: () => dialog.value?.handleOpen() }, '打开地址表单')
              ]
            }
          ),
          h('div', { class: 'flex gap-4', style: { flex: '0 0 auto' } }, [
            h(
              ElSelect,
              {
                modelValue: selected.value,
                'onUpdate:modelValue': (value: string) => (selected.value = value),
                placeholder: '普通下拉',
                style: { width: '260px' }
              },
              { default: () => records.map((r) => h(ElOption, { label: r.name, value: r.id })) }
            ),
            h(ElTreeSelect, {
              modelValue: tree.value,
              'onUpdate:modelValue': (value: string) => (tree.value = value),
              data: records.map((r) => ({ value: r.id, label: r.name })),
              placeholder: '树形下拉',
              style: { width: '260px' }
            })
          ]),
          h(ArtTableQuery, {
            data: records,
            focusable: true,
            focusMode: focus.value,
            'onUpdate:focusMode': (value: boolean) => (focus.value = value),
            showTableHeader: false,
            headerActions: [
              {
                type: 'delete',
                label: '批量删除',
                permission: 'TmsFavoriteRoute:Delete',
                confirm: false,
                onClick: async ({ selectedRows }) => {
                  deletedRow.value = String(selectedRows[0]?.id)
                }
              }
            ],
            pagination: { current: 1, size: 50, total: 40 },
            tableColumns: [
              { prop: 'name', label: '线路名称', width: 200 },
              ...Array.from({ length: 8 }, (_, i) => ({
                prop: 'description',
                label: `地址信息 ${i + 1}`,
                width: 240
              })),
              {
                prop: 'operation',
                label: '操作',
                width: 120,
                fixed: 'right',
                formatter: (row) =>
                  h(
                    BusinessTableRowActions,
                    { row },
                    {
                      default: () =>
                        h('div', {}, [
                          ...['edit', 'delete', 'view'].map((type) => h(ArtButtonTable, { type })),
                          h(ArtButtonMore, {
                            trigger: 'click',
                            onClick: () => {
                              deletedRow.value = String(row.id)
                            },
                            list: [{ key: 'delete', label: '删除' }]
                          })
                        ])
                    }
                  )
              }
            ]
          })
        ]),
        h(FavoriteRouteDialog, { ref: dialog })
      ])
  }
})
const treeWorkspace = defineComponent({
  setup() {
    const visible = ref(true)
    return () =>
      h('main', { class: 'grid gap-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              visible.value = false
            }
          },
          '离开类别树'
        ),
        visible.value ? h('section', { style: 'height: 400px' }, [h(PartsCategoryTree)]) : null
      ])
  }
})
const formWorkspace = defineComponent({
  setup() {
    const supplier = ref<InstanceType<typeof SupplierDialog>>()
    const insurance = ref<InstanceType<typeof InsuranceCompanyDialog>>()
    const parts = ref<InstanceType<typeof PartsDialog>>()
    const common = {
      id: '00000000-0000-4000-a000-000000000001',
      tenantId: '11111111-1111-4111-a111-111111111111',
      remark: '编辑记录备注',
      status: '1' as const
    }
    return () =>
      h('main', { class: 'flex flex-wrap gap-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              supplier.value?.handleOpen({
                ...common,
                supplierName: '测试供应厂商',
                fieldAccess:
                  new URLSearchParams(location.search).get('restricted') === 'true'
                    ? {}
                    : EDITABLE_SUPPLIER_ACCESS,
                contactPerson: '测试联系人'
              })
          },
          '编辑供应厂商'
        ),
        h(
          'button',
          { type: 'button', onClick: () => supplier.value?.handleOpen() },
          '新增供应厂商'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              insurance.value?.handleOpen({
                ...common,
                companyName: '测试保险公司',
                contactPerson: '测试联系人'
              })
          },
          '编辑保险公司'
        ),
        h(
          'button',
          { type: 'button', onClick: () => insurance.value?.handleOpen() },
          '新增保险公司'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              parts.value?.handleOpen({ ...common, partName: '测试零部件', partCode: 'BJ-001' })
          },
          '编辑零部件'
        ),
        h('button', { type: 'button', onClick: () => parts.value?.handleOpen() }, '新增零部件'),
        h(SupplierDialog, { ref: supplier }),
        h(InsuranceCompanyDialog, { ref: insurance }),
        h(PartsDialog, { ref: parts })
      ])
  }
})
const pages: Record<string, Component> = {
  'movement-type': MovementType,
  'parts-category': PartsCategory,
  shipping: ShippingNotice,
  'carrier-price': CarrierPrice,
  contract: Contract,
  cargo: Cargo,
  driver: Driver,
  carrier: Carrier,
  'customer-address': CustomerAddress,
  'favorite-route': FavoriteRoute,
  'insurance-company': InsuranceCompany,
  supplier: Supplier,
  parts: Parts,
  'form-reuse': formWorkspace,
  'category-tree': treeWorkspace
}
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name:
            new URLSearchParams(location.search).get('page') === 'movement-type'
              ? 'MdmStockMovementType'
              : 'ScrollbarWorkspace',
          component: pages[new URLSearchParams(location.search).get('page') ?? ''] ?? workspace
        }
      ]
    }
  ]
})
const app = createApp({ render: () => h(RouterView) })
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
const scopeQuery = new URLSearchParams(location.search)
useUserStore(store).setUserInfo({
  userId: 'test',
  tenantId: '11111111-1111-4111-a111-111111111111',
  platformSuper: scopeQuery.get('ordinary') !== 'true',
  buttons: ['TmsFavoriteRoute:Add', 'PartsCategory:Add']
})
useMenuStore(store).setButtonList(
  [
    'TmsFavoriteRoute:Add',
    'PartsCategory:Add',
    ...(scopeQuery.get('governedDelete') === 'true'
      ? [
          'TmsCargo:Delete',
          'TmsCustomerAddress:Delete',
          'TmsDriver:Delete',
          'TmsCarrier:Delete',
          'MdmStockMovementType:View',
          'MdmStockMovementType:Delete'
        ]
      : [])
  ].map((name) => ({
    name,
    path: name,
    type: 'button',
    meta: { title: name }
  }))
)
if (scopeQuery.get('governedDelete') === 'true') {
  document.addEventListener('revoke-governed-delete', () => {
    useMenuStore(store).setButtonList([])
  })
}
const requestedTenant = scopeQuery.get('tenant')
if (requestedTenant) {
  const tenantScope = useTenantScopeStore(store)
  tenantScope.scopeOwnerUserId = 'test'
  tenantScope.tenantOptions = [
    { id: requestedTenant, tenantName: '测试指定租户', tenantCode: 'scope-test' }
  ]
  tenantScope.setTenantScope(requestedTenant)
  // 模拟普通用户篡改持久化状态；effectiveTenantId 必须仍由认证用户解析。
  if (scopeQuery.get('ordinary') === 'true') tenantScope.selectedTenantId = requestedTenant
}
useSettingStore(store).showSettingGuide = false
await router.isReady()
app.mount('#scrollbar-workspace')
