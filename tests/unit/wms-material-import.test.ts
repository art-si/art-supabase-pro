import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareWmsMaterialImport } from '../../modules/art-supabase-wms/src/views/shared/material-import'
import type { WmsMaterialOption } from '../../modules/art-supabase-wms/src/api/warehouse.types'

function material(code: string, id = code): WmsMaterialOption {
  return {
    id,
    materialCode: code,
    materialName: `物料 ${code}`,
    specificationModel: null,
    description: null,
    serialManagementEnabled: false
  }
}

test('500 rows resolve each distinct code once and preserve row order and quantities', async () => {
  const calls: string[] = []
  const rows = Array.from({ length: 500 }, (_, index) => ({
    materialCode: `M-${index % 10}`,
    quantity: index + 1,
    batchNo: ` B-${index} `,
    remark: ` R-${index} `
  }))
  const result = await prepareWmsMaterialImport(
    rows,
    async (code) => {
      calls.push(code)
      return { data: [material(code)] }
    },
    () => true
  )
  assert.equal(calls.length, 10)
  assert.equal(result?.length, 500)
  assert.deepEqual(
    result?.map((row) => [row.material.materialCode, row.quantity, row.batchNo, row.remark]),
    rows.map((row, index) => [row.materialCode, row.quantity, `B-${index}`, `R-${index}`])
  )
})

test('a malformed last row rejects before any reference reads', async () => {
  let calls = 0
  await assert.rejects(
    prepareWmsMaterialImport(
      [
        { 物料编码: 'VALID', 数量: 1 },
        { 物料编码: 'INVALID', 数量: 0 }
      ],
      async (code) => {
        calls++
        return { data: [material(code)] }
      },
      () => true
    ),
    /第 3 行/
  )
  assert.equal(calls, 0)
})

test('booleans and coercible objects are not quantities', async () => {
  for (const quantity of [true, false, { valueOf: () => 2 }, [], null, '', Infinity, NaN]) {
    let calls = 0
    await assert.rejects(
      prepareWmsMaterialImport(
        [{ materialCode: 'M', quantity }],
        async (code) => {
          calls++
          return { data: [material(code)] }
        },
        () => true
      ),
      /数量/
    )
    assert.equal(calls, 0)
  }
})

test('an obsolete batch performs no validation or reference reads', async () => {
  let calls = 0
  const result = await prepareWmsMaterialImport(
    [{ materialCode: 'M', quantity: 1 }],
    async (code) => {
      calls++
      return { data: [material(code)] }
    },
    () => false
  )
  assert.equal(result, undefined)
  assert.equal(calls, 0)
})

test('obsolete in-flight success stops the remaining rows', async () => {
  const pending = Promise.withResolvers<{ data: WmsMaterialOption[] }>()
  let current = true
  let calls = 0
  const result = prepareWmsMaterialImport(
    [
      { materialCode: 'A', quantity: 1 },
      { materialCode: 'B', quantity: 2 }
    ],
    async () => {
      calls++
      return pending.promise
    },
    () => current
  )
  assert.equal(calls, 1)
  current = false
  pending.resolve({ data: [material('A')] })
  assert.equal(await result, undefined)
  assert.equal(calls, 1)
})

test('obsolete in-flight failure is discarded', async () => {
  const pending = Promise.withResolvers<{ data: WmsMaterialOption[] }>()
  let current = true
  const result = prepareWmsMaterialImport(
    [{ materialCode: 'A', quantity: 1 }],
    () => pending.promise,
    () => current
  )
  current = false
  pending.reject(new Error('old request failed'))
  assert.equal(await result, undefined)
})

test('missing, ambiguous and incomplete references never create draft rows', async () => {
  for (const data of [
    [],
    [material('OTHER')],
    [material('M'), material('M', 'second')],
    [material('M', '')]
  ]) {
    await assert.rejects(
      prepareWmsMaterialImport(
        [{ materialCode: 'M', quantity: 1 }],
        async () => ({ data }),
        () => true
      ),
      /唯一|多个|未找到/
    )
  }
})

test('each batch resolves references afresh, including a retry after failure', async () => {
  let calls = 0
  const rows = [{ materialCode: 'M', quantity: 1 }]
  const resolve = async (code: string) => {
    calls++
    if (calls === 1) throw new Error('temporary failure')
    return { data: [material(code, `version-${calls}`)] }
  }
  await assert.rejects(
    prepareWmsMaterialImport(rows, resolve, () => true),
    /temporary failure/
  )
  assert.equal(
    (await prepareWmsMaterialImport(rows, resolve, () => true))?.[0].material.id,
    'version-2'
  )
  assert.equal(
    (await prepareWmsMaterialImport(rows, resolve, () => true))?.[0].material.id,
    'version-3'
  )
})

test('batch row limits reject before any lookup', async () => {
  for (const rows of [
    [],
    Array.from({ length: 501 }, () => ({ materialCode: 'M', quantity: 1 }))
  ]) {
    let calls = 0
    await assert.rejects(
      prepareWmsMaterialImport(
        rows,
        async (code) => {
          calls++
          return { data: [material(code)] }
        },
        () => true
      ),
      /1 至 500 行/
    )
    assert.equal(calls, 0)
  }
})

test('a current resolver failure keeps its original error', async () => {
  const error = new Error('current read failed')
  await assert.rejects(
    prepareWmsMaterialImport(
      [{ materialCode: 'M', quantity: 1 }],
      async () => {
        throw error
      },
      () => true
    ),
    (failure) => failure === error
  )
})
