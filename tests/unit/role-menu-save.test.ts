import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { uniq } from 'lodash-es'
import ts from 'typescript'

const source = ts.createSourceFile(
  'system-manage.ts',
  readFileSync(new URL('../../src/api/system-manage.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const declaration = source.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'saveRoleMenuList'
)
assert.ok(declaration)
const { outputText } = ts.transpileModule(
  `${declaration.getText().replace(/^export /, '')}; saveRoleMenuList`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
)

test('role menu save sends the opening snapshot only to the scoped Supabase backend', async () => {
  const requests: unknown[] = []
  for (const cloudbase of [false, true]) {
    const save = runInNewContext(outputText, {
      uniq,
      __CLOUDBASE_BUILD__: cloudbase,
      supabase: {
        rpc: (name: string, payload: unknown) => {
          assert.equal(name, 'set_role_menus')
          requests.push(structuredClone(payload))
        }
      },
      responseHandle: (request: () => unknown) => request()
    }) as typeof import('../../src/api/system-manage').saveRoleMenuList
    await save({
      p_role_id: 'role',
      p_menu_ids: ['requested', 'requested'],
      expectedMenuIds: [],
      revision: 1,
      menuRevision: 2,
      roleVersion: 3
    })
    await save({ p_role_id: 'role', p_menu_ids: ['requested'] })
  }
  const legacy = { p_role_id: 'role', p_menu_ids: ['requested'] }
  assert.deepEqual(requests, [{ ...legacy, p_expected_menu_ids: [] }, legacy, legacy, legacy])
})
