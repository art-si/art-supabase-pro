import assert from 'node:assert/strict'
import test from 'node:test'
import {
  matchAssistantDestinations,
  parseAssistantFilters
} from '../../src/utils/assistant-navigation'

const menus = [
  { title: '列配置', path: '/system/column-config' },
  { title: '采购入库单', path: '/wms/purchase' }
]
test('navigation resolves only authorized menu inventory, preferring exact matches', () => {
  assert.deepEqual(matchAssistantDestinations('打开列配置', menus), [menus[0]])
  assert.deepEqual(matchAssistantDestinations('请帮我打开采购', menus), [menus[1]])
  assert.deepEqual(matchAssistantDestinations('打开https://example.com', menus), [])
  assert.deepEqual(matchAssistantDestinations('打开隐藏页面', menus), [])
  assert.equal(matchAssistantDestinations('统计本月订单', menus), null)
})
test('explicit filter syntax preserves values and rejects malformed commands', () => {
  assert.deepEqual(parseAssistantFilters('筛选：项目=演示，物料编码=A001'), {
    项目: '演示',
    物料编码: 'A001'
  })
  assert.equal(parseAssistantFilters('筛选：项目'), null)
  assert.equal(parseAssistantFilters('筛选：项目='), null)
  assert.equal(parseAssistantFilters('分析项目'), null)
})
