import { createApp, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Supplier from '@mdm/views/purchase-master/supplier/modules/supplier-detail.vue'
import Service from '@hr/views/operations/self-service/modules/service-request-drawer.vue'
import type { PurchaseSupplier } from '@mdm/api'
import { getProcessRouteSequenceLabel } from '@mdm/domain/process-route-display'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const userStore = useUserStore(store)
userStore.setUserInfo({ userId: 'dictionary-test', tenantId: 'test-tenant', platformSuper: false })
userStore.setDictMap({
  mdmProcessRouteSequenceType: [
    { label: '配置的并行序列', value: 'parallel' },
    { label: '', name: '备用序列名称', value: 'named' }
  ],
  labelContract: [
    { label: '已配置标签', name: '备用名称', value: 'known' },
    { label: '', name: '空标签名称', value: 'blank' },
    { label: '零值标签', value: '0' }
  ],
  supplierCategory: [{ label: '测试供应商类别', value: 'known' }],
  hrServiceRequestStatus: [{ label: '测试工单状态', value: 'draft' }],
  hrServicePriority: [{ label: '测试优先级', value: 'high' }]
})
const supplier: PurchaseSupplier = {
  id: 'supplier-test',
  tenantId: 'test-tenant',
  supplierCode: 'SUP-001',
  supplierName: '字典复用测试供应商',
  supplierCategory: 'known',
  supplierType: 'unknown-type',
  supplierGroup: null,
  groupId: null,
  enterpriseNature: null,
  industry: null,
  contactPerson: null,
  contactPhone: null,
  region: null,
  regionAdcode: null,
  addressDetail: null,
  longitude: null,
  latitude: null,
  coordinateSystem: 'wgs84',
  remark: null,
  updateTime: '2026-10-09'
}
const app = createApp({
  setup() {
    const supplierRef = shallowRef<InstanceType<typeof Supplier>>()
    const serviceRef = shallowRef<InstanceType<typeof Service>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'pre',
          { 'data-testid': 'sequence-label-contract', class: 'whitespace-pre-wrap break-all' },
          JSON.stringify({
            main: getProcessRouteSequenceLabel('main'),
            parallel: getProcessRouteSequenceLabel('parallel'),
            named: getProcessRouteSequenceLabel('named'),
            unknown: getProcessRouteSequenceLabel('future'),
            null: getProcessRouteSequenceLabel(null),
            empty: getProcessRouteSequenceLabel(''),
            absent: getProcessRouteSequenceLabel(undefined),
            routeEmpty: getProcessRouteSequenceLabel(undefined, '')
          })
        ),
        h(
          'pre',
          {
            'data-testid': 'label-contract',
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
          },
          JSON.stringify({
            known: userStore.getDictLabelByValue('labelContract', 'known', '缺失'),
            unknown: userStore.getDictLabelByValue('labelContract', 'unknown', '未知回退'),
            blank: userStore.getDictLabelByValue('labelContract', 'blank', '缺失'),
            zero: userStore.getDictLabelByValue('labelContract', 0, '缺失'),
            null: userStore.getDictLabelByValue('labelContract', null, '空值回退'),
            absent: userStore.getDictLabelByValue('labelContract', undefined, '空值回退'),
            legacy: userStore.getDictLabelByValue('labelContract', 'unknown')
          })
        ),
        h(
          'pre',
          { 'data-testid': 'display-label-contract', class: 'whitespace-pre-wrap break-all' },
          JSON.stringify({
            known: userStore.getDictDisplayLabelByValue('labelContract', 'known'),
            blank: userStore.getDictDisplayLabelByValue('labelContract', 'blank'),
            unknown: userStore.getDictDisplayLabelByValue('labelContract', 'unknown'),
            zero: userStore.getDictDisplayLabelByValue('labelContract', 0),
            null: userStore.getDictDisplayLabelByValue('labelContract', null, '—'),
            absent: userStore.getDictDisplayLabelByValue('labelContract', undefined, '—'),
            empty: userStore.getDictDisplayLabelByValue('labelContract', '', '—')
          })
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              userStore.setDictMap({
                ...userStore.getDictMap,
                mdmProcessRouteSequenceType: [{ label: '配置的标准序列', value: 'main' }],
                labelContract: [{ label: '更新标签', value: 'known' }]
              })
          },
          '更新字典标签'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              mode === 'supplier'
                ? void supplierRef.value?.handleOpen(supplier)
                : void serviceRef.value?.handleOpen('service-test')
          },
          '打开业务详情'
        ),
        mode === 'supplier'
          ? h(Supplier, { ref: supplierRef, groups: [] })
          : h(Service, { ref: serviceRef })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#dictionary-label-reuse')
