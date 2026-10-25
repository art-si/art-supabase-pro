import assert from 'node:assert/strict'
import test from 'node:test'
import {
  actionIdentity,
  commandIcon,
  isRangeAction
} from '../../src/components/core/tables/art-table-query/row-action-context'

test('range commands never become single-record menu entries', () => {
  for (const label of ['导出当前范围', '批量导出', '导入明细', '批量处理待办']) {
    assert.equal(isRangeAction('custom', label), true)
  }
  for (const label of ['批量打印', '批量复制', '下推采购入库单', '撤回', '删除']) {
    assert.equal(isRangeAction('custom', label), false)
  }
})

test('existing single-record actions suppress corresponding inherited duplicates', () => {
  for (const [single, bulk] of [
    ['删除单据', '批量删除'],
    ['复制单据', '批量复制'],
    ['审核通过', '批量审核']
  ]) {
    assert.equal(
      actionIdentity({ key: 'existing', label: single }),
      actionIdentity({ key: 'generated', label: bulk })
    )
  }
})

test('different business commands receive matching and distinguishable semantic icons', () => {
  assert.equal(commandIcon('withdraw', '撤回'), 'ri:arrow-go-back-line')
  assert.equal(commandIcon('approve', '审核通过'), 'ri:checkbox-circle-line')
  assert.equal(commandIcon('delete', '删除'), 'ri:delete-bin-line')
  assert.equal(commandIcon('custom', '下推采购入库单'), 'ri:inbox-archive-line')
  assert.equal(commandIcon('custom', '下推财务应付单'), 'ri:money-dollar-circle-line')
  assert.equal(commandIcon('custom', '下推暂估应付单'), 'ri:bill-line')
  assert.equal(commandIcon('other-return', '其他出库退回'), 'ri:arrow-go-back-line')
  assert.equal(commandIcon('asset', '采购转固'), 'ri:building-2-line')
  assert.equal(commandIcon('ordinary', '普通发票'), 'ri:bill-line')
  assert.equal(commandIcon('special', '专用发票'), 'ri:file-paper-2-line')
  assert.equal(commandIcon('push-asset', '下推采购转固'), 'ri:building-2-line')
  assert.equal(commandIcon('custom', '未识别的业务操作'), undefined)
})
