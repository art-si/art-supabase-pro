import assert from 'node:assert/strict'
import test from 'node:test'
import { toDictionaryOption, toNameCodeOption } from '../../src/utils/form/option'

test('dictionary options preserve values and leave availability filtering to callers', () => {
  const source = [
    { label: '显示名称', name: '内部名称', value: 0, status: '0' },
    { label: '', name: '备用名称', value: 1, status: '1' },
    { name: '无标签名称', value: 2, status: '1' }
  ]
  const before = structuredClone(source)
  assert.deepEqual(source.map(toDictionaryOption), [
    { label: '显示名称', value: 0 },
    { label: '备用名称', value: 1 },
    { label: '无标签名称', value: 2 }
  ])
  assert.deepEqual(source.filter((item) => item.status === '1').map(toDictionaryOption), [
    { label: '备用名称', value: 1 },
    { label: '无标签名称', value: 2 }
  ])
  assert.deepEqual(source, before)
  assert.deepEqual(toDictionaryOption({ name: '否', value: false }), { label: '否', value: false })
})

test('reference labels omit absent names and codes without changing identity or input', () => {
  const references = [
    { id: 'shift-a', name: '白班', code: 'DAY', enabled: false },
    { id: 0, name: '未编码班次', code: null },
    { id: 1, name: '', code: 'NIGHT' },
    { id: 2, name: null },
    { id: 3, name: '  原始名称  ', code: '' }
  ]
  const before = structuredClone(references)
  assert.deepEqual(references.map(toNameCodeOption), [
    { label: '白班 · DAY', value: 'shift-a' },
    { label: '未编码班次', value: 0 },
    { label: 'NIGHT', value: 1 },
    { label: '', value: 2 },
    { label: '  原始名称  ', value: 3 }
  ])
  assert.deepEqual(references, before)
})
