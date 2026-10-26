import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMainlineScreenOverview } from '../../src/api/transport-mainline-screen.model'

const totals = {
  orders: 2,
  active: 1,
  pending: 1,
  exception: 0,
  closed: 0,
  vehicles: 2,
  drivers: 2,
  linkedVehicles: 2,
  linkedDrivers: 2,
  executions: 2
}

test('overview preserves multiple vehicle and driver links for one order', () => {
  const result = parseMainlineScreenOverview({
    totals,
    asOf: '2026-10-26T08:00:00+08:00',
    orders: [
      {
        id: 'order-1',
        orderNo: 'YD-01',
        status: 'transporting',
        origin: '上海',
        destination: '南京',
        signal: 'active',
        executionCount: 2,
        vehicleCount: 2,
        driverCount: 2,
        vehicles: [
          { id: 'vehicle-1', label: '沪A001' },
          { id: 'vehicle-2', label: '苏B002' }
        ],
        drivers: [
          { id: 'driver-1', label: '张师傅' },
          { id: 'driver-2', label: '李师傅' }
        ],
        updatedAt: null
      },
      {
        id: 'order-2',
        orderNo: 'YD-02',
        status: 'pending_load',
        origin: null,
        destination: null,
        signal: 'pending',
        executionCount: 0,
        vehicleCount: 0,
        driverCount: 0,
        vehicles: [],
        drivers: [],
        updatedAt: null
      }
    ]
  })
  assert.equal(result.totals.orders, 2)
  assert.deepEqual(
    result.orders[0]?.vehicles.map(({ id }) => id),
    ['vehicle-1', 'vehicle-2']
  )
  assert.deepEqual(
    result.orders[0]?.drivers.map(({ id }) => id),
    ['driver-1', 'driver-2']
  )
  assert.equal(result.orders[1]?.signal, 'pending')
})

test('overview rejects an invalid aggregate instead of showing a misleading total', () => {
  assert.throws(
    () =>
      parseMainlineScreenOverview({
        totals: { ...totals, orders: '2' },
        orders: [],
        asOf: '2026-10-26'
      }),
    /统计异常/
  )
})
