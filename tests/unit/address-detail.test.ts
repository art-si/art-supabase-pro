import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveAddressPickerRegionPath,
  stripRegionPrefix
} from '../../src/components/core/forms/art-address-picker/address'

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

test('legacy municipality display resolves only unambiguous paths without rewriting the stored path', () => {
  const options = [
    { name: '上海市', children: [{ name: '市辖区', children: [{ name: '黄浦区' }] }] },
    { name: '重庆市', children: [{ name: '县', children: [{ name: '奉节县' }] }] },
    {
      name: '北京市',
      children: [
        { name: '北京市', children: [{ name: '东城区' }] },
        { name: '市辖区', children: [{ name: '东城区' }] }
      ]
    },
    {
      name: '天津市',
      children: [
        { name: '市辖区', children: [{ name: '待确认地区' }] },
        { name: '县', children: [{ name: '待确认地区' }] }
      ]
    }
  ]
  const saved = ['上海市', '上海市', '黄浦区']
  assert.deepEqual(resolveAddressPickerRegionPath(saved, options), ['上海市', '市辖区', '黄浦区'])
  assert.deepEqual(saved, ['上海市', '上海市', '黄浦区'])
  assert.deepEqual(resolveAddressPickerRegionPath(['重庆市', '重庆市', '奉节县'], options), [
    '重庆市',
    '县',
    '奉节县'
  ])

  for (const path of [
    ['北京市', '北京市', '东城区'],
    ['天津市', '天津市', '待确认地区'],
    ['上海市', '上海市', '陌生区县'],
    ['上海市', '市辖区', '黄浦区'],
    ['广东省', '深圳市', '南山区']
  ]) {
    assert.equal(resolveAddressPickerRegionPath(path, options), path)
  }
})
