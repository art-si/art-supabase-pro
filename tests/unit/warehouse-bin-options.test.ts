import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope } from 'vue'
import { ElMessage } from 'element-plus'
import {
  useWarehouseBinOptions,
  useWarehouseRowBinLoader
} from '../../src/hooks/core/useWarehouseBinOptions'

interface Line {
  warehouseId: string | null
  bins: string[]
}

function createLoader(perRow: boolean, fetchBins: (warehouseId: string) => Promise<string[]>) {
  const line: Line = { warehouseId: 'warehouse-a', bins: [] }
  const lines = [line]
  if (perRow) {
    const load = useWarehouseRowBinLoader(
      () => lines,
      () => 1,
      (row) => row.warehouseId,
      fetchBins,
      (row, bins) => {
        row.bins = bins
      }
    )
    return { load: () => load(line), options: () => line.bins }
  }
  const loader = useWarehouseBinOptions(() => lines, fetchBins)
  return { load: () => loader.load(line), options: () => loader.options.value }
}

for (const perRow of [false, true]) {
  const mode = perRow ? '逐行仓位' : '共享仓位'

  test(`${mode}：作用域销毁后旧成功响应不再更新选项`, async () => {
    let resolve!: (bins: string[]) => void
    const scope = effectScope()
    const loader = scope.run(() =>
      createLoader(perRow, () => new Promise<string[]>((done) => (resolve = done)))
    )!
    const loading = loader.load()
    scope.stop()
    resolve(['stale-bin'])
    await loading
    assert.deepEqual(loader.options(), [])
  })

  test(`${mode}：作用域销毁后旧失败不再通知用户`, async (context) => {
    const notification = context.mock.method(ElMessage, 'error', () => ({ close() {} }))
    let reject!: (cause: Error) => void
    const scope = effectScope()
    const loader = scope.run(() =>
      createLoader(perRow, () => new Promise<string[]>((_, fail) => (reject = fail)))
    )!
    const loading = loader.load()
    scope.stop()
    reject(new Error('late warehouse response'))
    await loading
    assert.equal(notification.mock.callCount(), 0)
  })

  test(`${mode}：销毁后的保留回调不再发请求或清空选项`, async () => {
    let reads = 0
    const scope = effectScope()
    const loader = scope.run(() => createLoader(perRow, async () => [`bin-${++reads}`]))!
    await loader.load()
    scope.stop()
    await loader.load()
    assert.equal(reads, 1)
    assert.deepEqual(loader.options(), ['bin-1'])
  })

  test(`${mode}：正常加载仍生效，且独立于已销毁的实例`, async () => {
    const stopped = effectScope()
    stopped.run(() => createLoader(perRow, async () => ['stopped-bin']))
    stopped.stop()
    const active = effectScope()
    try {
      const loader = active.run(() => createLoader(perRow, async () => ['current-bin']))!
      await loader.load()
      assert.deepEqual(loader.options(), ['current-bin'])
    } finally {
      active.stop()
    }
  })
}
