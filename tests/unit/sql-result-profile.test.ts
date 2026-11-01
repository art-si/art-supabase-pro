import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import { buildSqlResultProfile } from '../../src/views/data-center/sql-console/modules/result-profile'

test('empty results and NULL distinguish missing values without inventing aggregates', async () => {
  const empty = await buildSqlResultProfile([], { name: 'amount', type: 'numeric' })
  assert.equal(empty.totalRows, 0)
  assert.equal(empty.numeric?.count, 0)
  assert.equal(empty.numeric?.sum, null)
  assert.equal(empty.text.averageLength, null)
  assert.deepEqual(empty.topValues, [])
  const result = await buildSqlResultProfile([{ a: null }, {}, { a: undefined }], { name: 'a' })
  assert.equal(result.nullCount, 3)
  assert.equal(result.undefinedCount, 2)
  assert.equal(result.nonNullCount, 0)
  assert.equal(result.distinctCount, 0)
  assert.equal(result.duplicateCount, 0)
  assert.equal(result.topValuesComplete, true)
})

test('one selected property is read from all original rows without visiting other fields or mutating', async () => {
  let selectedReads = 0
  const rows = Object.freeze(
    ['A', 'B', 'A'].map(
      (value) =>
        new Proxy(
          Object.freeze({
            alias: value,
            get unrelated() {
              assert.fail('profiling must not scan another column')
            }
          }),
          {
            getOwnPropertyDescriptor(target, key) {
              if (key === 'alias') selectedReads++
              return Reflect.getOwnPropertyDescriptor(target, key)
            }
          }
        )
    )
  )
  const result = await buildSqlResultProfile(rows, { name: 'display_name', property: 'alias' })
  assert.equal(selectedReads, 3)
  assert.equal(result.field, 'display_name')
  assert.equal(result.totalRows, 3)
  assert.equal(result.distinctCount, 2)
  assert.equal(result.duplicateCount, 1)
  assert.deepEqual(result.topValues[0], {
    label: '"A"',
    kind: 'string',
    sourceRowIndex: 0,
    count: 2,
    ratio: 2 / 3,
    truncated: false
  })
})

test('missing prototype-named columns are NULL while own columns with those names remain values', async () => {
  for (const property of ['toString', '__proto__', 'constructor']) {
    const inherited: Record<string, unknown> = Object.create({
      get [property]() {
        assert.fail('inherited properties are not SQL result fields')
      }
    })
    const result = await buildSqlResultProfile([{}, inherited, { [property]: 'own value' }], {
      name: property
    })
    assert.equal(result.nullCount, 2)
    assert.equal(result.undefinedCount, 2)
    assert.equal(result.nonNullCount, 1)
    assert.equal(result.distinctCount, 1)
    assert.equal(result.topValues[0].label, '"own value"')
    assert.equal(result.topValues[0].sourceRowIndex, 2)
  }
})

test('scalar identity preserves types, whitespace and exact common counts with all-row ratios', async () => {
  const values = [null, undefined, '', '', ' ', '\t', '1', 1, 1n, true, '1', false, ' ', '\n']
  const result = await buildSqlResultProfile(
    values.map((value) => ({ value })),
    { name: 'value' }
  )
  assert.equal(result.emptyStringCount, 2)
  assert.equal(result.whitespaceCount, 4)
  assert.equal(result.nullCount, 2)
  assert.equal(result.classifiedCount, 12)
  assert.equal(result.distinctCount, 9)
  assert.equal(result.duplicateCount, 3)
  assert.deepEqual(
    result.topValues.slice(0, 3).map(({ label, count, ratio }) => ({ label, count, ratio })),
    [
      { label: '""', count: 2, ratio: 2 / 14 },
      { label: '" "', count: 2, ratio: 2 / 14 },
      { label: '"1"', count: 2, ratio: 2 / 14 }
    ]
  )
  assert.deepEqual(
    result.topValues.filter((value) => value.label === '1').map((value) => value.kind),
    ['number', 'bigint']
  )
  assert.ok(result.topValues.some((value) => value.label === '"\\t"'))
})

test('objects, arrays, dates and unsupported types are classified without coercion or traversal', async () => {
  const object = {
    toJSON() {
      assert.fail('no object serialization')
    },
    toString() {
      assert.fail('no object coercion')
    },
    get nested() {
      assert.fail('no property traversal')
    }
  }
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const values = [object, cyclic, [], new Date('2026-10-31'), Symbol('private'), () => 1, '{}']
  const result = await buildSqlResultProfile(
    values.map((value) => ({ value })),
    {
      name: 'value',
      type: 'jsonb'
    }
  )
  assert.deepEqual(result.categories, { objectCount: 3, arrayCount: 1, unsupportedCount: 2 })
  assert.equal(result.distinctExcludedCount, 6)
  assert.equal(result.distinctCount, 1)
  assert.equal(result.topValuesComplete, false)
  assert.equal(result.topValues[0].label, '"{}"')
  assert.equal(result.topValues[0].ratio, 1 / 7)
  assert.equal(result.numeric, undefined)
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('numeric column sums preserve bigint and high precision decimals through cancellation', async () => {
  const values = [
    9223372036854775807n,
    '-9223372036854775807',
    '0.12345678901234567890123456789',
    '0.2',
    '-0.12345678901234567890123456789',
    '0.1'
  ]
  const result = await buildSqlResultProfile(
    values.map((value) => ({ value })),
    {
      name: 'value',
      type: 'text',
      fullType: 'NUMERIC(100,30)'
    }
  )
  assert.equal(result.numeric?.min, '-9223372036854775807')
  assert.equal(result.numeric?.max, '9223372036854775807')
  assert.equal(result.numeric?.sum, '0.3')
  assert.equal(result.numeric?.average, '0.05')
  assert.equal(result.numeric?.averageApproximate, false)
  assert.equal(result.numeric?.count, 6)
  assert.ok(result.topValues.some((value) => value.label === '9223372036854775807'))
})

test('non-terminating averages are marked approximate while terminating quotients remain exact', async () => {
  const thirds = await buildSqlResultProfile([{ n: '1' }, { n: '0' }, { n: '0' }], {
    name: 'n',
    type: 'numeric'
  })
  assert.equal(thirds.numeric?.average, '0.333333333333333333333333')
  assert.equal(thirds.numeric?.averageApproximate, true)
  const eighth = await buildSqlResultProfile(
    Array.from({ length: 8 }, (_, index) => ({ n: index ? '0' : '1' })),
    { name: 'n', type: 'numeric' }
  )
  assert.equal(eighth.numeric?.average, '0.125')
  assert.equal(eighth.numeric?.averageApproximate, false)
  const zero = await buildSqlResultProfile([{ n: '3' }, { n: '-3' }, { n: '0' }], {
    name: 'n',
    type: 'integer'
  })
  assert.equal(zero.numeric?.average, '0')
  assert.equal(zero.numeric?.averageApproximate, false)
})

test('effective exponent and scale bounds reject oversized domains while supported edges stay exact', async () => {
  const edge = await buildSqlResultProfile([{ n: '1e1024' }, { n: '1e-1024' }], {
    name: 'n',
    type: 'decimal'
  })
  assert.equal(edge.numeric?.sum, `1.${'0'.repeat(2047)}1e+1024`)
  assert.equal(edge.numeric?.average, `5.${'0'.repeat(2047)}5e+1023`)
  assert.equal(edge.numeric?.averageApproximate, false)
  const cancelled = await buildSqlResultProfile(
    [{ n: '1e1024' }, { n: '1e-1024' }, { n: '-1e1024' }],
    { name: 'n', type: 'numeric' }
  )
  assert.equal(cancelled.numeric?.sum, '1e-1024')
  const excluded = await buildSqlResultProfile(
    [
      '9'.repeat(1000) + 'e1024',
      '1e1025',
      '1e-1025',
      '1e999999999999999999999',
      '9'.repeat(1025)
    ].map((n) => ({ n })),
    { name: 'n', type: 'numeric' }
  )
  assert.equal(excluded.numeric?.limitedCount, 5)
  assert.equal(excluded.numeric?.count, 0)
  assert.equal(excluded.numeric?.sum, null)
  assert.ok(excluded.limits.length)
})

test('unsafe JS numbers, nonfinite numbers and invalid values are independently excluded', async () => {
  const values = [
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    -Number.MAX_SAFE_INTEGER - 1,
    NaN,
    Infinity,
    -Infinity,
    'NaN',
    '-Infinity',
    '',
    ' ',
    true,
    {},
    'invalid',
    null,
    '9007199254740993'
  ]
  const result = await buildSqlResultProfile(
    values.map((n) => ({ n })),
    {
      name: 'n',
      type: 'double precision'
    }
  )
  assert.equal(result.numeric?.count, 2)
  assert.equal(result.numeric?.unsafeNumberCount, 2)
  assert.equal(result.numeric?.nonFiniteCount, 5)
  assert.equal(result.numeric?.invalidCount, 5)
  assert.equal(result.numeric?.sum, '18014398509481984')
  assert.equal(result.numeric?.average, '9007199254740992')
  assert.equal(result.numeric?.averageApproximate, false)
})

test('text values that look numeric are never inferred as numeric and lengths use Unicode codepoints', async () => {
  const rows = ['', 'A', '😀A', 'e\u0301', '👩‍💻', '🇨🇳', '123'].map((text) => ({ text }))
  const result = await buildSqlResultProfile(rows, { name: 'text', type: 'varchar(100)' })
  assert.equal(result.numeric, undefined)
  assert.equal(result.text.count, 7)
  assert.equal(result.text.minLength, 0)
  assert.equal(result.text.maxLength, 3)
  assert.equal(result.text.averageLength, '1.85714285714285714285714')
  assert.equal(result.text.averageApproximate, true)
  for (const type of ['text', 'jsonb', 'numeric[]', 'integer[]', undefined]) {
    const numericText = await buildSqlResultProfile([{ a: '123' }], { name: 'a', type })
    assert.equal(numericText.numeric, undefined)
  }
})

test('Top is limited to ten with deterministic first-occurrence ties and bounded Unicode previews', async () => {
  const long = '😀'.repeat(200)
  const result = await buildSqlResultProfile(
    [long, long, ...Array.from({ length: 20 }, (_, index) => `value-${index}`)].map((value) => ({
      value
    })),
    { name: 'value' }
  )
  assert.equal(result.topValues.length, 10)
  assert.equal(result.topValues[0].count, 2)
  assert.equal(result.topValues[0].label, `"${'😀'.repeat(160)}"…`)
  assert.equal(result.topValues[0].truncated, true)
  assert.equal(result.topValues[1].label, '"value-0"')
  assert.equal(result.topValues[9].label, '"value-8"')
  const prefix = 'same-prefix'.repeat(20)
  const samePreview = await buildSqlResultProfile(
    [{ value: prefix + 'A' }, { value: prefix + 'B' }, { value: prefix + 'A' }],
    { name: 'value' }
  )
  assert.equal(samePreview.distinctCount, 2)
  assert.equal(samePreview.topValues[0].label, samePreview.topValues[1].label)
  assert.equal(samePreview.topValues[0].sourceRowIndex, 0)
  assert.equal(samePreview.topValues[1].sourceRowIndex, 1)
  assert.equal(samePreview.topValues[0].count, 2)
  assert.equal(samePreview.topValues[1].count, 1)
})

test('identity, distinct and text budgets explicitly exclude only unsupported work, retaining known counts', async () => {
  const long = ' '.repeat(1_048_577)
  const values = [
    'known',
    long,
    long,
    'known',
    ...Array.from({ length: 10_001 }, (_, index) => `${index}`)
  ]
  const result = await buildSqlResultProfile(
    values.map((v) => ({ v })),
    { name: 'v' }
  )
  assert.equal(result.totalRows, values.length)
  assert.equal(result.text.limitedCount, 2)
  assert.equal(result.whitespaceExcludedCount, 2)
  assert.equal(result.distinctCount, 10_000)
  assert.equal(result.distinctExcludedCount, 4)
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.topValues[0].label, '"known"')
  assert.equal(result.topValues[0].count, 2)
  assert.equal(result.topValuesComplete, false)
  const keyBudget = await buildSqlResultProfile(
    Array.from({ length: 40 }, (_, index) => ({ value: `${index}:` + 'x'.repeat(65_000) })),
    { name: 'value' }
  )
  assert.ok(keyBudget.distinctExcludedCount > 0)
  assert.equal(keyBudget.classifiedCount + keyBudget.distinctExcludedCount, 40)
  const textBudget = await buildSqlResultProfile(
    Array.from({ length: 9 }, () => ({ value: ' '.repeat(1_048_576) })),
    { name: 'value' }
  )
  assert.equal(textBudget.text.count, 8)
  assert.equal(textBudget.text.limitedCount, 1)
  assert.equal(textBudget.whitespaceCount, 8)
  assert.equal(textBudget.whitespaceExcludedCount, 1)
})

test('cooperative batches can cancel an obsolete selection and do not read subsequent rows', async () => {
  const controller = new AbortController()
  let reads = 0
  let yields = 0
  const rows = Array.from(
    { length: 1000 },
    () =>
      new Proxy(
        { value: 'value' },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'value') reads++
            return Reflect.getOwnPropertyDescriptor(target, key)
          }
        }
      )
  )
  await assert.rejects(
    buildSqlResultProfile(
      rows,
      { name: 'value' },
      {
        signal: controller.signal,
        yieldControl: async () => {
          yields++
          controller.abort()
        }
      }
    ),
    { name: 'AbortError' }
  )
  assert.equal(yields, 1)
  assert.equal(reads, 256)
  await assert.rejects(
    buildSqlResultProfile([], { name: 'value' }, { signal: controller.signal }),
    {
      name: 'AbortError'
    }
  )
})

test('reactive reserved numeric properties keep exact values and missing or undefined semantics', async () => {
  const raw = [
    { hasOwnProperty: '0.1' },
    { hasOwnProperty: '0.2' },
    { hasOwnProperty: undefined },
    {},
    { hasOwnProperty: null }
  ]
  const rows = raw.map((row) => reactive<Record<string, unknown>>(row))
  assert.equal(typeof rows[0].hasOwnProperty, 'function')
  const column = { name: 'amount', property: 'hasOwnProperty', type: 'numeric' }
  const result = await buildSqlResultProfile(rows, column)
  assert.equal(result.field, 'amount')
  assert.equal(result.numeric?.count, 2)
  assert.equal(result.numeric?.sum, '0.3')
  assert.equal(result.numeric?.average, '0.15')
  assert.equal(result.nullCount, 3)
  assert.equal(result.undefinedCount, 2)
  assert.equal(result.distinctCount, 2)
  assert.equal(result.duplicateCount, 0)
  assert.deepEqual(result, await buildSqlResultProfile(raw, column))
})

test('reactive Vue-flag text fields retain strings, blanks and top frequencies without numeric inference', async () => {
  const raw = [
    { __v_isReactive: '001' },
    { __v_isReactive: '001' },
    { __v_isReactive: '' },
    { __v_isReactive: '  ' },
    { __v_isReactive: undefined },
    {}
  ]
  const rows = raw.map((row) => reactive<Record<string, unknown>>(row))
  assert.equal(rows[0].__v_isReactive, true)
  const column = { name: 'flag_text', property: '__v_isReactive', type: 'text' }
  const result = await buildSqlResultProfile(rows, column)
  assert.equal(result.numeric, undefined)
  assert.equal(result.nullCount, 2)
  assert.equal(result.undefinedCount, 2)
  assert.equal(result.emptyStringCount, 1)
  assert.equal(result.whitespaceCount, 1)
  assert.equal(result.distinctCount, 3)
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.text.count, 4)
  assert.equal(result.text.averageLength, '2')
  assert.equal(result.topValues[0].label, '"001"')
  assert.equal(result.topValues[0].count, 2)
  assert.equal(result.topValues[0].ratio, 2 / 6)
  assert.deepEqual(result, await buildSqlResultProfile(raw, column))
})

test('reactive fake-Ref JSON remains a complex value instead of its unwrapped scalar', async () => {
  const fakeRef = { __v_isRef: true, value: 'scalar disguise', extra: 'preserve-me' }
  const fakeRaw = { __v_raw: 'literal raw data', value: 'another object' }
  const raw = [
    { payload: fakeRef },
    { payload: fakeRaw },
    { payload: 'scalar disguise' },
    { payload: undefined },
    {}
  ]
  const rows = raw.map((row) => reactive<Record<string, unknown>>(row))
  assert.equal(rows[0].payload, 'scalar disguise')
  const result = await buildSqlResultProfile(rows, { name: 'payload', type: 'jsonb' })
  assert.deepEqual(result.categories, { objectCount: 2, arrayCount: 0, unsupportedCount: 0 })
  assert.equal(result.nonNullCount, 3)
  assert.equal(result.nullCount, 2)
  assert.equal(result.undefinedCount, 2)
  assert.equal(result.distinctExcludedCount, 2)
  assert.equal(result.distinctCount, 1)
  assert.equal(result.topValuesComplete, false)
  assert.equal(result.topValues[0].label, '"scalar disguise"')
  assert.equal(result.topValues[0].count, 1)
  assert.equal(result.topValues[0].ratio, 1 / 5)
  assert.deepEqual(result, await buildSqlResultProfile(raw, { name: 'payload', type: 'jsonb' }))
  assert.equal(fakeRef.extra, 'preserve-me')
})
