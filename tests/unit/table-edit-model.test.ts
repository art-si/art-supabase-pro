import assert from 'node:assert/strict'
import test from 'node:test'
import { TableEditModel } from '../../src/utils/table/edit-model'

test('working-copy edits preserve source data, types, stable references and exact dirty fields', () => {
  const source = [{ id: 1, text: '', nullable: null as string | null, nested: { count: 1 } }]
  const model = new TableEditModel(source)
  const row = model.rows[0]
  model.setCellValue(row, 'text', '已修改')
  model.setCellValue(row, 'nullable', '')
  model.setCellValue(row, 'nested.count', 2)
  assert.deepEqual(source, [{ id: 1, text: '', nullable: null, nested: { count: 1 } }])
  assert.equal(model.getRecordset().updateRecords[0], row)
  assert.deepEqual(model.getRecordset().changes[0].fields, ['text', 'nullable', 'nested'])
  model.undo()
  assert.equal(row.nested.count, 1)
  model.redo()
  assert.equal(row.nested.count, 2)
  model.revertData(row)
  assert.equal(model.getRecordset().changes.length, 0)
  model.undo()
  assert.equal(row.text, '已修改')
})

test('NULL, empty text and false remain different, and returning to original clears dirty state', () => {
  const model = new TableEditModel([{ value: null as unknown }])
  const row = model.rows[0]
  model.setCellValue(row, 'value', '')
  assert.equal(model.isUpdateByRow(row, 'value'), true)
  model.setCellValue(row, 'value', false)
  model.setCellValue(row, 'value', null)
  assert.deepEqual(model.getRecordset().changes, [])
  model.undo()
  assert.equal(row.value, false)
})

test('local insertion/removal and their undo preserve recordset classification and ordering', () => {
  const model = new TableEditModel([{ id: 1 }, { id: 2 }])
  const first = model.rows[0]
  const [created] = model.insertAt({ id: 3 }, -1)
  model.remove(created)
  assert.deepEqual(model.getRecordset().insertRecords, [])
  assert.deepEqual(model.getRecordset().removeRecords, [])
  model.undo()
  assert.equal(model.getRecordset().insertRecords[0], created)
  model.remove(first)
  assert.deepEqual(model.getRecordset().removeRecords, [{ id: 1 }])
  model.undo()
  assert.deepEqual(
    model.rows.map((row) => row.id),
    [1, 2, 3]
  )
  model.revertData()
  assert.deepEqual(
    model.rows.map((row) => row.id),
    [1, 2]
  )
  assert.equal(model.canUndo(), false)
  assert.equal(model.canRedo(), false)
})

test('new properties are removed on undo, row revert and full revert without stale keys', () => {
  const model = new TableEditModel<Record<string, unknown>>([{ id: 1 }])
  const row = model.rows[0]
  model.setCellValue(row, 'extra', 'new')
  model.undo()
  assert.equal(Object.hasOwn(row, 'extra'), false)
  model.redo()
  model.revertData(row)
  assert.deepEqual(row, { id: 1 })
  model.setCellValue(row, 'extra', 'again')
  model.revertData()
  assert.deepEqual(row, { id: 1 })
})

test('dotted literal fields and nested paths are distinct, and prototype paths cannot be edited', () => {
  const model = new TableEditModel<Record<string, unknown>>([
    { 'a.b': 'literal', a: { b: 'nested' } }
  ])
  const row = model.rows[0]
  model.setCellValue(row, 'a.b', 'changed')
  assert.equal(row['a.b'], 'changed')
  assert.deepEqual(row.a, { b: 'nested' })
  for (const path of [
    '__proto__.polluted',
    'a[__proto__].polluted',
    'constructor.prototype.polluted'
  ])
    assert.equal(model.setCellValue(row, path, true), false)
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false)
})

test('history is bounded, redo branches are invalidated and reloading cannot retain old records', () => {
  const model = new TableEditModel([{ value: 0 }], 2)
  const row = model.rows[0]
  for (const value of [1, 2, 3]) model.setCellValue(row, 'value', value)
  model.undo()
  model.undo()
  model.undo()
  assert.equal(row.value, 1)
  model.setCellValue(row, 'value', 5)
  assert.equal(model.canRedo(), false)
  model.loadData([{ value: 9 }])
  assert.deepEqual(model.getRecordset(), {
    insertRecords: [],
    removeRecords: [],
    updateRecords: [],
    changes: []
  })
  assert.equal(model.setCellValue(row, 'value', 10), false)
})

test('own reserved literal fields support edits, history and field or row restoration without prototype writes', () => {
  const source = Object.fromEntries([
    ['id', 1],
    ['__proto__', 'original prototype value'],
    ['constructor', 'original constructor value'],
    ['prototype', 'original prototype field'],
    ['hasOwnProperty', 'original method value']
  ])
  const model = new TableEditModel([source])
  const row = model.rows[0]
  const prototype = Object.getPrototypeOf(row)
  for (const key of ['__proto__', 'constructor', 'prototype', 'hasOwnProperty']) {
    const original: unknown = source[key]
    const changed = { key, value: 'changed' }
    assert.equal(model.setCellValue(row, key, changed), true)
    assert.deepEqual(Object.getOwnPropertyDescriptor(row, key)?.value, changed)
    assert.equal(model.isUpdateByRow(row, key), true)
    assert.deepEqual(model.getRecordset().changes[0].fields, [key])
    assert.equal(Object.getPrototypeOf(row), prototype)
    model.undo()
    assert.equal(Object.getOwnPropertyDescriptor(row, key)?.value, original)
    assert.deepEqual(model.getRecordset().changes, [])
    model.redo()
    assert.deepEqual(Object.getOwnPropertyDescriptor(row, key)?.value, changed)
    model.revertData(row, key)
    assert.equal(Object.getOwnPropertyDescriptor(row, key)?.value, original)
    model.undo()
    assert.deepEqual(Object.getOwnPropertyDescriptor(row, key)?.value, changed)
    model.revertData(row)
    assert.deepEqual(row, source)
    model.undo()
    assert.deepEqual(Object.getOwnPropertyDescriptor(row, key)?.value, changed)
    model.revertData()
    assert.deepEqual(row, source)
  }
  assert.equal(Object.getPrototypeOf(row), prototype)
  assert.equal(Object.hasOwn(Object.prototype, 'key'), false)
  assert.equal(Object.hasOwn(Object.prototype, 'value'), false)
  assert.deepEqual(source, {
    id: 1,
    ['__proto__']: 'original prototype value',
    constructor: 'original constructor value',
    prototype: 'original prototype field',
    hasOwnProperty: 'original method value'
  })
})

test('existing dangerous-looking literal paths stay literal through undo and redo while missing unsafe paths remain blocked', () => {
  const literalKeys = ['constructor.prototype.sqlModelPollution', '__proto__.sqlModelPollution']
  const model = new TableEditModel<Record<string, unknown>>([
    Object.fromEntries([
      ...literalKeys.map((key) => [key, 'literal original']),
      ['nested', { value: 'nested original' }]
    ])
  ])
  const row = model.rows[0]
  const prototype = Object.getPrototypeOf(row)
  for (const key of literalKeys) {
    assert.equal(model.setCellValue(row, key, 'literal changed'), true)
    assert.equal(Object.getOwnPropertyDescriptor(row, key)?.value, 'literal changed')
    model.undo()
    assert.equal(Object.getOwnPropertyDescriptor(row, key)?.value, 'literal original')
    model.redo()
    assert.equal(Object.getOwnPropertyDescriptor(row, key)?.value, 'literal changed')
    model.revertData(row, key)
    assert.equal(Object.getOwnPropertyDescriptor(row, key)?.value, 'literal original')
  }
  assert.equal(model.setCellValue(row, 'nested.value', 'nested changed'), true)
  assert.deepEqual(row.nested, { value: 'nested changed' })
  model.undo()
  assert.deepEqual(row.nested, { value: 'nested original' })
  for (const key of [
    '__proto__',
    'constructor',
    'prototype',
    'constructor.prototype.otherPollution',
    'nested[__proto__].sqlModelPollution'
  ])
    assert.equal(model.setCellValue(row, key, true), false)
  assert.equal(Object.getPrototypeOf(row), prototype)
  assert.equal(Object.hasOwn(Object.prototype, 'sqlModelPollution'), false)
  assert.equal(Object.hasOwn(Object.prototype, 'otherPollution'), false)
})
