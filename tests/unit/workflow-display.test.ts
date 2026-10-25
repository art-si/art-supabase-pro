import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorkflowActionTimelineItems,
  summarizeWorkflowHistory
} from '../../src/utils/workflow-display'

const createInstance = (
  status: Api.Workflow.InstanceStatus
): Api.Workflow.WorkflowInstanceRecord => ({
  id: crypto.randomUUID(),
  definitionId: crypto.randomUUID(),
  versionId: crypto.randomUUID(),
  businessType: 'vehicle_archive',
  businessId: crypto.randomUUID(),
  businessTitle: '测试车辆',
  initiatorUserId: crypto.randomUUID(),
  initiatorNameSnapshot: '发起人',
  status,
  contextSnapshot: {},
  rowVersion: 1,
  startedAt: '2026-08-12T01:00:00Z',
  createTime: '2026-08-12T01:00:00Z'
})

test('workflow history summary groups every lifecycle outcome', () => {
  const summary = summarizeWorkflowHistory([
    createInstance('running'),
    createInstance('approved'),
    createInstance('rejected'),
    createInstance('withdrawn'),
    createInstance('cancelled')
  ])

  assert.deepEqual(summary, {
    total: 5,
    running: 1,
    approved: 1,
    rejected: 1,
    interrupted: 2
  })
})

test('workflow actions are rendered newest first with override audit context', () => {
  const items = createWorkflowActionTimelineItems([
    {
      id: 'submit',
      instanceId: 'instance',
      action: 'submit',
      actorUserId: 'user',
      actorNameSnapshot: '发起人',
      comment: '提交审批',
      metadata: {},
      createTime: '2026-08-12T01:00:00Z'
    },
    {
      id: 'reject',
      instanceId: 'instance',
      action: 'reject',
      actorUserId: 'super',
      actorNameSnapshot: '平台管理员',
      nodeName: '资质审核',
      comment: '证件已过期',
      metadata: {
        operatorType: 'platform_super_override',
        originalAssigneeName: '租户审批员'
      },
      createTime: '2026-08-12T02:00:00Z'
    }
  ])

  assert.equal(items[0].id, 'reject')
  assert.equal(items[0].tone, 'danger')
  assert.match(items[0].description ?? '', /原审批人：租户审批员/)
  assert.match(items[0].description ?? '', /证件已过期/)
})
