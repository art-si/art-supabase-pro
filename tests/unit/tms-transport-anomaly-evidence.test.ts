import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTransportAnomalyEvidence } from '../../modules/art-supabase-tms/src/views/in-transit-monitor/modules/transport-anomaly-evidence'

test('transport anomaly evidence translates order, dispatch and waybill states', () => {
  assert.equal(
    formatTransportAnomalyEvidence('当前订单状态：pending_order'),
    '当前订单状态：待发车'
  )
  assert.equal(formatTransportAnomalyEvidence('订单状态：pending_load'), '订单状态：待配载')
  assert.equal(formatTransportAnomalyEvidence('配载状态：pending'), '配载状态：待配载')
  assert.equal(formatTransportAnomalyEvidence('配载状态：partial'), '配载状态：部分调度')
  assert.equal(formatTransportAnomalyEvidence('运单状态：in_transit'), '运单状态：运输中')
  assert.equal(formatTransportAnomalyEvidence('订单状态：signed'), '订单状态：待结案')
  assert.equal(formatTransportAnomalyEvidence('运单状态：signed'), '运单状态：已签收')
  assert.equal(formatTransportAnomalyEvidence('运单状态：legacy_state'), '运单状态：待核对')
  assert.equal(formatTransportAnomalyEvidence('运单状态：constructor'), '运单状态：待核对')
  assert.equal(formatTransportAnomalyEvidence('计划发车：未设置'), '计划发车：未设置')
})
