import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readIssuanceImportRows,
  resolveIssuanceImportRows,
  type IssuanceImportCodes
} from '../../modules/art-supabase-smis/src/views/safety-production/issuance-import-rows'

const validRow = (index: number) => ({
  employeeNo: ` EMP-${index % 5} `,
  warehouseCode: ' WH-01 ',
  issuerEmployeeNo: ' ISSUER-01 ',
  materialCode: ` MAT-${index % 10} `,
  issueQuantity: String((index % 3) + 1),
  issueDate: '2026-10-23',
  remark: index ? '批量导入' : ''
})

const references = (codes: IssuanceImportCodes) => ({
  employee: {
    id: `employee-${codes.employeeNo}`,
    tenantId: 'tenant-test',
    employeeNo: codes.employeeNo,
    employeeName: codes.employeeNo,
    employmentStatus: 'active'
  },
  issuer: {
    id: `issuer-${codes.issuerEmployeeNo}`,
    tenantId: 'tenant-test',
    employeeNo: codes.issuerEmployeeNo,
    employeeName: codes.issuerEmployeeNo,
    employmentStatus: 'active'
  },
  warehouse: {
    id: 'warehouse-test',
    tenantId: 'tenant-test',
    organizationId: 'organization-test',
    locationCode: codes.warehouseCode,
    locationName: codes.warehouseCode,
    status: 'enabled',
    childCount: 0,
    organization: {
      id: 'organization-test',
      organizationCode: 'ORG-TEST',
      organizationName: '测试组织'
    }
  },
  material: {
    id: `material-${codes.materialCode}`,
    tenantId: 'tenant-test',
    categoryId: 'category-test',
    materialCode: codes.materialCode,
    materialName: codes.materialCode,
    basicUnit: '件',
    materialType: 'tool',
    materialSource: 'purchased',
    imageUrls: [],
    status: 'enabled',
    sort: 0,
    category: {
      id: 'category-test',
      categoryCode: 'CATEGORY',
      categoryName: '测试分类'
    }
  }
})

test('issuance imports validate and normalize 500 rows before resolution', () => {
  const rows = Array.from({ length: 500 }, (_, index) => Object.freeze(validRow(index)))
  const prepared = readIssuanceImportRows(rows, '2026-10-24')
  assert.equal(prepared.length, 500)
  assert.deepEqual(prepared[11], {
    employeeNo: 'EMP-1',
    warehouseCode: 'WH-01',
    issuerEmployeeNo: 'ISSUER-01',
    materialCode: 'MAT-1',
    fileRow: 12,
    issueQuantity: 3,
    issueDate: '2026-10-23',
    remark: '批量导入'
  })
  assert.equal(rows[11].employeeNo, ' EMP-1 ')
})

test('issuance imports reject a malformed later row before reference resolution begins', () => {
  const rows = [validRow(0), { ...validRow(1), issueQuantity: false }]
  assert.throws(() => readIssuanceImportRows(rows), /第 2 行缺少/)
})

test('issuance imports reject coercible quantities and preserve the fallback date contract', () => {
  for (const issueQuantity of [true, false, {}, [], '', ' ', 0, -1, Infinity, NaN]) {
    assert.throws(
      () => readIssuanceImportRows([{ ...validRow(0), issueQuantity }], '2026-10-24'),
      /第 1 行缺少/
    )
  }
  const [prepared] = readIssuanceImportRows(
    [{ ...validRow(0), issueDate: 'invalid' }],
    '2026-10-24'
  )
  assert.equal(prepared.issueDate, '2026-10-24')
})

test('issuance imports resolve the complete batch in source order', async () => {
  const prepared = readIssuanceImportRows([validRow(0), validRow(1), validRow(2)])
  const calls: string[] = []
  const resolved = await resolveIssuanceImportRows(prepared, async (codes) => {
    calls.push(codes.materialCode)
    return references(codes)
  })
  assert.deepEqual(calls, ['MAT-0', 'MAT-1', 'MAT-2'])
  assert.deepEqual(
    resolved.map((row) => row.material.id),
    ['material-MAT-0', 'material-MAT-1', 'material-MAT-2']
  )
})

test('a later reference failure occurs before callers enter their persistence loop', async () => {
  const prepared = readIssuanceImportRows([validRow(0), validRow(1)])
  let calls = 0
  let persisted = 0
  await assert.rejects(async () => {
    const resolved = await resolveIssuanceImportRows(prepared, async (codes) => {
      calls++
      if (calls === 2) throw new Error('引用不存在')
      return references(codes)
    })
    persisted += resolved.length
  }, /引用不存在/)
  assert.equal(calls, 2)
  assert.equal(persisted, 0)
})
