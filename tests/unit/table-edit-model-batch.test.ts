import assert from 'node:assert/strict'
import test from 'node:test'
import { TableEditModel } from '../../src/utils/table/edit-model'

test('mixed batch history preserves duplicate references, row order and source isolation', () => {
  const shared = { id: 2 }
  const source = [{ id: 1 }, shared, { id: 3 }, shared, { id: 4 }]
  const model = new TableEditModel(source)
  const array = model.rows
  const original = [...array]
  assert.equal(original[1], original[3])

  const inserted = model.insertAt([{ id: 10 }, { id: 11 }, { id: 12 }], original[2])
  const full = [...model.rows]
  assert.deepEqual(
    full.map((row) => row.id),
    [1, 2, 10, 11, 12, 3, 2, 4]
  )
  const removed = model.remove([original[1], inserted[1], original[1], { id: 3 }, source[4]])
  assert.deepEqual(removed, [original[1], inserted[1], original[3]])
  const remaining = [original[0], inserted[0], inserted[2], original[2], original[4]]
  const checkReferences = (expected: typeof model.rows) => {
    assert.equal(model.rows, array)
    assert.equal(model.rows.length, expected.length)
    expected.forEach((row, index) => assert.equal(model.rows[index], row))
  }
  checkReferences(remaining)
  assert.deepEqual(model.getRecordset().removeRecords, [{ id: 2 }, { id: 2 }])
  assert.deepEqual(
    model.getRecordset().insertRecords.map((row) => row.id),
    [10, 12]
  )
  model.undo()
  checkReferences(full)
  model.redo()
  checkReferences(remaining)
  model.undo()
  model.undo()
  checkReferences(original)
  model.redo()
  checkReferences(full)
  model.redo()
  checkReferences(remaining)
  assert.deepEqual(source, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 2 }, { id: 4 }])
})

test('large insertion and history do not depend on the engine argument-count limit', () => {
  const model = new TableEditModel([{ id: 0 }, { id: -1 }])
  const array = model.rows
  const [first, last] = model.rows
  const size = 150_000
  const inserted = model.insertAt(
    Array.from({ length: size }, (_, id) => ({ id: id + 1 })),
    last
  )
  const checkInserted = () => {
    assert.equal(model.rows, array)
    assert.equal(model.rows.length, size + 2)
    assert.equal(model.rows[0], first)
    assert.equal(model.rows.at(-1), last)
    inserted.forEach((row, index) => assert.equal(model.rows[index + 1], row))
    assert.equal(model.getRecordset().insertRecords.length, size)
  }
  checkInserted()
  model.undo()
  assert.equal(model.rows, array)
  assert.deepEqual(model.rows, [first, last])
  assert.deepEqual(model.getRecordset().insertRecords, [])
  model.redo()
  checkInserted()
})
