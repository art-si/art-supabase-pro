import assert from 'node:assert/strict'
import test from 'node:test'
import { assessVehicleHealth } from '../../supabase/functions/_shared/vehicle-health-rules'

const now = new Date('2026-08-05T08:00:00.000Z')

test('vehicle health rules prioritize expired compliance records', () => {
  const result = assessVehicleHealth(
    {
      vehicle: { id: 'vehicle-1', plate_no: '苏A12345', vehicle_type: 'truck' },
      insurance: [
        {
          commercial_expire_date: '2026-08-01',
          compulsory_expire_date: '2026-09-01',
          create_time: '2026-01-01'
        }
      ],
      inspections: [{ expire_date: '2026-08-20' }],
      maintenance: [{ maintenance_type: 'maintenance', start_time: '2026-07-01' }],
      mileage: [{ end_time: '2026-08-04', end_mileage: 52000 }]
    },
    { now }
  )

  assert.equal(result.riskLevel, 'critical')
  assert.equal(result.signals[0].type, 'insurance_expired')
  assert.equal(result.metrics.insuranceDaysRemaining, -4)
  assert.ok(result.recommendedActions.some((item) => item.includes('续保')))
})

test('vehicle health rules detect frequent repairs and unresolved safety records', () => {
  const result = assessVehicleHealth(
    {
      vehicle: { id: 'vehicle-2', plate_no: '浙B88990' },
      insurance: [
        {
          commercial_expire_date: '2027-01-01',
          compulsory_expire_date: '2027-01-01',
          create_time: '2026-01-01'
        }
      ],
      inspections: [{ expire_date: '2027-01-01' }],
      maintenance: [
        { maintenance_type: 'repair', start_time: '2026-07-20', cost_amount: 1200 },
        { maintenance_type: 'repair', start_time: '2026-07-01', cost_amount: 800 },
        { maintenance_type: 'repair', start_time: '2026-06-10', cost_amount: 600 }
      ],
      mileage: [{ end_time: '2026-08-04', end_mileage: 18000 }],
      accidents: [
        {
          accident_time: '2026-07-18',
          accident_summary: '右前轮碰撞',
          processed: false
        }
      ],
      routineInspections: [
        {
          inspection_time: '2026-08-01',
          check_result: 'unqualified',
          check_condition: '制动异响'
        }
      ]
    },
    { now }
  )

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.signals.some((item) => item.type === 'repair_frequency_high'))
  assert.ok(result.signals.some((item) => item.type === 'unresolved_accident'))
  assert.ok(result.signals.some((item) => item.type === 'routine_inspection_failed'))
  assert.equal(result.metrics.repairCount90Days, 3)
})

test('vehicle health rules flag missing maintenance and stale mileage without inventing telemetry', () => {
  const result = assessVehicleHealth(
    {
      vehicle: { id: 'vehicle-3', plate_no: '皖C66001' },
      insurance: [
        {
          commercial_expire_date: '2027-01-01',
          compulsory_expire_date: '2027-01-01',
          create_time: '2026-01-01'
        }
      ],
      inspections: [{ expire_date: '2027-01-01' }]
    },
    { now }
  )

  assert.ok(result.signals.some((item) => item.type === 'maintenance_history_missing'))
  assert.ok(result.signals.some((item) => item.type === 'mileage_data_stale'))
  assert.ok(result.limitations.some((item) => item.includes('ECU')))
})

test('vehicle health rules identify parts that reached configured service baselines', () => {
  const result = assessVehicleHealth(
    {
      vehicle: { id: 'vehicle-4', plate_no: '沪D55321' },
      insurance: [
        {
          commercial_expire_date: '2027-01-01',
          compulsory_expire_date: '2027-01-01',
          create_time: '2026-01-01'
        }
      ],
      inspections: [{ expire_date: '2027-01-01' }],
      maintenance: [{ maintenance_type: 'maintenance', start_time: '2026-07-01' }],
      mileage: [{ end_time: '2026-08-04', end_mileage: 30000 }],
      parts: [
        {
          status: 'normal',
          part_name: '前轮胎',
          service_mileage_enabled: true,
          used_mileage: 60000,
          service_mileage: 50000
        }
      ]
    },
    { now }
  )

  assert.equal(result.metrics.duePartCount, 1)
  assert.ok(result.signals.some((item) => item.type === 'part_service_due'))
})
