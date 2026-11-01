import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

for (const tree of [false, true]) {
  const file = tree
    ? '../../src/views/data-center/dict/modules/type-tree.vue'
    : '../../src/views/data-center/dict/index.vue'
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  assert.ok(descriptor.scriptSetup)
  const source = ts.createSourceFile(
    file,
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  let expression = ''
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'removeDictionaryRows')
      expression = statement
        .getText()
        .replace(/^async function removeDictionaryRows/, 'async function')
    if (tree && ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(
        (item) => item.name.getText() === 'handleDelete'
      )
      if (declaration?.initializer) expression = declaration.initializer.getText()
    }
  }
  assert.ok(expression)
  const javascript = ts.transpileModule(`const remove = ${expression}; remove`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText

  for (const scenario of [
    'unavailable',
    'blocked',
    'check-failed',
    'success',
    'rejected'
  ] as const) {
    test(`${tree ? 'dictionary type' : 'dictionary item'} deletion: ${scenario}`, async () => {
      const events: string[] = []
      const busy = { value: false }
      let checks = 0
      const bindings = {
        deleteBusy: busy,
        deleteGuardRef: {
          value:
            scenario === 'unavailable'
              ? undefined
              : {
                  inspect: async () => {
                    events.push('inspect')
                    checks++
                    if (scenario === 'check-failed') throw new Error('关联读取被拒绝')
                    return scenario === 'blocked' || (scenario === 'rejected' && checks === 2)
                  }
                }
        },
        createTenantScopeReadGuard: () => () => {},
        confirmAction: async () => events.push('confirm'),
        deleteDict: async () => {
          events.push('delete')
          if (scenario === 'rejected') throw new Error('并发引用')
        },
        deleteDictType: async () => {
          events.push('delete')
          if (scenario === 'rejected') throw new Error('并发引用')
        },
        ElMessage: {
          error: () => events.push('error'),
          success: () => events.push('success')
        },
        notifyFriendlyError: () => events.push('error'),
        handleGetDictTypeList: async () => events.push('refresh'),
        tableQueryRef: { value: { refreshRemove: async () => events.push('refresh') } }
      }
      const remove = vm.runInNewContext(javascript, bindings) as (value: unknown) => Promise<void>
      const row = {
        id: 'record',
        label: '字典项',
        name: '字典类型',
        code: 'example',
        nodeType: 'dictionary'
      }
      await remove(tree ? row : [row])
      assert.equal(busy.value, false)
      assert.deepEqual(
        events,
        scenario === 'unavailable'
          ? ['error']
          : scenario === 'blocked'
            ? ['inspect']
            : scenario === 'check-failed'
              ? ['inspect', 'error']
              : scenario === 'success'
                ? ['inspect', 'confirm', 'delete', 'success', 'refresh']
                : ['inspect', 'confirm', 'delete', 'inspect']
      )
    })
  }
}
