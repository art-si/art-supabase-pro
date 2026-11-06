import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppRouteRecord } from '../../src/types/router'
import {
  buildApplicationMenuTree,
  flattenStandaloneApplicationMenu,
  normalizeApplicationMenuPaths
} from '../../src/router/core/application-menu'
import { RouteValidator } from '../../src/router/core/route-validator'

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

test('keeps an absolute WMS URL when the menu is grouped under SCM', () => {
  const flat: AppRouteRecord[] = [
    {
      id: 'scm',
      parentId: null,
      name: 'ScmRoot',
      path: '/scm',
      component: '/index/index',
      meta: { title: 'SCM' }
    },
    {
      id: 'purchase',
      parentId: 'scm',
      name: 'ScmPurchaseManagement',
      path: 'purchase-management',
      meta: { title: '采购管理' }
    },
    {
      id: 'inbound',
      parentId: 'purchase',
      name: 'WmsPurchaseInbound',
      path: '/wms/inbound-business/purchase-inbound',
      component: '/wms/inbound-business/purchase-inbound/index',
      meta: { title: '采购入库单' }
    }
  ]
  const errors: unknown[][] = []
  const originalError = console.error
  console.error = (...args) => errors.push(args)
  try {
    const menu = normalizeApplicationMenuPaths(buildApplicationMenuTree(flat))
    const purchase = menu[0]?.children?.[0]
    assert.equal(purchase?.path, '/scm/purchase-management')
    assert.equal(purchase?.children?.[0]?.path, '/wms/inbound-business/purchase-inbound')
    assert.equal(purchase?.redirect, '/wms/inbound-business/purchase-inbound')
    assert.equal(new RouteValidator().validate(menu).valid, true)
    assert.deepEqual(errors, [])
  } finally {
    console.error = originalError
  }
})

test('moving a relative child changes its full URL unless its old URL is preserved', () => {
  const parent = (id: string, path: string): AppRouteRecord => ({
    id,
    name: id,
    path,
    component: '/index/index',
    meta: { title: id }
  })
  const child = (parentId: string, path: string): AppRouteRecord => ({
    id: 'folder',
    parentId,
    name: 'Folder',
    path,
    component: '/legacy/folder-view',
    meta: { title: '目录' }
  })
  const pathAfterNormalization = (parentId: string, path: string): string | undefined => {
    const tree = buildApplicationMenuTree([
      parent('legacy-root', '/legacy'),
      parent('target-folder', '/target'),
      child(parentId, path)
    ])
    const normalized = normalizeApplicationMenuPaths(tree)
    return normalized.find((item) => item.id === parentId)?.children?.[0]?.path
  }

  assert.equal(pathAfterNormalization('legacy-root', 'folder'), '/legacy/folder')
  assert.equal(pathAfterNormalization('target-folder', 'folder'), '/target/folder')
  assert.equal(pathAfterNormalization('target-folder', '/legacy/folder'), '/legacy/folder')
})

test('route diagnostics retain the absolute child URL', () => {
  const menu: AppRouteRecord[] = [
    {
      name: 'ScmRoot',
      path: '/scm',
      component: '/index/index',
      meta: { title: 'SCM' },
      children: [
        {
          name: 'Duplicate',
          path: 'other',
          component: '/scm/other/index',
          meta: { title: '其他' }
        },
        {
          name: 'Duplicate',
          path: '/wms/inbound-business/purchase-inbound',
          component: '/wms/inbound-business/purchase-inbound/index',
          meta: { title: '采购入库单' }
        }
      ]
    }
  ]

  const result = new RouteValidator().validate(menu)
  assert.ok(
    result.warnings.includes('路由名称重复: "Duplicate" (/wms/inbound-business/purchase-inbound)')
  )
})
