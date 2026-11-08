import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import type { ApiRequestOptions } from '@/types/api/request'
import { assertTenantReadTargetId, getDataApiTenantScopeHeader } from '@/utils/tenant-scope-context'

interface SupabaseQueryResponse {
  data?: unknown
  error?: unknown
  count?: number | null
  response?: {
    json?: () => Promise<unknown>
  }
}

interface SupabaseRequestQuery {
  abortSignal(signal: AbortSignal): this
  setHeader(name: string, value: string): this
}

export interface SupabaseRequestOptions extends ApiRequestOptions {
  /**
   * Omit for standard workspace reads. A UUID scopes platform-all reference reads;
   * null preserves an intentional tenant subset. Selected scope and server authorization win.
   */
  readTenantId?: string | null
}

export interface SupabaseQueryLike
  extends PromiseLike<SupabaseQueryResponse>, SupabaseRequestQuery {
  eq(column: string, value: unknown): this
  gt(column: string, value: unknown): this
  gte(column: string, value: unknown): this
  ilike(column: string, pattern: string): this
  in(column: string, values: readonly unknown[]): this
  lt(column: string, value: unknown): this
  limit(count: number): this
  lte(column: string, value: unknown): this
  neq(column: string, value: unknown): this
  not(column: string, operator: string, value: unknown): this
  or(filters: string): this
  order(column: string, options?: Record<string, unknown>): this
  range(from: number, to: number): this
}

export const withRequestOptions = <TQuery extends SupabaseRequestQuery>(
  query: TQuery,
  options?: SupabaseRequestOptions
): TQuery => {
  if (options?.readTenantId !== undefined) {
    if (options.readTenantId !== null) assertTenantReadTargetId(options.readTenantId)
    query = query.setHeader(getDataApiTenantScopeHeader(), options.readTenantId ?? '')
  }
  return options?.signal ? query.abortSignal(options.signal) : query
}

export const normalizeBooleanFilter = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

interface DateRangeOptions {
  endOfDay?: boolean
  startOfDay?: boolean
}

export const applyDateRange = <TQuery extends SupabaseQueryLike>(
  query: TQuery,
  column: string,
  dateRange?: readonly string[],
  options: DateRangeOptions = {}
): TQuery => {
  const [startDate, endDate] = dateRange ?? []
  let nextQuery: SupabaseQueryLike = query

  if (startDate) {
    nextQuery = nextQuery.gte(
      column,
      options.startOfDay ? toDateStartTimestamp(startDate) : startDate
    )
  }
  if (endDate) {
    nextQuery = nextQuery.lte(column, options.endOfDay ? toDateEndTimestamp(endDate) : endDate)
  }

  return nextQuery as TQuery
}

export const applyCreateTimeRange = <TQuery extends SupabaseQueryLike>(
  query: TQuery,
  dateRange?: readonly string[]
): TQuery =>
  applyDateRange(query, 'create_time', dateRange, {
    startOfDay: true,
    endOfDay: true
  })
