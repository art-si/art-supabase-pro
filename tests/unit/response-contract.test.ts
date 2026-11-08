import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeResponseContract,
  ResponseContractError,
  type JsonResponseContract
} from '../../src/utils/http/response-contract'

const business: JsonResponseContract = {
  mode: 'business',
  codePointer: '/code',
  dataPointer: '/data/rows',
  successCodes: [200]
}

test('HTTP and absent contracts preserve the selected JSON data without inferring business status', () => {
  const payload = { code: 500, data: { rows: [{ id: 1 }] } }
  assert.deepEqual(decodeResponseContract(payload), { ok: true, data: payload })
  assert.deepEqual(decodeResponseContract(payload, { ...business, mode: 'http' }), {
    ok: true,
    data: [{ id: 1 }]
  })
})

test('business codes compare exactly and never return a failure envelope', () => {
  assert.deepEqual(decodeResponseContract({ code: 200, data: { rows: [1, 2] } }, business), {
    ok: true,
    data: [1, 2]
  })
  assert.deepEqual(decodeResponseContract({ code: '200', data: { rows: ['private'] } }, business), {
    ok: false,
    data: null
  })
})

test('missing or malformed pointer data raises only a safe typed error', () => {
  for (const [payload, contract] of [
    [{ code: 200 }, business],
    [
      { code: 200, data: { rows: [] } },
      { ...business, dataPointer: '/data/~2' }
    ],
    [
      { code: 200, data: { rows: [] } },
      { ...business, codePointer: '/__proto__/code' }
    ]
  ] as const) {
    assert.throws(
      () => decodeResponseContract(payload, contract),
      (error: unknown) =>
        error instanceof ResponseContractError &&
        error.kind === 'malformed' &&
        !JSON.stringify(error).includes('rows')
    )
  }
})
