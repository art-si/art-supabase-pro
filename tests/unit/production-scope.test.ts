import assert from 'node:assert/strict'
import test from 'node:test'
import TreeUtils from '../../src/utils/tree'
import {
  formatProductionDepartmentPath,
  getDepartmentsWithWorkCenters
} from '../../src/utils/business/production-scope'

test('production department labels retain tenant context only for platform-wide reads', () => {
  const department = { id: 'workshop', name: '装配车间', tenantId: 'tenant-b' }
  const paths = new Map([['workshop', '第一工厂 / 装配车间']])
  const tenants = [{ id: 'tenant-b', tenantName: '乙公司' }]

  assert.equal(
    formatProductionDepartmentPath(department, paths, 'tenant-b', tenants),
    '第一工厂 / 装配车间'
  )
  assert.equal(
    formatProductionDepartmentPath(department, paths, null, tenants),
    '乙公司 / 第一工厂 / 装配车间'
  )
  assert.equal(
    formatProductionDepartmentPath(department, new Map(), null, []),
    '当前租户 / 装配车间'
  )
})

test('production department paths keep numeric map keys distinct from string keys', () => {
  const department = { id: 7, name: '数值车间', tenantId: 'tenant-b' }
  const paths = new Map<string | number, string>([
    [7, '第二工厂 / 数值车间'],
    ['7', '错误路径']
  ])
  const tenants = [{ id: 'tenant-b', tenantName: '乙公司' }]

  assert.equal(
    formatProductionDepartmentPath(department, paths, null, tenants),
    '乙公司 / 第二工厂 / 数值车间'
  )
  assert.equal(
    formatProductionDepartmentPath(department, paths, 'tenant-b', tenants),
    '第二工厂 / 数值车间'
  )
})

test('center membership includes same-tenant ancestors without mutating input', () => {
  const departments = Object.freeze([
    Object.freeze({ id: 'factory', tenantId: 'a', parentId: null }),
    Object.freeze({ id: 'workshop', tenantId: 'a', parentId: 'factory' }),
    Object.freeze({ id: 'team', tenantId: 'a', parentId: 'workshop' }),
    Object.freeze({ id: 'empty', tenantId: 'a', parentId: 'factory' }),
    Object.freeze({ id: 'foreign', tenantId: 'b', parentId: null })
  ])
  const centers = Object.freeze([
    Object.freeze({ tenantId: 'a', departmentId: 'team' }),
    Object.freeze({ tenantId: 'b', departmentId: 'factory' }),
    Object.freeze({ tenantId: 'a', departmentId: 'missing' })
  ])
  assert.deepEqual(
    [...getDepartmentsWithWorkCenters(departments, centers)],
    ['team', 'workshop', 'factory']
  )
  assert.equal(getDepartmentsWithWorkCenters(departments, []).size, 0)
})

test('membership matches subtree lookup over a multi-tenant forest', () => {
  const departments = Array.from({ length: 800 }, (_, index) => {
    const tenantId = `tenant-${Math.floor(index / 200)}`
    const offset = index % 200
    return {
      id: String(index),
      tenantId,
      parentId: offset ? String(index - offset + Math.floor((offset - 1) / 3)) : null
    }
  })
  const centers = departments
    .filter((_, index) => index % 7 === 0)
    .map((department) => ({ tenantId: department.tenantId, departmentId: department.id }))
  const tree = new TreeUtils({ parentKey: 'parentId', deepClone: false })
  const roots = tree.listToTree(departments)
  const expected = departments
    .filter((department) => {
      const ids = new Set(tree.getDescendants(roots, department.id, true).map((item) => item.id))
      return centers.some(
        (center) => center.tenantId === department.tenantId && ids.has(center.departmentId)
      )
    })
    .map((department) => department.id)
    .sort()
  assert.deepEqual([...getDepartmentsWithWorkCenters(departments, centers)].sort(), expected)
})

test('each parent is visited once even with many centers in a deep hierarchy', () => {
  let parentReads = 0
  const departments = Array.from({ length: 5000 }, (_, index) => ({
    id: String(index),
    tenantId: 'a',
    get parentId() {
      parentReads++
      return index ? String(index - 1) : null
    }
  }))
  const centers = Array.from({ length: 5000 }, () => ({ tenantId: 'a', departmentId: '4999' }))
  assert.equal(getDepartmentsWithWorkCenters(departments, centers).size, 5000)
  assert.equal(parentReads, 5000)
})

test('broken parent ownership cannot carry membership across tenants; cycles terminate', () => {
  const departments = [
    { id: 'own', tenantId: 'a', parentId: 'foreign' },
    { id: 'foreign', tenantId: 'b', parentId: null },
    { id: 'cycle-a', tenantId: 'a', parentId: 'cycle-b' },
    { id: 'cycle-b', tenantId: 'a', parentId: 'cycle-a' }
  ]
  const ids = getDepartmentsWithWorkCenters(departments, [
    { tenantId: 'a', departmentId: 'own' },
    { tenantId: 'a', departmentId: 'cycle-a' }
  ])
  assert.deepEqual([...ids], ['own', 'cycle-a', 'cycle-b'])
})
