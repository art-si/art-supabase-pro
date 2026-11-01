import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { generateColumnCatalog } from '../../scripts/generate-table-column-catalog'
import {
  applyColumnProfile,
  getColumnKey,
  matchesColumnCatalog
} from '../../src/utils/table/column-profile'
import type { ColumnOption } from '../../src/types/component'
import type { TableColumnCatalog } from '../../src/types/table-column-config'
import { purchaseConfigs } from '../../modules/art-supabase-scm/src/views/purchase-document/purchase-config'
import { scmDocumentConfigs } from '../../modules/art-supabase-scm/src/views/sales-document/document-config'

function catalogFor(routePath: string): TableColumnCatalog {
  const result = generateColumnCatalog([
    { id: routePath, component: routePath, type: 'menu', path: routePath, parent_id: null }
  ])
  assert.deepEqual(result.unregistered, [])
  assert.equal(result.catalogs.length, 1)
  return result.catalogs[0]
}

/** Execute only production column factories. Renderers and business operations remain inert. */
function compileFactory(file: string, names: string[], invocation = 'columnsFactory()') {
  const text = readFileSync(new URL('../../' + file, import.meta.url), 'utf8')
  const code = file.endsWith('.vue') ? parse(text).descriptor.scriptSetup?.content : text
  assert.ok(code)
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declarations = source.statements.filter(
    (statement) =>
      (ts.isFunctionDeclaration(statement) &&
        statement.name &&
        names.includes(statement.name.text)) ||
      (ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)
        ))
  )
  assert.equal(declarations.length, names.length, file)
  const compiled = ts.transpileModule(
    declarations
      .map((statement) => statement.getText(source).replace(/^export\s+/, ''))
      .join('\n') +
      '\n' +
      invocation,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }
  ).outputText
  return (context: Record<string, unknown>): ColumnOption<unknown>[] => {
    const columns: unknown = runInNewContext(compiled, context, { timeout: 1000 })
    assert.ok(Array.isArray(columns))
    assert.ok(
      columns.every(
        (column: unknown) =>
          column && typeof column === 'object' && ('prop' in column || 'type' in column)
      )
    )
    return columns as ColumnOption<unknown>[]
  }
}

function assertMainList(
  columns: ColumnOption<unknown>[],
  catalog: TableColumnCatalog,
  context: string
): void {
  const keys = catalog.columns.map((column) => column.key)
  assert.equal(matchesColumnCatalog(columns, keys, catalog.columns), true, context)
  const configured = applyColumnProfile(
    columns,
    [{ key: 'documentNo', label: '配置单号', visible: true }],
    catalog.columns
  )
  assert.equal(
    configured.find((column) => column.prop === 'documentNo')?.label,
    '配置单号',
    context
  )
  assert.deepEqual(
    [...configured.map(getColumnKey)].sort(),
    [...columns.map(getColumnKey)].sort(),
    'catalog settings cannot introduce columns outside the active source factory'
  )
}

const purchaseFactory = compileFactory(
  'modules/art-supabase-scm/src/views/purchase-document/purchase-workspace.vue',
  ['columnsFactory']
)
for (const kind of [
  'purchase_contract',
  'purchase_request',
  'purchase_order',
  'receipt_notice'
] as const) {
  test(`SCM ${kind} document and line modes both match their registered main-list catalog`, () => {
    const catalog = catalogFor('/scm/purchase-management/' + kind.replaceAll('_', '-'))
    for (const mode of ['document', 'line'])
      assertMainList(
        purchaseFactory({
          props: { kind },
          config: { value: purchaseConfigs[kind] },
          displayMode: { value: mode }
        }),
        catalog,
        `${kind}: ${mode}`
      )
  })
}

const salesFactory = compileFactory(
  'modules/art-supabase-scm/src/views/sales-document/scm-document-workspace.vue',
  ['columnsFactory', 'detailColumns']
)
for (const kind of [
  'sales_quotation',
  'sales_contract',
  'sales_order',
  'shipping_notice',
  'loading'
] as const) {
  test(`SCM ${kind} keeps mapped business columns and supports both document modes`, () => {
    const routePath =
      (kind === 'sales_quotation' ? '/scm/sales-quotation/' : '/scm/sales-management/') +
      kind.replaceAll('_', '-')
    const catalog = catalogFor(routePath)
    for (const mode of ['document', 'line'])
      assertMainList(
        salesFactory({
          props: { kind },
          config: { value: scmDocumentConfigs[kind] },
          displayMode: { value: mode }
        }),
        catalog,
        `${kind}: ${mode}`
      )
  })
}

const receivableFactory = compileFactory(
  'modules/art-supabase-fms/src/views/accounts-receivable/modules/receivable-workspace.vue',
  ['moneyColumn', 'columnsFactory']
)
for (const kind of ['estimate', 'financial'] as const) {
  test(`FMS ${kind} receivable supports document and line modes`, () => {
    const catalog = catalogFor(
      `/fms/accounts-receivable/${kind === 'estimate' ? 'estimated' : kind}-receivable`
    )
    for (const viewMode of ['document', 'line'])
      assertMainList(
        receivableFactory({
          props: { kind },
          search: { value: { viewMode } },
          permissions: { value: { View: 'view' } },
          viewDocument: () => {}
        }),
        catalog,
        `${kind}: ${viewMode}`
      )
  })
}

const payableFactory = compileFactory(
  'src/components/business/purchase-payable-workspace/index.vue',
  ['moneyColumn', 'columnsFactory']
)
for (const kind of ['estimated', 'financial'] as const) {
  test(`FMS ${kind} payable matches document and line modes in all and own tenant workspaces`, () => {
    const catalog = catalogFor(
      `/fms/accounts-payable/${kind === 'estimated' ? 'estimated-payable' : 'purchase-payable'}`
    )
    for (const viewMode of ['document', 'line'])
      for (const isAllTenants of [true, false])
        assertMainList(
          payableFactory({ props: { kind }, search: { viewMode }, tenantScope: { isAllTenants } }),
          catalog,
          `${kind}: ${viewMode}: ${isAllTenants}`
        )
  })
}

const waybillFactory = compileFactory(
  'modules/art-supabase-tms/src/views/waybill-management/modules/waybill-shared.tsx',
  ['createWaybillColumns'],
  'createWaybillColumns(context)'
)
for (const mode of ['pending', 'loaded']) {
  test(`TMS ${mode} matches when field permissions omit sensitive columns without restoring them`, () => {
    const catalog = catalogFor('/tms/waybill-management/' + mode)
    for (const allowed of [true, false]) {
      const columns = waybillFactory({
        context: { mode, fieldAccess: { value: {} } },
        canViewField: () => allowed
      })
      assert.equal(
        matchesColumnCatalog(
          columns,
          catalog.columns.map((column) => column.key),
          catalog.columns
        ),
        true,
        `${mode}: ${allowed}`
      )
      const configured = applyColumnProfile(columns, catalog.columns, catalog.columns)
      assert.equal(
        configured.some((column) => column.prop === 'shippingContactPhone'),
        allowed
      )
      assert.equal(
        configured.some((column) => column.prop === 'insuranceFee'),
        allowed
      )
    }
  })
}

const successionFactory = compileFactory(
  'modules/art-supabase-hr/src/views/talent/succession/index.vue',
  ['actionColumn', 'columnsFactory']
)
test('HR succession retains the final development-action tab without an explicit selector comparison', () => {
  const catalog = catalogFor('/hr/talent/succession')
  assert.equal(catalog.columns.find((column) => column.key === 'action')?.locked, true)
  for (const [entity, primaryKey] of [
    ['plan', 'planName'],
    ['candidate', 'employee'],
    ['action', 'actionTitle']
  ]) {
    const columns = successionFactory({ activeEntity: { value: entity } })
    assert.equal(
      matchesColumnCatalog(
        columns,
        catalog.columns.map((column) => column.key),
        catalog.columns
      ),
      true,
      entity
    )
    assert.ok(
      catalog.columns.some((column) => column.key === primaryKey),
      primaryKey
    )
    assert.equal(
      applyColumnProfile(
        columns,
        [{ key: primaryKey, label: '配置身份', visible: true }],
        catalog.columns
      ).find((column) => column.prop === primaryKey)?.label,
      '配置身份'
    )
  }
})
