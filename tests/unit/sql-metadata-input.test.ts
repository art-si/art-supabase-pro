import assert from 'node:assert/strict'
import test from 'node:test'
import { metadataRpcInput } from '../../supabase/functions/execute-sql-with-columns/metadata-input'

test('metadata input keeps old full calls and validates scoped modes without SQL interpolation', () => {
  assert.equal(metadataRpcInput({ action: 'metadata' }), null)
  assert.deepEqual(metadataRpcInput({ mode: 'catalog' }), {
    p_mode: 'catalog',
    p_tables: [],
    p_schema: null,
    p_keyword: null
  })
  const target = { schema: 'odd"schema', name: "table'; SELECT secret --" }
  assert.deepEqual(metadataRpcInput({ mode: 'tables', tables: [target] }), {
    p_mode: 'tables',
    p_tables: [target],
    p_schema: null,
    p_keyword: null
  })
  assert.deepEqual(metadataRpcInput({ mode: 'functions', schema: 'public' }), {
    p_mode: 'functions',
    p_tables: [],
    p_schema: 'public',
    p_keyword: null
  })
  assert.equal(metadataRpcInput({ mode: 'search', keyword: '  查询字段  ' })?.p_keyword, '查询字段')
})
test('scoped metadata rejects unbounded and malformed requests', () => {
  for (const value of [
    { mode: 'invalid' },
    { mode: { toString: 'invalid' } },
    { mode: 'tables', tables: [] },
    { mode: 'tables', tables: Array.from({ length: 33 }, () => ({ schema: 'public', name: 't' })) },
    { mode: 'tables', tables: [{ schema: 'public', name: 'bad\nname' }] },
    { mode: 'functions' },
    { mode: 'search', keyword: ' ' },
    { mode: 'search', keyword: 'x'.repeat(121) }
  ])
    assert.throws(() => metadataRpcInput(value))
})
