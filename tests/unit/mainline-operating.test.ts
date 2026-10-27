import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseMainlineCosts,
  parseVehicleFuelExecutions
} from '../../src/api/mainline-operating.model'

test('vehicle fuel records preserve zero values and pending calculations across two waybills', () => {
  const result = parseVehicleFuelExecutions({
    total: 2,
    records: [
      {
        waybillId: 'waybill-1',
        waybillNo: 'WB-001',
        status: 'completed',
        departedAt: null,
        completedAt: null,
        departureOdometerKm: 100,
        returnOdometerKm: 200,
        emptyMileageKm: 0,
        departureFuelLiters: 20,
        refueledLiters: 0,
        returnFuelLiters: 10,
        consumedFuelLiters: 10,
        totalMileageKm: 100,
        fuelPer100km: 10
      },
      {
        waybillId: 'waybill-2',
        waybillNo: 'WB-002',
        status: 'transporting',
        departedAt: null,
        completedAt: null,
        departureOdometerKm: 200,
        returnOdometerKm: null,
        emptyMileageKm: null,
        departureFuelLiters: 20,
        refueledLiters: null,
        returnFuelLiters: null,
        consumedFuelLiters: null,
        totalMileageKm: null,
        fuelPer100km: null
      }
    ]
  })
  assert.equal(result.data[0]?.refueledLiters, 0)
  assert.equal(result.data[0]?.fuelPer100km, 10)
  assert.equal(result.data[1]?.fuelPer100km, null)
})

test('cost records preserve field masking and reject malformed amounts', () => {
  const result = parseMainlineCosts({
    total: 2,
    records: [
      {
        id: 'cost-1',
        waybillId: 'waybill-1',
        amount: '***',
        expenseItem: { itemName: '油费' }
      },
      {
        id: 'cost-2',
        waybillId: 'waybill-2',
        amount: 128.5,
        expenseItem: { itemName: '路费' }
      }
    ]
  })
  assert.equal(result.data[0]?.amount, '***')
  assert.equal(result.data[0]?.expenseItemName, '油费')
  assert.equal(result.data[1]?.amount, 128.5)
  assert.throws(() =>
    parseMainlineCosts({
      total: 1,
      records: [{ id: 'cost-3', waybillId: 'waybill-3', amount: { raw: 1 } }]
    })
  )
})
