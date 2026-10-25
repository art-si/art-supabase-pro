import type {
  ArtProcessTimelineItem,
  ArtProcessTimelineTone
} from '@/components/core/layouts/art-process-timeline/types'

export interface WorkflowHistorySummary {
  total: number
  running: number
  approved: number
  rejected: number
  interrupted: number
}

export function createWorkflowActionTimelineItems(
  actions: Api.Workflow.WorkflowActionRecord[] = []
): ArtProcessTimelineItem[] {
  return [...actions]
    .sort((a, b) => b.createTime.localeCompare(a.createTime))
    .map((action) => ({
      id: action.id,
      actorName:
        action.actor?.nickName ||
        action.actor?.userName ||
        action.actor?.userEmail ||
        action.actorNameSnapshot,
      actorAvatar: action.actor?.avatar,
      actionValue: action.action,
      title:
        action.metadata?.operatorType === 'platform_super_override'
          ? `${action.nodeName || '流程'} · 平台超管代审批`
          : action.nodeName || '流程',
      description: getWorkflowActionDescription(action),
      time: action.createTime,
      tone: getWorkflowActionTone(action.action),
      system: !action.actorUserId
    }))
}

export function summarizeWorkflowHistory(
  instances: Api.Workflow.WorkflowInstanceRecord[]
): WorkflowHistorySummary {
  return instances.reduce<WorkflowHistorySummary>(
    (summary, instance) => {
      summary.total += 1
      if (instance.status === 'running') summary.running += 1
      else if (instance.status === 'approved') summary.approved += 1
      else if (instance.status === 'rejected') summary.rejected += 1
      else summary.interrupted += 1
      return summary
    },
    { total: 0, running: 0, approved: 0, rejected: 0, interrupted: 0 }
  )
}

function getWorkflowActionDescription(action: Api.Workflow.WorkflowActionRecord): string | null {
  if (action.metadata?.operatorType !== 'platform_super_override') return action.comment ?? null

  const originalAssignee = String(action.metadata.originalAssigneeName || '原审批人')
  return [`平台超管代审批 · 原审批人：${originalAssignee}`, action.comment]
    .filter(Boolean)
    .join('；')
}

function getWorkflowActionTone(action: Api.Workflow.ActionType): ArtProcessTimelineTone {
  if (action === 'approve') return 'success'
  if (action === 'reject' || action === 'cancel') return 'danger'
  if (action === 'withdraw') return 'warning'
  return 'primary'
}
