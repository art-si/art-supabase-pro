import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareAntiViolationStandardImport } from '../../modules/art-supabase-smis/src/views/safety-production/anti-violation-management/anti-violation-standard-library/anti-violation-standard-import'
import type { SmisViolationCategory } from '../../modules/art-supabase-smis/src/api/index'

const category = (
  id: string,
  categoryCode: string,
  status: SmisViolationCategory['status'] = 'enabled'
): SmisViolationCategory => ({
  id,
  tenantId: 'tenant-test',
  categoryCode,
  categoryName: categoryCode,
  sort: 0,
  status,
  childCount: 0,
  standardCount: 0
})

test('anti-violation imports resolve 500 rows from a case-insensitive category index', () => {
  const categories = Array.from({ length: 10 }, (_, index) =>
    category(`category-${index}`, `CAT-${index}`)
  )
  const rows = Array.from({ length: 500 }, (_, index) =>
    Object.freeze({
      standardCode: `STD-${index}`,
      standardName: `标准 ${index}`,
      categoryCode: ` cat-${index % 10} `,
      deductionPoints: String(index % 20),
      handlingRequirements: index ? '  复核  ' : '',
      status: index % 2 ? 'disabled' : 'enabled'
    })
  )
  const prepared = prepareAntiViolationStandardImport(rows, categories)
  assert.equal(prepared.length, 500)
  assert.deepEqual(prepared[11], {
    operation: 'import',
    categoryId: 'category-1',
    standardCode: 'STD-11',
    standardName: '标准 11',
    deductionPoints: 11,
    handlingRequirements: '复核',
    legalBasis: null,
    status: 'disabled',
    description: null
  })
  assert.equal(rows[11].handlingRequirements, '  复核  ')
})

test('anti-violation imports validate the complete batch and report the failing row', () => {
  const rows = [
    {
      standardCode: 'VALID',
      standardName: '有效标准',
      categoryCode: 'SAFE',
      deductionPoints: 1
    },
    {
      standardCode: 'INVALID',
      standardName: '坏行',
      categoryCode: 'MISSING',
      deductionPoints: 1
    }
  ]
  assert.throws(
    () => prepareAntiViolationStandardImport(rows, [category('safe', 'SAFE')]),
    /第 2 行缺少/
  )
})

test('anti-violation imports reject coercible and out-of-range point values', () => {
  const base = { standardCode: 'STD', standardName: '标准', categoryCode: 'SAFE' }
  for (const deductionPoints of [true, false, {}, [], '', ' ', -1, 100_000_000, Infinity, NaN]) {
    assert.throws(
      () =>
        prepareAntiViolationStandardImport(
          [{ ...base, deductionPoints }],
          [category('safe', 'SAFE')]
        ),
      /第 1 行缺少/
    )
  }
})

test('anti-violation imports preserve the first enabled category for duplicate normalized codes', () => {
  const prepared = prepareAntiViolationStandardImport(
    [{ standardCode: 'STD', standardName: '标准', categoryCode: 'safe', deductionPoints: 0 }],
    [
      category('disabled', 'SAFE', 'disabled'),
      category('first', ' safe '),
      category('second', 'SAFE')
    ]
  )
  assert.equal(prepared[0].categoryId, 'first')
  assert.equal(prepared[0].deductionPoints, 0)
})

test('anti-violation imports read each category code once before resolving all rows', () => {
  let categoryCodeReads = 0
  const categories = Array.from({ length: 2000 }, (_, index) => {
    const item = category(`category-${index}`, `CAT-${index}`)
    return {
      ...item,
      get categoryCode() {
        categoryCodeReads++
        return item.categoryCode
      }
    }
  })
  const rows = Array.from({ length: 500 }, (_, index) => ({
    standardCode: `STD-${index}`,
    standardName: `标准 ${index}`,
    categoryCode: 'CAT-1999',
    deductionPoints: 1
  }))
  const prepared = prepareAntiViolationStandardImport(rows, categories)
  assert.equal(prepared.length, 500)
  assert.equal(categoryCodeReads, 2000)
})
