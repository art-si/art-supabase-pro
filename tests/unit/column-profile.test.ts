import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyColumnProfile,
  hasVisibleBusinessColumn,
  matchesColumnCatalog,
  resolveColumnProfiles
} from '../../src/utils/table/column-profile'
import type { TableColumnProfile } from '../../src/types/table-column-config'

const profile = (
  id: string,
  scope: TableColumnProfile['scope'],
  priority = 0
): TableColumnProfile => ({
  id,
  scope,
  priority,
  menuId: 'menu',
  tenantId: null,
  subjectId: null,
  source: 'configured',
  columns: [{ key: 'name', label: id, visible: true }],
  revision: 1,
  updatedAt: ''
})
test('column layout cannot invent unauthorized columns or remove structural actions', () => {
  const renderer = () => '业务入口'
  const result = applyColumnProfile(
    [
      { prop: 'name', label: '名称', formatter: renderer },
      { prop: 'operation', label: '操作', fixed: 'right' }
    ],
    [
      { key: 'secret', label: '敏感金额', visible: true },
      { key: 'name', label: '业务名称', visible: true, sortable: true },
      { key: 'operation', label: '隐藏操作', visible: false }
    ]
  )
  assert.deepEqual(
    result.map((c) => c.prop),
    ['name', 'operation']
  )
  assert.equal(result[0].formatter, renderer)
  assert.equal(result[0].sortable, true)
  assert.equal(result[1].visible, true)
  assert.equal(result[1].fixed, 'right')
  assert.equal(
    applyColumnProfile(
      [{ prop: 'amount', label: '金额', visible: false }],
      [{ key: 'amount', label: '金额', visible: true }]
    )[0].visible,
    false
  )
})
test('scope inheritance and role priority are deterministic and frontend override disables remote layout', () => {
  const platform = profile('platform', 'platform'),
    tenant = profile('tenant', 'tenant'),
    roleLow = profile('low', 'role', 1),
    roleHigh = profile('high', 'role', 10),
    user = profile('user', 'user')
  assert.equal(
    resolveColumnProfiles([roleHigh, tenant, platform, roleLow]).columns[0].label,
    'high'
  )
  assert.equal(
    resolveColumnProfiles([roleHigh, tenant, platform, roleLow, user]).columns[0].label,
    'user'
  )
  assert.equal(resolveColumnProfiles([platform, { ...user, source: 'frontend' }]).configured, false)
  assert.equal(resolveColumnProfiles([{ ...platform, source: 'inherit' }]).configured, false)
})
test('a picker or an unrelated embedded table does not match the route main-list catalog', () => {
  assert.equal(
    matchesColumnCatalog([{ prop: 'name' }, { prop: 'code' }], ['name', 'code', 'amount']),
    true
  )
  assert.equal(matchesColumnCatalog([{ prop: 'unrelated' }], ['name', 'code', 'amount']), false)
  assert.equal(matchesColumnCatalog([{ prop: 'name' }], ['name', 'code', 'amount']), false)
})

test('configured table mode applies the saved settings to every business column', () => {
  const originals = [
    { prop: 'name', label: '前端名称', width: 180 },
    { prop: 'amount', label: '金额', width: 120 }
  ]
  const configured = applyColumnProfile(originals, [
    { key: 'amount', label: '配置金额', visible: true, width: 200 },
    { key: 'name', label: '配置名称', visible: false, width: 400 }
  ])
  assert.deepEqual(
    configured.map((column) => column.prop),
    ['amount', 'name']
  )
  assert.equal(configured[0].label, '配置金额')
  assert.equal(configured[1].label, '配置名称')
  assert.equal(configured[1].visible, false)
  assert.equal(
    resolveColumnProfiles([{ ...profile('table', 'platform'), source: 'frontend' }]).configured,
    false
  )
})

test('advanced layout clears fixed width, preserves remote sorting and fills newly catalogued columns', () => {
  const result = applyColumnProfile(
    [
      { prop: 'name', width: 240, sortable: 'custom' },
      { prop: 'code', width: 80 }
    ],
    [
      {
        key: 'name',
        label: '名称',
        visible: true,
        minWidth: 160,
        sortable: true,
        fixed: 'right',
        align: 'center',
        showOverflowTooltip: false
      }
    ],
    [{ key: 'code', label: '新编码', visible: true, width: 120, sortable: true }]
  )
  assert.equal(result[0].width, undefined)
  assert.equal(result[0].minWidth, 160)
  assert.equal(result[0].sortable, 'custom')
  assert.equal(result[0].fixed, 'right')
  assert.equal(result[0].align, 'center')
  assert.equal(result[0].showOverflowTooltip, false)
  assert.equal(result[1].width, 120)
  assert.equal(result[1].label, '新编码')
  assert.equal(result[1].sortable, true)
})

test('keyed main-list variants match their own column set and grouped columns retain their parents', () => {
  const catalog = [
    { key: 'a', label: 'A', visible: true, groups: ['one'] },
    { key: 'b', label: 'B', visible: true, groups: ['two'] },
    { key: 'c', label: 'C', visible: true, groups: ['two'] }
  ]
  assert.equal(
    matchesColumnCatalog(
      [{ prop: 'a' }],
      catalog.map((column) => column.key),
      catalog
    ),
    true
  )
  assert.equal(
    matchesColumnCatalog(
      [{ prop: 'unrelated' }],
      catalog.map((column) => column.key),
      catalog
    ),
    false
  )
  const grouped = applyColumnProfile(
    [
      {
        label: '金额',
        children: [
          { prop: 'net', label: '未税' },
          { prop: 'tax', label: '税额' }
        ]
      }
    ],
    [
      { key: 'tax', label: '配置税额', visible: true, width: 100 },
      { key: 'net', label: '未税', visible: false }
    ]
  )
  assert.equal(grouped[0].label, '金额')
  assert.deepEqual(
    grouped[0].children?.map((column) => column.prop),
    ['tax']
  )
  assert.equal(grouped[0].children?.[0].label, '配置税额')
})

test('a hidden group cannot leave a supposedly visible business leaf or save a structural-only table', () => {
  const group = { key: '__group__金额', label: '金额', visible: false }
  const leaf = { key: 'amount', label: '金额值', visible: true, parentKey: group.key }
  assert.equal(hasVisibleBusinessColumn([group, leaf], [group, leaf]), false)
  assert.equal(hasVisibleBusinessColumn([{ ...group, visible: true }, leaf], [group, leaf]), true)
  assert.equal(
    hasVisibleBusinessColumn([{ key: 'operation', label: '操作', visible: true }], []),
    false
  )
})

test('automatic sizing on a saved row clears a width inherited from another scope', () => {
  const inherited = {
    ...profile('role', 'role'),
    columns: [{ key: 'name', label: '名称', visible: true, width: 240 }]
  }
  const own = {
    ...profile('user', 'user'),
    columns: [{ key: 'name', label: '用户名称', visible: true }]
  }
  const effective = resolveColumnProfiles([inherited, own])
  assert.equal(effective.columns[0].width, undefined)
  assert.equal(
    applyColumnProfile([{ prop: 'name', width: 180 }], effective.columns)[0].width,
    undefined
  )
})
