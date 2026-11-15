import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { RunQueryOptions } from '../../src/hooks/core/useSupabase'
import { keysToSnakeDeep } from '../../src/utils/supabase/key-transform'

const source = ts.createSourceFile(
  'tenant.ts',
  readFileSync(new URL('../../src/api/system-manage/tenant.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const editTenant = source.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'editTenant'
)
assert.ok(editTenant)
const { outputText } = ts.transpileModule(
  `${editTenant.getText().replace(/^export /, '')}; editTenant`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
)

test('tenant edit opts into the affected-row guard for a targeted update', async () => {
  const save = runInNewContext(outputText, {
    keysToSnakeDeep,
    supabase: {
      from: (table: string) => {
        assert.equal(table, 'sys_tenant')
        return {
          update: (payload: unknown, options?: { count: string }) => {
            assert.deepEqual(payload, { tenant_code: 'testing', tenant_name: '测试租户' })
            assert.equal(options?.count, 'exact')
            return {
              eq: (column: string, id: string) => {
                assert.equal(column, 'id')
                assert.equal(id, 'tenant-id')
                return Promise.resolve({ count: 0, data: null, error: null })
              }
            }
          }
        }
      }
    },
    responseHandle: async (applyUpdate: () => Promise<unknown>, options: RunQueryOptions) => {
      assert.equal(options.requireAffected, true)
      assert.equal(options.breakReturn, true)
      assert.equal(options.showMessage, true)
      assert.match(options.noAffectedMessage ?? '', /刷新列表后重试/)
      await applyUpdate()
    }
  }) as typeof import('../../src/api/system-manage/tenant').editTenant

  await save({ id: 'tenant-id', tenantCode: 'testing', tenantName: '测试租户' })
})
