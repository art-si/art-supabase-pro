import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { bffFunctionHttpResponse } from '../../src/utils/http/bff-edge-error'

test('preserves the HTTP status and safe body source from a real Supabase FunctionsHttpError', () => {
  const response = new Response(
    JSON.stringify({ code: 'FORBIDDEN', requestId: crypto.randomUUID() }),
    {
      status: 403
    }
  )
  const error = new FunctionsHttpError(response)
  assert.equal(bffFunctionHttpResponse(error), response)
  assert.equal(bffFunctionHttpResponse(error)?.status, 403)
  assert.equal(bffFunctionHttpResponse(new FunctionsFetchError(new Error('network'))), null)
})
