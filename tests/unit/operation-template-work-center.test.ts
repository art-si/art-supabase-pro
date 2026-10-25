import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCenterImport } from '../../modules/art-supabase-mdm/src/views/production/work-center/modules/center-transfer'
import { createCenterPolicy } from '../../modules/art-supabase-mdm/src/views/production/work-center/modules/center-policy'
import {
  createTemplate,
  createTask,
  templatePayload,
  templateScore,
  validateTasks
} from '../../modules/art-supabase-mdm/src/views/production/operation-template/modules/template-model'

test('template payload preserves the resolved tenant and isolates tasks without server-owned fields', () => {
  const source = {
    ...createTemplate(),
    id: 'server-id',
    tenantId: 'tenant',
    totalScore: 999,
    createBy: 'server-audit',
    createTime: '2026-01-01',
    updateBy: 'server-audit',
    updateTime: '2026-01-02',
    name: '  装配检查  '
  }
  source.items[0] = {
    ...createTask(),
    category: '装配',
    name: '外观确认',
    score: 2,
    choices: ['合格']
  }
  const payload = templatePayload(source)
  assert.equal(payload.name, '装配检查')
  assert.equal('id' in payload, false)
  assert.equal(payload.tenantId, 'tenant')
  assert.equal('totalScore' in payload, false)
  for (const key of ['createBy', 'createTime', 'updateBy', 'updateTime']) {
    assert.equal(key in payload, false)
  }
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['tenantId', 'name', 'items', 'sort', 'textColor', 'tagType', 'enabled'].sort()
  )
  payload.items[0].choices.push('不合格')
  assert.equal(source.items[0].choices.length, 1)
})
test('task validation rejects incomplete choices and invalid scores', () => {
  const item = { ...createTask(), category: '装配', name: '外观确认' }
  assert.equal(validateTasks([item]), '')
  assert.match(validateTasks([{ ...item, inputMode: '选择', choices: [' '] }]), /选择项/)
  assert.match(validateTasks([{ ...item, score: NaN }]), /分数/)
  assert.match(validateTasks([{ ...item, category: ' ' }]), /任务分类/)
  assert.match(validateTasks([]), /任务项/)
})
test('score sum preserves two decimal business precision', () => {
  assert.equal(
    templateScore([
      { ...createTask(), score: 0.1 },
      { ...createTask(), score: 0.2 }
    ]),
    0.3
  )
})

test('center import preserves named staffing and policy and rejects silent downgrades', () => {
  const tenantId = 'tenant-a'
  const refs = {
    departments: [{ id: 'department', code: 'D01', tenantId }],
    centers: [{ id: 'main', code: 'WC0' }],
    people: [{ id: 'person', employeeNo: 'P01' }],
    defaults: createCenterPolicy()
  }
  const row = {
    工作中心: 'WC1',
    名称: '装配',
    所属产线编码: 'D01',
    主工序位: 'WC0',
    人员安排: '指定人员',
    人员工号: 'P01',
    报工: '非生产工位',
    自动报工: '自定义时间',
    自定义报工时间: '20:30'
  }
  const [result] = parseCenterImport([row], refs, tenantId)
  assert.equal(result.tenantId, tenantId)
  assert.deepEqual(result.personIds, ['person'])
  assert.equal(result.mainCenterId, 'main')
  assert.equal(result.policy.reportTime, '20:30')
  assert.equal(result.policy.reportMode, '非生产工位')
  assert.throws(
    () => parseCenterImport([{ ...row, 人员工号: 'unknown' }], refs, tenantId),
    /人员工号/
  )
  assert.throws(() => parseCenterImport([{ ...row, 报工: '未知值' }], refs, tenantId), /报工选项/)
  assert.throws(
    () => parseCenterImport([{ ...row, 自定义报工时间: '25:00' }], refs, tenantId),
    /HH:mm/
  )
  assert.throws(() => parseCenterImport([row], refs, 'tenant-b'), /所属产线编码/)
})
