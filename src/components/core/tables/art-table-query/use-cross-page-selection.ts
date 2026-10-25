import { computed, nextTick, ref, type Ref } from 'vue'

export type TableRowKey<TRecord> = string | ((row: TRecord) => string)

interface CrossPageSelectionOptions<TRecord extends Record<string, unknown>> {
  data: Ref<TRecord[]>
  getRowKey: () => TableRowKey<TRecord> | undefined
  clearTableSelection: () => void
  onChange: (rows: TRecord[]) => void
}

/** Keeps complete selected rows while users move between server-paginated pages. */
export function useCrossPageSelection<TRecord extends Record<string, unknown>>(
  options: CrossPageSelectionOptions<TRecord>
) {
  const selectedRows = ref<TRecord[]>([]) as Ref<TRecord[]>
  const selectedRowMap = new Map<string | number, TRecord>()

  const getRowIdentity = (row: TRecord): string | number | undefined => {
    const rowKey = options.getRowKey()
    if (typeof rowKey === 'function') return rowKey(row)
    const value = typeof rowKey === 'string' ? row[rowKey] : row.id
    return typeof value === 'string' || typeof value === 'number' ? value : undefined
  }

  const syncSelectedRows = (): void => {
    selectedRows.value = Array.from(selectedRowMap.values())
  }

  const selectedRowKeys = computed(() =>
    selectedRows.value
      .map((row) => getRowIdentity(row))
      .filter((key): key is string | number => key !== undefined)
  )

  const clearSelectedRows = (): void => {
    selectedRowMap.clear()
    selectedRows.value = []
    void nextTick(options.clearTableSelection)
  }

  const handleSelectionChange = (selection: TRecord[]): void => {
    const currentPageKeys = new Set(
      options.data.value
        .map((row) => getRowIdentity(row))
        .filter((key): key is string | number => key !== undefined)
    )
    const currentSelectionKeys = new Set(
      selection
        .map((row) => getRowIdentity(row))
        .filter((key): key is string | number => key !== undefined)
    )

    currentPageKeys.forEach((key) => {
      if (!currentSelectionKeys.has(key)) selectedRowMap.delete(key)
    })
    selection.forEach((row) => {
      const key = getRowIdentity(row)
      if (key !== undefined) selectedRowMap.set(key, row)
    })

    syncSelectedRows()
    options.onChange(selectedRows.value)
  }

  return {
    selectedRows,
    selectedRowKeys,
    getRowIdentity,
    clearSelectedRows,
    handleSelectionChange
  }
}
