import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import RouteCard from '@tms/views/in-transit-monitor/modules/monitor-route-card.vue'
import DetailPanel from '@tms/views/in-transit-monitor/modules/monitor-detail-panel.vue'
import RealtimePanel from '@tms/views/in-transit-monitor/modules/realtime-monitor-panel.vue'
import WaybillPanel from '@tms/views/in-transit-monitor/modules/waybill-monitor-panel.vue'
import VehiclePanel from '@tms/views/in-transit-monitor/modules/vehicle-monitor-panel.vue'
import MonitorPage from '@tms/views/in-transit-monitor/index.vue'
import { useMonitorOrders } from '@tms/views/in-transit-monitor/modules/use-monitor-orders'
import type {
  InTransitRecord,
  MonitorMode,
  ScreenState
} from '@tms/views/in-transit-monitor/modules/monitor-types'
import '@tms/views/in-transit-monitor/modules/in-transit-monitor.scss'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const panel = new URLSearchParams(location.search).get('panel')
const time =
  mode === 'empty'
    ? null
    : mode === 'invalid'
      ? 'invalid'
      : mode === 'time-only'
        ? '12:34'
        : '2026-10-09T12:34:56+08:00'
const app = createApp({
  setup() {
    if (new URLSearchParams(location.search).has('root')) return () => h(MonitorPage)
    const telemetry: InTransitRecord = {
      waybillNo: '定位验收运单',
      status: 'transporting',
      originCity: '未知始发地',
      destinationCity: '未知目的地',
      vehicle: { id: 'telemetry-vehicle', plateNo: '沪A测试' },
      ...(mode === 'telemetry-real' || mode === 'telemetry-zero'
        ? {
            currentLongitude: mode === 'telemetry-zero' ? 0 : 120,
            currentLatitude: mode === 'telemetry-zero' ? 0 : 30,
            speedKmh: mode === 'telemetry-zero' ? 0 : 73,
            shipperLongitude: 119,
            shipperLatitude: 30,
            receiverLongitude: 121,
            receiverLatitude: 30,
            plannedLoadTime: '2026-10-10T00:00:00Z',
            plannedUnloadTime: '2026-10-10T12:00:00Z'
          }
        : {})
    }
    const screen: ScreenState = {
      error: null,
      keyword: '',
      loading: false,
      loaded: true,
      region: '',
      status: '',
      orders: mode?.startsWith('telemetry-')
        ? mode === 'telemetry-arrivals'
          ? [
              telemetry,
              {
                waybillNo: '准时到达',
                status: 'completed',
                plannedUnloadTime: '2026-10-10T12:00:00Z',
                unloadedAt: '2026-10-10T11:00:00Z'
              },
              {
                waybillNo: '超时到达',
                status: 'completed',
                plannedUnloadTime: '2026-10-10T12:00:00Z',
                unloadedAt: '2026-10-10T13:00:00Z'
              }
            ]
          : [telemetry]
        : [
            {
              waybillNo: '日期验收运单',
              originCity: '上海',
              destinationCity: '北京',
              plannedLoadTime: time,
              plannedUnloadTime: time
            }
          ]
    }
    const { monitorOrders, overview } = useMonitorOrders({
      activeMode: ref<MonitorMode>('realtime'),
      drivingRoutePaths: new Map(),
      getDictOptions: () => [],
      screen
    })
    return () =>
      h(
        'main',
        { class: 'transit-screen p-4', style: { position: 'relative', overflow: 'visible' } },
        [
          h('div', { class: 'max-w-xl mx-auto' }, [
            h(
              'output',
              { hidden: true, 'data-testid': 'telemetry-model' },
              JSON.stringify({ order: monitorOrders.value[0], overview: overview.value })
            ),
            ...(panel
              ? [
                  h('section', { class: 'h-[780px]' }, [
                    panel === 'realtime'
                      ? h(RealtimePanel, {
                          keyword: '',
                          status: '',
                          region: '',
                          orders: monitorOrders.value,
                          overview: overview.value,
                          regionOptions: [],
                          statusOptions: [],
                          totalCount: monitorOrders.value.length,
                          getPoiText: () => '定位验收',
                          isPoiLoading: () => false
                        })
                      : h(panel === 'vehicle' ? VehiclePanel : WaybillPanel, {
                          keyword: '',
                          orders: monitorOrders.value,
                          overview: overview.value
                        })
                  ])
                ]
              : [
                  h(RouteCard, { order: monitorOrders.value[0] }),
                  h('section', { class: 'mt-4 h-[680px]' }, [
                    h(DetailPanel, { order: monitorOrders.value[0] })
                  ])
                ])
          ])
        ]
      )
  }
})
app.use(createPinia()).use(i18n)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }]
  })
)
setupGlobDirectives(app)
app.mount('#app')
