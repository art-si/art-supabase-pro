import { createApp, h, ref, shallowRef } from 'vue'
import { createPinia } from 'pinia'
import language from '@/locales'
import RoutePanel from '@tms/views/waybill-management/detail/modules/waybill-route-panel.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

function waybill(id: string, empty = false): Api.Tms.Waybill.WaybillDetailRecord {
  return {
    id,
    tenantId: 'synthetic-tenant',
    waybillNo: `合成运单-${id}`,
    status: 'transporting',
    shipperLongitude: empty ? null : id === 'A' ? 120 : 122,
    shipperLatitude: empty ? null : 30,
    receiverLongitude: empty ? null : id === 'A' ? 121 : 123,
    receiverLatitude: empty ? null : 31,
    shipperAddress: '合成发货地址',
    receiverAddress: '合成收货地址',
    routePoints: [],
    pickupPhotos: [],
    deliveryPhotos: [],
    receiptAttachments: [],
    events: [],
    proofs: [],
    cargoOperations: [],
    costs: [],
    expenseLocations: [],
    createTime: '2026-10-22T00:00:00Z',
    updateTime: '2026-10-22T01:00:00Z'
  }
}

createApp({
  setup() {
    const record = shallowRef(waybill('A', new URLSearchParams(location.search).has('empty')))
    const visible = ref(true)
    return () =>
      h('main', { class: 'min-h-screen p-4' }, [
        h('div', { class: 'mb-4 flex flex-wrap gap-4' }, [
          h(
            'button',
            {
              onClick: () => {
                record.value = waybill('A')
              }
            },
            '运单一'
          ),
          h(
            'button',
            {
              onClick: () => {
                record.value = waybill('B')
              }
            },
            '运单二'
          ),
          h(
            'button',
            {
              onClick: () => {
                record.value = waybill('empty', true)
              }
            },
            '空定位运单'
          ),
          h(
            'button',
            {
              onClick: () => {
                record.value = { ...record.value, shipperLongitude: 125, receiverLongitude: 126 }
              }
            },
            '更新当前坐标'
          ),
          h(
            'button',
            {
              onClick: () => {
                record.value = { ...record.value, remark: '仅更新备注' }
              }
            },
            '更新备注'
          ),
          h(
            'button',
            {
              onClick: () => {
                record.value = {
                  ...record.value,
                  routePoints: [
                    {
                      longitude: 120,
                      latitude: 30,
                      capturedAt: '2026-10-22T00:00:00Z',
                      speedKmh: 30
                    },
                    {
                      longitude: 121,
                      latitude: 31,
                      capturedAt: '2026-10-22T00:10:00Z',
                      speedKmh: 30
                    }
                  ]
                }
              }
            },
            '装载实际轨迹'
          ),
          h(
            'button',
            {
              onClick: () => {
                visible.value = !visible.value
              }
            },
            visible.value ? '关闭轨迹' : '打开轨迹'
          )
        ]),
        visible.value ? h(RoutePanel, { waybill: record.value }) : null
      ])
  }
})
  .use(createPinia())
  .use(language)
  .mount('#app')
