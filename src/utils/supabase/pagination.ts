import type { QueryResult } from '@/types/api/response'
import { createTenantScopeReadGuard } from '../tenant-scope-context'

export interface SupabaseRange {
  from: number
  to: number
}

interface FetchAllRangePagesOptions {
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 500

/** Convert one-based pages to inclusive Data API bounds without rounding or overflow. */
export function buildSupabasePageRange(page: { current: number; size: number }): SupabaseRange {
  const { current, size } = page
  const from = (current - 1) * size
  const to = from + (size - 1)
  if (
    !Number.isSafeInteger(current) ||
    current < 1 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !Number.isSafeInteger(to)
  ) {
    throw new RangeError('分页范围无效，请刷新后重试')
  }
  return { from, to }
}

/** Preserve table filters while accepting either ArtTableQuery pagination key pair. */
export function withSupabaseTableRange<
  T extends { current?: number; page?: number; size?: number; pageSize?: number }
>(params: T): T & SupabaseRange {
  const current = params.current ?? params.page ?? 1
  const size = params.size ?? params.pageSize ?? 20
  return { ...params, ...buildSupabasePageRange({ current, size }) }
}

/** Keep inclusive RPC bounds ordered after clamping the offset to zero. */
export function buildSupabaseRpcRange(from: number, to: number): { p_from: number; p_to: number } {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    throw new RangeError('分页范围无效，请刷新后重试')
  }
  const start = Math.max(from, 0)
  return { p_from: start, p_to: Math.max(to, start) }
}

export async function fetchAllRangePages<T>(
  fetchPage: (range: SupabaseRange) => Promise<QueryResult<T[]>>,
  options: FetchAllRangePagesOptions = {}
): Promise<QueryResult<T[]>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Supabase 分页大小必须是正整数')
  }

  const rows: T[] = []
  const assertTenantScope = createTenantScopeReadGuard()

  for (let from = 0; ; from += pageSize) {
    assertTenantScope()
    const page = await fetchPage({ from, to: from + pageSize - 1 })
    assertTenantScope()

    if (page.error) {
      return { data: null, error: page.error, total: rows.length }
    }
    if (!page.data) {
      return {
        data: null,
        error: new Error('分页查询未返回数据，请稍后重试'),
        total: rows.length
      }
    }

    for (const row of page.data) rows.push(row)

    if (page.data.length < pageSize) {
      return { data: rows, error: null, total: rows.length }
    }
  }
}
