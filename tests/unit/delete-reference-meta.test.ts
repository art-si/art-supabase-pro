import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatReferenceStatus,
  getRecordReferenceMeta
} from '../../src/components/business/master-data-delete-guard/record-meta'

test('引用分类只读取显式业务配置', () => {
  for (const table of ['mdm_employee', 'mdm_employee_assignment'])
    assert.equal(getRecordReferenceMeta(table).statusDictCode, 'hrEmploymentStatus')
  assert.deepEqual(getRecordReferenceMeta('hr_employee_contract'), {
    label: '劳动合同',
    routeName: 'HrCompliance'
  })
  for (const key of ['constructor', '__proto__', 'toString', 'unknown_table'])
    assert.deepEqual(getRecordReferenceMeta(key), { label: '关联业务记录' })
})

test('引用状态保留中文业务文案并安全降级未知技术状态', () => {
  assert.equal(formatReferenceStatus('active'), '有效')
  assert.equal(formatReferenceStatus('generated'), '已生成')
  assert.equal(formatReferenceStatus('待续签'), '待续签')
  assert.equal(formatReferenceStatus(null), '')
  for (const key of ['constructor', '__proto__', 'toString', 'unknown_status'])
    assert.equal(formatReferenceStatus(key), '待核对')
})
