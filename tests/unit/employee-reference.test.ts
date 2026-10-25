import assert from 'node:assert/strict'
import test from 'node:test'
import { employeeReferenceSelection } from '../../src/utils/form/employee-reference'

test('joined employee display uses the record tenant without inventing an employment status', () => {
  const [employee] = employeeReferenceSelection(
    { id: 'employee', name: '测试员工', code: 'EMP-001' },
    'row-tenant'
  )
  assert.equal(employee.tenantId, 'row-tenant')
  assert.equal(employee.employeeName, '测试员工')
  assert.equal(employee.employeeNo, 'EMP-001')
  assert.equal(employee.employmentStatus, '')
})

test('references from another tenant or without a resolved record tenant are not selected', () => {
  const reference = { id: 'employee', tenantId: 'another-tenant', name: '外部员工' }
  assert.deepEqual(employeeReferenceSelection(reference, 'row-tenant'), [])
  assert.deepEqual(employeeReferenceSelection(reference, undefined), [])
  assert.deepEqual(employeeReferenceSelection(null, 'row-tenant'), [])
})

test('employee projection retains readable identity and job context', () => {
  const [employee] = employeeReferenceSelection(
    { id: 'employee', employeeName: '负责人', employeeNo: 'EMP-002', jobTitle: '主管' },
    'row-tenant'
  )
  assert.equal(employee.employeeName, '负责人')
  assert.equal(employee.employeeNo, 'EMP-002')
  assert.equal(employee.jobTitle, '主管')
})
