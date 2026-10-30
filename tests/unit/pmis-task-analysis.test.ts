import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzePmisTasks,
  summarizePmisTasks
} from '../../modules/art-supabase-pmis/src/domain/task-analysis'
import type {
  PmisDepartmentOption,
  PmisEmployeeReference,
  PmisTask
} from '../../modules/art-supabase-pmis/src/api/types'

const tenantId = '11111111-1111-4111-8111-111111111111'
const departmentId = '22222222-2222-4222-8222-222222222222'
const repairerOne = '33333333-3333-4333-8333-333333333333'
const repairerTwo = '44444444-4444-4444-8444-444444444444'
const equipmentOne = '55555555-5555-4555-8555-555555555555'
const equipmentTwo = '66666666-6666-4666-8666-666666666666'
const equipmentThree = '77777777-7777-4777-8777-777777777777'

const department: PmisDepartmentOption = {
  id: departmentId,
  tenantId,
  departmentCode: 'LINE-A',
  departmentName: '产线甲'
}
const personOne: PmisEmployeeReference = {
  id: repairerOne,
  employeeNo: 'E-001',
  employeeName: '员工甲'
}
const personTwo: PmisEmployeeReference = {
  id: repairerTwo,
  employeeNo: 'E-002',
  employeeName: '员工乙'
}

function task(
  id: string,
  displayStatus: PmisTask['displayStatus'],
  equipmentId: string,
  options: {
    department?: PmisDepartmentOption
    responsible?: PmisEmployeeReference
  } = {}
): PmisTask {
  const status: PmisTask['status'] =
    displayStatus === 'overdue'
      ? 'pending'
      : displayStatus === 'completed_overdue'
        ? 'completed'
        : displayStatus
  return {
    id,
    tenantId,
    taskNo: id,
    plannedDate: '2026-10-15',
    status,
    displayStatus,
    taskSource: 'scheduled',
    beforePhotoFiles: [],
    afterPhotoFiles: [],
    plan: {
      id: 'plan-a',
      planKind: 'inspection',
      planName: '点检方案',
      requiredDays: 1,
      requirePhoto: false,
      items: []
    },
    equipment: {
      id: equipmentId,
      tenantId,
      equipmentCode: `EQ-${equipmentId.slice(0, 4)}`,
      equipmentName: `设备-${equipmentId.slice(0, 4)}`,
      operationStatus: 'normal',
      status: 'enabled',
      department: options.department
    },
    responsible: options.responsible,
    results: []
  }
}

test('overview preserves empty and every display-status count, including exempt denominator', () => {
  assert.deepEqual(summarizePmisTasks([]), {
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    exempt: 0,
    completionRate: 0
  })

  const statuses: PmisTask['displayStatus'][] = [
    'pending',
    'pending_confirm',
    'completed',
    'completed_overdue',
    'overdue',
    'exempt'
  ]
  const rows = statuses.map((status, index) => task(`task-${index}`, status, equipmentOne))
  assert.deepEqual(summarizePmisTasks(rows), {
    total: 6,
    completed: 1,
    pending: 1,
    overdue: 1,
    exempt: 1,
    completionRate: 20
  })
  assert.deepEqual(
    summarizePmisTasks([task('exempt-only', 'exempt', equipmentOne)]).completionRate,
    0
  )
})

test('three analysis dimensions preserve labels, missing references, distinct equipment and risk order', () => {
  const rows = [
    task('task-a', 'overdue', equipmentOne, { department, responsible: personOne }),
    task('task-b', 'completed', equipmentOne, { department, responsible: personOne }),
    task('task-c', 'pending', equipmentTwo, { department, responsible: personTwo }),
    task('task-d', 'exempt', equipmentThree),
    task('task-e', 'overdue', equipmentThree)
  ]

  const byDepartment = analyzePmisTasks(rows, 'department')
  assert.deepEqual(
    byDepartment.map(({ id, label, description }) => ({ id, label, description })),
    [
      { id: 'unassigned', label: '未分配产线', description: '1 台设备' },
      { id: departmentId, label: '产线甲', description: '2 台设备' }
    ]
  )
  assert.deepEqual(
    byDepartment.map(({ total, completed, pending, overdue, completionRate }) => ({
      total,
      completed,
      pending,
      overdue,
      completionRate
    })),
    [
      { total: 2, completed: 0, pending: 0, overdue: 1, completionRate: 0 },
      { total: 3, completed: 1, pending: 1, overdue: 1, completionRate: 33.3 }
    ]
  )

  const byEquipment = analyzePmisTasks(rows, 'equipment')
  assert.deepEqual(
    byEquipment.map((item) => item.id),
    [equipmentThree, equipmentOne, equipmentTwo]
  )
  assert.equal(byEquipment[0]?.label, `设备-${equipmentThree.slice(0, 4)}`)
  assert.equal(byEquipment[0]?.description, `EQ-${equipmentThree.slice(0, 4)}`)

  const byResponsible = analyzePmisTasks(rows, 'responsible')
  assert.deepEqual(
    byResponsible.map((item) => item.id),
    ['unassigned', repairerOne, repairerTwo]
  )
  assert.deepEqual(
    byResponsible.map((item) => [item.label, item.description]),
    [
      ['未分配人员', undefined],
      ['员工甲', 'E-001'],
      ['员工乙', 'E-002']
    ]
  )
})

test('equal-risk UUID groups keep first-seen order without modifying frozen input', () => {
  const first = task('first', 'pending', equipmentTwo)
  const second = task('second', 'pending', equipmentOne)
  const rows: PmisTask[] = [first, second]
  rows.forEach(Object.freeze)
  Object.freeze(rows)
  const before = structuredClone(rows)

  assert.deepEqual(
    analyzePmisTasks(rows, 'equipment').map((item) => item.id),
    [equipmentTwo, equipmentOne]
  )
  assert.deepEqual(rows, before)
  assert.strictEqual(rows[0], first)
  assert.strictEqual(rows[1], second)
})
