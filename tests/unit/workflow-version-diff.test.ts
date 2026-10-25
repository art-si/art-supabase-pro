import assert from 'node:assert/strict'
import test from 'node:test'
import { diffWorkflowConfigs } from '../../src/views/workflow/modules/workflow-version-diff'

const node = (overrides: Partial<Api.Workflow.WorkflowNode> = {}): Api.Workflow.WorkflowNode => ({
  key: 'finance',
  name: '财务审批',
  order: 1,
  approvalMode: 'all',
  approvalThresholdPercent: 100,
  rejectVetoEnabled: true,
  allowSelfApproval: false,
  dueHours: 24,
  reminderBeforeMinutes: 60,
  escalationEnabled: true,
  escalateAfterHours: 4,
  assignee: { type: 'roles', roleCodes: ['R_FINANCE'] },
  condition: { operator: 'always' },
  ...overrides
})

test('reports node additions and removals', () => {
  const result = diffWorkflowConfigs(
    { nodes: [node()] },
    { nodes: [node({ key: 'manager', name: '经理审批' })] }
  )
  assert.deepEqual(result.map((change) => change.kind).sort(), ['added', 'removed'])
})

test('groups decision, assignee, condition and SLA changes by node', () => {
  const result = diffWorkflowConfigs(
    { nodes: [node()] },
    {
      nodes: [
        node({
          approvalMode: 'percentage',
          approvalThresholdPercent: 67,
          assignee: { type: 'users', userIds: ['user-1'] },
          condition: { field: 'amount', operator: 'gt', value: 10000 },
          dueHours: 12
        })
      ]
    }
  )
  assert.equal(result.length, 1)
  assert.match(result[0].description, /审批人范围/)
  assert.match(result[0].description, /流转条件/)
  assert.match(result[0].description, /会签\/否决/)
  assert.match(result[0].description, /时限/)
})

test('reports fail-closed policy changes', () => {
  const result = diffWorkflowConfigs(
    { nodes: [node()], allowAutoApprove: false },
    { nodes: [node()], allowAutoApprove: true }
  )
  assert.equal(result.at(-1)?.key, 'changed:allowAutoApprove')
})
