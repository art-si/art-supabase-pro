import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createImportReferenceLookup,
  requireUniqueImportReference
} from '../../src/utils/business/import-reference'

test('import references retain the complete single record', () => {
  const record = { id: 'employee-test', employeeNo: 'EMP-001', tenantId: 'tenant-test' }
  assert.equal(requireUniqueImportReference([record], '员工工号：EMP-001'), record)
})
test('missing or incomplete import references block business writes', () => {
  for (const records of [[], [{ id: '' }], [{}]])
    assert.throws(
      () => requireUniqueImportReference(records, '员工工号：EMP-001'),
      /未找到员工工号：EMP-001/
    )
})
test('ambiguous import identifiers never silently select the first record', () => {
  assert.throws(
    () => requireUniqueImportReference([{ id: 'one' }, { id: 'two' }], '启用仓库编码：WH-001'),
    /存在多个匹配记录/
  )
})

test('a batch lookup deduplicates concurrent codes while returning the complete selected record', async () => {
  let calls = 0
  const record = { id: 'one', code: 'A', tenantId: 'tenant-a', label: '完整引用' }
  const lookup = createImportReferenceLookup(async () => {
    calls++
    return [record]
  })
  const [first, second] = await Promise.all([lookup('A', '第 2 行'), lookup('A', '第 3 行')])
  assert.equal(calls, 1)
  assert.equal(first, record)
  assert.equal(second, record)
})

test('lookup keys retain case and each batch owns its tenant-bound references', async () => {
  let calls = 0
  const lookup = createImportReferenceLookup(async (code) => {
    calls++
    return [{ id: code }]
  })
  assert.equal((await lookup('A', 'A')).id, 'A')
  assert.equal((await lookup('a', 'a')).id, 'a')
  assert.equal(calls, 2)
  const other = createImportReferenceLookup(async () => [{ id: 'tenant-b:A' }])
  assert.equal((await other('A', 'A')).id, 'tenant-b:A')
})

test('invalid references are rejected and a fresh retry batch reads again', async () => {
  let calls = 0
  const resolve = async () => {
    calls++
    return calls === 1 ? [{ id: '' }] : [{ id: 'recovered' }]
  }
  const first = createImportReferenceLookup(resolve)
  await assert.rejects(first('A', '物料 A'), /未找到物料 A/)
  await assert.rejects(first('A', '物料 A'), /未找到物料 A/)
  assert.equal(calls, 1)
  const retry = createImportReferenceLookup(resolve)
  assert.equal((await retry('A', '物料 A')).id, 'recovered')
  assert.equal(calls, 2)
})

test('a lookup preserves provider failures for the owning workflow', async () => {
  const error = new Error('reference read denied')
  const lookup = createImportReferenceLookup(async (): Promise<{ id: string }[]> => {
    throw error
  })
  await assert.rejects(lookup('A', '物料 A'), (failure) => failure === error)
})
