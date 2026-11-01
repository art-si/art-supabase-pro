import type { Component } from 'vue'
import { EDITABLE_VEHICLE_ACCIDENT_ACCESS } from '@vms/views/vehicle-manage/accident-record/modules/accident-record-model'
import { EDITABLE_VEHICLE_MAINTENANCE_ACCESS } from '@vms/views/vehicle-manage/maintenance-record/modules/maintenance-record-model'
import { EDITABLE_VEHICLE_ROUTINE_INSPECTION_ACCESS } from '@vms/views/vehicle-manage/routine-inspection/modules/routine-inspection-model'
import { EDITABLE_VEHICLE_INSURANCE_ACCESS } from '@vms/views/vehicle-manage/vehicle-insurance/modules/vehicle-insurance-model'
import { EDITABLE_VEHICLE_PART_USAGE_ACCESS } from '@vms/views/vehicle-manage/part-manage/modules/vehicle-part-usage-model'
const id = '22222222-2222-4222-8222-222222222222'
const tenantId = '11111111-1111-4111-8111-111111111111'
const referenceId = '33333333-3333-4333-8333-333333333333'
const common = {
  id,
  tenantId,
  vehicleId: referenceId,
  plateNo: '测A12345',
  companyName: '验收运输公司',
  attachments: [],
  remark: '验收备注',
  isRecordOwner: true
}
const routine = {
  ...common,
  routineInspectionNo: 'CHECK-TEST',
  inspectionType: 'daily',
  inspectionTime: '2026-10-31 08:00:00',
  inspector: '验收检查人',
  driverId: null,
  checkCondition: '日常检查合格',
  checkResult: 'qualified',
  handlingMethod: '无需整改',
  fieldAccess: EDITABLE_VEHICLE_ROUTINE_INSPECTION_ACCESS
}
const card = {
  id: referenceId,
  tenantId,
  cardNo: 'CARD-TEST',
  vehicleId: referenceId,
  plateNo: '测A12345',
  balance: 1000,
  status: 'active'
}
type Entry = { load: () => Promise<{ default: Component }>; args: () => unknown[] }
export const vehicleEntries: Record<string, Entry> = {
  'part-issue': {
    load: () => import('@vms/views/vehicle-manage/part-manage/modules/part-issue-dialog.vue'),
    args: () => []
  },
  'fuel-recharge': {
    load: () =>
      import('@vms/views/vehicle-manage/fuel-card-ledger/modules/fuel-card-entry-dialog.vue'),
    args: () => ['recharge', card]
  },
  'fuel-consume': {
    load: () =>
      import('@vms/views/vehicle-manage/fuel-card-ledger/modules/fuel-card-entry-dialog.vue'),
    args: () => ['consume', card]
  },
  'electric-recharge': {
    load: () =>
      import('@vms/views/vehicle-manage/electric-card-ledger/modules/electric-card-entry-dialog.vue'),
    args: () => ['recharge', card]
  },
  'electric-consume': {
    load: () =>
      import('@vms/views/vehicle-manage/electric-card-ledger/modules/electric-card-entry-dialog.vue'),
    args: () => ['consume', card]
  },
  trailer: {
    load: () => import('@vms/views/trailer-manage/modules/trailer-dialog.vue'),
    args: () => [
      {
        ...common,
        plateNo: '测A1234挂',
        plateColor: 'yellow',
        vehicleTypeProfileId: referenceId,
        ownerName: '验收所有人',
        ownership: 'self_operated'
      }
    ]
  },
  accident: {
    load: () =>
      import('@vms/views/vehicle-manage/accident-record/modules/accident-record-dialog.vue'),
    args: () => [
      {
        ...common,
        accidentTime: '2026-10-31 08:00:00',
        accidentSummary: '验收事故记录',
        accidentLocation: '验收路1号',
        dataSource: 'self',
        fieldAccess: EDITABLE_VEHICLE_ACCIDENT_ACCESS
      }
    ]
  },
  maintenance: {
    load: () =>
      import('@vms/views/vehicle-manage/maintenance-record/modules/maintenance-record-dialog.vue'),
    args: () => [
      {
        ...common,
        maintenanceNo: 'MAINTENANCE-TEST',
        maintenanceType: 'repair',
        startTime: '2026-10-31 08:00:00',
        serviceDate: '2026-10-31',
        currentOdometerKm: 10000,
        initiator: '验收经办人',
        items: [
          {
            itemName: '验收维修项目',
            totalAmount: 50,
            laborAmount: 50,
            partName: '',
            partPrice: null,
            quantity: null
          }
        ],
        fieldAccess: EDITABLE_VEHICLE_MAINTENANCE_ACCESS
      }
    ]
  },
  routine: {
    load: () =>
      import('@vms/views/vehicle-manage/routine-inspection/modules/routine-inspection-dialog.vue'),
    args: () => [routine]
  },
  'routine-compact': {
    load: () =>
      import('@vms/views/vehicle-manage/routine-inspection/modules/routine-inspection-dialog.vue'),
    args: () => [{ ...routine, fieldAccess: { responsiblePeople: 'edit' } }]
  },
  'vehicle-insurance': {
    load: () =>
      import('@vms/views/vehicle-manage/vehicle-insurance/modules/vehicle-insurance-dialog.vue'),
    args: () => [
      {
        ...common,
        commercialPolicyNo: 'COMMERCIAL-TEST',
        commercialCompanyId: referenceId,
        commercialCompanyName: '验收保险公司',
        commercialInsureDate: '2026-10-31',
        commercialExpireDate: '2027-10-31',
        commercialPremium: 1000,
        compulsoryPolicyNo: 'COMPULSORY-TEST',
        compulsoryCompanyId: referenceId,
        compulsoryCompanyName: '验收保险公司',
        compulsoryInsureDate: '2026-10-31',
        compulsoryExpireDate: '2027-10-31',
        compulsoryPremium: 500,
        fieldAccess: EDITABLE_VEHICLE_INSURANCE_ACCESS
      }
    ]
  },
  'part-usage': {
    load: () =>
      import('@vms/views/vehicle-manage/part-manage/modules/vehicle-part-usage-dialog.vue'),
    args: () => [
      {
        ...common,
        partId: referenceId,
        partType: 'original',
        partName: '验收车辆零件',
        partCode: 'PART-TEST',
        unit: '件',
        enableMode: 'vehicle',
        warrantyMode: 'vehicle',
        serviceMileageEnabled: true,
        serviceMileage: 10000,
        serviceYearsEnabled: false,
        status: 'normal',
        fieldAccess: EDITABLE_VEHICLE_PART_USAGE_ACCESS
      }
    ]
  }
}
