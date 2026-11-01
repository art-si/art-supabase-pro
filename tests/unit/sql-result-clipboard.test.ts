import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSqlResultSnapshot,
  type SqlResultSnapshot
} from '../../src/views/data-center/sql-console/modules/result-compare'
import {
  createSqlResultClipboard,
  SqlResultClipboardError,
  type SqlResultClipboardErrorCode
} from '../../src/views/data-center/sql-console/modules/result-clipboard'

const assertCode = (snapshot: SqlResultSnapshot, code: SqlResultClipboardErrorCode): void => {
  assert.throws(
    () => createSqlResultClipboard(snapshot),
    (error: unknown) => {
      assert.ok(error instanceof SqlResultClipboardError)
      assert.equal(error.code, code)
      assert.match(error.message, /[\u4e00-\u9fff]/)
      return true
    }
  )
}

test('clipboard preserves the projected field order and every matching row rather than a page slice', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [
      { id: 3, actual: 'third', hidden: 'not authorized' },
      { id: 1, actual: 'first', hidden: 'not authorized' }
    ],
    columns: [{ name: 'shown', property: 'actual' }, { name: 'id' }]
  })
  const result = createSqlResultClipboard(snapshot)
  assert.equal(result.rowCount, 2)
  assert.equal(result.columnCount, 2)
  assert.equal(result.text, 'shown\tid\r\nthird\t3\r\nfirst\t1')
  assert.equal(
    result.html,
    '<table style="white-space:pre-wrap"><thead><tr><th>shown</th><th>id</th></tr></thead><tbody><tr><td>third</td><td>3</td></tr><tr><td>first</td><td>1</td></tr></tbody></table>'
  )
  assert.equal(result.text.includes('not authorized'), false)
  assert.equal(result.html.includes('not authorized'), false)
})

test('TSV quotes tabs, CRLF, lone line breaks and double quotes without changing cell text', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [{ actual: 'a\tb\r\n"quoted"\rc', other: ' lone\nline ', tail: '' }],
    columns: [{ name: 'head\t"one"', property: 'actual' }, { name: 'other' }, { name: 'tail' }]
  })
  const result = createSqlResultClipboard(snapshot)
  assert.equal(
    result.text,
    '"head\t""one"""\tother\ttail\r\n"a\tb\r\n""quoted""\rc"\t" lone\nline "\t'
  )
  assert.ok(result.html.includes('<td>a\tb\r\n&quot;quoted&quot;\rc</td>'))
  assert.ok(result.html.includes('<td> lone\nline </td><td></td>'))
})

test('HTML escapes headers and values while formula-shaped text remains literal data', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [
      {
        actual: '<img src=x onerror="alert(1)">&\'',
        formula: '=1+1',
        plus: '+SUM(A1)',
        minus: '-1',
        at: '@value'
      }
    ],
    columns: [
      { name: '<header>&"\'', property: 'actual' },
      { name: 'formula' },
      { name: 'plus' },
      { name: 'minus' },
      { name: 'at' }
    ]
  })
  const result = createSqlResultClipboard(snapshot)
  assert.ok(result.html.includes('<th>&lt;header&gt;&amp;&quot;&#39;</th>'))
  assert.ok(
    result.html.includes('<td>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;</td>')
  )
  assert.ok(result.html.includes('<td>=1+1</td><td>+SUM(A1)</td><td>-1</td><td>@value</td>'))
  assert.ok(result.text.endsWith('\t=1+1\t+SUM(A1)\t-1\t@value'))
  assert.doesNotMatch(result.html, /<img|<script|<a\b|x:f=|mso-|x:str/u)
})

test('readable values preserve precision strings, leading zeroes and bigint without numeric parsing', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [
      {
        exact: '9007199254740993.123456789012345678901',
        zeroes: '  0000123  ',
        boolean: false,
        number: 0.1,
        integer: 9007199254740993n,
        jsonText: '{"value":9007199254740993}',
        payload: { list: [9007199254740993n, null, false] }
      }
    ],
    columns: [
      { name: 'exact' },
      { name: 'zeroes' },
      { name: 'boolean' },
      { name: 'number' },
      { name: 'integer' },
      { name: 'jsonText' },
      { name: 'payload' }
    ]
  })
  const result = createSqlResultClipboard(snapshot)
  assert.equal(
    result.text,
    'exact\tzeroes\tboolean\tnumber\tinteger\tjsonText\tpayload\r\n9007199254740993.123456789012345678901\t  0000123  \tfalse\t0.1\t9007199254740993\t"{""value"":9007199254740993}"\t"{""list"":[""9007199254740993"",null,false]}"'
  )
  assert.ok(result.html.includes('<td>  0000123  </td>'))
  assert.ok(result.html.includes('<td>9007199254740993.123456789012345678901</td>'))
  assert.equal((snapshot.rows[0].payload as { list: unknown[] }).list[0], 9007199254740993n)
})

test('NULL, own undefined, missing fields and empty text follow the existing readable Excel policy', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [{ nil: null, undef: undefined, literal: 'NULL', empty: '' }],
    columns: [
      { name: 'nil' },
      { name: 'undef' },
      { name: 'missing' },
      { name: 'literal' },
      { name: 'empty' }
    ]
  })
  const result = createSqlResultClipboard(snapshot)
  assert.equal(result.text, 'nil\tundef\tmissing\tliteral\tempty\r\nNULL\t\t\tNULL\t')
  assert.ok(result.html.includes('<td>NULL</td><td></td><td></td><td>NULL</td><td></td>'))
})

test('prototype-like fields and numeric aliases keep declared order and never read inherited properties', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [
      Object.fromEntries([
        ['__proto__', 'own proto'],
        ['constructor', 'own constructor'],
        ['hasOwnProperty', 'own method'],
        ['10', 'ten'],
        ['2', 'two']
      ])
    ],
    columns: ['10', '__proto__', '2', 'constructor', 'hasOwnProperty', 'toString'].map((name) => ({
      name
    }))
  })
  const result = createSqlResultClipboard(snapshot)
  assert.equal(
    result.text,
    '10\t__proto__\t2\tconstructor\thasOwnProperty\ttoString\r\nten\town proto\ttwo\town constructor\town method\t'
  )
  assert.equal(Object.getPrototypeOf(snapshot.rows[0]), Object.prototype)
})

test('zero rows copy ordered headers and an empty tbody, while zero fields fail explicitly', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [],
    columns: [{ name: 'second' }, { name: 'first' }]
  })
  const result = createSqlResultClipboard(snapshot)
  assert.equal(result.text, 'second\tfirst')
  assert.equal(result.rowCount, 0)
  assert.equal(result.columnCount, 2)
  assert.ok(result.html.endsWith('</thead><tbody></tbody></table>'))
  assertCode({ ...snapshot, columns: [] }, 'INVALID_COLUMNS')
})

test('clipboard generation never mutates a frozen snapshot or its projected rows and metadata', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [{ actual: 'original' }],
    columns: [{ name: 'display', property: 'actual' }],
    query: 'SELECT actual AS display',
    label: '原始结果',
    truncated: true
  })
  snapshot.rows.forEach(Object.freeze)
  snapshot.columns.forEach(Object.freeze)
  Object.freeze(snapshot.rows)
  Object.freeze(snapshot.columns)
  Object.freeze(snapshot)
  assert.equal(createSqlResultClipboard(snapshot).text, 'display\r\noriginal')
  assert.equal(snapshot.query, 'SELECT actual AS display')
  assert.equal(snapshot.truncated, true)
})

test('the UTF16 cell limit includes headers and accepts complete emoji at the exact boundary', async () => {
  const exact = '😀' + 'a'.repeat(32_765)
  const snapshot = await createSqlResultSnapshot({
    rows: [{ value: exact }],
    columns: [{ name: 'value' }]
  })
  assert.ok(createSqlResultClipboard(snapshot).text.endsWith(exact))
  assertCode({ ...snapshot, rows: [{ value: exact + 'a' }] }, 'CELL_LIMIT')
  assertCode({ ...snapshot, rows: [], columns: [{ name: 'h'.repeat(32_768) }] }, 'CELL_LIMIT')
})

test('NUL and lone surrogates fail instead of replacement; real emoji and literal replacement characters survive', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [{ value: '中😀🧪�' }],
    columns: [{ name: 'value' }]
  })
  assert.equal(createSqlResultClipboard(snapshot).text, 'value\r\n中😀🧪�')
  for (const value of ['a\u0000b', '\uD800', '\uDC00', 'a\uD800z']) {
    assertCode({ ...snapshot, rows: [{ value }] }, 'INVALID_TEXT')
    assertCode({ ...snapshot, rows: [], columns: [{ name: value }] }, 'INVALID_TEXT')
  }
})

test('the combined HTML and TSV UTF8 payload accepts exactly 1 MiB and refuses the next characters', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [...Array.from({ length: 33 }, () => ({ value: 'a'.repeat(15_000) })), { value: '' }],
    columns: [{ name: 'value' }]
  })
  const base = createSqlResultClipboard(snapshot)
  const bytes = (value: string) => new TextEncoder().encode(value).byteLength
  const room = 1024 * 1024 - bytes(base.html) - bytes(base.text)
  // '<' contributes one TSV byte and four escaped HTML bytes, allowing an odd byte remainder.
  const prefix = room % 2 ? '<' : ''
  const fill = prefix + 'a'.repeat((room - (prefix ? 5 : 0)) / 2)
  assert.ok(fill.length <= 32_767)
  snapshot.rows[snapshot.rows.length - 1].value = fill
  const exact = createSqlResultClipboard(snapshot)
  assert.equal(bytes(exact.html) + bytes(exact.text), 1024 * 1024)
  snapshot.rows[snapshot.rows.length - 1].value = fill + 'a'
  assertCode(snapshot, 'PAYLOAD_LIMIT')
})

test('UTF8 multibyte text and HTML escape expansion both count toward the shared byte budget', async () => {
  for (const value of ['中'.repeat(10_000), '&'.repeat(10_000)]) {
    const snapshot = await createSqlResultSnapshot({
      rows: Array.from({ length: 18 }, () => ({ value })),
      columns: [{ name: 'value' }]
    })
    assertCode(snapshot, 'PAYLOAD_LIMIT')
  }
})

test('a valid missing-heavy snapshot cannot create unbounded table markup or silently truncate rows', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: Array.from({ length: 1000 }, () => ({})),
    columns: Array.from({ length: 128 }, (_, index) => ({ name: `field_${index}` }))
  })
  assertCode(snapshot, 'PAYLOAD_LIMIT')
  assert.equal(snapshot.rows.length, 1000)
  assert.equal(snapshot.columns.length, 128)
})
