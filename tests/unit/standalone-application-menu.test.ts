import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppRouteRecord } from '../../src/types/router'
import {
  buildApplicationMenuTree,
  flattenStandaloneApplicationMenu
} from '../../src/router/core/application-menu'

const vmsMenu: AppRouteRecord[] = [
  {
    name: 'VmsRoot',
    path: '/vms',
    component: '/index/index',
    meta: { title: 'VMS车辆管理' },
    children: [
      {
        name: 'VehicleQuery',
        path: '/vms/vehicle-query',
        component: '/vms/vehicle-query/index',
        meta: { title: '车辆查询' }
      },
      {
        name: 'BasicInfo',
        path: '/vms/basic-info',
        meta: { title: '基础信息管理' },
        children: [
          {
            name: 'Parts',
            path: '/vms/basic-info/parts',
            component: '/vms/basic-info/parts/index',
            meta: { title: '配件管理' }
          }
        ]
      }
    ]
  }
]

test('keeps application directories in the platform panoramic menu', () => {
  assert.deepEqual(flattenStandaloneApplicationMenu(vmsMenu, 'platform'), vmsMenu)
})

test('promotes application children without changing stable route paths in standalone mode', () => {
  const flattened = flattenStandaloneApplicationMenu(vmsMenu, 'vms')

  assert.equal(flattened.length, 2)
  assert.equal(flattened[0]?.meta.title, '车辆查询')
  assert.equal(flattened[0]?.path, '/vms/vehicle-query')
  assert.equal(flattened[1]?.meta.title, '基础信息管理')
  assert.equal(flattened[1]?.component, '/index/index')
})

test('rebuilds authorized menu trees in sorted order without adding ungranted siblings', () => {
  const flat: AppRouteRecord[] = [
    { id: 'root', parentId: null, name: 'Root', path: '/mdm', meta: { title: 'MDM' } },
    { id: 'other', parentId: null, name: 'Other', path: '/other', meta: { title: 'Other' } },
    { id: 'child', parentId: 'root', name: 'Child', path: 'child', meta: { title: 'Child' } },
    { id: 'button', parentId: 'child', name: 'Child:View', path: '', meta: { title: 'View' } },
    {
      id: 'orphan',
      parentId: 'not-granted',
      name: 'Orphan',
      path: 'orphan',
      meta: { title: 'Orphan' }
    }
  ]

  const tree = buildApplicationMenuTree(flat)
  assert.deepEqual(
    tree.map((item) => item.id),
    ['root', 'other', 'orphan']
  )
  assert.deepEqual(
    tree[0]?.children?.map((item) => item.id),
    ['child']
  )
  assert.deepEqual(
    tree[0]?.children?.[0]?.children?.map((item) => item.id),
    ['button']
  )
  assert.deepEqual(tree[1]?.children, [])
  assert.equal('children' in flat[0], false)
})
