import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCaretDiagnostic,
  parseSqlErrorLocation,
  type SqlErrorLocation
} from '../../src/utils/sql-workbench'

test('structured PostgreSQL positions take priority and map Unicode code points to complete UTF-16 ranges', () => {
  for (const [query, position, expected] of [
    ["SELECT '😀中', bad", 14, { lineNumber: 1, startColumn: 15, endColumn: 16 }],
    ["SELECT 'e\u0301', bad", '14', { lineNumber: 1, startColumn: 14, endColumn: 15 }],
    ["SELECT '👩‍💻', bad", 15, { lineNumber: 1, startColumn: 17, endColumn: 18 }],
    ['A😀B', 2, { lineNumber: 1, startColumn: 2, endColumn: 4 }],
    ['A😀B', 3, { lineNumber: 1, startColumn: 4, endColumn: 5 }]
  ] as const)
    assert.deepEqual(
      parseSqlErrorLocation('Position: 1\nLINE 1: unrelated\n        ^', { query, position }),
      expected
    )
})

test('original CRLF, CR and LF retain character offsets while producing one display line per newline', () => {
  assert.deepEqual(parseSqlErrorLocation('', { query: "SELECT '😀中';\r\nBAD", position: 15 }), {
    lineNumber: 2,
    startColumn: 1,
    endColumn: 2
  })
  for (const [query, position] of [
    ['A\r\nB', 4],
    ['A\rB', 3],
    ['A\nB', 3]
  ] as const)
    assert.deepEqual(parseSqlErrorLocation('', { query, position }), {
      lineNumber: 2,
      startColumn: 1,
      endColumn: 2
    })
  for (const position of [2, 3])
    assert.deepEqual(parseSqlErrorLocation('', { query: 'A\r\nB', position }), {
      lineNumber: 1,
      startColumn: 2,
      endColumn: 2
    })
})

test('EOF positions are valid point ranges including an empty trailing line or empty SQL', () => {
  for (const [query, position, expected] of [
    ['A😀', 3, { lineNumber: 1, startColumn: 4, endColumn: 4 }],
    ['A\r\n', 4, { lineNumber: 2, startColumn: 1, endColumn: 1 }],
    ['', 1, { lineNumber: 1, startColumn: 1, endColumn: 1 }]
  ] as const)
    assert.deepEqual(parseSqlErrorLocation('', { query, position }), expected)
})

test('invalid explicit positions fail closed instead of falling back to another message location', () => {
  const message = 'Position: 1\nLINE 1: ABC\n        ^'
  for (const position of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    '',
    ' 1',
    '+1',
    '1.0',
    '1e0',
    '1 trailing',
    '99999999999999999999999999',
    5
  ])
    assert.equal(parseSqlErrorLocation(message, { query: 'ABC', position }), null, `${position}`)
  // UTF-16 length alone cannot validate the PostgreSQL code-point index.
  assert.equal(parseSqlErrorLocation(message, { query: '😀', position: 3 }), null)
  assert.equal(
    Reflect.apply(parseSqlErrorLocation, undefined, [
      message,
      {
        query: 'ABC',
        position: {
          valueOf() {
            assert.fail('untrusted positions must not be coerced')
          }
        }
      }
    ]),
    null
  )
})

test('standalone Position messages use the captured query rather than assuming the first line', () => {
  assert.deepEqual(
    parseSqlErrorLocation('ERROR: syntax error\r\nPosition: 4', { query: 'A\r\nB' }),
    {
      lineNumber: 2,
      startColumn: 1,
      endColumn: 2
    }
  )
  assert.equal(parseSqlErrorLocation('Position: 4'), null)
  for (const message of [
    'Internal Position: 1',
    'Position: 1.5',
    'Position: 1e0',
    'Position: 1\nPosition: 2',
    'SOURCE LINE: 42'
  ])
    assert.equal(parseSqlErrorLocation(message, { query: 'ABC' }), null)
})

test('legacy ASCII caret reports subtract the complete LINE prefix and preserve the old single-argument caller', () => {
  const message = 'ERROR: syntax error\nLINE 2: SELCT 2;\n        ^'
  assert.deepEqual(parseSqlErrorLocation(message), {
    lineNumber: 2,
    startColumn: 1,
    endColumn: 2
  })
  assert.deepEqual(parseSqlErrorLocation(message, { query: 'SELECT 1;\r\nSELCT 2;' }), {
    lineNumber: 2,
    startColumn: 1,
    endColumn: 2
  })
  assert.deepEqual(parseSqlErrorLocation('LINE 123: BAD\r\n           ^'), {
    lineNumber: 123,
    startColumn: 2,
    endColumn: 3
  })
  assert.deepEqual(parseSqlErrorLocation('LINE 1: \n        ^'), {
    lineNumber: 1,
    startColumn: 1,
    endColumn: 1
  })
})

test('unverifiable legacy caret positions never guess screen widths, truncated text or internal-query origins', () => {
  for (const message of [
    'LINE 1: 中文 BAD\n          ^',
    'LINE 1: 😀 BAD\n          ^',
    'LINE 1: A\tB\n         ^',
    'LINE 1: ...B\n           ^',
    'LINE 1: ABC\n       ^',
    'LINE 1: ABC\n            ^',
    'LINE 0: ABC\n        ^',
    'LINE 1: ABC\n        ^\nLINE 2: DEF\n        ^',
    'Internal Position: 1\nLINE 1: ABC\n        ^',
    'QUERY: ABC\nLINE 1: ABC\n        ^',
    'CONTEXT: function call\nLINE 1: ABC\n        ^'
  ])
    assert.equal(parseSqlErrorLocation(message), null, message)
  assert.equal(parseSqlErrorLocation('LINE 2: ABC\n        ^', { query: 'ABC\nDIFFERENT' }), null)
  assert.deepEqual(parseSqlErrorLocation('LINE 1: ...B\n        ^', { query: '...B' }), {
    lineNumber: 1,
    startColumn: 1,
    endColumn: 2
  })
})

test('diagnostics show exact line and UTF-16 column without faking wide-character caret alignment', () => {
  const sql = "SELECT '😀中', bad\r\nSELECT 2;"
  const location = parseSqlErrorLocation('', { query: sql, position: 14 })
  assert.equal(buildCaretDiagnostic(sql, location), "第 1 行，第 15 列\nSELECT '😀中', bad")
  assert.equal(
    buildCaretDiagnostic('A\r\nB', { lineNumber: 2, startColumn: 1, endColumn: 2 }),
    '第 2 行，第 1 列\nB'
  )
  assert.equal(
    buildCaretDiagnostic('A😀', { lineNumber: 1, startColumn: 4, endColumn: 4 }),
    '第 1 行，第 4 列\nA😀'
  )
})

test('long diagnostics are bounded around the error and never split a surrogate pair', () => {
  const sql = `${'x'.repeat(999_998)}😀BAD${'y'.repeat(500)}`
  const location = { lineNumber: 1, startColumn: 1_000_001, endColumn: 1_000_002 }
  const diagnostic = buildCaretDiagnostic(sql, location)
  assert.ok(diagnostic.length < 310)
  assert.ok(diagnostic.includes('😀BAD'))
  assert.ok(diagnostic.includes('\n…'))
  assert.ok(diagnostic.endsWith('…'))
  for (const snippet of [
    buildCaretDiagnostic(`A${'x'.repeat(118)}😀${'y'.repeat(500)}`, {
      lineNumber: 1,
      startColumn: 241,
      endColumn: 242
    }),
    buildCaretDiagnostic(`${'x'.repeat(239)}😀tail`, {
      lineNumber: 1,
      startColumn: 1,
      endColumn: 2
    })
  ])
    assert.equal(snippet.isWellFormed(), true)
})

test('malformed diagnostic locations return empty text without allocating enormous caret padding', () => {
  const invalid: SqlErrorLocation[] = [
    { lineNumber: 0, startColumn: 1, endColumn: 2 },
    { lineNumber: 2, startColumn: 1, endColumn: 2 },
    { lineNumber: 1, startColumn: 0, endColumn: 1 },
    { lineNumber: 1, startColumn: 3, endColumn: 2 },
    { lineNumber: 1, startColumn: 1e15, endColumn: 1e15 + 1 },
    { lineNumber: 1, startColumn: Infinity, endColumn: Infinity },
    { lineNumber: 1, startColumn: 1.5, endColumn: 2 }
  ]
  for (const location of invalid) assert.equal(buildCaretDiagnostic('ABC', location), '')
  assert.equal(buildCaretDiagnostic('ABC', null), '')
  assert.equal(buildCaretDiagnostic('A😀B', { lineNumber: 1, startColumn: 3, endColumn: 4 }), '')
  assert.equal(buildCaretDiagnostic('A😀B', { lineNumber: 1, startColumn: 2, endColumn: 3 }), '')
})
