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

test('notes bulk delete calls the platform RPC with distinct IDs and requires the full result', async () => {
  let requests = 0
  const remove = vm.runInNewContext(deleteCode, {
    uniq,
    supabase: {
      rpc: (name: string, params: { p_ids: string[] }) => {
        assert.equal(name, 'delete_platform_notes')
        assert.deepEqual(Array.from(params.p_ids), ['a', 'b'])
        requests++
        return { data: 2, error: null }
      }
    },
    responseHandle: async (request: () => Promise<unknown>, options: Record<string, unknown>) => {
      assert.equal(options.requireAffected, true)
      assert.equal(options.breakReturn, true)
      assert.equal(options.showReferenceFeedback, false)
      return request()
    }
  }) as (ids: string[]) => Promise<number>
  assert.equal(await remove(['a', 'b', 'a', '']), 2)
  assert.equal(requests, 1)
  await assert.rejects(remove([]), /请选择需要删除的笔记/)
  assert.equal(requests, 1)
})

test('notes bulk delete treats a partial result as a failure', async () => {
  const remove = vm.runInNewContext(deleteCode, {
    uniq,
    responseHandle: async () => ({ data: 1 })
  }) as (ids: string[]) => Promise<number>
  await assert.rejects(remove(['a', 'b']), /无法确认所选笔记已删除/)
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
    canAddInScope: { value: true },
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
  assert.equal(table.headerActions.value[1].disabled, true)
  finish()
  await result
})
