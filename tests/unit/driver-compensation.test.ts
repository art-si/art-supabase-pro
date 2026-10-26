import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDriverCompensation } from '../../src/api/driver-compensation.model'

test('driver compensation parses an exact employee-linked approved amount', () => {
  const result = parseDriverCompensation({
    employeeLinked: true,
    current: {
      id: 'comp-1',
      employeeId: 'employee-1',
      planName: '司机月薪方案',
      baseAmount: 8800,
      currencyCode: 'CNY',
      payFrequency: 'monthly',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      status: 'approved',
      privateRemark: 'must not propagate'
    }
  })
  assert.equal(result?.current?.baseAmount, 8800)
  assert.equal(result?.current?.planName, '司机月薪方案')
  assert.equal('privateRemark' in (result?.current ?? {}), false)
})

test('driver compensation distinguishes unlinked employee and missing current plan', () => {
  assert.deepEqual(parseDriverCompensation({ employeeLinked: false, current: null }), {
    employeeLinked: false,
    current: null
  })
  assert.deepEqual(parseDriverCompensation({ employeeLinked: true, current: null }), {
    employeeLinked: true,
    current: null
  })
})

test('driver compensation rejects malformed or unauthorized-looking amount data', () => {
  assert.throws(() =>
    parseDriverCompensation({
      employeeLinked: true,
      current: {
        id: 'comp-1',
        employeeId: 'employee-1',
        planName: '司机月薪方案',
        baseAmount: '***',
        currencyCode: 'CNY',
        payFrequency: 'monthly',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        status: 'approved'
      }
    })
  )
  assert.throws(() => parseDriverCompensation({ employeeLinked: false, current: {} }))
})
