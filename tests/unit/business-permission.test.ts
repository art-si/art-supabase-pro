import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isBusinessPermissionRoute,
  normalizeBusinessPermissionAction,
  resolveBusinessButtonPermission
} from '../../src/utils/business-permission'
import {
  managedButtonPermissionCatalog,
  resolveCatalogPermissionCode
} from '../../scripts/business-button-permission-catalog'

test('business routes are limited to the four authorized business modules', () => {
  assert.equal(isBusinessPermissionRoute({ path: '/fms/voucher-center' }), true)
  assert.equal(isBusinessPermissionRoute({ path: '/tms' }), true)
  assert.equal(isBusinessPermissionRoute({ path: '/system/user' }), false)
  assert.equal(isBusinessPermissionRoute({ path: '/fms-legacy' }), false)
})

test('standard business actions resolve to a stable menu-scoped permission', () => {
  const route = { name: 'FinanceVoucherCenter', path: '/fms/voucher-center' }
  assert.equal(resolveBusinessButtonPermission(route, 'add'), 'FinanceVoucherCenter:Add')
  assert.equal(resolveBusinessButtonPermission(route, 'remove'), 'FinanceVoucherCenter:Delete')
  assert.equal(resolveBusinessButtonPermission(route, 'submit'), 'FinanceVoucherCenter:Submit')
  assert.equal(resolveBusinessButtonPermission(route, 'more'), undefined)
})

test('explicit permissions remain compatible and an empty value opts out', () => {
  const route = { name: 'TmsDriver', path: '/tms/basic-data/driver' }
  assert.equal(resolveBusinessButtonPermission(route, 'add', 'TmsDriverAdd'), 'TmsDriverAdd')
  assert.equal(resolveBusinessButtonPermission(route, 'delete', ''), undefined)
  assert.equal(
    resolveBusinessButtonPermission({ name: 'SystemUser', path: '/system/user' }, 'add'),
    undefined
  )
})

test('action normalization rejects non-action dropdown keys', () => {
  assert.equal(normalizeBusinessPermissionAction(1), undefined)
  assert.equal(normalizeBusinessPermissionAction('retry-event'), 'RetryEvent')
})

test('the managed button catalog has unique menu entries and permission codes', () => {
  const menuNames = managedButtonPermissionCatalog.map((entry) => entry.menuName)
  assert.equal(new Set(menuNames).size, menuNames.length)

  const permissionCodes = managedButtonPermissionCatalog.flatMap((entry) =>
    entry.buttons.map((definition) => resolveCatalogPermissionCode(entry.menuName, definition))
  )
  assert.equal(new Set(permissionCodes).size, permissionCodes.length)
  assert.ok(
    permissionCodes.every((code) => /^[A-Za-z][A-Za-z0-9]*(?::[A-Za-z][A-Za-z0-9]*)+$/.test(code))
  )
})
