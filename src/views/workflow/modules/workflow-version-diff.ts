export type WorkflowVersionChangeKind = 'added' | 'removed' | 'changed'

export interface WorkflowVersionChange {
  key: string
  kind: WorkflowVersionChangeKind
  title: string
  description: string
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function nodeLabel(node: Api.Workflow.WorkflowNode): string {
  return node.name || node.key
}

export function diffWorkflowConfigs(
  from: Api.Workflow.WorkflowConfig | undefined,
  to: Api.Workflow.WorkflowConfig
): WorkflowVersionChange[] {
  if (!from) {
    return to.nodes.map((node) => ({
      key: `added:${node.key}`,
      kind: 'added',
      title: `新增节点“${nodeLabel(node)}”`,
      description: `位于第 ${node.order} 步，审批方式为 ${node.approvalMode}`
    }))
  }

  const changes: WorkflowVersionChange[] = []
  const fromNodes = new Map(from.nodes.map((node) => [node.key, node]))
  const toNodes = new Map(to.nodes.map((node) => [node.key, node]))

  for (const node of to.nodes) {
    const previous = fromNodes.get(node.key)
    if (!previous) {
      changes.push({
        key: `added:${node.key}`,
        kind: 'added',
        title: `新增节点“${nodeLabel(node)}”`,
        description: `位于第 ${node.order} 步，审批方式为 ${node.approvalMode}`
      })
      continue
    }

    const details: string[] = []
    if (previous.name !== node.name) details.push(`名称：${previous.name} → ${node.name}`)
    if (previous.order !== node.order) details.push(`顺序：${previous.order} → ${node.order}`)
    if (!same(previous.assignee, node.assignee)) details.push('审批人范围已调整')
    if (!same(previous.condition, node.condition)) details.push('流转条件已调整')
    if (
      previous.approvalMode !== node.approvalMode ||
      previous.approvalThresholdPercent !== node.approvalThresholdPercent ||
      previous.rejectVetoEnabled !== node.rejectVetoEnabled
    ) {
      details.push('会签/否决规则已调整')
    }
    if (previous.allowSelfApproval !== node.allowSelfApproval) details.push('自审策略已调整')
    if (
      previous.dueHours !== node.dueHours ||
      previous.reminderBeforeMinutes !== node.reminderBeforeMinutes ||
      previous.escalationEnabled !== node.escalationEnabled ||
      previous.escalateAfterHours !== node.escalateAfterHours
    ) {
      details.push('时限、提醒或升级策略已调整')
    }
    if (details.length) {
      changes.push({
        key: `changed:${node.key}`,
        kind: 'changed',
        title: `调整节点“${nodeLabel(node)}”`,
        description: details.join('；')
      })
    }
  }

  for (const node of from.nodes) {
    if (!toNodes.has(node.key)) {
      changes.push({
        key: `removed:${node.key}`,
        kind: 'removed',
        title: `移除节点“${nodeLabel(node)}”`,
        description: `原位于第 ${node.order} 步`
      })
    }
  }

  if (Boolean(from.allowAutoApprove) !== Boolean(to.allowAutoApprove)) {
    changes.push({
      key: 'changed:allowAutoApprove',
      kind: 'changed',
      title: '全条件未命中策略已调整',
      description: to.allowAutoApprove ? '改为允许自动通过' : '改为安全阻断'
    })
  }

  return changes
}
