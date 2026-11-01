import assert from 'node:assert/strict'
import test from 'node:test'
import {
  requestSqlColumnPin,
  resolveSqlColumnPins,
  type SqlColumnPin,
  type SqlColumnPinLayoutInput
} from '../../src/views/data-center/sql-console/modules/result-column-pins'

const pin = (key: string, side: SqlColumnPin['side'] = 'left'): SqlColumnPin => ({ key, side })
const columns = (widths: Record<string, number>) =>
  Object.entries(widths).map(([key, width]) => ({ key, width }))

test('mixed fixed and scrollable fields reserve clamped middle space from the real viewport', () => {
  for (const [viewportWidth, reservedMiddleWidth] of [
    [640, 240],
    [800, 240],
    [1000, 300],
    [2000, 320]
  ]) {
    const layout = resolveSqlColumnPins({
      columns: columns({ a: 200, b: 100 }),
      viewportWidth,
      desiredPins: [pin('a')]
    })
    assert.equal(layout.reservedMiddleWidth, reservedMiddleWidth)
    assert.equal(layout.pinnedWidth, 200)
    assert.equal(layout.remainingWidth, viewportWidth - 200)
    assert.deepEqual([...layout.appliedPins], [['a', 'left']])
  }
  const empty = resolveSqlColumnPins({ columns: [], viewportWidth: 800, desiredPins: [] })
  assert.equal(empty.reservedMiddleWidth, 0)
  assert.equal(empty.remainingWidth, 800)
})

test('sub-640 containers suspend pins and restore the original preferences at the threshold', () => {
  const input = {
    columns: columns({ a: 200, b: 200, c: 200 }),
    viewportWidth: 639.999,
    desiredPins: [pin('a'), pin('b', 'right')]
  }
  const narrow = resolveSqlColumnPins(input)
  assert.equal(narrow.appliedPins.size, 0)
  assert.equal(narrow.pinnedWidth, 0)
  assert.equal(narrow.remainingWidth, 639.999)
  assert.deepEqual(
    narrow.suspended.map((entry) => entry.reason),
    ['narrow-viewport', 'narrow-viewport']
  )
  assert.deepEqual(
    resolveSqlColumnPins({ ...input, viewportWidth: 640 }).appliedPins,
    new Map([
      ['a', 'left'],
      ['b', 'right']
    ])
  )
  assert.deepEqual(input.desiredPins, [pin('a'), pin('b', 'right')])
})

test('all visible fields may be fixed when their actual widths fit, without phantom middle space', () => {
  const fits = resolveSqlColumnPins({
    columns: columns({ a: 320, b: 320 }),
    viewportWidth: 640,
    desiredPins: [pin('a'), pin('b', 'right')]
  })
  assert.equal(fits.appliedPins.size, 2)
  assert.equal(fits.reservedMiddleWidth, 0)
  assert.equal(fits.remainingWidth, 0)
  const overflows = resolveSqlColumnPins({
    columns: columns({ a: 320, b: 320.01 }),
    viewportWidth: 640,
    desiredPins: [pin('a'), pin('b', 'right')]
  })
  assert.deepEqual([...overflows.appliedPins], [['a', 'left']])
  assert.equal(overflows.reservedMiddleWidth, 240)
  assert.equal(overflows.remainingWidth, 320)
  assert.deepEqual(overflows.suspended, [{ ...pin('b', 'right'), reason: 'insufficient-space' }])
})

test('layout recomputation uses request order and admits later fitting pins after an oversized one', () => {
  const desiredPins = [pin('oversized'), pin('second', 'right'), pin('third')]
  const input = {
    columns: columns({ oversized: 600, second: 200, third: 250, middle: 200 }),
    viewportWidth: 800,
    desiredPins
  }
  const layout = resolveSqlColumnPins(input)
  assert.deepEqual(
    [...layout.appliedPins],
    [
      ['second', 'right'],
      ['third', 'left']
    ]
  )
  assert.equal(layout.remainingWidth, 350)
  assert.deepEqual(layout.suspended, [{ ...pin('oversized'), reason: 'insufficient-space' }])
  const reordered = resolveSqlColumnPins({ ...input, columns: [...input.columns].reverse() })
  assert.deepEqual(reordered, layout)
  assert.deepEqual(desiredPins, [pin('oversized'), pin('second', 'right'), pin('third')])
})

test('explicit requests refuse a target that cannot fit, keeping every existing applied pin', () => {
  const input = {
    columns: columns({ a: 260, b: 200, c: 200, middle: 100 }),
    viewportWidth: 800,
    desiredPins: [pin('a'), pin('b', 'right')]
  }
  const refused = requestSqlColumnPin(input, pin('c'))
  assert.equal(refused.accepted, false)
  assert.equal(refused.reason, 'insufficient-space')
  assert.deepEqual(refused.desiredPins, input.desiredPins)
  assert.deepEqual(refused.layout, resolveSqlColumnPins(input))
  const accepted = requestSqlColumnPin({ ...input, viewportWidth: 1000 }, pin('c'))
  assert.equal(accepted.accepted, true)
  assert.deepEqual(accepted.desiredPins, [...input.desiredPins, pin('c')])
  assert.deepEqual(
    [...accepted.layout.appliedPins],
    [
      ['a', 'left'],
      ['b', 'right'],
      ['c', 'left']
    ]
  )
})

test('pinning the last free column can use the all-fixed exception instead of rejecting needlessly', () => {
  const accepted = requestSqlColumnPin(
    {
      columns: columns({ a: 300, b: 300 }),
      viewportWidth: 640,
      desiredPins: [pin('a')]
    },
    pin('b', 'right')
  )
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.layout.reservedMiddleWidth, 0)
  assert.equal(accepted.layout.pinnedWidth, 600)
})

test('changing side retains request order while a caller cancellation and re-pin appends at the end', () => {
  const input = {
    columns: columns({ a: 180, b: 180, middle: 180 }),
    viewportWidth: 800,
    desiredPins: [pin('a'), pin('b')]
  }
  const moved = requestSqlColumnPin(input, pin('a', 'right'))
  assert.equal(moved.accepted, true)
  assert.deepEqual(moved.desiredPins, [pin('a', 'right'), pin('b')])
  const cancelled = moved.desiredPins.filter((entry) => entry.key !== 'a')
  const rePinned = requestSqlColumnPin({ ...input, desiredPins: cancelled }, pin('a'))
  assert.deepEqual(rePinned.desiredPins, [pin('b'), pin('a')])
})

test('hidden and unknown fields take no width, retain preferences, and restore when visible again', () => {
  const desiredPins = [pin('a'), pin('b', 'right'), pin('unknown')]
  const hidden = resolveSqlColumnPins({
    columns: columns({ b: 200, middle: 200 }),
    viewportWidth: 800,
    desiredPins
  })
  assert.deepEqual([...hidden.appliedPins], [['b', 'right']])
  assert.equal(hidden.pinnedWidth, 200)
  assert.deepEqual(
    hidden.suspended.map((entry) => [entry.key, entry.reason]),
    [
      ['a', 'unavailable-column'],
      ['unknown', 'unavailable-column']
    ]
  )
  const shown = resolveSqlColumnPins({
    columns: columns({ a: 200, b: 200, middle: 200 }),
    viewportWidth: 800,
    desiredPins
  })
  assert.deepEqual(
    [...shown.appliedPins],
    [
      ['a', 'left'],
      ['b', 'right']
    ]
  )
  assert.equal(shown.pinnedWidth, 400)
})

test('actual flex widths and later user resize govern pause and restore without discarding desired pins', () => {
  const input = {
    columns: columns({ a: 360, b: 360 }),
    viewportWidth: 720,
    desiredPins: [pin('a'), pin('b', 'right')]
  }
  assert.equal(resolveSqlColumnPins(input).appliedPins.size, 2)
  const widened = resolveSqlColumnPins({ ...input, columns: columns({ a: 400, b: 360 }) })
  assert.deepEqual([...widened.appliedPins], [['a', 'left']])
  assert.equal(widened.remainingWidth, 320)
  assert.equal(resolveSqlColumnPins({ ...input, viewportWidth: 900 }).appliedPins.size, 2)
  assert.deepEqual(input.desiredPins, [pin('a'), pin('b', 'right')])
})

test('duplicate column identities and duplicate desired requests never silently pick an entry', () => {
  const duplicated = resolveSqlColumnPins({
    columns: [
      { key: 'a', width: 100 },
      { key: 'a', width: 150 },
      { key: 'b', width: 100 }
    ],
    viewportWidth: 800,
    desiredPins: [pin('a'), pin('b'), pin('b', 'right')]
  })
  assert.equal(duplicated.appliedPins.size, 0)
  assert.deepEqual(
    duplicated.suspended.map((entry) => entry.reason),
    ['duplicate-column', 'duplicate-request', 'duplicate-request']
  )
})

test('prototype-like and numeric keys are matched exactly with Map identities', () => {
  const result = resolveSqlColumnPins({
    columns: [
      { key: '__proto__', width: 100 },
      { key: '10', width: 100 },
      { key: '2', width: 100 }
    ],
    viewportWidth: 800,
    desiredPins: [pin('10'), pin('__proto__', 'right'), pin('2'), pin('toString')]
  })
  assert.deepEqual(
    [...result.appliedPins],
    [
      ['10', 'left'],
      ['__proto__', 'right'],
      ['2', 'left']
    ]
  )
  assert.deepEqual(result.suspended, [{ ...pin('toString'), reason: 'unavailable-column' }])
})

test('nonfinite, zero and negative column widths cannot become free pins', () => {
  const result = resolveSqlColumnPins({
    columns: columns({ nan: NaN, inf: Infinity, zero: 0, negative: -10, good: 100 }),
    viewportWidth: 800,
    desiredPins: ['nan', 'inf', 'zero', 'negative', 'good'].map((key) => pin(key))
  })
  assert.deepEqual([...result.appliedPins], [['good', 'left']])
  assert.equal(result.reservedMiddleWidth, 240)
  assert.deepEqual(
    result.suspended.map((entry) => entry.reason),
    Array(4).fill('invalid-width')
  )
  for (const viewportWidth of [NaN, Infinity, -1, 0]) {
    const invalid = requestSqlColumnPin(
      { columns: columns({ a: 100 }), viewportWidth, desiredPins: [] },
      pin('a')
    )
    assert.equal(invalid.accepted, false)
    assert.equal(invalid.reason, 'invalid-viewport')
    assert.equal(invalid.layout.remainingWidth, 0)
  }
  const narrow = requestSqlColumnPin(
    { columns: columns({ a: 100 }), viewportWidth: 639, desiredPins: [] },
    pin('a')
  )
  assert.equal(narrow.accepted, false)
  assert.equal(narrow.reason, 'narrow-viewport')
  assert.deepEqual(narrow.desiredPins, [])
})

test('decimal pixel sums accept exact boundaries and reject even a positive overflow without epsilon', () => {
  const exact = resolveSqlColumnPins({
    columns: columns({ a: 399.7, b: 0.1, c: 0.2, middle: 100 }),
    viewportWidth: 640,
    desiredPins: [pin('a'), pin('b'), pin('c', 'right')]
  })
  assert.equal(exact.appliedPins.size, 3)
  assert.equal(exact.pinnedWidth, 400)
  assert.equal(exact.remainingWidth, 240)
  const overflow = resolveSqlColumnPins({
    columns: columns({ a: 399.7, b: 0.1 + 0.2, middle: 100 }),
    viewportWidth: 640,
    desiredPins: [pin('a'), pin('b')]
  })
  assert.deepEqual([...overflow.appliedPins], [['a', 'left']])
  assert.equal(overflow.suspended[0].reason, 'insufficient-space')
  const fractionalReserve = resolveSqlColumnPins({
    columns: columns({ a: 700.007, middle: 100 }),
    viewportWidth: 1000.01,
    desiredPins: [pin('a')]
  })
  assert.equal(fractionalReserve.appliedPins.size, 1)
  assert.equal(fractionalReserve.reservedMiddleWidth, 300.003)
  assert.equal(fractionalReserve.remainingWidth, 300.003)
})

test('finite extreme numeric widths do not overflow arithmetic or round away required middle space', () => {
  const result = resolveSqlColumnPins({
    columns: columns({ a: Number.MAX_VALUE, middle: Number.MIN_VALUE }),
    viewportWidth: Number.MAX_VALUE,
    desiredPins: [pin('a')]
  })
  assert.equal(result.appliedPins.size, 0)
  assert.equal(result.reservedMiddleWidth, 320)
  assert.equal(result.remainingWidth, Number.MAX_VALUE)
})

test('requests do not mutate frozen caller state on either acceptance or refusal', () => {
  const input: SqlColumnPinLayoutInput = Object.freeze({
    columns: Object.freeze([
      Object.freeze({ key: 'a', width: 100 }),
      Object.freeze({ key: 'b', width: 100 })
    ]),
    viewportWidth: 800,
    desiredPins: Object.freeze([Object.freeze(pin('a'))])
  })
  assert.equal(requestSqlColumnPin(input, pin('b')).accepted, true)
  assert.equal(requestSqlColumnPin(input, pin('missing')).reason, 'unavailable-column')
  assert.deepEqual(input.desiredPins, [pin('a')])
  assert.equal(requestSqlColumnPin(input, pin('')).reason, 'invalid-key')
})
