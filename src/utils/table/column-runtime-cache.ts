import { ref } from 'vue'
import type { TableColumnRuntime } from '@/types/table-column-config'

export type TableColumnRuntimeCacheEntry = {
  expires: number
  value: Promise<TableColumnRuntime | null>
}

export const tableColumnRuntimeCache = new Map<string, TableColumnRuntimeCacheEntry>()
export const tableColumnRuntimeRevision = ref(0)
export const tableColumnRuntimeWarnings = new Set<string>()

export function invalidateTableColumnConfig(): void {
  tableColumnRuntimeCache.clear()
  tableColumnRuntimeWarnings.clear()
  tableColumnRuntimeRevision.value += 1
}
