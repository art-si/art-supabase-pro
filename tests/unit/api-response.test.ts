import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApiResponseError,
  decodeFunctionResponse,
  decodeResponseEnvelope
} from '../../src/utils/http/response'
import { getFriendlySupabaseErrorMessage } from '../../src/utils/supabase/error'
import { signInWithCloudBaseMigration } from '../../src/api/providers/cloudbase/login'

test('Java contracts explicitly select success code and fields without losing pagination', () => {
  const page = { rows: [{ id: 'one' }], total: 31 }
  assert.deepEqual(decodeResponseEnvelope({ code: 200, msg: '成功', data: page }).data, page)
  const zeroContract = {
    codeField: 'status',
    messageField: 'message',
    dataField: 'result',
    successCodes: [0]
  }
  assert.deepEqual(
    decodeResponseEnvelope({ status: 0, message: '成功', result: page }, zeroContract).data,
    page
  )
  assert.throws(() => decodeResponseEnvelope({ code: 0, data: page }), ApiResponseError)
  assert.throws(
    () => decodeResponseEnvelope({ status: '0', result: page }, zeroContract),
    ApiResponseError
  )
})

test('HTTP 200 business failures and malformed envelopes fail closed', () => {
  assert.throws(
    () => decodeResponseEnvelope({ code: 409, msg: '单据已被修改', data: null }),
    (error: unknown) => {
      assert.ok(error instanceof ApiResponseError)
      assert.equal(error.code, 409)
      assert.equal(getFriendlySupabaseErrorMessage(error), '单据已被修改')
      return true
    }
  )
  for (const payload of [null, [], '<html>gateway error</html>', { data: [] }]) {
    assert.throws(() => decodeResponseEnvelope(payload), /服务返回格式异常/)
  }
})

test('CloudBase non-2xx functions preserve structured auth errors and response context', async () => {
  const payload = {
    code: 'PASSWORD_NOT_SET',
    error_code: 4029,
    error_description: '账号密码未设置',
    requestId: 'test-request'
  }
  const response = Response.json(payload, { status: 400 })
  const result = await decodeFunctionResponse(response)
  assert.equal(result.data, null)
  assert.ok(result.error)
  assert.equal(result.error.status, 400)
  assert.deepEqual(result.error.data, payload)
  assert.equal(result.error.context, response)
  assert.equal(
    getFriendlySupabaseErrorMessage(result.error),
    '账号尚未设置登录密码，请联系管理员设置后重试'
  )
  assert.deepEqual(await response.json(), payload)
})

test('function responses retain domain fields, accept 204, reject invalid JSON', async () => {
  const domain = { code: 'A-01', data: { id: 1 }, total: 4 }
  assert.deepEqual(await decodeFunctionResponse(Response.json(domain)), {
    data: domain,
    error: null
  })
  assert.deepEqual(await decodeFunctionResponse(new Response(null, { status: 204 })), {
    data: null,
    error: null
  })
  for (const status of [200, 502]) {
    const result = await decodeFunctionResponse(
      new Response('<html>bad gateway</html>', { status })
    )
    assert.equal(result.data, null)
    assert.ok(result.error)
    assert.equal(result.error.status, status)
    assert.equal(getFriendlySupabaseErrorMessage(result.error).includes('<html>'), false)
  }
})

test('migration failure retains primary CloudBase reason and migration diagnostics', async () => {
  const original = { code: 'PASSWORD_NOT_SET', error_description: '账号密码未设置' }
  const networkError = new TypeError('Failed to fetch')
  await assert.rejects(
    signInWithCloudBaseMigration(
      async () => ({ data: null, error: original }),
      async () => {
        throw networkError
      }
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(
        getFriendlySupabaseErrorMessage(error),
        '账号尚未设置登录密码，请联系管理员设置后重试'
      )
      assert.deepEqual(error.cause, { error: original, cause: networkError })
      return true
    }
  )
})

test('migration never retries rate limits, captcha, bans, or unknown failures', async () => {
  for (const code of ['OVER_REQUEST_RATE_LIMIT', 'captcha_failed', 'user_banned', 'unknown']) {
    const result = { data: null, error: { code } }
    assert.equal(
      await signInWithCloudBaseMigration(
        async () => result,
        async () => {
          assert.fail('must not invoke migration')
        }
      ),
      result
    )
  }
})

test('successful migration signs in exactly once more; rejected migration never retries', async () => {
  let calls = 0
  const signedIn = { data: { session: 'test-session' }, error: null }
  assert.equal(
    await signInWithCloudBaseMigration(
      async () => {
        calls++
        return calls === 1
          ? { data: null, error: { code: 'INVALID_USERNAME_OR_PASSWORD' } }
          : signedIn
      },
      async () => ({ data: { ok: true }, error: null })
    ),
    signedIn
  )
  assert.equal(calls, 2)
  await assert.rejects(
    signInWithCloudBaseMigration(
      async () => ({ data: null, error: { code: 'INVALID_USERNAME_OR_PASSWORD' } }),
      async () => ({ data: { ok: false, message: 'migration rejected' }, error: null })
    ),
    /账号或密码错误/
  )
})

test('CloudBase and Supabase auth codes share safe messages without changing SQLSTATE handling', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: 'PASSWORD_POLICY_REJECTED' }),
    '密码不符合安全要求，请重新设置后登录'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: 'invalid_credentials' }),
    '邮箱或密码错误，请重新输入'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '42501', message: 'permission denied' }),
    '当前账号没有此操作权限'
  )
})
