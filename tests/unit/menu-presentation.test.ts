import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppRouteRecord } from '../../src/types/router'
import {
  getDirectPermissionCount,
  getMenuActionSubject,
  getMenuTypeIcon,
  getMenuTypeTag,
  getMenuTypeText
} from '../../src/views/system/menu/modules/menu-presentation'

const createMenu = (patch: Partial<AppRouteRecord> = {}): AppRouteRecord => ({
  name: 'Menu',
  path: 'menu',
  type: 'menu',
  meta: { title: '菜单管理' },
  ...patch
})

test('describes menu, folder, button and external entries consistently', () => {
  const folder = createMenu({
    type: 'folder',
    meta: { title: '系统管理', icon: 'ri:settings-line' }
  })
  const button = createMenu({ type: 'button', path: '', meta: { title: '查看' } })
  const external = createMenu({ meta: { title: '文档', link: 'https://example.com' } })

  assert.equal(getMenuTypeText(folder), '目录')
  assert.equal(getMenuTypeIcon(folder), 'ri:settings-line')
  assert.equal(getMenuTypeTag(folder), 'info')
  assert.equal(getMenuActionSubject(folder), '目录')

  assert.equal(getMenuTypeText(button), '按钮')
  assert.equal(getMenuTypeIcon(button), 'ri:cursor-line')
  assert.equal(getMenuTypeTag(button), 'danger')
  assert.equal(getMenuActionSubject(button), '权限')

  assert.equal(getMenuTypeText(external), '外链')
  assert.equal(getMenuTypeIcon(external), 'ri:external-link-line')
  assert.equal(getMenuTypeTag(external), 'warning')
})

test('counts only direct button permissions', () => {
  const row = createMenu({
    children: [
      createMenu({ name: 'System:Menu:View', type: 'button', path: '' }),
      createMenu({ name: 'System:Menu:Add', type: 'button', path: '' }),
      createMenu({ name: 'ChildMenu', type: 'menu' })
    ]
  })

  assert.equal(getDirectPermissionCount(row), 2)
})
