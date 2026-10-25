import assert from 'node:assert/strict'
import test from 'node:test'
import {
  keysToCamelDeep,
  keysToCamelShallow,
  keysToSnakeDeep
} from '../../src/utils/supabase/key-transform'
import { isPlainObjectRecord } from '../../src/utils/type-guards'

test('deep key conversion preserves values, arrays and non-record objects', () => {
  const date = new Date('2026-10-03T00:00:00Z')
  const input = { tenant_id: 'own_tenant', rows: [{ item_code: 'item_code', count_1: 3 }], date }
  assert.deepEqual(keysToCamelDeep(input), {
    tenantId: 'own_tenant',
    rows: [{ itemCode: 'item_code', count1: 3 }],
    date
  })
  assert.equal(keysToCamelDeep(date), date)
  assert.equal(keysToCamelDeep(null), null)
  assert.deepEqual(input.rows, [{ item_code: 'item_code', count_1: 3 }])
  assert.deepEqual(
    keysToSnakeDeep({ tenantId: 'own_tenant', APIUrl: 'kept', rows: [{ itemCode: 2 }] }),
    {
      tenant_id: 'own_tenant',
      a_p_i_url: 'kept',
      rows: [{ item_code: 2 }]
    }
  )
})

test('shallow conversion leaves nested keys and array identity unchanged', () => {
  const nested = { child_id: 1 }
  const input = { parent_id: 2, child_record: nested }
  assert.deepEqual(keysToCamelShallow(input), { parentId: 2, childRecord: nested })
  const array = [input]
  assert.equal(keysToCamelShallow(array), array)
})

test('plain JSON records with special keys do not modify object prototypes', () => {
  const input: unknown = JSON.parse(
    '{"__proto__":{"is_admin":true},"constructor":"business value","tenant_id":"own"}'
  )
  const output = keysToCamelDeep<Record<string, unknown>>(input)
  assert.equal(output.constructor, 'business value')
  assert.equal(output.tenantId, 'own')
  assert.deepEqual(output._Proto__, { isAdmin: true })
  assert.equal(Object.getPrototypeOf(output), Object.prototype)
  assert.equal(Object.hasOwn(Object.prototype, 'isAdmin'), false)
  const nullPrototype = Object.setPrototypeOf({ tenant_id: 'own' }, null)
  assert.equal(isPlainObjectRecord(nullPrototype), true)
  assert.deepEqual(keysToCamelDeep(nullPrototype), { tenantId: 'own' })
  assert.equal(isPlainObjectRecord(new Date()), false)
})
