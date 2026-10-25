import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findDictionaryItem,
  getChildDictionaryItems,
  isChildDictionaryItem
} from '../../modules/art-supabase-smis/src/domain/hazard-dictionary'

type DictionaryItem = Api.DataCenter.DictListItem

const item = (overrides: Partial<DictionaryItem>): DictionaryItem => ({
  id: crypto.randomUUID(),
  name: '',
  code: '',
  status: '1',
  value: '',
  ...overrides
})

test('findDictionaryItem accepts stored values and user-facing labels', () => {
  const items = [item({ value: '01', label: '应急管理' })]

  assert.equal(findDictionaryItem(items, '01'), items[0])
  assert.equal(findDictionaryItem(items, '应急管理'), items[0])
  assert.equal(findDictionaryItem(items, '不存在'), undefined)
})

test('cross-type cascade uses cascadeParentId', () => {
  const parent = item({ id: 'parent-1', value: 'basic_management', label: '基础管理' })
  const matching = item({ value: '01', cascadeParentId: 'parent-1' })
  const unrelated = item({ value: '02', cascadeParentId: 'parent-2', remark: '基础管理' })

  assert.equal(isChildDictionaryItem(matching, parent), true)
  assert.equal(isChildDictionaryItem(unrelated, parent), false)
  assert.deepEqual(getChildDictionaryItems([matching, unrelated], parent), [matching])
})

test('legacy remark relation remains readable during rollout', () => {
  const parent = item({ id: 'parent-1', value: 'basic_management', label: '基础管理' })
  const legacyChild = item({ value: '01', remark: '基础管理' })

  assert.equal(isChildDictionaryItem(legacyChild, parent), true)
})
