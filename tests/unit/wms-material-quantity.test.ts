import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  convertWmsMaterialQuantity,
  getWmsMaterialUnitFactor,
  scaleWmsMaterialBaseQuantity
} from '../../src/utils/wms/material-quantity'

const material = {
  baseUnitId: 'piece',
  unitConversions: [
    { sourceUnitId: 'box', sourceFactor: 1, baseFactor: 12 },
    { sourceUnitId: 'case', sourceFactor: 1, baseFactor: 60 }
  ]
}

test('单位因子保留有效换算，拒绝非有限、非正数和无法表示的比例', () => {
  assert.equal(getWmsMaterialUnitFactor(material, 'piece'), 1)
  assert.equal(getWmsMaterialUnitFactor(material, 'box'), 12)
  assert.equal(
    getWmsMaterialUnitFactor(
      {
        baseUnitId: 'piece',
        unitConversions: [{ sourceUnitId: 'box', sourceFactor: 0.2, baseFactor: 0.3 }]
      },
      'box'
    ),
    1.5
  )
  assert.equal(getWmsMaterialUnitFactor(undefined, 'box'), null)
  assert.equal(getWmsMaterialUnitFactor(material, ''), null)
  assert.equal(getWmsMaterialUnitFactor(material, 'missing'), null)
  for (const [sourceFactor, baseFactor] of [
    [0, 1],
    [-1, 1],
    [NaN, 1],
    [Infinity, 1],
    [1, 0],
    [1, -1],
    [1, NaN],
    [1, Infinity],
    [Number.MIN_VALUE, Number.MAX_VALUE],
    [Number.MAX_VALUE, Number.MIN_VALUE]
  ]) {
    assert.equal(
      getWmsMaterialUnitFactor(
        {
          baseUnitId: 'piece',
          unitConversions: [{ sourceUnitId: 'box', sourceFactor, baseFactor }]
        },
        'box'
      ),
      null
    )
  }
})

test('库存单位、基本单位与辅助单位按同一物料换算关系计算', () => {
  assert.equal(convertWmsMaterialQuantity(material, 2, 'box', 'piece'), 24)
  assert.equal(convertWmsMaterialQuantity(material, 24, 'piece', 'case'), 0.4)
  assert.equal(convertWmsMaterialQuantity(material, 2, 'box', 'case'), 0.4)
})

test('缺失或无效的换算关系阻止错误数量', () => {
  assert.equal(convertWmsMaterialQuantity(material, 2, 'unknown', 'piece'), null)
  assert.equal(convertWmsMaterialQuantity(material, -1, 'box', 'piece'), null)
  assert.equal(convertWmsMaterialQuantity({ baseUnitId: 'piece' }, 1, 'box', 'piece'), null)
})

test('小数换算系数按数据库六位小数舍入，不把半微量丢失', () => {
  const decimalMaterial = {
    baseUnitId: 'piece',
    unitConversions: [
      { sourceUnitId: 'box', sourceFactor: 0.2, baseFactor: 0.3 },
      { sourceUnitId: 'case', sourceFactor: 0.4, baseFactor: 0.8 }
    ]
  }
  assert.equal(convertWmsMaterialQuantity(decimalMaterial, 0.000001, 'box', 'piece'), 0.000002)
  assert.equal(convertWmsMaterialQuantity(decimalMaterial, 0.000002, 'box', 'case'), 0.000002)
  assert.equal(convertWmsMaterialQuantity(decimalMaterial, 1000000, 'box', 'case'), 750000)
})

test('非有限换算系数返回不可换算，不抛出数值库异常', () => {
  assert.equal(
    convertWmsMaterialQuantity(
      {
        baseUnitId: 'piece',
        unitConversions: [{ sourceUnitId: 'box', sourceFactor: 1, baseFactor: Infinity }]
      },
      1,
      'box',
      'piece'
    ),
    null
  )
})

test('实际基本数量比例缩放同样使用十进制舍入并拒绝无效比例', () => {
  assert.equal(scaleWmsMaterialBaseQuantity(1.000001, 3, 1.5), 0.500001)
  assert.equal(scaleWmsMaterialBaseQuantity(60, 5, 2.5), 30)
  assert.equal(scaleWmsMaterialBaseQuantity(60, 0, 2.5), null)
  assert.equal(scaleWmsMaterialBaseQuantity(Infinity, 5, 2.5), null)
})
