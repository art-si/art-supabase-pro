import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseDriverQualificationPage,
  parseDriverSafetyPage,
  parseDriverTrainingResult
} from '../../src/api/driver-mainline.model'

test('driver safety keeps masked penalty values and exact linked vehicle identity', () => {
  const result = parseDriverSafetyPage(
    {
      available: true,
      total: 1,
      records: [
        {
          id: 'violation-1',
          vehicleId: 'vehicle-1',
          plateNo: '京A12345',
          violationTime: '2026-10-26T08:00:00Z',
          violationBehavior: '超速',
          penaltyPoints: '***',
          processed: false
        }
      ]
    },
    'violation'
  )
  assert.equal(result.data[0]?.penaltyPoints, '***')
  assert.equal(result.data[0]?.vehicleId, 'vehicle-1')
  assert.equal(result.data[0]?.summary, '超速')
})

test('driver safety rejects records when access is denied', () => {
  assert.throws(() =>
    parseDriverSafetyPage(
      { available: false, total: 1, records: [{ id: 'violation-1' }] },
      'violation'
    )
  )
})

test('driver qualification distinguishes permission from missing employee link', () => {
  const result = parseDriverQualificationPage({
    available: true,
    linkedEmployee: false,
    total: 0,
    records: []
  })
  assert.equal(result.available, true)
  assert.equal(result.linkedEmployee, false)
})

test('driver training never exposes histories without career-record access', () => {
  const result = parseDriverTrainingResult({
    fieldAccess: { careerRecords: 'masked' },
    trainings: [{ id: 'training-1', trainingName: '危险品运输培训' }]
  })
  assert.deepEqual(result, { available: false, data: [] })
})
