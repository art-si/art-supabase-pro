import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { buildOrIlikeFilter } from '../../src/utils/supabase/search'

test('OR search keeps each keyword inside a quoted PostgREST value', () => {
  assert.equal(
    buildOrIlikeFilter(['code', 'name'], '甲,乙(一):二.三'),
    'code.ilike."%甲,乙(一):二.三%",name.ilike."%甲,乙(一):二.三%"'
  )
  assert.equal(buildOrIlikeFilter(['name'], '运单_%*'), 'name.ilike."%运单_%*%"')
})

test('OR search escapes quotes and backslashes without deleting punctuation', () => {
  assert.equal(buildOrIlikeFilter(['name'], 'a"b\\c'), 'name.ilike."%a\\"b\\\\c%"')
  assert.equal(buildOrIlikeFilter(['name'], 'a\nb\tc'), 'name.ilike."%a\nb\tc%"')
})

test('column names are application configuration, not arbitrary filter syntax', () => {
  for (const columns of [[], ['name,tenant_id'], ['name.ilike'], ['name)'], ['']]) {
    assert.throws(() => buildOrIlikeFilter(columns, '测试'), /搜索字段配置不正确/)
  }
})

test('SDK encodes the quoted filter once and retains separate tenant constraints', async () => {
  let requestedUrl = ''
  const client = createClient('https://example.supabase.co', 'test-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        requestedUrl = String(input)
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    }
  })
  const keyword = '"),tenant_id.not.is.null,(name.ilike."'
  const filter = buildOrIlikeFilter(['code', 'name'], keyword)
  const { error } = await client.from('records').select('id').eq('tenant_id', 'tenant-a').or(filter)
  assert.equal(error, null)
  const url = new URL(requestedUrl)
  assert.equal(url.searchParams.get('or'), `(${filter})`)
  assert.equal(url.searchParams.get('tenant_id'), 'eq.tenant-a')
  assert.equal(url.searchParams.size, 3)
})
