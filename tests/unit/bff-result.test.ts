import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeBffGatewayResult, BffResultContractError } from '../../src/utils/http/bff-result'
import type { BffPublishedApi } from '../../src/types/platform/bff'

const api: BffPublishedApi = {
  interfaceId: 'fixture',
  code: 'orders',
  name: '订单',
  method: 'GET',
  path: '/orders',
  environment: 'development',
  version: 1,
  applicationCode: 'demo',
  applicationName: '演示应用',
  inputs: [],
  resultKind: 'scalar',
  outputs: [{ key: 'orderId', label: '订单编号', type: 'string' }]
}

const envelope = (data: unknown) => ({
  code: 200,
  msg: 'OK',
  requestId: '6d7243e2-5ac4-4a1e-a91c-92140b06ff51',
  version: 1,
  data
})

test('scalar invocation returns only declared scalar values', () => {
  assert.deepEqual(decodeBffGatewayResult(api, envelope({ orderId: 'A-1' })).data, {
    orderId: 'A-1'
  })
  for (const data of [
    { orderId: 'A-1', credential: 'hidden' },
    { orderId: { nested: true } },
    { orderId: 4 },
    { orderId: '文'.repeat(30_000) }
  ]) {
    assert.throws(
      () => decodeBffGatewayResult(api, envelope(data)),
      (error: unknown) =>
        error instanceof BffResultContractError && !JSON.stringify(error).includes('hidden')
    )
  }
})

test('paged direct invocation applies the same output whitelist and bounds', () => {
  const pageApi: BffPublishedApi = { ...api, resultKind: 'page' }
  assert.deepEqual(
    decodeBffGatewayResult(
      pageApi,
      envelope({ records: [{ orderId: 'A-1' }], total: 1, current: 1, size: 20 })
    ).data,
    { records: [{ orderId: 'A-1' }], total: 1, current: 1, size: 20 }
  )
  for (const data of [
    { records: [{ orderId: 'A-1', token: 'hidden' }], total: 1, current: 1, size: 20 },
    { records: [], total: 0, current: 1, size: 101 },
    { records: [], total: 0, current: 1, size: 20, rawBody: 'hidden' }
  ]) {
    assert.throws(() => decodeBffGatewayResult(pageApi, envelope(data)), BffResultContractError)
  }
})
