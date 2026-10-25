import assert from 'node:assert/strict'
import test from 'node:test'
import dayjs from 'dayjs'
import {
  calculateShifts,
  calculateBreaks,
  datesInRange,
  productionToday
} from '../../modules/art-supabase-mdm/src/views/production/modules/production-model'
import { parseProductionShifts } from '../../modules/art-supabase-mdm/src/api/modules/production-shifts'
import type { ProductionShift } from '../../modules/art-supabase-mdm/src/api/modules/production.types'

const shifts = (): ProductionShift[] => [
  {
    name: '白班',
    startTime: '08:00',
    endTime: '20:00',
    breaks: [{ startTime: '12:00', endTime: '13:00' }],
    handoverAuto: true,
    handoverMinutes: 0
  },
  {
    name: '夜班',
    startTime: '19:45',
    endTime: '08:00',
    breaks: [{ startTime: '00:00', endTime: '01:00' }],
    handoverAuto: false,
    handoverMinutes: 20
  }
]
test('cross-midnight shifts calculate net minutes, automatic overlap, and manual handover', () => {
  const result = calculateShifts(shifts())
  assert.deepEqual(
    result.map((s) => [s.workMinutes, s.restMinutes, s.handoverMinutes]),
    [
      [660, 60, 15],
      [675, 60, 20]
    ]
  )
  assert.equal(shifts()[0].handoverMinutes, 0)
  assert.deepEqual(parseProductionShifts(result), result)
})
test('rest intervals cannot overlap, be reversed, escape the shift, or occupy its whole duration', () => {
  const shift = { startTime: '22:00', endTime: '06:00' }
  assert.equal(calculateBreaks(shift, [{ startTime: '23:45', endTime: '00:15' }]), 30)
  for (const breaks of [
    [{ startTime: '21:00', endTime: '22:30' }],
    [
      { startTime: '23:00', endTime: '00:00' },
      { startTime: '23:30', endTime: '00:30' }
    ],
    [{ startTime: '01:00', endTime: '00:30' }],
    [{ startTime: '22:00', endTime: '06:00' }]
  ])
    assert.throws(() => calculateBreaks(shift, breaks), /休息/)
})
test('invalid handovers and malformed JSON are rejected before rendering', () => {
  const rows = shifts()
  rows[1].handoverMinutes = 900
  assert.throws(() => calculateShifts(rows), /交班/)
  assert.throws(() => calculateShifts([{ ...rows[0], endTime: '08:00' }]), /不能相同/)
  for (const value of [
    null,
    {},
    [],
    [{ name: '缺少时间' }],
    [{ ...calculateShifts(shifts())[0], breaks: null }]
  ]) {
    assert.throws(() => parseProductionShifts(value), /数据不完整/)
  }
})
test('date batches exclude today/past and respect chosen weekdays across a year', () => {
  const tomorrow = dayjs(productionToday()).add(1, 'day')
  const days = datesInRange(
    tomorrow.format('YYYY-MM-DD'),
    tomorrow.add(364, 'day').format('YYYY-MM-DD'),
    [1, 2, 3, 4, 5]
  )
  assert.ok(days.length >= 260 && days.length <= 262)
  assert.ok(days.every((d) => d > productionToday() && ![0, 6].includes(dayjs(d).day())))
  assert.throws(() => datesInRange(productionToday(), tomorrow.format('YYYY-MM-DD'), [1]), /明天/)
  assert.throws(
    () =>
      datesInRange(tomorrow.format('YYYY-MM-DD'), tomorrow.add(10, 'day').format('YYYY-MM-DD'), []),
    /星期/
  )
})
