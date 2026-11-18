import { createApp, h } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import Info from '@tms/views/waybill-management/detail/modules/waybill-info-panel.vue'
import Tracking from '@tms/views/waybill-management/detail/modules/waybill-tracking-panel.vue'
import Operation from '@tms/views/waybill-management/detail/modules/waybill-operation-panel.vue'
import Documents from '@tms/views/waybill-management/detail/modules/waybill-document-panel.vue'
import Fees from '@tms/views/waybill-management/detail/modules/waybill-fee-panel.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const mode = new URLSearchParams(location.search).get('mode')
const time =
  mode === 'empty'
    ? null
    : mode === 'invalid'
      ? 'invalid-date'
      : mode === 'time-only'
        ? '12:34'
        : '2026-10-09T12:34:56+08:00'
const waybill: Api.Tms.Waybill.WaybillDetailRecord = {
  id: 'date-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  waybillNo: '日期验收运单',
  status: 'transporting',
  routePoints: [],
  pickupPhotos: [],
  deliveryPhotos: [],
  receiptAttachments: [],
  events: [],
  cargoOperations: [],
  costs: [],
  expenseLocations: [],
  createTime: '2026-10-09T12:34:56+08:00',
  updateTime: '2026-10-09T12:34:56+08:00',
  plannedLoadTime: time,
  loadedAt: time,
  remainingDistanceKm: 0,
  proofs: [
    {
      id: 'proof',
      waybillId: 'date-test',
      proofType: 'loading',
      fileUrl: '/date-test.pdf',
      fileName: '日期验收文件.pdf',
      mimeType: 'application/pdf',
      uploadedAt: time,
      uploaderName:
        '装备制造与物流保障联合归档复核负责人（张明远 · EMP-DOCUMENT-2026-0000123456789）',
      remark:
        '装货现场说明：已逐项核对货物件数、包装与防护情况，并按车辆到场、装货及发车顺序保留原始凭证；本附件由装配事业部与物流保障联合复核，后续处理请对照运单与现场记录核验。凭证归档结束。'
    }
  ]
}
const statusMode = new URLSearchParams(location.search).get('status')
if (statusMode === 'unknown') waybill.status = 'unexpected_waybill_status'
if (statusMode === 'prototype') waybill.status = 'constructor'
if (statusMode) {
  waybill.events = [
    {
      id: 'unknown-event',
      waybillId: waybill.id,
      eventType: statusMode === 'prototype' ? 'constructor' : 'unexpected_waybill_event',
      eventTime: waybill.createTime,
      payload: {},
      createTime: waybill.createTime
    }
  ]
}
const measurementMode = new URLSearchParams(location.search).get('measurements')
if (measurementMode) {
  const measurement =
    measurementMode === 'missing'
      ? null
      : measurementMode === 'invalid'
        ? NaN
        : measurementMode === 'zero'
          ? 0
          : 1234.56789
  waybill.cargoOperations = [
    {
      id: 'operation-test',
      tenantId: waybill.tenantId,
      waybillId: waybill.id,
      operationType: 'loading',
      operationStatus: 'completed',
      checkinTime: waybill.createTime,
      checkinMode: 'manual',
      longitude: 0,
      latitude: 0,
      geofenceCenterLongitude: 0,
      geofenceCenterLatitude: 0,
      geofenceRadiusM: 0,
      distanceM: 0,
      insideGeofence: true,
      locationAccuracyM: measurement,
      weightTon: measurement,
      photoUrls: [],
      weighbridgeTicketUrls: [],
      createTime: waybill.createTime,
      updateTime: waybill.updateTime
    }
  ]
  waybill.execution = {
    id: 'execution-test',
    tenantId: waybill.tenantId,
    waybillId: waybill.id,
    departureOdometerKm: measurement,
    returnOdometerKm: measurement,
    departurePhotoUrls: [],
    receiptUrls: [],
    signatureUrls: [],
    returnPhotoUrls: [],
    createTime: waybill.createTime,
    updateTime: waybill.updateTime
  }
  waybill.fieldAccess = { routeCoordinates: 'read' }
}
const archiveMode = new URLSearchParams(location.search).get('archive')
if (archiveMode && waybill.execution) {
  const execution = waybill.execution
  const archivedTime =
    archiveMode === 'invalid-date'
      ? 'invalid'
      : archiveMode === 'time-only'
        ? '12:34'
        : waybill.createTime
  execution.departureTime = archivedTime
  execution.signedAt = archivedTime
  execution.returnTime = archivedTime
  execution.completionRecordedAt = archivedTime
  execution.signerName = archiveMode === 'blank-signer' ? '   ' : '验收签收人'
  execution.departureOdometerKm =
    archiveMode === 'invalid-mileage' ? NaN : archiveMode === 'negative-mileage' ? -1 : 0
  execution.departurePhotoUrls = archiveMode === 'missing-photo' ? [] : ['/archive-test.png']
  execution.receiptUrls = ['/archive-test.png']
  execution.signatureUrls = ['/archive-test.png']
  execution.returnPhotoUrls = ['/archive-test.png']
  waybill.status = 'completed'
}
const feeMode = new URLSearchParams(location.search).get('fees')
if (feeMode) {
  const amounts: Record<string, number | string | null | undefined> = {
    valid: '1234.5',
    zero: 0,
    missing: null,
    absent: undefined,
    blank: '   ',
    invalid: 'invalid-number',
    masked: '***',
    hidden: 1234.5,
    overflow: 1e308
  }
  waybill.costs =
    feeMode === 'empty'
      ? []
      : [0, 1].map((index) => ({
          id: 'cost-' + index,
          costNo: '日期费用验收-' + index,
          costType: 'fuel',
          sourceType: index === 0 ? 'driver_report' : 'web',
          amount: index === 0 && feeMode !== 'overflow' ? 0 : amounts[feeMode],
          quantity: 0,
          unitPrice: 0,
          occurredOn: time ?? '',
          submittedAt: time,
          reviewedAt: time,
          paidAt: time,
          expenseItem: { id: 'fuel-test', itemCode: 'fuel', itemName: '验收燃油费' },
          fieldAccess: { costAmounts: feeMode === 'hidden' && index === 1 ? 'hidden' : 'read' }
        }))
}
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        { class: 'p-4 grid gap-4 min-w-0' },
        feeMode
          ? [h(Fees, { waybill })]
          : [
              h(Info, { waybill }),
              ...(statusMode ? [h(Tracking, { waybill })] : []),
              h(Operation, { waybill }),
              h(Documents, { waybill })
            ]
      )
    )
})
app.use(store)
useUserStore(store).setUserInfo({
  userId: 'waybill-detail-test',
  tenantId: waybill.tenantId,
  platformSuper: false
})
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('div') } },
      { path: '/order/:id', name: 'TmsOrderDetail', component: { render: () => h('div') } }
    ]
  })
)
app.use(i18n)
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
setupGlobDirectives(app)
app.mount('#app')
