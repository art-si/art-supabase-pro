import assert from 'node:assert/strict'
import test from 'node:test'
import { hasLocatedRecord } from '../../src/components/business/master-delete-processing-notice/record-location'

test('关联定位必须匹配实际记录，空列表、无目标和无关记录不能确认', () => {
  assert.equal(hasLocatedRecord([], 'target', false, null), false)
  assert.equal(hasLocatedRecord([{ id: 'other' }], 'target', false, null), false)
  assert.equal(hasLocatedRecord([{ id: 'target' }], undefined, false, null), false)
  assert.equal(hasLocatedRecord([{ id: 'target' }], '', false, null), false)
  assert.equal(hasLocatedRecord([{ id: 'target' }], 'target', false, null), true)
})

test('刷新中或加载失败时，旧匹配记录不能确认定位', () => {
  const rows = [{ id: 'target' }]
  assert.equal(hasLocatedRecord(rows, 'target', true, null), false)
  assert.equal(hasLocatedRecord(rows, 'target', false, new Error('read failed')), false)
  assert.equal(hasLocatedRecord(rows, 'target', false, null), true)
})

test('定位复用树形查找并支持编号规则键及数字路由 ID', () => {
  assert.equal(
    hasLocatedRecord([{ id: 'root', children: [{ id: 'target' }] }], 'target', false, null),
    true
  )
  assert.equal(hasLocatedRecord([{ id: 12 }], '12', false, null), true)
  assert.equal(hasLocatedRecord([{ id: 12 }], '012', false, null), false)
  assert.equal(hasLocatedRecord([{ ruleKey: 'order' }], 'order', false, null, 'ruleKey'), true)
  assert.equal(hasLocatedRecord([{ id: 'record-test' }], 'source-test', false, null), false)
})
