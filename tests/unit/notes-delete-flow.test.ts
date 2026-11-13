import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'
import { uniq } from 'lodash-es'
import ts from 'typescript'

const apiSource = ts.createSourceFile(
  'notes.ts',
  readFileSync(new URL('../../src/api/notes.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const deleteFunction = apiSource.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'deleteNotes'
)
assert.ok(deleteFunction)
const deleteCode = ts.transpileModule(
  `${deleteFunction.getText().replace(/^export /, '')}; deleteNotes`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText

test('notes bulk delete sends one filtered request and returns the actual affected count', async () => {
  let requests = 0
  const remove = vm.runInNewContext(deleteCode, {
    uniq,
    supabase: {
      from: (table: string) => {
        assert.equal(table, 'notes')
        return {
          delete: (options: { count: string }) => {
            requests++
            assert.equal(options.count, 'exact')
            return {
              in: (column: string, ids: string[]) => {
                assert.equal(column, 'id')
                assert.deepEqual(Array.from(ids), ['a', 'b'])
                return { count: 1, error: null }
              }
            }
          }
        }
      }
    },
    responseHandle: async (request: () => Promise<unknown>, options: Record<string, unknown>) => {
      assert.equal(options.requireAffected, true)
      assert.equal(options.breakReturn, true)
      assert.equal(options.showReferenceFeedback, false)
      await request()
      return { total: 1 }
    }
  }) as (ids: string[]) => Promise<number>
  assert.equal(await remove(['a', 'b', 'a', '']), 1)
  assert.equal(requests, 1)
  await assert.rejects(remove([]), /请选择需要删除的笔记/)
  assert.equal(requests, 1)
})

test('notes bulk delete preserves server rejection for the reference guard to recheck', async () => {
  const rejection = new Error('concurrent reference')
  const remove = vm.runInNewContext(deleteCode, {
    uniq,
    responseHandle: async () => {
      throw rejection
    }
  }) as (ids: string[]) => Promise<number>
  await assert.rejects(remove(['a', 'b']), (error) => error === rejection)
})

test('notes bulk action stays pending until the guarded deletion completes', async () => {
  const { descriptor } = parse(
    readFileSync(new URL('../../src/views/system/notes/index.vue', import.meta.url), 'utf8')
  )
  const source = ts.createSourceFile(
    'notes.tsx',
    descriptor.scriptSetup!.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const declaration = source.statements
    .flatMap((statement) =>
      ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []
    )
    .find((item) => item.name.getText() === 'table')
  assert.ok(declaration?.initializer)
  const javascript = ts.transpileModule(
    `const table = ${declaration.initializer.getText()}; table`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const busy = { value: false }
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const selectedRows = [{ id: 'a' }, { id: 'b' }]
  const table = vm.runInNewContext(javascript, {
    reactive: (value: unknown) => value,
    computed: (getter: () => unknown) => ({
      get value() {
        return getter()
      }
    }),
    deleteBusy: busy,
    removeSelected: (rows: unknown[]) => {
      assert.equal(rows, selectedRows)
      return pending
    }
  }) as {
    headerActions: {
      value: Array<{
        type: string
        confirm?: boolean
        disabled?: boolean
        buttonProps: { loading: boolean }
        onClick: (context: { selectedRows: typeof selectedRows }) => Promise<void>
      }>
    }
  }
  const action = table.headerActions.value.find((item) => item.type === 'delete')
  assert.ok(action)
  assert.equal(action.confirm, false)
  const result = action.onClick({ selectedRows })
  assert.equal(result, pending)
  busy.value = true
  assert.equal(table.headerActions.value[1].buttonProps.loading, true)
  assert.equal(table.headerActions.value[1].disabled, true)
  finish()
  await result
})
