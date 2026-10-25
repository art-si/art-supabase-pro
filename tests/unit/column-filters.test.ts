import assert from 'node:assert/strict'
import test from 'node:test'
import {
  columnFilterOptions,
  columnFilterValueKey,
  filterColumnRows,
  isColumnFilterActive,
  matchesColumnFilter
} from '../../src/utils/table/column-filters'

test('text matching ignores case and whitespace, empty conditions are explicit', () => {
  assert.equal(matchesColumnFilter('Alpha', 'text', { text: ' ALP ' }), true)
  assert.equal(matchesColumnFilter(null, 'text', { empty: 'empty' }), true)
  assert.equal(matchesColumnFilter('  ', 'text', { empty: 'not-empty' }), false)
  assert.equal(isColumnFilterActive({ text: '  ' }), false)
  assert.equal(isColumnFilterActive({ start: 0 }), true)
})
test('checkbox options de-duplicate, preserve scalar types and combine selected values with OR', () => {
  const values = [{ status: 0 }, { status: '0' }, { status: null }, { status: '' }, { status: 0 }]
  assert.equal(columnFilterOptions(values, 'status').length, 3)
  assert.equal(matchesColumnFilter(0, 'select', { values: [columnFilterValueKey('0')] }), false)
  assert.equal(
    matchesColumnFilter(0, 'select', {
      values: [columnFilterValueKey(0), columnFilterValueKey(1)]
    }),
    true
  )
})
test('numeric ranges include zero, boundaries and a single endpoint; reject empty and invalid values', () => {
  assert.equal(matchesColumnFilter(0, 'number-range', { start: 0, end: 10 }), true)
  assert.equal(matchesColumnFilter('10', 'number-range', { end: 10 }), true)
  assert.equal(matchesColumnFilter(-1, 'number-range', { start: 0 }), false)
  assert.equal(matchesColumnFilter(null, 'number-range', { end: 10 }), false)
  assert.equal(matchesColumnFilter('abc', 'number-range', { end: 10 }), false)
})
test('date ranges include the complete end date, datetime ranges include the selected second', () => {
  assert.equal(
    matchesColumnFilter('2026-10-23T23:59:59.999', 'date-range', { end: '2026-10-23' }),
    true
  )
  assert.equal(
    matchesColumnFilter('2026-10-24T00:00:00', 'date-range', { end: '2026-10-23' }),
    false
  )
  assert.equal(
    matchesColumnFilter('2026-10-23 12:00:00.500', 'datetime-range', {
      start: '2026-10-23 12:00:00',
      end: '2026-10-23 12:00:00'
    }),
    true
  )
  assert.equal(matchesColumnFilter('invalid', 'date-range', { start: '2026-10-23' }), false)
})
test('columns combine with AND, hidden filter conditions cannot filter data, tree ancestors are preserved', () => {
  const rows = [
    { name: 'Alpha', amount: 0 },
    { name: 'Alpha', amount: 20 },
    { name: 'Beta', amount: 5 }
  ]
  const columns = [
    { prop: 'name', filterType: 'text' as const },
    { prop: 'amount', filterType: 'number-range' as const }
  ]
  assert.deepEqual(
    filterColumnRows(rows, columns, { name: { text: 'alpha' }, amount: { end: 10 } }),
    [rows[0]]
  )
  assert.deepEqual(
    filterColumnRows(rows, [{ ...columns[0], visible: false }], { name: { text: 'nobody' } }),
    rows
  )
  const tree = [{ name: 'parent', children: [{ name: 'Alpha' }, { name: 'Beta' }] }]
  assert.deepEqual(filterColumnRows(tree, [columns[0]], { name: { text: 'alpha' } }), [
    { name: 'parent', children: [{ name: 'Alpha' }] }
  ])
  assert.equal(tree[0].children.length, 2)
})
