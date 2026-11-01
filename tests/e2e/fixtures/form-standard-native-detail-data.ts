import type { Component } from 'vue'
const id = '22222222-2222-4222-8222-222222222222'
const tenantId = '11111111-1111-4111-8111-111111111111'
const referenceId = '33333333-3333-4333-8333-333333333333'
const base = {
  id,
  tenantId,
  createTime: '2026-10-31T08:00:00Z',
  updateTime: '2026-10-31T08:00:00Z'
}
export const nativeService = {
  ...base,
  serviceNo: 'SERVICE-READONLY',
  serviceType: 'inquiry',
  complaintTypes: [],
  title: '验收服务咨询',
  contactName: '验收联系人',
  contactPhone: '13800000000',
  content: '请核对运输服务进度。',
  attachments: [],
  remark: '',
  status: 'pending'
}
export const nativeElectronic = {
  ...base,
  contractNo: 'ELECTRONIC-READONLY',
  contractName: '验收电子合同',
  partyACompany: '验收甲方',
  partyARepresentative: '甲方代表',
  partyASubject: '甲方主体',
  partyBCarrierId: referenceId,
  partyBCompany: '验收乙方',
  partyBRepresentative: '乙方代表',
  partyBSubject: '乙方主体',
  startsOn: '2026-10-31',
  endsOn: '2027-10-31',
  contentHtml: '<p>按约定运输并交付。</p>',
  attachments: [],
  status: 'signed'
}
export const nativeAgreement = {
  ...base,
  agreementNo: 'AGREEMENT-READONLY',
  shipperName: '验收托运方',
  carrierId: referenceId,
  carrierName: '验收承运商',
  contactPhone: '13800000000',
  vehicleId: referenceId,
  plateNo: '测A12345',
  startsOn: '2026-10-31',
  endsOn: '2027-10-31',
  contentHtml: '<p>按约定运输并交付。</p>',
  idCardImages: [],
  registrationImages: [],
  driverLicenseImage: null,
  roadPermitImage: null,
  partyASeal: '验收甲方',
  partyARepresentative: '甲方代表',
  partyASignedOn: '2026-10-31',
  partyBSeal: '验收乙方',
  partyBRepresentative: '乙方代表',
  partyBSignedOn: '2026-10-31',
  status: 'signed'
}
export function ledgerDetail(entryType: 'consume' | 'recharge') {
  return {
    ...base,
    postingSeq: 1,
    cardId: referenceId,
    cardNo: 'CARD-TEST',
    vehicleId: referenceId,
    plateNo: '测A12345',
    cardStatus: 'active',
    driverId: null,
    driverName: null,
    entryType,
    amount: 100,
    signedAmount: entryType === 'consume' ? -100 : 100,
    balanceAfter: 900,
    cardBalance: 900,
    occurredOn: '2026-10-31',
    occurredAt: '2026-10-31T08:00:00Z',
    waybillId: null,
    waybillNo: null,
    expenseLocation: '验收充能站',
    expenseLongitude: null,
    expenseLatitude: null,
    expenseCoordinateSystem: null,
    expenseCoordinateSource: null,
    expenseCoordinateStatus: 'pending',
    expenseGeocodeProvider: null,
    expenseGeocodedAt: null,
    chargeKwh: 10,
    liters: 10,
    unitPrice: 10,
    odometerKm: null,
    stationName: '验收能源站',
    pileNo: '',
    rechargeChannel: '',
    invoiceNo: '',
    referenceNo: 'LEDGER-TEST',
    voucherPaths: [],
    remark: '验收流水',
    reversesEntryId: null,
    isReversed: false,
    companyName: '验收运输公司',
    paymentMethod: 'fuel_card',
    sourceCostId: null,
    sourceCostNo: null,
    rechargerEmployeeName: null,
    rechargerEmployeeId: null,
    tripFuelPer100Km: null
  }
}
type Entry = { load: () => Promise<{ default: Component }>; args: () => unknown[]; page: true }
const fuel = (): Entry => ({
  load: () => import('@vms/views/vehicle-manage/fuel-card-ledger/index.vue'),
  args: () => [],
  page: true
})
const electric = (): Entry => ({
  load: () => import('@vms/views/vehicle-manage/electric-card-ledger/index.vue'),
  args: () => [],
  page: true
})
export const nativeDetailEntries: Record<string, Entry> = {
  'native-service': {
    load: () => import('@tms/views/basic-data/service-case/index.vue'),
    args: () => [],
    page: true
  },
  'native-electronic': {
    load: () => import('@tms/views/basic-data/electronic-contract/index.vue'),
    args: () => [],
    page: true
  },
  'native-agreement': {
    load: () => import('@tms/views/basic-data/transport-agreement/index.vue'),
    args: () => [],
    page: true
  },
  'native-fuel-consume': fuel(),
  'native-fuel-recharge': fuel(),
  'native-electric-consume': electric(),
  'native-electric-recharge': electric()
}
