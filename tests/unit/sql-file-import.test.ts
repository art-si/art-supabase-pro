import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SqlFileImportError,
  decodeSqlFile,
  getSqlFilePreview,
  inspectSqlFileBom,
  sqlFileEncodingOptions,
  validateSqlFile,
  type SqlFileEncoding,
  type SqlFileImportErrorCode
} from '../../src/views/data-center/sql-console/modules/sql-file-import'

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)
const utf16le = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf16le'))
const utf16be = (text: string): Uint8Array => {
  const bytes = utf16le(text)
  for (let index = 0; index < bytes.length; index += 2)
    [bytes[index], bytes[index + 1]] = [bytes[index + 1], bytes[index]]
  return bytes
}

const assertCode = (action: () => unknown, code: SqlFileImportErrorCode): void => {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof SqlFileImportError)
    assert.equal(error.code, code)
    assert.match(error.message, /[\u4e00-\u9fff]/)
    return true
  })
}

test('local SQL file validation preserves the case-insensitive extension and exact 1000000-byte limit', () => {
  validateSqlFile('query.sql', 0)
  validateSqlFile('中文.SQL', 1_000_000)
  assertCode(() => validateSqlFile('query.txt', 10), 'INVALID_FILE_TYPE')
  assertCode(() => validateSqlFile('query.sql.exe', 10), 'INVALID_FILE_TYPE')
  assertCode(() => validateSqlFile('query.sql', 1_000_001), 'FILE_TOO_LARGE')
  for (const size of [-1, 0.5, NaN, Infinity])
    assertCode(() => validateSqlFile('query.sql', size), 'INVALID_FILE_SIZE')
  assert.deepEqual(
    sqlFileEncodingOptions.map(({ value }) => value),
    ['utf-8', 'utf-16le', 'utf-16be', 'gb18030']
  )
})

test('UTF-8 decoding preserves complete SQL, CRLF, whitespace, supplementary characters and literal replacement characters', () => {
  const sql = " \t-- 中文😀\r\nSELECT '0.123456789012345678901', '�', '\u0001\u0007';\r\n  "
  assert.equal(inspectSqlFileBom(utf8(sql)), null)
  assert.equal(decodeSqlFile(utf8(sql), 'utf-8'), sql)
  assert.equal(decodeSqlFile(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(sql)]), 'utf-8'), sql)
})

test('BOM detection distinguishes supported encodings and strips exactly one transport marker', () => {
  const cases: Array<{
    encoding: SqlFileEncoding
    bom: number[]
    text: Uint8Array
  }> = [
    { encoding: 'utf-8', bom: [0xef, 0xbb, 0xbf], text: utf8('\uFEFFSELECT 1;') },
    { encoding: 'utf-16le', bom: [0xff, 0xfe], text: utf16le('\uFEFFSELECT 1;') },
    { encoding: 'utf-16be', bom: [0xfe, 0xff], text: utf16be('\uFEFFSELECT 1;') },
    {
      encoding: 'gb18030',
      bom: [0x84, 0x31, 0x95, 0x33],
      text: new Uint8Array([0x84, 0x31, 0x95, 0x33, ...utf8('SELECT 1;')])
    }
  ]
  assert.equal(
    new TextDecoder('gb18030', { fatal: true, ignoreBOM: true }).decode(
      new Uint8Array([0x84, 0x31, 0x95, 0x33])
    ),
    '\uFEFF'
  )
  for (const { encoding, bom, text } of cases) {
    const bytes = new Uint8Array([...bom, ...text])
    assert.deepEqual(inspectSqlFileBom(bytes), { encoding, length: bom.length })
    assert.equal(decodeSqlFile(bytes, encoding), '\uFEFFSELECT 1;', encoding)
  }
})

test('UTF-16 with or without BOM requires the matching explicit endian encoding and retains original text', () => {
  const sql = "-- 中文😀\r\nSELECT '金额', 9007199254740993;\r\n"
  for (const [encoding, encode, bom] of [
    ['utf-16le', utf16le, [0xff, 0xfe]],
    ['utf-16be', utf16be, [0xfe, 0xff]]
  ] as const) {
    const bytes = encode(sql)
    assert.equal(inspectSqlFileBom(bytes), null)
    assert.equal(decodeSqlFile(bytes, encoding), sql)
    assert.equal(decodeSqlFile(new Uint8Array([...bom, ...bytes]), encoding), sql)
  }
  const withoutBom = utf16le('SELECT 1;')
  assertCode(() => decodeSqlFile(withoutBom, 'utf-8'), 'NUL_CONTENT')
})

test('explicit GB18030 decodes legacy GBK Chinese and four-byte emoji without guessing UTF-8 fallbacks', () => {
  const bytes = new Uint8Array([
    ...utf8("SELECT '"),
    0xd6,
    0xd0,
    0xce,
    0xc4,
    0x94,
    0x39,
    0xfc,
    0x36,
    ...utf8("';")
  ])
  assert.equal(decodeSqlFile(bytes, 'gb18030'), "SELECT '中文😀';")
  assertCode(() => decodeSqlFile(bytes, 'utf-8'), 'DECODE_FAILED')
  const padded = new Uint8Array([0, 0, ...bytes, 0])
  assert.equal(decodeSqlFile(padded.subarray(2, -1), 'gb18030'), "SELECT '中文😀';")
})

test('malformed UTF-8, truncated UTF-16 and incomplete GB18030 reject instead of substituting U+FFFD', () => {
  for (const [encoding, bytes] of [
    ['utf-8', [0xc3, 0x28]],
    ['utf-8', [0xef, 0xbb]],
    ['utf-16le', [0x41]],
    ['utf-16le', [0x00, 0xd8]],
    ['utf-16be', [0xd8, 0x00]],
    ['gb18030', [0x81]],
    ['gb18030', [0x81, 0x30, 0x81]]
  ] as const)
    assertCode(() => decodeSqlFile(new Uint8Array(bytes), encoding), 'DECODE_FAILED')
})

test('BOM mismatches and unsupported standard markers block before an incorrect decode can be accepted', () => {
  for (const [bom, encoding] of [
    [[0xef, 0xbb, 0xbf], 'gb18030'],
    [[0xff, 0xfe], 'utf-8'],
    [[0xfe, 0xff], 'utf-16le'],
    [[0x84, 0x31, 0x95, 0x33], 'utf-8']
  ] as const)
    assertCode(
      () => decodeSqlFile(new Uint8Array([...bom, ...utf8('SELECT 1;')]), encoding),
      'ENCODING_MISMATCH'
    )
  for (const bom of [
    [0xff, 0xfe, 0x00, 0x00],
    [0x00, 0x00, 0xfe, 0xff],
    [0x2b, 0x2f, 0x76, 0x38, 0x2d],
    [0xf7, 0x64, 0x4c]
  ]) {
    const bytes = new Uint8Array([...bom, ...utf8('SELECT 1;')])
    assertCode(() => inspectSqlFileBom(bytes), 'UNSUPPORTED_BOM')
    assertCode(() => decodeSqlFile(bytes, 'utf-16le'), 'UNSUPPORTED_BOM')
  }
})

test('empty or whitespace-only files and decoded NUL are blocked without imposing a general binary classifier', () => {
  for (const sql of ['', ' \r\n\t ', '\uFEFF  '])
    assertCode(() => decodeSqlFile(utf8(sql), 'utf-8'), 'EMPTY_SQL')
  assertCode(() => decodeSqlFile(utf8("SELECT '\0';"), 'utf-8'), 'NUL_CONTENT')
  assert.equal(decodeSqlFile(utf8("SELECT '\u0001\u0007';"), 'utf-8'), "SELECT '\u0001\u0007';")
})

test('decoding enforces the actual buffer byte limit independently of file metadata', () => {
  const bytes = utf8('-'.repeat(1_000_000))
  const sql = decodeSqlFile(bytes, 'utf-8')
  assert.equal(sql.length, 1_000_000)
  assertCode(() => decodeSqlFile(new Uint8Array(1_000_001), 'utf-8'), 'FILE_TOO_LARGE')
  const preview = getSqlFilePreview(sql)
  assert.equal(preview.code.length, 20_000)
  assert.equal(preview.truncated, true)
  assert.equal(sql.length, 1_000_000)
})

test('previews alone normalize CRLF and stop at 100 lines without shortening full decoded SQL', () => {
  const sql = Array.from({ length: 101 }, (_, index) => `SELECT ${index};`).join('\r\n')
  const decoded = decodeSqlFile(utf8(sql), 'utf-8')
  const preview = getSqlFilePreview(decoded)
  assert.equal(preview.truncated, true)
  assert.equal(preview.code.split('\n').length, 100)
  assert.ok(preview.code.endsWith('SELECT 99;'))
  assert.equal(preview.code.includes('\r'), false)
  assert.equal(decoded, sql)
  const exact = Array.from({ length: 100 }, () => 'SELECT 1;').join('\r\n')
  assert.deepEqual(getSqlFilePreview(exact), {
    code: exact.replaceAll('\r\n', '\n'),
    truncated: false
  })
})

test('preview character budgets preserve surrogate pairs and joined emoji rather than splitting Unicode symbols', () => {
  const pair = `${'x'.repeat(19_999)}😀tail`
  const joined = `${'x'.repeat(19_998)}👩‍💻tail`
  for (const [sql, length] of [
    [pair, 19_999],
    [joined, 19_998]
  ] as const) {
    const preview = getSqlFilePreview(sql)
    assert.equal(preview.code.length, length)
    assert.equal(preview.truncated, true)
    assert.equal(preview.code, 'x'.repeat(length))
    assert.equal(decodeSqlFile(utf8(sql), 'utf-8'), sql)
  }
  assert.deepEqual(getSqlFilePreview("SELECT '中文😀👩‍💻';"), {
    code: "SELECT '中文😀👩‍💻';",
    truncated: false
  })
})
