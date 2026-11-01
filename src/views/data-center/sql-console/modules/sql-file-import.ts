import { takeWhile, toArray } from 'lodash-es'

export type SqlFileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030'

export const sqlFileEncodingOptions: Array<{ label: string; value: SqlFileEncoding }> = [
  { label: 'UTF-8', value: 'utf-8' },
  { label: 'UTF-16 LE', value: 'utf-16le' },
  { label: 'UTF-16 BE', value: 'utf-16be' },
  { label: 'GB18030（兼容 GBK）', value: 'gb18030' }
]

export type SqlFileImportErrorCode =
  | 'INVALID_FILE_TYPE'
  | 'INVALID_FILE_SIZE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_BOM'
  | 'ENCODING_MISMATCH'
  | 'UNSUPPORTED_ENCODING'
  | 'DECODE_FAILED'
  | 'NUL_CONTENT'
  | 'EMPTY_SQL'

export class SqlFileImportError extends Error {
  readonly code: SqlFileImportErrorCode

  constructor(code: SqlFileImportErrorCode, message: string) {
    super(message)
    this.name = 'SqlFileImportError'
    this.code = code
  }
}

export interface SqlFileBom {
  encoding: SqlFileEncoding
  length: number
}

const maxFileBytes = 1_000_000
const maxPreviewLines = 100
const maxPreviewCharacters = 20_000

function validateSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new SqlFileImportError('INVALID_FILE_SIZE', 'SQL 文件大小无效，请重新选择文件')
  if (size > maxFileBytes) throw new SqlFileImportError('FILE_TOO_LARGE', 'SQL 文件不能超过 1 MB')
}

export function validateSqlFile(name: string, size: number): void {
  if (!name.toLowerCase().endsWith('.sql'))
    throw new SqlFileImportError('INVALID_FILE_TYPE', '请选择 .sql 文件')
  validateSize(size)
}

/** Recognize transport markers only; marker-free legacy files are never guessed. */
export function inspectSqlFileBom(bytes: Uint8Array): SqlFileBom | null {
  const starts = (prefix: readonly number[]): boolean =>
    prefix.every((byte, index) => bytes[index] === byte)
  // UTF-32 LE must be checked before its shared FF FE prefix is accepted as UTF-16.
  const unsupported = [
    [0xff, 0xfe, 0x00, 0x00],
    [0x00, 0x00, 0xfe, 0xff],
    [0x00, 0x00, 0xff, 0xfe],
    [0xfe, 0xff, 0x00, 0x00],
    [0xf7, 0x64, 0x4c],
    [0xdd, 0x73, 0x66, 0x73],
    [0x0e, 0xfe, 0xff],
    [0xfb, 0xee, 0x28]
  ]
  const utf7 = starts([0x2b, 0x2f, 0x76]) && [0x38, 0x39, 0x2b, 0x2f].includes(bytes[3])
  if (utf7 || unsupported.some(starts))
    throw new SqlFileImportError(
      'UNSUPPORTED_BOM',
      '文件使用了暂不支持的编码标记，请先另存为 UTF-8、UTF-16 或 GB18030 后重试'
    )
  if (starts([0xef, 0xbb, 0xbf])) return { encoding: 'utf-8', length: 3 }
  if (starts([0xff, 0xfe])) return { encoding: 'utf-16le', length: 2 }
  if (starts([0xfe, 0xff])) return { encoding: 'utf-16be', length: 2 }
  if (starts([0x84, 0x31, 0x95, 0x33])) return { encoding: 'gb18030', length: 4 }
  return null
}

/** Decode the entire bounded file without replacing malformed bytes or changing SQL whitespace. */
export function decodeSqlFile(bytes: Uint8Array, encoding: SqlFileEncoding): string {
  validateSize(bytes.byteLength)
  const bom = inspectSqlFileBom(bytes)
  if (bom && bom.encoding !== encoding) {
    const label = sqlFileEncodingOptions.find((option) => option.value === bom.encoding)?.label
    throw new SqlFileImportError(
      'ENCODING_MISMATCH',
      `文件带有 ${label} 编码标记，请选择匹配的编码后重试`
    )
  }
  let decoder: TextDecoder
  try {
    // We remove exactly one detected transport BOM ourselves; a second U+FEFF is SQL data.
    decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true })
  } catch {
    throw new SqlFileImportError(
      'UNSUPPORTED_ENCODING',
      '当前浏览器不支持所选编码，请使用支持此编码的浏览器后重试'
    )
  }
  let sql: string
  try {
    sql = decoder.decode(bytes.subarray(bom?.length ?? 0))
  } catch {
    throw new SqlFileImportError(
      'DECODE_FAILED',
      '文件无法按所选编码完整读取，请切换编码或检查文件是否完整'
    )
  }
  if (sql.includes('\0'))
    throw new SqlFileImportError(
      'NUL_CONTENT',
      '文件含有空字符，可能编码不匹配；请切换编码或检查文件内容后重试'
    )
  if (!sql.trim())
    throw new SqlFileImportError('EMPTY_SQL', '文件没有可载入的 SQL 文本，请选择其他文件')
  return sql
}

/** Preview only: normalize line endings and keep whole Unicode symbols within a strict UTF-16 budget. */
export function getSqlFilePreview(sql: string): { code: string; truncated: boolean } {
  const normalized = sql.replace(/\r\n?/g, '\n')
  const lines = normalized
    .split('\n', maxPreviewLines + 1)
    .slice(0, maxPreviewLines)
    .join('\n')
  let characters = 0
  const code = takeWhile(toArray(lines), (symbol) => {
    characters += symbol.length
    return characters <= maxPreviewCharacters
  }).join('')
  return { code, truncated: code !== normalized }
}
