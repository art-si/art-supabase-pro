import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTableRenderMode } from '../../src/components/core/tables/art-table/virtual-support'

const base = {
  columns: [{ prop: 'name', label: '名称' }],
  rows: [{ name: 'first' }],
  hasNativeColumns: false
}
test('virtual rendering is opt-in and only activates for compatible configurations', () => {
  assert.equal(resolveTableRenderMode(base).virtual, false)
  assert.equal(resolveTableRenderMode({ ...base, virtualScroll: true }).virtual, true)
  assert.equal(
    resolveTableRenderMode({ ...base, virtualScroll: { enabled: false } }).requested,
    false
  )
  assert.equal(resolveTableRenderMode({ ...base, virtualScroll: { minRows: 2 } }).virtual, false)
})
test('native-only table capabilities fall back without losing their original renderer', () => {
  for (const options of [
    { hasNativeColumns: true },
    { columns: [{ label: '分组', children: base.columns }] },
    { columns: [{ type: 'expand' }] },
    { lazy: true },
    { spanMethod: () => [] },
    { showSummary: true },
    { maxHeight: 300 },
    { defaultSort: { prop: 'name', order: 'ascending' } },
    { headerCellStyle: { backgroundColor: 'inherit' } },
    { rowStyle: () => ({ height: 'auto' }) },
    { fit: false },
    { columns: [{ prop: 'name', draggable: true }] }
  ]) {
    const mode = resolveTableRenderMode({ ...base, ...options, virtualScroll: true })
    assert.equal(mode.virtual, false)
    assert.ok(mode.fallbackReason)
  }
})
