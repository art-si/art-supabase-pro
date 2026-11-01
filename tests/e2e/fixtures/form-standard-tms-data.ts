import type { Component } from 'vue'
const id = '22222222-2222-4222-8222-222222222222'
const tenantId = '11111111-1111-4111-8111-111111111111'
const referenceId = '33333333-3333-4333-8333-333333333333'
const common = { id, tenantId }
export const transportContract = {
  ...common,
  contractNo: 'CONTRACT-TEST',
  contractName: '验收运输合同',
  contractStatus: 'draft',
  contractCategory: 'transport',
  transportMode: 'road',
  businessContractType: 'customer',
  carrierId: referenceId,
  billingMethod: 'monthly',
  signTime: '2026-10-31',
  isCompleted: false,
  handler: '验收经办人',
  transportDetails: [],
  attachments: [],
  fieldAccess: { attachments: 'edit', transportDetailsPricing: 'edit' },
  isRecordOwner: true
}
export const transportOrder = {
  ...common,
  orderNo: 'ORDER-TEST',
  originStation: '上海仓',
  destinationStation: '杭州门店',
  transportFee: 50
}
export const transportDriver = {
  ...common,
  driverName: '验收司机',
  phone: '13800000000',
  driverOwnership: 'self',
  driverType: 'primary',
  driverStatus: 'on_duty',
  gender: 'male',
  enabled: true,
  idCardNo: '110101199001010011',
  birthDate: '1990-01-01',
  licenseType: 'A2',
  licenseExpireDate: '2030-10-31',
  idCardValidTo: '2030-10-31',
  carrierId: '',
  assignedVehicles: [],
  fieldAccess: {
    contactPhone: 'edit',
    idCardNo: 'edit',
    homeAddress: 'edit',
    emergencyContact: 'edit',
    identityDocuments: 'edit'
  }
}
export const transportDriverProfile = {
  birthDate: '1990-01-01',
  licenseClasses: ['A2'],
  licenseExpireDate: '2030-10-31',
  idCardValidTo: '2030-10-31',
  idCardLongTerm: false,
  licenseLongTerm: false
}
export const transportCommissionRule = {
  ...common,
  driverId: id,
  ruleName: '验收提成方案',
  vehicleTypeProfileId: referenceId,
  vehicleId: null,
  origin: '',
  destination: '',
  direction: 'forward',
  weightMinTons: null,
  weightMaxTons: null,
  volumeMinM3: null,
  volumeMaxM3: null,
  effectiveFrom: '2026-10-31',
  effectiveTo: null,
  method: 'fixed_per_trip',
  rate: 50,
  enabled: true,
  remark: ''
}
type Entry = { load: () => Promise<{ default: Component }>; args: () => unknown[] }
export const tmsEntries: Record<string, Entry> = {
  'print-count': {
    load: () => import('@tms/views/order-open/modules/print-count-dialog.vue'),
    args: () => [{ kind: 'label', cargoQuantity: 7 }]
  },
  'waybill-commission': {
    load: () =>
      import('@tms/views/waybill-management/detail/modules/waybill-commission-dialog.vue'),
    args: () => [id]
  },
  'execution-signature': {
    load: () => import('@tms/views/waybill-management/modules/execution-operation-dialog.vue'),
    args: () => [
      {
        row: {
          ...transportOrder,
          driverWaybillId: id,
          receivingContactName: '验收收货人',
          waybillStatus: 'transporting'
        },
        action: 'signature'
      }
    ]
  },
  driver: {
    load: () => import('@tms/views/basic-data/driver/modules/driver-dialog.vue'),
    args: () => [transportDriver]
  },
  'favorite-route': {
    load: () => import('@tms/views/basic-data/favorite-route/modules/favorite-route-dialog.vue'),
    args: () => [
      {
        ...common,
        routeName: '验收常用线路',
        customerId: referenceId,
        originAddressId: referenceId,
        destinationAddressId: referenceId,
        enabled: true,
        distanceKm: 100,
        estimatedMinutes: 90
      }
    ]
  },
  agreement: {
    load: () =>
      import('@tms/views/basic-data/transport-agreement/modules/transport-agreement-dialog.vue'),
    args: () => [
      {
        ...common,
        agreementNo: 'AGREEMENT-TEST',
        shipperName: '验收托运方',
        carrierId: referenceId,
        carrierName: '验收承运商',
        vehicleId: referenceId,
        plateNo: '测A12345',
        contactPhone: '13800000000',
        startsOn: '2026-10-31',
        endsOn: '2027-10-31',
        contentHtml: '<p>按约定完成运输和交付。</p>',
        idCardImages: [],
        registrationImages: [],
        driverLicenseImage: null,
        roadPermitImage: null,
        status: 'signed',
        partyASeal: '验收甲方',
        partyARepresentative: '甲方代表',
        partyASignedOn: '2026-10-31',
        partyBSeal: '验收乙方',
        partyBRepresentative: '乙方代表',
        partyBSignedOn: '2026-10-31'
      }
    ]
  },
  contract: {
    load: () => import('@tms/views/basic-data/contract/modules/contract-dialog.vue'),
    args: () => [transportContract]
  },
  quote: {
    load: () => import('@tms/views/order-list/modules/quote-dialog.vue'),
    args: () => [transportOrder]
  },
  'return-summary': {
    load: () => import('@tms/views/order-list/modules/return-trip/return-trip-summary-dialog.vue'),
    args: () => [transportOrder]
  },
  'return-trip': {
    load: () => import('@tms/views/order-list/modules/return-trip/return-trip-drawer.vue'),
    args: () => [transportOrder]
  },
  'electronic-contract': {
    load: () =>
      import('@tms/views/basic-data/electronic-contract/modules/electronic-contract-dialog.vue'),
    args: () => []
  }
}
