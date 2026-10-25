import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWarehouseBinCode } from '../../modules/art-supabase-mdm/src/domain/warehouse-bin-code'

test('库位坐标按层、列组合，列递增后进入下一层', () => {
  const codes = [1, 2].flatMap((level) =>
    [1, 2, 3, 4].map((column) => formatWarehouseBinCode(' a1 ', level, column, '-'))
  )
  assert.deepEqual(codes, [
    'A1-01-01',
    'A1-01-02',
    'A1-01-03',
    'A1-01-04',
    'A1-02-01',
    'A1-02-02',
    'A1-02-03',
    'A1-02-04'
  ])
})

test('分隔符可为空或下划线，两位层列不额外补零', () => {
  assert.equal(formatWarehouseBinCode('A1', 1, 1, ''), 'A10101')
  assert.equal(formatWarehouseBinCode('A1', 20, 30, '_'), 'A1_20_30')
})
