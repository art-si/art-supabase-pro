import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyColumnProfile,
  ensureTableFillColumn,
  hasVisibleBusinessColumn,
  isTableOperationColumn,
  matchesColumnCatalog,
  resolveColumnProfiles
} from '../../src/utils/table/column-profile'
import type { TableColumnProfile, TableColumnSetting } from '../../src/types/table-column-config'

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

test('fit tables retain a stretchable business column after every saved width becomes explicit', () => {
  const columns = [
    { type: 'selection', width: 48 },
    { prop: 'name', label: '名称', width: 220, minWidth: 180, fixed: 'left' },
    { prop: 'status', label: '状态', width: 96 },
    { prop: 'operation', label: '操作', width: 112, fixed: 'right' }
  ] as Parameters<typeof ensureTableFillColumn>[0]
  const fitted = ensureTableFillColumn(columns)
  assert.equal(fitted[1].width, undefined)
  assert.equal(fitted[1].minWidth, 220)
  assert.equal(fitted[0].width, 48)
  assert.equal(fitted[3].width, 112)
  assert.equal(columns[1].width, 220)
  const elastic = [
    { prop: 'name', minWidth: 180 },
    { prop: 'operation', width: 112 }
  ]
  assert.equal(ensureTableFillColumn(elastic), elastic)
  assert.deepEqual(ensureTableFillColumn([{ type: 'selection', width: 48 }]), [
    { type: 'selection', width: 48 }
  ])
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

test('multi-table variants match parent columns without counting children toward the coverage threshold', () => {
  const catalog: TableColumnSetting[] = [
    { key: 'name', label: '物料', visible: true, groups: ['stock'] },
    { key: 'quantity', label: '数量', visible: true, groups: ['stock'] },
    ...['inventory', 'basic', 'auxiliary', 'auxiliary2'].map((key) => ({
      key,
      label: key,
      visible: true,
      parentKey: 'quantity',
      groups: ['stock']
    })),
    { key: 'documentNo', label: '单据', visible: true, groups: ['documents'] },
    { key: 'status', label: '状态', visible: true, groups: ['documents'] },
    { key: 'operation', label: '操作', visible: true, groups: ['stock', 'documents'] }
  ]
  const keys = catalog.map((column) => column.key)
  assert.equal(
    matchesColumnCatalog(
      [
        { prop: 'name' },
        { prop: 'quantity', children: [{ prop: 'inventory' }, { prop: 'basic' }] },
        { prop: 'operation' }
      ],
      keys,
      catalog
    ),
    true
  )
  assert.equal(
    matchesColumnCatalog([{ prop: 'documentNo' }, { prop: 'status' }], keys, catalog),
    true
  )
  assert.equal(matchesColumnCatalog([{ prop: 'name' }], keys, catalog), false)
  assert.equal(matchesColumnCatalog([{ prop: 'inventory' }], keys, catalog), false)
  assert.equal(
    matchesColumnCatalog([{ prop: 'name' }, { prop: 'documentNo' }], keys, catalog),
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

test('permission-dependent columns do not reject an authorized main list or turn a partial detail into it', () => {
  const catalog: TableColumnSetting[] = [
    ...['name', 'code', 'status'].map((key) => ({ key, label: key, visible: true })),
    ...Array.from({ length: 9 }, (_, index) => ({
      key: `sensitive${index}`,
      label: `敏感字段${index}`,
      visible: true,
      optional: true
    }))
  ]
  const keys = catalog.map((column) => column.key)
  const original = [{ prop: 'name' }, { prop: 'code' }, { prop: 'status' }]
  assert.equal(matchesColumnCatalog(original, keys, catalog), true)
  assert.equal(matchesColumnCatalog([{ prop: 'name' }], keys, catalog), false)
  assert.equal(
    matchesColumnCatalog(
      catalog.filter((column) => column.optional).map((column) => ({ prop: column.key })),
      keys,
      catalog
    ),
    false
  )
  assert.equal(matchesColumnCatalog([...original, { prop: 'unknown' }], keys, catalog), false)
  assert.deepEqual(
    applyColumnProfile(original, catalog, catalog).map((column) => column.prop),
    ['name', 'code', 'status']
  )
})

test('the action operation alias stays structural without locking an ordinary business action field', () => {
  const action = { key: 'action', label: '操作', visible: true }
  assert.equal(isTableOperationColumn(action), true)
  assert.equal(isTableOperationColumn({ key: 'operation', label: '行操作' }), true)
  assert.equal(isTableOperationColumn({ prop: 'action', label: '业务动作' }), false)
  const configured = applyColumnProfile(
    [{ prop: 'action', label: '操作', fixed: 'right' }],
    [{ ...action, label: '被重命名', visible: false, fixed: false, sortable: true }]
  )
  assert.equal(configured[0].label, '操作')
  assert.equal(configured[0].visible, true)
  assert.equal(configured[0].checked, true)
  assert.equal(configured[0].fixed, 'right')
  assert.equal(configured[0].sortable, undefined)
  assert.equal(hasVisibleBusinessColumn([action], [action]), false)
  assert.equal(hasVisibleBusinessColumn([{ ...action, label: '被重命名' }], [action]), false)
  assert.equal(
    matchesColumnCatalog([{ prop: 'action', label: '操作' }], ['action'], [action]),
    false
  )
  assert.equal(
    matchesColumnCatalog(
      [
        { prop: 'name', label: '名称' },
        { prop: 'action', label: '操作' }
      ],
      ['name', 'action']
    ),
    true
  )
  const businessAction = { ...action, label: '业务动作' }
  assert.equal(hasVisibleBusinessColumn([businessAction], [businessAction]), true)
  assert.equal(
    matchesColumnCatalog([{ prop: 'action', label: '业务动作' }], ['action'], [businessAction]),
    true
  )
  assert.equal(
    applyColumnProfile(
      [{ prop: 'action', label: '业务动作' }],
      [{ ...businessAction, visible: false }]
    )[0].visible,
    false
  )
})
