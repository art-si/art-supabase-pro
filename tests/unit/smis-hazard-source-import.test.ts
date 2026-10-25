import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareHazardSourceImport } from '../../modules/art-supabase-smis/src/views/safety-production/emergency-rescue/hazard-source-ledger/hazard-source-import'

const resolveDict = (code: string, input: unknown): string => {
  const value = String(input ?? '').trim()
  if (code === 'smisHazardSourceLevel' && value === '三级') return 'level_3'
  if (code === 'smisHazardSourceRiskLevel' && value === '一般风险') return 'general'
  return ''
}
const sites = [
  { id: 'site-first', name: '一号场所' },
  { id: 'site-second', name: '一号场所' }
]
const organizations = [{ id: 'org-one', name: '安全部' }]

test('hazard source import validates a complete batch and preserves first reference matching', () => {
  const prepared = prepareHazardSourceImport(
    [
      {
        hazardName: ' 储罐区 ',
        siteName: '一号场所',
        controlOrganizationName: '安全部',
        hazardLevel: '三级',
        riskLevel: '一般风险',
        responsibleEmployeeNo: ' E001 ',
        quantity: '2'
      }
    ],
    sites,
    organizations,
    resolveDict
  )
  assert.equal(prepared[0]?.fileRow, 2)
  assert.equal(prepared[0]?.responsibleEmployeeNo, 'E001')
  assert.equal(prepared[0]?.payload.siteId, 'site-first')
  assert.equal(prepared[0]?.payload.quantity, 2)
  assert.equal(prepared[0]?.payload.hazardName, '储罐区')
})

for (const quantity of [true, false, {}, [], 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`hazard source import rejects invalid quantity ${String(quantity)}`, () => {
    assert.throws(
      () =>
        prepareHazardSourceImport(
          [
            {
              hazardName: '储罐区',
              siteName: '一号场所',
              controlOrganizationName: '安全部',
              hazardLevel: '三级',
              riskLevel: '一般风险',
              quantity
            }
          ],
          sites,
          organizations,
          resolveDict
        ),
      /第 2 行数量必须为大于0的数字/
    )
  })
}

test('hazard source import rejects a malformed later row before employee reads or writes', () => {
  assert.throws(
    () =>
      prepareHazardSourceImport(
        [
          {
            hazardName: '有效',
            siteName: '一号场所',
            controlOrganizationName: '安全部',
            hazardLevel: '三级',
            riskLevel: '一般风险'
          },
          {
            hazardName: '',
            siteName: '一号场所',
            controlOrganizationName: '安全部',
            hazardLevel: '三级',
            riskLevel: '一般风险'
          }
        ],
        sites,
        organizations,
        resolveDict
      ),
    /第 3 行缺少危险源名称/
  )
})
