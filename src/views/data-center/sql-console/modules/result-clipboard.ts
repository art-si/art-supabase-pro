import { escape } from 'lodash-es'
import type { SqlResultSnapshot } from './result-compare'
import { formatSqlResultCellText } from './result-export'

export interface SqlResultClipboard {
  html: string
  text: string
  rowCount: number
  columnCount: number
}

export type SqlResultClipboardErrorCode =
  'INVALID_COLUMNS' | 'CELL_LIMIT' | 'INVALID_TEXT' | 'PAYLOAD_LIMIT'

export class SqlResultClipboardError extends Error {
  constructor(
    public readonly code: SqlResultClipboardErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'SqlResultClipboardError'
  }
}

const maxPayloadBytes = 1024 * 1024
const maxCellLength = 32_767

/**
 * Format a canonical snapshot already projected to the requested rows and ordered fields.
 * These are readable representations; receiving applications control pasted cell types.
 */
export function createSqlResultClipboard(snapshot: SqlResultSnapshot): SqlResultClipboard {
  if (!snapshot.columns.length)
    throw new SqlResultClipboardError(
      'INVALID_COLUMNS',
      '当前没有可复制字段，请调整查询或显示已获准字段后重试。'
    )

  const html: string[] = []
  const text: string[] = []
  const encoder = new TextEncoder()
  let bytes = 0
  const append = (parts: string[], value: string): void => {
    bytes += encoder.encode(value).byteLength
    if (bytes > maxPayloadBytes)
      throw new SqlResultClipboardError(
        'PAYLOAD_LIMIT',
        '复制内容超过 1 MiB，请缩小筛选范围、减少显示列或改用类型 JSON 导出。'
      )
    parts.push(value)
  }
  const writeRow = (row?: Record<string, unknown>): void => {
    const tag = row ? 'td' : 'th'
    append(html, '<tr>')
    snapshot.columns.forEach((column, index) => {
      const value = row ? formatSqlResultCellText(row, column.property ?? column.name) : column.name
      if (value.length > maxCellLength)
        throw new SqlResultClipboardError(
          'CELL_LIMIT',
          '复制内容中有单元格超过 32767 个字符，请改用类型 JSON 导出。'
        )
      // With Unicode mode, a valid surrogate pair is one code point and does not match.
      if (value.includes('\0') || /[\uD800-\uDFFF]/u.test(value))
        throw new SqlResultClipboardError(
          'INVALID_TEXT',
          '复制内容包含 NUL 或不完整的 Unicode 字符，无法可靠复制；请改用类型 JSON 导出。'
        )
      if (index) append(text, '\t')
      append(text, /[\t\r\n"]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
      append(html, `<${tag}>${escape(value)}</${tag}>`)
    })
    append(html, '</tr>')
  }

  append(html, '<table style="white-space:pre-wrap"><thead>')
  writeRow()
  append(html, '</thead><tbody>')
  for (const row of snapshot.rows) {
    append(text, '\r\n')
    writeRow(row)
  }
  append(html, '</tbody></table>')
  return {
    html: html.join(''),
    text: text.join(''),
    rowCount: snapshot.rows.length,
    columnCount: snapshot.columns.length
  }
}
