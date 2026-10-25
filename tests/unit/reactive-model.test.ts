import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, reactive } from 'vue'
import { replaceReactiveModel, serializeOrderedEditorRows } from '../../src/utils/form/model'

test('删除和重排行后重新编号，保留业务标识和有效空值，不污染编辑状态', () => {
  const remainingRows = [
    { localKey: 'ui-b', id: 'saved-b', sort: 9, value: 0, enabled: false, detail: null },
    { localKey: 'ui-a', id: undefined, sort: 3, value: 2, enabled: true, detail: '' }
  ]
  const before = structuredClone(remainingRows)
  const payload = serializeOrderedEditorRows(remainingRows)
  assert.deepEqual(payload, [
    { id: 'saved-b', sort: 0, value: 0, enabled: false, detail: null },
    { id: undefined, sort: 1, value: 2, enabled: true, detail: '' }
  ])
  assert.deepEqual(remainingRows, before)
  assert.deepEqual(serializeOrderedEditorRows([]), [])
})

test('重置查询清除后加入的条件并保留依赖模型的计算状态', () => {
  const query = reactive<{ keyword?: string; status?: string; tenantId?: string }>({
    keyword: '旧筛选',
    status: 'enabled',
    tenantId: 'selected-tenant'
  })
  const keyword = computed(() => query.keyword ?? '')
  assert.equal(keyword.value, '旧筛选')
  const result = replaceReactiveModel(query, { tenantId: 'selected-tenant' })
  assert.equal(result, query)
  assert.deepEqual(query, { tenantId: 'selected-tenant' })
  assert.equal(keyword.value, '')
  query.keyword = '新筛选'
  assert.equal(keyword.value, '新筛选')
})

test('替换表单保留新模型中的日期附件及有效空值，不保留旧字段', () => {
  const date = new Date('2026-10-05T08:00:00Z')
  const attachment = new Blob(['附件内容'])
  const current: object = reactive({ oldField: '旧值', count: 4 })
  const next = { date, attachment, count: 0, enabled: false, name: '' }
  assert.equal(replaceReactiveModel(current, next), current)
  assert.deepEqual(current, next)
  assert.deepEqual(next, { date, attachment, count: 0, enabled: false, name: '' })
})

test('使用当前对象作为新模型不会清空已有字段', () => {
  const current = reactive({ keyword: '保留值', options: ['a', 'b'] })
  const options = current.options
  assert.equal(replaceReactiveModel(current, current), current)
  assert.equal(current.keyword, '保留值')
  assert.equal(current.options, options)
})
