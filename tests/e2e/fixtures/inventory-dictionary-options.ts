import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import type { StorageWarehouse } from '@mdm/api'
import WarehouseDialog from '@mdm/views/inventory-master/warehouse-definition/modules/warehouse-dialog.vue'
import ZoneDialog from '@mdm/views/inventory/storage/modules/zone-dialog.vue'
import BinDialog from '@mdm/views/inventory/storage/modules/bin-dialog.vue'
import SerialDialog from '@mdm/views/inventory/storage/modules/serial-dialog.vue'
import SerialPage from '@mdm/views/inventory-master/serial/index.vue'
import ReservationPage from '@mdm/views/inventory-master/reservation/index.vue'
import ArtSearchBar from '@/components/core/forms/art-search-bar/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
document.documentElement.classList.toggle(
  'dark',
  new URLSearchParams(location.search).get('theme') === 'dark'
)
document.documentElement.dataset.boxMode =
  new URLSearchParams(location.search).get('box') ?? 'border-mode'
const warehouse: StorageWarehouse = {
  id: 'warehouse-test',
  tenantId: 'test-tenant',
  warehouseCode: 'WH-TEST',
  warehouseName: '公共字典测试仓库',
  warehouseType: 'raw_material',
  businessScopes: ['picking'],
  enableLocations: true,
  enableZones: true,
  singleSkuPerBin: false,
  status: 'enabled'
}
const warehouseRef = ref<InstanceType<typeof WarehouseDialog>>()
const zoneRef = ref<InstanceType<typeof ZoneDialog>>()
const binRef = ref<InstanceType<typeof BinDialog>>()
const serialRef = ref<InstanceType<typeof SerialDialog>>()
const searchModels = [
  ref({ first: '', second: '', third: '' }),
  ref({ first: '', second: '', third: '' })
]
const submitted = ref('')
const searchContract = () =>
  [false, true].map((showExpand, index) =>
    h(
      'section',
      {
        'data-testid': showExpand ? 'expandable-search' : 'complete-search',
        class: 'mb-4'
      },
      [
        h('h2', { class: 'mb-2' }, showExpand ? '允许折叠的筛选' : '隐藏展开按钮的筛选'),
        h(ArtSearchBar, {
          modelValue: searchModels[index].value,
          'onUpdate:modelValue': (value: Record<string, unknown>) =>
            Object.assign(searchModels[index].value, value),
          items: [
            { key: 'first', label: '筛选甲', type: 'input' },
            { key: 'second', label: '筛选乙', type: 'input' },
            { key: 'third', label: '筛选丙', type: 'input' }
          ],
          span: 8,
          showExpand,
          onSearch: (value: Record<string, unknown>) => {
            submitted.value = String(value.third ?? '')
          }
        })
      ]
    )
  )
const open = () => {
  if (mode === 'warehouse')
    void warehouseRef.value?.handleOpen({ tenantId: warehouse.tenantId, groups: [] })
  if (mode === 'zone') void zoneRef.value?.handleOpen({ warehouse })
  if (mode === 'bin') void binRef.value?.handleOpen({ warehouse, zone: null, bins: [] })
  if (mode === 'serial') void serialRef.value?.handleOpen({ warehouse })
}
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view h-screen p-4' },
      mode === 'search-contract'
        ? [...searchContract(), h('output', { 'data-testid': 'submitted-filter' }, submitted.value)]
        : mode === 'serial-list'
          ? [h(SerialPage)]
          : mode === 'reservation-list'
            ? [h(ReservationPage)]
            : [
                h('button', { type: 'button', onClick: open }, '打开表单'),
                mode === 'warehouse'
                  ? h(WarehouseDialog, { ref: warehouseRef })
                  : mode === 'zone'
                    ? h(ZoneDialog, { ref: zoneRef })
                    : mode === 'bin'
                      ? h(BinDialog, { ref: binRef })
                      : h(SerialDialog, { ref: serialRef })
              ]
    )
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'inventory-dictionary-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['MdmInventorySerial', 'MdmInventoryReservation'].map((name) => ({
    name: `${name}:View`,
    path: '',
    type: 'button',
    meta: { title: '查看测试数据' }
  }))
)
app.mount('#inventory-dictionary-options')
