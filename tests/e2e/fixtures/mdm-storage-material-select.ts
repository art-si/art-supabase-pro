import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import BinDialog from '@mdm/views/inventory/storage/modules/bin-dialog.vue'
import ReservationDialog from '@mdm/views/inventory/storage/modules/reservation-dialog.vue'
import SerialDialog from '@mdm/views/inventory/storage/modules/serial-dialog.vue'
import InventoryMovementDialog from '@mdm/views/inventory/storage/modules/inventory-movement-dialog.vue'
import type { StorageWarehouse } from '@mdm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const warehouse = {
  id: 'source-warehouse',
  tenantId,
  warehouseCode: 'SRC',
  warehouseName: '原料仓',
  warehouseType: 'raw',
  businessScopes: ['picking'],
  enableLocations: false,
  enableZones: false,
  status: 'enabled'
} as StorageWarehouse
const binRef = ref<InstanceType<typeof BinDialog>>()
const reservationRef = ref<InstanceType<typeof ReservationDialog>>()
const serialRef = ref<InstanceType<typeof SerialDialog>>()
const movementRef = ref<InstanceType<typeof InventoryMovementDialog>>()

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { padding: '16px' } }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => void binRef.value?.handleOpen({ warehouse, zone: null, bins: [] })
        },
        '新增库位'
      ),
      h(
        'button',
        { type: 'button', onClick: () => void reservationRef.value?.handleOpen({ warehouse }) },
        '新增预留'
      ),
      h(
        'button',
        { type: 'button', onClick: () => void serialRef.value?.handleOpen({ warehouse }) },
        '新增序列号'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            void movementRef.value?.handleOpen('production_in', {
              warehouseId: warehouse.id,
              tenantId,
              label: warehouse.warehouseName
            })
        },
        '生产入库'
      ),
      h(BinDialog, { ref: binRef }),
      h(ReservationDialog, { ref: reservationRef }),
      h(SerialDialog, { ref: serialRef }),
      h(InventoryMovementDialog, { ref: movementRef })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'storage-material-test', tenantId, platformSuper: false })
await router.push('/')
await router.isReady()
app.mount('#app')
