import assert from 'node:assert/strict'
import test from 'node:test'

import { parseFuelCardLedgerPage, parseFuelCardPage } from '../../src/api/fuel-card.model'

test('fuel-card pages parse two nonempty cards and their signed ledgers', () => {
  const cards = parseFuelCardPage({
    total: 2,
    records: [
      {
        id: 'card-1',
        tenantId: 'tenant-1',
        cardNo: 'YC-001',
        vehicleId: 'vehicle-1',
        plateNo: '测A·主线01',
        companyName: 'QA 公司',
        issuer: '测试发行方',
        imagePath: null,
        fuelType: 'diesel_0',
        ownerEmployeeId: null,
        ownerEmployeeName: null,
        openerEmployeeId: null,
        openerEmployeeName: null,
        driverId: null,
        driverName: null,
        remark: '',
        status: 'active',
        balance: 80,
        createTime: '2026-10-26T08:00:00Z',
        updateTime: '2026-10-26T09:00:00Z'
      },
      {
        id: 'card-2',
        tenantId: 'tenant-1',
        cardNo: 'YC-002',
        vehicleId: 'vehicle-2',
        plateNo: '测A·主线02',
        companyName: 'QA 公司',
        issuer: '测试发行方',
        imagePath: null,
        fuelType: 'gasoline_92',
        ownerEmployeeId: null,
        ownerEmployeeName: null,
        openerEmployeeId: null,
        openerEmployeeName: null,
        driverId: null,
        driverName: null,
        remark: '',
        status: 'disabled',
        balance: 120,
        createTime: '2026-10-26T08:05:00Z',
        updateTime: '2026-10-26T09:05:00Z'
      }
    ]
  })
  const entries = parseFuelCardLedgerPage({
    total: 2,
    records: [
      {
        id: 'entry-1',
        tenantId: 'tenant-1',
        cardId: 'card-1',
        cardNo: 'YC-001',
        vehicleId: 'vehicle-1',
        plateNo: '测A·主线01',
        companyName: 'QA 公司',
        cardStatus: 'active',
        driverId: null,
        driverName: null,
        stationName: '',
        liters: null,
        unitPrice: null,
        paymentMethod: null,
        voucherPaths: [],
        sourceCostId: null,
        sourceCostNo: null,
        cardBalance: 80,
        rechargeChannel: '',
        invoiceNo: '',
        rechargerEmployeeId: null,
        rechargerEmployeeName: null,
        waybillId: null,
        waybillNo: null,
        occurredAt: null,
        expenseLocation: '',
        expenseLongitude: null,
        expenseLatitude: null,
        expenseCoordinateSystem: null,
        expenseCoordinateSource: null,
        expenseCoordinateStatus: 'pending',
        expenseGeocodeProvider: null,
        expenseGeocodedAt: null,
        odometerKm: null,
        tripFuelPer100Km: null,
        entryType: 'recharge',
        amount: 100,
        signedAmount: 100,
        balanceAfter: 100,
        occurredOn: '2026-10-26',
        referenceNo: 'CZ-001',
        remark: '',
        reversesEntryId: null,
        isReversed: false,
        createTime: '2026-10-26T08:00:00Z'
      },
      {
        id: 'entry-2',
        tenantId: 'tenant-1',
        cardId: 'card-1',
        cardNo: 'YC-001',
        vehicleId: 'vehicle-1',
        plateNo: '测A·主线01',
        companyName: 'QA 公司',
        cardStatus: 'active',
        driverId: null,
        driverName: null,
        stationName: 'QA 加油站',
        liters: 20,
        unitPrice: 1,
        paymentMethod: 'fuel_card',
        voucherPaths: [],
        sourceCostId: null,
        sourceCostNo: null,
        cardBalance: 80,
        rechargeChannel: '',
        invoiceNo: '',
        rechargerEmployeeId: null,
        rechargerEmployeeName: null,
        waybillId: null,
        waybillNo: null,
        occurredAt: null,
        expenseLocation: '',
        expenseLongitude: null,
        expenseLatitude: null,
        expenseCoordinateSystem: null,
        expenseCoordinateSource: null,
        expenseCoordinateStatus: 'pending',
        expenseGeocodeProvider: null,
        expenseGeocodedAt: null,
        odometerKm: null,
        tripFuelPer100Km: null,
        entryType: 'consume',
        amount: 20,
        signedAmount: -20,
        balanceAfter: 80,
        occurredOn: '2026-10-26',
        referenceNo: 'XF-001',
        remark: '',
        reversesEntryId: null,
        isReversed: true,
        createTime: '2026-10-26T09:00:00Z'
      }
    ]
  })

  assert.equal(cards.total, 2)
  assert.deepEqual(
    cards.data.map((card) => card.cardNo),
    ['YC-001', 'YC-002']
  )
  assert.equal(cards.data[1]?.updateTime, '2026-10-26T09:05:00Z')
  assert.equal(entries.total, 2)
  assert.deepEqual(
    entries.data.map((entry) => entry.signedAmount),
    [100, -20]
  )
  assert.equal(entries.data[1]?.balanceAfter, cards.data[0]?.balance)
  assert.equal(entries.data[0]?.cardBalance, cards.data[0]?.balance)
  assert.notEqual(entries.data[0]?.balanceAfter, entries.data[0]?.cardBalance)
  assert.deepEqual(
    entries.data.map((entry) => entry.isReversed),
    [false, true]
  )
})

test('fuel-card pages reject snake-case time fields after response conversion', () => {
  assert.throws(() =>
    parseFuelCardPage({
      total: 1,
      records: [
        {
          id: 'card-1',
          tenantId: 'tenant-1',
          cardNo: 'YC-001',
          vehicleId: 'vehicle-1',
          plateNo: '测A·主线01',
          issuer: '',
          remark: '',
          status: 'active',
          balance: 0,
          create_time: '2026-10-26T08:00:00Z',
          update_time: '2026-10-26T08:00:00Z'
        }
      ]
    })
  )
})
