import { computed, nextTick, onScopeDispose, shallowRef, watch, type ComputedRef } from 'vue'
import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
import { getOwnRecordValue, isObjectRecord } from '@/utils/record'
import {
  getSqlResultSortKind,
  sortSqlResultRows,
  type SqlResultSortColumn,
  type SqlResultSortDirection,
  type SqlResultSortResult
} from './result-sort'

interface ResultSortSelection {
  field: string
  order: SqlResultSortDirection
}

interface ResultSortOptions {
  rows: () => Record<string, unknown>[]
  /** Only currently visible, authorized columns; editing does not alter this view preference. */
  columns: () => readonly SqlResultSortColumn[]
  paused: () => boolean
  disabled: () => boolean
  table: () => ArtTableExpose | undefined
  viewRevision: () => number
  onChange: () => void
}

interface ResultSortState {
  selection: ComputedRef<ResultSortSelection | null>
  result: ComputedRef<SqlResultSortResult | null>
  rows: ComputedRef<Record<string, unknown>[]>
  headerLabel: (field: string) => string
  cycle: (field: string) => void
  clear: () => void
  reset: () => void
  handleChange: ComputedRef<(event: unknown) => void>
}

/** Result-local ordering only; source rows and shared table sorting remain untouched. */
export function useSqlResultSort(options: ResultSortOptions): ResultSortState {
  const selected = shallowRef<ResultSortSelection | null>(null)
  const epoch = shallowRef(0)
  let alive = true
  let syncing = false
  let syncRevision = 0
  const columnFor = (field: string): SqlResultSortColumn | undefined => {
    const matches = options.columns().filter((column) => column.name === field)
    return matches.length === 1 && getSqlResultSortKind(matches[0]) !== 'unsupported'
      ? matches[0]
      : undefined
  }
  const canSort = (field: string): boolean =>
    alive && !options.paused() && !options.disabled() && Boolean(columnFor(field))
  const syncArrow = (): void => {
    const revision = ++syncRevision
    void nextTick(() => {
      if (!alive || revision !== syncRevision) return
      const table = options.table()?.elTableRef
      if (!table) return
      syncing = true
      try {
        const current = selected.value
        if (current && canSort(current.field)) table.sort(current.field, current.order)
        else table.clearSort()
      } finally {
        syncing = false
      }
    })
  }
  const changed = (): void => {
    epoch.value++
    options.onChange()
    const active = epoch.value
    void nextTick(() => {
      if (alive && active === epoch.value) options.table()?.elTableRef?.setScrollTop(0)
    })
    syncArrow()
  }
  const clear = (): void => {
    if (!selected.value) return
    selected.value = null
    changed()
  }
  const reset = (): void => {
    selected.value = null
    changed()
  }
  const apply = (field: string, order: SqlResultSortDirection | null): void => {
    if (!canSort(field)) return
    if (order === null) {
      clear()
      return
    }
    if (selected.value?.field === field && selected.value.order === order) return
    selected.value = { field, order }
    changed()
  }
  const cycle = (field: string): void => {
    const current = selected.value
    apply(
      field,
      current?.field !== field ? 'ascending' : current.order === 'ascending' ? 'descending' : null
    )
  }
  const handleChange = computed(() => {
    const active = epoch.value
    const table = options.table()
    return (event: unknown): void => {
      if (
        !alive ||
        syncing ||
        active !== epoch.value ||
        table !== options.table() ||
        options.paused() ||
        options.disabled() ||
        !isObjectRecord(event)
      )
        return
      const field = getOwnRecordValue(event, 'prop')
      const order = getOwnRecordValue(event, 'order')
      const column = getOwnRecordValue(event, 'column')
      if (order === null && field === null && column === null) {
        clear()
        return
      }
      if (
        typeof field !== 'string' ||
        !canSort(field) ||
        !isObjectRecord(column) ||
        getOwnRecordValue(column, 'property') !== field ||
        getOwnRecordValue(column, 'sortable') !== 'custom' ||
        (order !== 'ascending' && order !== 'descending' && order !== null)
      )
        return
      // V2's arrow has two states; the result workflow adds a third query-order state.
      apply(
        field,
        selected.value?.field === field &&
          selected.value.order === 'descending' &&
          order === 'ascending'
          ? null
          : order
      )
    }
  })
  const result = computed(() => {
    const current = selected.value
    if (!current || options.paused() || options.disabled()) return null
    const column = columnFor(current.field)
    return column ? sortSqlResultRows(options.rows(), column, current.order) : null
  })
  const rows = computed(() => result.value?.rows ?? options.rows())
  const headerLabel = (field: string): string => {
    const current = selected.value?.field === field ? selected.value.order : null
    return `排序 ${field}：当前${current === 'ascending' ? '升序' : current === 'descending' ? '降序' : '未排序'}，下一步${current === 'ascending' ? '降序' : current === 'descending' ? '恢复查询顺序' : '升序'}`
  }
  watch(
    () => options.columns(),
    () => {
      if (selected.value && !columnFor(selected.value.field)) clear()
      else syncArrow()
    },
    { flush: 'post' }
  )
  // Entering/exiting the raw edit view changes the displayed order without losing the preference.
  watch(() => options.paused(), changed, { flush: 'sync' })
  watch(
    [
      () => options.paused(),
      () => options.disabled(),
      () => options.table()?.elTableRef,
      () => options.viewRevision()
    ],
    syncArrow,
    { flush: 'post' }
  )
  onScopeDispose(() => {
    alive = false
    epoch.value++
    syncRevision++
  })
  return {
    selection: computed(() => selected.value),
    result,
    rows,
    headerLabel,
    cycle,
    clear,
    reset,
    handleChange
  }
}
