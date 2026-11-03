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
import { createWmsPackCompositionColumns } from '../../modules/art-supabase-wms/src/views/shared/wms-pack-composition-columns'

const file =
  'modules/art-supabase-wms/src/views/inventory-trace/shared/inventory-report-workspace.vue'
const script = parse(readFileSync(new URL('../../' + file, import.meta.url), 'utf8')).descriptor
  .scriptSetup
assert.ok(script)
const source = ts.createSourceFile(
  file,
  script.content,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)
const functions = source.statements
  .filter(ts.isFunctionDeclaration)
  .filter((statement) => ['columnsFactory', 'quantityColumn'].includes(statement.name?.text ?? ''))
const summary = source.statements
  .filter(ts.isVariableStatement)
  .find((statement) =>
    statement.declarationList.declarations.some(
      (declaration) =>
        ts.isIdentifier(declaration.name) && declaration.name.text === 'summaryOptions'
    )
  )
assert.ok(summary)
assert.equal(functions.length, 2)
const { outputText } = ts.transpileModule(
  [
    summary.getText(source),
    ...functions.map((statement) => statement.getText(source)),
    'columnsFactory()'
  ].join('\n'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.React
    }
  }
)

type Kind = 'stock' | 'movement' | 'ledger' | 'receipt-issue'
type SummaryValue =
  'inventoryQuantity' | 'basicQuantity' | 'auxiliaryQuantity' | 'auxiliaryQuantity2'
const allValues: SummaryValue[] = [
  'inventoryQuantity',
  'basicQuantity',
  'auxiliaryQuantity',
  'auxiliaryQuantity2'
]

function columnsFor(
  kind: Kind,
  summaryValues: SummaryValue[],
  transferAllowed = true
): ColumnOption<unknown>[] {
  // Run only the production column factory; renderer callbacks and business APIs never execute.
  const columns: unknown = runInNewContext(
    outputText,
    {
      props: { kind },
      search: { value: { summaryValues } },
      hasAuth: () => transferAllowed,
      createWmsPackCompositionColumns
    },
    { timeout: 1000 }
  )
  assert.ok(Array.isArray(columns))
  assert.ok(
    columns.every((column: unknown) => column && typeof column === 'object' && 'prop' in column)
  )
  return columns as ColumnOption<unknown>[]
}

const routes = {
  stock: '/wms/inventory-trace/stock',
  movement: '/wms/inventory-trace/inventory-ledger',
  ledger: '/wms/inventory-trace/stock-ledger',
  'receipt-issue': '/wms/inventory-trace/material-receipt-issue'
} as const
const { catalogs } = generateColumnCatalog(
  Object.values(routes).map((component, index) => ({
    id: String(index),
    component,
    type: 'menu',
    path: component,
    parent_id: null
  }))
)

for (const kind of Object.keys(routes) as Kind[]) {
  test(`${kind}: quantity selection preserves catalog matching and saved parent settings`, () => {
    const catalog = catalogs.find((item) => item.routePath === routes[kind])
    assert.ok(catalog)
    const keys = catalog.columns.map((column) => column.key)
    const complete = columnsFor(kind, allValues)
    for (const field of ['packNo', 'packArea', 'packBoardNo', 'packLengthMm', 'packPieces']) {
      assert.ok(keys.includes(field), `${kind} catalog must include ${field}`)
      assert.ok(complete.some((column) => column.prop === field))
    }
    const groupKeys = complete.filter((column) => column.children?.length).map(getColumnKey)
    for (const selected of [
      allValues,
      ['auxiliaryQuantity', 'auxiliaryQuantity2'],
      ['inventoryQuantity'],
      []
    ] as SummaryValue[][]) {
      const columns = columnsFor(kind, selected)
      assert.deepEqual(
        Array.from(columns.filter((column) => column.children?.length).map(getColumnKey)),
        Array.from(groupKeys)
      )
      assert.equal(matchesColumnCatalog(columns, keys, catalog.columns), true)
      const summaryKeys = selected.length ? selected : ['inventoryQuantity', 'basicQuantity']
      for (const group of columns.filter((column) => column.children?.length)) {
        assert.equal(group.children?.length, summaryKeys.length)
        for (const child of group.children ?? [])
          assert.ok(
            catalog.columns.some(
              (column) =>
                column.key === getColumnKey(child) && column.parentKey === getColumnKey(group)
            )
          )
      }
      const configured = applyColumnProfile(
        columns,
        [{ key: 'measurementUnits', label: '配置单位', visible: true, fixed: 'right' }],
        catalog.columns
      )
      const units = configured.find((column) => column.prop === 'measurementUnits')
      assert.equal(units?.label, '配置单位')
      assert.equal(units?.fixed, 'right')
      assert.equal(
        units?.children?.length,
        summaryKeys.length,
        'saved catalog must not introduce unselected quantities'
      )
    }
    assert.equal(
      matchesColumnCatalog(
        [
          { prop: 'materialCode' },
          { prop: 'quantity' },
          { prop: 'unitPrice' },
          { prop: 'operation' }
        ],
        keys,
        catalog.columns
      ),
      false,
      'a document-line table must not inherit report configuration'
    )
  })
}

test('stock configuration preserves the project-transfer permission boundary', () => {
  const originals = columnsFor('stock', allValues, false)
  const catalog = catalogs.find((item) => item.routePath === routes.stock)!
  assert.equal(
    matchesColumnCatalog(
      originals,
      catalog.columns.map((column) => column.key),
      catalog.columns
    ),
    true
  )
  const configured = applyColumnProfile(originals, catalog.columns, catalog.columns)
  assert.equal(
    configured.some((column) => column.prop === 'operation'),
    false
  )
  assert.equal(
    columnsFor('stock', allValues).some((column) => column.prop === 'operation'),
    true
  )
})
