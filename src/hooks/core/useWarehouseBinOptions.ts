import { shallowRef } from 'vue'
import { notifyFriendlyError } from './useArtFeedback'

/** Isolate warehouse candidates across rows, warehouse changes, and overlay sessions. */
export function useWarehouseBinOptions<TLine extends { warehouseId: string | null }, TBin>(
  currentLines: () => readonly TLine[],
  fetchBins: (warehouseId: string) => Promise<TBin[]>
) {
  const options = shallowRef<TBin[]>([])
  let generation = 0
  function invalidate() {
    generation++
    options.value = []
  }
  async function load(line: TLine): Promise<void> {
    const request = ++generation
    const warehouseId = line.warehouseId
    options.value = []
    const isCurrent = () =>
      request === generation && line.warehouseId === warehouseId && currentLines().includes(line)
    try {
      const rows = warehouseId ? await fetchBins(warehouseId) : []
      if (isCurrent()) options.value = rows
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '仓位加载失败，请重新打开仓位选项后重试')
    }
  }
  return { options, load, invalidate }
}

/** Keep each row and warehouse column independent while preserving overlay scope. */
export function useWarehouseRowBinLoader<TLine extends object, TBin>(
  currentLines: () => readonly TLine[],
  currentSession: () => number,
  warehouseOf: (line: TLine) => string | null,
  fetchBins: (warehouseId: string) => Promise<TBin[]>,
  setBins: (line: TLine, bins: TBin[]) => void
) {
  const requests = new WeakMap<TLine, number>()
  return async (line: TLine): Promise<void> => {
    const request = (requests.get(line) ?? 0) + 1
    requests.set(line, request)
    const session = currentSession()
    const warehouseId = warehouseOf(line)
    setBins(line, [])
    const isCurrent = () =>
      session === currentSession() &&
      requests.get(line) === request &&
      warehouseOf(line) === warehouseId &&
      currentLines().includes(line)
    try {
      const bins = warehouseId ? await fetchBins(warehouseId) : []
      if (isCurrent()) setBins(line, bins)
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '仓位加载失败，请重新选择仓库后重试')
    }
  }
}
