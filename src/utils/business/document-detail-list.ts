import { cloneDeep } from 'lodash-es'
import { createTenantScopeReadGuard } from '../tenant-scope-context'

export interface DocumentPage<T> {
  data?: T[] | null
  total?: number | null
  error?: unknown
}

export type DetailListRow<TDocument, TLine> = TDocument & {
  detailRowId: string
  detailLine: TLine
  detailGroupStart: boolean
}

/** Row identity must remain unique while a mode switch still displays the previous rows. */
export function getDocumentDetailRowKey(row: { id: string; detailRowId?: string }): string {
  return row.detailRowId ?? row.id
}

/** Load documents before line pagination so a page never silently drops sibling lines. */
export async function loadAllDocumentPages<
  TDocument,
  TQuery extends { from?: number; to?: number }
>(
  fetchPage: (query: TQuery) => Promise<DocumentPage<TDocument>>,
  query: TQuery,
  batchSize = 500
): Promise<TDocument[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('分页大小必须是正安全整数')
  }
  const filters = cloneDeep(query)
  const assertTenantScope = createTenantScopeReadGuard()
  const batches: TDocument[][] = []
  let total: number | undefined
  let loaded = 0
  for (let from = 0; ; from += batchSize) {
    assertTenantScope()
    const page = await fetchPage({ ...filters, from, to: from + batchSize - 1 })
    assertTenantScope()
    if (page.error) throw page.error
    if (page.total != null) {
      if (!Number.isSafeInteger(page.total) || page.total < 0) {
        throw new Error('数据总数无效，请刷新后重试')
      }
      if (total !== undefined && total !== page.total) {
        throw new Error('数据总数已变化，请刷新后重试')
      }
      if (from === 0) total = page.total
    }
    const rows = page.data ?? []
    if (total !== undefined && loaded + rows.length > total) {
      throw new Error('数据总数与记录不一致，请刷新后重试')
    }
    batches.push(rows)
    loaded += rows.length
    if (total === undefined) {
      if (rows.length < batchSize) return batches.flat()
    } else {
      if (loaded >= total) return batches.flat()
      if (!rows.length || from + batchSize >= total) {
        throw new Error('数据未完整加载，请刷新后重试')
      }
    }
  }
}

export function expandDocumentLines<TDocument extends { id: string }, TLine>(
  documents: TDocument[],
  getLines: (document: TDocument) => TLine[],
  getLineId: (line: TLine, index: number) => string
): DetailListRow<TDocument, TLine>[] {
  return documents.flatMap((document) =>
    getLines(document).map((line, index) => ({
      ...document,
      detailRowId: `${document.id}:${getLineId(line, index)}`,
      detailLine: line,
      detailGroupStart: index === 0
    }))
  )
}

export function paginateDetailRows<TDocument, TLine>(
  rows: DetailListRow<TDocument, TLine>[],
  from = 0,
  to = 49
): { data: DetailListRow<TDocument, TLine>[]; total: number } {
  const data = rows.slice(from, to + 1)
  if (data[0]) data[0] = { ...data[0], detailGroupStart: true }
  return { data, total: rows.length }
}

export async function loadAllLinePages<TLine, TQuery extends { current: number; size: number }>(
  fetchPage: (query: TQuery) => Promise<DocumentPage<TLine>>,
  query: TQuery,
  batchSize = 500
): Promise<TLine[]> {
  const filters = cloneDeep(query)
  return loadAllDocumentPages<TLine, { from?: number; to?: number }>(
    ({ from = 0 }) => fetchPage({ ...filters, current: from / batchSize + 1, size: batchSize }),
    {},
    batchSize
  )
}

export function groupDocumentLines<TLine>(
  lines: TLine[],
  getDocumentId: (line: TLine) => string
): Array<{ first: TLine; lines: TLine[] }> {
  const groups = new Map<string, { first: TLine; lines: TLine[] }>()
  for (const line of lines) {
    const id = getDocumentId(line)
    const group = groups.get(id)
    if (group) group.lines.push(line)
    else groups.set(id, { first: line, lines: [line] })
  }
  return [...groups.values()]
}

/** Merge repeated document fields while keeping every material cell independent. */
export function documentGroupSpan<T extends { documentId?: string; id?: string }>(
  rows: T[],
  rowIndex: number,
  property: string | undefined,
  lineProperties: ReadonlySet<string>,
  getDocumentId: (row: T) => string = (row) => row.documentId || row.id || ''
): [number, number] {
  if (!property || lineProperties.has(property) || !rows[rowIndex]) return [1, 1]
  const documentId = getDocumentId(rows[rowIndex])
  if (!documentId) return [1, 1]
  if (rowIndex > 0 && getDocumentId(rows[rowIndex - 1]) === documentId) return [0, 0]
  let count = 1
  while (rowIndex + count < rows.length && getDocumentId(rows[rowIndex + count]) === documentId) {
    count += 1
  }
  return [count, 1]
}
