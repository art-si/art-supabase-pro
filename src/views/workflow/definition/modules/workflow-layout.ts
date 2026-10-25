import { clamp, round } from 'lodash-es'

export const WORKFLOW_START_NODE_KEY = 'workflow-start'
export const WORKFLOW_END_NODE_KEY = 'workflow-end'

const MAX_COORDINATE = 100_000
const HORIZONTAL_APPROVAL_GAP = 306
const VERTICAL_APPROVAL_GAP = 210

function normalizeCoordinate(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return clamp(round(numberValue), -MAX_COORDINATE, MAX_COORDINATE)
}

export function createWorkflowCanvasLayout(
  nodes: Api.Workflow.WorkflowNode[],
  mode: 'horizontal' | 'vertical' = 'horizontal'
): Api.Workflow.WorkflowCanvasLayout {
  const positions: Record<string, Api.Workflow.WorkflowCanvasPosition> = {}

  if (mode === 'vertical') {
    positions[WORKFLOW_START_NODE_KEY] = { x: 350, y: 40 }
    nodes.forEach((node, index) => {
      positions[node.key] = { x: 308, y: 188 + index * VERTICAL_APPROVAL_GAP }
    })
    positions[WORKFLOW_END_NODE_KEY] = {
      x: 350,
      y: 188 + nodes.length * VERTICAL_APPROVAL_GAP + 26
    }
  } else {
    positions[WORKFLOW_START_NODE_KEY] = { x: 36, y: 154 }
    nodes.forEach((node, index) => {
      positions[node.key] = { x: 212 + index * HORIZONTAL_APPROVAL_GAP, y: 128 }
    })
    positions[WORKFLOW_END_NODE_KEY] = {
      x: 212 + nodes.length * HORIZONTAL_APPROVAL_GAP,
      y: 154
    }
  }

  return { mode, positions }
}

export function normalizeWorkflowCanvasLayout(
  layout: Api.Workflow.WorkflowCanvasLayout | undefined,
  nodes: Api.Workflow.WorkflowNode[]
): Api.Workflow.WorkflowCanvasLayout {
  const fallbackMode = layout?.mode === 'vertical' ? 'vertical' : 'horizontal'
  const fallback = createWorkflowCanvasLayout(nodes, fallbackMode)
  const positions: Record<string, Api.Workflow.WorkflowCanvasPosition> = {}
  const keys = [WORKFLOW_START_NODE_KEY, ...nodes.map((node) => node.key), WORKFLOW_END_NODE_KEY]

  keys.forEach((key) => {
    const fallbackPosition = fallback.positions[key]
    const currentPosition = layout?.positions?.[key]
    if (!fallbackPosition) return
    positions[key] = {
      x: normalizeCoordinate(currentPosition?.x, fallbackPosition.x),
      y: normalizeCoordinate(currentPosition?.y, fallbackPosition.y)
    }
  })

  return {
    mode: layout?.mode === 'free' || layout?.mode === 'vertical' ? layout.mode : 'horizontal',
    positions
  }
}

export function updateWorkflowCanvasPosition(
  layout: Api.Workflow.WorkflowCanvasLayout | undefined,
  nodes: Api.Workflow.WorkflowNode[],
  nodeKey: string,
  position: Api.Workflow.WorkflowCanvasPosition
): Api.Workflow.WorkflowCanvasLayout {
  const normalized = normalizeWorkflowCanvasLayout(layout, nodes)
  return {
    mode: 'free',
    positions: {
      ...normalized.positions,
      [nodeKey]: {
        x: normalizeCoordinate(position.x, normalized.positions[nodeKey]?.x ?? 0),
        y: normalizeCoordinate(position.y, normalized.positions[nodeKey]?.y ?? 0)
      }
    }
  }
}
