import assert from 'node:assert/strict'
import test from 'node:test'
import { stripRegionPrefix } from '../../src/components/core/forms/art-address-picker/address'

test('map and selector addresses strip only their longest matching region prefix', () => {
  const path = ['广东省', '深圳市', '南山区'] as const
  assert.equal(stripRegionPrefix(' 广东省深圳市南山区 科技路 1 号 ', path), '科技路 1 号')
  assert.equal(stripRegionPrefix('广东省深圳市 科技路 1 号', path), '科技路 1 号')
  assert.equal(stripRegionPrefix('广东省 科技路 1 号', path), '科技路 1 号')
  assert.equal(stripRegionPrefix('科技路广东省分店', path), '科技路广东省分店')
  assert.equal(stripRegionPrefix('浙江省杭州市 科技路', path), '浙江省杭州市 科技路')
  assert.equal(stripRegionPrefix('广东省深圳市南山区', path), '')
  assert.equal(stripRegionPrefix(' 地址 ', []), '地址')
  assert.equal(stripRegionPrefix('   ', path), '')
  assert.equal(stripRegionPrefix('广东省深圳市南山区科技路', ['', ...path, '']), '科技路')
  assert.deepEqual(path, ['广东省', '深圳市', '南山区'])
})
