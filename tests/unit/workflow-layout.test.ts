import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WORKFLOW_END_NODE_KEY,
  WORKFLOW_START_NODE_KEY,
  createWorkflowCanvasLayout,
  normalizeWorkflowCanvasLayout,
  updateWorkflowCanvasPosition
} from '../../src/views/workflow/definition/modules/workflow-layout'

function createNode(key: string, order: number): Api.Workflow.WorkflowNode {
  return {
    key,
    name: `审批节点 ${order}`,
    order,
    approvalMode: 'any',
    allowSelfApproval: false,
    dueHours: 24,
    assignee: { type: 'roles', roleCodes: [] },
    condition: { operator: 'always' }
  }
}

const nodes = [createNode('node-a', 1), createNode('node-b', 2)]

test('horizontal workflow layout follows business order without mutating nodes', () => {
  const layout = createWorkflowCanvasLayout(nodes, 'horizontal')

  assert.equal(layout.mode, 'horizontal')
  assert.deepEqual(layout.positions[WORKFLOW_START_NODE_KEY], { x: 36, y: 154 })
  assert.ok(layout.positions['node-a'].x < layout.positions['node-b'].x)
  assert.ok(layout.positions['node-b'].x < layout.positions[WORKFLOW_END_NODE_KEY].x)
  assert.deepEqual(
    nodes.map((node) => node.order),
    [1, 2]
  )
})

test('vertical workflow layout places the ordered nodes from top to bottom', () => {
  const layout = createWorkflowCanvasLayout(nodes, 'vertical')

  assert.equal(layout.mode, 'vertical')
  assert.ok(layout.positions[WORKFLOW_START_NODE_KEY].y < layout.positions['node-a'].y)
  assert.ok(layout.positions['node-a'].y < layout.positions['node-b'].y)
  assert.ok(layout.positions['node-b'].y < layout.positions[WORKFLOW_END_NODE_KEY].y)
})

test('normalization preserves free positions and repairs untrusted layout data', () => {
  const layout = normalizeWorkflowCanvasLayout(
    {
      mode: 'free',
      positions: {
        [WORKFLOW_START_NODE_KEY]: { x: -240, y: 80 },
        'node-a': { x: 12_345.4, y: 678.6 },
        'node-b': { x: Number.NaN, y: 900 },
        orphan: { x: 1, y: 2 }
      }
    },
    nodes
  )

  assert.equal(layout.mode, 'free')
  assert.deepEqual(layout.positions[WORKFLOW_START_NODE_KEY], { x: -240, y: 80 })
  assert.deepEqual(layout.positions['node-a'], { x: 12_345, y: 679 })
  assert.equal(layout.positions['node-b'].x, 518)
  assert.deepEqual(layout.positions[WORKFLOW_END_NODE_KEY], { x: 824, y: 154 })
  assert.equal('orphan' in layout.positions, false)
})

test('dragging updates only the requested position and switches to free layout', () => {
  const original = createWorkflowCanvasLayout(nodes, 'horizontal')
  const updated = updateWorkflowCanvasPosition(original, nodes, 'node-a', { x: 720, y: 360 })

  assert.equal(updated.mode, 'free')
  assert.deepEqual(updated.positions['node-a'], { x: 720, y: 360 })
  assert.deepEqual(updated.positions['node-b'], original.positions['node-b'])
  assert.notEqual(updated.positions, original.positions)
  assert.deepEqual(original.positions['node-a'], { x: 212, y: 128 })
})
